import prisma from '../prisma';

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'follow_reject'
  | 'like'
  | 'comment'
  | 'reply'
  | 'opportunity';

interface CreateNotificationParams {
  recipientUserId: string;
  actorUserId?: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
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

async function upsertGroupedLikeNotification(params: {
  recipientUserId: string;
  actorUserId: string;
  entityType: 'post' | 'comment';
  entityId: string;
  message: string;
}): Promise<void> {
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
    return;
  }

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
      ${params.actorUserId},
      'like',
      ${params.entityType === 'post' ? 'Likes on your post' : 'Likes on your comment'},
      ${params.message},
      ${params.entityType},
      ${params.entityId}
    )
  `;
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

    await prisma.$queryRaw`
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
      WHERE f.followed_user_id = ${params.authorUserId}
        AND f.follower_user_id <> ${params.authorUserId}
    `;
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
      entityType: 'post',
      entityId: params.postId,
    });
  } catch (err) {
    console.error('Failed to notify post comment:', err);
  }
}

export async function notifyCommentReply(params: {
  parentCommentId: string;
  actorUserId: string;
  postId: string;
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
      entityType: 'post',
      entityId: params.postId,
    });
  } catch (err) {
    console.error('Failed to notify comment reply:', err);
  }
}
