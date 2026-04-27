/**
 * Chat Permissions & Roles
 *
 * Implements role-based permission checking for chat operations
 * Supports both independent group chats and system-owned club chats
 */

import prisma from '../prisma';
import { ChatParticipantRole } from '@prisma/client';

/**
 * Available permissions for chat operations
 */
export enum ChatPermission {
  // Message operations
  SEND_MESSAGE = 'SEND_MESSAGE',
  DELETE_MESSAGE = 'DELETE_MESSAGE',

  // Member management
  ADD_MEMBER = 'ADD_MEMBER',
  REMOVE_MEMBER = 'REMOVE_MEMBER',
  CHANGE_MEMBER_ROLE = 'CHANGE_MEMBER_ROLE',

  // Chat settings
  UPDATE_CHAT_SETTINGS = 'UPDATE_CHAT_SETTINGS',
  DELETE_CHAT = 'DELETE_CHAT',
}

/**
 * Role-to-permissions mapping
 * Defines what each role is allowed to do
 */
const ROLE_PERMISSIONS: Record<ChatParticipantRole, ChatPermission[]> = {
  OWNER: [
    ChatPermission.SEND_MESSAGE,
    ChatPermission.DELETE_MESSAGE,
    ChatPermission.ADD_MEMBER,
    ChatPermission.REMOVE_MEMBER,
    ChatPermission.CHANGE_MEMBER_ROLE,
    ChatPermission.UPDATE_CHAT_SETTINGS,
    ChatPermission.DELETE_CHAT,
  ],
  ADMIN: [
    ChatPermission.SEND_MESSAGE,
    ChatPermission.DELETE_MESSAGE,
    ChatPermission.ADD_MEMBER,
    ChatPermission.REMOVE_MEMBER,
    ChatPermission.CHANGE_MEMBER_ROLE,
    ChatPermission.UPDATE_CHAT_SETTINGS,
  ],
  MEMBER: [ChatPermission.SEND_MESSAGE],
};

/**
 * Special permissions for club chats (derived from club membership)
 * These override chat-specific roles
 */
export enum ClubRolePermissionOverride {
  OWNER = 'OWNER', // Can do anything in club chat
  ADMIN = 'ADMIN', // Can manage members
  MEMBER = 'MEMBER', // Can only send messages
}

/**
 * Gets user's role in a chat
 * @returns Role or null if not a member
 */
export async function getUserChatRole(
  userId: string,
  chatId: string,
): Promise<ChatParticipantRole | null> {
  const rows = await prisma.$queryRaw<{ role: ChatParticipantRole }[]>`
    SELECT role FROM chat_participants
    WHERE chat_id = ${chatId}
      AND user_id = ${userId}
      AND left_at IS NULL
    LIMIT 1
  `;

  return rows[0]?.role ?? null;
}

/**
 * Checks if user has permission to perform an action in a chat
 *
 * For club chats: permissions derived from club role (overrides chat role)
 * For group chats: permissions based on chat role
 *
 * @throws Error if user lacks permission or is not a member
 */
export async function checkChatPermission(
  userId: string,
  chatId: string,
  permission: ChatPermission,
  clubId?: string,
): Promise<void> {
  // Get user's chat role
  const role = await getUserChatRole(userId, chatId);
  if (!role) {
    throw new Error(`User ${userId} is not an active member of chat ${chatId}`);
  }

  // For club chats, check club role instead
  if (clubId) {
    const clubRole = await getUserClubRole(userId, clubId);
    if (!clubRole) {
      throw new Error(`User ${userId} is not a member of club ${clubId}`);
    }

    const clubPermissions = ROLE_PERMISSIONS[clubRole] ?? [];
    if (!clubPermissions.includes(permission)) {
      throw new Error(
        `User ${userId} with club role ${clubRole} lacks permission ${permission} in club chat`,
      );
    }
    return;
  }

  // For group chats, use chat role
  const userPermissions = ROLE_PERMISSIONS[role] ?? [];
  if (!userPermissions.includes(permission)) {
    throw new Error(`User ${userId} with role ${role} lacks permission ${permission}`);
  }
}

/**
 * Gets user's role in a club
 * Used for determining permissions in club chats
 *
 * @returns Role or null if not a member
 */
export async function getUserClubRole(userId: string, clubId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ role: string }[]>`
    SELECT role FROM club_memberships
    WHERE club_id = ${clubId}
      AND user_id = ${userId}
      AND status = 'active'
    LIMIT 1
  `;

  return rows[0]?.role ?? null;
}

/**
 * Checks if user can add another user to a group chat
 *
 * For independent groups: checks ADD_MEMBER permission + user's add preference
 * For club chats: automatic, based on club membership
 *
 * @throws Error if permission denied
 */
export async function checkCanAddUserToChat(
  actorUserId: string,
  targetUserId: string,
  chatId: string,
  chatType: 'DIRECT' | 'GROUP',
  clubId?: string,
): Promise<void> {
  // Check base permission
  await checkChatPermission(actorUserId, chatId, ChatPermission.ADD_MEMBER, clubId);

  // For independent group chats, check target's preference
  if (chatType === 'GROUP' && !clubId) {
    const targetSettings = await prisma.$queryRaw<{ group_add_preference: string }[]>`
      SELECT group_add_preference FROM user_settings
      WHERE user_id = ${targetUserId}
      LIMIT 1
    `;

    const preference = targetSettings[0]?.group_add_preference ?? 'everyone';
    if (preference === 'none') {
      throw new Error(`User ${targetUserId} does not accept group chat invitations`);
    }

    // TODO: Implement 'friends' check if needed
    // if (preference === 'friends') { /* check mutual follow */ }
  }
}

/**
 * Validates role change operation
 *
 * Rules:
 * - Cannot remove the last OWNER from a group chat
 * - Only OWNER can promote to OWNER
 * - Cannot change role of user who has left
 */
export async function validateRoleChange(
  userId: string,
  chatId: string,
  newRole: ChatParticipantRole,
  clubId?: string,
): Promise<void> {
  // Check actor has permission
  await checkChatPermission(userId, chatId, ChatPermission.CHANGE_MEMBER_ROLE, clubId);

  // Check if this is the last owner and trying to demote them
  if (newRole !== 'OWNER') {
    const ownerCount = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM chat_participants
      WHERE chat_id = ${chatId}
        AND role = 'owner'
        AND left_at IS NULL
    `;

    if ((ownerCount[0]?.count ?? 0) === 1) {
      throw new Error(
        'Cannot demote the last owner. Assign another owner before removing this role.',
      );
    }
  }
}

/**
 * Checks if a user is the owner of a group chat
 * Used for ownership-only operations
 */
export async function isGroupChatOwner(userId: string, chatId: string): Promise<boolean> {
  const role = await getUserChatRole(userId, chatId);
  return role === 'OWNER';
}
