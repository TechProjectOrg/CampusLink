import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export type AuthUserType = 'student' | 'alumni';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  username: string;
  type: AuthUserType;
  sessionId: string;
}

export interface PasswordChangeTokenPayload {
  userId: string;
  purpose: 'password-change';
}

const BCRYPT_SALT_ROUNDS = 12;
const DEFAULT_TOKEN_TTL = '12h';
const PASSWORD_CHANGE_TOKEN_TTL = '10m';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error('JWT_SECRET must be set to a long, random secret');
  }

  return secret;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return bcrypt.compare(password, storedHash);
  }

  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  return legacyHash === storedHash;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_TTL) as jwt.SignOptions['expiresIn'];

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn,
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.username !== 'string' ||
    typeof decoded.type !== 'string' ||
    typeof decoded.sessionId !== 'string'
  ) {
    throw new Error('Invalid token payload');
  }

  const allowedTypes: AuthUserType[] = ['student', 'alumni'];
  if (!allowedTypes.includes(decoded.type as AuthUserType)) {
    throw new Error('Invalid token payload');
  }

  return {
    userId: decoded.userId,
    email: decoded.email,
    username: decoded.username,
    type: decoded.type as AuthUserType,
    sessionId: decoded.sessionId,
  };
}

export function signPasswordChangeToken(userId: string): string {
  return jwt.sign(
    {
      userId,
      purpose: 'password-change',
    },
    getJwtSecret(),
    {
      expiresIn: PASSWORD_CHANGE_TOKEN_TTL,
    }
  );
}

export function verifyPasswordChangeToken(token: string): PasswordChangeTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof decoded.userId !== 'string' ||
    decoded.purpose !== 'password-change'
  ) {
    throw new Error('Invalid password change token');
  }

  return {
    userId: decoded.userId,
    purpose: 'password-change',
  };
}
