import { Prisma } from '@prisma/client';
import express, { Request, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { chatMessageRateLimiter } from '../middleware/rateLimiter';
import {
  type ChatMessagePayload,
  type ChatReplyPreview,
  emitChatDelete,
  emitChatMessage,
  emitChatReaction,
  emitChatRead,
  emitChatRequestAccepted,
  getChatParticipantIds,
  getOrCreateDirectChat,
  isChatParticipant,
  markChatAccepted,
} from '../lib/chat';
import {
  appendRecentMessage,
  ChatCachedAttachment,
  type ChatCachedMessage,
  type ChatConversationListEntry,
  type ChatConversationListType,
  ChatConversationMetaCache,
  fetchLatestMessagesForConversations,
  formatMessagePreview,
  getCachedRecentMessages,
  getChatRecentWindowSize,
  getConversationList,
  getConversationMeta,
  getReadState,
  getUnreadCounts,
  getUserPresenceMap,
  incrementUnreadCount,
  invalidateConversationLists,
  noteConversationActivity,
  patchConversationList,
  patchConversationMeta,
  patchRecentMessage,
  primeConversationUnreadState,
  reconcileConversationMeta,
  reconcileUnreadState,
  refreshConversationMetaFromRecentCache,
  removeRecentMessage,
  setCachedRecentMessages,
  setConversationList,
  setConversationMeta,
  setReadState,
  setUnreadCount,
} from '../lib/chatCache';
import { decryptMessage, encryptMessage } from '../lib/encryption';
import { uploadChatMediaToStorage } from '../lib/objectStorage';
import { getUserSummariesByIds, getUserSummaryById } from '../lib/userCache';

const router = express.Router();
router.use(authenticateToken);

const CHAT_PAGE_DEFAULT_LIMIT = 12;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

interface ConversationBaseRow {
  chat_id: string;
  is_request: boolean;
  updated_at: Date;
  chat_type: string;
  chat_name: string | null;
  avatar_url: string | null;
  other_user_id: string | null;
}

interface ConversationUnreadRow {
  chat_id: string;
  unread_count: number;
}

interface MessageRow {
  message_id: string;
  sender_user_id: string;
  message_type: string;
  content: string | null;
  reactions: unknown;
  created_at: Date;
  reply_to_message_id: string | null;
}

interface AttachmentRow {
  message_id: string;
  file_url: string;
  file_type: string;
}

interface ReplyRow {
  message_id: string;
  sender_user_id: string;
  message_type: string;
  content: string | null;
  attachment_url: string | null;
}

interface MessageSeenRow {
  message_id: string;
  user_id: string;
}

interface MessagePageResult {
  messages: ChatCachedMessage[];
  hasMore: boolean;
}

function isValidUUID(uuid: string | undefined | null) {
  if (!uuid) return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

function normalizeReactions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const reactions: Record<string, string[]> = {};
  for (const [emoji, userIds] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(userIds)) continue;
    const safeIds = userIds.filter((id): id is string => typeof id === 'string');
    if (safeIds.length > 0) {
      reactions[emoji] = Array.from(new Set(safeIds));
    }
  }

  return reactions;
}

async function fetchConversationBaseRows(
  userId: string,
  isRequest: boolean,
): Promise<ConversationBaseRow[]> {
  return prisma.$queryRaw<ConversationBaseRow[]>`
    SELECT
      c.chat_id,
      c.is_request,
      c.updated_at,
      c.chat_type,
      c.name AS chat_name,
      c.avatar_url,
      cp_other.user_id AS other_user_id
    FROM chats c
    JOIN chat_participants cp_me
      ON cp_me.chat_id = c.chat_id
     AND cp_me.user_id = ${userId}
     AND cp_me.left_at IS NULL
    LEFT JOIN LATERAL (
      SELECT cp.user_id
      FROM chat_participants cp
      WHERE cp.chat_id = c.chat_id
        AND cp.user_id != ${userId}
        AND cp.left_at IS NULL
      ORDER BY cp.joined_at ASC
      LIMIT 1
    ) cp_other ON TRUE
    WHERE c.is_request = ${isRequest}
      AND (
        c.chat_type != 'direct'
        OR cp_other.user_id IS NOT NULL
      )
    ORDER BY c.updated_at DESC
  `;
}

async function fetchConversationUnreadRows(
  userId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (conversationIds.length === 0) return result;

  const rows = await prisma.$queryRaw<ConversationUnreadRow[]>`
    SELECT
      cp.chat_id,
      COUNT(m.message_id)::int AS unread_count
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
    WHERE cp.user_id = ${userId}
      AND cp.chat_id IN (${Prisma.join(conversationIds)})
      AND cp.left_at IS NULL
    GROUP BY cp.chat_id
  `;

  for (const row of rows) {
    result.set(row.chat_id, row.unread_count);
  }

  return result;
}

async function buildConversationListEntries(
  userId: string,
  type: ChatConversationListType,
): Promise<ChatConversationListEntry[]> {
  const isRequest = type === 'requests';
  const rows = await fetchConversationBaseRows(userId, isRequest);
  const conversationIds = rows.map((row) => row.chat_id);
  const latestMessages = await fetchLatestMessagesForConversations(conversationIds);
  const directParticipantIds = rows
    .map((row) => row.other_user_id)
    .filter((value): value is string => Boolean(value));
  const summaries = await getUserSummariesByIds(directParticipantIds);
  const unreadCounts = await fetchConversationUnreadRows(userId, conversationIds);

  await Promise.all(
    rows.map(async (row) => {
      const latestMessage = latestMessages.get(row.chat_id);
      const meta: ChatConversationMetaCache = {
        conversationId: row.chat_id,
        lastMessageId: latestMessage?.id ?? null,
        lastMessagePreview: latestMessage
          ? formatMessagePreview(latestMessage.type, latestMessage.content)
          : 'No messages yet',
        lastMessageAt: latestMessage?.timestamp ?? row.updated_at.toISOString(),
        isRequest: row.is_request,
        participantIds:
          row.chat_type === 'direct' && row.other_user_id
            ? [userId, row.other_user_id].sort()
            : await getChatParticipantIds(row.chat_id),
        lastNonDeletedMessageId: latestMessage?.id ?? null,
      };
      await setConversationMeta(row.chat_id, meta);
    }),
  );

  await primeConversationUnreadState(
    userId,
    rows.map((row) => ({
      conversationId: row.chat_id,
      unreadCount: unreadCounts.get(row.chat_id) ?? 0,
    })),
  );

  const participantIdsByConversationId = new Map<string, string[]>();
  await Promise.all(
    rows
      .filter((row) => row.chat_type === 'group')
      .map(async (row) => {
        participantIdsByConversationId.set(row.chat_id, await getChatParticipantIds(row.chat_id));
      }),
  );

  return rows
    .map<ChatConversationListEntry | null>((row) => {
      const latestMessage = latestMessages.get(row.chat_id);
      if (row.chat_type === 'group') {
        const participantIds = participantIdsByConversationId.get(row.chat_id) ?? [];
        return {
          id: row.chat_id,
          participantId: row.chat_id,
          participantName: row.chat_name ?? 'Group chat',
          participantAvatar: row.avatar_url,
          lastMessage: latestMessage
            ? formatMessagePreview(latestMessage.type, latestMessage.content)
            : 'No messages yet',
          timestamp: latestMessage?.timestamp ?? row.updated_at.toISOString(),
          isRequest: row.is_request,
          isGroup: true,
          groupMemberCount: Math.max(participantIds.length, 1),
        };
      }

      const participant = row.other_user_id ? summaries.get(row.other_user_id) : null;
      if (!participant || !row.other_user_id) return null;

      return {
        id: row.chat_id,
        participantId: row.other_user_id,
        participantName: participant.username,
        participantAvatar: participant.profilePictureUrl,
        lastMessage: latestMessage
          ? formatMessagePreview(latestMessage.type, latestMessage.content)
          : 'No messages yet',
        timestamp: latestMessage?.timestamp ?? row.updated_at.toISOString(),
        isRequest: row.is_request,
      };
    })
    .filter((entry): entry is ChatConversationListEntry => entry !== null);
}

async function hydrateConversationListResponse(
  userId: string,
  entries: ChatConversationListEntry[],
): Promise<
  Array<
    ChatConversationListEntry & {
      unread: number;
      isOnline: boolean;
      lastSeenAt: string | null;
    }
  >
> {
  const unreadMap = await getUnreadCounts(
    userId,
    entries.map((entry) => entry.id),
  );
  const missingUnreadIds = entries
    .map((entry) => entry.id)
    .filter((conversationId) => !unreadMap.has(conversationId));

  if (missingUnreadIds.length > 0) {
    await Promise.all(
      missingUnreadIds.map(async (conversationId) => {
        const unread = await reconcileUnreadState(conversationId, userId);
        unreadMap.set(conversationId, unread);
      }),
    );
  }

  const participantIds = entries.map((entry) => entry.participantId);
  const presenceMap = await getUserPresenceMap(participantIds);
  const summaries = await getUserSummariesByIds(participantIds);

  return entries
    .map((entry) => {
      const summary = summaries.get(entry.participantId);
      const presence = presenceMap.get(entry.participantId);

      return {
        ...entry,
        unread: unreadMap.get(entry.id) ?? 0,
        isOnline: presence?.isOnline ?? summary?.isOnline ?? false,
        lastSeenAt: presence?.lastSeenAt ?? summary?.lastSeenAt ?? null,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
}

async function fetchReplyPreview(
  chatId: string,
  messageId: string | null | undefined,
): Promise<ChatReplyPreview | null> {
  if (!messageId) return null;

  const rows = await prisma.$queryRaw<ReplyRow[]>`
    SELECT
      m.message_id,
      m.sender_user_id,
      m.message_type,
      m.content,
      (
        SELECT ma.file_url
        FROM message_attachments ma
        WHERE ma.message_id = m.message_id
        ORDER BY ma.created_at ASC
        LIMIT 1
      ) AS attachment_url
    FROM messages m
    WHERE m.chat_id = ${chatId}
      AND m.message_id = ${messageId}
      AND m.deleted_at IS NULL
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const sender = await getUserSummaryById(row.sender_user_id);
  return {
    id: row.message_id,
    senderId: row.sender_user_id,
    senderName: sender?.username ?? 'Unknown user',
    type: row.message_type,
    content: row.content ? decryptMessage(row.content) : null,
    attachmentUrl: row.attachment_url ?? null,
  };
}

async function fetchMessageRows(
  chatId: string,
  limit: number,
  before?: string,
): Promise<MessagePageResult> {
  const fetchLimit = limit + 1;
  let rows: MessageRow[];

  if (before) {
    const cursorRows = await prisma.$queryRaw<Array<{ created_at: Date; message_id: string }>>`
      SELECT created_at, message_id
      FROM messages
      WHERE message_id = ${before}
        AND chat_id = ${chatId}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (!cursorRows[0]) {
      throw new Error('INVALID_CURSOR');
    }

    const cursorCreatedAt = cursorRows[0].created_at;
    const cursorMessageId = cursorRows[0].message_id;
    rows = await prisma.$queryRaw<MessageRow[]>`
      SELECT
        m.message_id,
        m.sender_user_id,
        m.message_type,
        m.content,
        m.reactions,
        m.created_at,
        m.reply_to_message_id
      FROM messages m
      WHERE m.chat_id = ${chatId}
        AND m.deleted_at IS NULL
        AND (
          m.created_at < ${cursorCreatedAt}
          OR (m.created_at = ${cursorCreatedAt} AND m.message_id < ${cursorMessageId})
        )
      ORDER BY m.created_at DESC, m.message_id DESC
      LIMIT ${fetchLimit}
    `;
  } else {
    const warmLimit = Math.max(fetchLimit, getChatRecentWindowSize() + 1);
    rows = await prisma.$queryRaw<MessageRow[]>`
      SELECT
        m.message_id,
        m.sender_user_id,
        m.message_type,
        m.content,
        m.reactions,
        m.created_at,
        m.reply_to_message_id
      FROM messages m
      WHERE m.chat_id = ${chatId}
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC, m.message_id DESC
      LIMIT ${warmLimit}
    `;
  }

  const hasMore = rows.length > limit;
  const limitedRows = hasMore ? rows.slice(0, limit) : rows;
  limitedRows.reverse();

  const messageIds = limitedRows.map((row) => row.message_id);
  const replyIds = Array.from(
    new Set(
      limitedRows
        .map((row) => row.reply_to_message_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const attachmentRows =
    messageIds.length > 0
      ? await prisma.$queryRaw<AttachmentRow[]>`
          SELECT message_id, file_url, file_type
          FROM message_attachments
          WHERE message_id IN (${Prisma.join(messageIds)})
          ORDER BY created_at ASC
        `
      : [];

  const attachmentsByMessageId = new Map<string, ChatCachedAttachment[]>();
  for (const attachment of attachmentRows) {
    const bucket = attachmentsByMessageId.get(attachment.message_id) ?? [];
    bucket.push({ fileUrl: attachment.file_url, fileType: attachment.file_type });
    attachmentsByMessageId.set(attachment.message_id, bucket);
  }

  const replyRows =
    replyIds.length > 0
      ? await prisma.$queryRaw<ReplyRow[]>`
          SELECT
            m.message_id,
            m.sender_user_id,
            m.message_type,
            m.content,
            (
              SELECT ma.file_url
              FROM message_attachments ma
              WHERE ma.message_id = m.message_id
              ORDER BY ma.created_at ASC
              LIMIT 1
            ) AS attachment_url
          FROM messages m
          WHERE m.chat_id = ${chatId}
            AND m.message_id IN (${Prisma.join(replyIds)})
            AND m.deleted_at IS NULL
        `
      : [];

  const replyRowsById = new Map<string, ReplyRow>();
  replyRows.forEach((row) => replyRowsById.set(row.message_id, row));

  const messages = limitedRows.map<ChatCachedMessage>((row) => {
    const reply = row.reply_to_message_id
      ? replyRowsById.get(row.reply_to_message_id)
      : null;

    return {
      id: row.message_id,
      chatId,
      senderId: row.sender_user_id,
      type: row.message_type,
      content: row.content ? decryptMessage(row.content) : null,
      reactions: normalizeReactions(row.reactions),
      timestamp: row.created_at.toISOString(),
      attachments: attachmentsByMessageId.get(row.message_id) ?? [],
      replyToMessageId: row.reply_to_message_id,
      replyTo: reply
        ? {
            id: reply.message_id,
            senderId: reply.sender_user_id,
            type: reply.message_type,
            content: reply.content ? decryptMessage(reply.content) : null,
            attachmentUrl: reply.attachment_url ?? null,
          }
        : null,
    };
  });

  return { messages, hasMore };
}

async function hasOlderMessagesThan(
  chatId: string,
  oldestMessageId: string,
): Promise<boolean> {
  const cursorRows = await prisma.$queryRaw<Array<{ created_at: Date; message_id: string }>>`
    SELECT created_at, message_id
    FROM messages
    WHERE message_id = ${oldestMessageId}
      AND chat_id = ${chatId}
      AND deleted_at IS NULL
    LIMIT 1
  `;

  const cursorCreatedAt = cursorRows[0]?.created_at;
  const cursorMessageId = cursorRows[0]?.message_id;
  if (!cursorCreatedAt || !cursorMessageId) return false;

  const olderRows = await prisma.$queryRaw<Array<{ message_id: string }>>`
    SELECT message_id
    FROM messages
    WHERE chat_id = ${chatId}
      AND deleted_at IS NULL
      AND (
        created_at < ${cursorCreatedAt}
        OR (created_at = ${cursorCreatedAt} AND message_id < ${cursorMessageId})
      )
    LIMIT 1
  `;

  return Boolean(olderRows[0]);
}

async function formatMessagesForResponse(
  messages: ChatCachedMessage[],
  viewerUserId: string,
  seenByMessageId: Map<string, string[]>,
) {
  const senderIds = new Set<string>();
  for (const message of messages) {
    senderIds.add(message.senderId);
    if (message.replyTo?.senderId) {
      senderIds.add(message.replyTo.senderId);
    }
    for (const seenUserId of seenByMessageId.get(message.id) ?? []) {
      senderIds.add(seenUserId);
    }
  }

  const summaries = await getUserSummariesByIds(Array.from(senderIds));
  return messages.map((message) => ({
    id: message.id,
    senderId: message.senderId,
    senderName: summaries.get(message.senderId)?.username ?? 'Unknown user',
    senderAvatar: summaries.get(message.senderId)?.profilePictureUrl ?? null,
    type: message.type,
    content: message.content,
    reactions: message.reactions,
    timestamp: message.timestamp,
    attachments: message.attachments,
    replyToMessageId: message.replyToMessageId,
    replyTo: message.replyTo
      ? {
          ...message.replyTo,
          senderName:
            summaries.get(message.replyTo.senderId)?.username ?? 'Unknown user',
        }
      : null,
    seenBy: (seenByMessageId.get(message.id) ?? []).map((seenUserId) => ({
      userId: seenUserId,
      username: summaries.get(seenUserId)?.username ?? 'Unknown user',
      avatarUrl: summaries.get(seenUserId)?.profilePictureUrl ?? null,
    })),
    isOwn: message.senderId === viewerUserId,
  }));
}

async function fetchSeenByMap(
  chatId: string,
  viewerUserId: string,
  messageIds: string[],
): Promise<Map<string, string[]>> {
  const seenByMap = new Map<string, string[]>();
  if (messageIds.length === 0) return seenByMap;

  const rows = await prisma.$queryRaw<MessageSeenRow[]>`
    SELECT cp.last_read_message_id AS message_id, cp.user_id
    FROM chat_participants cp
    WHERE cp.chat_id = ${chatId}
      AND cp.left_at IS NULL
      AND cp.user_id != ${viewerUserId}
      AND cp.last_read_message_id IN (${Prisma.join(messageIds)})
  `;

  for (const row of rows) {
    const existing = seenByMap.get(row.message_id) ?? [];
    existing.push(row.user_id);
    seenByMap.set(row.message_id, existing);
  }

  return seenByMap;
}

async function fetchMessagesForRequest(
  chatId: string,
  limit: number,
  before?: string,
): Promise<MessagePageResult> {
  if (before) {
    return fetchMessageRows(chatId, limit, before);
  }

  const cached = await getCachedRecentMessages(chatId);
  if (cached && cached.length > 0) {
    const selected = cached.slice(-limit);
    const hasMore =
      cached.length > limit ||
      (selected.length > 0
        ? await hasOlderMessagesThan(chatId, selected[0].id)
        : false);

    return { messages: selected, hasMore };
  }

  const warmLimit = Math.max(limit, getChatRecentWindowSize());
  const fresh = await fetchMessageRows(chatId, warmLimit);
  if (fresh.messages.length > 0) {
    await setCachedRecentMessages(chatId, fresh.messages);
  }
  noteConversationActivity(chatId);

  const selected = fresh.messages.slice(-limit);
  const hasMore = fresh.messages.length > limit || fresh.hasMore;
  return { messages: selected, hasMore };
}

async function updateConversationListsForMessage(
  participantIds: string[],
  chatId: string,
  senderUserId: string,
  meta: ChatConversationMetaCache,
): Promise<void> {
  const type: ChatConversationListType = meta.isRequest ? 'requests' : 'active';

  await Promise.all(
    participantIds.map(async (viewerId) => {
      await patchConversationList(viewerId, type, (entries) => {
        const next = entries.map((entry) =>
          entry.id === chatId
            ? {
                ...entry,
                lastMessage: meta.lastMessagePreview,
                timestamp: meta.lastMessageAt,
              }
            : entry,
        );

        return next.sort(
          (left, right) =>
            new Date(right.timestamp).getTime() -
            new Date(left.timestamp).getTime(),
        );
      });

      if (viewerId !== senderUserId) {
        await incrementUnreadCount(viewerId, chatId, 1);
      }
    }),
  );
}

async function updateConversationListsForMeta(
  participantIds: string[],
  chatId: string,
  meta: ChatConversationMetaCache,
): Promise<void> {
  const type: ChatConversationListType = meta.isRequest ? 'requests' : 'active';
  await Promise.all(
    participantIds.map((viewerId) =>
      patchConversationList(viewerId, type, (entries) => {
        const next = entries.map((entry) =>
          entry.id === chatId
            ? {
                ...entry,
                lastMessage: meta.lastMessagePreview,
                timestamp: meta.lastMessageAt,
              }
            : entry,
        );

        return next.sort(
          (left, right) =>
            new Date(right.timestamp).getTime() -
            new Date(left.timestamp).getTime(),
        );
      }),
    ),
  );
}

async function persistMessage(
  chatId: string,
  userId: string,
  messageType: 'text' | 'image',
  content: string | null,
  replyToMessageId: string | null,
  attachments: ChatCachedAttachment[],
): Promise<{ messageId: string; createdAt: Date }> {
  const encryptedContent = content ? encryptMessage(content) : null;
  return prisma.$transaction(async (tx) => {
    const now = new Date().toISOString();
    const inserted = await tx.$queryRaw<Array<{ message_id: string; created_at: Date }>>`
      INSERT INTO messages (
        chat_id,
        sender_user_id,
        message_type,
        content,
        reply_to_message_id,
        created_at,
        updated_at
      )
      VALUES (
        ${chatId},
        ${userId},
        ${messageType},
        ${encryptedContent},
        ${replyToMessageId},
        ${now},
        ${now}
      )
      RETURNING message_id, created_at
    `;

    const messageId = inserted[0]?.message_id;
    const createdAt = inserted[0]?.created_at;
    if (!messageId || !createdAt) {
      throw new Error('Failed to persist message');
    }

    if (attachments.length > 0) {
      for (const attachment of attachments) {
        await tx.$queryRaw`
          INSERT INTO message_attachments (message_id, file_url, file_type)
          VALUES (${messageId}, ${attachment.fileUrl}, ${attachment.fileType})
        `;
      }
    }

    await tx.$queryRaw`
      UPDATE chats
      SET updated_at = ${createdAt}
      WHERE chat_id = ${chatId}
    `;

    return { messageId, createdAt };
  });
}

async function cacheAndEmitMessage(
  authed: AuthedRequest,
  chatId: string,
  payload: {
    messageId: string;
    createdAt: Date;
    senderUserId: string;
    messageType: 'text' | 'image';
    content: string | null;
    replyToMessageId: string | null;
    replyTo: ChatReplyPreview | null;
    attachments: ChatCachedAttachment[];
  },
): Promise<void> {
  const meta = (await getConversationMeta(chatId)) ?? (await reconcileConversationMeta(chatId));
  const participantIds = meta?.participantIds?.length
    ? meta.participantIds
    : await getChatParticipantIds(chatId);

  const recentMessage: ChatCachedMessage = {
    id: payload.messageId,
    chatId,
    senderId: payload.senderUserId,
    type: payload.messageType,
    content: payload.content,
    reactions: {},
    timestamp: payload.createdAt.toISOString(),
    attachments: payload.attachments,
    replyToMessageId: payload.replyToMessageId,
    replyTo: payload.replyTo
      ? {
          id: payload.replyTo.id,
          senderId: payload.replyTo.senderId,
          type: payload.replyTo.type,
          content: payload.replyTo.content,
          attachmentUrl: payload.replyTo.attachmentUrl,
        }
      : null,
  };

  try {
    await appendRecentMessage(chatId, recentMessage);
    const nextMeta: ChatConversationMetaCache = {
      conversationId: chatId,
      lastMessageId: payload.messageId,
      lastMessagePreview: formatMessagePreview(payload.messageType, payload.content),
      lastMessageAt: payload.createdAt.toISOString(),
      isRequest: meta?.isRequest ?? false,
      participantIds,
      lastNonDeletedMessageId: payload.messageId,
    };
    await setConversationMeta(chatId, nextMeta);
    await updateConversationListsForMessage(
      participantIds,
      chatId,
      payload.senderUserId,
      nextMeta,
    );
  } catch (err) {
    console.warn('Failed to update chat cache after message send:', err);
  }

  noteConversationActivity(chatId);
  const sender = await getUserSummaryById(payload.senderUserId);
  emitChatMessage(participantIds, {
    messageId: payload.messageId,
    chatId,
    senderUserId: payload.senderUserId,
    senderUsername: sender?.username ?? authed.auth?.username ?? 'Unknown user',
    senderProfilePhotoUrl: sender?.profilePictureUrl ?? null,
    messageType: payload.messageType,
    content: payload.content,
    reactions: {},
    replyToMessageId: payload.replyToMessageId,
    replyTo: payload.replyTo,
    attachments: payload.attachments,
    createdAt: payload.createdAt.toISOString(),
  });
}

router.get('/conversations', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const type = req.query.type === 'requests' ? 'requests' : 'active';

  try {
    let entries = await getConversationList(userId, type);
    if (!entries) {
      entries = await buildConversationListEntries(userId, type);
      await setConversationList(userId, type, entries);
    }

    const conversations = await hydrateConversationListResponse(userId, entries);
    return res.status(200).json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/conversations', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const { targetUserId } = req.body;

  if (!targetUserId) {
    return res.status(400).json({ message: 'targetUserId is required' });
  }
  if (!isValidUUID(targetUserId)) {
    return res.status(400).json({ message: 'Invalid target user ID format' });
  }
  if (targetUserId === currentUserId) {
    return res.status(400).json({ message: 'Cannot chat with yourself' });
  }

  try {
    const result = await getOrCreateDirectChat(currentUserId, targetUserId);
    if (!result) {
      return res.status(403).json({ message: 'You cannot message this user' });
    }

    if (result.isNew) {
      await invalidateConversationLists(
        [currentUserId, targetUserId],
        result.isRequest ? ['requests'] : ['active'],
      );
      await reconcileConversationMeta(result.chatId);
    }

    return res.status(200).json({
      chatId: result.chatId,
      isRequest: result.isRequest,
      isNew: result.isNew,
    });
  } catch (err) {
    console.error('Error creating/getting conversation:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/conversations/:chatId/messages', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const chatId = req.params.chatId as string;

  if (!isValidUUID(chatId)) {
    return res.status(400).json({ message: 'Invalid chat ID format' });
  }

  const limit = Math.min(
    Math.max(parseInt(req.query.limit as string, 10) || CHAT_PAGE_DEFAULT_LIMIT, 1),
    100,
  );
  const before = req.query.before as string | undefined;

  if (before && !isValidUUID(before)) {
    return res.status(400).json({ message: 'Invalid cursor format' });
  }

  try {
    if (!(await isChatParticipant(userId, chatId))) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    const result = await fetchMessagesForRequest(chatId, limit, before);
    const nextCursor = result.messages.length > 0 ? result.messages[0].id : null;
    const seenByMap = await fetchSeenByMap(
      chatId,
      userId,
      result.messages.map((message) => message.id),
    );
    const formatted = await formatMessagesForResponse(result.messages, userId, seenByMap);

    return res.status(200).json({
      messages: formatted,
      hasMore: result.hasMore,
      nextCursor,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_CURSOR') {
      return res.status(400).json({ message: 'Invalid cursor: message not found' });
    }

    console.error('Error fetching messages:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/conversations/:chatId/messages',
  chatMessageRateLimiter,
  async (req: Request, res: Response) => {
    const authed = req as unknown as AuthedRequest;
    const userId = authed.auth!.userId;
    const chatId = req.params.chatId as string;
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const replyToMessageId = req.body.replyToMessageId as string | undefined;

    if (!isValidUUID(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID format' });
    }
    if (!content) {
      return res.status(400).json({ message: 'Message content required' });
    }
    if (replyToMessageId && !isValidUUID(replyToMessageId)) {
      return res.status(400).json({ message: 'Invalid reply message ID format' });
    }

    try {
      if (!(await isChatParticipant(userId, chatId))) {
        return res.status(403).json({ message: 'Not a participant' });
      }

      const replyTo = await fetchReplyPreview(chatId, replyToMessageId);
      if (replyToMessageId && !replyTo) {
        return res
          .status(400)
          .json({ message: 'Reply message must belong to this chat' });
      }

      const persisted = await persistMessage(
        chatId,
        userId,
        'text',
        content,
        replyToMessageId ?? null,
        [],
      );

      await cacheAndEmitMessage(authed, chatId, {
        messageId: persisted.messageId,
        createdAt: persisted.createdAt,
        senderUserId: userId,
        messageType: 'text',
        content,
        replyToMessageId: replyToMessageId ?? null,
        replyTo,
        attachments: [],
      });

      return res.status(201).json({ messageId: persisted.messageId });
    } catch (err) {
      console.error('Error sending message:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.post(
  '/conversations/:chatId/messages/image',
  chatMessageRateLimiter,
  upload.single('image'),
  async (req: Request, res: Response) => {
    const authed = req as unknown as AuthedRequest;
    const userId = authed.auth!.userId;
    const chatId = req.params.chatId as string;
    const file = req.file;
    const replyToMessageId = req.body.replyToMessageId as string | undefined;

    if (!isValidUUID(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID format' });
    }
    if (!file) {
      return res.status(400).json({ message: 'Image file required' });
    }
    if (!file.mimetype.toLowerCase().startsWith('image/')) {
      return res.status(400).json({ message: 'Only image uploads are allowed' });
    }
    if (replyToMessageId && !isValidUUID(replyToMessageId)) {
      return res.status(400).json({ message: 'Invalid reply message ID format' });
    }

    try {
      if (!(await isChatParticipant(userId, chatId))) {
        return res.status(403).json({ message: 'Not a participant' });
      }

      const replyTo = await fetchReplyPreview(chatId, replyToMessageId);
      if (replyToMessageId && !replyTo) {
        return res
          .status(400)
          .json({ message: 'Reply message must belong to this chat' });
      }

      const fileUrl = await uploadChatMediaToStorage({
        userId,
        fileBuffer: file.buffer,
        mimeType: file.mimetype,
      });
      const attachments = [{ fileUrl, fileType: file.mimetype }];
      const persisted = await persistMessage(
        chatId,
        userId,
        'image',
        null,
        replyToMessageId ?? null,
        attachments,
      );

      await cacheAndEmitMessage(authed, chatId, {
        messageId: persisted.messageId,
        createdAt: persisted.createdAt,
        senderUserId: userId,
        messageType: 'image',
        content: null,
        replyToMessageId: replyToMessageId ?? null,
        replyTo,
        attachments,
      });

      return res.status(201).json({ messageId: persisted.messageId, fileUrl });
    } catch (err) {
      console.error('Error sending image:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.patch('/conversations/:chatId/read', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const chatId = req.params.chatId as string;
  const messageId = req.body.messageId as string;

  if (!isValidUUID(chatId) || !isValidUUID(messageId)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  try {
    if (!(await isChatParticipant(userId, chatId))) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    const messageRows = await prisma.$queryRaw<Array<{ message_id: string }>>`
      SELECT message_id
      FROM messages
      WHERE chat_id = ${chatId}
        AND message_id = ${messageId}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (!messageRows[0]) {
      return res.status(400).json({ message: 'Message must belong to this chat' });
    }

    await prisma.$queryRaw`
      UPDATE chat_participants
      SET last_read_message_id = ${messageId}
      WHERE chat_id = ${chatId}
        AND user_id = ${userId}
    `;

    try {
      await Promise.all([
        setReadState(chatId, userId, messageId),
        setUnreadCount(userId, chatId, 0),
      ]);
    } catch (err) {
      console.warn('Failed to update read-state cache:', err);
    }

    noteConversationActivity(chatId);
    const participantIds = await getChatParticipantIds(chatId);
    emitChatRead(participantIds, chatId, userId, messageId, new Date().toISOString());

    return res.status(200).json({ message: 'Read status updated' });
  } catch (err) {
    console.error('Error updating read status:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put(
  '/conversations/:chatId/messages/:messageId/reaction',
  async (req: Request, res: Response) => {
    const authed = req as unknown as AuthedRequest;
    const userId = authed.auth!.userId;
    const chatId = req.params.chatId as string;
    const messageId = req.params.messageId as string;
    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim() : '';

    if (!isValidUUID(chatId) || !isValidUUID(messageId)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }
    if (!emoji || emoji.length > 16) {
      return res.status(400).json({ message: 'emoji is required' });
    }

    try {
      if (!(await isChatParticipant(userId, chatId))) {
        return res.status(403).json({ message: 'Not a participant' });
      }

      const rows = await prisma.$queryRaw<Array<{ reactions: unknown }>>`
        SELECT reactions
        FROM messages
        WHERE chat_id = ${chatId}
          AND message_id = ${messageId}
          AND deleted_at IS NULL
        LIMIT 1
      `;

      if (!rows[0]) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const reactions = normalizeReactions(rows[0].reactions);
      const currentUsers = new Set(reactions[emoji] ?? []);
      if (currentUsers.has(userId)) {
        currentUsers.delete(userId);
      } else {
        currentUsers.add(userId);
      }

      if (currentUsers.size === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = Array.from(currentUsers);
      }

      await prisma.$queryRaw`
        UPDATE messages
        SET reactions = ${JSON.stringify(reactions)}::jsonb
        WHERE message_id = ${messageId}
      `;

      try {
        await patchRecentMessage(chatId, messageId, (message) => ({
          ...message,
          reactions,
        }));
      } catch (err) {
        console.warn('Failed to update cached message reaction:', err);
      }

      noteConversationActivity(chatId);
      const participantIds = await getChatParticipantIds(chatId);
      emitChatReaction(participantIds, chatId, messageId, reactions);

      return res.status(200).json({ reactions });
    } catch (err) {
      console.error('Error updating reaction:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.delete(
  '/conversations/:chatId/messages/:messageId',
  async (req: AuthedRequest, res: Response) => {
    try {
      const chatId = String(req.params.chatId);
      const messageId = String(req.params.messageId);
      const userId = req.auth?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!isValidUUID(chatId) || !isValidUUID(messageId)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      if (!(await isChatParticipant(userId, chatId))) {
        return res.status(403).json({ error: 'Not a participant in this chat' });
      }

      const message = await prisma.message.findFirst({
        where: {
          messageId,
          chatId,
          deletedAt: null,
        },
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }
      if (message.senderUserId !== userId) {
        return res
          .status(403)
          .json({ error: 'You can only delete your own messages' });
      }

      const messageTime = new Date(message.createdAt).getTime();
      const now = Date.now();
      if (now - messageTime > 24 * 60 * 60 * 1000) {
        return res.status(403).json({
          error: 'Messages can only be deleted within 24 hours of sending',
        });
      }

      await prisma.message.update({
        where: { messageId },
        data: { deletedAt: new Date() },
      });

      const cachedMeta = await getConversationMeta(chatId);
      try {
        await removeRecentMessage(chatId, messageId);
        let nextMeta = cachedMeta;
        if (cachedMeta?.lastMessageId === messageId) {
          nextMeta = await refreshConversationMetaFromRecentCache(chatId);
        }
        if (nextMeta) {
          await updateConversationListsForMeta(nextMeta.participantIds, chatId, nextMeta);
        }
      } catch (err) {
        console.warn('Failed to update cache after message delete:', err);
      }

      noteConversationActivity(chatId);
      const participantIds =
        cachedMeta?.participantIds?.length
          ? cachedMeta.participantIds
          : await getChatParticipantIds(chatId);
      emitChatDelete(participantIds, chatId, messageId);

      return res.json({ success: true, messageId });
    } catch (error) {
      console.error('Error deleting message:', error);
      return res.status(500).json({ error: 'Failed to delete message' });
    }
  },
);

router.post('/requests/:chatId/accept', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const chatId = req.params.chatId as string;

  if (!isValidUUID(chatId)) {
    return res.status(400).json({ message: 'Invalid chat ID format' });
  }

  try {
    if (!(await isChatParticipant(userId, chatId))) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    await markChatAccepted(chatId);
    const participantIds = await getChatParticipantIds(chatId);

    try {
      await patchConversationMeta(chatId, (meta) => ({
        ...meta,
        isRequest: false,
      }));
    } catch (err) {
      console.warn('Failed to patch cached request meta:', err);
    }

    await invalidateConversationLists(participantIds, ['active', 'requests']);
    const otherParticipant = participantIds.find((id) => id !== userId);
    if (otherParticipant) {
      emitChatRequestAccepted(otherParticipant, chatId);
    }

    return res.status(200).json({ message: 'Request accepted' });
  } catch (err) {
    console.error('Error accepting request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
