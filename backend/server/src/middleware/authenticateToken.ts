import { NextFunction, Request, Response } from 'express';
import prisma from '../prisma';
import { verifyAuthToken, type AuthTokenPayload } from '../lib/auth';

export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
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

    (req as AuthedRequest).auth = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authorization token' });
  }
}