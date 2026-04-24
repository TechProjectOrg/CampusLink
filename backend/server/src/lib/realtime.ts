import type { Server as HttpServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import prisma from '../prisma';
import { verifyAuthToken } from './auth';
import { emitTypingIndicator, getChatParticipantIds } from './chat';

// ---------------------------------------------------------------------------
// Socket registry — exported so lib/chat.ts can emit chat events directly
// ---------------------------------------------------------------------------

export const socketsByUserId = new Map<string, Set<WebSocket>>();

// ---------------------------------------------------------------------------
// Outbound envelope types
// ---------------------------------------------------------------------------

type RealtimeEnvelopeType =
  | 'notification:new'
  | 'notification:update'
  | 'chat:message'
  | 'chat:typing'
  | 'chat:read'
  | 'chat:status'
  | 'chat:reaction'
  | 'chat:request_accepted';

interface RealtimeEnvelope {
  type: RealtimeEnvelopeType;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Inbound message types (sent by clients over the WebSocket)
// ---------------------------------------------------------------------------

interface InboundTypingEvent {
  type: 'chat:typing';
  chatId: string;
  isTyping: boolean;
}

type InboundEvent = InboundTypingEvent;

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

function registerSocket(userId: string, socket: WebSocket): void {
  const existing = socketsByUserId.get(userId) ?? new Set<WebSocket>();
  existing.add(socket);
  socketsByUserId.set(userId, existing);
}

function unregisterSocket(userId: string, socket: WebSocket): void {
  const existing = socketsByUserId.get(userId);
  if (!existing) return;
  existing.delete(socket);
  if (existing.size === 0) {
    socketsByUserId.delete(userId);
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function authenticateSocket(token: string): Promise<string | null> {
  try {
    const payload = verifyAuthToken(token);
    const rows = await prisma.$queryRaw<{ session_id: string }[]>`
      SELECT session_id
      FROM user_sessions
      WHERE session_id = ${payload.sessionId}
        AND user_id = ${payload.userId}
        AND revoked_at IS NULL
      LIMIT 1
    `;

    if (!rows[0]) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Online / offline state helpers
// ---------------------------------------------------------------------------

async function setUserOnline(userId: string): Promise<void> {
  try {
    await prisma.$queryRaw`
      UPDATE users SET is_online = TRUE WHERE user_id = ${userId}
    `;
    await notifyChatPartnersOfStatus(userId, true);
  } catch (err) {
    console.error('Failed to mark user online:', err);
  }
}

async function setUserOffline(userId: string): Promise<void> {
  try {
    await prisma.$queryRaw`
      UPDATE users SET is_online = FALSE, last_seen_at = NOW() WHERE user_id = ${userId}
    `;
    await notifyChatPartnersOfStatus(userId, false);
  } catch (err) {
    console.error('Failed to mark user offline:', err);
  }
}

/**
 * Emits a chat:status event to all users who share at least one active chat
 * with the user that just came online or went offline.
 */
async function notifyChatPartnersOfStatus(userId: string, isOnline: boolean): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<{ last_seen_at: Date | null }[]>`
      SELECT last_seen_at FROM users WHERE user_id = ${userId} LIMIT 1
    `;
    const lastSeenAt = rows[0]?.last_seen_at?.toISOString() ?? null;

    // Get distinct partner user IDs across all shared chats
    const partnerRows = await prisma.$queryRaw<{ user_id: string }[]>`
      SELECT DISTINCT cp2.user_id
      FROM chat_participants cp1
      JOIN chat_participants cp2
        ON cp2.chat_id = cp1.chat_id
       AND cp2.user_id <> ${userId}
       AND cp2.left_at IS NULL
      WHERE cp1.user_id = ${userId}
        AND cp1.left_at IS NULL
    `;

    const envelope: RealtimeEnvelope = {
      type: 'chat:status',
      payload: { userId, isOnline, lastSeenAt },
    };
    const serialized = JSON.stringify(envelope);

    for (const { user_id } of partnerRows) {
      const sockets = socketsByUserId.get(user_id);
      if (!sockets) continue;
      for (const socket of sockets) {
        if (socket.readyState === socket.OPEN) socket.send(serialized);
      }
    }
  } catch (err) {
    console.error('Failed to notify chat partners of status:', err);
  }
}

// ---------------------------------------------------------------------------
// Inbound message handler
// ---------------------------------------------------------------------------

async function handleClientMessage(userId: string, raw: string): Promise<void> {
  let event: InboundEvent;
  try {
    event = JSON.parse(raw) as InboundEvent;
  } catch {
    return; // malformed JSON — ignore
  }

  if (event.type === 'chat:typing' && typeof event.chatId === 'string') {
    try {
      const participantIds = await getChatParticipantIds(event.chatId);
      // Only relay if the sender is actually a participant
      if (participantIds.includes(userId)) {
        emitTypingIndicator(participantIds, event.chatId, userId, event.isTyping ?? false);
      }
    } catch (err) {
      console.error('Failed to relay typing indicator:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — emit helpers
// ---------------------------------------------------------------------------

/**
 * Emits a typed event envelope to all open sockets for a given user.
 */
export function emitToUser(userId: string, event: RealtimeEnvelope): void {
  const sockets = socketsByUserId.get(userId);
  if (!sockets || sockets.size === 0) return;

  const serialized = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(serialized);
    }
  }
}

/**
 * Legacy shim used by lib/notifications.ts — keeps existing call sites working.
 */
export function emitNotificationEvent(
  userId: string,
  event: { type: 'notification:new' | 'notification:update'; payload: unknown }
): void {
  emitToUser(userId, event);
}

/**
 * Returns true if the user currently has at least one open WebSocket connection.
 */
export function isUserOnline(userId: string): boolean {
  const sockets = socketsByUserId.get(userId);
  return sockets !== undefined && sockets.size > 0;
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

export function initializeRealtimeServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    const requestUrl = req.url ? new URL(req.url, 'http://localhost') : null;
    const token = requestUrl?.searchParams.get('token')?.trim();
    if (!token) {
      socket.close(1008, 'Missing token');
      return;
    }

    const userId = await authenticateSocket(token);
    if (!userId) {
      socket.close(1008, 'Invalid token');
      return;
    }

    registerSocket(userId, socket);
    setUserOnline(userId);

    socket.on('message', (data) => {
      handleClientMessage(userId, data.toString());
    });

    socket.on('close', () => {
      unregisterSocket(userId, socket);
      // Only mark offline if no remaining sockets for this user
      if (!socketsByUserId.has(userId)) {
        setUserOffline(userId);
      }
    });
  });
}
