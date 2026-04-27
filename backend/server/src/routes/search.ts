import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { getUserSummariesByIds, toCachedUserCard } from '../lib/userCache';

const router = express.Router();

router.use(authenticateToken);

interface SearchHashtagRow {
  tag_name: string;
  post_count: number;
}

interface SearchClubRow {
  club_id: string;
  name: string;
  slug: string;
  short_description: string | null;
  avatar_url: string | null;
  privacy: 'open' | 'request' | 'private';
  category_display_name: string | null;
  member_count: number;
}

function parsePaging(value: string | undefined, fallback: number, max: number): number {
  const parsed = parseInt(value ?? '', 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, 0), max);
}

async function searchUsers(currentUserId: string, q: string, limit: number, offset: number) {
  const pattern = `%${q}%`;

  const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT
      u.user_id
    FROM users u
    WHERE u.user_id <> ${currentUserId}
      AND (u.username ILIKE ${pattern} OR u.email ILIKE ${pattern})
    ORDER BY u.username
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const summaries = await getUserSummariesByIds(rows.map((row) => row.user_id));

  return rows
    .map((row) => summaries.get(row.user_id))
    .filter((summary): summary is NonNullable<typeof summary> => summary !== undefined)
    .map((summary) => {
      const card = toCachedUserCard(summary);
      return {
        userId: card.userId,
        username: card.username,
        email: card.email,
        profilePictureUrl: card.profilePictureUrl,
        isPrivate: card.isPrivate,
        type: card.type,
        branch: card.branch,
        year: card.year,
      };
    });
}

async function searchHashtags(currentUserId: string, q: string, limit: number, offset: number) {
  const normalized = q.trim().replace(/^#+/, '');
  if (!normalized) {
    return [];
  }

  const pattern = `%${normalized}%`;

  const rows = await prisma.$queryRaw<SearchHashtagRow[]>`
    SELECT
      h.tag_name,
      COUNT(DISTINCT p.post_id)::int AS post_count
    FROM hashtags h
    JOIN post_hashtags ph ON ph.hashtag_id = h.hashtag_id
    JOIN posts p ON p.post_id = ph.post_id
    JOIN users au ON au.user_id = p.author_user_id
    LEFT JOIN clubs c ON c.club_id = p.club_id
    WHERE h.tag_name ILIKE ${pattern}
      AND (
        p.author_user_id = ${currentUserId}
        OR (
          p.club_id IS NOT NULL
          AND (
            (
              p.visibility = CAST('club_members' AS "PostVisibility")
              AND EXISTS (
                SELECT 1
                FROM club_memberships cm
                WHERE cm.club_id = p.club_id
                  AND cm.user_id = ${currentUserId}
                  AND cm.status = CAST('active' AS "ClubMembershipStatus")
              )
            )
            OR (
              p.visibility = CAST('public' AS "PostVisibility")
              AND (
                c.privacy <> CAST('private' AS "ClubPrivacy")
                OR EXISTS (
                  SELECT 1
                  FROM club_memberships cm
                  WHERE cm.club_id = p.club_id
                    AND cm.user_id = ${currentUserId}
                    AND cm.status = CAST('active' AS "ClubMembershipStatus")
                )
              )
            )
          )
        )
        OR (
          p.club_id IS NULL
          AND (
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

async function searchClubs(currentUserId: string, q: string, limit: number, offset: number) {
  const pattern = `%${q}%`;

  const rows = await prisma.$queryRaw<SearchClubRow[]>`
    SELECT
      c.club_id,
      c.name,
      c.slug,
      c.short_description,
      c.avatar_url,
      c.privacy,
      cc.display_name AS category_display_name,
      (
        SELECT COUNT(*)::int
        FROM club_memberships cm
        WHERE cm.club_id = c.club_id
          AND cm.status = CAST('active' AS "ClubMembershipStatus")
      ) AS member_count
    FROM clubs c
    LEFT JOIN club_categories cc ON cc.club_category_id = c.primary_category_id
    WHERE (
      c.privacy <> CAST('private' AS "ClubPrivacy")
      OR EXISTS (
        SELECT 1
        FROM club_memberships cm_visible
        WHERE cm_visible.club_id = c.club_id
          AND cm_visible.user_id = ${currentUserId}
          AND cm_visible.status = CAST('active' AS "ClubMembershipStatus")
      )
    )
    AND (
      c.name ILIKE ${pattern}
      OR COALESCE(c.short_description, '') ILIKE ${pattern}
      OR EXISTS (
        SELECT 1
        FROM club_tags_on_clubs ctoc
        JOIN club_tags ct ON ct.club_tag_id = ctoc.club_tag_id
        WHERE ctoc.club_id = c.club_id
          AND ct.display_name ILIKE ${pattern}
      )
      OR COALESCE(cc.display_name, '') ILIKE ${pattern}
    )
    ORDER BY member_count DESC, c.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return rows.map((row) => ({
    clubId: row.club_id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    avatarUrl: row.avatar_url,
    privacy: row.privacy,
    category: row.category_display_name,
    memberCount: row.member_count,
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
  const clubsLimit = Math.min(Math.max(parseInt(req.query.clubsLimit as string, 10) || 12, 1), 50);
  const usersOffset = parsePaging(req.query.usersOffset as string | undefined, 0, 1000);
  const hashtagsOffset = parsePaging(req.query.hashtagsOffset as string | undefined, 0, 1000);
  const clubsOffset = parsePaging(req.query.clubsOffset as string | undefined, 0, 1000);

  if (!q) {
    return res.status(200).json({ users: [], hashtags: [], clubs: [] });
  }

  try {
    const [users, hashtags, clubs] = await Promise.all([
      searchUsers(currentUserId, q, usersLimit, usersOffset),
      searchHashtags(currentUserId, q, hashtagsLimit, hashtagsOffset),
      searchClubs(currentUserId, q, clubsLimit, clubsOffset),
    ]);

    return res.status(200).json({ users, hashtags, clubs });
  } catch (err) {
    console.error('Error searching users and hashtags:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
