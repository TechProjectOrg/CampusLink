import crypto from 'crypto';
import express, { Request, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import validatePassword from '../middleware/validatePassword';
import { getUserProfileById } from '../services/userProfile';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import {
  hashPassword,
  signAuthToken,
  signPasswordResetToken,
  verifyPassword,
  verifyPasswordResetToken,
  verifyVerificationActionToken,
} from '../lib/auth';
import { assertCanLogin, getModerationState } from '../lib/moderation';
import { uploadVerificationProofToStorage } from '../lib/objectStorage';
import { invalidateUserCache } from '../lib/userCache';
import { sendMagicLinkEmail, sendPasswordResetEmail } from '../lib/authEmail';
import { setAdminMustChangePassword } from '../lib/admin';
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
type SignupAccountType = UserType;
type UserVerificationState =
  | 'student_google_verified'
  | 'alumni_pending_review'
  | 'alumni_verified'
  | 'alumni_rejected';
type AuthProvider = 'google' | 'magic_link';
type GoogleIntent = 'login' | 'signup';

const MAGIC_LINK_TTL_SECONDS = 10 * 60;
const MAGIC_LINK_EXCHANGE_TTL_SECONDS = 2 * 60;
const MAGIC_LINK_EMAIL_WINDOW_SECONDS = 15 * 60;
const MAGIC_LINK_IP_WINDOW_SECONDS = 15 * 60;
const MAGIC_LINK_EMAIL_LIMIT = 3;
const MAGIC_LINK_IP_LIMIT = 10;
const MAGIC_LINK_RESEND_COOLDOWN_SECONDS = 60;
const MAGIC_LINK_INVALID_ATTEMPT_LIMIT = 8;
const PASSWORD_RESET_TTL_SECONDS = 10 * 60;
const PASSWORD_RESET_EXCHANGE_TTL_SECONDS = 2 * 60;
const PASSWORD_RESET_EMAIL_WINDOW_SECONDS = 15 * 60;
const PASSWORD_RESET_IP_WINDOW_SECONDS = 15 * 60;
const PASSWORD_RESET_EMAIL_LIMIT = 3;
const PASSWORD_RESET_IP_LIMIT = 10;
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;
const PASSWORD_RESET_INVALID_ATTEMPT_LIMIT = 8;

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

interface ExistingUserRow {
  user_id: string;
  display_name: string;
  username: string;
  email: string;
  password_hash: string;
  user_type: UserType;
  auth_provider: AuthProvider;
  google_subject: string | null;
  verification_state: UserVerificationState | null;
  is_banned: boolean;
  created_at: Date;
}

interface StudentLoginBody {
  email: string;
  password: string;
}

interface GoogleAuthBody {
  idToken: string;
  intent?: GoogleIntent;
  accountType?: SignupAccountType;
}

interface SignupVerifyEmailBody {
  email: string;
  accountType?: SignupAccountType;
}

interface SignupExchangeBody {
  exchangeCode: string;
}

interface PasswordResetRequestBody {
  identifier: string;
}

interface PasswordResetExchangeBody {
  exchangeCode: string;
}

interface PasswordResetCompleteBody {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

interface StudentSignupBody {
  sessionId: string;
  displayName: string;
  username: string;
  password: string;
  branch: string;
  year: string | number;
}

interface AlumniSignupBody {
  sessionId: string;
  displayName: string;
  username: string;
  email?: string;
  graduationYear: string | number;
  branch: string;
  currentStatus: string;
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

interface SignupSessionPayload {
  accountType: SignupAccountType;
}

interface MagicLinkRedisPayload {
  onboardingSessionId: string;
  exchangeCode?: string;
}

interface MagicLinkExchangePayload {
  onboardingSessionId: string;
  token: string;
}

interface PasswordResetRequestRow {
  user_id: string;
  email: string;
  username: string;
}

interface PasswordResetRedisPayload {
  userId: string;
  email: string;
  exchangeCode?: string;
}

interface PasswordResetExchangePayload {
  token: string;
  userId: string;
  email: string;
}

interface AlumniResubmissionContextRow {
  user_id: string;
  display_name: string;
  username: string;
  email: string;
  branch: string | null;
  passing_year: number | null;
  current_status: string | null;
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
  return name.trim().replace(/\s+/g, ' ').slice(0, 100);
}

function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 150);
}

function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 50);
}

function validateUsername(username: string): string | null {
  if (!username) return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters long';
  if (username.length > 50) return 'Username must be 50 characters or fewer';
  if (!/^[a-z0-9._]+$/.test(username)) {
    return 'Username can only include lowercase letters, numbers, dots, and underscores';
  }
  return null;
}

function buildUsernameSuggestion(baseValue: string): string {
  const normalized = normalizeUsername(baseValue);
  if (normalized.length >= 3) return normalized;
  return `user_${crypto.randomBytes(3).toString('hex')}`;
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
  return email.endsWith(`@${allowedDomain}`) && (!hostedDomain || hostedDomain.toLowerCase() === allowedDomain);
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

function buildClientRedirect(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${getClientBaseUrl()}${path}?${query.toString()}`;
}

function buildMagicLinkRedirect(params: Record<string, string>): string {
  return buildClientRedirect('/', params);
}

function buildPasswordResetRedirect(params: Record<string, string>): string {
  return buildClientRedirect('/reset-password', params);
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

function passwordResetTokenKey(token: string): string {
  return `password-reset:${token}`;
}

function passwordResetExchangeKey(code: string): string {
  return `password-reset:exchange:${code}`;
}

function passwordResetEmailWindowKey(email: string): string {
  return `auth:password-reset:email-window:${email}`;
}

function passwordResetIpWindowKey(ipAddress: string): string {
  return `auth:password-reset:ip-window:${ipAddress}`;
}

function passwordResetCooldownKey(email: string): string {
  return `auth:password-reset:cooldown:${email}`;
}

function passwordResetInvalidAttemptKey(ipAddress: string): string {
  return `auth:password-reset:invalid:${ipAddress}`;
}

function passwordResetActiveTokenKey(userId: string): string {
  return `auth:password-reset:active-token:${userId}`;
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

async function findUserByEmail(email: string): Promise<ExistingUserRow | null> {
  const rows = await prisma.$queryRaw<ExistingUserRow[]>`
    SELECT
      user_id,
      display_name,
      username,
      email,
      password_hash,
      user_type::text AS user_type,
      auth_provider::text AS auth_provider,
      google_subject,
      verification_state::text AS verification_state,
      is_banned,
      created_at
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function findUserForPasswordResetByIdentifier(identifier: string): Promise<PasswordResetRequestRow | null> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) {
    return null;
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier);
  const rows = isEmail
    ? await prisma.$queryRaw<PasswordResetRequestRow[]>`
        SELECT user_id, email, username
        FROM users
        WHERE email = ${normalizeEmail(normalizedIdentifier)}
        LIMIT 1
      `
    : await prisma.$queryRaw<PasswordResetRequestRow[]>`
        SELECT user_id, email, username
        FROM users
        WHERE username = ${normalizeUsername(normalizedIdentifier)}
        LIMIT 1
      `;

  return rows[0] ?? null;
}

async function userHasAdminAccount(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1
      FROM admin_accounts
      WHERE user_id = ${userId}
    ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
}

async function usernameExists(username: string): Promise<boolean> {
  const existing = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM "users" WHERE username = ${username}) AS "exists"
  `;

  return existing[0]?.exists ?? false;
}

async function generateUniqueUsername(baseValue: string): Promise<string> {
  const sanitizedBase = buildUsernameSuggestion(baseValue);
  let candidate = sanitizedBase;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!(await usernameExists(candidate))) {
      return candidate;
    }

    candidate = `${sanitizedBase}_${suffix}`.slice(0, 50);
    suffix += 1;
  }
}

function maskEmailAddress(email: string): string {
  const [localPart, domainPart] = email.split('@');
  if (!localPart || !domainPart) {
    return email;
  }

  const [domainName, ...domainRest] = domainPart.split('.');
  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? '*'}*`
      : `${localPart[0]}${'*'.repeat(Math.max(1, localPart.length - 2))}${localPart[localPart.length - 1]}`;
  const maskedDomainName =
    !domainName
      ? '***'
      : domainName.length <= 2
        ? `${domainName[0] ?? '*'}*`
        : `${domainName[0]}${'*'.repeat(Math.max(1, domainName.length - 2))}${domainName[domainName.length - 1]}`;

  return `${maskedLocal}@${[maskedDomainName, ...domainRest].join('.')}`;
}

const passwordRequirements = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

function passwordRequirementMessage(): string {
  return 'Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*).';
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
  displayName: string;
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
  const moderationState = await getModerationState(userId);
  assertCanLogin(moderationState);

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
    displayName: fallback.displayName,
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
    moderation: moderationState,
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
  displayName: string;
  username: string;
  email: string;
  password: string;
  branch: string;
  year: number;
  authProvider: AuthProvider;
  googleSubject?: string | null;
  profilePhotoUrl?: string | null;
  verificationState?: UserVerificationState | null;
  verifiedAt?: boolean;
}): Promise<{ userId: string; displayName: string; username: string; createdAt: Date }> {
  const username = normalizeUsername(params.username);
  const usernameValidationError = validateUsername(username);
  if (usernameValidationError) throw new Error(usernameValidationError);

  const createdUsers = await prisma.$queryRaw<Array<{ user_id: string; created_at: Date }>>`
    INSERT INTO users (
      display_name,
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
      ${params.displayName},
      ${username},
      ${params.email},
      ${hashPassword(params.password)},
      'student'::"UserType",
      CAST(${params.authProvider} AS "AuthProvider"),
      ${params.googleSubject ?? null},
      ${params.profilePhotoUrl ?? null},
      FALSE,
      NOW(),
      ${params.verifiedAt ? new Date() : null},
      CAST(${params.verificationState ?? null} AS "UserVerificationState"),
      NOW()
    )
    RETURNING user_id, created_at
  `;

  const user = createdUsers[0];

  await prisma.$queryRaw`
    INSERT INTO student_profiles (user_id, branch, year, created_at, updated_at)
    VALUES (${user.user_id}, ${params.branch}, ${params.year}, NOW(), NOW())
  `;

  await createDefaultUserSettings(user.user_id);
  await invalidateUserCache(user.user_id);

  return {
    userId: user.user_id,
    displayName: params.displayName,
    username,
    createdAt: user.created_at,
  };
}

async function createAlumniUser(params: {
  displayName: string;
  username: string;
  email: string;
  password: string;
  branch: string;
  passingYear: number;
  currentStatus: string;
  authProvider: AuthProvider;
  googleSubject?: string | null;
  profilePhotoUrl?: string | null;
}): Promise<{ userId: string; displayName: string; username: string; createdAt: Date }> {
  const username = normalizeUsername(params.username);
  const usernameValidationError = validateUsername(username);
  if (usernameValidationError) throw new Error(usernameValidationError);

  const createdUsers = await prisma.$queryRaw<Array<{ user_id: string; created_at: Date }>>`
    INSERT INTO users (
      display_name,
      username,
      email,
      password_hash,
      user_type,
      auth_provider,
      google_subject,
      profile_photo_url,
      is_private,
      verification_state,
      onboarding_completed_at,
      updated_at
    )
    VALUES (
      ${params.displayName},
      ${username},
      ${params.email},
      ${hashPassword(params.password)},
      'alumni'::"UserType",
      CAST(${params.authProvider} AS "AuthProvider"),
      ${params.googleSubject ?? null},
      ${params.profilePhotoUrl ?? null},
      FALSE,
      'alumni_pending_review'::"UserVerificationState",
      NOW(),
      NOW()
    )
    RETURNING user_id, created_at
  `;

  const user = createdUsers[0];

  await prisma.$queryRaw`
    INSERT INTO alumni_profiles (user_id, branch, passing_year, current_status, created_at, updated_at)
    VALUES (${user.user_id}, ${params.branch}, ${params.passingYear}, ${params.currentStatus}, NOW(), NOW())
  `;

  await createDefaultUserSettings(user.user_id);
  await invalidateUserCache(user.user_id);

  return {
    userId: user.user_id,
    displayName: params.displayName,
    username,
    createdAt: user.created_at,
  };
}

async function upsertAlumniProfile(params: {
  userId: string;
  branch: string;
  passingYear: number;
  currentStatus: string;
}): Promise<void> {
  await prisma.$queryRaw`
    INSERT INTO alumni_profiles (user_id, branch, passing_year, current_status, created_at, updated_at)
    VALUES (${params.userId}, ${params.branch}, ${params.passingYear}, ${params.currentStatus}, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      branch = EXCLUDED.branch,
      passing_year = EXCLUDED.passing_year,
      current_status = EXCLUDED.current_status,
      updated_at = NOW()
  `;
}

async function updateAlumniSignupUser(params: {
  userId: string;
  displayName: string;
  username: string;
  password: string;
  authProvider: AuthProvider;
  googleSubject?: string | null;
  profilePhotoUrl?: string | null;
}): Promise<void> {
  await prisma.$queryRaw`
    UPDATE users
    SET
      password_hash = ${hashPassword(params.password)},
      display_name = ${params.displayName},
      username = ${params.username},
      auth_provider = CAST(${params.authProvider} AS "AuthProvider"),
      google_subject = COALESCE(google_subject, ${params.googleSubject ?? null}),
      profile_photo_url = COALESCE(profile_photo_url, ${params.profilePhotoUrl ?? null}),
      verification_state = 'alumni_pending_review'::"UserVerificationState",
      onboarding_completed_at = NOW(),
      updated_at = NOW()
    WHERE user_id = ${params.userId}
  `;
}

async function findLatestAlumniVerificationRequestByUserId(userId: string): Promise<{
  verification_request_id: string;
  status: string;
  requested_at: Date;
} | null> {
  const rows = await prisma.$queryRaw<Array<{
    verification_request_id: string;
    status: string;
    requested_at: Date;
  }>>`
    SELECT verification_request_id, status::text AS status, requested_at
    FROM admin_verification_requests
    WHERE target_user_id = ${userId}
      AND request_type = 'alumni'::"VerificationRequestType"
    ORDER BY requested_at DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function loadAlumniResubmissionContext(userId: string): Promise<AlumniResubmissionContextRow | null> {
  const rows = await prisma.$queryRaw<AlumniResubmissionContextRow[]>`
    SELECT
      u.user_id,
      u.display_name,
      u.username,
      u.email,
      ap.branch,
      ap.passing_year,
      ap.current_status
    FROM users u
    LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
    WHERE u.user_id = ${userId}
      AND u.user_type = 'alumni'::"UserType"
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function updateAlumniVerificationProfile(params: {
  userId: string;
  displayName: string;
  username: string;
  branch: string;
  passingYear: number;
  currentStatus: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      UPDATE users
      SET
        display_name = ${params.displayName},
        username = ${params.username},
        verification_state = 'alumni_pending_review'::"UserVerificationState",
        verified_at = NULL,
        updated_at = NOW()
      WHERE user_id = ${params.userId}
    `;

    await tx.$queryRaw`
      INSERT INTO alumni_profiles (user_id, branch, passing_year, current_status, created_at, updated_at)
      VALUES (${params.userId}, ${params.branch}, ${params.passingYear}, ${params.currentStatus}, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        branch = EXCLUDED.branch,
        passing_year = EXCLUDED.passing_year,
        current_status = EXCLUDED.current_status,
        updated_at = NOW()
    `;
  });
}

async function createAlumniVerificationRequest(params: {
  userId: string;
  displayName: string;
  username: string;
  email: string;
  branch: string;
  passingYear: number;
  currentStatus: string;
  uploadedFiles: Express.Multer.File[];
}): Promise<{
  verification_request_id: string;
  status: string;
  requested_at: Date;
}> {
  const documentUrls = await Promise.all(
    params.uploadedFiles.map((file) =>
      uploadVerificationProofToStorage({
        userId: params.userId,
        fileBuffer: file.buffer,
        mimeType: file.mimetype,
      })
    )
  );

  const profilePreview = {
    name: params.displayName,
    username: params.username,
    email: params.email,
    branch: params.branch,
    passingYear: params.passingYear,
    currentStatus: params.currentStatus,
    submittedProofLabels: params.uploadedFiles.map((file) => file.originalname),
  };

  const verificationRequests = await prisma.$queryRaw<Array<{
    verification_request_id: string;
    status: string;
    requested_at: Date;
  }>>`
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
      ${params.userId},
      ${JSON.stringify(documentUrls)}::jsonb,
      ${JSON.stringify(profilePreview)}::jsonb,
      ${`Alumni verification submitted by ${params.displayName}`},
      'pending'::"VerificationRequestStatus"
    )
    RETURNING verification_request_id, status::text, requested_at
  `;

  return verificationRequests[0];
}

async function createOnboardingSession(params: {
  provider: AuthProvider;
  accountType: SignupAccountType;
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
      ${JSON.stringify({ accountType: params.accountType })}::jsonb,
      NOW() + INTERVAL '1 day'
    )
    ON CONFLICT (google_subject)
    DO UPDATE SET
      provider = EXCLUDED.provider,
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

function getSignupSessionPayload(session: AuthOnboardingSessionRow): SignupSessionPayload {
  const accountType = session.payload?.accountType;
  if (accountType === 'student' || accountType === 'alumni') {
    return { accountType };
  }

  throw new Error('Invalid onboarding session payload');
}

function buildOnboardingResponse(session: AuthOnboardingSessionRow) {
  const payload = getSignupSessionPayload(session);

  return {
    onboardingRequired: true as const,
    sessionId: session.auth_onboarding_session_id,
    provider: session.provider,
    accountType: payload.accountType,
    email: session.email,
    fullName: session.full_name,
    suggestedUsername: session.suggested_username,
    profilePhotoUrl: session.profile_photo_url,
  };
}

function assertAllowedAlumniProofFiles(files: Express.Multer.File[]): void {
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
  onboardingSessionId: string;
  req: Request;
}): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  await cacheSetJson(
    magicLinkTokenKey(token),
    {
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

async function sendPasswordResetMagicLink(params: {
  email: string;
  userId: string;
  req: Request;
}): Promise<void> {
  const activeTokenPayload = await cacheGetJson<{ token: string }>(passwordResetActiveTokenKey(params.userId));
  let token = activeTokenPayload?.token;

  if (token) {
    const existingPayload = await cacheGetJson<PasswordResetRedisPayload>(passwordResetTokenKey(token));
    if (!existingPayload || existingPayload.userId !== params.userId || normalizeEmail(existingPayload.email) !== normalizeEmail(params.email)) {
      token = undefined;
    }
  }

  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    await cacheSetJson(
      passwordResetTokenKey(token),
      {
        userId: params.userId,
        email: params.email,
      } satisfies PasswordResetRedisPayload,
      PASSWORD_RESET_TTL_SECONDS,
    );
    await cacheSetJson(
      passwordResetActiveTokenKey(params.userId),
      { token },
      PASSWORD_RESET_TTL_SECONDS,
    );
  }

  const verifyUrl = `${getServerBaseUrl(params.req)}/auth/password-reset/verify?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail({
    email: params.email,
    magicLinkUrl: verifyUrl,
  });
}

async function hasActivePasswordResetLink(userId: string, email: string): Promise<boolean> {
  const activeTokenPayload = await cacheGetJson<{ token: string }>(passwordResetActiveTokenKey(userId));
  if (!activeTokenPayload?.token) {
    return false;
  }

  const cachedResetPayload = await cacheGetJson<PasswordResetRedisPayload>(passwordResetTokenKey(activeTokenPayload.token));
  if (!cachedResetPayload) {
    return false;
  }

  return cachedResetPayload.userId === userId && normalizeEmail(cachedResetPayload.email) === normalizeEmail(email);
}

async function markOnboardingSessionCompleted(sessionId: string): Promise<void> {
  await prisma.$queryRaw`
    UPDATE auth_onboarding_sessions
    SET completed_at = NOW(), updated_at = NOW()
    WHERE auth_onboarding_session_id = ${sessionId}
  `;
}

async function linkGoogleIdentityToUser(userId: string, googleSubject: string | null, profilePhotoUrl: string | null): Promise<void> {
  await prisma.$queryRaw`
    UPDATE users
    SET
      google_subject = COALESCE(google_subject, ${googleSubject}),
      profile_photo_url = COALESCE(profile_photo_url, ${profilePhotoUrl}),
      updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

function isGoogleProvider(session: AuthOnboardingSessionRow): boolean {
  return session.provider === 'google' && Boolean(session.google_subject);
}

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as Partial<StudentLoginBody>;
  const normalizedEmail = normalizeEmail(email ?? '');

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Missing email or password' });
  }

  try {
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordMatches = await verifyPassword(password, user.password_hash as never);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.is_banned) {
      return res.status(403).json({
        message: 'Your account has been permanently banned due to repeated violations.',
        code: 'ACCOUNT_BANNED',
      });
    }

    const isAdminAccount = await userHasAdminAccount(user.user_id);

    if (!isAdminAccount && user.verification_state === 'alumni_pending_review') {
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

    if (!isAdminAccount && user.verification_state === 'alumni_rejected') {
      return res.status(403).json({ message: 'Your alumni verification was rejected. Please contact support or resubmit proof.' });
    }

    const responsePayload = await buildAuthenticatedResponse(user.user_id, req, {
      displayName: user.display_name,
      username: user.username,
      email: user.email,
      type: user.user_type,
      createdAt: user.created_at,
      verificationState: user.verification_state,
      authProvider: user.auth_provider,
    });

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/alumni/resubmission', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    return res.status(400).json({ message: 'Resubmission token is required.' });
  }

  try {
    const payload = verifyVerificationActionToken(token);
    if (payload.status !== 'more_info') {
      return res.status(400).json({ message: 'This verification link cannot be used to upload more proof.' });
    }

    const latestRequest = await findLatestAlumniVerificationRequestByUserId(payload.userId);
    if (!latestRequest || latestRequest.verification_request_id !== payload.requestId || latestRequest.status !== 'more_info') {
      return res.status(409).json({ message: 'This verification link is no longer active. Please use the latest email from CampusLynk.' });
    }

    const user = await loadAlumniResubmissionContext(payload.userId);
    if (!user) {
      return res.status(404).json({ message: 'Unable to load your alumni profile for resubmission.' });
    }

    const requestRows = await prisma.$queryRaw<Array<{ decision_note: string | null }>>`
      SELECT decision_note
      FROM admin_verification_requests
      WHERE verification_request_id = ${payload.requestId}
      LIMIT 1
    `;

    return res.status(200).json({
      email: user.email,
      displayName: user.display_name,
      username: user.username,
      graduationYear: user.passing_year,
      branch: user.branch,
      currentStatus: user.current_status,
      decisionNote: requestRows[0]?.decision_note ?? null,
    });
  } catch {
    return res.status(400).json({ message: 'This verification link is invalid or has expired.' });
  }
});

router.post('/google', async (req: Request, res: Response) => {
  const { idToken, intent, accountType } = req.body as Partial<GoogleAuthBody>;

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
    const googleSubject = tokenInfo.sub?.trim() || null;

    if (!email || !googleSubject) {
      return res.status(400).json({ message: 'Google account details are incomplete. Please try again.' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      await linkGoogleIdentityToUser(existingUser.user_id, googleSubject, profilePhotoUrl);
      await invalidateUserCache(existingUser.user_id);

      const responsePayload = await buildAuthenticatedResponse(existingUser.user_id, req, {
        displayName: existingUser.display_name,
        username: existingUser.username,
        email,
        type: existingUser.user_type,
        createdAt: existingUser.created_at,
        verificationState: existingUser.verification_state,
        authProvider: existingUser.auth_provider,
      });

      return res.status(200).json(responsePayload);
    }

    if (intent !== 'signup' || !accountType) {
      return res.status(404).json({ message: 'No account was found for this Google email. Sign up first to continue.' });
    }

    if (accountType === 'student' && !isAllowedStudentEmail(email, tokenInfo.hd)) {
      return res.status(403).json({ message: `Students must sign up with an allowed ${getAllowedStudentDomain()} Google account.` });
    }

    const onboardingSession = await createOnboardingSession({
      provider: 'google',
      accountType,
      email,
      googleSubject,
      fullName,
      profilePhotoUrl,
      suggestedUsername: await generateUniqueUsername(fullName || email.split('@')[0] || 'user'),
    });

    return res.status(200).json(buildOnboardingResponse(onboardingSession));
  } catch (err: any) {
    console.error('Error during Google auth:', err);
    return res.status(500).json({ message: err?.message || 'Unable to sign in with Google' });
  }
});

router.post('/signup/verify-email', async (req: Request, res: Response) => {
  const { email, accountType } = req.body as Partial<SignupVerifyEmailBody>;
  const normalizedEmail = normalizeEmail(email ?? '');
  const ipAddress = getClientIp(req) || 'unknown';

  if (!accountType || (accountType !== 'student' && accountType !== 'alumni')) {
    return res.status(400).json({ message: 'Choose whether you are signing up as a student or alumni.' });
  }

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  if (accountType === 'student' && !normalizedEmail.endsWith(`@${getAllowedStudentDomain()}`)) {
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
      return res.status(429).json({ message: 'A fresh verification link was just sent. Please wait a moment before requesting another.' });
    }

    if (await emailExists(normalizedEmail)) {
      return res.status(409).json({ message: 'An account with this email already exists. Please log in instead.' });
    }

    const onboardingSession = await createOnboardingSession({
      provider: 'magic_link',
      accountType,
      email: normalizedEmail,
      fullName: normalizedEmail.split('@')[0],
      profilePhotoUrl: null,
      suggestedUsername: await generateUniqueUsername(normalizedEmail.split('@')[0]),
    });

    await sendMagicLink({
      email: normalizedEmail,
      onboardingSessionId: onboardingSession.auth_onboarding_session_id,
      req,
    });

    await Promise.all([
      incrementCounter(magicLinkEmailWindowKey(normalizedEmail), MAGIC_LINK_EMAIL_WINDOW_SECONDS),
      incrementCounter(magicLinkIpWindowKey(ipAddress), MAGIC_LINK_IP_WINDOW_SECONDS),
      cacheSetJson(magicLinkCooldownKey(normalizedEmail), { sentAt: new Date().toISOString() }, MAGIC_LINK_RESEND_COOLDOWN_SECONDS),
    ]);

    return res.status(200).json({
      message: 'Check your inbox for a secure verification link.',
    });
  } catch (err: any) {
    console.error('Error sending verification magic link:', err);
    return res.status(500).json({ message: err?.message || 'Unable to send verification link' });
  }
});

router.post('/password-reset/request', async (req: Request, res: Response) => {
  const { identifier } = req.body as Partial<PasswordResetRequestBody>;
  const trimmedIdentifier = identifier?.trim() || '';
  const ipAddress = getClientIp(req) || 'unknown';

  if (!trimmedIdentifier) {
    return res.status(400).json({ message: 'Enter your email address or username.' });
  }

  try {
    const user = await findUserForPasswordResetByIdentifier(trimmedIdentifier);
    if (!user) {
      return res.status(404).json({ message: 'No account was found for that email or username.' });
    }

    const hasActiveLink = await hasActivePasswordResetLink(user.user_id, user.email);

    if (!hasActiveLink) {
      const emailCount = await getCounterValue(passwordResetEmailWindowKey(user.email));
      if (emailCount >= PASSWORD_RESET_EMAIL_LIMIT) {
        return res.status(429).json({ message: 'Too many reset links sent to this email. Try again in a little while.' });
      }

      const ipCount = await getCounterValue(passwordResetIpWindowKey(ipAddress));
      if (ipCount >= PASSWORD_RESET_IP_LIMIT) {
        return res.status(429).json({ message: 'Too many reset requests from this network. Please wait and try again.' });
      }
    }

    await sendPasswordResetMagicLink({
      email: user.email,
      userId: user.user_id,
      req,
    });

    if (!hasActiveLink) {
      await Promise.all([
        incrementCounter(passwordResetEmailWindowKey(user.email), PASSWORD_RESET_EMAIL_WINDOW_SECONDS),
        incrementCounter(passwordResetIpWindowKey(ipAddress), PASSWORD_RESET_IP_WINDOW_SECONDS),
      ]);
    }

    const lookupType = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier) ? 'email' : 'username';
    const message = lookupType === 'email'
      ? `The password reset link is sent to your email address ${user.email}.`
      : `The password reset link is sent to your email address ${maskEmailAddress(user.email)}.`;

    return res.status(200).json({
      message,
      lookupType,
      deliveryEmail: user.email,
      maskedDeliveryEmail: maskEmailAddress(user.email),
    });
  } catch (err: any) {
    console.error('Error sending password reset link:', err);
    return res.status(500).json({ message: err?.message || 'Unable to send password reset link' });
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

    let exchangeCode = payload.exchangeCode;

    if (!exchangeCode) {
      exchangeCode = crypto.randomBytes(24).toString('hex');
      await cacheSetJson(
        magicLinkExchangeKey(exchangeCode),
        {
          onboardingSessionId: payload.onboardingSessionId,
          token,
        } satisfies MagicLinkExchangePayload,
        MAGIC_LINK_EXCHANGE_TTL_SECONDS,
      );

      await cacheSetJson(
        magicLinkTokenKey(token),
        {
          onboardingSessionId: payload.onboardingSessionId,
          exchangeCode,
        } satisfies MagicLinkRedisPayload,
        MAGIC_LINK_TTL_SECONDS,
      );
    }

    return res.redirect(buildMagicLinkRedirect({ authExchange: exchangeCode, authStatus: 'verified' }));
  } catch (err) {
    console.error('Error verifying magic link:', err);
    return res.redirect(buildMagicLinkRedirect({ authStatus: 'error' }));
  }
});

router.get('/password-reset/verify', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const ipAddress = getClientIp(req) || 'unknown';

  if (!token) {
    return res.redirect(buildPasswordResetRedirect({ authFlow: 'password-reset', authStatus: 'invalid' }));
  }

  try {
    const invalidAttempts = await getCounterValue(passwordResetInvalidAttemptKey(ipAddress));
    if (invalidAttempts >= PASSWORD_RESET_INVALID_ATTEMPT_LIMIT) {
      return res.redirect(buildPasswordResetRedirect({ authFlow: 'password-reset', authStatus: 'blocked' }));
    }

    const payload = await cacheGetJson<PasswordResetRedisPayload>(passwordResetTokenKey(token));
    if (!payload) {
      await incrementCounter(passwordResetInvalidAttemptKey(ipAddress), PASSWORD_RESET_IP_WINDOW_SECONDS);
      return res.redirect(buildPasswordResetRedirect({ authFlow: 'password-reset', authStatus: 'expired' }));
    }

    let exchangeCode = payload.exchangeCode;

    if (!exchangeCode) {
      exchangeCode = crypto.randomBytes(24).toString('hex');
      await cacheSetJson(
        passwordResetExchangeKey(exchangeCode),
        {
          token,
          userId: payload.userId,
          email: payload.email,
        } satisfies PasswordResetExchangePayload,
        PASSWORD_RESET_EXCHANGE_TTL_SECONDS,
      );

      await cacheSetJson(
        passwordResetTokenKey(token),
        {
          userId: payload.userId,
          email: payload.email,
          exchangeCode,
        } satisfies PasswordResetRedisPayload,
        PASSWORD_RESET_TTL_SECONDS,
      );
    }

    return res.redirect(buildPasswordResetRedirect({ authFlow: 'password-reset', resetExchange: exchangeCode, authStatus: 'verified' }));
  } catch (err) {
    console.error('Error verifying password reset link:', err);
    return res.redirect(buildPasswordResetRedirect({ authFlow: 'password-reset', authStatus: 'error' }));
  }
});

router.post('/signup/exchange', async (req: Request, res: Response) => {
  const { exchangeCode } = req.body as Partial<SignupExchangeBody>;

  if (!exchangeCode) {
    return res.status(400).json({ message: 'Exchange code is required.' });
  }

  try {
    const payload = await cacheGetJson<MagicLinkExchangePayload>(magicLinkExchangeKey(exchangeCode));
    if (!payload) {
      return res.status(400).json({ message: 'This verification link has already been used or expired.' });
    }

    await cacheDelete(magicLinkExchangeKey(exchangeCode));
    await cacheDelete(magicLinkTokenKey(payload.token));

    const session = await loadOnboardingSession(payload.onboardingSessionId);
    if (!session || session.completed_at || session.expires_at <= new Date()) {
      return res.status(400).json({ message: 'This signup session has expired. Request a new verification link.' });
    }

    return res.status(200).json(buildOnboardingResponse(session));
  } catch (err: any) {
    console.error('Error exchanging signup verification session:', err);
    return res.status(500).json({ message: err?.message || 'Unable to finish verification' });
  }
});

router.post('/password-reset/exchange', async (req: Request, res: Response) => {
  const { exchangeCode } = req.body as Partial<PasswordResetExchangeBody>;

  if (!exchangeCode) {
    return res.status(400).json({ message: 'Exchange code is required.' });
  }

  try {
    const payload = await cacheGetJson<PasswordResetExchangePayload>(passwordResetExchangeKey(exchangeCode));
    if (!payload) {
      return res.status(400).json({ message: 'This password reset link is invalid or expired.' });
    }

    const rows = await prisma.$queryRaw<Array<{ user_id: string; email: string }>>`
      SELECT user_id, email
      FROM users
      WHERE user_id = ${payload.userId}
      LIMIT 1
    `;

    const user = rows[0];
    if (!user || normalizeEmail(user.email) !== normalizeEmail(payload.email)) {
      return res.status(400).json({ message: 'This password reset link is no longer valid.' });
    }

    return res.status(200).json({
      resetToken: signPasswordResetToken(user.user_id, user.email, payload.token),
      email: user.email,
      maskedEmail: maskEmailAddress(user.email),
    });
  } catch (err: any) {
    console.error('Error exchanging password reset session:', err);
    return res.status(500).json({ message: err?.message || 'Unable to finish password reset verification' });
  }
});

router.patch('/password-reset/complete', async (req: Request, res: Response) => {
  const { resetToken, newPassword, confirmPassword } = req.body as Partial<PasswordResetCompleteBody>;

  if (!resetToken) {
    return res.status(400).json({ message: 'Password reset token is required.' });
  }

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'New password and confirmation are required.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'New password and confirmation do not match.' });
  }

  if (!passwordRequirements.test(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'Password does not meet the requirements.',
      details: passwordRequirementMessage(),
    });
  }

  try {
    const tokenPayload = verifyPasswordResetToken(resetToken);
    const activeTokenPayload = await cacheGetJson<{ token: string }>(passwordResetActiveTokenKey(tokenPayload.userId));
    const cachedResetPayload = await cacheGetJson<PasswordResetRedisPayload>(passwordResetTokenKey(tokenPayload.token));

    if (!activeTokenPayload || activeTokenPayload.token !== tokenPayload.token || !cachedResetPayload) {
      return res.status(401).json({ message: 'Invalid or expired password reset token' });
    }

    const rows = await prisma.$queryRaw<Array<{ user_id: string; email: string }>>`
      SELECT user_id, email
      FROM users
      WHERE user_id = ${tokenPayload.userId}
      LIMIT 1
    `;

    const user = rows[0];
    if (
      !user ||
      normalizeEmail(user.email) !== normalizeEmail(tokenPayload.email) ||
      cachedResetPayload.userId !== tokenPayload.userId ||
      normalizeEmail(cachedResetPayload.email) !== normalizeEmail(tokenPayload.email)
    ) {
      return res.status(404).json({ message: 'User not found' });
    }

    await prisma.$queryRaw`
      UPDATE users
      SET password_hash = ${hashPassword(newPassword)}, updated_at = NOW()
      WHERE user_id = ${tokenPayload.userId}
    `;

    await setAdminMustChangePassword(tokenPayload.userId, false).catch(() => {
      // Not all users are admins; ignore when no admin account exists.
    });

    await cacheDelete(passwordResetActiveTokenKey(tokenPayload.userId));
    await cacheDelete(passwordResetTokenKey(tokenPayload.token));
    if (cachedResetPayload.exchangeCode) {
      await cacheDelete(passwordResetExchangeKey(cachedResetPayload.exchangeCode));
    }

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid password reset token') {
      return res.status(401).json({ message: 'Invalid or expired password reset token' });
    }

    console.error('Error completing password reset:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/signup/student', validatePassword, async (req: Request, res: Response) => {
  const { sessionId, displayName, username, password, branch, year } = req.body as Partial<StudentSignupBody>;

  if (!sessionId || !displayName || !username || !password || !branch || !year) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const session = await loadOnboardingSession(sessionId);
    if (!session || session.completed_at || session.expires_at <= new Date()) {
      return res.status(400).json({ message: 'This signup session has expired. Start again to continue.' });
    }

    const payload = getSignupSessionPayload(session);
    if (payload.accountType !== 'student') {
      return res.status(400).json({ message: 'This signup session is not for a student account.' });
    }

    const email = normalizeEmail(session.email);
    if (!isAllowedStudentEmail(email)) {
      return res.status(403).json({ message: `Students must use your official college email (@${getAllowedStudentDomain()}).` });
    }

    if (await emailExists(email)) {
      return res.status(409).json({ message: 'An account with this email already exists. Please log in instead.' });
    }

    const numericYear = parseRequiredNumericValue(year, 'Year');
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedUsername = normalizeUsername(username);
    const usernameValidationError = validateUsername(normalizedUsername);
    if (usernameValidationError) {
      return res.status(400).json({ message: usernameValidationError });
    }
    if (await usernameExists(normalizedUsername)) {
      return res.status(409).json({ message: 'That username is already taken. Please choose another one.' });
    }
    const created = await createStudentUser({
      displayName: normalizedDisplayName,
      username: normalizedUsername,
      email,
      password,
      branch: branch.trim(),
      year: numericYear,
      authProvider: session.provider,
      googleSubject: session.google_subject,
      profilePhotoUrl: session.profile_photo_url,
      verificationState: isGoogleProvider(session) ? 'student_google_verified' : null,
      verifiedAt: true,
    });

    await markOnboardingSessionCompleted(sessionId);

    const responsePayload = await buildAuthenticatedResponse(created.userId, req, {
      displayName: created.displayName,
      username: created.username,
      email,
      type: 'student',
      createdAt: created.createdAt,
      verificationState: isGoogleProvider(session) ? 'student_google_verified' : null,
      authProvider: session.provider,
      details: {
        branch: branch.trim(),
        year: numericYear,
      },
    });

    return res.status(201).json(responsePayload);
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ message: 'That username is already taken. Please choose another one.' });
    }
    console.error('Error completing student signup:', err);
    return res.status(500).json({ message: err?.message || 'Unable to complete student signup' });
  }
});

router.post('/signup/alumni', alumniProofUpload.array('proofFiles', 5), validatePassword, async (req: Request, res: Response) => {
  const { sessionId, displayName, username, graduationYear, branch, currentStatus, password } = req.body as Partial<AlumniSignupBody>;
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  if (!sessionId || !displayName || !username || !graduationYear || !branch || !currentStatus || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    assertAllowedAlumniProofFiles(uploadedFiles);

    const session = await loadOnboardingSession(sessionId);
    if (!session || session.completed_at || session.expires_at <= new Date()) {
      return res.status(400).json({ message: 'This signup session has expired. Start again to continue.' });
    }

    const payload = getSignupSessionPayload(session);
    if (payload.accountType !== 'alumni') {
      return res.status(400).json({ message: 'This signup session is not for an alumni account.' });
    }

    const email = normalizeEmail(session.email);
    const numericGradYear = parseRequiredNumericValue(graduationYear, 'Graduation year');
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedUsername = normalizeUsername(username);
    const usernameValidationError = validateUsername(normalizedUsername);
    if (usernameValidationError) {
      return res.status(400).json({ message: usernameValidationError });
    }
    const trimmedBranch = branch.trim();
    const trimmedCurrentStatus = currentStatus.trim();
    const existingUser = await findUserByEmail(email);

    let created: { userId: string; displayName: string; username: string; createdAt: Date };

    if (existingUser) {
      if (existingUser.user_type !== 'alumni') {
        return res.status(409).json({ message: 'An account with this email already exists. Please log in instead.' });
      }

      if (existingUser.username !== normalizedUsername && (await usernameExists(normalizedUsername))) {
        return res.status(409).json({ message: 'That username is already taken. Please choose another one.' });
      }

      const latestRequest = await findLatestAlumniVerificationRequestByUserId(existingUser.user_id);
      if (latestRequest && ['pending', 'approved', 'more_info', 'reviewing'].includes(latestRequest.status)) {
        await markOnboardingSessionCompleted(sessionId);
        return res.status(200).json({
          pendingVerification: true,
          message: latestRequest.status === 'approved'
            ? 'Your alumni account has already been verified. Please log in.'
            : 'Your alumni verification request is already on file and pending review.',
          request: {
            id: latestRequest.verification_request_id,
            status: latestRequest.status,
            requestedAt: latestRequest.requested_at.toISOString(),
            verificationState: existingUser.verification_state ?? 'alumni_pending_review',
          },
        });
      }

      await updateAlumniSignupUser({
        userId: existingUser.user_id,
        displayName: normalizedDisplayName,
        username: normalizedUsername,
        password,
        authProvider: session.provider,
        googleSubject: session.google_subject,
        profilePhotoUrl: session.profile_photo_url,
      });
      await upsertAlumniProfile({
        userId: existingUser.user_id,
        branch: trimmedBranch,
        passingYear: numericGradYear,
        currentStatus: trimmedCurrentStatus,
      });
      await createDefaultUserSettings(existingUser.user_id);
      await invalidateUserCache(existingUser.user_id);

      created = {
        userId: existingUser.user_id,
        displayName: normalizedDisplayName,
        username: normalizedUsername,
        createdAt: existingUser.created_at,
      };
    } else {
      if (await usernameExists(normalizedUsername)) {
        return res.status(409).json({ message: 'That username is already taken. Please choose another one.' });
      }
      created = await createAlumniUser({
        displayName: normalizedDisplayName,
        username: normalizedUsername,
        email,
        password,
        branch: trimmedBranch,
        passingYear: numericGradYear,
        currentStatus: trimmedCurrentStatus,
        authProvider: session.provider,
        googleSubject: session.google_subject,
        profilePhotoUrl: session.profile_photo_url,
      });
    }

    const verificationRequest = await createAlumniVerificationRequest({
      userId: created.userId,
      displayName: normalizedDisplayName,
      username: normalizedUsername,
      email,
      branch: trimmedBranch,
      passingYear: numericGradYear,
      currentStatus: trimmedCurrentStatus,
      uploadedFiles,
    });

    await markOnboardingSessionCompleted(sessionId);
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
    if (err?.code === '23505') {
      return res.status(409).json({ message: 'That username is already taken. Please choose another one.' });
    }
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

router.post('/alumni/resubmit', alumniProofUpload.array('proofFiles', 5), async (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const displayName = normalizeDisplayName(String(req.body?.displayName ?? ''));
  const username = normalizeUsername(String(req.body?.username ?? ''));
  const branch = String(req.body?.branch ?? '').trim();
  const currentStatus = String(req.body?.currentStatus ?? '').trim();
  const graduationYear = req.body?.graduationYear;
  const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];

  if (!token) {
    return res.status(400).json({ message: 'Resubmission token is required.' });
  }

  if (!displayName || !username || !branch || !currentStatus || !graduationYear) {
    return res.status(400).json({ message: 'Complete all alumni profile fields before resubmitting.' });
  }

  if (uploadedFiles.length === 0) {
    return res.status(400).json({ message: 'Upload at least one new verification proof file.' });
  }

  try {
    assertAllowedAlumniProofFiles(uploadedFiles);
    const payload = verifyVerificationActionToken(token);
    if (payload.status !== 'more_info') {
      return res.status(400).json({ message: 'This verification link cannot be used to upload more proof.' });
    }

    const latestRequest = await findLatestAlumniVerificationRequestByUserId(payload.userId);
    if (!latestRequest || latestRequest.verification_request_id !== payload.requestId || latestRequest.status !== 'more_info') {
      return res.status(409).json({ message: 'This verification request is no longer waiting for more proof.' });
    }

    const usernameValidationError = validateUsername(username);
    if (usernameValidationError) {
      return res.status(400).json({ message: usernameValidationError });
    }

    const conflictingUsers = await prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT user_id
      FROM users
      WHERE username = ${username}
        AND user_id <> ${payload.userId}
      LIMIT 1
    `;
    if (conflictingUsers.length > 0) {
      return res.status(409).json({ message: 'That username is already taken. Please choose another one.' });
    }

    const numericGradYear = parseRequiredNumericValue(graduationYear, 'Graduation year');

    await updateAlumniVerificationProfile({
      userId: payload.userId,
      displayName,
      username,
      branch,
      passingYear: numericGradYear,
      currentStatus,
    });

    const verificationRequest = await createAlumniVerificationRequest({
      userId: payload.userId,
      displayName,
      username,
      email: payload.email,
      branch,
      passingYear: numericGradYear,
      currentStatus,
      uploadedFiles,
    });

    await invalidateUserCache(payload.userId);

    return res.status(201).json({
      pendingVerification: true,
      message: 'Your updated alumni proof has been submitted and is pending admin review.',
      request: {
        id: verificationRequest.verification_request_id,
        status: verificationRequest.status,
        requestedAt: verificationRequest.requested_at.toISOString(),
        verificationState: 'alumni_pending_review' as const,
      },
    });
  } catch (err: any) {
    return res.status(400).json({ message: err?.message || 'Unable to resubmit alumni verification proof.' });
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
