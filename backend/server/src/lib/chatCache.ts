import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import {
  cacheDelete,
  cacheGetJson,
  cacheHashGet,
  cacheHashIncrementBy,
  cacheHashMultiGet,
  cacheHashSet,
  cacheHGetAll,
  cacheSetJson,
  isRedisConfigured,
} from './cache';
import { decryptMessage } from './encryption';

export type ChatConversationListType = 'active' | 'requests';

export interface ChatCachedReplyPreview {
  id: string;
  senderId: string;
  type: string;
  content: string | null;
  attachmentUrl: string | null;
}

export interface ChatCachedAttachment {
  fileUrl: string;
  fileType: string;
}

export interface ChatCachedMessage {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string | null;
  reactions: Record<string, string[]>;
  timestamp: string;
  attachments: ChatCachedAttachment[];
  replyToMessageId: string | null;
  replyTo: ChatCachedReplyPreview | null;
}

export interface ChatConversationMetaCache {
  conversationId: string;
  lastMessageId: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  isRequest: boolean;
  participantIds: string[];
  lastNonDeletedMessageId: string | null;
}

export interface ChatConversationListEntry {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar: string | null;
  lastMessage: string;
  timestamp: string;
  isRequest: boolean;
  isGroup?: boolean;
}

export interface ChatPresenceState {
  isOnline: boolean;
  lastSeenAt: string | null;
}

interface ConversationMetaRow {
  chat_id: string;
  is_request: boolean;
  updated_at: Date;
  participant_ids: string[];
  message_id: string | null;
  message_type: string | null;
  content: string | null;
  created_at: Date | null;
}

interface UnreadCountRow {
  chat_id: string;
  unread_count: number;
}

const CHAT_RECENT_MESSAGES_TTL_SECONDS = 60 * 5;
const CHAT_META_TTL_SECONDS = 60 * 10;
const CHAT_LIST_TTL_SECONDS = 60 * 2;
const CHAT_UNREAD_TTL_SECONDS = 60 * 10;
const CHAT_READ_TTL_SECONDS = 60 * 10;
const CHAT_PRESENCE_TTL_SECONDS = 60 * 3;
const CHAT_RECENT_WINDOW_SIZE = 100;
const CHAT_RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;

const recentActiveConversations = new Set<string>();
let reconciliationIntervalStarted = false;

function recentMessagesKey(conversationId: string): string {
  return `chat:conv:${conversationId}:recent`;
}

function conversationMetaKey(conversationId: string): string {
  return `chat:conv:${conversationId}:meta`;
}

function userConversationListKey(userId: string, type: ChatConversationListType): string {
  return `chat:user:${userId}:chatlist:${type}`;
}

function userUnreadKey(userId: string): string {
  return `chat:user:${userId}:unread`;
}

function conversationReadKey(conversationId: string): string {
  return `chat:conv:${conversationId}:read`;
}

function userPresenceKey(userId: string): string {
  return `chat:user:${userId}:presence`;
}

function normalizeReactions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const reactions: Record<string, string[]> = {};
  for (const [emoji, userIds] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(userIds)) continue;
    const normalizedIds = userIds.filter((item): item is string => typeof item === 'string');
    if (normalizedIds.length > 0) {
      reactions[emoji] = Array.from(new Set(normalizedIds));
    }
  }

  return reactions;
}

export function formatMessagePreview(
  messageType: string,
  content: string | null | undefined,
): string {
  if (messageType === 'image') return 'Photo';
  if (messageType === 'file') return 'File';
  return content?.trim() || 'No messages yet';
}

export function noteConversationActivity(conversationId: string): void {
  recentActiveConversations.add(conversationId);
}

export function getChatRecentWindowSize(): number {
  return CHAT_RECENT_WINDOW_SIZE;
}

export async function getCachedRecentMessages(
  conversationId: string,
): Promise<ChatCachedMessage[] | null> {
  return cacheGetJson<ChatCachedMessage[]>(recentMessagesKey(conversationId));
}

export async function setCachedRecentMessages(
  conversationId: string,
  messages: ChatCachedMessage[],
): Promise<void> {
  const deduped = new Map<string, ChatCachedMessage>();
  for (const message of messages) {
    deduped.set(message.id, message);
  }

  const sorted = Array.from(deduped.values())
    .sort((left, right) => {
      const timeDiff =
        new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return left.id.localeCompare(right.id);
    })
    .slice(-CHAT_RECENT_WINDOW_SIZE);

  await cacheSetJson(
    recentMessagesKey(conversationId),
    sorted,
    CHAT_RECENT_MESSAGES_TTL_SECONDS,
  );
}

export async function appendRecentMessage(
  conversationId: string,
  message: ChatCachedMessage,
): Promise<void> {
  const existing = (await getCachedRecentMessages(conversationId)) ?? [];
  if (existing.some((entry) => entry.id === message.id)) {
    await setCachedRecentMessages(
      conversationId,
      existing.map((entry) => (entry.id === message.id ? message : entry)),
    );
    return;
  }

  await setCachedRecentMessages(conversationId, [...existing, message]);
}

export async function patchRecentMessage(
  conversationId: string,
  messageId: string,
  updater: (message: ChatCachedMessage) => ChatCachedMessage,
): Promise<void> {
  const existing = await getCachedRecentMessages(conversationId);
  if (!existing) return;

  let changed = false;
  const next = existing.map((message) => {
    if (message.id !== messageId) return message;
    changed = true;
    return updater(message);
  });

  if (!changed) return;
  await setCachedRecentMessages(conversationId, next);
}

export async function removeRecentMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const existing = await getCachedRecentMessages(conversationId);
  if (!existing) return;

  const next = existing.filter((message) => message.id !== messageId);
  if (next.length === existing.length) return;
  await setCachedRecentMessages(conversationId, next);
}

export async function getConversationMeta(
  conversationId: string,
): Promise<ChatConversationMetaCache | null> {
  return cacheGetJson<ChatConversationMetaCache>(conversationMetaKey(conversationId));
}

export async function setConversationMeta(
  conversationId: string,
  meta: ChatConversationMetaCache,
): Promise<void> {
  await cacheSetJson(conversationMetaKey(conversationId), meta, CHAT_META_TTL_SECONDS);
}

export async function patchConversationMeta(
  conversationId: string,
  updater: (meta: ChatConversationMetaCache) => ChatConversationMetaCache,
): Promise<void> {
  const meta = await getConversationMeta(conversationId);
  if (!meta) return;
  await setConversationMeta(conversationId, updater(meta));
}

export async function getConversationList(
  userId: string,
  type: ChatConversationListType,
): Promise<ChatConversationListEntry[] | null> {
  return cacheGetJson<ChatConversationListEntry[]>(userConversationListKey(userId, type));
}

export async function setConversationList(
  userId: string,
  type: ChatConversationListType,
  entries: ChatConversationListEntry[],
): Promise<void> {
  const sorted = [...entries].sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
  await cacheSetJson(
    userConversationListKey(userId, type),
    sorted,
    CHAT_LIST_TTL_SECONDS,
  );
}

export async function patchConversationList(
  userId: string,
  type: ChatConversationListType,
  updater: (entries: ChatConversationListEntry[]) => ChatConversationListEntry[],
): Promise<void> {
  const current = await getConversationList(userId, type);
  if (!current) return;
  await setConversationList(userId, type, updater(current));
}

export async function invalidateConversationLists(
  userIds: string[],
  types: ChatConversationListType[] = ['active', 'requests'],
): Promise<void> {
  const keys = Array.from(new Set(userIds)).flatMap((userId) =>
    types.map((type) => userConversationListKey(userId, type)),
  );
  if (keys.length === 0) return;
  await cacheDelete(...keys);
}

export async function getUnreadCount(
  userId: string,
  conversationId: string,
): Promise<number | null> {
  const value = await cacheHashGet(userUnreadKey(userId), conversationId);
  return value === null ? null : Number(value);
}

export async function getUnreadCounts(
  userId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (conversationIds.length === 0) return result;

  const values = await cacheHashMultiGet(userUnreadKey(userId), conversationIds);
  conversationIds.forEach((conversationId, index) => {
    const value = values[index];
    if (value !== null) {
      result.set(conversationId, Number(value));
    }
  });

  return result;
}

export async function setUnreadCount(
  userId: string,
  conversationId: string,
  unreadCount: number,
): Promise<void> {
  await cacheHashSet(
    userUnreadKey(userId),
    { [conversationId]: Math.max(unreadCount, 0) },
    CHAT_UNREAD_TTL_SECONDS,
  );
}

export async function incrementUnreadCount(
  userId: string,
  conversationId: string,
  amount = 1,
): Promise<number | null> {
  return cacheHashIncrementBy(
    userUnreadKey(userId),
    conversationId,
    amount,
    CHAT_UNREAD_TTL_SECONDS,
  );
}

export async function getReadState(
  conversationId: string,
): Promise<Record<string, string> | null> {
  return cacheHGetAll(conversationReadKey(conversationId));
}

export async function setReadState(
  conversationId: string,
  userId: string,
  messageId: string,
): Promise<void> {
  await cacheHashSet(
    conversationReadKey(conversationId),
    { [userId]: messageId },
    CHAT_READ_TTL_SECONDS,
  );
}

export async function getUserPresence(
  userId: string,
): Promise<ChatPresenceState | null> {
  return cacheGetJson<ChatPresenceState>(userPresenceKey(userId));
}

export async function getUserPresenceMap(
  userIds: string[],
): Promise<Map<string, ChatPresenceState>> {
  const result = new Map<string, ChatPresenceState>();
  await Promise.all(
    Array.from(new Set(userIds)).map(async (userId) => {
      const presence = await getUserPresence(userId);
      if (presence) {
        result.set(userId, presence);
      }
    }),
  );
  return result;
}

export async function setUserPresence(
  userId: string,
  presence: ChatPresenceState,
): Promise<void> {
  await cacheSetJson(userPresenceKey(userId), presence, CHAT_PRESENCE_TTL_SECONDS);
}

export async function warmConversationCachesFromDb(
  conversationIds: string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(conversationIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;
  await Promise.all(uniqueIds.map((conversationId) => reconcileConversationMeta(conversationId)));
}

export async function reconcileConversationMeta(
  conversationId: string,
): Promise<ChatConversationMetaCache | null> {
  const rows = await prisma.$queryRaw<ConversationMetaRow[]>`
    SELECT
      c.chat_id,
      c.is_request,
      c.updated_at,
      ARRAY(
        SELECT cp.user_id
        FROM chat_participants cp
        WHERE cp.chat_id = c.chat_id
          AND cp.left_at IS NULL
        ORDER BY cp.user_id ASC
      )::text[] AS participant_ids,
      last_message.message_id,
      last_message.message_type,
      last_message.content,
      last_message.created_at
    FROM chats c
    LEFT JOIN LATERAL (
      SELECT m.message_id, m.message_type, m.content, m.created_at
      FROM messages m
      WHERE m.chat_id = c.chat_id
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC, m.message_id DESC
      LIMIT 1
    ) last_message ON TRUE
    WHERE c.chat_id = ${conversationId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    await cacheDelete(conversationMetaKey(conversationId), recentMessagesKey(conversationId));
    return null;
  }

  const meta: ChatConversationMetaCache = {
    conversationId,
    lastMessageId: row.message_id,
    lastMessagePreview: formatMessagePreview(
      row.message_type ?? 'text',
      row.content ? decryptMessage(row.content) : null,
    ),
    lastMessageAt: (row.created_at ?? row.updated_at).toISOString(),
    isRequest: row.is_request,
    participantIds: Array.isArray(row.participant_ids) ? row.participant_ids : [],
    lastNonDeletedMessageId: row.message_id,
  };

  await setConversationMeta(conversationId, meta);
  noteConversationActivity(conversationId);
  return meta;
}

export async function reconcileUnreadState(
  conversationId: string,
  userId: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<UnreadCountRow[]>`
    SELECT COUNT(m.message_id)::int AS unread_count, ${conversationId}::uuid AS chat_id
    FROM chat_participants cp
    LEFT JOIN messages last_read
      ON last_read.message_id = cp.last_read_message_id
    LEFT JOIN messages m
      ON m.chat_id = cp.chat_id
     AND m.deleted_at IS NULL
     AND m.sender_user_id != ${userId}
     AND (
       cp.last_read_message_id IS NULL
       OR last_read.created_at IS NULL
       OR m.created_at > last_read.created_at
     )
    WHERE cp.chat_id = ${conversationId}
      AND cp.user_id = ${userId}
      AND cp.left_at IS NULL
    GROUP BY cp.chat_id
  `;

  const unreadCount = rows[0]?.unread_count ?? 0;
  await setUnreadCount(userId, conversationId, unreadCount);
  return unreadCount;
}

export async function primeConversationUnreadState(
  userId: string,
  unreadCounts: Array<{ conversationId: string; unreadCount: number }>,
): Promise<void> {
  if (unreadCounts.length === 0) return;
  const fields = Object.fromEntries(
    unreadCounts.map((entry) => [entry.conversationId, entry.unreadCount]),
  );
  await cacheHashSet(userUnreadKey(userId), fields, CHAT_UNREAD_TTL_SECONDS);
}

export async function refreshConversationMetaFromRecentCache(
  conversationId: string,
): Promise<ChatConversationMetaCache | null> {
  const recent = await getCachedRecentMessages(conversationId);
  if (!recent || recent.length === 0) {
    return reconcileConversationMeta(conversationId);
  }

  const cachedMeta = await getConversationMeta(conversationId);
  if (!cachedMeta) {
    return reconcileConversationMeta(conversationId);
  }

  const lastMessage = recent[recent.length - 1];
  const nextMeta: ChatConversationMetaCache = {
    ...cachedMeta,
    lastMessageId: lastMessage.id,
    lastMessagePreview: formatMessagePreview(lastMessage.type, lastMessage.content),
    lastMessageAt: lastMessage.timestamp,
    lastNonDeletedMessageId: lastMessage.id,
  };
  await setConversationMeta(conversationId, nextMeta);
  return nextMeta;
}

export async function maybeStartChatCacheReconciler(): Promise<void> {
  if (reconciliationIntervalStarted) return;
  if (!isRedisConfigured()) return;

  reconciliationIntervalStarted = true;
  setInterval(() => {
    const targetConversationIds = Array.from(recentActiveConversations);
    recentActiveConversations.clear();
    if (targetConversationIds.length === 0) return;

    void Promise.all(
      targetConversationIds.map(async (conversationId) => {
        try {
          await reconcileConversationMeta(conversationId);
        } catch (err) {
          console.warn('Failed to reconcile chat conversation cache:', err);
        }
      }),
    );
  }, CHAT_RECONCILIATION_INTERVAL_MS);
}

export async function fetchConversationMetaMap(
  conversationIds: string[],
): Promise<Map<string, ChatConversationMetaCache>> {
  const metaMap = new Map<string, ChatConversationMetaCache>();
  await Promise.all(
    Array.from(new Set(conversationIds)).map(async (conversationId) => {
      let meta = await getConversationMeta(conversationId);
      if (!meta) {
        meta = await reconcileConversationMeta(conversationId);
      }
      if (meta) {
        metaMap.set(conversationId, meta);
      }
    }),
  );
  return metaMap;
}

export async function fetchLatestMessagesForConversations(
  conversationIds: string[],
): Promise<Map<string, ChatCachedMessage>> {
  const result = new Map<string, ChatCachedMessage>();
  const uniqueIds = Array.from(new Set(conversationIds.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  const rows = await prisma.$queryRaw<
    Array<{
      chat_id: string;
      message_id: string;
      sender_user_id: string;
      message_type: string;
      content: string | null;
      reactions: unknown;
      created_at: Date;
      reply_to_message_id: string | null;
    }>
  >`
    SELECT DISTINCT ON (m.chat_id)
      m.chat_id,
      m.message_id,
      m.sender_user_id,
      m.message_type,
      m.content,
      m.reactions,
      m.created_at,
      m.reply_to_message_id
    FROM messages m
    WHERE m.chat_id IN (${Prisma.join(uniqueIds)})
      AND m.deleted_at IS NULL
    ORDER BY m.chat_id, m.created_at DESC, m.message_id DESC
  `;

  const messageIds = rows.map((row) => row.message_id);
  const attachments = await prisma.$queryRaw<
    Array<{ message_id: string; file_url: string; file_type: string }>
  >`
    SELECT message_id, file_url, file_type
    FROM message_attachments
    WHERE message_id IN (${Prisma.join(messageIds.length > 0 ? messageIds : ['00000000-0000-0000-0000-000000000000'])})
    ORDER BY created_at ASC
  `;

  const attachmentsByMessageId = new Map<string, ChatCachedAttachment[]>();
  for (const attachment of attachments) {
    const bucket = attachmentsByMessageId.get(attachment.message_id) ?? [];
    bucket.push({ fileUrl: attachment.file_url, fileType: attachment.file_type });
    attachmentsByMessageId.set(attachment.message_id, bucket);
  }

  for (const row of rows) {
    result.set(row.chat_id, {
      id: row.message_id,
      chatId: row.chat_id,
      senderId: row.sender_user_id,
      type: row.message_type,
      content: row.content ? decryptMessage(row.content) : null,
      reactions: normalizeReactions(row.reactions),
      timestamp: row.created_at.toISOString(),
      attachments: attachmentsByMessageId.get(row.message_id) ?? [],
      replyToMessageId: row.reply_to_message_id,
      replyTo: null,
    });
  }

  return result;
}
