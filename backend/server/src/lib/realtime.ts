import type { Server as HttpServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import prisma from '../prisma';
import { verifyAuthToken } from './auth';

const socketsByUserId = new Map<string, Set<WebSocket>>();

interface RealtimeEnvelope {
  type: 'notification:new' | 'notification:update';
  payload: unknown;
}

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

    socket.on('close', () => {
      unregisterSocket(userId, socket);
    });
  });
}

export function emitNotificationEvent(userId: string, event: RealtimeEnvelope): void {
  const sockets = socketsByUserId.get(userId);
  if (!sockets || sockets.size === 0) return;

  const serialized = JSON.stringify(event);

  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(serialized);
    }
  }
}
