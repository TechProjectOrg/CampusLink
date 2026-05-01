import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import {
  cacheGetJson,
  cacheSetAdd,
  cacheSetCardinality,
  cacheSetJson,
  cacheSetMembers,
} from './cache';

type TrendingLabel = 'hot' | 'rising' | 'new';

interface SuggestedUserCacheRow {
  id: string;
  name: string;
  mutual_count: number;
  common_club: string | null;
  score: number;
}

interface TrendingCacheRow {
  tag: string;
  post_count: number;
  label: TrendingLabel;
  score: number;
}

const SUGGESTED_TTL_SECONDS = Math.max(parseInt(process.env.SUGGESTED_USERS_TTL_SECONDS ?? '1200', 10) || 1200, 300);
const TRENDING_INTERVAL_MS = Math.max(parseInt(process.env.TRENDING_RECOMPUTE_MS ?? '300000', 10) || 300000, 60000);
const SUGGESTIONS_BATCH_MS = Math.max(parseInt(process.env.SUGGESTIONS_RECOMPUTE_MS ?? '1800000', 10) || 1800000, 60000);
const TRENDING_TOP_N = Math.max(parseInt(process.env.TRENDING_TOP_N ?? '5', 10) || 5, 1);
const TRENDING_MIN_UNIQUE_USERS = Math.max(parseInt(process.env.TRENDING_MIN_UNIQUE_USERS ?? '5', 10) || 5, 1);
const TRENDING_SPAM_CAP_PER_USER = Math.max(parseInt(process.env.TRENDING_SPAM_CAP_PER_USER ?? '5', 10) || 5, 1);

const ACTIVE_TAGS_KEY = 'trending:active_tags';
const CATEGORY_KEYS: Record<TrendingLabel, string> = {
  hot: 'trending:hot',
  rising: 'trending:rising',
  new: 'trending:new',
};

const queuedSuggestionUsers = new Set<string>();
let suggestionsLoopStarted = false;
let trendingLoopStarted = false;
let suggestionsSweepStarted = false;

function nowHourBucket(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}${m}${d}${h}`;
}

function hourOffsetBucket(hoursBack: number): string {
  const date = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  return nowHourBucket(date);
}

function suggestedKey(userId: string): string {
  return `suggested_users:${userId}`;
}

function seenKey(userId: string): string {
  return `suggested_users:seen:${userId}`;
}

function hashtagPostBucketKey(tag: string, bucket: string): string {
  return `hashtag:post_bucket:${tag}:${bucket}`;
}

function hashtagEngagementBucketKey(tag: string, bucket: string): string {
  return `hashtag:engagement_bucket:${tag}:${bucket}`;
}

function hashtagUsersBucketKey(tag: string, bucket: string): string {
  return `hashtag:users_bucket:${tag}:${bucket}`;
}

function hashtagUserSpamKey(tag: string, bucket: string, userId: string): string {
  return `hashtag:user_post_count:${tag}:${bucket}:${userId}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const [key, value] of left.entries()) {
    leftNorm += value * value;
    const rightValue = right.get(key) ?? 0;
    dot += value * rightValue;
  }
  for (const value of right.values()) {
    rightNorm += value * value;
  }
  if (leftNorm <= 0 || rightNorm <= 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function recencyWeight(lastSeenAt: Date | null): number {
  if (!lastSeenAt) return 0;
  const ageHours = (Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60);
  if (ageHours <= 1) return 3;
  if (ageHours <= 3) return 2;
  if (ageHours <= 6) return 1.25;
  if (ageHours <= 24) return 0.5;
  return 0;
}

function randomExplorationFactor(): number {
  return Math.random() * 0.5;
}

function applyDiversity(rows: SuggestedUserCacheRow[], limit: number): SuggestedUserCacheRow[] {
  const selected: SuggestedUserCacheRow[] = [];
  const clubCount = new Map<string, number>();
  for (const row of rows) {
    const clubName = row.common_club ?? '';
    const clubSeen = clubName ? (clubCount.get(clubName) ?? 0) : 0;
    const cap = Math.max(1, Math.floor(limit / 3));
    if (clubName && clubSeen >= cap) continue;
    selected.push(row);
    if (clubName) clubCount.set(clubName, clubSeen + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

async function getVectorMap(userIds: string[]): Promise<Map<string, Map<string, number>>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const vectors = new Map<string, Map<string, number>>();
  if (uniqueIds.length === 0) return vectors;

  const authoredRows = await prisma.$queryRaw<Array<{ user_id: string; tag_name: string; weight: number }>>`
    SELECT
      p.author_user_id AS user_id,
      h.tag_name,
      COUNT(*)::float AS weight
    FROM posts p
    JOIN post_hashtags ph ON ph.post_id = p.post_id
    JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
    WHERE p.author_user_id IN (${Prisma.join(uniqueIds)})
      AND p.created_at >= NOW() - INTERVAL '90 days'
    GROUP BY p.author_user_id, h.tag_name
  `;

  const likedRows = await prisma.$queryRaw<Array<{ user_id: string; tag_name: string; weight: number }>>`
    SELECT
      pl.user_id,
      h.tag_name,
      (COUNT(*)::float * 0.5) AS weight
    FROM post_likes pl
    JOIN posts p ON p.post_id = pl.post_id
    JOIN post_hashtags ph ON ph.post_id = p.post_id
    JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
    WHERE pl.user_id IN (${Prisma.join(uniqueIds)})
      AND pl.created_at >= NOW() - INTERVAL '90 days'
    GROUP BY pl.user_id, h.tag_name
  `;

  for (const row of [...authoredRows, ...likedRows]) {
    const map = vectors.get(row.user_id) ?? new Map<string, number>();
    map.set(row.tag_name, (map.get(row.tag_name) ?? 0) + toNumber(row.weight));
    vectors.set(row.user_id, map);
  }
  return vectors;
}

export async function recordSuggestionsSeen(userId: string, suggestedIds: string[]): Promise<void> {
  const key = seenKey(userId);
  const existing = (await cacheGetJson<string[]>(key)) ?? [];
  const next = Array.from(new Set([...existing, ...suggestedIds])).slice(-300);
  await cacheSetJson(key, next, 24 * 60 * 60);
}

export function queueSuggestedUsersRecompute(userId: string): void {
  if (!userId) return;
  queuedSuggestionUsers.add(userId);
}

export async function recomputeSuggestedUsers(userId: string): Promise<void> {
  const followedRows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT followed_user_id AS user_id
    FROM follows
    WHERE follower_user_id = ${userId}
  `;
  const pendingRows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT target_user_id AS user_id
    FROM follow_requests
    WHERE requester_user_id = ${userId}
      AND status = CAST('pending' AS "FollowRequestStatus")
  `;
  const exclude = new Set<string>([userId, ...followedRows.map((row) => row.user_id), ...pendingRows.map((row) => row.user_id)]);
  const seen = (await cacheGetJson<string[]>(seenKey(userId))) ?? [];
  for (const id of seen) exclude.add(id);

  const candidateRows = await prisma.$queryRaw<Array<{ candidate_id: string }>>`
    (
      SELECT DISTINCT cm2.user_id AS candidate_id
      FROM club_memberships cm1
      JOIN club_memberships cm2 ON cm1.club_id = cm2.club_id
      WHERE cm1.user_id = ${userId}
        AND cm1.status = CAST('active' AS "ClubMembershipStatus")
        AND cm2.status = CAST('active' AS "ClubMembershipStatus")
      LIMIT 250
    )
    UNION
    (
      SELECT DISTINCT f2.followed_user_id AS candidate_id
      FROM follows f1
      JOIN follows f2 ON f1.followed_user_id = f2.follower_user_id
      WHERE f1.follower_user_id = ${userId}
      LIMIT 250
    )
    UNION
    (
      SELECT DISTINCT p2.author_user_id AS candidate_id
      FROM posts p1
      JOIN post_hashtags ph1 ON ph1.post_id = p1.post_id
      JOIN post_hashtags ph2 ON ph2.hashtag_id = ph1.hashtag_id
      JOIN posts p2 ON p2.post_id = ph2.post_id
      WHERE p1.author_user_id = ${userId}
        AND p1.created_at >= NOW() - INTERVAL '120 days'
        AND p2.author_user_id <> ${userId}
      LIMIT 250
    )
    UNION
    (
      SELECT DISTINCT pl.user_id AS candidate_id
      FROM posts p
      JOIN post_likes pl ON pl.post_id = p.post_id
      WHERE p.author_user_id = ${userId}
      LIMIT 250
    )
  `;

  const candidateIds = Array.from(new Set(candidateRows.map((row) => row.candidate_id))).filter((id) => !exclude.has(id));
  if (candidateIds.length === 0) {
    await cacheSetJson(suggestedKey(userId), [], SUGGESTED_TTL_SECONDS);
    return;
  }

  const commonClubRows = await prisma.$queryRaw<Array<{ candidate_id: string; common_club_count: number; top_club_name: string | null }>>`
    SELECT
      cm2.user_id AS candidate_id,
      COUNT(*)::int AS common_club_count,
      MIN(c.name) AS top_club_name
    FROM club_memberships cm1
    JOIN club_memberships cm2 ON cm1.club_id = cm2.club_id
    JOIN clubs c ON c.club_id = cm1.club_id
    WHERE cm1.user_id = ${userId}
      AND cm1.status = CAST('active' AS "ClubMembershipStatus")
      AND cm2.user_id IN (${Prisma.join(candidateIds)})
      AND cm2.status = CAST('active' AS "ClubMembershipStatus")
    GROUP BY cm2.user_id
  `;

  const mutualRows = await prisma.$queryRaw<Array<{ candidate_id: string; mutual_count: number }>>`
    SELECT
      f2.follower_user_id AS candidate_id,
      COUNT(*)::int AS mutual_count
    FROM follows f1
    JOIN follows f2 ON f1.followed_user_id = f2.followed_user_id
    WHERE f1.follower_user_id = ${userId}
      AND f2.follower_user_id IN (${Prisma.join(candidateIds)})
      AND f2.follower_user_id <> ${userId}
    GROUP BY f2.follower_user_id
  `;

  const coEngagementRows = await prisma.$queryRaw<Array<{ candidate_id: string; co_count: number }>>`
    SELECT
      p2.author_user_id AS candidate_id,
      COUNT(DISTINCT p2.club_id)::int AS co_count
    FROM posts p1
    JOIN posts p2 ON p1.club_id = p2.club_id
    WHERE p1.author_user_id = ${userId}
      AND p2.author_user_id IN (${Prisma.join(candidateIds)})
      AND p1.club_id IS NOT NULL
      AND p1.created_at >= NOW() - INTERVAL '45 days'
      AND p2.created_at >= NOW() - INTERVAL '45 days'
    GROUP BY p2.author_user_id
  `;

  const candidateMetaRows = await prisma.$queryRaw<
    Array<{ user_id: string; username: string; last_seen_at: Date | null; followers_count: number; engagement_count: number }>
  >`
    SELECT
      u.user_id,
      u.username,
      u.last_seen_at,
      (SELECT COUNT(*)::int FROM follows f WHERE f.followed_user_id = u.user_id) AS followers_count,
      (
        (SELECT COUNT(*)::int FROM post_likes pl JOIN posts p ON p.post_id = pl.post_id WHERE p.author_user_id = u.user_id)
        +
        (SELECT COUNT(*)::int FROM post_comments pc JOIN posts p ON p.post_id = pc.post_id WHERE p.author_user_id = u.user_id)
      ) AS engagement_count
    FROM users u
    WHERE u.user_id IN (${Prisma.join(candidateIds)})
  `;

  const vectorMap = await getVectorMap([userId, ...candidateIds]);
  const userVector = vectorMap.get(userId) ?? new Map<string, number>();

  const commonClubByUser = new Map(commonClubRows.map((row) => [row.candidate_id, row]));
  const mutualByUser = new Map(mutualRows.map((row) => [row.candidate_id, row.mutual_count]));
  const coEngagementByUser = new Map(coEngagementRows.map((row) => [row.candidate_id, row.co_count]));

  const scored: SuggestedUserCacheRow[] = candidateMetaRows.map((row) => {
    const commonClub = commonClubByUser.get(row.user_id);
    const commonClubCount = commonClub?.common_club_count ?? 0;
    const mutualCount = mutualByUser.get(row.user_id) ?? 0;
    const coInteraction = coEngagementByUser.get(row.user_id) ?? 0;
    const interestSimilarity = cosineSimilarity(userVector, vectorMap.get(row.user_id) ?? new Map<string, number>());
    const recency = recencyWeight(row.last_seen_at);
    const popularity = Math.max(0, row.followers_count, row.engagement_count);
    const score =
      5 * commonClubCount +
      4 * mutualCount +
      3 * coInteraction +
      10 * interestSimilarity +
      recency +
      Math.log(popularity + 1) +
      randomExplorationFactor();

    return {
      id: row.user_id,
      name: row.username,
      mutual_count: mutualCount,
      common_club: commonClub?.top_club_name ?? null,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const finalRows = applyDiversity(scored, 20);
  await cacheSetJson(suggestedKey(userId), finalRows, SUGGESTED_TTL_SECONDS);
}

export async function getSuggestedUsersForApi(userId: string, limit: number): Promise<Array<{ id: string; name: string; mutual_count: number; common_club: string | null }>> {
  const cached = await cacheGetJson<SuggestedUserCacheRow[]>(suggestedKey(userId));
  if (!cached) {
    queueSuggestedUsersRecompute(userId);
    return [];
  }
  const rows = cached.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    mutual_count: row.mutual_count,
    common_club: row.common_club ?? null,
  }));
  void recordSuggestionsSeen(userId, rows.map((row) => row.id));
  return rows;
}

export async function trackPostCreatedHashtags(authorUserId: string, hashtags: string[]): Promise<void> {
  const uniqueTags = Array.from(new Set(hashtags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
  if (uniqueTags.length === 0) return;

  const hour = hourOffsetBucket(0);
  for (const tag of uniqueTags) {
    const postKey = hashtagPostBucketKey(tag, hour);
    const usersKey = hashtagUsersBucketKey(tag, hour);
    const spamKey = hashtagUserSpamKey(tag, hour, authorUserId);
    const existingCount = toNumber(await cacheGetJson<number>(spamKey));
    if (existingCount >= TRENDING_SPAM_CAP_PER_USER) {
      continue;
    }
    await cacheSetJson(spamKey, existingCount + 1, 2 * 60 * 60);
    const currentPosts = toNumber(await cacheGetJson<number>(postKey));
    await cacheSetJson(postKey, currentPosts + 1, 30 * 60 * 60);
    await cacheSetAdd(usersKey, authorUserId);
    await cacheSetAdd(ACTIVE_TAGS_KEY, tag);
  }
}

export async function trackPostEngagementForPost(postId: string, actorUserId: string, deltaLikes: number, deltaComments: number): Promise<void> {
  if (deltaLikes === 0 && deltaComments === 0) return;
  const rows = await prisma.$queryRaw<Array<{ tag_name: string }>>`
    SELECT h.tag_name
    FROM post_hashtags ph
    JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
    WHERE ph.post_id = ${postId}
  `;
  const tags = Array.from(new Set(rows.map((row) => row.tag_name)));
  if (tags.length === 0) return;
  const hour = hourOffsetBucket(0);
  const delta = deltaLikes + deltaComments;
  for (const tag of tags) {
    const key = hashtagEngagementBucketKey(tag, hour);
    const current = toNumber(await cacheGetJson<number>(key));
    await cacheSetJson(key, current + delta, 30 * 60 * 60);
    await cacheSetAdd(hashtagUsersBucketKey(tag, hour), actorUserId);
    await cacheSetAdd(ACTIVE_TAGS_KEY, tag);
  }
}

async function sumTagBuckets(prefixBuilder: (bucket: string) => string, hours: number): Promise<number> {
  let total = 0;
  for (let offset = 0; offset < hours; offset += 1) {
    total += toNumber(await cacheGetJson<number>(prefixBuilder(hourOffsetBucket(offset))));
  }
  return total;
}

export async function recomputeTrendingHashtags(): Promise<void> {
  const tags = await cacheSetMembers(ACTIVE_TAGS_KEY);
  if (tags.length === 0) {
    await Promise.all([
      cacheSetJson(CATEGORY_KEYS.hot, [], TRENDING_INTERVAL_MS / 1000 + 60),
      cacheSetJson(CATEGORY_KEYS.rising, [], TRENDING_INTERVAL_MS / 1000 + 60),
      cacheSetJson(CATEGORY_KEYS.new, [], TRENDING_INTERVAL_MS / 1000 + 60),
    ]);
    return;
  }

  const createdRows = await prisma.$queryRaw<Array<{ tag_name: string; created_at: Date }>>`
    SELECT tag_name, created_at
    FROM hashtags
    WHERE tag_name IN (${Prisma.join(tags)})
  `;
  const createdAtMap = new Map(createdRows.map((row) => [row.tag_name, row.created_at]));
  const now = Date.now();

  const hotRows: TrendingCacheRow[] = [];
  const risingRows: TrendingCacheRow[] = [];
  const newRows: TrendingCacheRow[] = [];

  for (const tag of tags) {
    const postsLast1h = toNumber(await cacheGetJson<number>(hashtagPostBucketKey(tag, hourOffsetBucket(0))));
    const postsPrev1h = toNumber(await cacheGetJson<number>(hashtagPostBucketKey(tag, hourOffsetBucket(1))));
    const posts24h = await sumTagBuckets((bucket) => hashtagPostBucketKey(tag, bucket), 24);
    const engagement24h = await sumTagBuckets((bucket) => hashtagEngagementBucketKey(tag, bucket), 24);

    let uniqueUsers = 0;
    for (let offset = 0; offset < 24; offset += 1) {
      uniqueUsers += await cacheSetCardinality(hashtagUsersBucketKey(tag, hourOffsetBucket(offset)));
    }

    if (uniqueUsers < TRENDING_MIN_UNIQUE_USERS) continue;

    const hotScore = 0.5 * posts24h + 0.3 * engagement24h + 0.2 * uniqueUsers;
    const growthRate = postsLast1h / Math.max(postsPrev1h, 1);
    const risingScore = growthRate * Math.log(posts24h + 1);
    const createdAt = createdAtMap.get(tag);
    const ageHours = createdAt ? (now - createdAt.getTime()) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;

    if (posts24h >= TRENDING_MIN_UNIQUE_USERS && engagement24h > 0) {
      hotRows.push({ tag, post_count: posts24h, label: 'hot', score: hotScore });
    }
    if (postsLast1h >= 2 && growthRate >= 1.25) {
      risingRows.push({ tag, post_count: posts24h, label: 'rising', score: risingScore });
    }
    if (ageHours <= 72 && postsLast1h > 0 && posts24h <= 40) {
      newRows.push({ tag, post_count: postsLast1h, label: 'new', score: postsLast1h });
    }
  }

  hotRows.sort((a, b) => b.score - a.score);
  risingRows.sort((a, b) => b.score - a.score);
  newRows.sort((a, b) => b.score - a.score);

  const topHot = hotRows.slice(0, TRENDING_TOP_N);
  const excluded = new Set(topHot.map((row) => row.tag));
  const topRising = risingRows.filter((row) => !excluded.has(row.tag)).slice(0, TRENDING_TOP_N);
  for (const row of topRising) excluded.add(row.tag);
  const topNew = newRows.filter((row) => !excluded.has(row.tag)).slice(0, TRENDING_TOP_N);

  const ttl = Math.floor(TRENDING_INTERVAL_MS / 1000) + 120;
  await Promise.all([
    cacheSetJson(CATEGORY_KEYS.hot, topHot, ttl),
    cacheSetJson(CATEGORY_KEYS.rising, topRising, ttl),
    cacheSetJson(CATEGORY_KEYS.new, topNew, ttl),
  ]);
}

export async function getTrendingHashtagsForApi(limitPerCategory: number): Promise<Array<{ tag: string; post_count: number; label: TrendingLabel }>> {
  const [hot, rising, fresh] = await Promise.all([
    cacheGetJson<TrendingCacheRow[]>(CATEGORY_KEYS.hot),
    cacheGetJson<TrendingCacheRow[]>(CATEGORY_KEYS.rising),
    cacheGetJson<TrendingCacheRow[]>(CATEGORY_KEYS.new),
  ]);

  const out: Array<{ tag: string; post_count: number; label: TrendingLabel }> = [];
  const seen = new Set<string>();

  for (const item of (hot ?? []).slice(0, limitPerCategory)) {
    if (seen.has(item.tag)) continue;
    seen.add(item.tag);
    out.push({ tag: item.tag, post_count: item.post_count, label: 'hot' });
  }
  for (const item of (rising ?? []).slice(0, limitPerCategory)) {
    if (seen.has(item.tag)) continue;
    seen.add(item.tag);
    out.push({ tag: item.tag, post_count: item.post_count, label: 'rising' });
  }
  for (const item of (fresh ?? []).slice(0, limitPerCategory)) {
    if (seen.has(item.tag)) continue;
    seen.add(item.tag);
    out.push({ tag: item.tag, post_count: item.post_count, label: 'new' });
  }
  return out;
}

export function maybeStartSocialInsightsSchedulers(): void {
  if (!trendingLoopStarted) {
    trendingLoopStarted = true;
    setInterval(() => {
      void recomputeTrendingHashtags().catch((err) => {
        console.warn('Failed to recompute trending hashtags:', err);
      });
    }, TRENDING_INTERVAL_MS);
  }

  if (!suggestionsLoopStarted) {
    suggestionsLoopStarted = true;
    setInterval(() => {
      const userIds = Array.from(queuedSuggestionUsers);
      queuedSuggestionUsers.clear();
      if (userIds.length === 0) return;
      void Promise.all(
        userIds.map(async (userId) => {
          try {
            await recomputeSuggestedUsers(userId);
          } catch (err) {
            console.warn('Failed to recompute suggested users:', err);
          }
        }),
      );
    }, SUGGESTIONS_BATCH_MS);
  }

  if (!suggestionsSweepStarted) {
    suggestionsSweepStarted = true;
    setInterval(() => {
      void (async () => {
        try {
          const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
            SELECT user_id
            FROM users
            WHERE is_active = true
              AND (last_seen_at IS NULL OR last_seen_at >= NOW() - INTERVAL '2 days')
            ORDER BY COALESCE(last_seen_at, created_at) DESC
            LIMIT 500
          `;
          for (const row of rows) {
            queueSuggestedUsersRecompute(row.user_id);
          }
        } catch (err) {
          console.warn('Failed to enqueue periodic suggested-user recompute:', err);
        }
      })();
    }, SUGGESTIONS_BATCH_MS);
  }
}
