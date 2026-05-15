import crypto from 'crypto';
import express, { Request, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import validatePassword from '../middleware/validatePassword';
import { getUserProfileById } from '../services/userProfile';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { hashPassword, signAuthToken } from '../lib/auth';
import { uploadVerificationProofToStorage } from '../lib/objectStorage';
import { invalidateUserCache } from '../lib/userCache';
import { sendMagicLinkEmail } from '../lib/authEmail';
import {
  cacheDelete,
  cacheGetJson,
  cacheHashGet,
  cacheHashIncrementBy,
  cacheSetJson,
} from '../lib/cache';

const router = express.Router();
const alumniProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024,
  },
});

type UserType = 'student' | 'alumni';
type UserVerificationState =
  | 'student_google_verified'
  | 'alumni_pending_review'
  | 'alumni_verified'
  | 'alumni_rejected';
type AuthProvider = 'google' | 'magic_link';

const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const MAGIC_LINK_EXCHANGE_TTL_SECONDS = 2 * 60;
const MAGIC_LINK_EMAIL_WINDOW_SECONDS = 15 * 60;
const MAGIC_LINK_IP_WINDOW_SECONDS = 15 * 60;
const MAGIC_LINK_EMAIL_LIMIT = 3;
const MAGIC_LINK_IP_LIMIT = 10;
const MAGIC_LINK_RESEND_COOLDOWN_SECONDS = 60;
const MAGIC_LINK_INVALID_ATTEMPT_LIMIT = 8;

interface UserSessionRow {
  session_id: string;
  user_id: string;
  user_agent: string | null;
  browser_name: string | null;
  platform: string | null;
  device_name: string | null;
  location_label: string | null;
  ip_address: string | null;
  created_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
}

interface AlumniSignupBody {
  name: string;
  email: string;
  graduationYear: string | number;
  branch: string;
  currentStatus: string;
  password: string;
}

interface StudentGoogleAuthBody {
  idToken: string;
}

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string;
  hd?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

interface AuthOnboardingSessionRow {
  auth_onboarding_session_id: string;
  provider: AuthProvider;
  email: string;
  google_subject: string | null;
  full_name: string;
  profile_photo_url: string | null;
  suggested_username: string | null;
  payload: Record<string, unknown> | null;
  expires_at: Date;
  completed_at: Date | null;
}

interface MagicLinkSendBody {
  email: string;
}

interface MagicLinkExchangeBody {
  exchangeCode: string;
}

interface MagicLinkOnboardingBody {
  sessionId: string;
  username?: string;
  branch?: string;
  year?: string | number;
  accountType?: 'student';
}

interface GoogleOnboardingBody {
  sessionId: string;
  username?: string;
  branch?: string;
  year?: string | number;
  accountType?: 'student';
}

interface MagicLinkRedisPayload {
  email: string;
  existingUserId?: string;
  onboardingSessionId?: string;
}

interface MagicLinkExchangePayload {
  type: 'login' | 'onboarding';
  userId?: string;
  onboardingSessionId?: string;
}

function getGoogleClientId(): string {
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim()
    || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    || process.env.VITE_GOOGLE_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error('Google sign-in is not configured on the server');
  }

  return clientId;
}

function getAllowedStudentDomain(): string {
  return (process.env.AUTH_ALLOWED_EMAIL_DOMAIN?.trim() || 'gbpuat.ac.in').toLowerCase();
}

function getClientBaseUrl(): string {
  return (
    process.env.AUTH_CLIENT_URL?.trim()
    || process.env.FRONTEND_URL?.trim()
    || process.env.APP_BASE_URL?.trim()
    || 'http://localhost:5173'
  ).replace(/\/+$/, '');
}

function getServerBaseUrl(req: Request): string {
  const configuredBaseUrl = process.env.API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = req.get('host');

  if (host) {
    return `${protocol}://${host}`.replace(/\/+$/, '');
  }

  return 'http://localhost:4000';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 50);
}

function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 150);
}

function parseRequiredNumericValue(raw: string | number | undefined, label: string): number {
  const numericValue = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (!numericValue || Number.isNaN(numericValue)) {
    throw new Error(`${label} is required`);
  }
  return numericValue;
}

function isAllowedStudentEmail(email: string, hostedDomain?: string): boolean {
  const allowedDomain = getAllowedStudentDomain();
  return email.endsWith(`@${allowedDomain}`) && (!hostedDomain || hostedDomain === allowedDomain);
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]?.trim() || null;
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }

  return req.ip || null;
}

function getSingleHeaderValue(req: Request, headerName: string): string | null {
  const value = req.header(headerName);
  if (!value) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function inferLocationLabel(req: Request, ipAddress: string | null): string {
  const city =
    getSingleHeaderValue(req, 'x-vercel-ip-city')
    || getSingleHeaderValue(req, 'x-appengine-city');
  const region =
    getSingleHeaderValue(req, 'x-vercel-ip-country-region')
    || getSingleHeaderValue(req, 'x-appengine-region');
  const country =
    getSingleHeaderValue(req, 'x-vercel-ip-country')
    || getSingleHeaderValue(req, 'cf-ipcountry')
    || getSingleHeaderValue(req, 'x-appengine-country');

  const parts = [city, region, country].filter((part): part is string => !!part);
  if (parts.length > 0) {
    return parts.join(', ');
  }

  return ipAddress ? `IP ${ipAddress}` : 'Unknown location';
}

function detectBrowser(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser';
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return 'Opera';
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent) && !/opr\//i.test(userAgent)) return 'Chrome';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return 'Safari';
  return 'Unknown browser';
}

function detectPlatform(userAgent: string | null): string {
  if (!userAgent) return 'Unknown platform';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ios/i.test(userAgent)) return 'iOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown platform';
}

function describeDevice(platform: string): string {
  if (platform === 'Android' || platform === 'iOS') return 'Mobile device';
  if (platform === 'Windows' || platform === 'macOS' || platform === 'Linux') return 'Desktop';
  return 'Unknown device';
}

function buildOnboardingResponse(session: AuthOnboardingSessionRow) {
  return {
    onboardingRequired: true as const,
    sessionId: session.auth_onboarding_session_id,
    provider: session.provider,
    email: session.email,
    fullName: session.full_name,
    profilePhotoUrl: session.profile_photo_url,
    suggestedUsername: session.suggested_username,
    accountType: 'student' as const,
    missingFields: ['branch', 'year', 'accountType', 'username'],
  };
}

function buildMagicLinkRedirect(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${getClientBaseUrl()}/?${query.toString()}`;
}

function magicLinkTokenKey(token: string): string {
  return `magiclink:${token}`;
}

function magicLinkExchangeKey(code: string): string {
  return `magiclink:exchange:${code}`;
}

function magicLinkEmailWindowKey(email: string): string {
  return `auth:magiclink:email-window:${email}`;
}

function magicLinkIpWindowKey(ipAddress: string): string {
  return `auth:magiclink:ip-window:${ipAddress}`;
}

function magicLinkCooldownKey(email: string): string {
  return `auth:magiclink:cooldown:${email}`;
}

function magicLinkInvalidAttemptKey(ipAddress: string): string {
  return `auth:magiclink:invalid:${ipAddress}`;
}

async function getCounterValue(key: string): Promise<number> {
  const value = await cacheHashGet(key, 'count');
  const numeric = value ? Number(value) : 0;
  return Number.isFinite(numeric) ? numeric : 0;
}

async function incrementCounter(key: string, ttlSeconds: number): Promise<number> {
  const next = await cacheHashIncrementBy(key, 'count', 1, ttlSeconds);
  return typeof next === 'number' ? next : 0;
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
  const clientId = getGoogleClientId();
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);

  if (!response.ok) {
    throw new Error('Unable to verify Google sign-in token');
  }

  const payload = (await response.json()) as GoogleTokenInfo;

  if (payload.aud !== clientId) {
    throw new Error('Google token audience mismatch');
  }

  if (payload.email_verified !== 'true') {
    throw new Error('Google account email is not verified');
  }

  return payload;
}

async function emailExists(email: string): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM "users" WHERE email = ${email}) AS "exists"
  `;

  return result[0]?.exists ?? false;
}

async function generateUniqueUsername(baseValue: string): Promise<string> {
  const sanitizedBase = normalizeDisplayName(baseValue) || 'CampusLynk User';
  let candidate = sanitizedBase;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM "users" WHERE username = ${candidate}) AS "exists"
    `;

    if (!existing[0]?.exists) {
      return candidate;
    }

    candidate = `${sanitizedBase} ${suffix}`.slice(0, 50);
    suffix += 1;
  }
}

async function createAuthSession(userId: string, req: Request): Promise<UserSessionRow> {
  const sessionId = crypto.randomUUID();
  const userAgent = req.get('user-agent') ?? null;
  const browserName = detectBrowser(userAgent);
  const platform = detectPlatform(userAgent);
  const deviceName = describeDevice(platform);
  const ipAddress = getClientIp(req);
  const locationLabel = inferLocationLabel(req, ipAddress);

  const rows = await prisma.$queryRaw<UserSessionRow[]>`
    INSERT INTO user_sessions (
      session_id,
      user_id,
      user_agent,
      browser_name,
      platform,
      device_name,
      location_label,
      ip_address,
      last_seen_at
    )
    VALUES (
      ${sessionId},
      ${userId},
      ${userAgent},
      ${browserName},
      ${platform},
      ${deviceName},
      ${locationLabel},
      ${ipAddress},
      NOW()
    )
    RETURNING
      session_id,
      user_id,
      user_agent,
      browser_name,
      platform,
      device_name,
      location_label,
      ip_address,
      created_at,
      last_seen_at,
      revoked_at
  `;

  await prisma.$queryRaw`
    UPDATE users
    SET last_login_at = NOW(), updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  return rows[0];
}

function sessionToResponse(row: UserSessionRow, currentSessionId?: string) {
  return {
    sessionId: row.session_id,
    deviceName: row.device_name ?? 'Unknown device',
    browserName: row.browser_name ?? 'Unknown browser',
    platform: row.platform ?? 'Unknown platform',
    locationLabel: row.location_label ?? (row.ip_address ? `IP ${row.ip_address}` : 'Unknown location'),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    isCurrent: currentSessionId ? row.session_id === currentSessionId : false,
  };
}

async function createDefaultUserSettings(userId: string): Promise<void> {
  await prisma.$queryRaw`
    INSERT INTO user_settings (
      user_id,
      email_notifications,
      follow_request_notifications,
      message_notifications,
      opportunity_alerts,
      club_update_notifications,
      weekly_digest_enabled,
      show_email,
      show_projects,
      allow_messages
    )
    VALUES (
      ${userId},
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      FALSE,
      TRUE,
      TRUE,
      TRUE
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      email_notifications = EXCLUDED.email_notifications,
      follow_request_notifications = EXCLUDED.follow_request_notifications,
      message_notifications = EXCLUDED.message_notifications,
      opportunity_alerts = EXCLUDED.opportunity_alerts,
      club_update_notifications = EXCLUDED.club_update_notifications,
      weekly_digest_enabled = EXCLUDED.weekly_digest_enabled,
      show_email = EXCLUDED.show_email,
      show_projects = EXCLUDED.show_projects,
      allow_messages = EXCLUDED.allow_messages
  `;
}

async function buildAuthenticatedResponse(userId: string, req: Request, fallback?: {
  username: string;
  email: string;
  type: UserType;
  createdAt: Date;
  verificationState?: UserVerificationState | null;
  authProvider?: AuthProvider;
  details?: {
    branch?: string;
    year?: number;
    passingYear?: number;
  };
}): Promise<Record<string, unknown>> {
  const session = await createAuthSession(userId, req);
  const profile = await getUserProfileById(userId);

  if (profile) {
    return {
      ...profile,
      token: signAuthToken({
        userId: profile.userId,
        email: profile.email,
        username: profile.username,
        type: profile.type,
        sessionId: session.session_id,
      }),
    };
  }

  if (!fallback) {
    throw new Error('Unable to build authenticated user profile');
  }

  return {
    userId,
    username: fallback.username,
    email: fallback.email,
    type: fallback.type,
    authProvider: fallback.authProvider ?? 'magic_link',
    verificationState: fallback.verificationState ?? null,
    onboardingCompletedAt: new Date().toISOString(),
    createdAt: fallback.createdAt.toISOString(),
    bio: null,
    headline: null,
    profilePictureUrl: null,
    coverPhotoUrl: null,
    isPublic: true,
    isActive: true,
    isOnline: false,
    lastSeenAt: null,
    details: fallback.details ?? {},
    stats: {
      followerCount: 0,
      followingCount: 0,
      postCount: 0,
    },
    token: signAuthToken({
      userId,
      email: fallback.email,
      username: fallback.username,
      type: fallback.type,
      sessionId: session.session_id,
    }),
  };
}

async function createStudentUser(params: {
  username: string;
  email: string;
  branch: string;
  year: number;
  authProvider: AuthProvider;
  googleSubject?: string | null;
  profilePhotoUrl?: string | null;
  verificationState?: UserVerificationState | null;
}): Promise<{ userId: string; createdAt: Date }> {
  const createdUsers = await prisma.$queryRaw<Array<{ user_id: string; created_at: Date }>>`
    INSERT INTO users (
      username,
      email,
      password_hash,
      user_type,
      auth_provider,
      google_subject,
      profile_photo_url,
      is_private,
      onboarding_completed_at,
      verified_at,
      verification_state,
      updated_at
    )
    VALUES (
      ${params.username},
      ${params.email},
      ${hashPassword(crypto.randomUUID())},
      'student'::"UserType",
      CAST(${params.authProvider} AS "AuthProvider"),
      ${params.googleSubject ?? null},
      ${params.profilePhotoUrl ?? null},
      FALSE,
      NOW(),
      NOW(),
      CAST(${params.verificationState ?? null} AS "UserVerificationState"),
      NOW()
    )
    RETURNING user_id, created_at
  `;

  const user = createdUsers[0];

  await prisma.$queryRaw`
    INSERT INTO student_profiles (user_id, branch, year)
    VALUES (${user.user_id}, ${params.branch}, ${params.year})
  `;

  await createDefaultUserSettings(user.user_id);
  await invalidateUserCache(user.user_id);

  return {
    userId: user.user_id,
    createdAt: user.created_at,
  };
}

async function createOnboardingSession(params: {
  provider: AuthProvider;
  email: string;
  googleSubject?: string | null;
  fullName: string;
  profilePhotoUrl?: string | null;
  suggestedUsername?: string | null;
}): Promise<AuthOnboardingSessionRow> {
  const rows = await prisma.$queryRaw<AuthOnboardingSessionRow[]>`
    INSERT INTO auth_onboarding_sessions (
      provider,
      email,
      google_subject,
      full_name,
      profile_photo_url,
      suggested_username,
      payload,
      expires_at
    )
    VALUES (
      CAST(${params.provider} AS "AuthProvider"),
      ${params.email},
      ${params.googleSubject ?? null},
      ${params.fullName},
      ${params.profilePhotoUrl ?? null},
      ${params.suggestedUsername ?? null},
      '{}'::jsonb,
      NOW() + INTERVAL '1 day'
    )
    ON CONFLICT (google_subject)
    DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      profile_photo_url = EXCLUDED.profile_photo_url,
      suggested_username = EXCLUDED.suggested_username,
      payload = EXCLUDED.payload,
      expires_at = NOW() + INTERVAL '1 day',
      completed_at = NULL,
      updated_at = NOW()
    RETURNING
      auth_onboarding_session_id,
      provider::text AS provider,
      email,
      google_subject,
      full_name,
      profile_photo_url,
      suggested_username,
      payload,
      expires_at,
      completed_at
  `;

  return rows[0];
}

async function loadOnboardingSession(sessionId: string): Promise<AuthOnboardingSessionRow | null> {
  const rows = await prisma.$queryRaw<AuthOnboardingSessionRow[]>`
    SELECT
      auth_onboarding_session_id,
      provider::text AS provider,
      email,
      google_subject,
      full_name,
      profile_photo_url,
      suggested_username,
      payload,
      expires_at,
      completed_at
    FROM auth_onboarding_sessions
    WHERE auth_onboarding_session_id = ${sessionId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function assertAllowedAlumniProofFiles(files: Express.Multer.File[]): Promise<void> {
  const allowedMimeTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]);

  for (const file of files) {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      throw new Error('Only PDF, JPG, PNG, and WEBP files are allowed for alumni proof uploads');
    }
  }
}

async function sendMagicLink(params: {
  email: string;
  existingUserId?: string;
  onboardingSessionId?: string;
  req: Request;
}): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  await cacheSetJson(
    magicLinkTokenKey(token),
    {
      email: params.email,
      existingUserId: params.existingUserId,
      onboardingSessionId: params.onboardingSessionId,
    } satisfies MagicLinkRedisPayload,
    MAGIC_LINK_TTL_SECONDS,
  );

  const verifyUrl = `${getServerBaseUrl(params.req)}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMagicLinkEmail({
    email: params.email,
    magicLinkUrl: verifyUrl,
  });
}

router.post('/google', async (req: Request, res: Response) => {
  const { idToken } = req.body as Partial<StudentGoogleAuthBody>;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token is required' });
  }

  try {
    const tokenInfo = await verifyGoogleIdToken(idToken);
    const email = normalizeEmail(tokenInfo.email ?? '');
    const fullName = normalizePersonName(
      tokenInfo.name || `${tokenInfo.given_name ?? ''} ${tokenInfo.family_name ?? ''}`.trim() || email.split('@')[0]
    );
    const profilePhotoUrl = tokenInfo.picture?.trim() || null;
    const googleSubject = tokenInfo.sub?.trim();

    if (!email || !googleSubject || !isAllowedStudentEmail(email, tokenInfo.hd)) {
      return res.status(403).json({ message: `Students must sign in with an allowed ${getAllowedStudentDomain()} Google account` });
    }

    const existingUsers = await prisma.$queryRaw<Array<{
      user_id: string;
      username: string;
      email: string;
      user_type: UserType;
      auth_provider: AuthProvider;
      created_at: Date;
    }>>`
      SELECT
        user_id,
        username,
        email,
        user_type::text AS user_type,
        auth_provider::text AS auth_provider,
        created_at
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    const existingUser = existingUsers[0];

    if (existingUser) {
      if (existingUser.user_type !== 'student') {
        return res.status(409).json({ message: 'This email is already linked to a non-student account' });
      }

      await prisma.$queryRaw`
        UPDATE users
        SET
          google_subject = COALESCE(google_subject, ${googleSubject}),
          profile_photo_url = COALESCE(profile_photo_url, ${profilePhotoUrl}),
          verified_at = NOW(),
          updated_at = NOW()
        WHERE user_id = ${existingUser.user_id}
      `;

      await invalidateUserCache(existingUser.user_id);
      const responsePayload = await buildAuthenticatedResponse(existingUser.user_id, req, {
        username: existingUser.username,
        email,
        type: 'student',
        createdAt: existingUser.created_at,
        authProvider: existingUser.auth_provider,
      });

      return res.status(200).json(responsePayload);
    }

    const suggestedUsername = await generateUniqueUsername(fullName || email.split('@')[0]);
    const onboardingSession = await createOnboardingSession({
      provider: 'google',
      email,
      googleSubject,
      fullName,
      profilePhotoUrl,
      suggestedUsername,
    });

    return res.status(200).json(buildOnboardingResponse(onboardingSession));
  } catch (err: any) {
    console.error('Error during Google auth:', err);
    return res.status(500).json({ message: err?.message || 'Unable to sign in with Google' });
  }
});

router.post('/google/onboarding', async (req: Request, res: Response) => {
  const { sessionId, username, branch, year, accountType } = req.body as Partial<GoogleOnboardingBody>;

  if (!sessionId || !branch || !year) {
    return res.status(400).json({ message: 'Session, branch, and year are required to finish Google signup' });
  }

  if (accountType && accountType !== 'student') {
    return res.status(400).json({ message: 'Google onboarding currently supports student accounts only' });
  }

  try {
    const session = await loadOnboardingSession(sessionId);

    if (!session || session.completed_at || session.expires_at <= new Date()) {
      return res.status(400).json({ message: 'This Google signup session has expired. Please continue with Google again.' });
    }

    const email = normalizeEmail(session.email);
    if (await emailExists(email)) {
      return res.status(409).json({ message: 'An account with this email already exists. Continue with Google to sign in.' });
    }

    const numericYear = parseRequiredNumericValue(year, 'Year');
    const finalUsername = await generateUniqueUsername(username?.trim() || session.suggested_username || email.split('@')[0]);

    const created = await createStudentUser({
      username: finalUsername,
      email,
      branch: branch.trim(),
      year: numericYear,
      authProvider: 'google',
      googleSubject: session.google_subject,
      profilePhotoUrl: session.profile_photo_url,
      verificationState: 'student_google_verified',
    });

    await prisma.$queryRaw`
      UPDATE auth_onboarding_sessions
      SET completed_at = NOW(), updated_at = NOW()
      WHERE auth_onboarding_session_id = ${sessionId}
    `;

    const responsePayload = await buildAuthenticatedResponse(created.userId, req, {
      username: finalUsername,
      email,
      type: 'student',
      createdAt: created.createdAt,
      verificationState: 'student_google_verified',
      authProvider: 'google',
      details: {
        branch: branch.trim(),
        year: numericYear,
      },
    });

    return res.status(201).json(responsePayload);
  } catch (err: any) {
    console.error('Error completing Google onboarding:', err);
    return res.status(500).json({ message: err?.message || 'Unable to complete Google signup' });
  }
});

router.post('/magic-link/send', async (req: Request, res: Response) => {
  const { email } = req.body as Partial<MagicLinkSendBody>;
  const normalizedEmail = normalizeEmail(email ?? '');
  const ipAddress = getClientIp(req) || 'unknown';

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Enter a valid college email address.' });
  }

  if (!normalizedEmail.endsWith(`@${getAllowedStudentDomain()}`)) {
    return res.status(400).json({ message: `Use your college email (@${getAllowedStudentDomain()}).` });
  }

  try {
    const emailCount = await getCounterValue(magicLinkEmailWindowKey(normalizedEmail));
    if (emailCount >= MAGIC_LINK_EMAIL_LIMIT) {
      return res.status(429).json({ message: 'Too many links sent to this email. Try again in a little while.' });
    }

    const ipCount = await getCounterValue(magicLinkIpWindowKey(ipAddress));
    if (ipCount >= MAGIC_LINK_IP_LIMIT) {
      return res.status(429).json({ message: 'Too many requests from this network. Please wait and try again.' });
    }

    const cooldown = await cacheGetJson<{ sentAt: string }>(magicLinkCooldownKey(normalizedEmail));
    if (cooldown) {
      return res.status(429).json({ message: 'A fresh magic link was just sent. Please wait a moment before requesting another.' });
    }

    const existingUsers = await prisma.$queryRaw<Array<{
      user_id: string;
      user_type: UserType;
      created_at: Date;
    }>>`
      SELECT user_id, user_type::text AS user_type, created_at
      FROM users
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    const existingUser = existingUsers[0];
    if (existingUser && existingUser.user_type !== 'student') {
      return res.status(409).json({ message: 'This email is already linked to a non-student account.' });
    }

    let onboardingSessionId: string | undefined;
    if (!existingUser) {
      const suggestedUsername = await generateUniqueUsername(normalizedEmail.split('@')[0]);
      const session = await createOnboardingSession({
        provider: 'magic_link',
        email: normalizedEmail,
        fullName: normalizedEmail.split('@')[0],
        profilePhotoUrl: null,
        suggestedUsername,
      });
      onboardingSessionId = session.auth_onboarding_session_id;
    }

    await sendMagicLink({
      email: normalizedEmail,
      existingUserId: existingUser?.user_id,
      onboardingSessionId,
      req,
    });

    await Promise.all([
      incrementCounter(magicLinkEmailWindowKey(normalizedEmail), MAGIC_LINK_EMAIL_WINDOW_SECONDS),
      incrementCounter(magicLinkIpWindowKey(ipAddress), MAGIC_LINK_IP_WINDOW_SECONDS),
      cacheSetJson(magicLinkCooldownKey(normalizedEmail), { sentAt: new Date().toISOString() }, MAGIC_LINK_RESEND_COOLDOWN_SECONDS),
    ]);

    return res.status(200).json({
      message: 'Check your inbox for a secure magic link.',
    });
  } catch (err: any) {
    console.error('Error sending magic link:', err);
    return res.status(500).json({ message: err?.message || 'Unable to send magic link' });
  }
});

router.get('/verify', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const ipAddress = getClientIp(req) || 'unknown';

  if (!token) {
    return res.redirect(buildMagicLinkRedirect({ authStatus: 'invalid' }));
  }

  try {
    const invalidAttempts = await getCounterValue(magicLinkInvalidAttemptKey(ipAddress));
    if (invalidAttempts >= MAGIC_LINK_INVALID_ATTEMPT_LIMIT) {
      return res.redirect(buildMagicLinkRedirect({ authStatus: 'blocked' }));
    }

    const payload = await cacheGetJson<MagicLinkRedisPayload>(magicLinkTokenKey(token));
    if (!payload) {
      await incrementCounter(magicLinkInvalidAttemptKey(ipAddress), MAGIC_LINK_IP_WINDOW_SECONDS);
      return res.redirect(buildMagicLinkRedirect({ authStatus: 'expired' }));
    }

    await cacheDelete(magicLinkTokenKey(token));

    const exchangeCode = crypto.randomBytes(24).toString('hex');
    const exchangePayload: MagicLinkExchangePayload = payload.existingUserId
      ? { type: 'login', userId: payload.existingUserId }
      : { type: 'onboarding', onboardingSessionId: payload.onboardingSessionId };

    await cacheSetJson(magicLinkExchangeKey(exchangeCode), exchangePayload, MAGIC_LINK_EXCHANGE_TTL_SECONDS);
    return res.redirect(buildMagicLinkRedirect({ authExchange: exchangeCode, authStatus: 'verified' }));
  } catch (err) {
    console.error('Error verifying magic link:', err);
    return res.redirect(buildMagicLinkRedirect({ authStatus: 'error' }));
  }
});

router.post('/magic-link/exchange', async (req: Request, res: Response) => {
  const { exchangeCode } = req.body as Partial<MagicLinkExchangeBody>;

  if (!exchangeCode) {
    return res.status(400).json({ message: 'Exchange code is required.' });
  }

  try {
    const payload = await cacheGetJson<MagicLinkExchangePayload>(magicLinkExchangeKey(exchangeCode));
    if (!payload) {
      return res.status(400).json({ message: 'This login link has already been used or expired.' });
    }

    await cacheDelete(magicLinkExchangeKey(exchangeCode));

    if (payload.type === 'onboarding' && payload.onboardingSessionId) {
      const session = await loadOnboardingSession(payload.onboardingSessionId);
      if (!session || session.completed_at || session.expires_at <= new Date()) {
        return res.status(400).json({ message: 'This onboarding session has expired. Request a new magic link.' });
      }

      return res.status(200).json(buildOnboardingResponse(session));
    }

    if (!payload.userId) {
      return res.status(400).json({ message: 'This login link is no longer valid.' });
    }

    const responsePayload = await buildAuthenticatedResponse(payload.userId, req);
    return res.status(200).json(responsePayload);
  } catch (err: any) {
    console.error('Error exchanging magic link session:', err);
    return res.status(500).json({ message: err?.message || 'Unable to finish authentication' });
  }
});

router.post('/magic-link/onboarding', async (req: Request, res: Response) => {
  const { sessionId, username, branch, year, accountType } = req.body as Partial<MagicLinkOnboardingBody>;

  if (!sessionId || !branch || !year) {
    return res.status(400).json({ message: 'Branch and year are required to complete your account.' });
  }

  if (accountType && accountType !== 'student') {
    return res.status(400).json({ message: 'Magic link onboarding currently supports student accounts only.' });
  }

  try {
    const session = await loadOnboardingSession(sessionId);
    if (!session || session.completed_at || session.expires_at <= new Date()) {
      return res.status(400).json({ message: 'This onboarding session has expired. Request a new magic link.' });
    }

    const email = normalizeEmail(session.email);
    if (await emailExists(email)) {
      return res.status(409).json({ message: 'An account with this email already exists. Use a fresh magic link to sign in.' });
    }

    const numericYear = parseRequiredNumericValue(year, 'Year');
    const finalUsername = await generateUniqueUsername(username?.trim() || session.suggested_username || email.split('@')[0]);

    const created = await createStudentUser({
      username: finalUsername,
      email,
      branch: branch.trim(),
      year: numericYear,
      authProvider: 'magic_link',
      verificationState: null,
    });

    await prisma.$queryRaw`
      UPDATE auth_onboarding_sessions
      SET completed_at = NOW(), updated_at = NOW()
      WHERE auth_onboarding_session_id = ${sessionId}
    `;

    const responsePayload = await buildAuthenticatedResponse(created.userId, req, {
      username: finalUsername,
      email,
      type: 'student',
      createdAt: created.createdAt,
      authProvider: 'magic_link',
      details: {
        branch: branch.trim(),
        year: numericYear,
      },
    });

    return res.status(201).json(responsePayload);
  } catch (err: any) {
    console.error('Error completing magic link onboarding:', err);
    return res.status(500).json({ message: err?.message || 'Unable to complete your account' });
  }
});

router.post('/signup/alumni', alumniProofUpload.array('proofFiles', 5), validatePassword, async (req: Request, res: Response) => {
  const { name, email, graduationYear, branch, currentStatus, password } =
    req.body as Partial<AlumniSignupBody>;
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  if (!name || !email || !graduationYear || !branch || !currentStatus || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    await assertAllowedAlumniProofFiles(uploadedFiles);

    const exists = await emailExists(normalizeEmail(email));
    if (exists) {
      return res.status(409).json({ message: 'User already exists. Please sign in instead.' });
    }

    const username = await generateUniqueUsername(name);
    const passwordHash = hashPassword(password);
    const numericGradYear = parseRequiredNumericValue(graduationYear, 'Graduation year');

    const createdUsers = await prisma.$queryRaw<
      { user_id: string; username: string; email: string; created_at: Date }[]
    >`
      INSERT INTO users (
        username,
        email,
        password_hash,
        user_type,
        auth_provider,
        profile_photo_url,
        is_private,
        verification_state,
        onboarding_completed_at,
        updated_at
      )
      VALUES (
        ${username},
        ${normalizeEmail(email)},
        ${passwordHash},
        'alumni'::"UserType",
        'magic_link'::"AuthProvider",
        NULL,
        FALSE,
        'alumni_pending_review'::"UserVerificationState",
        NOW(),
        NOW()
      )
      RETURNING user_id, username, email, created_at
    `;

    const user = createdUsers[0];

    await prisma.$queryRaw`
      INSERT INTO alumni_profiles (user_id, branch, passing_year, current_status)
      VALUES (${user.user_id}, ${branch.trim()}, ${numericGradYear}, ${currentStatus.trim()})
    `;

    await createDefaultUserSettings(user.user_id);
    await invalidateUserCache(user.user_id);

    const documentUrls = await Promise.all(
      uploadedFiles.map((file) =>
        uploadVerificationProofToStorage({
          userId: user.user_id,
          fileBuffer: file.buffer,
          mimeType: file.mimetype,
        })
      )
    );

    const profilePreview = {
      name: name.trim(),
      email: normalizeEmail(email),
      branch: branch.trim(),
      passingYear: numericGradYear,
      currentStatus: currentStatus.trim(),
      submittedProofLabels: uploadedFiles.map((file) => file.originalname),
    };

    const verificationRequests = await prisma.$queryRaw<
      Array<{ verification_request_id: string; status: string; requested_at: Date }>
    >`
      INSERT INTO admin_verification_requests (
        request_type,
        target_user_id,
        document_urls,
        profile_preview,
        notes,
        status
      )
      VALUES (
        'alumni'::"VerificationRequestType",
        ${user.user_id},
        ${JSON.stringify(documentUrls)}::jsonb,
        ${JSON.stringify(profilePreview)}::jsonb,
        ${`Alumni verification submitted by ${name.trim()}`},
        'pending'::"VerificationRequestStatus"
      )
      RETURNING verification_request_id, status::text, requested_at
    `;

    const verificationRequest = verificationRequests[0];

    return res.status(201).json({
      pendingVerification: true,
      message: 'Your alumni verification request has been submitted and is pending admin approval.',
      request: {
        id: verificationRequest.verification_request_id,
        status: verificationRequest.status,
        requestedAt: verificationRequest.requested_at.toISOString(),
        verificationState: 'alumni_pending_review' as const,
      },
    });
  } catch (err: any) {
    console.error('Error during alumni signup:', err);
    return res.status(500).json({
      message: err?.message || 'Internal server error',
      error: {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        meta: err?.meta,
        stack: err?.stack,
      },
    });
  }
});

router.get('/sessions', authenticateToken, async (req: Request, res: Response) => {
  const authedRequest = req as AuthedRequest;
  const userId = authedRequest.auth?.userId;
  const currentSessionId = authedRequest.auth?.sessionId;

  if (!userId || !currentSessionId) {
    return res.status(401).json({ message: 'Missing authorization context' });
  }

  try {
    const rows = await prisma.$queryRaw<UserSessionRow[]>`
      SELECT
        session_id,
        user_id,
        user_agent,
        browser_name,
        platform,
        device_name,
        location_label,
        ip_address,
        created_at,
        last_seen_at,
        revoked_at
      FROM user_sessions
      WHERE user_id = ${userId}
        AND revoked_at IS NULL
      ORDER BY COALESCE(last_seen_at, created_at) DESC
    `;

    return res.status(200).json(rows.map((row) => sessionToResponse(row, currentSessionId)));
  } catch (err) {
    console.error('Error fetching sessions:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/sessions/:sessionId', authenticateToken, async (req: Request, res: Response) => {
  const authedRequest = req as AuthedRequest;
  const userId = authedRequest.auth?.userId;
  const { sessionId } = req.params as { sessionId: string };

  if (!userId) {
    return res.status(401).json({ message: 'Missing authorization context' });
  }

  try {
    const result = await prisma.$queryRaw<{ count: number }[]>`
      WITH revoked AS (
        UPDATE user_sessions
        SET revoked_at = NOW()
        WHERE session_id = ${sessionId}
          AND user_id = ${userId}
          AND revoked_at IS NULL
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM revoked
    `;

    const count = result[0]?.count ?? 0;
    if (count === 0) {
      return res.status(404).json({ message: 'Session not found' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('Error revoking session:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
