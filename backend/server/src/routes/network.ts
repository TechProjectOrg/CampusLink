import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { createNotification } from '../lib/notifications';

const router = express.Router();

router.use(authenticateToken);

// ---- helpers ----

interface MinimalUserRow {
  user_id: string;
  username: string;
  profile_photo_url: string | null;
  is_private: boolean;
  user_type: string;
  student_branch: string | null;
  student_year: number | null;
  alumni_branch: string | null;
  alumni_passing_year: number | null;
}

function mapMinimalUser(r: MinimalUserRow) {
  return {
    userId: r.user_id,
    username: r.username,
    profilePictureUrl: r.profile_photo_url,
    isPrivate: r.is_private,
    type: r.user_type,
    branch: r.student_branch ?? r.alumni_branch ?? null,
    year: r.student_year ?? r.alumni_passing_year ?? null,
  };
}

const minimalUserSelect = `
  u.user_id,
  u.username,
  u.profile_photo_url,
  u.is_private,
  u.user_type,
  sp.branch AS student_branch,
  sp.year   AS student_year,
  ap.branch AS alumni_branch,
  ap.passing_year AS alumni_passing_year
`;

const minimalUserJoins = `
  LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
  LEFT JOIN alumni_profiles  ap ON ap.user_id = u.user_id
`;

// ============================================================
// GET /network/graph — full follow state of current user
// ============================================================

router.get('/graph', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;

  try {
    // Followers (people who follow me)
    const followerRows = await prisma.$queryRaw<MinimalUserRow[]>`
      SELECT ${prisma.$queryRawUnsafe(minimalUserSelect)}
      FROM follows f
      JOIN users u ON u.user_id = f.follower_user_id
      ${prisma.$queryRawUnsafe(minimalUserJoins)}
      WHERE f.followed_user_id = ${userId}
      ORDER BY f.created_at DESC
    `;

    // Following (people I follow)
    const followingRows = await prisma.$queryRaw<MinimalUserRow[]>`
      SELECT ${prisma.$queryRawUnsafe(minimalUserSelect)}
      FROM follows f
      JOIN users u ON u.user_id = f.followed_user_id
      ${prisma.$queryRawUnsafe(minimalUserJoins)}
      WHERE f.follower_user_id = ${userId}
      ORDER BY f.created_at DESC
    `;

    // Incoming follow requests (pending)
    const incomingRows = await prisma.$queryRaw<(MinimalUserRow & { follow_request_id: string })[]>`
      SELECT fr.follow_request_id,
             ${prisma.$queryRawUnsafe(minimalUserSelect)}
      FROM follow_requests fr
      JOIN users u ON u.user_id = fr.requester_user_id
      ${prisma.$queryRawUnsafe(minimalUserJoins)}
      WHERE fr.target_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;

    // Outgoing follow requests (pending)
    const outgoingRows = await prisma.$queryRaw<(MinimalUserRow & { follow_request_id: string })[]>`
      SELECT fr.follow_request_id,
             ${prisma.$queryRawUnsafe(minimalUserSelect)}
      FROM follow_requests fr
      JOIN users u ON u.user_id = fr.target_user_id
      ${prisma.$queryRawUnsafe(minimalUserJoins)}
      WHERE fr.requester_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;

    return res.status(200).json({
      followers: followerRows.map(mapMinimalUser),
      following: followingRows.map(mapMinimalUser),
      incomingRequests: incomingRows.map((r) => ({
        requestId: r.follow_request_id,
        ...mapMinimalUser(r),
      })),
      outgoingRequests: outgoingRows.map((r) => ({
        requestId: r.follow_request_id,
        ...mapMinimalUser(r),
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
    const targetRows = await prisma.$queryRaw<{ user_id: string; is_private: boolean; username: string }[]>`
      SELECT user_id, is_private, username FROM users WHERE user_id = ${targetUserId}
    `;
    const target = targetRows[0];
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get current user's username for notifications
    const currentRows = await prisma.$queryRaw<{ username: string }[]>`
      SELECT username FROM users WHERE user_id = ${currentUserId}
    `;
    const currentUsername = currentRows[0]?.username ?? 'Someone';

    // Check already following
    const alreadyFollowing = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM follows
      WHERE follower_user_id = ${currentUserId} AND followed_user_id = ${targetUserId}
    `;
    if ((alreadyFollowing[0]?.count ?? 0) > 0) {
      return res.status(409).json({ message: 'Already following this user' });
    }

    if (target.is_private) {
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
    await prisma.$queryRaw`
      INSERT INTO follows (follower_user_id, followed_user_id)
      VALUES (${currentUserId}, ${targetUserId})
      ON CONFLICT DO NOTHING
    `;

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
  const { targetUserId } = req.params;

  try {
    // Delete from follows
    await prisma.$queryRaw`
      DELETE FROM follows
      WHERE follower_user_id = ${currentUserId} AND followed_user_id = ${targetUserId}
    `;

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
  const { followerUserId } = req.params;

  try {
    await prisma.$queryRaw`
      DELETE FROM follows
      WHERE follower_user_id = ${followerUserId} AND followed_user_id = ${currentUserId}
    `;

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
    const rows = await prisma.$queryRaw<(MinimalUserRow & { follow_request_id: string; created_at: Date })[]>`
      SELECT fr.follow_request_id, fr.created_at,
             ${prisma.$queryRawUnsafe(minimalUserSelect)}
      FROM follow_requests fr
      JOIN users u ON u.user_id = fr.requester_user_id
      ${prisma.$queryRawUnsafe(minimalUserJoins)}
      WHERE fr.target_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;

    return res.status(200).json(
      rows.map((r) => ({
        requestId: r.follow_request_id,
        createdAt: r.created_at.toISOString(),
        ...mapMinimalUser(r),
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
    const rows = await prisma.$queryRaw<(MinimalUserRow & { follow_request_id: string; created_at: Date })[]>`
      SELECT fr.follow_request_id, fr.created_at,
             ${prisma.$queryRawUnsafe(minimalUserSelect)}
      FROM follow_requests fr
      JOIN users u ON u.user_id = fr.target_user_id
      ${prisma.$queryRawUnsafe(minimalUserJoins)}
      WHERE fr.requester_user_id = ${userId}
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `;

    return res.status(200).json(
      rows.map((r) => ({
        requestId: r.follow_request_id,
        createdAt: r.created_at.toISOString(),
        ...mapMinimalUser(r),
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
  const requestId = req.params.requestId as string;

  try {
    // Verify the request exists, is pending, and targets the current user
    const requestRows = await prisma.$queryRaw<{ follow_request_id: string; requester_user_id: string; target_user_id: string }[]>`
      SELECT follow_request_id, requester_user_id, target_user_id
      FROM follow_requests
      WHERE follow_request_id = ${requestId}
        AND target_user_id = ${currentUserId}
        AND status = 'pending'
    `;

    const request = requestRows[0];
    if (!request) {
      return res.status(404).json({ message: 'Follow request not found or already handled' });
    }

    const requesterId = request.requester_user_id;

    // Get current user's username for notification
    const currentRows = await prisma.$queryRaw<{ username: string }[]>`
      SELECT username FROM users WHERE user_id = ${currentUserId}
    `;
    const currentUsername = currentRows[0]?.username ?? 'Someone';

    await prisma.$transaction(async (tx) => {
      // Update follow request status
      await tx.$queryRaw`
        UPDATE follow_requests
        SET status = 'accepted', responded_at = NOW()
        WHERE follow_request_id = ${requestId}
      `;

      // Create the follow relationship (requester now follows the target)
      await tx.$queryRaw`
        INSERT INTO follows (follower_user_id, followed_user_id)
        VALUES (${requesterId}, ${currentUserId})
        ON CONFLICT DO NOTHING
      `;
    });

    await createNotification({
      recipientUserId: requesterId,
      actorUserId: currentUserId,
      type: 'follow_accept',
      title: currentUsername,
      message: 'accepted your follow request',
      entityType: 'follow_request',
      entityId: requestId,
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
  const requestId = req.params.requestId as string;

  try {
    const result = await prisma.$queryRaw<{ count: number }[]>`
      WITH updated AS (
        UPDATE follow_requests
        SET status = 'rejected', responded_at = NOW()
        WHERE follow_request_id = ${requestId}
          AND target_user_id = ${currentUserId}
          AND status = 'pending'
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
