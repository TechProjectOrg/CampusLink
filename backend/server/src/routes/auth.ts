import express, { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';

const router = express.Router();

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function emailExists(email: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "users" WHERE email = ${email}) as "exists"
  `;

  return result[0]?.exists ?? false;
}

async function generateUsername(email: string, name?: string): Promise<string> {
  const baseFromEmail = email.split('@')[0];
  const cleanedBase = (name ?? baseFromEmail)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20) || 'user';

  let candidate = cleanedBase;
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

    candidate = `${cleanedBase}${suffix}`;
    suffix += 1;
  }
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

router.post('/signup/student', async (req: Request, res: Response) => {
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

    const bio = `Student - Branch: ${branch}, Year: ${numericYear}`;

    const createdUsers = await prisma.$queryRaw<
      { user_id: string; username: string; email: string; bio: string | null; created_at: Date }[]
    >`
      INSERT INTO "users" (username, email, password_hash, bio, is_public)
      VALUES (${username}, ${email}, ${passwordHash}, ${bio}, true)
      RETURNING user_id, username, email, bio, created_at
    `;

    const user = createdUsers[0];

    return res.status(201).json({
      userId: user.user_id,
      username: user.username,
      email: user.email,
      bio: user.bio,
      type: 'student',
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Error during student signup:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/signup/alumni', async (req: Request, res: Response) => {
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

    const bio = `Alumni - Branch: ${branch}, Graduation Year: ${numericGradYear}, Status: ${currentStatus}`;

    const createdUsers = await prisma.$queryRaw<
      { user_id: string; username: string; email: string; bio: string | null; created_at: Date }[]
    >`
      INSERT INTO "users" (username, email, password_hash, bio, is_public)
      VALUES (${username}, ${email}, ${passwordHash}, ${bio}, true)
      RETURNING user_id, username, email, bio, created_at
    `;

    const user = createdUsers[0];

    return res.status(201).json({
      userId: user.user_id,
      username: user.username,
      email: user.email,
      bio: user.bio,
      type: 'alumni',
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Error during alumni signup:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
