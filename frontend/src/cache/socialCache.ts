import type { Club, Student } from '../types';
import type { ApiUserProfile } from '../types';
import type { FollowGraphResponse } from '../lib/networkApi';
import type { ApiNotification } from '../lib/notificationsApi';
import type { ConversationApiResponse } from '../lib/chatApi';
import type { UserPost, CommentsPage } from '../lib/postsApi';
import { cacheKeys } from './keys';
import { cachePolicies } from './policies';
import {
  createPageEntry,
  invalidateCache,
  patchCacheEntry,
  readCacheEntries,
  readCacheEntry,
  writeCacheEntry,
} from './client';
import { fetchWithCache } from './resource';

function versionFromUpdatedAt(value: { updatedAt?: string | null; createdAt?: string | null }): string {
  return value.updatedAt ?? value.createdAt ?? String(Date.now());
}

function listVersion(values: Array<{ updatedAt?: string | null; createdAt?: string | null }>): string {
  return values
    .map((value) => value.updatedAt ?? value.createdAt ?? '')
    .sort()
    .at(-1) ?? String(Date.now());
}

export async function cacheUserProfile(profile: ApiUserProfile): Promise<void> {
  await writeCacheEntry(
    {
      key: cacheKeys.entity.userProfile(profile.userId),
      data: profile,
      createdAt: Date.now(),
      updatedAt: Date.parse(profile.createdAt) || Date.now(),
      expiresAt: Date.now() + cachePolicies.userProfile.ttlMs,
      version: profile.createdAt ?? String(Date.now()),
      source: 'network',
      stale: false,
      syncState: 'full',
      lastAccessedAt: Date.now(),
    },
    cachePolicies.userProfile,
  );
}

export async function readCachedUserProfile(userId: string): Promise<ApiUserProfile | null> {
  const cached = await readCacheEntry<ApiUserProfile>(cacheKeys.entity.userProfile(userId));
  return cached?.data ?? null;
}

export async function cacheStudents(users: Student[]): Promise<void> {
  await Promise.all(
    users.map((user) =>
      writeCacheEntry(
        {
          key: cacheKeys.entity.user(user.id),
          data: user,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: Date.now() + cachePolicies.user.ttlMs,
          version: user.createdAt ?? String(Date.now()),
          source: 'network',
          stale: false,
          syncState: 'full',
          lastAccessedAt: Date.now(),
        },
        cachePolicies.user,
      ),
    ),
  );
}

export async function readCachedStudent(userId: string): Promise<Student | null> {
  const cached = await readCacheEntry<Student>(cacheKeys.entity.user(userId));
  return cached?.data ?? null;
}

export async function cachePosts(posts: UserPost[]): Promise<void> {
  await Promise.all(
    posts.map((post) =>
      writeCacheEntry(
        {
          key: cacheKeys.entity.post(post.id),
          data: post,
          createdAt: Date.now(),
          updatedAt: Date.parse(post.updatedAt || post.createdAt) || Date.now(),
          expiresAt: Date.now() + cachePolicies.post.ttlMs,
          version: versionFromUpdatedAt(post),
          source: 'network',
          stale: false,
          syncState: 'full',
          lastAccessedAt: Date.now(),
        },
        cachePolicies.post,
      ),
    ),
  );
}

export async function readCachedPost(postId: string): Promise<UserPost | null> {
  const cached = await readCacheEntry<UserPost>(cacheKeys.entity.post(postId));
  return cached?.data ?? null;
}

export async function readCachedPosts(ids: string[]): Promise<UserPost[]> {
  const entries = await readCacheEntries<UserPost>(ids.map((id) => cacheKeys.entity.post(id)));
  return entries
    .map((entry) => entry?.data ?? null)
    .filter((entry): entry is UserPost => Boolean(entry));
}

export async function cacheFeedPage(params: {
  key: string;
  pageParam: string;
  posts: UserPost[];
  hasMore: boolean;
  nextOffset: number | null;
}): Promise<void> {
  await cachePosts(params.posts);
  await writeCacheEntry(
    createPageEntry({
      key: params.key,
      ids: params.posts.map((post) => post.id),
      pageParam: params.pageParam,
      policy: cachePolicies.feedPage,
      hasMore: params.hasMore,
      nextOffset: params.nextOffset,
      entityType: 'post',
      version: listVersion(params.posts),
      updatedAt: Date.now(),
    }),
    cachePolicies.feedPage,
  );
}

export async function readCachedFeedPage(key: string): Promise<{
  posts: UserPost[];
  hasMore: boolean;
  nextOffset: number | null;
} | null> {
  const cached = await readCacheEntry<PaginatedIds>(key);
  if (!cached) return null;

  const ids = Array.isArray((cached.data as unknown[])) ? (cached.data as string[]) : [];
  const posts = await readCachedPosts(ids);
  if (posts.length === 0) return null;

  const page = cached as unknown as { hasMore?: boolean; nextOffset?: number | null };
  return {
    posts,
    hasMore: Boolean(page.hasMore),
    nextOffset: page.nextOffset ?? null,
  };
}

type PaginatedIds = string[];

export async function cacheProfilePosts(userId: string, posts: UserPost[]): Promise<void> {
  await cachePosts(posts);
  await writeCacheEntry(
    createPageEntry({
      key: cacheKeys.page.userPosts(userId),
      ids: posts.map((post) => post.id),
      pageParam: userId,
      policy: cachePolicies.userProfile,
      hasMore: false,
      nextOffset: null,
      entityType: 'post',
      version: listVersion(posts),
      updatedAt: Date.now(),
    }),
    cachePolicies.userProfile,
  );
}

export async function readCachedProfilePosts(userId: string): Promise<UserPost[]> {
  const cached = await readCachedFeedPage(cacheKeys.page.userPosts(userId));
  return cached?.posts ?? [];
}

export async function cacheClub(club: Club): Promise<void> {
  await writeCacheEntry(
    {
      key: cacheKeys.entity.club(club.id),
      data: club,
      createdAt: Date.now(),
      updatedAt: Date.parse(club.updatedAt || club.createdAt) || Date.now(),
      expiresAt: Date.now() + cachePolicies.club.ttlMs,
      version: versionFromUpdatedAt(club),
      source: 'network',
      stale: false,
      syncState: 'full',
      lastAccessedAt: Date.now(),
    },
    cachePolicies.club,
  );
}

export async function cacheClubsList(key: string, clubs: Club[]): Promise<void> {
  await Promise.all(clubs.map((club) => cacheClub(club)));
  await writeCacheEntry(
    {
      key,
      data: clubs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + cachePolicies.clubPage.ttlMs,
      version: listVersion(clubs),
      source: 'network',
      stale: false,
      syncState: 'full',
      lastAccessedAt: Date.now(),
    },
    cachePolicies.clubPage,
  );
}

export async function readCachedClubsList(key: string): Promise<Club[]> {
  const cached = await readCacheEntry<Club[]>(key);
  return cached?.data ?? [];
}

export async function readCachedClub(id: string): Promise<Club | null> {
  const cached = await readCacheEntry<Club>(cacheKeys.entity.club(id));
  return cached?.data ?? null;
}

export async function cacheNotifications(notifications: ApiNotification[]): Promise<void> {
  await Promise.all(
    notifications.map((notification) =>
      writeCacheEntry(
        {
          key: cacheKeys.entity.notification(notification.id),
          data: notification,
          createdAt: Date.now(),
          updatedAt: Date.parse(notification.createdAt) || Date.now(),
          expiresAt: Date.now() + cachePolicies.notifications.ttlMs,
          version: notification.createdAt,
          source: 'network',
          stale: false,
          syncState: 'full',
          lastAccessedAt: Date.now(),
        },
        cachePolicies.notifications,
      ),
    ),
  );

  await writeCacheEntry(
    createPageEntry({
      key: cacheKeys.list.notifications(),
      ids: notifications.map((notification) => notification.id),
      pageParam: 'notifications',
      policy: cachePolicies.notifications,
      hasMore: false,
      nextOffset: null,
      entityType: 'notification',
      version: notifications[0]?.createdAt ?? String(Date.now()),
      updatedAt: Date.now(),
    }),
    cachePolicies.notifications,
  );
}

export async function readCachedNotifications(): Promise<ApiNotification[]> {
  const listEntry = await readCacheEntry<PaginatedIds>(cacheKeys.list.notifications());
  if (!listEntry) return [];
  const ids = Array.isArray(listEntry.data) ? listEntry.data : [];
  const notifications = await readCacheEntries<ApiNotification>(ids.map((id) => cacheKeys.entity.notification(id)));
  return notifications
    .map((entry) => entry?.data ?? null)
    .filter((entry): entry is ApiNotification => Boolean(entry));
}

export async function patchNotificationEntity(notification: ApiNotification): Promise<void> {
  await writeCacheEntry(
    {
      key: cacheKeys.entity.notification(notification.id),
      data: notification,
      createdAt: Date.now(),
      updatedAt: Date.parse(notification.createdAt) || Date.now(),
      expiresAt: Date.now() + cachePolicies.notifications.ttlMs,
      version: notification.createdAt,
      source: 'realtime',
      stale: false,
      syncState: 'partial',
      lastAccessedAt: Date.now(),
    },
    cachePolicies.notifications,
  );

  await patchCacheEntry<string[]>(
    cacheKeys.list.notifications(),
    cachePolicies.notifications,
    (current) => {
      const ids = current ?? [];
      if (ids.includes(notification.id)) return ids;
      return [notification.id, ...ids];
    },
    { source: 'realtime', version: notification.createdAt, syncState: 'partial' },
  );
}

export async function markNotificationCacheRead(notificationId: string): Promise<void> {
  await patchCacheEntry<ApiNotification>(
    cacheKeys.entity.notification(notificationId),
    cachePolicies.notifications,
    (current) => (current ? { ...current, read: true } : current),
    { source: 'optimistic', version: Date.now(), syncState: 'partial' },
  );
}

export async function markAllNotificationsCacheRead(): Promise<void> {
  const notifications = await readCachedNotifications();
  await Promise.all(notifications.map((notification) => markNotificationCacheRead(notification.id)));
}

export async function cacheConversationList(conversations: ConversationApiResponse[]): Promise<void> {
  await Promise.all(
    conversations.map((conversation) =>
      writeCacheEntry(
        {
          key: cacheKeys.entity.conversation(conversation.id),
          data: conversation,
          createdAt: Date.now(),
          updatedAt: Date.parse(conversation.timestamp) || Date.now(),
          expiresAt: Date.now() + cachePolicies.conversations.ttlMs,
          version: conversation.timestamp,
          source: 'network',
          stale: false,
          syncState: 'full',
          lastAccessedAt: Date.now(),
        },
        cachePolicies.conversations,
      ),
    ),
  );
  await writeCacheEntry(
    createPageEntry({
      key: cacheKeys.list.chatConversations(),
      ids: conversations.map((conversation) => conversation.id),
      pageParam: 'active',
      policy: cachePolicies.conversations,
      hasMore: false,
      nextOffset: null,
      entityType: 'conversation',
      version: conversations[0]?.timestamp ?? String(Date.now()),
      updatedAt: Date.now(),
    }),
    cachePolicies.conversations,
  );
}

export async function readCachedConversationList(): Promise<ConversationApiResponse[]> {
  const listEntry = await readCacheEntry<PaginatedIds>(cacheKeys.list.chatConversations());
  if (!listEntry) return [];
  const ids = Array.isArray(listEntry.data) ? listEntry.data : [];
  const entries = await readCacheEntries<ConversationApiResponse>(ids.map((id) => cacheKeys.entity.conversation(id)));
  return entries
    .map((entry) => entry?.data ?? null)
    .filter((entry): entry is ConversationApiResponse => Boolean(entry));
}

export async function cacheFollowGraph(userId: string, graph: FollowGraphResponse): Promise<void> {
  await writeCacheEntry(
    {
      key: cacheKeys.list.followGraph(userId),
      data: graph,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + cachePolicies.followGraph.ttlMs,
      version: String(Date.now()),
      source: 'network',
      stale: false,
      syncState: 'full',
      lastAccessedAt: Date.now(),
    },
    cachePolicies.followGraph,
  );
}

export async function readCachedFollowGraph(userId: string): Promise<FollowGraphResponse | null> {
  const cached = await readCacheEntry<FollowGraphResponse>(cacheKeys.list.followGraph(userId));
  return cached?.data ?? null;
}

export async function fetchCachedValue<T>(params: {
  key: string;
  policy: typeof cachePolicies[keyof typeof cachePolicies];
  fetcher: () => Promise<T>;
  onCached?: (value: T) => void;
  getVersion?: (value: T) => string | number | null | undefined;
  getUpdatedAt?: (value: T) => number | undefined;
  mode?: 'cache-first' | 'stale-while-revalidate' | 'network-only';
}): Promise<T> {
  return fetchWithCache<T>({
    key: params.key,
    policy: params.policy,
    fetcher: params.fetcher,
    onCached: params.onCached ? (value) => params.onCached?.(value) : undefined,
    getVersion: params.getVersion,
    getUpdatedAt: params.getUpdatedAt,
    mode: params.mode,
  });
}

export async function cacheCommentsPage(key: string, pageParam: string, page: CommentsPage): Promise<void> {
  await writeCacheEntry(
    {
      key,
      data: page,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + cachePolicies.commentsPage.ttlMs,
      version: listVersion(page.comments),
      source: 'network',
      stale: false,
      syncState: 'full',
      lastAccessedAt: Date.now(),
    },
    cachePolicies.commentsPage,
  );
}

export async function readCachedCommentsPage(key: string): Promise<CommentsPage | null> {
  const cached = await readCacheEntry<CommentsPage>(key);
  return cached?.data ?? null;
}

export async function invalidateFeedCaches(): Promise<void> {
  await invalidateCache({ reason: 'feed-reset', prefixes: ['page:feed:', 'page:user:', 'page:club:'] });
}
