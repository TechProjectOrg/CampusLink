/**
 * Message Visibility & Access Control
 *
 * Core logic for enforcing strict membership-based message visibility.
 * Users can ONLY see messages sent during their membership window.
 */

import prisma from '../prisma';

/**
 * Represents when a user can see messages in a conversation
 */
export interface MembershipWindow {
  userId: string;
  chatId: string;
  joinedAt: Date;
  leftAt: Date | null; // null = still a member
}

/**
 * Gets a user's membership window in a conversation
 * Returns null if user is not/was never a member
 */
export async function getMembershipWindow(
  userId: string,
  chatId: string,
): Promise<MembershipWindow | null> {
  const participant = await prisma.$queryRaw<{
    user_id: string;
    chat_id: string;
    joined_at: Date;
    left_at: Date | null;
  }[]>`
    SELECT user_id, chat_id, joined_at, left_at
    FROM chat_participants
    WHERE chat_id = ${chatId} AND user_id = ${userId}
    LIMIT 1
  `;

  if (!participant[0]) return null;

  return {
    userId: participant[0].user_id,
    chatId: participant[0].chat_id,
    joinedAt: participant[0].joined_at,
    leftAt: participant[0].left_at,
  };
}

/**
 * Checks if a user can access a specific message
 *
 * Access is ONLY allowed if:
 * 1. User is a current OR former member (has a membership record)
 * 2. Message was sent AFTER user joined
 * 3. Message was sent BEFORE user left (if they left)
 *
 * This is the critical access control function - use it on ALL message access
 */
export async function canAccessMessage(
  userId: string,
  messageId: string,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{
    can_access: boolean;
  }[]>`
    SELECT CASE
      WHEN m.message_id IS NULL THEN false
      WHEN cp.chat_participant_id IS NULL THEN false
      WHEN m.created_at < cp.joined_at THEN false
      WHEN cp.left_at IS NOT NULL AND m.created_at >= cp.left_at THEN false
      ELSE true
    END AS can_access
    FROM messages m
    LEFT JOIN chat_participants cp
      ON m.chat_id = cp.chat_id
      AND cp.user_id = ${userId}
    WHERE m.message_id = ${messageId}
    LIMIT 1
  `;

  return rows[0]?.can_access ?? false;
}

/**
 * Filters messages to only those visible to the user
 *
 * Used in query building - adds WHERE clauses for membership window checks
 *
 * @param userId - User requesting messages
 * @param chatId - Conversation containing messages
 * @returns SQL fragment (no WHERE prefix)
 */
export function messageMembershipFilter(userId: string, chatId: string): string {
  return `
    m.chat_id = '${chatId}'
    AND EXISTS (
      SELECT 1 FROM chat_participants cp
      WHERE cp.chat_id = m.chat_id
        AND cp.user_id = '${userId}'
        AND m.created_at >= cp.joined_at
        AND (cp.left_at IS NULL OR m.created_at < cp.left_at)
    )
  `;
}

/**
 * Gets all messages in a conversation that a user can see
 * Respects membership window visibility rules
 *
 * @param userId - User requesting messages
 * @param chatId - Conversation containing messages
 * @param limit - Max messages to return
 * @param offset - Pagination offset
 * @returns Array of message IDs and metadata
 */
export async function getVisibleMessagesForUser(
  userId: string,
  chatId: string,
  limit: number = 12,
  offset: number = 0,
) {
  const messages = await prisma.$queryRaw<
    {
      message_id: string;
      sender_user_id: string;
      message_type: string;
      content: string | null;
      created_at: Date;
      message_sequence: bigint | null;
    }[]
  >`
    SELECT m.message_id, m.sender_user_id, m.message_type, m.content, m.created_at, m.message_sequence
    FROM messages m
    JOIN chat_participants cp
      ON m.chat_id = cp.chat_id
      AND cp.user_id = ${userId}
    WHERE m.chat_id = ${chatId}
      AND m.created_at >= cp.joined_at
      AND (cp.left_at IS NULL OR m.created_at < cp.left_at)
    ORDER BY m.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return messages;
}

/**
 * Gets unread message count for a user in a conversation
 *
 * Counts messages AFTER lastReadMessageId that user can access
 * Respects membership window
 *
 * @param userId - User
 * @param chatId - Conversation
 * @returns Unread count (respects membership window)
 */
export async function getUnreadCountForUser(userId: string, chatId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int as count
    FROM messages m
    JOIN chat_participants cp
      ON m.chat_id = cp.chat_id
      AND cp.user_id = ${userId}
    LEFT JOIN messages last_read
      ON last_read.message_id = cp.last_read_message_id
    WHERE m.chat_id = ${chatId}
      AND m.created_at >= cp.joined_at
      AND (cp.left_at IS NULL OR m.created_at < cp.left_at)
      AND (last_read.message_id IS NULL OR m.created_at > last_read.created_at)
  `;

  return rows[0]?.count ?? 0;
}

/**
 * Validates that user has access to a conversation
 * Throws if not a member
 */
export async function validateChatAccess(userId: string, chatId: string): Promise<void> {
  const member = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int as count
    FROM chat_participants
    WHERE chat_id = ${chatId}
      AND user_id = ${userId}
  `;

  if ((member[0]?.count ?? 0) === 0) {
    throw new Error(`User ${userId} is not a member of chat ${chatId}`);
  }
}

/**
 * Validates that user is a CURRENT (active) member
 * Throws if user has left or is not a member
 */
export async function validateActiveChatAccess(userId: string, chatId: string): Promise<void> {
  const member = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int as count
    FROM chat_participants
    WHERE chat_id = ${chatId}
      AND user_id = ${userId}
      AND left_at IS NULL
  `;

  if ((member[0]?.count ?? 0) === 0) {
    throw new Error(`User ${userId} is not an active member of chat ${chatId}`);
  }
}
