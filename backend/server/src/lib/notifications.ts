import prisma from '../prisma';

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'follow_reject';

interface CreateNotificationParams {
  /** The user who will receive the notification. */
  recipientUserId: string;
  /** The user who triggered the action (optional). */
  actorUserId?: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Optional entity reference (e.g. follow_request_id). */
  entityType?: string;
  entityId?: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.$queryRaw`
      INSERT INTO notifications (
        user_id,
        actor_user_id,
        notification_type,
        title,
        message,
        entity_type,
        entity_id
      ) VALUES (
        ${params.recipientUserId},
        ${params.actorUserId ?? null},
        ${params.type},
        ${params.title},
        ${params.message},
        ${params.entityType ?? null},
        ${params.entityId ?? null}
      )
    `;
  } catch (err) {
    // Fire-and-forget: log but don't throw so the main action still succeeds.
    console.error('Failed to create notification:', err);
  }
}
