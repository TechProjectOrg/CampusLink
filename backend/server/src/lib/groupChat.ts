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

import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { checkChatPermission, ChatPermission } from './chatPermissions';
import { emitUserJoined, emitUserRemoved, emitUserRoleChanged } from './chatSystemEvents';
import { invalidateConversationLists } from './chatCache';
import { emitChatMessage, getChatParticipantIds } from './chat';
import { getUserSummariesByIds } from './userCache';

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
  const uniqueMembers = Array.from(new Set(memberIds.filter((id) => id !== creatorId)));

  const chatId = await prisma.$transaction(async (tx) => {
    const now = new Date().toISOString();

    const chatRows = await tx.$queryRaw<{ chat_id: string }[]>`
      INSERT INTO chats (
        chat_type,
        name,
        description,
        created_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        'group',
        ${name},
        ${description ?? null},
        ${creatorId},
        ${now},
        ${now}
      )
      RETURNING chat_id
    `;

    const createdChatId = chatRows[0]?.chat_id;
    if (!createdChatId) throw new Error('Failed to create group chat');

    await tx.$queryRaw`
      INSERT INTO chat_participants (
        chat_id,
        user_id,
        role,
        joined_at
      ) VALUES (
        ${createdChatId},
        ${creatorId},
        'owner',
        ${now}
      )
    `;

    for (const memberId of uniqueMembers) {
      await tx.$queryRaw`
        INSERT INTO chat_participants (chat_id, user_id, role, joined_at)
        VALUES (${createdChatId}, ${memberId}, 'member', ${now})
      `;
    }

    return createdChatId;
  });

  for (const memberId of uniqueMembers) {
    await emitUserJoined(chatId, memberId, creatorId);
  }

  await invalidateConversationLists([creatorId]);
  for (const memberId of uniqueMembers) {
    await invalidateConversationLists([memberId]);
  }

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
  await emitUserJoined(chatId, targetUserId, actorUserId);

  // Invalidate both users' conversation lists
  await invalidateConversationLists([actorUserId]);
  await invalidateConversationLists([targetUserId]);
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
  await invalidateConversationLists([actorUserId]);
  if (actorUserId !== targetUserId) {
    await invalidateConversationLists([targetUserId]);
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
  await invalidateConversationLists([targetUserId]);
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

  if (
    updates.name === undefined &&
    updates.description === undefined &&
    updates.avatarUrl === undefined
  ) {
    return;
  }

  const existingRows = await prisma.$queryRaw<
    {
      name: string | null;
      description: string | null;
      avatar_url: string | null;
    }[]
  >`
    SELECT name, description, avatar_url
    FROM chats
    WHERE chat_id = ${chatId}
    LIMIT 1
  `;

  const existing = existingRows[0];
  if (!existing) {
    throw new Error(`Chat ${chatId} not found`);
  }

  await prisma.$queryRaw`
    UPDATE chats
    SET
      name = ${updates.name ?? existing.name},
      description = ${updates.description ?? existing.description},
      avatar_url = ${updates.avatarUrl ?? existing.avatar_url},
      updated_at = NOW()
    WHERE chat_id = ${chatId}
  `;

  // Invalidate all participants' conversation lists
  const participantIds = await getChatParticipantIds(chatId);
  for (const participantId of participantIds) {
    await invalidateConversationLists([participantId]);
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
    await invalidateConversationLists([participantId]);
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
  const activeOnlyFilter = includeInactive
    ? Prisma.empty
    : Prisma.sql`AND cp.left_at IS NULL`;

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
      ${activeOnlyFilter}
    ORDER BY cp.joined_at ASC
  `;

  return rows;
}

export async function getGroupChatDetails(chatId: string, viewerUserId: string) {
  const chatRows = await prisma.$queryRaw<
    {
      chat_id: string;
      name: string | null;
      description: string | null;
      avatar_url: string | null;
      created_at: Date;
      created_by_user_id: string | null;
    }[]
  >`
    SELECT chat_id, name, description, avatar_url, created_at, created_by_user_id
    FROM chats
    WHERE chat_id = ${chatId}
      AND chat_type = 'group'
    LIMIT 1
  `;

  const chat = chatRows[0];
  if (!chat) {
    throw new Error(`Group chat ${chatId} not found`);
  }

  const members = await getChatMembers(chatId, false);
  const userSummaries = await getUserSummariesByIds(members.map((member) => member.user_id));
  const currentViewerMembership = members.find((member) => member.user_id === viewerUserId) ?? null;

  return {
    id: chat.chat_id,
    name: chat.name ?? 'Group chat',
    description: chat.description ?? '',
    avatarUrl: chat.avatar_url,
    createdAt: chat.created_at.toISOString(),
    createdBy: chat.created_by_user_id,
    memberCount: members.length,
    currentUserRole: currentViewerMembership?.role?.toLowerCase() ?? null,
    members: members.map((member) => {
      const summary = userSummaries.get(member.user_id);
      return {
        userId: member.user_id,
        username: member.username,
        avatarUrl: summary?.profilePictureUrl ?? null,
        role: member.role.toLowerCase(),
        joinedAt: member.joined_at.toISOString(),
        leftAt: member.left_at?.toISOString() ?? null,
      };
    }),
  };
}
