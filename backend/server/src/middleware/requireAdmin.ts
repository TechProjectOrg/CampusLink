import { NextFunction, Request, Response } from 'express';
import { getAdminAccountByUserId } from '../lib/admin';
import type { AuthedRequest } from './authenticateToken';

export interface AdminAuthedRequest extends AuthedRequest {
  admin?: {
    userId: string;
    email: string;
    username: string;
    role: 'super_admin';
    mustChangePassword: boolean;
    lastLoginAt: string | null;
  };
}

export default async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authed = req as AdminAuthedRequest;
  const userId = authed.auth?.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Missing authorization context' });
  }

  try {
    const admin = await getAdminAccountByUserId(userId);
    if (!admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    authed.admin = admin;
    return next();
  } catch (err) {
    console.error('Error validating admin access:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
