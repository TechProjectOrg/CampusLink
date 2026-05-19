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
import { emitUserJoined, emitUserLeft, emitUserRemoved, emitUserRoleChanged } from './chatSystemEvents';
import { invalidateConversationLists } from './chatCache';
import { emitChatMessage, getChatParticipantIds } from './chat';
import { getUserSummariesByIds } from './userCache';

type PrismaExecutor = typeof prisma | Prisma.TransactionClient;

interface ActiveGroupMemberRow {
  user_id: string;
  role: string;
}

export interface GroupAdminTransfer {
  chatId: string;
  successorUserId: string;
}

export interface GroupAdminReassignmentRequirement {
  chatId: string;
  name: string;
  currentRole: 'owner' | 'admin';
  eligibleSuccessors: Array<{
    userId: string;
    username: string;
    displayName: string | null;
    role: 'owner' | 'admin' | 'member';
  }>;
}

export class GroupAdminReassignmentRequiredError extends Error {
  chatId: string;
  eligibleSuccessors: GroupAdminReassignmentRequirement['eligibleSuccessors'];

  constructor(requirement: GroupAdminReassignmentRequirement) {
    super(
      requirement.currentRole === 'owner'
        ? 'You are the last admin in this group. Appoint a new owner before leaving.'
        : 'You are the last admin in this group. Appoint a new admin before leaving.',
    );
    this.name = 'GroupAdminReassignmentRequiredError';
    this.chatId = requirement.chatId;
    this.eligibleSuccessors = requirement.eligibleSuccessors;
  }
}

async function getActiveGroupMembers(
  executor: PrismaExecutor,
  chatId: string,
): Promise<ActiveGroupMemberRow[]> {
  return executor.$queryRaw<ActiveGroupMemberRow[]>`
    SELECT cp.user_id, cp.role
    FROM chat_participants cp
    JOIN chats c ON c.chat_id = cp.chat_id
    WHERE cp.chat_id = ${chatId}
      AND cp.left_at IS NULL
      AND c.chat_type = 'group'
    ORDER BY cp.joined_at ASC
  `;
}

async function getGroupName(executor: PrismaExecutor, chatId: string): Promise<string> {
  const rows = await executor.$queryRaw<Array<{ name: string | null }>>`
    SELECT name
    FROM chats
    WHERE chat_id = ${chatId}
    LIMIT 1
  `;

  return rows[0]?.name?.trim() || 'Group chat';
}

async function buildGroupAdminReassignmentRequirement(
  executor: PrismaExecutor,
  userId: string,
  chatId: string,
): Promise<GroupAdminReassignmentRequirement | null> {
  const members = await getActiveGroupMembers(executor, chatId);
  const currentMember = members.find((member) => member.user_id === userId);
  const currentRole = currentMember?.role?.toLowerCase();

  if (currentRole !== 'owner' && currentRole !== 'admin') {
    return null;
  }

  const activeAdmins = members.filter((member) => {
    const role = member.role.toLowerCase();
    return role === 'owner' || role === 'admin';
  });

  if (activeAdmins.length !== 1) {
    return null;
  }

  const eligibleMembers = members.filter((member) => member.user_id !== userId);
  if (eligibleMembers.length === 0) {
    return null;
  }

  const summaries = await getUserSummariesByIds(eligibleMembers.map((member) => member.user_id));
  const name = await getGroupName(executor, chatId);

  return {
    chatId,
    name,
    currentRole,
    eligibleSuccessors: eligibleMembers.map((member) => {
      const summary = summaries.get(member.user_id);
      const role = member.role.toLowerCase();
      return {
        userId: member.user_id,
        username: summary?.username ?? '',
        displayName: summary?.displayName ?? null,
        role: (role === 'owner' || role === 'admin' ? role : 'member') as 'owner' | 'admin' | 'member',
      };
    }),
  };
}

async function assignGroupSuccessorIfNeeded(
  executor: PrismaExecutor,
  userId: string,
  chatId: string,
  successorUserId?: string,
): Promise<void> {
  const requirement = await buildGroupAdminReassignmentRequirement(executor, userId, chatId);
  if (!requirement) {
    return;
  }

  if (!successorUserId) {
    throw new GroupAdminReassignmentRequiredError(requirement);
  }

  const successor = requirement.eligibleSuccessors.find((member) => member.userId === successorUserId);
  if (!successor) {
    throw new Error('Selected successor must be another active group member');
  }

  const nextRole = requirement.currentRole === 'owner' ? 'owner' : 'admin';
  await executor.$executeRaw`
    UPDATE chat_participants
    SET role = ${nextRole}
    WHERE chat_id = ${chatId}
      AND user_id = ${successorUserId}
      AND left_at IS NULL
  `;

  const previousRole = successor.role.toUpperCase();
  const nextRoleForEvent = nextRole.toUpperCase() as 'OWNER' | 'ADMIN';
  if (previousRole !== nextRoleForEvent) {
    await emitUserRoleChanged(chatId, successorUserId, previousRole, nextRoleForEvent, userId);
  }
}

async function deleteGroupChatIfEmpty(executor: PrismaExecutor, chatId: string): Promise<boolean> {
  const rows = await executor.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM chat_participants
    WHERE chat_id = ${chatId}
      AND left_at IS NULL
  `;

  if ((rows[0]?.count ?? 0) > 0) {
    return false;
  }

  await executor.$executeRaw`
    DELETE FROM chats
    WHERE chat_id = ${chatId}
  `;

  return true;
}

export async function listGroupAdminReassignmentRequirementsForUser(
  userId: string,
  executor: PrismaExecutor = prisma,
): Promise<GroupAdminReassignmentRequirement[]> {
  const groupRows = await executor.$queryRaw<Array<{ chat_id: string }>>`
    SELECT c.chat_id
    FROM chats c
    JOIN chat_participants cp ON cp.chat_id = c.chat_id
    WHERE cp.user_id = ${userId}
      AND cp.left_at IS NULL
      AND c.chat_type = 'group'
  `;

  const requirements = await Promise.all(
    groupRows.map(async (row) => buildGroupAdminReassignmentRequirement(executor, userId, row.chat_id)),
  );

  return requirements.filter((item): item is GroupAdminReassignmentRequirement => item !== null);
}

export async function leaveAllIndependentGroupChatsForDeletedUser(
  userId: string,
  transfers: GroupAdminTransfer[],
  executor: PrismaExecutor = prisma,
): Promise<string[]> {
  const activeGroupRows = await executor.$queryRaw<Array<{ chat_id: string }>>`
    SELECT c.chat_id
    FROM chats c
    JOIN chat_participants cp ON cp.chat_id = c.chat_id
    WHERE cp.user_id = ${userId}
      AND cp.left_at IS NULL
      AND c.chat_type = 'group'
  `;

  const transferMap = new Map(transfers.map((transfer) => [transfer.chatId, transfer.successorUserId]));
  const invalidatedUserIds = new Set<string>();

  for (const row of activeGroupRows) {
    const chatId = row.chat_id;
    await assignGroupSuccessorIfNeeded(executor, userId, chatId, transferMap.get(chatId));

    const participantsBeforeLeave = await getChatParticipantIds(chatId);

    await executor.$executeRaw`
      UPDATE chat_participants
      SET left_at = NOW()
      WHERE chat_id = ${chatId}
        AND user_id = ${userId}
        AND left_at IS NULL
    `;

    const deletedChat = await deleteGroupChatIfEmpty(executor, chatId);
    if (!deletedChat) {
      await emitUserRemoved(chatId, userId, userId, 'account_deleted');
    }

    participantsBeforeLeave.forEach((participantId) => invalidatedUserIds.add(participantId));
    invalidatedUserIds.add(userId);
  }

  return Array.from(invalidatedUserIds);
}

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

  // Invalidate conversation lists for all active participants (including new member).
  const participantIds = await getChatParticipantIds(chatId);
  await invalidateConversationLists(participantIds);
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

  // Invalidate conversation lists for all remaining active participants and removed user.
  const participantIds = await getChatParticipantIds(chatId);
  await invalidateConversationLists(Array.from(new Set([...participantIds, targetUserId])));
}

/**
 * User voluntarily leaves a group chat
 */
export async function leaveGroupChat(userId: string, chatId: string): Promise<void> {
  await leaveGroupChatWithSuccessor(userId, chatId);
}

export async function leaveGroupChatWithSuccessor(
  userId: string,
  chatId: string,
  successorUserId?: string,
): Promise<void> {
  const { participantIds, deletedChat } = await prisma.$transaction(async (tx) => {
    await assignGroupSuccessorIfNeeded(tx, userId, chatId, successorUserId);

    const participantIdsBeforeLeave = await getChatParticipantIds(chatId);
    const now = new Date().toISOString();
    await tx.$executeRaw`
      UPDATE chat_participants
      SET left_at = ${now}
      WHERE chat_id = ${chatId}
        AND user_id = ${userId}
        AND left_at IS NULL
    `;

    const wasDeleted = await deleteGroupChatIfEmpty(tx, chatId);
    return {
      participantIds: participantIdsBeforeLeave,
      deletedChat: wasDeleted,
    };
  });

  if (!deletedChat) {
    await emitUserLeft(chatId, userId);
  }
  await invalidateConversationLists(Array.from(new Set([...participantIds, userId])));
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

  // Invalidate conversation lists for all active participants so role/member metadata stays fresh.
  const participantIds = await getChatParticipantIds(chatId);
  await invalidateConversationLists(participantIds);
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
  await invalidateConversationLists(participantIds);
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
  await invalidateConversationLists(participantIds);

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
      display_name: string;
      username: string;
      role: string;
      joined_at: Date;
      left_at: Date | null;
    }[]
  >`
    SELECT cp.user_id, u.display_name, u.username, cp.role, cp.joined_at, cp.left_at
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
      const branch = summary?.details.branch ?? null;
      const year =
        summary && summary.type === 'student'
          ? (summary.details.year ?? null)
          : (summary?.details.passingYear ?? null);
      return {
        userId: member.user_id,
        displayName: summary?.displayName ?? member.display_name,
        username: member.username,
        avatarUrl: summary?.profilePictureUrl ?? null,
        role: member.role.toLowerCase(),
        branch,
        year,
        userType: summary?.type ?? null,
        joinedAt: member.joined_at.toISOString(),
        leftAt: member.left_at?.toISOString() ?? null,
      };
    }),
  };
}
