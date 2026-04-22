import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';

const router = express.Router();

router.use(authenticateToken);

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

interface SearchHashtagRow {
  tag_name: string;
  post_count: number;
}

function parsePaging(value: string | undefined, fallback: number, max: number): number {
  const parsed = parseInt(value ?? '', 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, 0), max);
}

async function searchUsers(currentUserId: string, q: string, limit: number, offset: number) {
  const pattern = `%${q}%`;

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

  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    email: r.email,
    profilePictureUrl: r.profile_photo_url,
    isPrivate: r.is_private,
    type: r.user_type,
    branch: r.student_branch ?? r.alumni_branch ?? null,
    year: r.student_year ?? r.alumni_passing_year ?? null,
  }));
}

async function searchHashtags(currentUserId: string, q: string, limit: number, offset: number) {
  const pattern = `%${q}%`;

  const rows = await prisma.$queryRaw<SearchHashtagRow[]>`
    SELECT
      h.tag_name,
      COUNT(DISTINCT p.post_id)::int AS post_count
    FROM hashtags h
    JOIN post_hashtags ph ON ph.hashtag_id = h.hashtag_id
    JOIN posts p ON p.post_id = ph.post_id
    JOIN users au ON au.user_id = p.author_user_id
    WHERE h.tag_name ILIKE ${pattern}
      AND (
        p.author_user_id = ${currentUserId}
        OR (
          (
            p.visibility = CAST('public' AS "PostVisibility")
            OR (
              p.visibility = CAST('followers' AS "PostVisibility")
              AND EXISTS (
                SELECT 1
                FROM follows f
                WHERE f.follower_user_id = ${currentUserId}
                  AND f.followed_user_id = p.author_user_id
              )
            )
          )
          AND (
            NOT au.is_private
            OR EXISTS (
              SELECT 1
              FROM follows f
              WHERE f.follower_user_id = ${currentUserId}
                AND f.followed_user_id = p.author_user_id
            )
          )
        )
      )
    GROUP BY h.tag_name
    ORDER BY post_count DESC, h.tag_name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return rows.map((r) => ({
    hashtag: r.tag_name,
    postCount: r.post_count,
  }));
}

router.get('/users', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;

  const q = (req.query.q as string | undefined)?.trim() ?? '';
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  if (!q) {
    return res.status(200).json([]);
  }

  try {
    const users = await searchUsers(currentUserId, q, limit, offset);
    return res.status(200).json(users);
  } catch (err) {
    console.error('Error searching users:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/all', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;

  const q = (req.query.q as string | undefined)?.trim() ?? '';
  const usersLimit = Math.min(Math.max(parseInt(req.query.usersLimit as string, 10) || 20, 1), 50);
  const hashtagsLimit = Math.min(Math.max(parseInt(req.query.hashtagsLimit as string, 10) || 20, 1), 50);
  const usersOffset = parsePaging(req.query.usersOffset as string | undefined, 0, 1000);
  const hashtagsOffset = parsePaging(req.query.hashtagsOffset as string | undefined, 0, 1000);

  if (!q) {
    return res.status(200).json({ users: [], hashtags: [] });
  }

  try {
    const [users, hashtags] = await Promise.all([
      searchUsers(currentUserId, q, usersLimit, usersOffset),
      searchHashtags(currentUserId, q, hashtagsLimit, hashtagsOffset),
    ]);

    return res.status(200).json({ users, hashtags });
  } catch (err) {
    console.error('Error searching users and hashtags:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
