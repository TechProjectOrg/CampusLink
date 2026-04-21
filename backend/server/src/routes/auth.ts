import crypto from 'crypto';
import express, { Request, Response } from 'express';
import prisma from '../prisma';
import validatePassword from '../middleware/validatePassword';
import { getUserProfileById } from '../services/userProfile';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { hashPassword, signAuthToken, verifyPassword } from '../lib/auth';

const router = express.Router();

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

router.post('/signup/student', validatePassword, async (req: Request, res: Response) => {
  const { name, email, password, branch, year } = req.body as Partial<StudentSignupBody>;

  if (!name || !email || !password || !branch || !year) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (!email.toLowerCase().endsWith('@gbpuat.ac.in')) {
    return res.status(400).json({ message: 'Students must use a college email (@gbpuat.ac.in)' });
  }

  try {
    const exists = await emailExists(email);
    if (exists) {
      return res.status(409).json({ message: 'User already exists. Please sign in instead.' });
    }

    const username = await generateUsername(email, name);
    const passwordHash = hashPassword(password);
    const numericYear = typeof year === 'string' ? parseInt(year, 10) : year;

    const createdUsers = await prisma.$queryRaw<
      { user_id: string; username: string; email: string; created_at: Date }[]
    >`
      INSERT INTO users (username, email, password_hash, user_type, profile_photo_url, is_private)
      VALUES (${username}, ${email}, ${passwordHash}, 'student'::"UserType", NULL, FALSE)
      RETURNING user_id, username, email, created_at
    `;

    const user = createdUsers[0];

    await prisma.$queryRaw`
      INSERT INTO student_profiles (user_id, branch, year)
      VALUES (${user.user_id}, ${branch}, ${numericYear})
    `;

    await createDefaultUserSettings(user.user_id);

    const session = await createAuthSession(user.user_id, req);
    const profile = await getUserProfileById(user.user_id);
    const responsePayload = profile ?? {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      type: 'student' as const,
      createdAt: user.created_at,
      bio: null,
      headline: null,
      profilePictureUrl: null,
      isPublic: true,
      isActive: true,
      isOnline: false,
      lastSeenAt: null,
      details: {
        branch,
        year: numericYear,
      },
      stats: {
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
      },
    };

    return res.status(201).json({
      ...responsePayload,
      token: signAuthToken({
        userId: responsePayload.userId,
        email: responsePayload.email,
        username: responsePayload.username,
        type: responsePayload.type,
        sessionId: session.session_id,
      }),
    });
  } catch (err) {
    console.error('Error during student signup:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/signup/alumni', validatePassword, async (req: Request, res: Response) => {
  const { name, email, graduationYear, branch, currentStatus, password } =
    req.body as Partial<AlumniSignupBody>;

  if (!name || !email || !graduationYear || !branch || !currentStatus || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const exists = await emailExists(email);
    if (exists) {
      return res.status(409).json({ message: 'User already exists. Please sign in instead.' });
    }

    const username = await generateUsername(email, name);
    const passwordHash = hashPassword(password);
    const numericGradYear =
      typeof graduationYear === 'string' ? parseInt(graduationYear, 10) : graduationYear;

    const createdUsers = await prisma.$queryRaw<
      { user_id: string; username: string; email: string; created_at: Date }[]
    >`
      INSERT INTO users (username, email, password_hash, user_type, profile_photo_url, is_private)
      VALUES (${username}, ${email}, ${passwordHash}, 'alumni'::"UserType", NULL, FALSE)
      RETURNING user_id, username, email, created_at
    `;

    const user = createdUsers[0];

    await prisma.$queryRaw`
      INSERT INTO alumni_profiles (user_id, branch, passing_year, current_status)
      VALUES (${user.user_id}, ${branch}, ${numericGradYear}, ${currentStatus})
    `;

    await createDefaultUserSettings(user.user_id);

    const session = await createAuthSession(user.user_id, req);
    const profile = await getUserProfileById(user.user_id);
    const responsePayload = profile ?? {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      type: 'alumni' as const,
      createdAt: user.created_at,
      bio: null,
      headline: null,
      profilePictureUrl: null,
      isPublic: true,
      isActive: true,
      isOnline: false,
      lastSeenAt: null,
      details: {
        branch,
        passingYear: numericGradYear,
      },
      stats: {
        followerCount: 0,
        followingCount: 0,
        postCount: 0,
      },
    };

    return res.status(201).json({
      ...responsePayload,
      token: signAuthToken({
        userId: responsePayload.userId,
        email: responsePayload.email,
        username: responsePayload.username,
        type: responsePayload.type,
        sessionId: session.session_id,
      }),
    });
  } catch (err) {
    console.error('Error during alumni signup:', err);
    return res.status(500).json({ message: 'Internal server error' });
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
        created_at: Date;
      }[]
    >`
      SELECT user_id, username, email, password_hash, user_type, created_at
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
