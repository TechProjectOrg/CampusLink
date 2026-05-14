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

const router = express.Router();
const alumniProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024,
  },
});

async function emailExists(email: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "users" WHERE email = ${email}) as "exists"
  `;

  return result[0]?.exists ?? false;
}

async function generateUsername(email: string, name?: string): Promise<string> {
  let base: string;
  if (name) {
    base = name; // Use name directly if provided
  } else {
    base = email.split('@')[0]; // Fallback to email if name is not provided
    base = base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user'; // Clean up if from email
  }

  let candidate = base;
  let suffix = 1;

  // Ensure uniqueness against existing usernames
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existsResult = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM "users" WHERE username = ${candidate}) as "exists"
    `;

    if (!existsResult[0]?.exists) {
      return candidate;
    }

    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}

function buildResponseWithToken(profile: NonNullable<Awaited<ReturnType<typeof getUserProfileById>>>) {
  const token = signAuthToken({
    userId: profile.userId,
    email: profile.email,
    username: profile.username,
    type: profile.type,
    sessionId: crypto.randomUUID(),
  });
  return { ...profile, token };
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
    getSingleHeaderValue(req, 'x-vercel-ip-city') ||
    getSingleHeaderValue(req, 'x-appengine-city');
  const region =
    getSingleHeaderValue(req, 'x-vercel-ip-country-region') ||
    getSingleHeaderValue(req, 'x-appengine-region');
  const country =
    getSingleHeaderValue(req, 'x-vercel-ip-country') ||
    getSingleHeaderValue(req, 'cf-ipcountry') ||
    getSingleHeaderValue(req, 'x-appengine-country');

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

interface StudentSignupBody {
  name: string;
  email: string;
  password: string;
  branch: string;
  year: string | number;
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

interface StudentGoogleAuthBody {
  idToken: string;
  branch?: string;
  year?: string | number;
}

type UserVerificationState =
  | 'student_google_verified'
  | 'alumni_pending_review'
  | 'alumni_verified'
  | 'alumni_rejected';

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string;
  hd?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  sub?: string;
}

function getGoogleClientId(): string {
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error('Google sign-in is not configured on the server');
  }

  return clientId;
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

function parseRequiredNumericValue(raw: string | number | undefined, label: string): number {
  const numericValue = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (!numericValue || Number.isNaN(numericValue)) {
    throw new Error(`${label} is required`);
  }
  return numericValue;
}

router.post('/google/student', async (req: Request, res: Response) => {
  const { idToken, branch, year } = req.body as Partial<StudentGoogleAuthBody>;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token is required' });
  }

  try {
    const tokenInfo = await verifyGoogleIdToken(idToken);
    const email = tokenInfo.email?.trim().toLowerCase();

    if (!email || !email.endsWith('@gbpuat.ac.in') || tokenInfo.hd !== 'gbpuat.ac.in') {
      return res.status(403).json({ message: 'Students must sign in with a GBPUAT Google account' });
    }

    const existingUsers = await prisma.$queryRaw<
      Array<{
        user_id: string;
        username: string;
        email: string;
        created_at: Date;
        user_type: 'student' | 'alumni';
      }>
    >`
      SELECT user_id, username, email, created_at, user_type
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    const existingUser = existingUsers[0];

    let userId = existingUser?.user_id ?? null;
    let username = existingUser?.username ?? null;
    let createdAt = existingUser?.created_at ?? null;

    if (existingUser && existingUser.user_type !== 'student') {
      return res.status(409).json({ message: 'This email is already linked to a non-student account' });
    }

    const numericYear = year == null || year === '' ? null : parseRequiredNumericValue(year, 'Year');
    const normalizedBranch = branch?.trim() || null;

    if (!existingUser) {
      if (!normalizedBranch || !numericYear) {
        return res.status(400).json({ message: 'Branch and year are required to create a student account' });
      }

      username = await generateUsername(email, tokenInfo.name || email.split('@')[0]);
      const createdUsers = await prisma.$queryRaw<
        { user_id: string; username: string; email: string; created_at: Date }[]
      >`
        INSERT INTO users (
          username,
          email,
          password_hash,
          user_type,
          profile_photo_url,
          is_private,
          verified_at,
          verification_state,
          updated_at
        )
        VALUES (
          ${username},
          ${email},
          ${hashPassword(crypto.randomUUID())},
          'student'::"UserType",
          NULL,
          FALSE,
          NOW(),
          'student_google_verified'::"UserVerificationState",
          NOW()
        )
        RETURNING user_id, username, email, created_at
      `;

      const user = createdUsers[0];
      userId = user.user_id;
      createdAt = user.created_at;

      await prisma.$queryRaw`
        INSERT INTO student_profiles (user_id, branch, year)
        VALUES (${user.user_id}, ${normalizedBranch}, ${numericYear})
      `;

      await createDefaultUserSettings(user.user_id);
      await invalidateUserCache(user.user_id);
    } else {
      userId = existingUser.user_id;
      username = existingUser.username;
      createdAt = existingUser.created_at;

      await prisma.$queryRaw`
        UPDATE users
        SET verified_at = NOW(),
            verification_state = 'student_google_verified'::"UserVerificationState",
            updated_at = NOW()
        WHERE user_id = ${userId}
      `;

      if (normalizedBranch && numericYear) {
        await prisma.$queryRaw`
          INSERT INTO student_profiles (user_id, branch, year)
          VALUES (${userId}, ${normalizedBranch}, ${numericYear})
          ON CONFLICT (user_id)
          DO UPDATE SET branch = EXCLUDED.branch, year = EXCLUDED.year, updated_at = NOW()
        `;
      }
      await invalidateUserCache(userId);
    }

    const session = await createAuthSession(userId!, req);
    const profile = await getUserProfileById(userId!);
    const responsePayload = profile ?? {
      userId,
      username: username!,
      email,
      type: 'student' as const,
      verificationState: 'student_google_verified' as const,
      createdAt: createdAt ?? new Date(),
      bio: null,
      headline: null,
      profilePictureUrl: null,
      coverPhotoUrl: null,
      isPublic: true,
      isActive: true,
      isOnline: false,
      lastSeenAt: null,
      details: normalizedBranch && numericYear ? { branch: normalizedBranch, year: numericYear } : {},
      stats: {
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
      },
    };

    return res.status(existingUser ? 200 : 201).json({
      ...responsePayload,
      token: signAuthToken({
        userId: responsePayload.userId,
        email: responsePayload.email,
        username: responsePayload.username,
        type: responsePayload.type,
        sessionId: session.session_id,
      }),
    });
  } catch (err: any) {
    console.error('Error during Google student sign-in:', err);
    return res.status(500).json({ message: err?.message || 'Unable to sign in with Google' });
  }
});

router.post('/signup/student', validatePassword, async (_req: Request, res: Response) => {
  return res.status(410).json({ message: 'Students must sign in with Google using their @gbpuat.ac.in account' });
});

router.post('/signup/alumni', alumniProofUpload.array('proofFiles', 5), validatePassword, async (req: Request, res: Response) => {
  const { name, email, graduationYear, branch, currentStatus, password } =
    req.body as Partial<AlumniSignupBody>;
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  if (!name || !email || !graduationYear || !branch || !currentStatus || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    assertAllowedAlumniProofFiles(uploadedFiles);

    const exists = await emailExists(email);
    if (exists) {
      return res.status(409).json({ message: 'User already exists. Please sign in instead.' });
    }

    const username = await generateUsername(email, name);
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
        profile_photo_url,
        is_private,
        verification_state,
        updated_at
      )
      VALUES (
        ${username},
        ${email},
        ${passwordHash},
        'alumni'::"UserType",
        NULL,
        FALSE,
        'alumni_pending_review'::"UserVerificationState",
        NOW()
      )
      RETURNING user_id, username, email, created_at
    `;

    const user = createdUsers[0];

    await prisma.$queryRaw`
      INSERT INTO alumni_profiles (user_id, branch, passing_year, current_status)
      VALUES (${user.user_id}, ${branch}, ${numericGradYear}, ${currentStatus})
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
      email: email.trim().toLowerCase(),
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
        user_type: 'student' | 'alumni';
        verification_state: UserVerificationState | null;
        created_at: Date;
      }[]
    >`
      SELECT user_id, username, email, password_hash, user_type, verification_state::text, created_at
      FROM users
      WHERE email = ${email}
    `;

    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const incomingHash = hashPassword(password);
    const passwordMatches = await verifyPassword(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.user_type === 'student') {
      return res.status(403).json({ message: 'Students must sign in with Google using their @gbpuat.ac.in account' });
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

    const session = await createAuthSession(user.user_id, req);
    const profile = await getUserProfileById(user.user_id);
    if (!profile) {
      // Should never happen since we just fetched the user, but keep a safe fallback.
      return res.status(200).json({
        userId: user.user_id,
        username: user.username,
        email: user.email,
        type: user.user_type,
        createdAt: user.created_at,
        bio: null,
        headline: null,
        profilePictureUrl: null,
        isPublic: true,
        isActive: true,
        isOnline: false,
        lastSeenAt: null,
        details: {},
        stats: {
          followerCount: 0,
          followingCount: 0,
          postCount: 0,
        },
        token: signAuthToken(
          {
            userId: user.user_id,
            email: user.email,
            username: user.username,
            type: user.user_type,
            sessionId: session.session_id,
          }
        ),
      });
    }

    return res.status(200).json({
      ...profile,
      token: signAuthToken({
        userId: profile.userId,
        email: profile.email,
        username: profile.username,
        type: profile.type,
        sessionId: session.session_id,
      }),
    });
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
