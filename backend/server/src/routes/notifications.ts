import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';

const router = express.Router();

router.use(authenticateToken);

// ============================================================
// GET /notifications?unread_only=true
// ============================================================

interface NotificationRow {
  notification_id: string;
  notification_type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: Date;
  actor_user_id: string | null;
  actor_username: string | null;
  actor_profile_photo_url: string | null;
}

router.get('/', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const unreadOnly = req.query.unread_only === 'true';

  try {
    let rows: NotificationRow[];

    if (unreadOnly) {
      rows = await prisma.$queryRaw<NotificationRow[]>`
        SELECT
          n.notification_id,
          n.notification_type,
          n.title,
          n.message,
          n.entity_type,
          n.entity_id,
          n.is_read,
          n.created_at,
          n.actor_user_id,
          actor.username AS actor_username,
          actor.profile_photo_url AS actor_profile_photo_url
        FROM notifications n
        LEFT JOIN users actor ON actor.user_id = n.actor_user_id
        WHERE n.user_id = ${userId} AND n.is_read = FALSE
        ORDER BY n.created_at DESC
        LIMIT 100
      `;
    } else {
      rows = await prisma.$queryRaw<NotificationRow[]>`
        SELECT
          n.notification_id,
          n.notification_type,
          n.title,
          n.message,
          n.entity_type,
          n.entity_id,
          n.is_read,
          n.created_at,
          n.actor_user_id,
          actor.username AS actor_username,
          actor.profile_photo_url AS actor_profile_photo_url
        FROM notifications n
        LEFT JOIN users actor ON actor.user_id = n.actor_user_id
        WHERE n.user_id = ${userId}
        ORDER BY n.created_at DESC
        LIMIT 100
      `;
    }

    return res.status(200).json(
      rows.map((r) => ({
        id: r.notification_id,
        type: r.notification_type,
        title: r.title,
        message: r.message,
        entityType: r.entity_type,
        entityId: r.entity_id,
        read: r.is_read,
        createdAt: r.created_at.toISOString(),
        actor: r.actor_user_id
          ? {
              userId: r.actor_user_id,
              username: r.actor_username,
              profilePictureUrl: r.actor_profile_photo_url,
            }
          : null,
      }))
    );
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// PATCH /notifications/:notificationId/read
// ============================================================

router.patch('/:notificationId/read', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const { notificationId } = req.params;

  try {
    const result = await prisma.$queryRaw<{ count: number }[]>`
      WITH updated AS (
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE notification_id = ${notificationId}
          AND user_id = ${userId}
          AND is_read = FALSE
        RETURNING 1
      )
      SELECT COUNT(*)::int AS count FROM updated
    `;

    if ((result[0]?.count ?? 0) === 0) {
      return res.status(404).json({ message: 'Notification not found or already read' });
    }

    return res.status(200).json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// PATCH /notifications/read-all
// ============================================================

router.patch('/read-all', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;

  try {
    await prisma.$queryRaw`
      UPDATE notifications
      SET is_read = TRUE, read_at = NOW()
      WHERE user_id = ${userId} AND is_read = FALSE
    `;

    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
