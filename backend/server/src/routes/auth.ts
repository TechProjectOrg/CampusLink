import express, { Request, Response } from 'express';
import prisma from '../prisma';
import validatePassword from '../middleware/validatePassword';
import { getUserProfileById } from '../services/userProfile';
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
  });
  return { ...profile, token };
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

    await prisma.$queryRaw`
      INSERT INTO user_settings (user_id)
      VALUES (${user.user_id})
    `;

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

    return res.status(201).json(buildResponseWithToken(responsePayload));
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

    await prisma.$queryRaw`
      INSERT INTO user_settings (user_id)
      VALUES (${user.user_id})
    `;

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

    return res.status(201).json(buildResponseWithToken(responsePayload));
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
          }
        ),
      });
    }

    return res.status(200).json(buildResponseWithToken(profile));
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
