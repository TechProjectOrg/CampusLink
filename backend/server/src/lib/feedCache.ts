import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import {
  cacheDelete,
  cacheGetJson,
  cacheHGetAll,
  cacheHashSet,
  cacheIncrement,
  cacheMGetJson,
  cacheSetJson,
  cacheZAdd,
  cacheZAddMany,
  cacheZRem,
  cacheZRevRange,
} from './cache';
import { getUserSummariesByIds } from './userCache';

export type DbPostType = 'general' | 'opportunity' | 'event' | 'club_activity';
export type DbOpportunityType = 'internship' | 'hackathon' | 'event' | 'contest' | 'club';
export type DbPostVisibility = 'public' | 'followers' | 'club_members';

export interface FeedPostRow {
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

export interface CommentRow {
  comment_id: string;
  post_id: string;
  author_user_id: string;
  author_username: string;
  author_profile_photo_url: string | null;
  post_author_user_id: string;
  parent_comment_id: string | null;
  content: string;
  like_count: number;
  reply_count: number;
  is_liked_by_me: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PostMediaResponse {
  postMediaId: string;
  mediaUrl: string;
  mediaType: string;
  sortOrder: number;
}

export interface PostCommentResponse {
  id: string;
  postId: string;
  authorUserId: string;
  authorUsername: string;
  authorProfilePictureUrl: string | null;
  parentCommentId: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  isLikedByMe: boolean;
  canDelete: boolean;
  replies: PostCommentResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface FeedPostResponse {
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

interface PostSnapshot {
  postId: string;
  authorUserId: string;
  clubId: string | null;
  postType: DbPostType;
  opportunityType: DbOpportunityType | null;
  title: string | null;
  contentText: string | null;
  companyName: string | null;
  applicationDeadline: string | null;
  stipend: string | null;
  duration: string | null;
  eventDate: string | null;
  location: string | null;
  externalUrl: string | null;
  visibility: DbPostVisibility;
  hashtags: string[];
  media: PostMediaResponse[];
  createdAt: string;
  updatedAt: string;
}

interface EngagementSnapshot {
  likeCount: number;
  commentCount: number;
  saveCount: number;
}

interface PostIdRow {
  post_id: string;
  created_at: Date;
}

const POST_SNAPSHOT_TTL_SECONDS = 60 * 60 * 24 * 30;
const FEED_IDS_TTL_SECONDS = 60 * 60 * 6;
const RECENT_COMMENTS_TTL_SECONDS = 60 * 10;
const PREVIEW_COMMENT_LIMIT = 3;

function feedKey(userId: string): string {
  return `feed:user:${userId}:ids`;
}

function feedWarmedKey(userId: string): string {
  return `${feedKey(userId)}:warmed`;
}

export async function invalidateUserFeedCache(userId: string): Promise<void> {
  await cacheDelete(feedKey(userId), feedWarmedKey(userId));
}

function postSnapshotKey(postId: string): string {
  return `post:${postId}:snapshot`;
}

function engagementKey(postId: string): string {
  return `post:${postId}:engagement`;
}

function recentCommentsKey(postId: string): string {
  return `post:${postId}:recent_comments`;
}

function likedByKey(postId: string, userId: string): string {
  return `post:${postId}:liked_by:${userId}`;
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

function snapshotFromRow(row: FeedPostRow): PostSnapshot {
  return {
    postId: row.post_id,
    authorUserId: row.author_user_id,
    clubId: row.club_id,
    postType: row.post_type,
    opportunityType: row.opportunity_type,
    title: row.title,
    contentText: row.content_text,
    companyName: row.company_name,
    applicationDeadline: row.application_deadline ? row.application_deadline.toISOString() : null,
    stipend: row.stipend,
    duration: row.duration,
    eventDate: row.event_date ? row.event_date.toISOString() : null,
    location: row.location,
    externalUrl: row.external_url,
    visibility: row.visibility,
    hashtags: row.hashtags ?? [],
    media: parseMedia(row.media),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowFromSnapshot(
  snapshot: PostSnapshot,
  author: { username: string; profilePictureUrl: string | null },
  engagement: EngagementSnapshot,
  viewerState: { isLiked: boolean; isSaved: boolean },
): FeedPostRow {
  return {
    post_id: snapshot.postId,
    author_user_id: snapshot.authorUserId,
    author_username: author.username,
    author_profile_photo_url: author.profilePictureUrl,
    club_id: snapshot.clubId,
    post_type: snapshot.postType,
    opportunity_type: snapshot.opportunityType,
    title: snapshot.title,
    content_text: snapshot.contentText,
    company_name: snapshot.companyName,
    application_deadline: snapshot.applicationDeadline ? new Date(snapshot.applicationDeadline) : null,
    stipend: snapshot.stipend,
    duration: snapshot.duration,
    event_date: snapshot.eventDate ? new Date(snapshot.eventDate) : null,
    location: snapshot.location,
    external_url: snapshot.externalUrl,
    visibility: snapshot.visibility,
    hashtags: snapshot.hashtags,
    media: snapshot.media,
    like_count: engagement.likeCount,
    comment_count: engagement.commentCount,
    save_count: engagement.saveCount,
    is_liked_by_me: viewerState.isLiked,
    is_saved_by_me: viewerState.isSaved,
    created_at: new Date(snapshot.createdAt),
    updated_at: new Date(snapshot.updatedAt),
  };
}

export function mapCommentRows(rows: CommentRow[], viewerUserId: string, threaded: boolean): PostCommentResponse[] {
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
      replyCount: row.reply_count,
      isLikedByMe: row.is_liked_by_me,
      canDelete: row.author_user_id === viewerUserId || row.post_author_user_id === viewerUserId,
      replies: [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }

  for (const comment of byId.values()) {
    if (threaded && comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId)!.replies.push(comment);
    } else {
      roots.push(comment);
    }
  }

  return roots;
}

function postSelectSql(viewerUserId: string): Prisma.Sql {
  return Prisma.sql`
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
  `;
}

function visibilitySql(viewerUserId: string): Prisma.Sql {
  return Prisma.sql`
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
    )
  `;
}

async function fetchPostRowsByIds(viewerUserId: string, postIds: string[]): Promise<FeedPostRow[]> {
  if (postIds.length === 0) return [];
  return prisma.$queryRaw<FeedPostRow[]>`
    ${postSelectSql(viewerUserId)}
    WHERE p.post_id IN (${Prisma.join(postIds)})
      AND ${visibilitySql(viewerUserId)}
  `;
}

async function fetchFeedIdRowsFromDb(viewerUserId: string, limit: number, offset: number): Promise<PostIdRow[]> {
  return prisma.$queryRaw<PostIdRow[]>`
    SELECT p.post_id, p.created_at
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
      p.author_user_id = ${viewerUserId}
      OR NOT au.is_private
      OR EXISTS (
        SELECT 1
        FROM follows f
        WHERE f.follower_user_id = ${viewerUserId}
          AND f.followed_user_id = p.author_user_id
      )
    )
    ORDER BY p.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

export async function fetchPostIdsByQuery(
  viewerUserId: string,
  query: { followedFeed?: boolean; authorUserId?: string; hashtag?: string; limit: number; offset: number },
): Promise<string[]> {
  const hashtagPattern = query.hashtag ? query.hashtag.trim().toLowerCase() : null;

  if (query.followedFeed && !hashtagPattern) {
    const warmed = await cacheGetJson<{ warmedAt: string }>(feedWarmedKey(viewerUserId));
    if (warmed) {
      const cached = await cacheZRevRange(feedKey(viewerUserId), query.offset, query.offset + query.limit - 1);
      if (cached) return cached;
    }

    const warmRows = await fetchFeedIdRowsFromDb(viewerUserId, Math.max(query.limit + query.offset, 100), 0);
    await cacheZAddMany(
      feedKey(viewerUserId),
      warmRows.map((row) => ({ score: row.created_at.getTime(), member: row.post_id })),
    );
    await cacheSetJson(feedWarmedKey(viewerUserId), { warmedAt: new Date().toISOString() }, FEED_IDS_TTL_SECONDS);
    return warmRows.slice(query.offset, query.offset + query.limit).map((row) => row.post_id);
  }

  if (query.followedFeed) {
    const rows = await prisma.$queryRaw<PostIdRow[]>`
      SELECT p.post_id, p.created_at
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
    return rows.map((row) => row.post_id);
  }

  const rows = await prisma.$queryRaw<PostIdRow[]>`
    SELECT p.post_id, p.created_at
    FROM posts p
    JOIN users au ON au.user_id = p.author_user_id
    WHERE p.author_user_id = ${query.authorUserId ?? viewerUserId}
      AND ${visibilitySql(viewerUserId)}
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
  return rows.map((row) => row.post_id);
}

async function getEngagement(postIds: string[]): Promise<Map<string, EngagementSnapshot>> {
  const result = new Map<string, EngagementSnapshot>();
  if (postIds.length === 0) return result;

  const cached = await Promise.all(postIds.map(async (postId) => [postId, await cacheHGetAll(engagementKey(postId))] as const));
  const missing: string[] = [];
  for (const [postId, value] of cached) {
    if (value) {
      result.set(postId, {
        likeCount: Number(value.likeCount ?? 0),
        commentCount: Number(value.commentCount ?? 0),
        saveCount: Number(value.saveCount ?? 0),
      });
    } else {
      missing.push(postId);
    }
  }

  if (missing.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ post_id: string; like_count: number; comment_count: number; save_count: number }>>`
      SELECT
        p.post_id,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
        (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comment_count,
        (SELECT COUNT(*)::int FROM post_saves ps WHERE ps.post_id = p.post_id) AS save_count
      FROM posts p
      WHERE p.post_id IN (${Prisma.join(missing)})
    `;

    for (const row of rows) {
      const engagement = {
        likeCount: row.like_count,
        commentCount: row.comment_count,
        saveCount: row.save_count,
      };
      result.set(row.post_id, engagement);
      await cacheHashSet(
        engagementKey(row.post_id),
        {
          likeCount: engagement.likeCount,
          commentCount: engagement.commentCount,
          saveCount: engagement.saveCount,
        },
        FEED_IDS_TTL_SECONDS,
      );
    }
  }

  return result;
}

async function getViewerState(viewerUserId: string, postIds: string[]): Promise<Map<string, { isLiked: boolean; isSaved: boolean }>> {
  const result = new Map<string, { isLiked: boolean; isSaved: boolean }>();
  if (postIds.length === 0) return result;

  const likedCache = await cacheMGetJson<boolean>(postIds.map((postId) => likedByKey(postId, viewerUserId)));
  const missingLiked = postIds.filter((_, index) => likedCache[index] === null);

  for (let index = 0; index < postIds.length; index += 1) {
    if (likedCache[index] !== null) {
      result.set(postIds[index], { isLiked: Boolean(likedCache[index]), isSaved: false });
    }
  }

  if (missingLiked.length > 0) {
    const likeRows = await prisma.$queryRaw<Array<{ post_id: string }>>`
      SELECT post_id
      FROM post_likes
      WHERE user_id = ${viewerUserId}
        AND post_id IN (${Prisma.join(missingLiked)})
    `;
    const liked = new Set(likeRows.map((row) => row.post_id));
    for (const postId of missingLiked) {
      const current = result.get(postId) ?? { isLiked: false, isSaved: false };
      current.isLiked = liked.has(postId);
      result.set(postId, current);
      await cacheSetJson(likedByKey(postId, viewerUserId), current.isLiked, FEED_IDS_TTL_SECONDS);
    }
  }

  const saveRows = await prisma.$queryRaw<Array<{ post_id: string }>>`
    SELECT post_id
    FROM post_saves
    WHERE user_id = ${viewerUserId}
      AND post_id IN (${Prisma.join(postIds)})
  `;
  const saved = new Set(saveRows.map((row) => row.post_id));
  for (const postId of postIds) {
    const current = result.get(postId) ?? { isLiked: false, isSaved: false };
    current.isSaved = saved.has(postId);
    result.set(postId, current);
  }

  return result;
}

export async function fetchRecentCommentsForPosts(postIds: string[], viewerUserId: string): Promise<Map<string, PostCommentResponse[]>> {
  const result = new Map<string, PostCommentResponse[]>();
  if (postIds.length === 0) return result;

  const cached = await cacheMGetJson<PostCommentResponse[]>(postIds.map(recentCommentsKey));
  const missing = postIds.filter((postId, index) => {
    const value = cached[index];
    if (value) result.set(postId, value);
    return value === null;
  });

  if (missing.length === 0) return result;

  const rows = await prisma.$queryRaw<CommentRow[]>`
    SELECT *
    FROM (
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
        (SELECT COUNT(*)::int FROM post_comments replies WHERE replies.parent_comment_id = c.comment_id) AS reply_count,
        EXISTS(
          SELECT 1
          FROM post_comment_likes pcl
          WHERE pcl.comment_id = c.comment_id AND pcl.user_id = ${viewerUserId}
        ) AS is_liked_by_me,
        c.created_at,
        c.updated_at,
        ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.created_at DESC) AS rn
      FROM post_comments c
      JOIN users u ON u.user_id = c.author_user_id
      JOIN posts p ON p.post_id = c.post_id
      WHERE c.post_id IN (${Prisma.join(missing)})
        AND c.parent_comment_id IS NULL
    ) recent
    WHERE rn <= ${PREVIEW_COMMENT_LIMIT}
    ORDER BY created_at ASC
  `;

  const grouped = new Map<string, CommentRow[]>();
  for (const row of rows) {
    grouped.set(row.post_id, [...(grouped.get(row.post_id) ?? []), row]);
  }

  for (const postId of missing) {
    const comments = mapCommentRows(grouped.get(postId) ?? [], viewerUserId, false);
    result.set(postId, comments);
    await cacheSetJson(recentCommentsKey(postId), comments, RECENT_COMMENTS_TTL_SECONDS);
  }

  return result;
}

export async function hydratePosts(viewerUserId: string, postIds: string[]): Promise<FeedPostResponse[]> {
  if (postIds.length === 0) return [];

  const snapshotKeys = postIds.map(postSnapshotKey);
  const cachedSnapshots = await cacheMGetJson<PostSnapshot>(snapshotKeys);
  const snapshots = new Map<string, PostSnapshot>();
  const missingIds: string[] = [];

  for (let index = 0; index < postIds.length; index += 1) {
    const snapshot = cachedSnapshots[index];
    if (snapshot) {
      snapshots.set(snapshot.postId, snapshot);
    } else {
      missingIds.push(postIds[index]);
    }
  }

  if (missingIds.length > 0) {
    const rows = await fetchPostRowsByIds(viewerUserId, missingIds);
    for (const row of rows) {
      const snapshot = snapshotFromRow(row);
      snapshots.set(row.post_id, snapshot);
      await cacheSetJson(postSnapshotKey(row.post_id), snapshot, POST_SNAPSHOT_TTL_SECONDS);
    }
  }

  const visibleIds = postIds.filter((postId) => snapshots.has(postId));
  const authorSummaries = await getUserSummariesByIds(
    visibleIds.map((postId) => snapshots.get(postId)!.authorUserId),
  );
  const [engagement, viewerState, commentsByPost] = await Promise.all([
    getEngagement(visibleIds),
    getViewerState(viewerUserId, visibleIds),
    fetchRecentCommentsForPosts(visibleIds, viewerUserId),
  ]);

  const posts = visibleIds.map((postId) => {
    const snapshot = snapshots.get(postId)!;
    const authorSummary = authorSummaries.get(snapshot.authorUserId);
    if (!authorSummary) {
      return null;
    }
    const row = rowFromSnapshot(
      snapshot,
      {
        username: authorSummary.username,
        profilePictureUrl: authorSummary.profilePictureUrl,
      },
      engagement.get(postId) ?? { likeCount: 0, commentCount: 0, saveCount: 0 },
      viewerState.get(postId) ?? { isLiked: false, isSaved: false },
    );

    return {
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
      comments: commentsByPost.get(postId) ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }).filter((post): post is FeedPostResponse => post !== null);

  const staleIds = postIds.filter((postId) => !snapshots.has(postId));
  if (staleIds.length > 0) {
    await cacheZRem(feedKey(viewerUserId), ...staleIds);
  }

  return posts;
}

export async function fetchFeedPosts(viewerUserId: string, query: { followedFeed?: boolean; authorUserId?: string; hashtag?: string; limit: number; offset: number }): Promise<FeedPostResponse[]> {
  const postIds = await fetchPostIdsByQuery(viewerUserId, query);
  return hydratePosts(viewerUserId, postIds);
}

export async function refreshPostCaches(postId: string, viewerUserId: string): Promise<void> {
  const rows = await fetchPostRowsByIds(viewerUserId, [postId]);
  const row = rows[0];
  if (!row) {
    await cacheDelete(postSnapshotKey(postId), engagementKey(postId), recentCommentsKey(postId));
    return;
  }

  await cacheSetJson(postSnapshotKey(postId), snapshotFromRow(row), POST_SNAPSHOT_TTL_SECONDS);
  await cacheDelete(engagementKey(postId), recentCommentsKey(postId));
}

export async function removePostFromCaches(postId: string, affectedUserIds: string[]): Promise<void> {
  await cacheDelete(postSnapshotKey(postId), engagementKey(postId), recentCommentsKey(postId));
  await Promise.all(affectedUserIds.map((userId) => cacheZRem(feedKey(userId), postId)));
}

export async function addPostToFeedCaches(postId: string, createdAt: Date, userIds: string[]): Promise<void> {
  const score = createdAt.getTime();
  await Promise.all(Array.from(new Set(userIds)).map((userId) => cacheZAdd(feedKey(userId), score, postId)));
}

export async function getPostFeedRecipientIds(postId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT p.author_user_id AS user_id
    FROM posts p
    WHERE p.post_id = ${postId}
    UNION
    SELECT f.follower_user_id AS user_id
    FROM posts p
    JOIN follows f ON f.followed_user_id = p.author_user_id
    WHERE p.post_id = ${postId}
      AND p.visibility IN (CAST('public' AS "PostVisibility"), CAST('followers' AS "PostVisibility"))
  `;
  return rows.map((row) => row.user_id);
}

export async function setViewerLikedCache(postId: string, userId: string, liked: boolean): Promise<void> {
  await cacheSetJson(likedByKey(postId, userId), liked, FEED_IDS_TTL_SECONDS);
}

export async function incrementPostEngagement(postId: string, field: keyof EngagementSnapshot, amount: number): Promise<void> {
  await cacheIncrement(engagementKey(postId), field, amount);
}

export async function invalidateRecentComments(postId: string): Promise<void> {
  await cacheDelete(recentCommentsKey(postId));
}

export async function reconcilePostEngagement(postId: string): Promise<void> {
  await cacheDelete(engagementKey(postId));
  await getEngagement([postId]);
}
