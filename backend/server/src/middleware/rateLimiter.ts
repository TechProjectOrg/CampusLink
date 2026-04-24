import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from './authenticateToken';

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30;

// In-memory store keyed by userId
const windowsByUserId = new Map<string, RateLimitWindow>();

/**
 * Sliding-window rate limiter — max 30 messages per user per minute.
 * Returns 429 with Retry-After header when the limit is exceeded.
 */
export function chatMessageRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as unknown as AuthedRequest).auth?.userId;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const now = Date.now();
  const existing = windowsByUserId.get(userId);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    // Start fresh window
    windowsByUserId.set(userId, { count: 1, windowStart: now });
    return next();
  }

  existing.count += 1;
  if (existing.count > MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - existing.windowStart)) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      message: `Too many messages. You can send ${MAX_REQUESTS} messages per minute.`,
      retryAfter: retryAfterSec,
    });
    return;
  }

  return next();
}
