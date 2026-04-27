/**
 * System Events for Chat
 *
 * Generates system messages for membership changes, role updates, etc.
 * These appear in the chat timeline and are visible based on membership windows
 */

import prisma from '../prisma';
import { MessageType } from '@prisma/client';

export enum SystemEventType {
  USER_JOINED = 'USER_JOINED',
  USER_LEFT = 'USER_LEFT',
  USER_REMOVED = 'USER_REMOVED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  CHAT_CREATED = 'CHAT_CREATED',
  CHAT_NAME_CHANGED = 'CHAT_NAME_CHANGED',
}

interface SystemEventPayload {
  eventType: SystemEventType;
  actorUserId?: string; // User who triggered the event (if applicable)
  targetUserId?: string; // User affected by the event (if applicable)
  previousRole?: string; // For role changes
  newRole?: string; // For role changes
  previousName?: string; // For name changes
  newName?: string; // For name changes
  reason?: string; // For removals
}

async function findExistingUserId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  return (rows[0]?.count ?? 0) > 0 ? userId : null;
}

async function resolveSystemEventSenderUserId(
  chatId: string,
  payload: SystemEventPayload,
): Promise<string> {
  const configuredSystemUserId = process.env.SYSTEM_USER_ID;

  // Priority order keeps semantics sensible while guaranteeing FK validity.
  const actorUserId = await findExistingUserId(payload.actorUserId);
  if (actorUserId) return actorUserId;

  const systemUserId = await findExistingUserId(configuredSystemUserId);
  if (systemUserId) return systemUserId;

  const chatCreatorRows = await prisma.$queryRaw<{ created_by_user_id: string | null }[]>`
    SELECT created_by_user_id
    FROM chats
    WHERE chat_id = ${chatId}
    LIMIT 1
  `;
  const chatCreatorId = await findExistingUserId(chatCreatorRows[0]?.created_by_user_id ?? null);
  if (chatCreatorId) return chatCreatorId;

  const targetUserId = await findExistingUserId(payload.targetUserId);
  if (targetUserId) return targetUserId;

  const participantRows = await prisma.$queryRaw<{ user_id: string }[]>`
    SELECT user_id
    FROM chat_participants
    WHERE chat_id = ${chatId} AND left_at IS NULL
    ORDER BY joined_at ASC
    LIMIT 1
  `;
  const participantUserId = await findExistingUserId(participantRows[0]?.user_id);
  if (participantUserId) return participantUserId;

  throw new Error(
    `Unable to resolve a valid sender user for system event in chat ${chatId}. ` +
      `Set SYSTEM_USER_ID to an existing user_id or ensure chat has valid participants.`,
  );
}

/**
 * Generates and persists a system message for an event
 *
 * System messages:
 * - Are of type SYSTEM
 * - Have content describing the event
 * - Are stored as JSON in metadata
 * - Are visible to all current members (but not former members who left before the event)
 *
 * @returns messageId of created system message
 */
export async function createSystemEvent(
  chatId: string,
  payload: SystemEventPayload,
): Promise<string> {
  const systemUserId = await resolveSystemEventSenderUserId(chatId, payload);
  const now = new Date().toISOString();

  // Build human-readable content
  let content = '';
  switch (payload.eventType) {
    case SystemEventType.USER_JOINED:
      content = `User joined the chat`;
      break;
    case SystemEventType.USER_LEFT:
      content = `User left the chat`;
      break;
    case SystemEventType.USER_REMOVED:
      content = `User was removed from the chat`;
      break;
    case SystemEventType.USER_ROLE_CHANGED:
      content = `User role changed from ${payload.previousRole} to ${payload.newRole}`;
      break;
    case SystemEventType.CHAT_CREATED:
      content = `Chat was created`;
      break;
    case SystemEventType.CHAT_NAME_CHANGED:
      content = `Chat name changed from "${payload.previousName}" to "${payload.newName}"`;
      break;
  }

  const rows = await prisma.$queryRaw<{ message_id: string }[]>`
    INSERT INTO messages (
      chat_id,
      sender_user_id,
      message_type,
      content,
      reactions,
      created_at,
      updated_at
    ) VALUES (
      ${chatId},
      ${systemUserId},
      'system',
      ${content},
      '{}'::jsonb,
      ${now},
      ${now}
    )
    RETURNING message_id
  `;

  const messageId = rows[0]?.message_id;
  if (!messageId) throw new Error('Failed to create system message');

  // Store metadata as JSON for reference
  // This allows clients to render rich UI for system events
  await prisma.$queryRaw`
    UPDATE messages
    SET reactions = reactions || ${JSON.stringify({ __systemEvent: payload })}::jsonb
    WHERE message_id = ${messageId}
  `;

  return messageId;
}

/**
 * Creates JOINED event when user is added to a chat
 */
export async function emitUserJoined(chatId: string, userId: string): Promise<string> {
  return createSystemEvent(chatId, {
    eventType: SystemEventType.USER_JOINED,
    targetUserId: userId,
  });
}

/**
 * Creates LEFT event when user leaves a chat
 */
export async function emitUserLeft(chatId: string, userId: string): Promise<string> {
  return createSystemEvent(chatId, {
    eventType: SystemEventType.USER_LEFT,
    targetUserId: userId,
  });
}

/**
 * Creates REMOVED event when user is kicked from a chat
 */
export async function emitUserRemoved(
  chatId: string,
  userId: string,
  actorUserId: string,
  reason?: string,
): Promise<string> {
  return createSystemEvent(chatId, {
    eventType: SystemEventType.USER_REMOVED,
    targetUserId: userId,
    actorUserId,
    reason,
  });
}

/**
 * Creates ROLE_CHANGED event when user's role is updated
 */
export async function emitUserRoleChanged(
  chatId: string,
  userId: string,
  previousRole: string,
  newRole: string,
  actorUserId: string,
): Promise<string> {
  return createSystemEvent(chatId, {
    eventType: SystemEventType.USER_ROLE_CHANGED,
    targetUserId: userId,
    actorUserId,
    previousRole,
    newRole,
  });
}

/**
 * Extracts system event metadata from a message
 * Returns null if message is not a system event
 */
export function extractSystemEventPayload(message: {
  reactions: Record<string, unknown>;
}): SystemEventPayload | null {
  const payload = (message.reactions as Record<string, unknown>)?.__systemEvent;
  return payload ? (payload as SystemEventPayload) : null;
}
