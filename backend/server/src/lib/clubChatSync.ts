/**
 * Club Chat Synchronization
 *
 * Keeps club chat membership in sync with club membership
 * When user joins/leaves club, automatically update their chat status
 */

import prisma from '../prisma';
import { addUserToChat, removeUserFromChat } from './groupChat';
import { emitUserJoined } from './chatSystemEvents';
import { invalidateConversationLists } from './chatCache';

/**
 * Ensures club has a linked chat
 * Creates it if necessary
 *
 * @returns chatId of the club's chat
 */
export async function getOrCreateClubChat(clubId: string, clubName: string): Promise<string> {
  // Check if chat already exists
  const existing = await prisma.$queryRaw<{ linked_chat_id: string }[]>`
    SELECT linked_chat_id FROM clubs
    WHERE club_id = ${clubId} AND linked_chat_id IS NOT NULL
    LIMIT 1
  `;

  if (existing[0]?.linked_chat_id) {
    return existing[0].linked_chat_id;
  }

  // Create new chat for club
  const chatRows = await prisma.$queryRaw<{ chat_id: string }[]>`
    INSERT INTO chats (
      chat_type,
      name,
      description,
      group_metadata
    ) VALUES (
      'group',
      ${clubName},
      'Official chat for ' || ${clubName},
      '{"type": "club_chat", "club_id": "${clubId}"}'::jsonb
    )
    RETURNING chat_id
  `;

  const chatId = chatRows[0]?.chat_id;
  if (!chatId) throw new Error('Failed to create club chat');

  // Link chat to club
  await prisma.$queryRaw`
    UPDATE clubs
    SET linked_chat_id = ${chatId}
    WHERE club_id = ${clubId}
  `;

  return chatId;
}

/**
 * When user joins a club, add them to the club chat
 *
 * Called from club membership logic when status changes to ACTIVE
 *
 * @param userId - User who joined
 * @param clubId - Club they joined
 * @param clubName - Club name (for chat creation if needed)
 * @param clubRole - Their role in the club
 */
export async function onUserJoinedClub(
  userId: string,
  clubId: string,
  clubName: string,
  clubRole: string,
): Promise<void> {
  // Get or create club chat
  const chatId = await getOrCreateClubChat(clubId, clubName);

  // Map club role to chat role
  const chatRole = mapClubRoleToChatRole(clubRole);

  // Add user to chat (or restore if they were previously a member)
  const now = new Date().toISOString();

  // Check if they have a membership record
  const existing = await prisma.$queryRaw<{
    chat_participant_id: string;
    left_at: Date | null;
  }[]>`
    SELECT chat_participant_id, left_at
    FROM chat_participants
    WHERE chat_id = ${chatId} AND user_id = ${userId}
    LIMIT 1
  `;

  if (existing[0]) {
    // They're already a member (or were) - restore if they left
    if (existing[0].left_at) {
      await prisma.$queryRaw`
        UPDATE chat_participants
        SET left_at = NULL, role = ${chatRole.toLowerCase()}, joined_at = ${now}
        WHERE chat_participant_id = ${existing[0].chat_participant_id}
      `;
      // Emit join event
      await emitUserJoined(chatId, userId);
    } else {
      // Already active - just update role if changed
      await prisma.$queryRaw`
        UPDATE chat_participants
        SET role = ${chatRole.toLowerCase()}
        WHERE chat_participant_id = ${existing[0].chat_participant_id}
      `;
    }
  } else {
    // New membership
    await prisma.$queryRaw`
      INSERT INTO chat_participants (
        chat_id,
        user_id,
        role,
        joined_at
      ) VALUES (
        ${chatId},
        ${userId},
        ${chatRole.toLowerCase()},
        ${now}
      )
    `;
    // Emit join event
    await emitUserJoined(chatId, userId);
  }

  // Invalidate conversation list
  await invalidateConversationLists([userId]);
}

/**
 * When user leaves a club, remove them from the club chat
 *
 * Called from club membership logic when status changes to LEFT
 *
 * @param userId - User who left
 * @param clubId - Club they left
 */
export async function onUserLeftClub(userId: string, clubId: string): Promise<void> {
  // Get club chat
  const chatRows = await prisma.$queryRaw<{ linked_chat_id: string }[]>`
    SELECT linked_chat_id FROM clubs
    WHERE club_id = ${clubId}
    LIMIT 1
  `;

  const chatId = chatRows[0]?.linked_chat_id;
  if (!chatId) return; // No chat created yet

  // Remove from chat
  const now = new Date().toISOString();
  await prisma.$queryRaw`
    UPDATE chat_participants
    SET left_at = ${now}
    WHERE chat_id = ${chatId} AND user_id = ${userId} AND left_at IS NULL
  `;

  // Invalidate conversation list
  await invalidateConversationLists([userId]);
}

/**
 * When user's club role changes, update chat role
 *
 * Called when club membership role is updated
 *
 * @param userId - User whose role changed
 * @param clubId - Club where role changed
 * @param newClubRole - New role in club
 */
export async function onUserClubRoleChanged(
  userId: string,
  clubId: string,
  newClubRole: string,
): Promise<void> {
  // Get club chat
  const chatRows = await prisma.$queryRaw<{ linked_chat_id: string }[]>`
    SELECT linked_chat_id FROM clubs
    WHERE club_id = ${clubId}
    LIMIT 1
  `;

  const chatId = chatRows[0]?.linked_chat_id;
  if (!chatId) return; // No chat exists yet

  // Update user's chat role
  const chatRole = mapClubRoleToChatRole(newClubRole);
  await prisma.$queryRaw`
    UPDATE chat_participants
    SET role = ${chatRole.toLowerCase()}
    WHERE chat_id = ${chatId} AND user_id = ${userId}
  `;

  // Invalidate conversation list
  await invalidateConversationLists([userId]);
}

/**
 * When club is deleted, delete or archive the chat
 *
 * For now, we cascade delete. Could be enhanced to archive instead.
 *
 * @param clubId - Club being deleted
 */
export async function onClubDeleted(clubId: string): Promise<void> {
  // Get club chat
  const chatRows = await prisma.$queryRaw<{ linked_chat_id: string }[]>`
    SELECT linked_chat_id FROM clubs WHERE club_id = ${clubId}
    LIMIT 1
  `;

  const chatId = chatRows[0]?.linked_chat_id;
  if (!chatId) return; // No chat exists

  // Invalidate all participants before deletion
  const participantRows = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT DISTINCT user_id FROM chat_participants WHERE chat_id = ${chatId}
  `;

  for (const row of participantRows) {
    await invalidateConversationLists([row.user_id]);
  }

  // Delete chat (cascade deletes messages, participants)
  await prisma.$queryRaw`
    DELETE FROM chats WHERE chat_id = ${chatId}
  `;

  // Clear linked_chat_id from club (already deleted, but for clarity)
  await prisma.$queryRaw`
    UPDATE clubs SET linked_chat_id = NULL WHERE club_id = ${clubId}
  `;
}

/**
 * Maps club membership role to chat role
 */
function mapClubRoleToChatRole(clubRole: string): 'OWNER' | 'ADMIN' | 'MEMBER' {
  switch (clubRole.toLowerCase()) {
    case 'owner':
      return 'OWNER';
    case 'admin':
      return 'ADMIN';
    default:
      return 'MEMBER';
  }
}

/**
 * When club membership request is approved, add to chat
 * (calls onUserJoinedClub under the hood)
 */
export async function onClubMembershipApproved(
  userId: string,
  clubId: string,
  clubName: string,
  role: string,
): Promise<void> {
  await onUserJoinedClub(userId, clubId, clubName, role);
}
