import prisma from '../prisma';
import {
  cacheDelete,
  cacheGetJson,
  cacheHGetAll,
  cacheHashIncrementBy,
  cacheHashSet,
  cacheSetJson,
  cacheSetJsonIfNotExists,
} from './cache';
import type {
  ClubMembershipRole,
  ClubMembershipStatus,
  ClubPermissionSnapshot,
  ClubPrivacy,
  ClubRestrictionType,
} from './clubs';

const CLUB_CACHE_VERSION = 'v1';
const CLUB_META_SOFT_TTL_SECONDS = 15 * 60;
const CLUB_META_HARD_TTL_SECONDS = 60 * 60;
const CLUB_MEMBERSHIP_SOFT_TTL_SECONDS = 5 * 60;
const CLUB_MEMBERSHIP_HARD_TTL_SECONDS = 15 * 60;
const CLUB_FEED_LATEST_SOFT_TTL_SECONDS = 60;
const CLUB_FEED_LATEST_HARD_TTL_SECONDS = 120;
const CLUB_FEED_TRENDING_SOFT_TTL_SECONDS = 90;
const CLUB_FEED_TRENDING_HARD_TTL_SECONDS = 180;
const CLUB_STATS_TTL_SECONDS = 15 * 60;
const CLUB_CACHE_LOCK_TTL_SECONDS = 15;
const CLUB_CACHE_LOCK_WAIT_MS = 75;

export type ClubFeedSort = 'latest' | 'trending';

export interface CachedClubMeta {
  clubId: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  privacy: ClubPrivacy;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  primaryCategory: {
    id: string;
    displayName: string | null;
  } | null;
  tags: string[];
  memberCount: number;
}

export interface CachedClubStats {
  memberCount: number;
  postCount: number;
}

export interface CachedClubMembership {
  clubMembershipId: string;
  role: ClubMembershipRole;
  status: ClubMembershipStatus;
  restrictions: ClubRestrictionType[];
}

interface CachedEnvelope<T> {
  value: T;
  cachedAt: string;
  staleAt: string;
}

interface ClubMetaRow {
  club_id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  privacy: ClubPrivacy;
  avatar_url: string | null;
  cover_image_url: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
  primary_category_id: string | null;
  category_display_name: string | null;
  member_count: number;
  tags: string[] | null;
}

interface ClubStatsRow {
  member_count: number;
  post_count: number;
}

interface ClubMembershipRow {
  club_membership_id: string;
  role: ClubMembershipRole;
  status: ClubMembershipStatus;
  active_restrictions: unknown;
}

function clubMetaKey(clubId: string): string {
  return `${CLUB_CACHE_VERSION}:club:${clubId}:meta`;
}

function clubStatsKey(clubId: string): string {
  return `${CLUB_CACHE_VERSION}:club:${clubId}:stats`;
}

function clubMembershipKey(clubId: string, userId: string): string {
  return `${CLUB_CACHE_VERSION}:club:${clubId}:members:${userId}`;
}

function clubFeedKey(clubId: string, sort: ClubFeedSort): string {
  return `${CLUB_CACHE_VERSION}:club:${clubId}:feed:${sort}`;
}

function cacheLockKey(key: string): string {
  return `${key}:lock`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCacheableValue<T>(value: T | null, allowEmpty = false): value is T {
  if (value === null) return false;
  if (!allowEmpty && Array.isArray(value) && value.length === 0) {
    return false;
  }
  return true;
}

async function acquireCacheLock(key: string): Promise<boolean> {
  return cacheSetJsonIfNotExists(
    cacheLockKey(key),
    { lockedAt: new Date().toISOString() },
    CLUB_CACHE_LOCK_TTL_SECONDS,
  );
}

function buildEnvelope<T>(value: T, softTtlSeconds: number): CachedEnvelope<T> {
  const now = Date.now();
  return {
    value,
    cachedAt: new Date(now).toISOString(),
    staleAt: new Date(now + softTtlSeconds * 1000).toISOString(),
  };
}

async function refreshSoftCachedValue<T>(params: {
  key: string;
  loader: () => Promise<T | null>;
  softTtlSeconds: number;
  hardTtlSeconds: number;
  allowEmpty?: boolean;
  keepStaleOnMiss?: boolean;
}): Promise<T | null> {
  const {
    key,
    loader,
    softTtlSeconds,
    hardTtlSeconds,
    allowEmpty = false,
    keepStaleOnMiss = true,
  } = params;

  const nextValue = await loader();
  if (isCacheableValue(nextValue, allowEmpty)) {
    await cacheSetJson(key, buildEnvelope(nextValue, softTtlSeconds), hardTtlSeconds);
    return nextValue;
  }

  if (!keepStaleOnMiss) {
    await cacheDelete(key);
  }

  return nextValue;
}

async function getSoftCachedValue<T>(params: {
  key: string;
  loader: () => Promise<T | null>;
  softTtlSeconds: number;
  hardTtlSeconds: number;
  allowEmpty?: boolean;
}): Promise<T | null> {
  const { key, loader, softTtlSeconds, hardTtlSeconds, allowEmpty = false } = params;
  const cached = await cacheGetJson<CachedEnvelope<T>>(key);
  const now = Date.now();
  const staleAt = cached ? Date.parse(cached.staleAt) : Number.NaN;

  if (cached && Number.isFinite(staleAt)) {
    if (staleAt > now) {
      return cached.value;
    }

    void (async () => {
      if (!(await acquireCacheLock(key))) return;
      try {
        await refreshSoftCachedValue({
          key,
          loader,
          softTtlSeconds,
          hardTtlSeconds,
          allowEmpty,
          keepStaleOnMiss: true,
        });
      } finally {
        await cacheDelete(cacheLockKey(key));
      }
    })();

    return cached.value;
  }

  if (await acquireCacheLock(key)) {
    try {
      return await refreshSoftCachedValue({
        key,
        loader,
        softTtlSeconds,
        hardTtlSeconds,
        allowEmpty,
        keepStaleOnMiss: false,
      });
    } finally {
      await cacheDelete(cacheLockKey(key));
    }
  }

  await sleep(CLUB_CACHE_LOCK_WAIT_MS);
  const warmed = await cacheGetJson<CachedEnvelope<T>>(key);
  if (warmed) {
    return warmed.value;
  }

  return loader();
}

function parseRestrictions(rawValue: unknown): ClubRestrictionType[] {
  let values: string[] = [];

  if (Array.isArray(rawValue)) {
    values = rawValue.map((value) => String(value));
  } else if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          values = parsed.map((value) => String(value));
        }
      } catch {
        values = [];
      }
    } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      values = trimmed
        .slice(1, -1)
        .split(',')
        .map((value) => value.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    } else {
      values = [trimmed];
    }
  }

  const valid = new Set<ClubRestrictionType>(['posting_blocked', 'comment_blocked', 'membership_ban']);
  return values.filter((value): value is ClubRestrictionType => valid.has(value as ClubRestrictionType));
}

async function loadClubMetaFromDb(clubId: string): Promise<CachedClubMeta | null> {
  const rows = await prisma.$queryRaw<ClubMetaRow[]>`
    SELECT
      c.club_id,
      c.name,
      c.slug,
      c.short_description,
      c.description,
      c.privacy,
      c.avatar_url,
      c.cover_image_url,
      c.created_by_user_id,
      c.created_at,
      c.updated_at,
      c.primary_category_id,
      cc.display_name AS category_display_name,
      (
        SELECT COUNT(*)::int
        FROM club_memberships cm_count
        WHERE cm_count.club_id = c.club_id
          AND cm_count.status = CAST('active' AS "ClubMembershipStatus")
      ) AS member_count,
      COALESCE(
        (
          SELECT ARRAY_AGG(ct.display_name ORDER BY ct.display_name)
          FROM club_tags_on_clubs ctoc
          JOIN club_tags ct ON ct.club_tag_id = ctoc.club_tag_id
          WHERE ctoc.club_id = c.club_id
        ),
        ARRAY[]::text[]
      ) AS tags
    FROM clubs c
    LEFT JOIN club_categories cc ON cc.club_category_id = c.primary_category_id
    WHERE c.club_id = ${clubId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    clubId: row.club_id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    privacy: row.privacy,
    avatarUrl: row.avatar_url,
    coverImageUrl: row.cover_image_url,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    primaryCategory: row.primary_category_id
      ? {
          id: row.primary_category_id,
          displayName: row.category_display_name,
        }
      : null,
    tags: row.tags ?? [],
    memberCount: row.member_count,
  };
}

async function loadClubStatsFromDb(clubId: string): Promise<CachedClubStats | null> {
  const rows = await prisma.$queryRaw<ClubStatsRow[]>`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM club_memberships cm
        WHERE cm.club_id = ${clubId}
          AND cm.status = CAST('active' AS "ClubMembershipStatus")
      ) AS member_count,
      (
        SELECT COUNT(*)::int
        FROM posts p
        WHERE p.club_id = ${clubId}
      ) AS post_count
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    memberCount: row.member_count,
    postCount: row.post_count,
  };
}

async function loadClubMembershipFromDb(clubId: string, userId: string): Promise<CachedClubMembership | null> {
  const rows = await prisma.$queryRaw<ClubMembershipRow[]>`
    SELECT
      cm.club_membership_id,
      cm.role,
      cm.status,
      COALESCE(
        (
          SELECT JSON_AGG(cmr.restriction_type::text)
          FROM club_member_restrictions cmr
          WHERE cmr.club_membership_id = cm.club_membership_id
            AND (cmr.expires_at IS NULL OR cmr.expires_at > NOW())
        ),
        '[]'::json
      ) AS active_restrictions
    FROM club_memberships cm
    WHERE cm.club_id = ${clubId}
      AND cm.user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    clubMembershipId: row.club_membership_id,
    role: row.role,
    status: row.status,
    restrictions: parseRestrictions(row.active_restrictions),
  };
}

async function loadClubFeedPostIdsFromDb(
  clubId: string,
  sort: ClubFeedSort,
  limit: number,
  offset: number,
): Promise<string[]> {
  if (sort === 'trending') {
    const rows = await prisma.$queryRaw<Array<{ post_id: string }>>`
      SELECT p.post_id
      FROM posts p
      WHERE p.club_id = ${clubId}
      ORDER BY
        (
          (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) * 3
          + (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) * 2
          + (SELECT COUNT(*)::int FROM post_saves ps WHERE ps.post_id = p.post_id)
        ) DESC,
        p.created_at DESC,
        p.post_id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return rows.map((row) => row.post_id);
  }

  const rows = await prisma.$queryRaw<Array<{ post_id: string }>>`
    SELECT p.post_id
    FROM posts p
    WHERE p.club_id = ${clubId}
    ORDER BY p.created_at DESC, p.post_id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return rows.map((row) => row.post_id);
}

function buildPermissionSnapshot(
  meta: CachedClubMeta,
  membership: CachedClubMembership | null,
  viewerUserId: string,
): ClubPermissionSnapshot {
  const membershipRole = membership?.role ?? null;
  const membershipStatus = membership?.status ?? null;
  const restrictions = new Set(membership?.restrictions ?? []);
  const isManager = membershipRole === 'owner' || membershipRole === 'admin';
  const isActiveMember = membershipStatus === 'active';
  const isInvitedMember = membershipStatus === 'invited';
  const isCreator = meta.createdByUserId === viewerUserId;
  const canViewClub = meta.privacy !== 'private' || isActiveMember || isInvitedMember || isManager || isCreator;

  return {
    canViewClub,
    canJoinClub: !isActiveMember && (meta.privacy === 'open' || isInvitedMember),
    canRequestJoin: meta.privacy === 'request' && membershipStatus !== 'pending' && !isActiveMember,
    canManageClub: isManager || isCreator,
    canModerateMembers: isManager || isCreator,
    canCreatePosts: canViewClub && isActiveMember && !restrictions.has('posting_blocked'),
    canComment: canViewClub && isActiveMember && !restrictions.has('comment_blocked'),
    canInviteMembers: isManager || isCreator,
    membershipStatus,
    membershipRole,
  };
}

export async function getCachedClubMeta(clubId: string): Promise<CachedClubMeta | null> {
  return getSoftCachedValue({
    key: clubMetaKey(clubId),
    loader: () => loadClubMetaFromDb(clubId),
    softTtlSeconds: CLUB_META_SOFT_TTL_SECONDS,
    hardTtlSeconds: CLUB_META_HARD_TTL_SECONDS,
  });
}

export async function getCachedClubStats(clubId: string): Promise<CachedClubStats | null> {
  const cached = await cacheHGetAll(clubStatsKey(clubId));
  if (cached) {
    return {
      memberCount: Number(cached.memberCount ?? 0),
      postCount: Number(cached.postCount ?? 0),
    };
  }

  const stats = await loadClubStatsFromDb(clubId);
  if (!stats) return null;

  await cacheHashSet(
    clubStatsKey(clubId),
    {
      memberCount: stats.memberCount,
      postCount: stats.postCount,
    },
    CLUB_STATS_TTL_SECONDS,
  );
  return stats;
}

export async function getCachedClubMembership(clubId: string, userId: string): Promise<CachedClubMembership | null> {
  return getSoftCachedValue({
    key: clubMembershipKey(clubId, userId),
    loader: () => loadClubMembershipFromDb(clubId, userId),
    softTtlSeconds: CLUB_MEMBERSHIP_SOFT_TTL_SECONDS,
    hardTtlSeconds: CLUB_MEMBERSHIP_HARD_TTL_SECONDS,
  });
}

export async function getCachedClubPermissionSnapshot(
  clubId: string,
  viewerUserId: string,
): Promise<ClubPermissionSnapshot | null> {
  const [meta, membership] = await Promise.all([
    getCachedClubMeta(clubId),
    getCachedClubMembership(clubId, viewerUserId),
  ]);

  if (!meta) return null;
  return buildPermissionSnapshot(meta, membership, viewerUserId);
}

export async function getCachedClubFeedPostIds(params: {
  clubId: string;
  sort?: ClubFeedSort;
  limit: number;
  offset: number;
}): Promise<string[]> {
  const { clubId, sort = 'latest', limit, offset } = params;
  const key = clubFeedKey(clubId, sort);
  const softTtlSeconds =
    sort === 'trending' ? CLUB_FEED_TRENDING_SOFT_TTL_SECONDS : CLUB_FEED_LATEST_SOFT_TTL_SECONDS;
  const hardTtlSeconds =
    sort === 'trending' ? CLUB_FEED_TRENDING_HARD_TTL_SECONDS : CLUB_FEED_LATEST_HARD_TTL_SECONDS;
  const warmLimit = Math.max(limit + offset, limit);
  const cached = await getSoftCachedValue({
    key,
    loader: () => loadClubFeedPostIdsFromDb(clubId, sort, warmLimit, 0),
    softTtlSeconds,
    hardTtlSeconds,
    allowEmpty: false,
  });

  if (cached && cached.length >= offset) {
    return cached.slice(offset, offset + limit);
  }

  return loadClubFeedPostIdsFromDb(clubId, sort, limit, offset);
}

export async function invalidateClubMetaCache(clubId: string): Promise<void> {
  await cacheDelete(clubMetaKey(clubId));
}

export async function invalidateClubStatsCache(clubId: string): Promise<void> {
  await cacheDelete(clubStatsKey(clubId));
}

export async function invalidateClubMembershipCache(clubId: string, userId: string): Promise<void> {
  await cacheDelete(clubMembershipKey(clubId, userId));
}

export async function invalidateClubFeedCaches(clubId: string): Promise<void> {
  await cacheDelete(
    clubFeedKey(clubId, 'latest'),
    clubFeedKey(clubId, 'trending'),
  );
}

export async function incrementClubStat(
  clubId: string,
  field: keyof CachedClubStats,
  amount: number,
): Promise<void> {
  await cacheHashIncrementBy(clubStatsKey(clubId), field, amount, CLUB_STATS_TTL_SECONDS);
}

export async function purgeClubCaches(clubId: string, memberUserIds: string[] = []): Promise<void> {
  await cacheDelete(
    clubMetaKey(clubId),
    clubStatsKey(clubId),
    clubFeedKey(clubId, 'latest'),
    clubFeedKey(clubId, 'trending'),
    ...memberUserIds.map((userId) => clubMembershipKey(clubId, userId)),
  );
}

export async function getCachedClubView(clubId: string, viewerUserId: string): Promise<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  privacy: ClubPrivacy;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  primaryCategory: {
    id: string;
    displayName: string | null;
  } | null;
  tags: string[];
  memberCount: number;
  postCount: number;
  membership: {
    status: ClubMembershipStatus | null;
    role: ClubMembershipRole | null;
  };
  permissions: ClubPermissionSnapshot;
} | null> {
  const [meta, stats, membership] = await Promise.all([
    getCachedClubMeta(clubId),
    getCachedClubStats(clubId),
    getCachedClubMembership(clubId, viewerUserId),
  ]);

  if (!meta) return null;
  const permissions = buildPermissionSnapshot(meta, membership, viewerUserId);

  return {
    id: meta.clubId,
    name: meta.name,
    slug: meta.slug,
    shortDescription: meta.shortDescription,
    description: meta.description,
    privacy: meta.privacy,
    avatarUrl: meta.avatarUrl,
    coverImageUrl: meta.coverImageUrl,
    createdByUserId: meta.createdByUserId,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    primaryCategory: meta.primaryCategory,
    tags: meta.tags,
    memberCount: stats?.memberCount ?? meta.memberCount,
    postCount: stats?.postCount ?? 0,
    membership: {
      status: membership?.status ?? null,
      role: membership?.role ?? null,
    },
    permissions,
  };
}
