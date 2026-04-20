import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken, type AuthTokenPayload } from '../lib/auth';

export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
}

export default function authenticateToken(req: Request, res: Response, next: NextFunction) {
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
    (req as AuthedRequest).auth = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authorization token' });
  }
}