import type { RequestHandler } from 'express';
import type { AuthedRequest } from './authenticateToken';
import {
  assertCanComment,
  assertCanManageCommunities,
  assertCanMessage,
  assertCanNetwork,
  assertCanPost,
  assertCanUpload,
  type ModerationState,
} from '../lib/moderation';

type Capability = 'post' | 'comment' | 'message' | 'network' | 'upload' | 'community';

function applyCapability(capability: Capability, state: ModerationState): void {
  if (capability === 'post') {
    assertCanPost(state);
    return;
  }
  if (capability === 'comment') {
    assertCanComment(state);
    return;
  }
  if (capability === 'message') {
    assertCanMessage(state);
    return;
  }
  if (capability === 'network') {
    assertCanNetwork(state);
    return;
  }
  if (capability === 'upload') {
    assertCanUpload(state);
    return;
  }
  assertCanManageCommunities(state);
}

export default function requireModerationCapability(capability: Capability): RequestHandler {
  return (req, res, next) => {
    const authed = req as AuthedRequest;
    if (!authed.auth || !authed.moderationState) {
      res.status(401).json({ message: 'Missing authorization context' });
      return;
    }

    try {
      applyCapability(capability, authed.moderationState);
      next();
      return;
    } catch (error) {
      if (error instanceof Error && 'status' in error) {
        res.status(Number((error as any).status) || 403).json({
          message: error.message,
          code: (error as any).code ?? 'MODERATION_RESTRICTED',
          moderation: (error as any).state,
        });
        return;
      }
      res.status(403).json({ message: 'Action blocked due to moderation restrictions.' });
    }
  };
}
