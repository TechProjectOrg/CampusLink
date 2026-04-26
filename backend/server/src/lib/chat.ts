import prisma from '../prisma';
import { emitChatEvent } from './realtime';
import { getUserSummaryById } from './userCache';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessagePayload {
  messageId: string;
  chatId: string;
  senderUserId: string;
  senderUsername: string;
  senderProfilePhotoUrl: string | null;
  messageType: string;
  content: string | null;
  reactions: Record<string, string[]>;
  replyToMessageId: string | null;
  replyTo: ChatReplyPreview | null;
  attachments: { fileUrl: string; fileType: string }[];
  createdAt: string;
}

export interface ChatReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  type: string;
  content: string | null;
  attachmentUrl: string | null;
}

// ---------------------------------------------------------------------------
// Connection helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether userA and userB mutually follow each other.
 * "Connected" in CampusLynk means A follows B AND B follows A.
 */
export async function areUsersMutuallyFollowing(
  userAId: string,
  userBId: string
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ mutual: number }[]>`
    SELECT COUNT(*)::int AS mutual
    FROM follows f1
    JOIN follows f2
      ON f2.follower_user_id = f1.followed_user_id
     AND f2.followed_user_id = f1.follower_user_id
    WHERE f1.follower_user_id = ${userAId}
      AND f1.followed_user_id = ${userBId}
    LIMIT 1
  `;
  return (rows[0]?.mutual ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Messaging permission check
// ---------------------------------------------------------------------------

interface MessagingPermission {
  allowed: boolean;
  isRequest: boolean; // true  → treat as message request
  reason?: string;
}

/**
 * Determines whether `senderUserId` may message `recipientUserId`.
 * Logic:
 *   1. Mutual followers → direct (no request)
 *   2. Public account  → allowed as message request
 *   3. Private account + not mutually following → blocked
 *   4. Recipient's allow_messages setting is respected
 */
export async function resolveMessagingPermission(
  senderUserId: string,
  recipientUserId: string
): Promise<MessagingPermission> {
  const recipient = await getUserSummaryById(recipientUserId);
  if (!recipient) return { allowed: false, isRequest: false, reason: 'User not found' };

  if (!recipient.allowMessages) {
    return { allowed: false, isRequest: false, reason: 'User does not accept messages' };
  }

  // Check mutual follow
  const isMutual = await areUsersMutuallyFollowing(senderUserId, recipientUserId);
  if (isMutual) {
    return { allowed: true, isRequest: false };
  }

  // Not mutually following — public accounts accept message requests
  if (!recipient.isPrivate) {
    return { allowed: true, isRequest: true };
  }

  // Private account + not connected
  return { allowed: false, isRequest: false, reason: 'This account is private' };
}

// ---------------------------------------------------------------------------
// Chat lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Finds an existing direct chat between two users, or creates one.
 * Handles the is_request flag based on messaging permissions.
 * Returns the chatId and whether this is a (new) request.
 */
export async function getOrCreateDirectChat(
  senderUserId: string,
  recipientUserId: string
): Promise<{ chatId: string; isRequest: boolean; isNew: boolean } | null> {
  const permission = await resolveMessagingPermission(senderUserId, recipientUserId);
  if (!permission.allowed) return null;

  // Check if a direct chat already exists between these two users
  const existing = await prisma.$queryRaw<{ chat_id: string; is_request: boolean }[]>`
    SELECT c.chat_id, c.is_request
    FROM chats c
    JOIN chat_participants cp1 ON cp1.chat_id = c.chat_id AND cp1.user_id = ${senderUserId} AND cp1.left_at IS NULL
    JOIN chat_participants cp2 ON cp2.chat_id = c.chat_id AND cp2.user_id = ${recipientUserId} AND cp2.left_at IS NULL
    WHERE c.chat_type = 'direct'
    LIMIT 1
  `;

  if (existing[0]) {
    return {
      chatId: existing[0].chat_id,
      isRequest: existing[0].is_request,
      isNew: false,
    };
  }

  // Create new direct chat
  const chatRows = await prisma.$queryRaw<{ chat_id: string }[]>`
    INSERT INTO chats (chat_type, is_request, created_by_user_id)
    VALUES ('direct', ${permission.isRequest}, ${senderUserId})
    RETURNING chat_id
  `;
  const chatId = chatRows[0]?.chat_id;
  if (!chatId) throw new Error('Failed to create chat');

  const now = new Date().toISOString();

  // Add both participants
  await prisma.$queryRaw`
    INSERT INTO chat_participants (chat_id, user_id, role, joined_at)
    VALUES
      (${chatId}, ${senderUserId},    'member', ${now}),
      (${chatId}, ${recipientUserId}, 'member', ${now})
  `;

  return { chatId, isRequest: permission.isRequest, isNew: true };
}

/**
 * Promotes a message-request chat to an active chat.
 * Called when the recipient accepts the request.
 */
export async function markChatAccepted(chatId: string): Promise<void> {
  await prisma.$queryRaw`
    UPDATE chats
    SET is_request = FALSE, updated_at = NOW()
    WHERE chat_id = ${chatId}
  `;
}

/**
 * Returns whether userId is an active participant in chatId.
 */
export async function isChatParticipant(userId: string, chatId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM chat_participants
    WHERE chat_id = ${chatId}
      AND user_id = ${userId}
      AND left_at IS NULL
    LIMIT 1
  `;
  return (rows[0]?.count ?? 0) > 0;
}

/**
 * Returns all participant userIds for a chat (excluding the caller if needed).
 */
export async function getChatParticipantIds(chatId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT user_id FROM chat_participants
    WHERE chat_id = ${chatId} AND left_at IS NULL
  `;
  return rows.map((r) => r.user_id);
}

// ---------------------------------------------------------------------------
// Real-time chat event emission
// ---------------------------------------------------------------------------

export function emitChatMessage(participantIds: string[], payload: ChatMessagePayload): void {
  emitChatEvent(participantIds, { type: 'chat:message' as const, payload });
}

export function emitChatReaction(
  participantIds: string[],
  chatId: string,
  messageId: string,
  reactions: Record<string, string[]>
): void {
  emitChatEvent(participantIds, {
    type: 'chat:reaction' as const,
    payload: { chatId, messageId, reactions },
  });
}

export function emitChatRead(
  participantIds: string[],
  chatId: string,
  userId: string,
  lastReadMessageId: string,
  readAt: string
): void {
  emitChatEvent(
    participantIds.filter((uid) => uid !== userId),
    {
      type: 'chat:read' as const,
      payload: { chatId, userId, lastReadMessageId, readAt },
    },
  );
}

export function emitChatRequestAccepted(userId: string, chatId: string): void {
  emitChatEvent([userId], {
    type: 'chat:request_accepted' as const,
    payload: { chatId },
  });
}

export function emitTypingIndicator(
  participantIds: string[],
  chatId: string,
  typingUserId: string,
  isTyping: boolean
): void {
  emitChatEvent(
    participantIds.filter((uid) => uid !== typingUserId),
    {
    type: 'chat:typing' as const,
    payload: { chatId, userId: typingUserId, isTyping },
    },
  );
}

export function emitChatDelete(participantIds: string[], chatId: string, messageId: string): void {
  emitChatEvent(participantIds, {
    type: 'chat:delete' as const,
    payload: { chatId, messageId },
  });
}
