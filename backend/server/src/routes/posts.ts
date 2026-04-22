import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { deleteManagedPostMediaByUrl } from '../lib/objectStorage';
import {
  notifyCommentReply,
  notifyPostComment,
  syncCommentLikeNotification,
  syncPostLikeNotification,
} from '../lib/notifications';

const router = express.Router();
router.use(authenticateToken);

type DbPostType = 'general' | 'opportunity' | 'event' | 'club_activity';
type DbOpportunityType = 'internship' | 'hackathon' | 'event' | 'contest' | 'club';
type DbPostVisibility = 'public' | 'followers' | 'club_members';

interface FeedPostRow {
  post_id: string;
  author_user_id: string;
  author_username: string;
  author_profile_photo_url: string | null;
  club_id: string | null;
  post_type: DbPostType;
  opportunity_type: DbOpportunityType | null;
  title: string | null;
  content_text: string | null;
  company_name: string | null;
  application_deadline: Date | null;
  stipend: string | null;
  duration: string | null;
  event_date: Date | null;
  location: string | null;
  external_url: string | null;
  visibility: DbPostVisibility;
  hashtags: string[] | null;
  media: unknown;
  like_count: number;
  comment_count: number;
  save_count: number;
  is_liked_by_me: boolean;
  is_saved_by_me: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CommentRow {
  comment_id: string;
  post_id: string;
  author_user_id: string;
  author_username: string;
  author_profile_photo_url: string | null;
  post_author_user_id: string;
  parent_comment_id: string | null;
  content: string;
  like_count: number;
  is_liked_by_me: boolean;
  created_at: Date;
  updated_at: Date;
}

interface PostMediaResponse {
  postMediaId: string;
  mediaUrl: string;
  mediaType: string;
  sortOrder: number;
}

interface PostCommentResponse {
  id: string;
  postId: string;
  authorUserId: string;
  authorUsername: string;
  authorProfilePictureUrl: string | null;
  parentCommentId: string | null;
  content: string;
  likeCount: number;
  isLikedByMe: boolean;
  canDelete: boolean;
  replies: PostCommentResponse[];
  createdAt: string;
  updatedAt: string;
}

interface FeedPostResponse {
  id: string;
  authorUserId: string;
  authorUsername: string;
  authorProfilePictureUrl: string | null;
  clubId: string | null;
  postType: DbPostType;
  opportunityType: DbOpportunityType | null;
  title: string | null;
  contentText: string | null;
  company: string | null;
  deadline: string | null;
  stipend: string | null;
  duration: string | null;
  eventDate: string | null;
  location: string | null;
  externalUrl: string | null;
  visibility: DbPostVisibility;
  hashtags: string[];
  media: PostMediaResponse[];
  likeCount: number;
  commentCount: number;
  saveCount: number;
  isLikedByMe: boolean;
  isSavedByMe: boolean;
  canEdit: boolean;
  canDelete: boolean;
  comments: PostCommentResponse[];
  createdAt: string;
  updatedAt: string;
}

function normalizeHashtag(rawTag: string): string | null {
  const compact = rawTag.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
  if (!compact) return null;
  if (compact.length > 100) return null;
  if (!/^[a-z0-9_][a-z0-9_-]*$/.test(compact)) return null;
  return compact;
}

function normalizeHashtags(rawTags?: string[]): string[] {
  if (!Array.isArray(rawTags)) return [];
  const unique = new Set<string>();

  for (const tag of rawTags) {
    const normalized = normalizeHashtag(String(tag));
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function parseMedia(rawMedia: unknown): PostMediaResponse[] {
  let source: unknown = rawMedia;
  if (typeof rawMedia === 'string') {
    try {
      source = JSON.parse(rawMedia) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const media = item as Record<string, unknown>;
      if (
        typeof media.postMediaId !== 'string' ||
        typeof media.mediaUrl !== 'string' ||
        typeof media.mediaType !== 'string' ||
        typeof media.sortOrder !== 'number'
      ) {
        return null;
      }

      return {
        postMediaId: media.postMediaId,
        mediaUrl: media.mediaUrl,
        mediaType: media.mediaType,
        sortOrder: media.sortOrder,
      };
    })
    .filter((item): item is PostMediaResponse => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapCommentRows(rows: CommentRow[], viewerUserId: string): PostCommentResponse[] {
  const byId = new Map<string, PostCommentResponse>();
  const roots: PostCommentResponse[] = [];

  for (const row of rows) {
    byId.set(row.comment_id, {
      id: row.comment_id,
      postId: row.post_id,
      authorUserId: row.author_user_id,
      authorUsername: row.author_username,
      authorProfilePictureUrl: row.author_profile_photo_url,
      parentCommentId: row.parent_comment_id,
      content: row.content,
      likeCount: row.like_count,
      isLikedByMe: row.is_liked_by_me,
      canDelete: row.author_user_id === viewerUserId || row.post_author_user_id === viewerUserId,
      replies: [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }

  for (const comment of byId.values()) {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId)!.replies.push(comment);
    } else {
      roots.push(comment);
    }
  }

  return roots;
}

async function canViewerAccessAuthorPosts(viewerUserId: string, authorUserId: string): Promise<boolean> {
  if (viewerUserId === authorUserId) {
    return true;
  }

  const rows = await prisma.$queryRaw<{ is_private: boolean; is_follower: boolean }[]>`
    SELECT
      u.is_private,
      EXISTS(
        SELECT 1
        FROM follows f
        WHERE f.follower_user_id = ${viewerUserId}
          AND f.followed_user_id = u.user_id
      ) AS is_follower
    FROM users u
    WHERE u.user_id = ${authorUserId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return false;
  if (!row.is_private) return true;
  return row.is_follower;
}

async function canViewerAccessPost(viewerUserId: string, postId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ visible_to_viewer: boolean }[]>`
    SELECT
      (
        p.author_user_id = ${viewerUserId}
        OR (
          (
            p.visibility = CAST('public' AS "PostVisibility")
            OR (
              p.visibility = CAST('followers' AS "PostVisibility")
              AND EXISTS (
                SELECT 1
                FROM follows f
                WHERE f.follower_user_id = ${viewerUserId}
                  AND f.followed_user_id = p.author_user_id
              )
            )
          )
          AND (
            NOT au.is_private
            OR EXISTS (
              SELECT 1
              FROM follows f
              WHERE f.follower_user_id = ${viewerUserId}
                AND f.followed_user_id = p.author_user_id
            )
          )
        )
      ) AS visible_to_viewer
    FROM posts p
    JOIN users au ON au.user_id = p.author_user_id
    WHERE p.post_id = ${postId}
    LIMIT 1
  `;

  return Boolean(rows[0]?.visible_to_viewer);
}

async function fetchCommentsForPost(postId: string, viewerUserId: string): Promise<PostCommentResponse[]> {
  const rows = await prisma.$queryRaw<CommentRow[]>`
    SELECT
      c.comment_id,
      c.post_id,
      c.author_user_id,
      u.username AS author_username,
      u.profile_photo_url AS author_profile_photo_url,
      p.author_user_id AS post_author_user_id,
      c.parent_comment_id,
      c.content,
      (SELECT COUNT(*)::int FROM post_comment_likes pcl WHERE pcl.comment_id = c.comment_id) AS like_count,
      EXISTS(
        SELECT 1
        FROM post_comment_likes pcl
        WHERE pcl.comment_id = c.comment_id AND pcl.user_id = ${viewerUserId}
      ) AS is_liked_by_me,
      c.created_at,
      c.updated_at
    FROM post_comments c
    JOIN users u ON u.user_id = c.author_user_id
    JOIN posts p ON p.post_id = c.post_id
    WHERE c.post_id = ${postId}
    ORDER BY c.created_at ASC
  `;

  return mapCommentRows(rows, viewerUserId);
}

async function mapFeedRows(rows: FeedPostRow[], viewerUserId: string): Promise<FeedPostResponse[]> {
  const mapped: FeedPostResponse[] = [];
  for (const row of rows) {
    mapped.push({
      id: row.post_id,
      authorUserId: row.author_user_id,
      authorUsername: row.author_username,
      authorProfilePictureUrl: row.author_profile_photo_url,
      clubId: row.club_id,
      postType: row.post_type,
      opportunityType: row.opportunity_type,
      title: row.title,
      contentText: row.content_text,
      company: row.company_name,
      deadline: row.application_deadline ? row.application_deadline.toISOString() : null,
      stipend: row.stipend,
      duration: row.duration,
      eventDate: row.event_date ? row.event_date.toISOString() : null,
      location: row.location,
      externalUrl: row.external_url,
      visibility: row.visibility,
      hashtags: row.hashtags ?? [],
      media: parseMedia(row.media),
      likeCount: row.like_count,
      commentCount: row.comment_count,
      saveCount: row.save_count,
      isLikedByMe: row.is_liked_by_me,
      isSavedByMe: row.is_saved_by_me,
      canEdit: row.author_user_id === viewerUserId,
      canDelete: row.author_user_id === viewerUserId,
      comments: await fetchCommentsForPost(row.post_id, viewerUserId),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }
  return mapped;
}

async function fetchPostRowsByQuery(
  viewerUserId: string,
  query: { followedFeed?: boolean; authorUserId?: string; hashtag?: string; limit: number; offset: number },
): Promise<FeedPostRow[]> {
  const hashtagPattern = query.hashtag ? query.hashtag.trim().toLowerCase() : null;

  if (query.followedFeed) {
    return prisma.$queryRaw<FeedPostRow[]>`
      SELECT
        p.post_id,
        p.author_user_id,
        au.username AS author_username,
        au.profile_photo_url AS author_profile_photo_url,
        p.club_id,
        p.post_type,
        p.opportunity_type,
        p.title,
        p.content_text,
        p.company_name,
        p.application_deadline,
        p.stipend,
        p.duration,
        p.event_date,
        p.location,
        p.external_url,
        p.visibility,
        COALESCE(
          (
            SELECT ARRAY_AGG(h.tag_name ORDER BY h.tag_name)
            FROM post_hashtags ph
            JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
            WHERE ph.post_id = p.post_id
          ),
          ARRAY[]::text[]
        ) AS hashtags,
        COALESCE(
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'postMediaId', pm.post_media_id,
                'mediaUrl', pm.media_url,
                'mediaType', pm.media_type,
                'sortOrder', pm.sort_order
              )
              ORDER BY pm.sort_order ASC, pm.created_at ASC
            )
            FROM post_media pm
            WHERE pm.post_id = p.post_id
          ),
          '[]'::json
        ) AS media,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
        (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comment_count,
        (SELECT COUNT(*)::int FROM post_saves ps WHERE ps.post_id = p.post_id) AS save_count,
        EXISTS(SELECT 1 FROM post_likes plm WHERE plm.post_id = p.post_id AND plm.user_id = ${viewerUserId}) AS is_liked_by_me,
        EXISTS(SELECT 1 FROM post_saves psm WHERE psm.post_id = p.post_id AND psm.user_id = ${viewerUserId}) AS is_saved_by_me,
        p.created_at,
        p.updated_at
      FROM posts p
      JOIN users au ON au.user_id = p.author_user_id
      WHERE (
        p.author_user_id = ${viewerUserId}
        OR (
          EXISTS (
            SELECT 1
            FROM follows f
            WHERE f.follower_user_id = ${viewerUserId}
              AND f.followed_user_id = p.author_user_id
          )
          AND p.visibility IN (CAST('public' AS "PostVisibility"), CAST('followers' AS "PostVisibility"))
        )
      )
      AND (
        ${hashtagPattern}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM post_hashtags ph
          JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
          WHERE ph.post_id = p.post_id
            AND h.tag_name ILIKE ${hashtagPattern ? `%${hashtagPattern}%` : null}
        )
      )
      ORDER BY p.created_at DESC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    `;
  }

  return prisma.$queryRaw<FeedPostRow[]>`
    SELECT
      p.post_id,
      p.author_user_id,
      au.username AS author_username,
      au.profile_photo_url AS author_profile_photo_url,
      p.club_id,
      p.post_type,
      p.opportunity_type,
      p.title,
      p.content_text,
      p.company_name,
      p.application_deadline,
      p.stipend,
      p.duration,
      p.event_date,
      p.location,
      p.external_url,
      p.visibility,
      COALESCE(
        (
          SELECT ARRAY_AGG(h.tag_name ORDER BY h.tag_name)
          FROM post_hashtags ph
          JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
          WHERE ph.post_id = p.post_id
        ),
        ARRAY[]::text[]
      ) AS hashtags,
      COALESCE(
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'postMediaId', pm.post_media_id,
              'mediaUrl', pm.media_url,
              'mediaType', pm.media_type,
              'sortOrder', pm.sort_order
            )
            ORDER BY pm.sort_order ASC, pm.created_at ASC
          )
          FROM post_media pm
          WHERE pm.post_id = p.post_id
        ),
        '[]'::json
      ) AS media,
      (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
      (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comment_count,
      (SELECT COUNT(*)::int FROM post_saves ps WHERE ps.post_id = p.post_id) AS save_count,
      EXISTS(SELECT 1 FROM post_likes plm WHERE plm.post_id = p.post_id AND plm.user_id = ${viewerUserId}) AS is_liked_by_me,
      EXISTS(SELECT 1 FROM post_saves psm WHERE psm.post_id = p.post_id AND psm.user_id = ${viewerUserId}) AS is_saved_by_me,
      p.created_at,
      p.updated_at
    FROM posts p
    JOIN users au ON au.user_id = p.author_user_id
    WHERE p.author_user_id = ${query.authorUserId ?? viewerUserId}
    AND (
      p.author_user_id = ${viewerUserId}
      OR (
        (
          p.visibility = CAST('public' AS "PostVisibility")
          OR (
            p.visibility = CAST('followers' AS "PostVisibility")
            AND EXISTS (
              SELECT 1
              FROM follows f
              WHERE f.follower_user_id = ${viewerUserId}
                AND f.followed_user_id = p.author_user_id
            )
          )
        )
        AND (
          NOT au.is_private
          OR EXISTS (
            SELECT 1
            FROM follows f
            WHERE f.follower_user_id = ${viewerUserId}
              AND f.followed_user_id = p.author_user_id
          )
        )
      )
    )
    AND (
      ${hashtagPattern}::text IS NULL
      OR EXISTS (
        SELECT 1
        FROM post_hashtags ph
        JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
        WHERE ph.post_id = p.post_id
          AND h.tag_name ILIKE ${hashtagPattern ? `%${hashtagPattern}%` : null}
      )
    )
    ORDER BY p.created_at DESC
    LIMIT ${query.limit}
    OFFSET ${query.offset}
  `;
}

router.get('/posts/feed', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const hashtag = (req.query.hashtag as string | undefined)?.trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  try {
    const rows = await fetchPostRowsByQuery(viewerUserId, {
      followedFeed: true,
      hashtag,
      limit,
      offset,
    });
    return res.status(200).json(await mapFeedRows(rows, viewerUserId));
  } catch (err) {
    console.error('Error fetching feed posts:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/posts/:postId', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;

  try {
    const rows = await prisma.$queryRaw<FeedPostRow[]>`
      SELECT
        p.post_id,
        p.author_user_id,
        au.username AS author_username,
        au.profile_photo_url AS author_profile_photo_url,
        p.club_id,
        p.post_type,
        p.opportunity_type,
        p.title,
        p.content_text,
        p.company_name,
        p.application_deadline,
        p.stipend,
        p.duration,
        p.event_date,
        p.location,
        p.external_url,
        p.visibility,
        COALESCE(
          (
            SELECT ARRAY_AGG(h.tag_name ORDER BY h.tag_name)
            FROM post_hashtags ph
            JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
            WHERE ph.post_id = p.post_id
          ),
          ARRAY[]::text[]
        ) AS hashtags,
        COALESCE(
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'postMediaId', pm.post_media_id,
                'mediaUrl', pm.media_url,
                'mediaType', pm.media_type,
                'sortOrder', pm.sort_order
              )
              ORDER BY pm.sort_order ASC, pm.created_at ASC
            )
            FROM post_media pm
            WHERE pm.post_id = p.post_id
          ),
          '[]'::json
        ) AS media,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
        (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comment_count,
        (SELECT COUNT(*)::int FROM post_saves ps WHERE ps.post_id = p.post_id) AS save_count,
        EXISTS(SELECT 1 FROM post_likes plm WHERE plm.post_id = p.post_id AND plm.user_id = ${viewerUserId}) AS is_liked_by_me,
        EXISTS(SELECT 1 FROM post_saves psm WHERE psm.post_id = p.post_id AND psm.user_id = ${viewerUserId}) AS is_saved_by_me,
        p.created_at,
        p.updated_at
      FROM posts p
      JOIN users au ON au.user_id = p.author_user_id
      WHERE p.post_id = ${postId}
        AND (
          p.author_user_id = ${viewerUserId}
          OR (
            (
              p.visibility = CAST('public' AS "PostVisibility")
              OR (
                p.visibility = CAST('followers' AS "PostVisibility")
                AND EXISTS (
                  SELECT 1
                  FROM follows f
                  WHERE f.follower_user_id = ${viewerUserId}
                    AND f.followed_user_id = p.author_user_id
                )
              )
            )
            AND (
              NOT au.is_private
              OR EXISTS (
                SELECT 1
                FROM follows f
                WHERE f.follower_user_id = ${viewerUserId}
                  AND f.followed_user_id = p.author_user_id
              )
            )
          )
        )
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'Post not found or not accessible' });
    }

    const mapped = await mapFeedRows([row], viewerUserId);
    return res.status(200).json(mapped[0]);
  } catch (err) {
    console.error('Error fetching post by id:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/users/:userId/posts', async (req: Request<{ userId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { userId: authorUserId } = req.params;
  const hashtag = (req.query.hashtag as string | undefined)?.trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  try {
    const canAccess = await canViewerAccessAuthorPosts(viewerUserId, authorUserId);
    if (!canAccess) {
      return res.status(403).json({ message: 'You are not allowed to view posts for this profile' });
    }

    const rows = await fetchPostRowsByQuery(viewerUserId, {
      authorUserId,
      hashtag,
      limit,
      offset,
    });
    return res.status(200).json(await mapFeedRows(rows, viewerUserId));
  } catch (err) {
    console.error('Error fetching profile posts:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/posts/:postId', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;
  const {
    title,
    contentText,
    company,
    deadline,
    stipend,
    duration,
    eventDate,
    location,
    externalUrl,
    hashtags,
  } = req.body as {
    title?: string;
    contentText?: string;
    company?: string;
    deadline?: string;
    stipend?: string;
    duration?: string;
    eventDate?: string;
    location?: string;
    externalUrl?: string;
    hashtags?: string[];
  };

  try {
    const postRows = await prisma.$queryRaw<{ author_user_id: string }[]>`
      SELECT author_user_id
      FROM posts
      WHERE post_id = ${postId}
      LIMIT 1
    `;
    const post = postRows[0];
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.author_user_id !== viewerUserId) {
      return res.status(403).json({ message: 'Only the post owner can edit this post' });
    }

    const titleValue = title?.trim() || null;
    const contentValue = contentText?.trim() || null;
    const companyValue = company?.trim() || null;
    const stipendValue = stipend?.trim() || null;
    const durationValue = duration?.trim() || null;
    const locationValue = location?.trim() || null;
    const externalUrlValue = externalUrl?.trim() || null;

    if (!titleValue && !contentValue) {
      return res.status(400).json({ message: 'At least one of title or contentText is required' });
    }

    const deadlineValue = deadline ? new Date(deadline) : null;
    if (deadline && Number.isNaN(deadlineValue?.getTime())) {
      return res.status(400).json({ message: 'deadline must be a valid date string' });
    }
    const eventDateValue = eventDate ? new Date(eventDate) : null;
    if (eventDate && Number.isNaN(eventDateValue?.getTime())) {
      return res.status(400).json({ message: 'eventDate must be a valid date string' });
    }

    const normalizedHashtags = normalizeHashtags(hashtags);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        UPDATE posts
        SET
          title = ${titleValue},
          content_text = ${contentValue},
          company_name = ${companyValue},
          application_deadline = ${deadlineValue},
          stipend = ${stipendValue},
          duration = ${durationValue},
          event_date = ${eventDateValue},
          location = ${locationValue},
          external_url = ${externalUrlValue},
          updated_at = NOW()
        WHERE post_id = ${postId}
      `;

      if (hashtags !== undefined) {
        await tx.$queryRaw`DELETE FROM post_hashtags WHERE post_id = ${postId}`;

        for (const tagName of normalizedHashtags) {
          const hashtagRows = await tx.$queryRaw<{ hashtag_id: string }[]>`
            INSERT INTO hashtags (tag_name)
            VALUES (${tagName})
            ON CONFLICT (tag_name)
            DO UPDATE SET tag_name = EXCLUDED.tag_name
            RETURNING hashtag_id
          `;

          const hashtagId = hashtagRows[0]?.hashtag_id;
          if (hashtagId) {
            await tx.$queryRaw`
              INSERT INTO post_hashtags (post_id, hashtag_id)
              VALUES (${postId}, ${hashtagId})
              ON CONFLICT (post_id, hashtag_id) DO NOTHING
            `;
          }
        }
      }
    });

    return res.status(200).json({ message: 'Post updated successfully' });
  } catch (err) {
    console.error('Error updating post:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/posts/:postId', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;

  try {
    const postRows = await prisma.$queryRaw<{ author_user_id: string }[]>`
      SELECT author_user_id
      FROM posts
      WHERE post_id = ${postId}
      LIMIT 1
    `;
    const post = postRows[0];
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.author_user_id !== viewerUserId) {
      return res.status(403).json({ message: 'Only the post owner can delete this post' });
    }

    const mediaRows = await prisma.$queryRaw<{ media_url: string }[]>`
      SELECT media_url
      FROM post_media
      WHERE post_id = ${postId}
    `;

    await prisma.$queryRaw`
      DELETE FROM posts
      WHERE post_id = ${postId}
    `;

    await Promise.allSettled(
      mediaRows.map(async (item) => {
        await deleteManagedPostMediaByUrl(item.media_url);
      }),
    );

    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting post:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/:postId/likes', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;

  try {
    if (!(await canViewerAccessPost(viewerUserId, postId))) {
      return res.status(403).json({ message: 'You are not allowed to interact with this post' });
    }

    await prisma.$queryRaw`
      INSERT INTO post_likes (user_id, post_id)
      VALUES (${viewerUserId}, ${postId})
      ON CONFLICT (user_id, post_id) DO NOTHING
    `;

    await syncPostLikeNotification({ postId, actorUserId: viewerUserId });
    return res.status(204).send();
  } catch (err) {
    console.error('Error liking post:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/posts/:postId/likes', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;

  try {
    await prisma.$queryRaw`
      DELETE FROM post_likes
      WHERE user_id = ${viewerUserId} AND post_id = ${postId}
    `;
    await syncPostLikeNotification({ postId, actorUserId: viewerUserId });
    return res.status(204).send();
  } catch (err) {
    console.error('Error unliking post:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/:postId/saves', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;

  try {
    if (!(await canViewerAccessPost(viewerUserId, postId))) {
      return res.status(403).json({ message: 'You are not allowed to interact with this post' });
    }

    await prisma.$queryRaw`
      INSERT INTO post_saves (user_id, post_id)
      VALUES (${viewerUserId}, ${postId})
      ON CONFLICT (user_id, post_id) DO NOTHING
    `;
    return res.status(204).send();
  } catch (err) {
    console.error('Error saving post:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/posts/:postId/saves', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;

  try {
    await prisma.$queryRaw`
      DELETE FROM post_saves
      WHERE user_id = ${viewerUserId} AND post_id = ${postId}
    `;
    return res.status(204).send();
  } catch (err) {
    console.error('Error unsaving post:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/posts/comments/:commentId/context', async (req: Request<{ commentId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { commentId } = req.params;

  try {
    const rows = await prisma.$queryRaw<{ comment_id: string; post_id: string; parent_comment_id: string | null }[]>`
      SELECT comment_id, post_id, parent_comment_id
      FROM post_comments
      WHERE comment_id = ${commentId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (!(await canViewerAccessPost(viewerUserId, row.post_id))) {
      return res.status(403).json({ message: 'You are not allowed to view this comment' });
    }

    return res.status(200).json({
      commentId: row.comment_id,
      postId: row.post_id,
      parentCommentId: row.parent_comment_id,
    });
  } catch (err) {
    console.error('Error fetching comment context:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/:postId/comments', async (req: Request<{ postId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { postId } = req.params;
  const { content } = req.body as { content?: string };

  if (!content?.trim()) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  try {
    if (!(await canViewerAccessPost(viewerUserId, postId))) {
      return res.status(403).json({ message: 'You are not allowed to interact with this post' });
    }

    const rows = await prisma.$queryRaw<{ comment_id: string }[]>`
      INSERT INTO post_comments (post_id, author_user_id, content)
      VALUES (${postId}, ${viewerUserId}, ${content.trim()})
      RETURNING comment_id
    `;
    const createdCommentId = rows[0]?.comment_id;
    if (!createdCommentId) {
      return res.status(500).json({ message: 'Failed to create comment' });
    }

    await notifyPostComment({ postId, commentId: createdCommentId, actorUserId: viewerUserId });

    return res.status(201).json({ commentId: createdCommentId });
  } catch (err) {
    console.error('Error creating comment:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/comments/:commentId/replies', async (req: Request<{ commentId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { commentId } = req.params;
  const { content } = req.body as { content?: string };

  if (!content?.trim()) {
    return res.status(400).json({ message: 'Reply content is required' });
  }

  try {
    const parentRows = await prisma.$queryRaw<{ post_id: string }[]>`
      SELECT post_id
      FROM post_comments
      WHERE comment_id = ${commentId}
      LIMIT 1
    `;
    const parent = parentRows[0];
    if (!parent) {
      return res.status(404).json({ message: 'Parent comment not found' });
    }

    if (!(await canViewerAccessPost(viewerUserId, parent.post_id))) {
      return res.status(403).json({ message: 'You are not allowed to interact with this post' });
    }

    const rows = await prisma.$queryRaw<{ comment_id: string }[]>`
      INSERT INTO post_comments (post_id, author_user_id, parent_comment_id, content)
      VALUES (${parent.post_id}, ${viewerUserId}, ${commentId}, ${content.trim()})
      RETURNING comment_id
    `;
    const createdReplyId = rows[0]?.comment_id;
    if (!createdReplyId) {
      return res.status(500).json({ message: 'Failed to create reply' });
    }

    await notifyCommentReply({
      parentCommentId: commentId,
      replyCommentId: createdReplyId,
      actorUserId: viewerUserId,
    });
    return res.status(201).json({ commentId: createdReplyId });
  } catch (err) {
    console.error('Error creating reply:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/posts/comments/:commentId', async (req: Request<{ commentId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { commentId } = req.params;

  try {
    const rows = await prisma.$queryRaw<{ author_user_id: string; post_author_user_id: string }[]>`
      SELECT
        c.author_user_id,
        p.author_user_id AS post_author_user_id
      FROM post_comments c
      JOIN posts p ON p.post_id = c.post_id
      WHERE c.comment_id = ${commentId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const canDelete = row.author_user_id === viewerUserId || row.post_author_user_id === viewerUserId;
    if (!canDelete) {
      return res.status(403).json({ message: 'You are not allowed to delete this comment' });
    }

    await prisma.$queryRaw`
      DELETE FROM post_comments
      WHERE comment_id = ${commentId}
    `;
    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting comment:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/comments/:commentId/likes', async (req: Request<{ commentId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { commentId } = req.params;

  try {
    const rows = await prisma.$queryRaw<{ post_id: string }[]>`
      SELECT post_id
      FROM post_comments
      WHERE comment_id = ${commentId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (!(await canViewerAccessPost(viewerUserId, row.post_id))) {
      return res.status(403).json({ message: 'You are not allowed to interact with this comment' });
    }

    await prisma.$queryRaw`
      INSERT INTO post_comment_likes (user_id, comment_id)
      VALUES (${viewerUserId}, ${commentId})
      ON CONFLICT (user_id, comment_id) DO NOTHING
    `;
    await syncCommentLikeNotification({ commentId, actorUserId: viewerUserId });
    return res.status(204).send();
  } catch (err) {
    console.error('Error liking comment:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/posts/comments/:commentId/likes', async (req: Request<{ commentId: string }>, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const viewerUserId = authed.auth!.userId;
  const { commentId } = req.params;

  try {
    await prisma.$queryRaw`
      DELETE FROM post_comment_likes
      WHERE user_id = ${viewerUserId} AND comment_id = ${commentId}
    `;
    await syncCommentLikeNotification({ commentId, actorUserId: viewerUserId });
    return res.status(204).send();
  } catch (err) {
    console.error('Error unliking comment:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
