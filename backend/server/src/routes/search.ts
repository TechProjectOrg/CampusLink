import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';

const router = express.Router();

router.use(authenticateToken);

// ============================================================
// GET /search/users?q=<query>&limit=<n>&offset=<n>
// ============================================================

interface SearchUserRow {
  user_id: string;
  username: string;
  email: string;
  profile_photo_url: string | null;
  is_private: boolean;
  user_type: string;
  student_branch: string | null;
  student_year: number | null;
  alumni_branch: string | null;
  alumni_passing_year: number | null;
}

router.get('/users', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;

  const q = (req.query.q as string | undefined)?.trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  if (!q || q.length === 0) {
    return res.status(200).json([]);
  }

  const pattern = `%${q}%`;

  try {
    const rows = await prisma.$queryRaw<SearchUserRow[]>`
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.profile_photo_url,
        u.is_private,
        u.user_type,
        sp.branch AS student_branch,
        sp.year   AS student_year,
        ap.branch AS alumni_branch,
        ap.passing_year AS alumni_passing_year
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN alumni_profiles  ap ON ap.user_id = u.user_id
      WHERE u.user_id <> ${currentUserId}
        AND (u.username ILIKE ${pattern} OR u.email ILIKE ${pattern})
      ORDER BY u.username
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const results = rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      email: r.email,
      profilePictureUrl: r.profile_photo_url,
      isPrivate: r.is_private,
      type: r.user_type,
      branch: r.student_branch ?? r.alumni_branch ?? null,
      year: r.student_year ?? r.alumni_passing_year ?? null,
    }));

    return res.status(200).json(results);
  } catch (err) {
    console.error('Error searching users:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
