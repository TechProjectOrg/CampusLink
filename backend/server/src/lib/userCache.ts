import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import {
  cacheDelete,
  cacheExpire,
  cacheGetJson,
  cacheHGetAll,
  cacheHashSet,
  cacheIncrement,
  cacheMGetJson,
  cacheSetJson,
} from './cache';

export interface CachedUserSummary {
  userId: string;
  username: string;
  email: string;
  bio: string | null;
  headline: string | null;
  profilePictureUrl: string | null;
  isPrivate: boolean;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  type: 'student' | 'alumni';
  details: {
    branch?: string;
    year?: number;
    passingYear?: number;
  };
  allowMessages: boolean;
}

export interface CachedUserStats {
  followerCount: number;
  followingCount: number;
  postCount: number;
}

export interface CachedUserCard {
  userId: string;
  username: string;
  email: string;
  profilePictureUrl: string | null;
  isPrivate: boolean;
  type: 'student' | 'alumni';
  branch: string | null;
  year: number | null;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface CachedConversationEntry {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar: string | null;
  lastMessage: string;
  timestamp: string;
  unread: number;
  isOnline: boolean;
  lastSeenAt: string | null;
  isRequest: boolean;
}

interface UserSummaryRow {
  user_id: string;
  username: string;
  email: string;
  bio: string | null;
  headline: string | null;
  profile_photo_url: string | null;
  is_private: boolean;
  is_active: boolean;
  is_online: boolean;
  last_seen_at: Date | null;
  created_at: Date;
  user_type: 'student' | 'alumni';
  student_branch: string | null;
  student_year: number | null;
  alumni_branch: string | null;
  alumni_passing_year: number | null;
  allow_messages: boolean | null;
}

interface UserStatsRow {
  user_id: string;
  follower_count: number;
  following_count: number;
  post_count: number;
}

const USER_SUMMARY_TTL_SECONDS = 60 * 10;
const USER_STATS_TTL_SECONDS = 60 * 10;
const CHAT_CONVERSATIONS_TTL_SECONDS = 60 * 2;

function userSummaryKey(userId: string): string {
  return `user:${userId}:summary`;
}

function userStatsKey(userId: string): string {
  return `user:${userId}:stats`;
}

function chatConversationListKey(userId: string, type: 'active' | 'requests'): string {
  return `chat:user:${userId}:conversations:${type}`;
}

function mapSummaryRow(row: UserSummaryRow): CachedUserSummary {
  const details: CachedUserSummary['details'] = {};
  if (row.user_type === 'student') {
    if (row.student_branch) details.branch = row.student_branch;
    if (row.student_year !== null) details.year = row.student_year;
  } else {
    if (row.alumni_branch) details.branch = row.alumni_branch;
    if (row.alumni_passing_year !== null) details.passingYear = row.alumni_passing_year;
  }

  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    bio: row.bio,
    headline: row.headline,
    profilePictureUrl: row.profile_photo_url,
    isPrivate: row.is_private,
    isActive: row.is_active,
    isOnline: row.is_online,
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    type: row.user_type,
    details,
    allowMessages: row.allow_messages ?? true,
  };
}

function mapStatsRow(row: UserStatsRow): CachedUserStats {
  return {
    followerCount: row.follower_count,
    followingCount: row.following_count,
    postCount: row.post_count,
  };
}

async function fetchUserSummariesByIdsFromDb(userIds: string[]): Promise<Map<string, CachedUserSummary>> {
  const result = new Map<string, CachedUserSummary>();
  if (userIds.length === 0) return result;

  const rows = await prisma.$queryRaw<UserSummaryRow[]>`
    SELECT
      u.user_id,
      u.username,
      u.email,
      u.bio,
      u.headline,
      u.profile_photo_url,
      u.is_private,
      u.is_active,
      u.is_online,
      u.last_seen_at,
      u.created_at,
      u.user_type,
      sp.branch AS student_branch,
      sp.year AS student_year,
      ap.branch AS alumni_branch,
      ap.passing_year AS alumni_passing_year,
      us.allow_messages
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
    LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
    LEFT JOIN user_settings us ON us.user_id = u.user_id
    WHERE u.user_id IN (${Prisma.join(userIds)})
  `;

  await Promise.all(
    rows.map(async (row) => {
      const summary = mapSummaryRow(row);
      result.set(summary.userId, summary);
      await cacheSetJson(userSummaryKey(summary.userId), summary, USER_SUMMARY_TTL_SECONDS);
    }),
  );

  return result;
}

async function fetchUserStatsByIdsFromDb(userIds: string[]): Promise<Map<string, CachedUserStats>> {
  const result = new Map<string, CachedUserStats>();
  if (userIds.length === 0) return result;

  const rows = await prisma.$queryRaw<UserStatsRow[]>`
    SELECT
      u.user_id,
      (SELECT COUNT(*)::int FROM follows f WHERE f.followed_user_id = u.user_id) AS follower_count,
      (SELECT COUNT(*)::int FROM follows f WHERE f.follower_user_id = u.user_id) AS following_count,
      (SELECT COUNT(*)::int FROM posts p WHERE p.author_user_id = u.user_id) AS post_count
    FROM users u
    WHERE u.user_id IN (${Prisma.join(userIds)})
  `;

  await Promise.all(
    rows.map(async (row) => {
      const stats = mapStatsRow(row);
      result.set(row.user_id, stats);
      await cacheHashSet(
        userStatsKey(row.user_id),
        {
          followerCount: stats.followerCount,
          followingCount: stats.followingCount,
          postCount: stats.postCount,
        },
        USER_STATS_TTL_SECONDS,
      );
    }),
  );

  return result;
}

export async function getUserSummaryById(userId: string): Promise<CachedUserSummary | null> {
  const cached = await cacheGetJson<CachedUserSummary>(userSummaryKey(userId));
  if (cached) return cached;

  return (await fetchUserSummariesByIdsFromDb([userId])).get(userId) ?? null;
}

export async function getUserSummariesByIds(userIds: string[]): Promise<Map<string, CachedUserSummary>> {
  const orderedUniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, CachedUserSummary>();
  if (orderedUniqueIds.length === 0) return result;

  const cached = await cacheMGetJson<CachedUserSummary>(orderedUniqueIds.map(userSummaryKey));
  const missing: string[] = [];

  orderedUniqueIds.forEach((userId, index) => {
    const summary = cached[index];
    if (summary) {
      result.set(userId, summary);
    } else {
      missing.push(userId);
    }
  });

  if (missing.length > 0) {
    const fetched = await fetchUserSummariesByIdsFromDb(missing);
    fetched.forEach((summary, userId) => {
      result.set(userId, summary);
    });
  }

  return result;
}

export async function getUserStatsById(userId: string): Promise<CachedUserStats | null> {
  const cached = await cacheHGetAll(userStatsKey(userId));
  if (cached) {
    return {
      followerCount: Number(cached.followerCount ?? 0),
      followingCount: Number(cached.followingCount ?? 0),
      postCount: Number(cached.postCount ?? 0),
    };
  }

  return (await fetchUserStatsByIdsFromDb([userId])).get(userId) ?? null;
}

export async function patchUserSummary(
  userId: string,
  updater: (current: CachedUserSummary) => CachedUserSummary,
): Promise<void> {
  const cached = await cacheGetJson<CachedUserSummary>(userSummaryKey(userId));
  if (!cached) return;
  await cacheSetJson(userSummaryKey(userId), updater(cached), USER_SUMMARY_TTL_SECONDS);
}

export async function setUserSummary(summary: CachedUserSummary): Promise<void> {
  await cacheSetJson(userSummaryKey(summary.userId), summary, USER_SUMMARY_TTL_SECONDS);
}

export async function patchUserStats(
  userId: string,
  updater: (current: CachedUserStats) => CachedUserStats,
): Promise<void> {
  const current = await getUserStatsById(userId);
  if (!current) return;

  const next = updater(current);
  await cacheHashSet(
    userStatsKey(userId),
    {
      followerCount: next.followerCount,
      followingCount: next.followingCount,
      postCount: next.postCount,
    },
    USER_STATS_TTL_SECONDS,
  );
}

export async function incrementUserStat(
  userId: string,
  field: keyof CachedUserStats,
  amount: number,
): Promise<void> {
  const cached = await cacheHGetAll(userStatsKey(userId));
  if (!cached) return;

  await cacheIncrement(userStatsKey(userId), field, amount);
  await cacheExpire(userStatsKey(userId), USER_STATS_TTL_SECONDS);
}

export async function invalidateUserCache(userId: string): Promise<void> {
  await cacheDelete(userSummaryKey(userId), userStatsKey(userId));
}

export function toCachedUserCard(summary: CachedUserSummary): CachedUserCard {
  return {
    userId: summary.userId,
    username: summary.username,
    email: summary.email,
    profilePictureUrl: summary.profilePictureUrl,
    isPrivate: summary.isPrivate,
    type: summary.type,
    branch: summary.details.branch ?? null,
    year: summary.details.year ?? summary.details.passingYear ?? null,
    isOnline: summary.isOnline,
    lastSeenAt: summary.lastSeenAt,
  };
}

export async function getCachedConversationList(
  userId: string,
  type: 'active' | 'requests',
): Promise<CachedConversationEntry[] | null> {
  return cacheGetJson<CachedConversationEntry[]>(chatConversationListKey(userId, type));
}

export async function setCachedConversationList(
  userId: string,
  type: 'active' | 'requests',
  conversations: CachedConversationEntry[],
): Promise<void> {
  await cacheSetJson(
    chatConversationListKey(userId, type),
    conversations,
    CHAT_CONVERSATIONS_TTL_SECONDS,
  );
}

export async function patchCachedConversationList(
  userId: string,
  type: 'active' | 'requests',
  updater: (conversations: CachedConversationEntry[]) => CachedConversationEntry[],
): Promise<void> {
  const cached = await getCachedConversationList(userId, type);
  if (!cached) return;

  await setCachedConversationList(userId, type, updater(cached));
}

export async function invalidateConversationLists(
  userIds: string[],
  types: Array<'active' | 'requests'> = ['active', 'requests'],
): Promise<void> {
  const uniqueUserIds = Array.from(new Set(userIds));
  const keys = uniqueUserIds.flatMap((userId) => types.map((type) => chatConversationListKey(userId, type)));
  await cacheDelete(...keys);
}
