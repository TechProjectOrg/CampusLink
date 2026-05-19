import prisma from '../prisma';
import { createNotification } from './notifications';
import { disconnectUserSockets, emitToUser } from './realtime';

export const REPORT_REASONS = [
  'spam',
  'harassment_or_bullying',
  'hate_speech',
  'fake_account',
  'inappropriate_content',
  'violence_or_threats',
  'sexual_content',
  'scam_or_fraud',
  'impersonation',
  'misinformation',
  'self_harm_concern',
  'other',
] as const;

export const REPORT_TARGET_TYPES = ['post', 'comment', 'message', 'user', 'club'] as const;
export const REPORT_OPEN_STATUSES = ['pending', 'under_review'] as const;
export const REPORT_STATUS_VALUES = ['pending', 'under_review', 'resolved', 'dismissed'] as const;
export const MODERATION_ACTION_VALUES = [
  'warn',
  'suspend',
  'unsuspend',
  'ban',
  'unban',
  'delete_post',
  'delete_comment',
  'delete_message',
  'delete_media',
  'dismiss',
  'resolve',
] as const;
export const SUSPEND_PRESET_DAYS = [1, 3, 7, 14, 30] as const;
export const REPORTS_PER_HOUR_LIMIT = 10;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export type ReportStatus = (typeof REPORT_STATUS_VALUES)[number];
export type ModerationActionType = (typeof MODERATION_ACTION_VALUES)[number];

export interface ModerationState {
  isDeleted: boolean;
  deletedAt: string | null;
  isBanned: boolean;
  bannedAt: string | null;
  isSuspended: boolean;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  suspensionStartedAt: string | null;
  warningCount: number;
  lastWarningAt: string | null;
}

export class ModerationError extends Error {
  status: number;
  code: string;
  state?: ModerationState;

  constructor(message: string, status = 403, code = 'MODERATION_RESTRICTED', state?: ModerationState) {
    super(message);
    this.status = status;
    this.code = code;
    this.state = state;
  }
}

function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export async function getModerationState(userId: string): Promise<ModerationState> {
  const rows = await prisma.$queryRaw<Array<{
    is_deleted: boolean;
    deleted_at: Date | null;
    is_banned: boolean;
    banned_at: Date | null;
    suspended_until: Date | null;
    suspension_reason: string | null;
    suspension_started_at: Date | null;
    warning_count: number;
    last_warning_at: Date | null;
  }>>`
    SELECT
      is_deleted,
      deleted_at,
      is_banned,
      banned_at,
      suspended_until,
      suspension_reason,
      suspension_started_at,
      warning_count,
      last_warning_at
    FROM users
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  const suspendedUntilIso = dateToIso(row?.suspended_until);
  const isSuspended = Boolean(row?.suspended_until && row.suspended_until > new Date());

  return {
    isDeleted: Boolean(row?.is_deleted),
    deletedAt: dateToIso(row?.deleted_at),
    isBanned: Boolean(row?.is_banned),
    bannedAt: dateToIso(row?.banned_at),
    isSuspended,
    suspendedUntil: suspendedUntilIso,
    suspensionReason: row?.suspension_reason ?? null,
    suspensionStartedAt: dateToIso(row?.suspension_started_at),
    warningCount: Number(row?.warning_count ?? 0),
    lastWarningAt: dateToIso(row?.last_warning_at),
  };
}

export function assertCanLogin(state: ModerationState): void {
  if (state.isDeleted) {
    throw new ModerationError(
      'This account has been deleted and can no longer be accessed.',
      410,
      'ACCOUNT_DELETED',
      state,
    );
  }

  if (state.isBanned) {
    throw new ModerationError(
      'Your account has been permanently banned due to repeated violations.',
      403,
      'ACCOUNT_BANNED',
      state,
    );
  }
}

function assertCapabilityAllowed(state: ModerationState, capability: string): void {
  if (state.isBanned) {
    throw new ModerationError(
      'Your account has been permanently banned due to repeated violations.',
      403,
      'ACCOUNT_BANNED',
      state,
    );
  }

  if (state.isSuspended) {
    throw new ModerationError(
      `Your account is suspended${state.suspendedUntil ? ` until ${state.suspendedUntil}` : ''} due to policy violations.`,
      403,
      `${capability.toUpperCase()}_SUSPENDED`,
      state,
    );
  }
}

export function assertCanPost(state: ModerationState): void {
  assertCapabilityAllowed(state, 'post');
}

export function assertCanComment(state: ModerationState): void {
  assertCapabilityAllowed(state, 'comment');
}

export function assertCanMessage(state: ModerationState): void {
  assertCapabilityAllowed(state, 'message');
}

export function assertCanUpload(state: ModerationState): void {
  assertCapabilityAllowed(state, 'upload');
}

export function assertCanManageCommunities(state: ModerationState): void {
  assertCapabilityAllowed(state, 'community');
}

export function isValidReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.includes(value as ReportReason);
}

export function isValidReportTargetType(value: string): value is ReportTargetType {
  return REPORT_TARGET_TYPES.includes(value as ReportTargetType);
}

function deriveSeverityFromReason(reason: ReportReason): 'warning' | 'critical' {
  return reason === 'violence_or_threats' || reason === 'sexual_content' || reason === 'self_harm_concern'
    ? 'critical'
    : 'warning';
}

function prettifyReason(reason: ReportReason): string {
  return reason
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function loadRecentPublicActivitySummary(userId: string): Promise<Record<string, unknown>> {
  const [postRows, commentRows, messageRows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM posts
      WHERE author_user_id = ${userId}
        AND deleted_at IS NULL
        AND created_at >= NOW() - INTERVAL '30 day'
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM post_comments
      WHERE author_user_id = ${userId}
        AND created_at >= NOW() - INTERVAL '30 day'
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM messages
      WHERE sender_user_id = ${userId}
        AND deleted_at IS NULL
        AND created_at >= NOW() - INTERVAL '30 day'
    `,
  ]);

  return {
    last30Days: {
      posts: postRows[0]?.count ?? 0,
      comments: commentRows[0]?.count ?? 0,
      messages: messageRows[0]?.count ?? 0,
    },
  };
}

async function buildPostContextSnapshot(postId: string): Promise<{ targetUserId: string; snapshot: Record<string, unknown> }> {
  const rows = await prisma.$queryRaw<Array<{
    post_id: string;
    author_user_id: string;
    title: string | null;
    content_text: string | null;
    created_at: Date;
    club_id: string | null;
    club_name: string | null;
    author_username: string;
    author_display_name: string;
    author_profile_photo_url: string | null;
    media: unknown;
  }>>`
    SELECT
      p.post_id,
      p.author_user_id,
      p.title,
      p.content_text,
      p.created_at,
      p.club_id,
      c.name AS club_name,
      u.username AS author_username,
      u.display_name AS author_display_name,
      u.profile_photo_url AS author_profile_photo_url,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'postMediaId', pm.post_media_id,
              'mediaUrl', pm.media_url,
              'mediaType', pm.media_type,
              'sortOrder', pm.sort_order
            )
            ORDER BY pm.sort_order ASC, pm.post_media_id ASC
          )
          FROM post_media pm
          WHERE pm.post_id = p.post_id
        ),
        '[]'::jsonb
      ) AS media
    FROM posts p
    JOIN users u ON u.user_id = p.author_user_id
    LEFT JOIN clubs c ON c.club_id = p.club_id
    WHERE p.post_id::text = ${postId}
      AND p.deleted_at IS NULL
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    throw new ModerationError('Reported post was not found', 404, 'REPORT_TARGET_NOT_FOUND');
  }

  return {
    targetUserId: row.author_user_id,
    snapshot: {
      kind: 'post',
      postId: row.post_id,
      title: row.title,
      contentText: row.content_text,
      createdAt: row.created_at.toISOString(),
      media: row.media ?? [],
      author: {
        userId: row.author_user_id,
        username: row.author_username,
        displayName: row.author_display_name,
        avatarUrl: row.author_profile_photo_url,
      },
      club: row.club_id
        ? {
            id: row.club_id,
            name: row.club_name,
          }
        : null,
    },
  };
}

async function buildCommentContextSnapshot(commentId: string): Promise<{ targetUserId: string; canonicalTargetId: string; snapshot: Record<string, unknown> }> {
  const rows = await prisma.$queryRaw<Array<{
    comment_id: string;
    author_user_id: string;
    content: string;
    created_at: Date;
    post_id: string;
    post_title: string | null;
    post_content_text: string | null;
    parent_comment_id: string | null;
    author_username: string;
    author_display_name: string;
    author_profile_photo_url: string | null;
  }>>`
    SELECT
      c.comment_id,
      c.author_user_id,
      c.content,
      c.created_at,
      c.post_id,
      p.title AS post_title,
      p.content_text AS post_content_text,
      c.parent_comment_id,
      u.username AS author_username,
      u.display_name AS author_display_name,
      u.profile_photo_url AS author_profile_photo_url
    FROM post_comments c
    JOIN users u ON u.user_id = c.author_user_id
    JOIN posts p ON p.post_id = c.post_id
    WHERE c.comment_id::text = ${commentId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    throw new ModerationError('Reported comment was not found', 404, 'REPORT_TARGET_NOT_FOUND');
  }

  const chainRows = await prisma.$queryRaw<Array<{ comment_id: string; parent_comment_id: string | null; content: string; author_username: string }>>`
    WITH RECURSIVE chain AS (
      SELECT c.comment_id, c.parent_comment_id, c.content, u.username AS author_username
      FROM post_comments c
      JOIN users u ON u.user_id = c.author_user_id
      WHERE c.comment_id = ${row.comment_id}::uuid
      UNION ALL
      SELECT p.comment_id, p.parent_comment_id, p.content, u.username AS author_username
      FROM post_comments p
      JOIN users u ON u.user_id = p.author_user_id
      JOIN chain ch ON ch.parent_comment_id = p.comment_id
    )
    SELECT * FROM chain
  `;

  return {
    targetUserId: row.author_user_id,
    canonicalTargetId: row.comment_id,
    snapshot: {
      kind: 'comment',
      commentId: row.comment_id,
      content: row.content,
      createdAt: row.created_at.toISOString(),
      parentCommentId: row.parent_comment_id,
      post: {
        id: row.post_id,
        title: row.post_title,
        preview: row.post_content_text,
      },
      author: {
        userId: row.author_user_id,
        username: row.author_username,
        displayName: row.author_display_name,
        avatarUrl: row.author_profile_photo_url,
      },
      replyChain: chainRows.map((entry) => ({
        commentId: entry.comment_id,
        parentCommentId: entry.parent_comment_id,
        content: entry.content,
        authorUsername: entry.author_username,
      })),
    },
  };
}

async function buildMessageContextSnapshot(messageId: string, reporterUserId: string): Promise<{
  targetUserId: string;
  canonicalTargetId: string;
  conversationId: string;
  snapshot: Record<string, unknown>;
}> {
  const rows = await prisma.$queryRaw<Array<{
    message_id: string;
    chat_id: string;
    sender_user_id: string;
    content: string | null;
    message_type: string;
    created_at: Date;
    sender_username: string;
    sender_display_name: string;
    sender_profile_photo_url: string | null;
  }>>`
    SELECT
      m.message_id,
      m.chat_id,
      m.sender_user_id,
      m.content,
      m.message_type,
      m.created_at,
      u.username AS sender_username,
      u.display_name AS sender_display_name,
      u.profile_photo_url AS sender_profile_photo_url
    FROM messages m
    JOIN users u ON u.user_id = m.sender_user_id
    WHERE m.message_id::text = ${messageId}
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM chat_participants cp
        WHERE cp.chat_id = m.chat_id
          AND cp.user_id = ${reporterUserId}
          AND cp.left_at IS NULL
      )
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    throw new ModerationError('Reported message was not found', 404, 'REPORT_TARGET_NOT_FOUND');
  }

  const windowRows = await prisma.$queryRaw<Array<{
    message_id: string;
    sender_user_id: string;
    content: string | null;
    message_type: string;
    created_at: Date;
  }>>`
    SELECT
      m.message_id,
      m.sender_user_id,
      m.content,
      m.message_type,
      m.created_at
    FROM messages m
    WHERE m.chat_id = ${row.chat_id}::uuid
      AND m.deleted_at IS NULL
    ORDER BY ABS(EXTRACT(EPOCH FROM (m.created_at - ${row.created_at}::timestamp))) ASC, m.created_at DESC
    LIMIT 5
  `;

  return {
    targetUserId: row.sender_user_id,
    canonicalTargetId: row.message_id,
    conversationId: row.chat_id,
    snapshot: {
      kind: 'message',
      messageId: row.message_id,
      conversationId: row.chat_id,
      content: row.content,
      messageType: row.message_type,
      createdAt: row.created_at.toISOString(),
      sender: {
        userId: row.sender_user_id,
        username: row.sender_username,
        displayName: row.sender_display_name,
        avatarUrl: row.sender_profile_photo_url,
      },
      surroundingMessages: windowRows
        .sort((left, right) => left.created_at.getTime() - right.created_at.getTime())
        .map((entry) => ({
          messageId: entry.message_id,
          senderUserId: entry.sender_user_id,
          content: entry.content,
          messageType: entry.message_type,
          createdAt: entry.created_at.toISOString(),
        })),
    },
  };
}

async function buildUserContextSnapshot(targetUserId: string): Promise<{ targetUserId: string; snapshot: Record<string, unknown> }> {
  const rows = await prisma.$queryRaw<Array<{
    user_id: string;
    username: string;
    display_name: string;
    email: string;
    bio: string | null;
    headline: string | null;
    profile_photo_url: string | null;
    created_at: Date;
  }>>`
    SELECT user_id, username, display_name, email, bio, headline, profile_photo_url, created_at
    FROM users
    WHERE user_id = ${targetUserId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    throw new ModerationError('Reported user was not found', 404, 'REPORT_TARGET_NOT_FOUND');
  }

  return {
    targetUserId: row.user_id,
    snapshot: {
      kind: 'user',
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      bio: row.bio,
      headline: row.headline,
      avatarUrl: row.profile_photo_url,
      createdAt: row.created_at.toISOString(),
      recentActivity: await loadRecentPublicActivitySummary(row.user_id),
    },
  };
}

async function buildClubContextSnapshot(clubId: string): Promise<{ targetUserId: string | null; snapshot: Record<string, unknown> }> {
  const rows = await prisma.$queryRaw<Array<{
    club_id: string;
    name: string;
    slug: string;
    description: string | null;
    avatar_url: string | null;
    created_by_user_id: string;
  }>>`
    SELECT club_id, name, slug, description, avatar_url, created_by_user_id
    FROM clubs
    WHERE club_id::text = ${clubId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    throw new ModerationError('Reported club was not found', 404, 'REPORT_TARGET_NOT_FOUND');
  }

  return {
    targetUserId: row.created_by_user_id,
    snapshot: {
      kind: 'club',
      clubId: row.club_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      avatarUrl: row.avatar_url,
      createdByUserId: row.created_by_user_id,
    },
  };
}

export async function buildContextSnapshotForReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reporterUserId: string;
}): Promise<{
  targetUserId: string | null;
  canonicalTargetId: string;
  conversationId: string | null;
  snapshot: Record<string, unknown>;
}> {
  if (input.targetType === 'post') {
    const result = await buildPostContextSnapshot(input.targetId);
    return {
      targetUserId: result.targetUserId,
      canonicalTargetId: input.targetId,
      conversationId: null,
      snapshot: result.snapshot,
    };
  }
  if (input.targetType === 'comment') {
    const result = await buildCommentContextSnapshot(input.targetId);
    return {
      targetUserId: result.targetUserId,
      canonicalTargetId: result.canonicalTargetId,
      conversationId: null,
      snapshot: result.snapshot,
    };
  }
  if (input.targetType === 'message') {
    const result = await buildMessageContextSnapshot(input.targetId, input.reporterUserId);
    return {
      targetUserId: result.targetUserId,
      canonicalTargetId: result.canonicalTargetId,
      conversationId: result.conversationId,
      snapshot: result.snapshot,
    };
  }
  if (input.targetType === 'user') {
    const result = await buildUserContextSnapshot(input.targetId);
    return {
      targetUserId: result.targetUserId,
      canonicalTargetId: input.targetId,
      conversationId: null,
      snapshot: result.snapshot,
    };
  }

  const result = await buildClubContextSnapshot(input.targetId);
  return {
    targetUserId: result.targetUserId,
    canonicalTargetId: input.targetId,
    conversationId: null,
    snapshot: result.snapshot,
  };
}

export async function createReportCaseOrAttachSubmission(input: {
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string | null;
}): Promise<{ reportId: string; createdNewCase: boolean }> {
  const description = input.description?.trim() || null;
  if (description && description.length > 500) {
    throw new ModerationError('Report details must be 500 characters or fewer', 400, 'REPORT_DESCRIPTION_TOO_LONG');
  }

  const rateRows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM report_submissions
    WHERE reporter_user_id = ${input.reporterUserId}
      AND created_at >= NOW() - INTERVAL '1 hour'
  `;
  if ((rateRows[0]?.count ?? 0) >= REPORTS_PER_HOUR_LIMIT) {
    throw new ModerationError('You have reached the report limit for this hour. Please try again later.', 429, 'REPORT_RATE_LIMIT');
  }

  const context = await buildContextSnapshotForReport({
    targetType: input.targetType,
    targetId: input.targetId,
    reporterUserId: input.reporterUserId,
  });

  if (context.targetUserId && context.targetUserId === input.reporterUserId) {
    throw new ModerationError('You cannot report your own content or profile.', 400, 'REPORT_SELF_TARGET');
  }

  const duplicateRows = await prisma.$queryRaw<Array<{ report_submission_id: string }>>`
    SELECT s.report_submission_id
    FROM report_submissions s
    JOIN admin_reports r ON r.report_id = s.report_id
    WHERE s.reporter_user_id = ${input.reporterUserId}
      AND r.target_type = CAST(${input.targetType} AS "AdminReportTargetType")
      AND r.target_id = ${context.canonicalTargetId}
      AND COALESCE(r.conversation_id, '') = COALESCE(${context.conversationId}, '')
      AND r.status IN (CAST('pending' AS "AdminReportStatus"), CAST('under_review' AS "AdminReportStatus"))
    LIMIT 1
  `;
  if (duplicateRows[0]) {
    throw new ModerationError('You have already reported this item.', 409, 'REPORT_ALREADY_EXISTS');
  }

  const openCaseRows = await prisma.$queryRaw<Array<{ report_id: string }>>`
    SELECT report_id
    FROM admin_reports
    WHERE target_type = CAST(${input.targetType} AS "AdminReportTargetType")
      AND target_id = ${context.canonicalTargetId}
      AND COALESCE(conversation_id, '') = COALESCE(${context.conversationId}, '')
      AND status IN (CAST('pending' AS "AdminReportStatus"), CAST('under_review' AS "AdminReportStatus"))
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const reasonLabel = prettifyReason(input.reason);
  const severity = deriveSeverityFromReason(input.reason);
  const existingReportId = openCaseRows[0]?.report_id ?? null;

  if (existingReportId) {
    await prisma.$queryRaw`
      UPDATE admin_reports
      SET
        report_count = report_count + 1,
        last_reported_at = NOW(),
        updated_at = NOW(),
        reason = ${reasonLabel},
        evidence = COALESCE(${description}, evidence),
        context_snapshot = ${JSON.stringify(context.snapshot)}::jsonb,
        severity = CAST(${severity} AS "AdminSeverity")
      WHERE report_id = ${existingReportId}
    `;
    await prisma.$queryRaw`
      INSERT INTO report_submissions (report_id, reporter_user_id, reason, description)
      VALUES (${existingReportId}, ${input.reporterUserId}, ${reasonLabel}, ${description})
    `;
    return { reportId: existingReportId, createdNewCase: false };
  }

  const rows = await prisma.$queryRaw<Array<{ report_id: string }>>`
    INSERT INTO admin_reports (
      reporter_user_id,
      target_type,
      target_id,
      conversation_id,
      target_user_id,
      reason,
      evidence,
      severity,
      status,
      report_count,
      context_snapshot,
      last_reported_at
    )
    VALUES (
      ${input.reporterUserId},
      CAST(${input.targetType} AS "AdminReportTargetType"),
      ${context.canonicalTargetId},
      ${context.conversationId},
      ${context.targetUserId},
      ${reasonLabel},
      ${description},
      CAST(${severity} AS "AdminSeverity"),
      CAST('pending' AS "AdminReportStatus"),
      1,
      ${JSON.stringify(context.snapshot)}::jsonb,
      NOW()
    )
    RETURNING report_id
  `;
  const reportId = rows[0]?.report_id;

  await prisma.$queryRaw`
    INSERT INTO report_submissions (report_id, reporter_user_id, reason, description)
    VALUES (${reportId}, ${input.reporterUserId}, ${reasonLabel}, ${description})
  `;

  return { reportId, createdNewCase: true };
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.$queryRaw`
    UPDATE user_sessions
    SET revoked_at = NOW()
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
  `;
}

export async function disconnectUserRealtime(userId: string, reason: string, state: ModerationState): Promise<void> {
  emitToUser(userId, {
    type: 'moderation:updated',
    payload: { userId, state, reason },
  });
  emitToUser(userId, {
    type: 'auth:revoked',
    payload: { userId, reason },
  });
  disconnectUserSockets(userId, reason);
}

export async function emitModerationState(userId: string, state: ModerationState, reason?: string | null): Promise<void> {
  emitToUser(userId, {
    type: 'moderation:updated',
    payload: { userId, state, reason: reason ?? state.suspensionReason ?? null },
  });
}

async function insertModerationLog(input: {
  adminUserId: string;
  targetUserId: string;
  reportId?: string | null;
  actionType: ModerationActionType;
  reason: string;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.$queryRaw`
    INSERT INTO moderation_logs (
      admin_user_id,
      target_user_id,
      report_id,
      action_type,
      reason,
      duration_seconds,
      metadata
    )
    VALUES (
      ${input.adminUserId},
      ${input.targetUserId},
      ${input.reportId ?? null},
      CAST(${input.actionType} AS "ModerationActionType"),
      ${input.reason},
      ${input.durationSeconds ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;
}

async function sendModerationNotification(input: {
  targetUserId: string;
  actorUserId: string;
  type: 'moderation_warning' | 'moderation_suspension' | 'moderation_ban';
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  await createNotification({
    recipientUserId: input.targetUserId,
    actorUserId: input.actorUserId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
  });
}

export async function applyModerationAction(input: {
  adminUserId: string;
  targetUserId: string;
  reportId?: string | null;
  actionType: ModerationActionType;
  reason: string;
  durationDays?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<ModerationState> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new ModerationError('A moderation reason is required.', 400, 'MODERATION_REASON_REQUIRED');
  }

  if (input.actionType === 'warn') {
    await prisma.$queryRaw`
      UPDATE users
      SET warning_count = warning_count + 1, last_warning_at = NOW(), updated_at = NOW()
      WHERE user_id = ${input.targetUserId}
    `;
    await insertModerationLog({
      adminUserId: input.adminUserId,
      targetUserId: input.targetUserId,
      reportId: input.reportId,
      actionType: 'warn',
      reason,
      metadata: input.metadata,
    });
    await sendModerationNotification({
      targetUserId: input.targetUserId,
      actorUserId: input.adminUserId,
      type: 'moderation_warning',
      title: 'Account warning',
      message: reason,
      entityType: 'report',
      entityId: input.reportId ?? undefined,
    });
  } else if (input.actionType === 'suspend') {
    const durationDays = Math.max(1, Number(input.durationDays ?? 7));
    await prisma.$queryRawUnsafe(`
      UPDATE users
      SET
        is_banned = FALSE,
        banned_at = NULL,
        suspension_started_at = NOW(),
        suspended_until = NOW() + INTERVAL '${durationDays} day',
        suspension_reason = $1,
        updated_at = NOW()
      WHERE user_id = $2
    `, reason, input.targetUserId);
    await insertModerationLog({
      adminUserId: input.adminUserId,
      targetUserId: input.targetUserId,
      reportId: input.reportId,
      actionType: 'suspend',
      reason,
      durationSeconds: durationDays * 24 * 60 * 60,
      metadata: { ...(input.metadata ?? {}), durationDays },
    });
    await sendModerationNotification({
      targetUserId: input.targetUserId,
      actorUserId: input.adminUserId,
      type: 'moderation_suspension',
      title: 'Account suspended',
      message: `${reason} Suspension length: ${durationDays} day${durationDays === 1 ? '' : 's'}.`,
      entityType: 'report',
      entityId: input.reportId ?? undefined,
    });
  } else if (input.actionType === 'unsuspend') {
    await prisma.$queryRaw`
      UPDATE users
      SET
        suspended_until = NULL,
        suspension_reason = NULL,
        suspension_started_at = NULL,
        updated_at = NOW()
      WHERE user_id = ${input.targetUserId}
    `;
    await insertModerationLog({
      adminUserId: input.adminUserId,
      targetUserId: input.targetUserId,
      reportId: input.reportId,
      actionType: 'unsuspend',
      reason,
      metadata: input.metadata,
    });
  } else if (input.actionType === 'ban') {
    await prisma.$queryRaw`
      UPDATE users
      SET
        is_banned = TRUE,
        banned_at = NOW(),
        suspended_until = NULL,
        suspension_reason = ${reason},
        suspension_started_at = NULL,
        updated_at = NOW()
      WHERE user_id = ${input.targetUserId}
    `;
    await insertModerationLog({
      adminUserId: input.adminUserId,
      targetUserId: input.targetUserId,
      reportId: input.reportId,
      actionType: 'ban',
      reason,
      metadata: input.metadata,
    });
    await sendModerationNotification({
      targetUserId: input.targetUserId,
      actorUserId: input.adminUserId,
      type: 'moderation_ban',
      title: 'Account banned',
      message: reason,
      entityType: 'report',
      entityId: input.reportId ?? undefined,
    });
    await revokeUserSessions(input.targetUserId);
  } else {
    await insertModerationLog({
      adminUserId: input.adminUserId,
      targetUserId: input.targetUserId,
      reportId: input.reportId,
      actionType: input.actionType,
      reason,
      metadata: input.metadata,
    });
  }

  const nextState = await getModerationState(input.targetUserId);
  if (input.actionType === 'ban') {
    await disconnectUserRealtime(input.targetUserId, reason, nextState);
  } else {
    await emitModerationState(input.targetUserId, nextState, reason);
  }

  return nextState;
}
