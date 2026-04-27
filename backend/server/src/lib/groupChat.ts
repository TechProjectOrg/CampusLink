/**
 * Group Chat Management
 *
 * Operations for independent group chats:
 * - Create group
 * - Add/remove members
 * - Manage roles
 * - Update chat settings
 * - Delete chat
 */

import prisma from '../prisma';
import { checkChatPermission, ChatPermission } from './chatPermissions';
import { emitUserJoined, emitUserRemoved, emitUserRoleChanged } from './chatSystemEvents';
import { invalidateConversationLists } from './chatCache';
import { emitChatMessage, getChatParticipantIds } from './chat';

/**
 * Creates a new independent group chat
 *
 * @param creatorId - User creating the group
 * @param name - Group name
 * @param description - Group description
 * @param memberIds - Initial members to add (creator always added as OWNER)
 * @returns chatId of created group
 */
export async function createGroupChat(
  creatorId: string,
  name: string,
  description?: string,
  memberIds: string[] = [],
): Promise<string> {
  // Create chat
  const chatRows = await prisma.$queryRaw<{ chat_id: string }[]>`
    INSERT INTO chats (
      chat_type,
      name,
      description,
      created_by_user_id
    ) VALUES (
      'group',
      ${name},
      ${description ?? null},
      ${creatorId}
    )
    RETURNING chat_id
  `;

  const chatId = chatRows[0]?.chat_id;
  if (!chatId) throw new Error('Failed to create group chat');

  // Add creator as OWNER
  const now = new Date().toISOString();
  await prisma.$queryRaw`
    INSERT INTO chat_participants (
      chat_id,
      user_id,
      role,
      joined_at
    ) VALUES (
      ${chatId},
      ${creatorId},
      'owner',
      ${now}
    )
  `;

  // Add other members (deduplicate and exclude creator)
  const uniqueMembers = Array.from(new Set(memberIds.filter((id) => id !== creatorId)));
  if (uniqueMembers.length > 0) {
    const values = uniqueMembers.map((memberId) => `('${chatId}', '${memberId}', 'member', '${now}')`).join(',');

    await prisma.$queryRaw`
      INSERT INTO chat_participants (chat_id, user_id, role, joined_at)
      VALUES ${values}
      ON CONFLICT (chat_id, user_id) DO NOTHING
    `;

    // Emit join events for each member
    for (const memberId of uniqueMembers) {
      await emitUserJoined(chatId, memberId);
    }
  }

  // Invalidate creator's conversation list
  await invalidateConversationLists(creatorId);

  return chatId;
}

/**
 * Adds a user to a group chat
 *
 * @param actorUserId - User performing the add (must have permission)
 * @param targetUserId - User to add
 * @param chatId - Chat to add to
 * @param role - Role to assign (default: MEMBER)
 */
export async function addUserToChat(
  actorUserId: string,
  targetUserId: string,
  chatId: string,
  role: 'MEMBER' | 'ADMIN' = 'MEMBER',
): Promise<void> {
  // Check permission
  await checkChatPermission(actorUserId, chatId, ChatPermission.ADD_MEMBER);

  // Check if user is already a member
  const existing = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int as count
    FROM chat_participants
    WHERE chat_id = ${chatId} AND user_id = ${targetUserId}
  `;

  if ((existing[0]?.count ?? 0) > 0) {
    // Already a member (even if left) - don't add again
    return;
  }

  // Add user
  const now = new Date().toISOString();
  await prisma.$queryRaw`
    INSERT INTO chat_participants (
      chat_id,
      user_id,
      role,
      joined_at
    ) VALUES (
      ${chatId},
      ${targetUserId},
      ${role.toLowerCase()},
      ${now}
    )
  `;

  // Emit event
  await emitUserJoined(chatId, targetUserId);

  // Invalidate both users' conversation lists
  await invalidateConversationLists(actorUserId);
  await invalidateConversationLists(targetUserId);
}

/**
 * Removes a user from a group chat (soft delete - sets leftAt)
 *
 * @param actorUserId - User performing removal (must have permission)
 * @param targetUserId - User to remove
 * @param chatId - Chat to remove from
 * @param reason - Reason for removal (optional)
 */
export async function removeUserFromChat(
  actorUserId: string,
  targetUserId: string,
  chatId: string,
  reason?: string,
): Promise<void> {
  // Check permission (cannot remove self unless using leaveChat)
  if (actorUserId !== targetUserId) {
    await checkChatPermission(actorUserId, chatId, ChatPermission.REMOVE_MEMBER);
  }

  // Mark as left
  const now = new Date().toISOString();
  await prisma.$queryRaw`
    UPDATE chat_participants
    SET left_at = ${now}
    WHERE chat_id = ${chatId}
      AND user_id = ${targetUserId}
      AND left_at IS NULL
  `;

  // Emit event
  if (actorUserId !== targetUserId) {
    await emitUserRemoved(chatId, targetUserId, actorUserId, reason);
  }

  // Invalidate conversation lists
  await invalidateConversationLists(actorUserId);
  if (actorUserId !== targetUserId) {
    await invalidateConversationLists(targetUserId);
  }
}

/**
 * User voluntarily leaves a group chat
 */
export async function leaveGroupChat(userId: string, chatId: string): Promise<void> {
  await removeUserFromChat(userId, userId, chatId);
}

/**
 * Changes a user's role in a group chat
 *
 * @param actorUserId - User changing role (must have permission)
 * @param targetUserId - User whose role to change
 * @param chatId - Chat containing the user
 * @param newRole - New role
 */
export async function changeUserRole(
  actorUserId: string,
  targetUserId: string,
  chatId: string,
  newRole: 'OWNER' | 'ADMIN' | 'MEMBER',
): Promise<void> {
  // Check permission
  await checkChatPermission(actorUserId, chatId, ChatPermission.CHANGE_MEMBER_ROLE);

  // Get current role
  const currentRoleRows = await prisma.$queryRaw<{ role: string }[]>`
    SELECT role FROM chat_participants
    WHERE chat_id = ${chatId}
      AND user_id = ${targetUserId}
      AND left_at IS NULL
    LIMIT 1
  `;

  const currentRole = currentRoleRows[0]?.role;
  if (!currentRole) {
    throw new Error(`User ${targetUserId} is not an active member of chat ${chatId}`);
  }

  // Update role
  await prisma.$queryRaw`
    UPDATE chat_participants
    SET role = ${newRole.toLowerCase()}
    WHERE chat_id = ${chatId}
      AND user_id = ${targetUserId}
  `;

  // Emit event
  await emitUserRoleChanged(chatId, targetUserId, currentRole, newRole, actorUserId);

  // Invalidate conversation lists
  await invalidateConversationLists(targetUserId);
}

/**
 * Updates group chat metadata
 *
 * @param actorUserId - User updating (must be OWNER)
 * @param chatId - Chat to update
 * @param updates - Fields to update
 */
export async function updateGroupChat(
  actorUserId: string,
  chatId: string,
  updates: {
    name?: string;
    description?: string;
    avatarUrl?: string;
  },
): Promise<void> {
  // Check permission
  await checkChatPermission(actorUserId, chatId, ChatPermission.UPDATE_CHAT_SETTINGS);

  // Build dynamic update query
  const setClauses: string[] = [];
  const values: Record<string, unknown> = { chatId };

  if (updates.name !== undefined) {
    setClauses.push('name = :name');
    values.name = updates.name;
  }
  if (updates.description !== undefined) {
    setClauses.push('description = :description');
    values.description = updates.description;
  }
  if (updates.avatarUrl !== undefined) {
    setClauses.push('avatar_url = :avatarUrl');
    values.avatarUrl = updates.avatarUrl;
  }

  if (setClauses.length === 0) return; // Nothing to update

  await prisma.$queryRaw`
    UPDATE chats
    SET ${setClauses.join(', ')}, updated_at = NOW()
    WHERE chat_id = :chatId
  `;

  // Invalidate all participants' conversation lists
  const participantIds = await getChatParticipantIds(chatId);
  for (const participantId of participantIds) {
    await invalidateConversationLists(participantId);
  }
}

/**
 * Deletes a group chat
 *
 * Only OWNER can delete, and all messages/participants are cascade deleted
 *
 * @param actorUserId - User deleting (must be OWNER)
 * @param chatId - Chat to delete
 */
export async function deleteGroupChat(actorUserId: string, chatId: string): Promise<void> {
  // Check permission
  await checkChatPermission(actorUserId, chatId, ChatPermission.DELETE_CHAT);

  // Invalidate all participants' conversation lists BEFORE deleting
  const participantIds = await getChatParticipantIds(chatId);
  for (const participantId of participantIds) {
    await invalidateConversationLists(participantId);
  }

  // Delete (cascade will clean up participants, messages, etc)
  await prisma.$queryRaw`
    DELETE FROM chats WHERE chat_id = ${chatId}
  `;
}

/**
 * Gets group chat members with their info
 */
export async function getChatMembers(chatId: string, includeInactive: boolean = false) {
  const rows = await prisma.$queryRaw<
    {
      user_id: string;
      username: string;
      role: string;
      joined_at: Date;
      left_at: Date | null;
    }[]
  >`
    SELECT cp.user_id, u.username, cp.role, cp.joined_at, cp.left_at
    FROM chat_participants cp
    JOIN users u ON u.user_id = cp.user_id
    WHERE cp.chat_id = ${chatId}
      ${includeInactive ? '' : 'AND cp.left_at IS NULL'}
    ORDER BY cp.joined_at ASC
  `;

  return rows;
}
