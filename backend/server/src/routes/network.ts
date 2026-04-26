import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { createNotification } from '../lib/notifications';
import { invalidateUserFeedCache } from '../lib/feedCache';
import { getUserSummariesByIds, getUserSummaryById, incrementUserStat, toCachedUserCard } from '../lib/userCache';

const router = express.Router();

router.use(authenticateToken);

// ---- helpers ----

function mapMinimalUserFromSummary(summary: Awaited<ReturnType<typeof getUserSummaryById>> extends infer T ? NonNullable<T> : never) {
  const card = toCachedUserCard(summary);
  return {
    userId: card.userId,
    username: card.username,
    profilePictureUrl: card.profilePictureUrl,
    isPrivate: card.isPrivate,
    type: card.type,
    branch: card.branch,
    year: card.year,
  };
}

async function hydrateOrderedUsers(userIds: string[]) {
  const summaries = await getUserSummariesByIds(userIds);
  return userIds
    .map((userId) => summaries.get(userId))
    .filter((summary): summary is NonNullable<typeof summary> => summary !== undefined)
    .map(mapMinimalUserFromSummary);
}

// ============================================================
// GET /network/graph — full follow state of current user
// ============================================================

router.get('/graph', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;

  try {
    // Followers (people who follow me)
    const followerRows = await prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT
        f.follower_user_id AS user_id
      FROM follows f
      WHERE f.followed_user_id = ${userId}
      ORDER BY f.created_at DESC
    `;

    // Following (people I follow)
    const followingRows = await prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT
        f.followed_user_id AS user_id
      FROM follows f
      WHERE f.follower_user_id = ${userId}
      ORDER BY f.created_at DESC
    `;

    // Incoming follow requests (pending)
    const incomingRows = await prisma.$queryRaw<Array<{ follow_request_id: string; user_id: string }>>`
      SELECT fr.follow_request_id,
             fr.requester_user_id AS user_id
      FROM follow_requests fr
      WHERE fr.target_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;

    // Outgoing follow requests (pending)
    const outgoingRows = await prisma.$queryRaw<Array<{ follow_request_id: string; user_id: string }>>`
      SELECT fr.follow_request_id,
             fr.target_user_id AS user_id
      FROM follow_requests fr
      WHERE fr.requester_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;

    const [followers, following, incomingUsers, outgoingUsers] = await Promise.all([
      hydrateOrderedUsers(followerRows.map((row) => row.user_id)),
      hydrateOrderedUsers(followingRows.map((row) => row.user_id)),
      hydrateOrderedUsers(incomingRows.map((row) => row.user_id)),
      hydrateOrderedUsers(outgoingRows.map((row) => row.user_id)),
    ]);

    return res.status(200).json({
      followers,
      following,
      incomingRequests: incomingRows.map((row, index) => ({
        requestId: row.follow_request_id,
        ...incomingUsers[index],
      })),
      outgoingRequests: outgoingRows.map((row, index) => ({
        requestId: row.follow_request_id,
        ...outgoingUsers[index],
      })),
    });
  } catch (err) {
    console.error('Error fetching follow graph:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// POST /network/follow — Follow a user (or send request to private)
// ============================================================

router.post('/follow', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const { targetUserId } = req.body as { targetUserId?: string };

  if (!targetUserId) {
    return res.status(400).json({ message: 'targetUserId is required' });
  }
  if (targetUserId === currentUserId) {
    return res.status(400).json({ message: 'Cannot follow yourself' });
  }

  try {
    // Check if target user exists and get privacy status
    const [target, currentUser] = await Promise.all([
      getUserSummaryById(targetUserId),
      getUserSummaryById(currentUserId),
    ]);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }
    const currentUsername = currentUser?.username ?? 'Someone';

    // Check already following
    const alreadyFollowing = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM follows
      WHERE follower_user_id = ${currentUserId} AND followed_user_id = ${targetUserId}
    `;
    if ((alreadyFollowing[0]?.count ?? 0) > 0) {
      return res.status(409).json({ message: 'Already following this user' });
    }

    if (target.isPrivate) {
      // Check for existing pending request
      const existingRequest = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM follow_requests
        WHERE requester_user_id = ${currentUserId}
          AND target_user_id = ${targetUserId}
          AND status = 'pending'
      `;
      if ((existingRequest[0]?.count ?? 0) > 0) {
        return res.status(409).json({ message: 'Follow request already pending' });
      }

      // Create follow request
      const insertedRows = await prisma.$queryRaw<{ follow_request_id: string }[]>`
        INSERT INTO follow_requests (requester_user_id, target_user_id, status)
        VALUES (${currentUserId}, ${targetUserId}, 'pending')
        RETURNING follow_request_id
      `;

      await createNotification({
        recipientUserId: targetUserId,
        actorUserId: currentUserId,
        type: 'follow_request',
        title: currentUsername,
        message: 'requested to follow you',
        entityType: 'follow_request',
        entityId: insertedRows[0]?.follow_request_id,
      });

      return res.status(201).json({ status: 'requested', requestId: insertedRows[0]?.follow_request_id });
    }

    // Public account → direct follow
    const inserted = await prisma.$queryRaw<Array<{ count: number }>>`
      WITH inserted AS (
        INSERT INTO follows (follower_user_id, followed_user_id)
        VALUES (${currentUserId}, ${targetUserId})
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM inserted
    `;
    if ((inserted[0]?.count ?? 0) === 0) {
      return res.status(409).json({ message: 'Already following this user' });
    }

    await invalidateUserFeedCache(currentUserId);
    await Promise.all([
      incrementUserStat(currentUserId, 'followingCount', 1),
      incrementUserStat(targetUserId, 'followerCount', 1),
    ]);

    await createNotification({
      recipientUserId: targetUserId,
      actorUserId: currentUserId,
      type: 'follow',
      title: currentUsername,
      message: 'started following you',
    });

    return res.status(201).json({ status: 'following' });
  } catch (err) {
    console.error('Error following user:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// DELETE /network/follow/:targetUserId — Unfollow a user
// ============================================================

router.delete('/follow/:targetUserId', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const targetUserId = String(req.params.targetUserId);

  try {
    // Delete from follows
    const deleted = await prisma.$queryRaw<Array<{ count: number }>>`
      WITH deleted AS (
        DELETE FROM follows
        WHERE follower_user_id = ${currentUserId} AND followed_user_id = ${targetUserId}
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;
    if ((deleted[0]?.count ?? 0) > 0) {
      await invalidateUserFeedCache(currentUserId);
      await Promise.all([
        incrementUserStat(currentUserId, 'followingCount', -1),
        incrementUserStat(targetUserId, 'followerCount', -1),
      ]);
    }

    // Also clean up any accepted follow_request rows (per user preference)
    await prisma.$queryRaw`
      DELETE FROM follow_requests
      WHERE requester_user_id = ${currentUserId}
        AND target_user_id = ${targetUserId}
        AND status = 'accepted'
    `;

    return res.status(204).send();
  } catch (err) {
    console.error('Error unfollowing user:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// DELETE /network/followers/:followerUserId — Remove a follower
// ============================================================

router.delete('/followers/:followerUserId', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const followerUserId = String(req.params.followerUserId);

  try {
    const deleted = await prisma.$queryRaw<Array<{ count: number }>>`
      WITH deleted AS (
        DELETE FROM follows
        WHERE follower_user_id = ${followerUserId} AND followed_user_id = ${currentUserId}
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `;
    if ((deleted[0]?.count ?? 0) > 0) {
      await invalidateUserFeedCache(followerUserId);
      await Promise.all([
        incrementUserStat(followerUserId, 'followingCount', -1),
        incrementUserStat(currentUserId, 'followerCount', -1),
      ]);
    }

    // Clean up accepted request row
    await prisma.$queryRaw`
      DELETE FROM follow_requests
      WHERE requester_user_id = ${followerUserId}
        AND target_user_id = ${currentUserId}
        AND status = 'accepted'
    `;

    return res.status(204).send();
  } catch (err) {
    console.error('Error removing follower:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// GET /network/requests/incoming — Incoming pending follow requests
// ============================================================

router.get('/requests/incoming', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;

  try {
    const rows = await prisma.$queryRaw<Array<{ follow_request_id: string; created_at: Date; user_id: string }>>`
      SELECT fr.follow_request_id, fr.created_at,
             fr.requester_user_id AS user_id
      FROM follow_requests fr
      WHERE fr.target_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;
    const users = await hydrateOrderedUsers(rows.map((row) => row.user_id));

    return res.status(200).json(
      rows.map((row, index) => ({
        requestId: row.follow_request_id,
        createdAt: row.created_at.toISOString(),
        ...users[index],
      }))
    );
  } catch (err) {
    console.error('Error fetching incoming requests:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// GET /network/requests/outgoing — Outgoing pending follow requests
// ============================================================

router.get('/requests/outgoing', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;

  try {
    const rows = await prisma.$queryRaw<Array<{ follow_request_id: string; created_at: Date; user_id: string }>>`
      SELECT fr.follow_request_id, fr.created_at,
             fr.target_user_id AS user_id
      FROM follow_requests fr
      WHERE fr.requester_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;
    const users = await hydrateOrderedUsers(rows.map((row) => row.user_id));

    return res.status(200).json(
      rows.map((row, index) => ({
        requestId: row.follow_request_id,
        createdAt: row.created_at.toISOString(),
        ...users[index],
      }))
    );
  } catch (err) {
    console.error('Error fetching outgoing requests:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// POST /network/requests/:requestId/accept
// ============================================================

router.post('/requests/:requestId/accept', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const requestIdentifier = req.params.requestId as string;

  try {
    // Allow accepting by either follow_request_id or requester_user_id.
    // This makes the API resilient when clients only have requester user IDs.
    const requestRows = await prisma.$queryRaw<{ follow_request_id: string; requester_user_id: string; target_user_id: string }[]>`
      SELECT follow_request_id, requester_user_id, target_user_id
      FROM follow_requests
      WHERE (follow_request_id = ${requestIdentifier} OR requester_user_id = ${requestIdentifier})
        AND target_user_id = ${currentUserId}
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const request = requestRows[0];
    if (!request) {
      return res.status(404).json({ message: 'Follow request not found or already handled' });
    }

    const requesterId = request.requester_user_id;

    // Get current user's username for notification
    const currentUser = await getUserSummaryById(currentUserId);
    const currentUsername = currentUser?.username ?? 'Someone';

    const accepted = await prisma.$transaction(async (tx) => {
      // Update follow request status
      await tx.$queryRaw`
        UPDATE follow_requests
        SET status = 'accepted', responded_at = NOW()
        WHERE follow_request_id = ${request.follow_request_id}
      `;

      // Create the follow relationship (requester now follows the target)
      const inserted = await tx.$queryRaw<Array<{ count: number }>>`
        WITH inserted AS (
          INSERT INTO follows (follower_user_id, followed_user_id)
          VALUES (${requesterId}, ${currentUserId})
          ON CONFLICT DO NOTHING
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM inserted
      `;

      return (inserted[0]?.count ?? 0) > 0;
    });
    await invalidateUserFeedCache(requesterId);
    if (accepted) {
      await Promise.all([
        incrementUserStat(requesterId, 'followingCount', 1),
        incrementUserStat(currentUserId, 'followerCount', 1),
      ]);
    }

    await createNotification({
      recipientUserId: requesterId,
      actorUserId: currentUserId,
      type: 'follow_accept',
      title: currentUsername,
      message: 'accepted your follow request',
      entityType: 'follow_request',
      entityId: request.follow_request_id,
    });

    return res.status(200).json({ message: 'Follow request accepted' });
  } catch (err) {
    console.error('Error accepting follow request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// POST /network/requests/:requestId/reject
// ============================================================

router.post('/requests/:requestId/reject', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const requestIdentifier = req.params.requestId as string;

  try {
    const result = await prisma.$queryRaw<{ count: number }[]>`
      WITH candidate AS (
        SELECT follow_request_id
        FROM follow_requests
        WHERE (follow_request_id = ${requestIdentifier} OR requester_user_id = ${requestIdentifier})
          AND target_user_id = ${currentUserId}
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      ),
      updated AS (
        UPDATE follow_requests fr
        SET status = 'rejected', responded_at = NOW()
        FROM candidate c
        WHERE fr.follow_request_id = c.follow_request_id
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM updated
    `;

    if ((result[0]?.count ?? 0) === 0) {
      return res.status(404).json({ message: 'Follow request not found or already handled' });
    }

    return res.status(200).json({ message: 'Follow request rejected' });
  } catch (err) {
    console.error('Error rejecting follow request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// DELETE /network/requests/:targetUserId — Cancel outgoing request
// ============================================================

router.delete('/requests/:targetUserId', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const { targetUserId } = req.params;

  try {
    await prisma.$queryRaw`
      UPDATE follow_requests
      SET status = 'cancelled', cancelled_at = NOW()
      WHERE requester_user_id = ${currentUserId}
        AND target_user_id = ${targetUserId}
        AND status = 'pending'
    `;

    return res.status(204).send();
  } catch (err) {
    console.error('Error cancelling follow request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
