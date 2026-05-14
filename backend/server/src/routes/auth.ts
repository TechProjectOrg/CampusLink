import crypto from 'crypto';
import express, { Request, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import validatePassword from '../middleware/validatePassword';
import { getUserProfileById } from '../services/userProfile';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { hashPassword, signAuthToken, verifyPassword } from '../lib/auth';
import { uploadVerificationProofToStorage } from '../lib/objectStorage';
import { invalidateUserCache } from '../lib/userCache';
import { sendSignupOtpEmail } from '../lib/authEmail';

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
type AuthProvider = 'google' | 'local';

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

interface StudentGoogleAuthBody {
  idToken: string;
  intent?: 'login' | 'signup';
}

interface GoogleOnboardingBody {
  sessionId: string;
  fullName?: string;
  username?: string;
  branch?: string;
  year?: string | number;
  accountType?: 'student';
}

interface StudentSignupOtpRequestBody {
  name: string;
  email: string;
  password: string;
  branch: string;
  year: string | number;
}

interface StudentSignupOtpVerifyBody {
  verificationId: string;
  otp: string;
}

interface AlumniSignupBody {
  name: string;
  email: string;
  graduationYear: string | number;
  branch: string;
  currentStatus: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
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

interface AuthOtpChallengeRow {
  auth_otp_challenge_id: string;
  email: string;
  purpose: string;
  otp_hash: string;
  payload: StudentSignupOtpRequestBody;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
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

function getGoogleClientId(): string {
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim()
    || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error('Google sign-in is not configured on the server');
  }

  return clientId;
}

function getAllowedStudentDomain(): string {
  return (process.env.AUTH_ALLOWED_EMAIL_DOMAIN?.trim() || 'gbpuat.ac.in').toLowerCase();
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
    missingFields: ['branch', 'year', 'accountType'],
  };
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

function isAllowedStudentEmail(email: string, hostedDomain?: string): boolean {
  const allowedDomain = getAllowedStudentDomain();
  return email.endsWith(`@${allowedDomain}`) && hostedDomain === allowedDomain;
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

function parseRequiredNumericValue(raw: string | number | undefined, label: string): number {
  const numericValue = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (!numericValue || Number.isNaN(numericValue)) {
    throw new Error(`${label} is required`);
  }
  return numericValue;
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
    verificationState: fallback.verificationState ?? null,
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
  passwordHash?: string;
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
      ${params.passwordHash ?? hashPassword(crypto.randomUUID())},
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

function makeOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function upsertGoogleOnboardingSession(params: {
  email: string;
  googleSubject: string;
  fullName: string;
  profilePhotoUrl: string | null;
  suggestedUsername: string;
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
      'google'::"AuthProvider",
      ${params.email},
      ${params.googleSubject},
      ${params.fullName},
      ${params.profilePhotoUrl},
      ${params.suggestedUsername},
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

router.post('/google', async (req: Request, res: Response) => {
  const { idToken } = req.body as Partial<StudentGoogleAuthBody>;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token is required' });
  }

  try {
    const tokenInfo = await verifyGoogleIdToken(idToken);
    const email = normalizeEmail(tokenInfo.email ?? '');
    const fullName = normalizePersonName(tokenInfo.name || `${tokenInfo.given_name ?? ''} ${tokenInfo.family_name ?? ''}`.trim() || email.split('@')[0]);
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
      google_subject: string | null;
      created_at: Date;
    }>>`
      SELECT
        user_id,
        username,
        email,
        user_type::text AS user_type,
        auth_provider::text AS auth_provider,
        google_subject,
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
      });

      return res.status(200).json(responsePayload);
    }

    const suggestedUsername = await generateUniqueUsername(fullName || email.split('@')[0]);
    const onboardingSession = await upsertGoogleOnboardingSession({
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
  const { sessionId, fullName, username, branch, year, accountType } = req.body as Partial<GoogleOnboardingBody>;

  if (!sessionId || !branch || !year) {
    return res.status(400).json({ message: 'Session, branch, and year are required to finish Google signup' });
  }

  if (accountType && accountType !== 'student') {
    return res.status(400).json({ message: 'Google onboarding currently supports student accounts only' });
  }

  try {
    const sessions = await prisma.$queryRaw<AuthOnboardingSessionRow[]>`
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

    const session = sessions[0];

    if (!session || session.completed_at || session.expires_at <= new Date()) {
      return res.status(400).json({ message: 'This Google signup session has expired. Please continue with Google again.' });
    }

    const email = normalizeEmail(session.email);
    const exists = await emailExists(email);
    if (exists) {
      return res.status(409).json({ message: 'An account with this email already exists. Continue with Google to sign in.' });
    }

    const numericYear = parseRequiredNumericValue(year, 'Year');
    const finalName = normalizePersonName(fullName || session.full_name);
    const finalUsername = await generateUniqueUsername(username?.trim() || finalName || session.suggested_username || email.split('@')[0]);

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

router.post('/signup/student/request-otp', validatePassword, async (req: Request, res: Response) => {
  const { name, email, password, branch, year } = req.body as Partial<StudentSignupOtpRequestBody>;

  if (!name || !email || !password || !branch || !year) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const normalizedEmail = normalizeEmail(email);
  const allowedDomain = getAllowedStudentDomain();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid college email address' });
  }

  if (!normalizedEmail.endsWith(`@${allowedDomain}`)) {
    return res.status(400).json({ message: `Students must use a college email (@${allowedDomain})` });
  }

  try {
    const numericYear = parseRequiredNumericValue(year, 'Year');
    const verificationCode = makeOtpCode();
    const otpHash = hashOtp(verificationCode);

    const challengeRows = await prisma.$queryRaw<Array<{ auth_otp_challenge_id: string; expires_at: Date }>>`
      INSERT INTO auth_otp_challenges (
        email,
        purpose,
        otp_hash,
        payload,
        expires_at
      )
      VALUES (
        ${normalizedEmail},
        'student_signup',
        ${otpHash},
        ${JSON.stringify({
          name: normalizePersonName(name),
          email: normalizedEmail,
          password,
          branch: branch.trim(),
          year: numericYear,
        })}::jsonb,
        NOW() + INTERVAL '10 minutes'
      )
      RETURNING auth_otp_challenge_id, expires_at
    `;

    const challenge = challengeRows[0];

    await sendSignupOtpEmail({
      email: normalizedEmail,
      code: verificationCode,
      fullName: normalizePersonName(name),
    });

    return res.status(200).json({
      verificationId: challenge.auth_otp_challenge_id,
      expiresAt: challenge.expires_at.toISOString(),
      message: 'We sent a verification code to your college email.',
    });
  } catch (err: any) {
    console.error('Error requesting signup OTP:', err);
    return res.status(500).json({ message: err?.message || 'Unable to send verification code' });
  }
});

router.post('/signup/student/verify-otp', async (req: Request, res: Response) => {
  const { verificationId, otp } = req.body as Partial<StudentSignupOtpVerifyBody>;

  if (!verificationId || !otp) {
    return res.status(400).json({ message: 'Verification ID and OTP are required' });
  }

  try {
    const challengeRows = await prisma.$queryRaw<AuthOtpChallengeRow[]>`
      SELECT
        auth_otp_challenge_id,
        email,
        purpose,
        otp_hash,
        payload,
        attempts,
        expires_at,
        consumed_at
      FROM auth_otp_challenges
      WHERE auth_otp_challenge_id = ${verificationId}
      LIMIT 1
    `;

    const challenge = challengeRows[0];
    if (!challenge || challenge.purpose !== 'student_signup' || challenge.consumed_at || challenge.expires_at <= new Date()) {
      return res.status(400).json({ message: 'This verification code has expired. Please request a new one.' });
    }

    if (challenge.attempts >= 5) {
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new verification code.' });
    }

    if (challenge.otp_hash !== hashOtp(otp.trim())) {
      await prisma.$queryRaw`
        UPDATE auth_otp_challenges
        SET attempts = attempts + 1, updated_at = NOW()
        WHERE auth_otp_challenge_id = ${verificationId}
      `;
      return res.status(400).json({ message: 'Incorrect verification code' });
    }

    const normalizedEmail = normalizeEmail(challenge.email);
    if (await emailExists(normalizedEmail)) {
      return res.status(409).json({ message: 'An account with this email already exists. Please sign in instead.' });
    }

    const payload = challenge.payload;
    const finalUsername = await generateUniqueUsername(payload.name);
    const created = await createStudentUser({
      username: finalUsername,
      email: normalizedEmail,
      branch: payload.branch.trim(),
      year: parseRequiredNumericValue(payload.year, 'Year'),
      authProvider: 'local',
      passwordHash: hashPassword(payload.password),
      verificationState: null,
    });

    await prisma.$queryRaw`
      UPDATE auth_otp_challenges
      SET consumed_at = NOW(), updated_at = NOW()
      WHERE auth_otp_challenge_id = ${verificationId}
    `;

    const responsePayload = await buildAuthenticatedResponse(created.userId, req, {
      username: finalUsername,
      email: normalizedEmail,
      type: 'student',
      createdAt: created.createdAt,
      verificationState: null,
      details: {
        branch: payload.branch.trim(),
        year: parseRequiredNumericValue(payload.year, 'Year'),
      },
    });

    return res.status(201).json(responsePayload);
  } catch (err: any) {
    console.error('Error verifying signup OTP:', err);
    return res.status(500).json({ message: err?.message || 'Unable to verify the code' });
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
        'local'::"AuthProvider",
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

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as Partial<LoginBody>;

  if (!email || !password) {
    return res.status(400).json({ message: 'Missing email or password' });
  }

  try {
    const users = await prisma.$queryRaw<
      {
        user_id: string;
        username: string;
        email: string;
        password_hash: string;
        user_type: UserType;
        auth_provider: AuthProvider;
        verification_state: UserVerificationState | null;
        created_at: Date;
      }[]
    >`
      SELECT
        user_id,
        username,
        email,
        password_hash,
        user_type::text AS user_type,
        auth_provider::text AS auth_provider,
        verification_state::text,
        created_at
      FROM users
      WHERE email = ${normalizeEmail(email)}
      LIMIT 1
    `;

    const user = users[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.auth_provider === 'google') {
      return res.status(403).json({ message: 'This account uses Google sign-in. Continue with Google to access it.' });
    }

    const incomingHash = hashPassword(password);
    const passwordMatches = await verifyPassword(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.verification_state === 'alumni_pending_review') {
      const requestRows = await prisma.$queryRaw<Array<{ status: string }>>`
        SELECT status::text
        FROM admin_verification_requests
        WHERE target_user_id = ${user.user_id}
          AND request_type = 'alumni'::"VerificationRequestType"
        ORDER BY requested_at DESC
        LIMIT 1
      `;

      const latestStatus = requestRows[0]?.status ?? 'pending';
      if (latestStatus === 'more_info') {
        return res.status(403).json({ message: 'More verification information is required before your alumni account can be approved.' });
      }
      return res.status(403).json({ message: 'Your alumni verification is still under review. Access will unlock after approval.' });
    }

    if (user.verification_state === 'alumni_rejected') {
      return res.status(403).json({ message: 'Your alumni verification was rejected. Please contact support or resubmit proof.' });
    }

    if (!user.password_hash.startsWith('$2a$') && !user.password_hash.startsWith('$2b$') && !user.password_hash.startsWith('$2y$')) {
      await prisma.$queryRaw`
        UPDATE users
        SET password_hash = ${incomingHash}
        WHERE user_id = ${user.user_id}
      `;
    }

    const responsePayload = await buildAuthenticatedResponse(user.user_id, req, {
      username: user.username,
      email: user.email,
      type: user.user_type,
      createdAt: user.created_at,
      verificationState: user.verification_state,
    });

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
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
