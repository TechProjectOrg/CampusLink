import express, { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';
import validatePassword from '../middleware/validatePassword';

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
      INSERT INTO users (username, email, password_hash, profile_picture_url)
      VALUES (${username}, ${email}, ${passwordHash}, NULL)
      RETURNING user_id, username, email, created_at
    `;

    const user = createdUsers[0];

    await prisma.$queryRaw`
      INSERT INTO studentprofiles (user_id, branch, year)
      VALUES (${user.user_id}, ${branch}, ${numericYear})
    `;

    return res.status(201).json({
      userId: user.user_id,
      username: user.username,
      email: user.email,
      type: 'student',
      createdAt: user.created_at,
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
      INSERT INTO users (username, email, password_hash, profile_picture_url)
      VALUES (${username}, ${email}, ${passwordHash}, NULL)
      RETURNING user_id, username, email, created_at
    `;

    const user = createdUsers[0];

    await prisma.$queryRaw`
      INSERT INTO alumniprofiles (user_id, branch, passing_year)
      VALUES (${user.user_id}, ${branch}, ${numericGradYear})
    `;

    return res.status(201).json({
      userId: user.user_id,
      username: user.username,
      email: user.email,
      type: 'alumni',
      createdAt: user.created_at,
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
        created_at: Date;
      }[]
    >`
      SELECT user_id, username, email, password_hash, created_at
      FROM users
      WHERE email = ${email}
    `;

    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const incomingHash = hashPassword(password);

    if (incomingHash !== user.password_hash) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const typeResult = await prisma.$queryRaw<{ type: string }[]>`
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM studentprofiles sp WHERE sp.user_id = ${user.user_id}) THEN 'student'
        WHEN EXISTS (SELECT 1 FROM alumniprofiles ap WHERE ap.user_id = ${user.user_id}) THEN 'alumni'
        WHEN EXISTS (SELECT 1 FROM teacherprofiles tp WHERE tp.user_id = ${user.user_id}) THEN 'teacher'
        ELSE 'unknown'
      END AS type
    `;

    const type = typeResult[0]?.type ?? 'unknown';

    return res.status(200).json({
      userId: user.user_id,
      username: user.username,
      email: user.email,
      type,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
