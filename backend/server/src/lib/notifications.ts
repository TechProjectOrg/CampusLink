import prisma from '../prisma';
import { emitNotificationEvent } from './realtime';
import { sendPushNotificationToUser } from './push';

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'follow_reject'
  | 'like'
  | 'comment'
  | 'reply'
  | 'opportunity'
  | 'message'
  | 'club';

interface CreateNotificationParams {
  recipientUserId: string;
  actorUserId?: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

interface NotificationRealtimeRow {
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
  user_id: string;
}

interface NotificationSettingsRow {
  follow_request_notifications: boolean | null;
  message_notifications: boolean | null;
  opportunity_alerts: boolean | null;
  club_update_notifications: boolean | null;
  weekly_digest_enabled: boolean | null;
}

interface NotificationPreferenceSnapshot {
  followRequests: boolean;
  newMessages: boolean;
  opportunityAlerts: boolean;
  clubUpdates: boolean;
  newPostAlerts: boolean;
}

async function loadRecipientNotificationPreferences(userId: string): Promise<NotificationPreferenceSnapshot> {
  const rows = await prisma.$queryRaw<NotificationSettingsRow[]>`
    SELECT
      follow_request_notifications,
      message_notifications,
      opportunity_alerts,
      club_update_notifications,
      weekly_digest_enabled
    FROM user_settings
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  return {
    followRequests: row?.follow_request_notifications ?? true,
    newMessages: row?.message_notifications ?? true,
    opportunityAlerts: row?.opportunity_alerts ?? true,
    clubUpdates: row?.club_update_notifications ?? true,
    newPostAlerts: row?.weekly_digest_enabled ?? false,
  };
}

async function isNotificationEnabled(recipientUserId: string, type: NotificationType): Promise<boolean> {
  const prefs = await loadRecipientNotificationPreferences(recipientUserId);

  if (type === 'follow' || type === 'follow_request' || type === 'follow_accept' || type === 'follow_reject') {
    return prefs.followRequests;
  }

  if (type === 'like' || type === 'comment' || type === 'reply') {
    return prefs.opportunityAlerts;
  }

  if (type === 'opportunity') {
    return prefs.newPostAlerts;
  }

  if (type === 'club') {
    return prefs.clubUpdates;
  }

  return true;
}

function buildGroupedLikeMessage(names: string[], total: number, target: 'post' | 'comment'): string {
  const safeNames = names.filter(Boolean);
  const first = safeNames[0] ?? 'Someone';
  const second = safeNames[1] ?? 'someone';
  const targetText = target === 'post' ? 'your post' : 'your comment';

  if (total <= 1) return `${first} liked ${targetText}`;
  if (total === 2) return `${first} and ${second} liked ${targetText}`;
  return `${first}, ${second} and ${Math.max(total - 2, 1)} others liked ${targetText}`;
}

async function loadNotificationRealtimeRow(notificationId: string): Promise<NotificationRealtimeRow | null> {
  const rows = await prisma.$queryRaw<NotificationRealtimeRow[]>`
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
      actor.profile_photo_url AS actor_profile_photo_url,
      n.user_id
    FROM notifications n
    LEFT JOIN users actor ON actor.user_id = n.actor_user_id
    WHERE n.notification_id = ${notificationId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function fanoutNotification(notificationId: string, mode: 'new' | 'update'): Promise<void> {
  try {
    const row = await loadNotificationRealtimeRow(notificationId);
    if (!row) return;

    const payload = {
      id: row.notification_id,
      type: row.notification_type,
      title: row.title,
      message: row.message,
      entityType: row.entity_type,
      entityId: row.entity_id,
      read: row.is_read,
      createdAt: row.created_at.toISOString(),
      actor: row.actor_user_id
        ? {
            userId: row.actor_user_id,
            username: row.actor_username,
            profilePictureUrl: row.actor_profile_photo_url,
          }
        : null,
    };

    emitNotificationEvent(row.user_id, {
      type: mode === 'new' ? 'notification:new' : 'notification:update',
      payload,
    });

    await sendPushNotificationToUser(row.user_id, {
      notificationId: row.notification_id,
      type: row.notification_type,
      title: row.title,
      message: row.message,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at.toISOString(),
    });
  } catch (err) {
    console.error('Failed to fanout notification:', err);
  }
}

async function upsertGroupedLikeNotification(params: {
  recipientUserId: string;
  actorUserId: string;
  entityType: 'post' | 'comment';
  entityId: string;
  message: string;
}): Promise<void> {
  const enabled = await isNotificationEnabled(params.recipientUserId, 'like');
  if (!enabled) {
    await prisma.$queryRaw`
      DELETE FROM notifications
      WHERE user_id = ${params.recipientUserId}
        AND notification_type = 'like'
        AND entity_type = ${params.entityType}
        AND entity_id = ${params.entityId}
    `;
    return;
  }

  const existingRows = await prisma.$queryRaw<{ notification_id: string }[]>`
    SELECT notification_id
    FROM notifications
    WHERE user_id = ${params.recipientUserId}
      AND notification_type = 'like'
      AND entity_type = ${params.entityType}
      AND entity_id = ${params.entityId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const existing = existingRows[0];
  if (existing) {
    await prisma.$queryRaw`
      UPDATE notifications
      SET
        actor_user_id = ${params.actorUserId},
        title = ${params.entityType === 'post' ? 'Likes on your post' : 'Likes on your comment'},
        message = ${params.message},
        is_read = FALSE,
        read_at = NULL,
        created_at = NOW()
      WHERE notification_id = ${existing.notification_id}
    `;

    await fanoutNotification(existing.notification_id, 'update');
    return;
  }

  const inserted = await prisma.$queryRaw<{ notification_id: string }[]>`
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
      ${params.actorUserId},
      'like',
      ${params.entityType === 'post' ? 'Likes on your post' : 'Likes on your comment'},
      ${params.message},
      ${params.entityType},
      ${params.entityId}
    )
    RETURNING notification_id
  `;

  const notificationId = inserted[0]?.notification_id;
  if (notificationId) {
    await fanoutNotification(notificationId, 'new');
  }
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    if (!(await isNotificationEnabled(params.recipientUserId, params.type))) {
      return;
    }

    const rows = await prisma.$queryRaw<{ notification_id: string }[]>`
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
      RETURNING notification_id
    `;

    const notificationId = rows[0]?.notification_id;
    if (notificationId) {
      await fanoutNotification(notificationId, 'new');
    }
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function createPostPublishedNotifications(params: {
  authorUserId: string;
  postId: string;
  postTitle?: string | null;
}): Promise<void> {
  try {
    const actorRows = await prisma.$queryRaw<{ username: string }[]>`
      SELECT username
      FROM users
      WHERE user_id = ${params.authorUserId}
      LIMIT 1
    `;
    const actorName = actorRows[0]?.username ?? 'Someone';
    const title = actorName;
    const message = params.postTitle?.trim()
      ? `posted: ${params.postTitle.trim()}`
      : 'posted a new update';

    const inserted = await prisma.$queryRaw<{ notification_id: string }[]>`
      INSERT INTO notifications (
        user_id,
        actor_user_id,
        notification_type,
        title,
        message,
        entity_type,
        entity_id
      )
      SELECT
        f.follower_user_id,
        ${params.authorUserId},
        'opportunity',
        ${title},
        ${message},
        'post',
        ${params.postId}
      FROM follows f
      LEFT JOIN user_settings us ON us.user_id = f.follower_user_id
      WHERE f.followed_user_id = ${params.authorUserId}
        AND f.follower_user_id <> ${params.authorUserId}
        AND COALESCE(us.weekly_digest_enabled, FALSE) = TRUE
      RETURNING notification_id
    `;

    await Promise.allSettled(
      inserted
        .map((row) => row.notification_id)
        .filter(Boolean)
        .map(async (notificationId) => {
          await fanoutNotification(notificationId, 'new');
        }),
    );
  } catch (err) {
    console.error('Failed to create post publication notifications:', err);
  }
}

export async function syncPostLikeNotification(params: {
  postId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const targetRows = await prisma.$queryRaw<{ recipient_user_id: string }[]>`
      SELECT author_user_id AS recipient_user_id
      FROM posts
      WHERE post_id = ${params.postId}
      LIMIT 1
    `;

    const recipientUserId = targetRows[0]?.recipient_user_id;
    if (!recipientUserId || recipientUserId === params.actorUserId) return;

    const totalRows = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM post_likes
      WHERE post_id = ${params.postId}
    `;
    const total = totalRows[0]?.total ?? 0;

    if (total <= 0) {
      await prisma.$queryRaw`
        DELETE FROM notifications
        WHERE user_id = ${recipientUserId}
          AND notification_type = 'like'
          AND entity_type = 'post'
          AND entity_id = ${params.postId}
      `;
      return;
    }

    const likerRows = await prisma.$queryRaw<{ username: string }[]>`
      SELECT u.username
      FROM post_likes pl
      JOIN users u ON u.user_id = pl.user_id
      WHERE pl.post_id = ${params.postId}
      ORDER BY pl.created_at DESC
      LIMIT 2
    `;

    const message = buildGroupedLikeMessage(likerRows.map((row) => row.username), total, 'post');

    await upsertGroupedLikeNotification({
      recipientUserId,
      actorUserId: params.actorUserId,
      entityType: 'post',
      entityId: params.postId,
      message,
    });
  } catch (err) {
    console.error('Failed to sync post-like notification:', err);
  }
}

export async function syncCommentLikeNotification(params: {
  commentId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const targetRows = await prisma.$queryRaw<{ recipient_user_id: string }[]>`
      SELECT author_user_id AS recipient_user_id
      FROM post_comments
      WHERE comment_id = ${params.commentId}
      LIMIT 1
    `;

    const recipientUserId = targetRows[0]?.recipient_user_id;
    if (!recipientUserId || recipientUserId === params.actorUserId) return;

    const totalRows = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM post_comment_likes
      WHERE comment_id = ${params.commentId}
    `;
    const total = totalRows[0]?.total ?? 0;

    if (total <= 0) {
      await prisma.$queryRaw`
        DELETE FROM notifications
        WHERE user_id = ${recipientUserId}
          AND notification_type = 'like'
          AND entity_type = 'comment'
          AND entity_id = ${params.commentId}
      `;
      return;
    }

    const likerRows = await prisma.$queryRaw<{ username: string }[]>`
      SELECT u.username
      FROM post_comment_likes pcl
      JOIN users u ON u.user_id = pcl.user_id
      WHERE pcl.comment_id = ${params.commentId}
      ORDER BY pcl.created_at DESC
      LIMIT 2
    `;

    const message = buildGroupedLikeMessage(likerRows.map((row) => row.username), total, 'comment');

    await upsertGroupedLikeNotification({
      recipientUserId,
      actorUserId: params.actorUserId,
      entityType: 'comment',
      entityId: params.commentId,
      message,
    });
  } catch (err) {
    console.error('Failed to sync comment-like notification:', err);
  }
}

export async function notifyPostComment(params: {
  postId: string;
  commentId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<{ recipient_user_id: string; actor_username: string }[]>`
      SELECT
        p.author_user_id AS recipient_user_id,
        actor.username AS actor_username
      FROM posts p
      JOIN users actor ON actor.user_id = ${params.actorUserId}
      WHERE p.post_id = ${params.postId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row || row.recipient_user_id === params.actorUserId) return;

    await createNotification({
      recipientUserId: row.recipient_user_id,
      actorUserId: params.actorUserId,
      type: 'comment',
      title: row.actor_username,
      message: 'commented on your post',
      entityType: 'comment',
      entityId: params.commentId,
    });
  } catch (err) {
    console.error('Failed to notify post comment:', err);
  }
}

export async function notifyCommentReply(params: {
  parentCommentId: string;
  replyCommentId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<{ recipient_user_id: string; actor_username: string }[]>`
      SELECT
        c.author_user_id AS recipient_user_id,
        actor.username AS actor_username
      FROM post_comments c
      JOIN users actor ON actor.user_id = ${params.actorUserId}
      WHERE c.comment_id = ${params.parentCommentId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row || row.recipient_user_id === params.actorUserId) return;

    await createNotification({
      recipientUserId: row.recipient_user_id,
      actorUserId: params.actorUserId,
      type: 'reply',
      title: row.actor_username,
      message: 'replied to your comment',
      entityType: 'comment',
      entityId: params.replyCommentId,
    });
  } catch (err) {
    console.error('Failed to notify comment reply:', err);
  }
}

export async function notifyClubPostPublished(params: {
  clubId: string;
  postId: string;
  actorUserId: string;
  postTitle?: string | null;
}): Promise<void> {
  try {
    const actorRows = await prisma.$queryRaw<Array<{ username: string }>>`
      SELECT username
      FROM users
      WHERE user_id = ${params.actorUserId}
      LIMIT 1
    `;
    const clubRows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name
      FROM clubs
      WHERE club_id = ${params.clubId}
      LIMIT 1
    `;

    const actorName = actorRows[0]?.username ?? 'Someone';
    const clubName = clubRows[0]?.name ?? 'a club';
    const message = params.postTitle?.trim()
      ? `${actorName} posted in ${clubName}: ${params.postTitle.trim()}`
      : `${actorName} posted in ${clubName}`;

    const inserted = await prisma.$queryRaw<Array<{ notification_id: string }>>`
      INSERT INTO notifications (
        user_id,
        actor_user_id,
        notification_type,
        title,
        message,
        entity_type,
        entity_id
      )
      SELECT
        cm.user_id,
        ${params.actorUserId},
        'club',
        ${clubName},
        ${message},
        'post',
        ${params.postId}
      FROM club_memberships cm
      LEFT JOIN user_settings us ON us.user_id = cm.user_id
      WHERE cm.club_id = ${params.clubId}
        AND cm.status = CAST('active' AS "ClubMembershipStatus")
        AND cm.user_id <> ${params.actorUserId}
        AND COALESCE(us.club_update_notifications, TRUE) = TRUE
      RETURNING notification_id
    `;

    await Promise.allSettled(
      inserted.map((row) => fanoutNotification(row.notification_id, 'new')),
    );
  } catch (err) {
    console.error('Failed to notify club post publication:', err);
  }
}
