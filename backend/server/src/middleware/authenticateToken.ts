import { NextFunction, Request, Response } from 'express';
import prisma from '../prisma';
import { verifyAuthToken, type AuthTokenPayload } from '../lib/auth';
import { assertCanLogin, getModerationState, type ModerationState } from '../lib/moderation';

export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
  moderationState?: ModerationState;
}

export default async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) {
    return res.status(401).json({ message: 'Missing or invalid authorization token' });
  }

  try {
    const payload = verifyAuthToken(token);
    const activeSessions = await prisma.$queryRaw<{ session_id: string }[]>`
      SELECT session_id
      FROM user_sessions
      WHERE session_id = ${payload.sessionId}
        AND user_id = ${payload.userId}
        AND revoked_at IS NULL
      LIMIT 1
    `;

    if (!activeSessions[0]) {
      return res.status(401).json({ message: 'Invalid or expired authorization token' });
    }

    await prisma.$queryRaw`
      UPDATE user_sessions
      SET last_seen_at = NOW()
      WHERE session_id = ${payload.sessionId}
    `;

    const moderationState = await getModerationState(payload.userId);
    assertCanLogin(moderationState);

    (req as AuthedRequest).auth = payload;
    (req as AuthedRequest).moderationState = moderationState;
    return next();
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      return res.status(Number((error as any).status) || 403).json({
        message: error.message,
        code: (error as any).code ?? 'AUTH_RESTRICTED',
        moderation: 'state' in error ? (error as any).state : undefined,
      });
    }
    return res.status(401).json({ message: 'Invalid or expired authorization token' });
  }
}
