import { Prisma } from '@prisma/client';
import prisma from '../prisma';

export type ProfileVisibility = 'full' | 'blocked-by-viewer' | 'restricted';

export interface BlockState {
  viewerHasBlockedUser: boolean;
  viewerIsBlockedByUser: boolean;
}

export interface UserCardView {
  userId: string;
  displayName: string;
  username: string;
  email?: string | null;
  profilePictureUrl: string | null;
  isPrivate?: boolean;
  type?: 'student' | 'alumni';
  branch?: string | null;
  year?: number | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
}

export async function getBlockState(viewerId: string, targetId: string): Promise<BlockState> {
  if (!viewerId || !targetId || viewerId === targetId) {
    return { viewerHasBlockedUser: false, viewerIsBlockedByUser: false };
  }

  const rows = await prisma.$queryRaw<Array<{ blocker_id: string; blocked_id: string }>>`
    SELECT blocker_id, blocked_id
    FROM blocked_users
    WHERE (blocker_id = ${viewerId} AND blocked_id = ${targetId})
       OR (blocker_id = ${targetId} AND blocked_id = ${viewerId})
  `;

  let viewerHasBlockedUser = false;
  let viewerIsBlockedByUser = false;
  for (const row of rows) {
    if (row.blocker_id === viewerId && row.blocked_id === targetId) {
      viewerHasBlockedUser = true;
    }
    if (row.blocker_id === targetId && row.blocked_id === viewerId) {
      viewerIsBlockedByUser = true;
    }
  }

  return { viewerHasBlockedUser, viewerIsBlockedByUser };
}

export async function getBlockStates(viewerId: string, targetIds: string[]): Promise<Map<string, BlockState>> {
  const uniqueTargetIds = Array.from(new Set(targetIds.filter((targetId) => Boolean(targetId) && targetId !== viewerId)));
  const states = new Map<string, BlockState>();
  for (const targetId of uniqueTargetIds) {
    states.set(targetId, { viewerHasBlockedUser: false, viewerIsBlockedByUser: false });
  }
  if (!viewerId || uniqueTargetIds.length === 0) {
    return states;
  }

  const rows = await prisma.$queryRaw<Array<{ blocker_id: string; blocked_id: string }>>`
    SELECT blocker_id, blocked_id
    FROM blocked_users
    WHERE (
      blocker_id = ${viewerId}
      AND blocked_id IN (${Prisma.join(uniqueTargetIds)})
    )
    OR (
      blocked_id = ${viewerId}
      AND blocker_id IN (${Prisma.join(uniqueTargetIds)})
    )
  `;

  for (const row of rows) {
    if (row.blocker_id === viewerId) {
      const current = states.get(row.blocked_id) ?? { viewerHasBlockedUser: false, viewerIsBlockedByUser: false };
      current.viewerHasBlockedUser = true;
      states.set(row.blocked_id, current);
    } else if (row.blocked_id === viewerId) {
      const current = states.get(row.blocker_id) ?? { viewerHasBlockedUser: false, viewerIsBlockedByUser: false };
      current.viewerIsBlockedByUser = true;
      states.set(row.blocker_id, current);
    }
  }

  return states;
}

export async function isBlockedEitherWay(userAId: string, userBId: string): Promise<boolean> {
  const state = await getBlockState(userAId, userBId);
  return state.viewerHasBlockedUser || state.viewerIsBlockedByUser;
}

export function getProfileVisibilityFromState(
  viewerId: string,
  ownerId: string,
  blockState: BlockState,
): ProfileVisibility {
  if (!viewerId || viewerId === ownerId) return 'full';
  if (blockState.viewerIsBlockedByUser) return 'restricted';
  if (blockState.viewerHasBlockedUser) return 'blocked-by-viewer';
  return 'full';
}

export async function getProfileVisibility(viewerId: string, ownerId: string): Promise<ProfileVisibility> {
  const blockState = await getBlockState(viewerId, ownerId);
  return getProfileVisibilityFromState(viewerId, ownerId, blockState);
}

export async function canAccessUserContent(viewerId: string, ownerId: string): Promise<boolean> {
  if (!viewerId || viewerId === ownerId) return true;
  const visibility = await getProfileVisibility(viewerId, ownerId);
  return visibility === 'full';
}

export async function canMessage(senderId: string, recipientId: string): Promise<{
  allowed: boolean;
  suppressedForUserId: string | null;
}> {
  const state = await getBlockState(senderId, recipientId);
  if (state.viewerHasBlockedUser) {
    return { allowed: false, suppressedForUserId: null };
  }
  if (state.viewerIsBlockedByUser) {
    return { allowed: true, suppressedForUserId: recipientId };
  }
  return { allowed: true, suppressedForUserId: null };
}

export function maskUserCardForViewer<T extends UserCardView>(
  viewerId: string,
  targetId: string,
  card: T,
  state: BlockState,
): T {
  if (!viewerId || viewerId === targetId) return card;
  if (!state.viewerHasBlockedUser && !state.viewerIsBlockedByUser) return card;

  return {
    ...card,
    profilePictureUrl: null,
    branch: state.viewerIsBlockedByUser ? null : card.branch ?? null,
    year: state.viewerIsBlockedByUser ? null : card.year ?? null,
    isOnline: false,
    lastSeenAt: null,
  };
}
