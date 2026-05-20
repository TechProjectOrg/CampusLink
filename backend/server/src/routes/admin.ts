import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import authenticateToken from '../middleware/authenticateToken';
import requireAdmin, { type AdminAuthedRequest } from '../middleware/requireAdmin';
import { hashPassword, signAuthToken, signVerificationActionToken, verifyPassword } from '../lib/auth';
import { probeRedisHealth } from '../lib/cache';
import {
  invalidateRecentComments,
  invalidateUserFeedCache,
  getPostFeedRecipientIds,
  reconcilePostEngagement,
} from '../lib/feedCache';
import { socketsByUserId } from '../lib/realtime';
import {
  getAdminAccountByUserId,
  markAdminLogin,
  recordAdminAuditLog,
} from '../lib/admin';
import { invalidateUserCache } from '../lib/userCache';
import {
  invalidateClubFeedCaches,
  invalidateClubMembershipCache,
  invalidateClubMetaCache,
  invalidateClubStatsCache,
  purgeClubCaches,
} from '../lib/clubCache';
import { deleteManagedClubMediaByUrl } from '../lib/objectStorage';
import { getTrendingHashtagsForApi } from '../lib/socialInsights';
import { sendModerationBanEmail, sendVerificationDecisionEmail } from '../lib/authEmail';
import { applyModerationAction } from '../lib/moderation';
import { createNotification } from '../lib/notifications';

const router = express.Router();

function getClientBaseUrl(): string {
  return (
    process.env.AUTH_CLIENT_URL?.trim()
    || process.env.FRONTEND_URL?.trim()
    || process.env.APP_BASE_URL?.trim()
    || 'http://localhost:5173'
  ).replace(/\/+$/, '');
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  return req.ip || null;
}

function detectBrowser(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser';
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return 'Opera';
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent) && !/opr\//i.test(userAgent)) return 'Chrome';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return 'Safari';
  return 'Unknown browser';
}

function detectPlatform(userAgent: string | null): string {
  if (!userAgent) return 'Unknown platform';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad|ios/i.test(userAgent)) return 'iOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown platform';
}

async function createAuthSession(userId: string, req: Request): Promise<string> {
  const sessionId = crypto.randomUUID();
  const userAgent = req.get('user-agent') ?? null;
  const browserName = detectBrowser(userAgent);
  const platform = detectPlatform(userAgent);
  const deviceName = platform === 'Android' || platform === 'iOS' ? 'Mobile device' : 'Desktop';
  const ipAddress = getClientIp(req);

  await prisma.$queryRaw`
    INSERT INTO user_sessions (
      session_id,
      user_id,
      user_agent,
      browser_name,
      platform,
      device_name,
      location_label,
      ip_address,
      last_seen_at
    )
    VALUES (
      ${sessionId},
      ${userId},
      ${userAgent},
      ${browserName},
      ${platform},
      ${deviceName},
      ${ipAddress ? `IP ${ipAddress}` : 'Unknown location'},
      ${ipAddress},
      NOW()
    )
  `;

  return sessionId;
}

type DashboardRange = '7d' | '30d' | '90d';
type DashboardTrendDirection = 'up' | 'down' | 'flat';
type AdminAnalyticsSegment = 'all' | 'students' | 'alumni';

const DASHBOARD_RANGE_DAYS: Record<DashboardRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function parseDashboardRange(raw: unknown): DashboardRange | null {
  if (raw == null || raw === '') return '7d';
  if (raw === '7d' || raw === '30d' || raw === '90d') return raw;
  return null;
}

function parseAdminAnalyticsSegment(raw: unknown): AdminAnalyticsSegment {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'students') return 'students';
  if (value === 'alumni') return 'alumni';
  return 'all';
}

type AdminAnnouncementAudienceType = 'all_users' | 'specific_clubs' | 'specific_branches';
type AdminAnnouncementLifecycleAction = 'publish_now' | 'unpublish' | 'cancel_schedule';

function parseAnnouncementAudienceType(raw: unknown): AdminAnnouncementAudienceType | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'all_users' || value === 'specific_clubs' || value === 'specific_branches') {
    return value as AdminAnnouncementAudienceType;
  }
  return null;
}

function parseAnnouncementLifecycleAction(raw: unknown): AdminAnnouncementLifecycleAction | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'publish_now' || value === 'unpublish' || value === 'cancel_schedule') {
    return value as AdminAnnouncementLifecycleAction;
  }
  return null;
}

function normalizeAnnouncementAudienceIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
}

async function getAnnouncementRecipientCount(audienceType: AdminAnnouncementAudienceType, audienceIds: string[]): Promise<number> {
  if (audienceType === 'all_users') {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM users`;
    return rows[0]?.count ?? 0;
  }

  if (audienceIds.length === 0) return 0;

  if (audienceType === 'specific_clubs') {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT cm.user_id)::int AS count
      FROM club_memberships cm
      WHERE cm.club_id::text IN (${Prisma.join(audienceIds)})
        AND cm.status = CAST('active' AS "ClubMembershipStatus")
    `;
    return rows[0]?.count ?? 0;
  }

  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
    LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
    WHERE COALESCE(sp.branch, ap.branch, 'Unknown') IN (${Prisma.join(audienceIds)})
  `;
  return rows[0]?.count ?? 0;
}

function getSqlWindowExpressions(dayCount: number) {
  return {
    currentStart: `CURRENT_DATE - INTERVAL '${dayCount - 1} day'`,
    previousStart: `CURRENT_DATE - INTERVAL '${dayCount * 2 - 1} day'`,
    todayEnd: `CURRENT_DATE + INTERVAL '1 day'`,
  };
}

function buildTrend(currentValue: number, previousValue: number): {
  trendValue: number;
  trendDirection: DashboardTrendDirection;
  trendLabel: string;
} {
  if (currentValue === previousValue) {
    return { trendValue: 0, trendDirection: 'flat', trendLabel: '0%' };
  }

  if (previousValue === 0) {
    return {
      trendValue: currentValue > 0 ? 100 : 0,
      trendDirection: currentValue > 0 ? 'up' : 'flat',
      trendLabel: currentValue > 0 ? '+100%' : '0%',
    };
  }

  const rawPercent = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  const rounded = Math.round(rawPercent * 10) / 10;
  return {
    trendValue: rounded,
    trendDirection: rounded > 0 ? 'up' : 'down',
    trendLabel: `${rounded > 0 ? '+' : ''}${rounded}%`,
  };
}

function getOpenWebSocketCount(): number {
  let count = 0;
  for (const sockets of socketsByUserId.values()) {
    count += sockets.size;
  }
  return count;
}

const ADMIN_USER_SORT_COLUMNS = {
  lastActive: 'COALESCE(u.last_seen_at, u.created_at)',
  followers: 'follower_count',
  posts: 'post_count',
  reports: 'reports_count',
  createdAt: 'u.created_at',
} as const;

type AdminUserSortKey = keyof typeof ADMIN_USER_SORT_COLUMNS;
type AdminUserSortOrder = 'asc' | 'desc';
type AdminUserStatusFilter = 'active' | 'suspended' | 'banned';
type AdminReportStatusFilter = 'pending' | 'under_review' | 'resolved' | 'dismissed';
type AdminReportTargetTypeFilter = 'user' | 'post' | 'comment' | 'message' | 'club';
type AdminReportAssigneeFilter = 'all' | 'me' | 'unassigned';
type AdminAuditLogSeverityFilter = 'info' | 'warning' | 'critical';

type AdminSettingsPayload = {
  moderation: {
    autoEscalateCriticalReports: boolean;
    retainSoftDeletedContentDays: number;
  };
  feedRanking: {
    allowManualIntervention: boolean;
  };
  uploads: {
    maxImageMb: number;
  };
  notifications: {
    sendOperationalAlerts: boolean;
  };
  security: {
    forcePasswordChangeForSeededAdmin: boolean;
  };
  rateLimiting: {
    adminApiBurst: number;
  };
  featureFlags: {
    auditLogExport: boolean;
    moderatorRoles: boolean;
  };
};

const ADMIN_SETTINGS_SINGLETON_KEY = 'global';

function parseAdminBooleanFilter(raw: unknown): '' | 'true' | 'false' {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'true' || value === 'false' ? value : '';
}

function parseAdminUserStatusFilter(raw: unknown): AdminUserStatusFilter | '' {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'active' || value === 'suspended' || value === 'banned' ? value : '';
}

function parseAdminUserSortKey(raw: unknown): AdminUserSortKey {
  const value = String(raw ?? '').trim();
  return value in ADMIN_USER_SORT_COLUMNS ? (value as AdminUserSortKey) : 'lastActive';
}

function parseAdminSortOrder(raw: unknown): AdminUserSortOrder {
  return String(raw ?? '').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
}

function parsePositiveInt(raw: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseAdminSeverityFilter(raw: unknown): '' | 'warning' | 'critical' {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'warning' || value === 'critical' ? value : '';
}

function parseAdminAuditLogSeverityFilter(raw: unknown): AdminAuditLogSeverityFilter | '' {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'info' || value === 'warning' || value === 'critical'
    ? value as AdminAuditLogSeverityFilter
    : '';
}

function parseAdminReportStatusFilter(raw: unknown): AdminReportStatusFilter | '' {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'pending' || value === 'under_review' || value === 'resolved' || value === 'dismissed'
    ? value as AdminReportStatusFilter
    : '';
}

function parseAdminReportTargetTypeFilter(raw: unknown): AdminReportTargetTypeFilter | '' {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'user' || value === 'post' || value === 'comment' || value === 'message' || value === 'club'
    ? value as AdminReportTargetTypeFilter
    : '';
}

function parseAdminReportAssigneeFilter(raw: unknown): AdminReportAssigneeFilter {
  const value = String(raw ?? '').trim().toLowerCase();
  return value === 'me' || value === 'unassigned' ? value : 'all';
}

function parseAdminDateFilter(raw: unknown, endOfDay = false): Date | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDefaultAdminSettings(): AdminSettingsPayload {
  return {
    moderation: {
      autoEscalateCriticalReports: true,
      retainSoftDeletedContentDays: 30,
    },
    feedRanking: {
      allowManualIntervention: false,
    },
    uploads: {
      maxImageMb: 10,
    },
    notifications: {
      sendOperationalAlerts: true,
    },
    security: {
      forcePasswordChangeForSeededAdmin: true,
    },
    rateLimiting: {
      adminApiBurst: 60,
    },
    featureFlags: {
      auditLogExport: false,
      moderatorRoles: false,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getBooleanSetting(
  group: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = group[key];
  return typeof value === 'boolean' ? value : null;
}

function getPositiveNumberSetting(
  group: Record<string, unknown>,
  key: string,
): number | null {
  const value = group[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function validateAdminSettingsPayload(raw: unknown): { value: AdminSettingsPayload | null; message?: string } {
  const defaults = getDefaultAdminSettings();
  if (!isRecord(raw)) {
    return { value: null, message: 'Settings payload must be an object' };
  }

  const expectedGroups = Object.keys(defaults);
  const incomingGroups = Object.keys(raw);
  if (incomingGroups.length !== expectedGroups.length || incomingGroups.some((key) => !expectedGroups.includes(key))) {
    return { value: null, message: 'Settings payload includes unsupported groups' };
  }

  const moderation = raw.moderation;
  const feedRanking = raw.feedRanking;
  const uploads = raw.uploads;
  const notifications = raw.notifications;
  const security = raw.security;
  const rateLimiting = raw.rateLimiting;
  const featureFlags = raw.featureFlags;

  if (!isRecord(moderation) || !isRecord(feedRanking) || !isRecord(uploads) || !isRecord(notifications) || !isRecord(security) || !isRecord(rateLimiting) || !isRecord(featureFlags)) {
    return { value: null, message: 'Settings groups must be objects' };
  }

  const hasOnlyKeys = (group: Record<string, unknown>, keys: string[]) =>
    Object.keys(group).length === keys.length && Object.keys(group).every((key) => keys.includes(key));

  if (
    !hasOnlyKeys(moderation, Object.keys(defaults.moderation)) ||
    !hasOnlyKeys(feedRanking, Object.keys(defaults.feedRanking)) ||
    !hasOnlyKeys(uploads, Object.keys(defaults.uploads)) ||
    !hasOnlyKeys(notifications, Object.keys(defaults.notifications)) ||
    !hasOnlyKeys(security, Object.keys(defaults.security)) ||
    !hasOnlyKeys(rateLimiting, Object.keys(defaults.rateLimiting)) ||
    !hasOnlyKeys(featureFlags, Object.keys(defaults.featureFlags))
  ) {
    return { value: null, message: 'Settings payload includes unsupported keys' };
  }

  const normalized: AdminSettingsPayload = {
    moderation: {
      autoEscalateCriticalReports: getBooleanSetting(moderation, 'autoEscalateCriticalReports') ?? defaults.moderation.autoEscalateCriticalReports,
      retainSoftDeletedContentDays: getPositiveNumberSetting(moderation, 'retainSoftDeletedContentDays') ?? -1,
    },
    feedRanking: {
      allowManualIntervention: getBooleanSetting(feedRanking, 'allowManualIntervention') ?? defaults.feedRanking.allowManualIntervention,
    },
    uploads: {
      maxImageMb: getPositiveNumberSetting(uploads, 'maxImageMb') ?? -1,
    },
    notifications: {
      sendOperationalAlerts: getBooleanSetting(notifications, 'sendOperationalAlerts') ?? defaults.notifications.sendOperationalAlerts,
    },
    security: {
      forcePasswordChangeForSeededAdmin: getBooleanSetting(security, 'forcePasswordChangeForSeededAdmin') ?? defaults.security.forcePasswordChangeForSeededAdmin,
    },
    rateLimiting: {
      adminApiBurst: getPositiveNumberSetting(rateLimiting, 'adminApiBurst') ?? -1,
    },
    featureFlags: {
      auditLogExport: getBooleanSetting(featureFlags, 'auditLogExport') ?? defaults.featureFlags.auditLogExport,
      moderatorRoles: getBooleanSetting(featureFlags, 'moderatorRoles') ?? defaults.featureFlags.moderatorRoles,
    },
  };

  if (
    typeof moderation.autoEscalateCriticalReports !== 'boolean' ||
    typeof feedRanking.allowManualIntervention !== 'boolean' ||
    typeof notifications.sendOperationalAlerts !== 'boolean' ||
    typeof security.forcePasswordChangeForSeededAdmin !== 'boolean' ||
    typeof featureFlags.auditLogExport !== 'boolean' ||
    typeof featureFlags.moderatorRoles !== 'boolean'
  ) {
    return { value: null, message: 'Boolean settings must stay boolean' };
  }

  if (
    normalized.moderation.retainSoftDeletedContentDays <= 0 ||
    normalized.uploads.maxImageMb <= 0 ||
    normalized.rateLimiting.adminApiBurst <= 0
  ) {
    return { value: null, message: 'Numeric settings must be positive numbers' };
  }

  return { value: normalized };
}

function flattenAdminSettingsChanges(previous: AdminSettingsPayload, next: AdminSettingsPayload): string[] {
  const changedKeys: string[] = [];
  for (const [groupKey, groupValue] of Object.entries(next)) {
    const previousGroup = previous[groupKey as keyof AdminSettingsPayload] as Record<string, unknown>;
    for (const [settingKey, settingValue] of Object.entries(groupValue)) {
      if (previousGroup[settingKey] !== settingValue) {
        changedKeys.push(`${groupKey}.${settingKey}`);
      }
    }
  }
  return changedKeys;
}

async function ensureAdminSettingsRecord(): Promise<AdminSettingsPayload> {
  type AdminSettingsRow = { settings: unknown };
  let existingRows: AdminSettingsRow[];
  try {
    existingRows = await prisma.$queryRaw<AdminSettingsRow[]>`
      SELECT settings
      FROM admin_settings
      WHERE settings_key = ${ADMIN_SETTINGS_SINGLETON_KEY}
      LIMIT 1
    `;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2010'
      && String(error.meta?.message ?? '').includes('relation "admin_settings" does not exist')
    ) {
      return getDefaultAdminSettings();
    }
    throw error;
  }

  const existing = existingRows[0]?.settings;
  const validatedExisting = validateAdminSettingsPayload(existing);
  if (validatedExisting.value) {
    return validatedExisting.value;
  }

  const defaults = getDefaultAdminSettings();
  await prisma.$queryRaw`
    INSERT INTO admin_settings (settings_key, settings)
    VALUES (${ADMIN_SETTINGS_SINGLETON_KEY}, ${JSON.stringify(defaults)}::jsonb)
    ON CONFLICT (settings_key)
    DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()
  `;
  return defaults;
}

async function invalidateAdminClubCaches(clubId: string, memberUserIds: string[] = []): Promise<void> {
  await Promise.allSettled([
    invalidateClubMetaCache(clubId),
    invalidateClubStatsCache(clubId),
    ...memberUserIds.map((userId) => invalidateClubMembershipCache(clubId, userId)),
  ]);
}

async function invalidateAdminPostCaches(postId: string, clubId: string | null): Promise<void> {
  const recipientUserIds = await getPostFeedRecipientIds(postId);
  await Promise.allSettled([
    ...recipientUserIds.map((userId) => invalidateUserFeedCache(userId)),
    ...(clubId ? [invalidateClubFeedCaches(clubId)] : []),
  ]);
}

type AdminCommentTreeNode = {
  id: string;
  postId: string;
  authorUserId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  parentCommentId: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  replies: AdminCommentTreeNode[];
};

function mapAdminCommentRows(rows: Array<{
  comment_id: string;
  post_id: string;
  author_user_id: string;
  author_username: string;
  author_profile_photo_url: string | null;
  parent_comment_id: string | null;
  content: string;
  like_count: number;
  reply_count: number;
  created_at: Date;
  updated_at: Date;
}>): AdminCommentTreeNode[] {
  const byId = new Map<string, AdminCommentTreeNode>();
  const roots: AdminCommentTreeNode[] = [];

  for (const row of rows) {
    byId.set(row.comment_id, {
      id: row.comment_id,
      postId: row.post_id,
      authorUserId: row.author_user_id,
      authorUsername: row.author_username,
      authorAvatarUrl: row.author_profile_photo_url,
      parentCommentId: row.parent_comment_id,
      content: row.content,
      likeCount: row.like_count,
      replyCount: row.reply_count,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      replies: [],
    });
  }

  for (const comment of byId.values()) {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId)!.replies.push(comment);
    } else {
      roots.push(comment);
    }
  }

  return roots;
}

function mapAdminFlatCommentRows(rows: Array<{
  comment_id: string;
  post_id: string;
  author_user_id: string;
  author_username: string;
  author_profile_photo_url: string | null;
  parent_comment_id: string | null;
  content: string;
  like_count: number;
  reply_count: number;
  created_at: Date;
  updated_at: Date;
}>): AdminCommentTreeNode[] {
  return rows.map((row) => ({
    id: row.comment_id,
    postId: row.post_id,
    authorUserId: row.author_user_id,
    authorUsername: row.author_username,
    authorAvatarUrl: row.author_profile_photo_url,
    parentCommentId: row.parent_comment_id,
    content: row.content,
    likeCount: row.like_count,
    replyCount: row.reply_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    replies: [],
  }));
}

function parseAdminCommentCursor(raw: unknown): Date | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ message: 'Missing email or password' });
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        user_id: string;
        email: string;
        username: string;
        password_hash: string;
        user_type: 'student' | 'alumni';
      }>
    >`
      SELECT u.user_id, u.email, u.username, u.password_hash, u.user_type
      FROM admin_accounts aa
      JOIN users u ON u.user_id = aa.user_id
      WHERE u.email = ${email}
      LIMIT 1
    `;

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.password_hash.startsWith('$2a$') && !user.password_hash.startsWith('$2b$') && !user.password_hash.startsWith('$2y$')) {
      await prisma.$queryRaw`
        UPDATE users
        SET password_hash = ${hashPassword(password)}, updated_at = NOW()
        WHERE user_id = ${user.user_id}
      `;
    }

    const sessionId = await createAuthSession(user.user_id, req);
    const admin = await getAdminAccountByUserId(user.user_id);
    if (!admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    await markAdminLogin(user.user_id);
    await recordAdminAuditLog({
      actorUserId: user.user_id,
      actionType: 'admin.login',
      summary: 'Admin signed in',
      severity: 'info',
      targetType: 'session',
      targetId: sessionId,
    });

    return res.status(200).json({
      token: signAuthToken({
        userId: user.user_id,
        email: user.email,
        username: user.username,
        type: user.user_type,
        sessionId,
      }),
      admin,
    });
  } catch (err) {
    console.error('Error during admin login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.use(authenticateToken, requireAdmin);

router.get('/auth/session', async (req: Request, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  return res.status(200).json({ admin: adminReq.admin });
});

router.get('/dashboard', async (req: Request, res: Response) => {
  const range = parseDashboardRange(req.query.range);
  if (!range) {
    return res.status(400).json({ message: 'Invalid dashboard range. Use 7d, 30d, or 90d.' });
  }

  const dayCount = DASHBOARD_RANGE_DAYS[range];
  const { currentStart, previousStart, todayEnd } = getSqlWindowExpressions(dayCount);

  try {
    const dbProbeStartedAt = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const databaseLatency = Date.now() - dbProbeStartedAt;

    const [
      totalUsersSeries,
      activeUsersSeries,
      postsSeries,
      activeClubsSeries,
      pendingReportsSeries,
      verificationPendingSeries,
      signupsSeries,
      activeChatsSeries,
      metricComparisons,
      reports,
      activity,
      redisStatus,
    ] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(u.user_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN users u ON u.is_active = TRUE AND u.created_at < day_bucket + INTERVAL '1 day'
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(u.user_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN users u ON DATE_TRUNC('day', COALESCE(u.last_seen_at, u.created_at)) = day_bucket
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(p.post_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN posts p ON DATE_TRUNC('day', p.created_at) = day_bucket AND p.deleted_at IS NULL
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(c.club_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN clubs c
          ON c.created_at < day_bucket + INTERVAL '1 day'
         AND (c.deleted_at IS NULL OR c.deleted_at >= day_bucket + INTERVAL '1 day')
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(r.report_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN admin_reports r
          ON r.created_at < day_bucket + INTERVAL '1 day'
         AND (r.resolved_at IS NULL OR r.resolved_at >= day_bucket + INTERVAL '1 day')
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(v.verification_request_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN admin_verification_requests v
          ON v.requested_at < day_bucket + INTERVAL '1 day'
         AND (v.reviewed_at IS NULL OR v.reviewed_at >= day_bucket + INTERVAL '1 day')
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(u.user_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN users u ON DATE_TRUNC('day', u.created_at) = day_bucket
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(DISTINCT c.chat_id)::int AS value
        FROM generate_series(${currentStart}, CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN chats c ON DATE_TRUNC('day', c.updated_at) = day_bucket
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<
        Array<{
          total_users_previous: number;
          active_users_current: number;
          active_users_previous: number;
          posts_current: number;
          posts_previous: number;
          active_clubs_previous: number;
          pending_reports_previous: number;
          verification_requests_previous: number;
          signups_current: number;
          signups_previous: number;
          active_chats_current: number;
          active_chats_previous: number;
        }>
      >(`
        SELECT
          (SELECT COUNT(u.user_id)::int FROM users u WHERE u.is_active = TRUE AND u.created_at < ${currentStart}) AS total_users_previous,
          (SELECT COUNT(DISTINCT u.user_id)::int FROM users u WHERE COALESCE(u.last_seen_at, u.created_at) >= ${currentStart}) AS active_users_current,
          (SELECT COUNT(DISTINCT u.user_id)::int FROM users u WHERE COALESCE(u.last_seen_at, u.created_at) >= ${previousStart} AND COALESCE(u.last_seen_at, u.created_at) < ${currentStart}) AS active_users_previous,
          (SELECT COUNT(p.post_id)::int FROM posts p WHERE p.created_at >= ${currentStart} AND p.created_at < ${todayEnd} AND p.deleted_at IS NULL) AS posts_current,
          (SELECT COUNT(p.post_id)::int FROM posts p WHERE p.created_at >= ${previousStart} AND p.created_at < ${currentStart} AND p.deleted_at IS NULL) AS posts_previous,
          (
            SELECT COUNT(c.club_id)::int
            FROM clubs c
            WHERE c.created_at < ${currentStart}
              AND (c.deleted_at IS NULL OR c.deleted_at >= ${currentStart})
          ) AS active_clubs_previous,
          (
            SELECT COUNT(r.report_id)::int
            FROM admin_reports r
            WHERE r.created_at < ${currentStart}
              AND (r.resolved_at IS NULL OR r.resolved_at >= ${currentStart})
          ) AS pending_reports_previous,
          (
            SELECT COUNT(v.verification_request_id)::int
            FROM admin_verification_requests v
            WHERE v.requested_at < ${currentStart}
              AND (v.reviewed_at IS NULL OR v.reviewed_at >= ${currentStart})
          ) AS verification_requests_previous,
          (SELECT COUNT(u.user_id)::int FROM users u WHERE u.created_at >= ${currentStart} AND u.created_at < ${todayEnd}) AS signups_current,
          (SELECT COUNT(u.user_id)::int FROM users u WHERE u.created_at >= ${previousStart} AND u.created_at < ${currentStart}) AS signups_previous,
          (SELECT COUNT(DISTINCT c.chat_id)::int FROM chats c WHERE c.updated_at >= ${currentStart} AND c.updated_at < ${todayEnd}) AS active_chats_current,
          (SELECT COUNT(DISTINCT c.chat_id)::int FROM chats c WHERE c.updated_at >= ${previousStart} AND c.updated_at < ${currentStart}) AS active_chats_previous
      `),
      prisma.$queryRaw<Array<{ report_id: string; target_type: string; reason: string; severity: string; report_count: number; created_at: Date; target_id: string; reporter: string | null }>>`
        SELECT
          r.report_id,
          r.target_type::text,
          r.reason,
          r.severity::text,
          r.report_count,
          r.created_at,
          r.target_id,
          reporter.username AS reporter
        FROM admin_reports r
        LEFT JOIN users reporter ON reporter.user_id = r.reporter_user_id
        WHERE r.status IN (CAST('pending' AS "AdminReportStatus"), CAST('under_review' AS "AdminReportStatus"))
        ORDER BY
          CASE r.severity
            WHEN CAST('critical' AS "AdminSeverity") THEN 0
            WHEN CAST('warning' AS "AdminSeverity") THEN 1
            ELSE 2
          END,
          r.created_at DESC
        LIMIT 6
      `,
      prisma.$queryRaw<Array<{ type: string; summary: string; created_at: Date }>>`
        (
          SELECT 'report'::text AS type, CONCAT('Report opened: ', reason) AS summary, created_at
          FROM admin_reports
        )
        UNION ALL
        (
          SELECT 'signup'::text AS type, CONCAT(username, ' joined CampusLynk') AS summary, created_at
          FROM users
        )
        UNION ALL
        (
          SELECT 'admin'::text AS type, summary, created_at
          FROM admin_audit_logs
        )
        ORDER BY created_at DESC
        LIMIT 10
      `,
      probeRedisHealth(),
    ]);

    const comparisons = metricComparisons[0] ?? {
      total_users_previous: 0,
      active_users_current: 0,
      active_users_previous: 0,
      posts_current: 0,
      posts_previous: 0,
      active_clubs_previous: 0,
      pending_reports_previous: 0,
      verification_requests_previous: 0,
      signups_current: 0,
      signups_previous: 0,
      active_chats_current: 0,
      active_chats_previous: 0,
    };

    const totalUsersCurrent = totalUsersSeries.at(-1)?.value ?? 0;
    const totalUsersPrevious = comparisons.total_users_previous;
    const activeClubsCurrent = activeClubsSeries.at(-1)?.value ?? 0;
    const activeClubsPrevious = comparisons.active_clubs_previous;
    const pendingReportsCurrent = pendingReportsSeries.at(-1)?.value ?? 0;
    const pendingReportsPrevious = comparisons.pending_reports_previous;
    const verificationPendingCurrent = verificationPendingSeries.at(-1)?.value ?? 0;
    const verificationPendingPrevious = comparisons.verification_requests_previous;

    const websocketConnections = getOpenWebSocketCount();
    const health = [
      {
        key: 'databaseLatency',
        label: 'Database latency',
        value: `${databaseLatency} ms`,
        tone: databaseLatency > 400 ? 'warning' : 'healthy',
      },
      {
        key: 'websocketConnections',
        label: 'WebSocket connections',
        value: String(websocketConnections),
        tone: 'healthy',
      },
      {
        key: 'redisStatus',
        label: 'Redis',
        value: redisStatus,
        tone: redisStatus === 'healthy' ? 'healthy' : redisStatus === 'unavailable' ? 'critical' : 'neutral',
      },
    ] as const;

    const response = {
      range,
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          title: 'Total Users',
          value: totalUsersCurrent,
          key: 'totalUsers',
          series: totalUsersSeries.map((item) => item.value),
          ...buildTrend(totalUsersCurrent, totalUsersPrevious),
        },
        {
          title: 'Active Users',
          value: comparisons.active_users_current,
          key: 'activeUsers',
          series: activeUsersSeries.map((item) => item.value),
          ...buildTrend(comparisons.active_users_current, comparisons.active_users_previous),
        },
        {
          title: 'Posts',
          value: comparisons.posts_current,
          key: 'posts',
          series: postsSeries.map((item) => item.value),
          ...buildTrend(comparisons.posts_current, comparisons.posts_previous),
        },
        {
          title: 'Active Clubs',
          value: activeClubsCurrent,
          key: 'activeClubs',
          series: activeClubsSeries.map((item) => item.value),
          ...buildTrend(activeClubsCurrent, activeClubsPrevious),
        },
        {
          title: 'Pending Reports',
          value: pendingReportsCurrent,
          key: 'pendingReports',
          series: pendingReportsSeries.map((item) => item.value),
          ...buildTrend(pendingReportsCurrent, pendingReportsPrevious),
        },
        {
          title: 'Verification Requests',
          value: verificationPendingCurrent,
          key: 'verificationRequests',
          series: verificationPendingSeries.map((item) => item.value),
          ...buildTrend(verificationPendingCurrent, verificationPendingPrevious),
        },
        {
          title: 'New Signups',
          value: comparisons.signups_current,
          key: 'newSignups',
          series: signupsSeries.map((item) => item.value),
          ...buildTrend(comparisons.signups_current, comparisons.signups_previous),
        },
        {
          title: 'Active Chats',
          value: comparisons.active_chats_current,
          key: 'activeChats',
          series: activeChatsSeries.map((item) => item.value),
          ...buildTrend(comparisons.active_chats_current, comparisons.active_chats_previous),
        },
      ],
      charts: {
        dailyActiveUsers: activeUsersSeries,
        weeklySignups: signupsSeries,
        postsPerDay: postsSeries,
        clubEngagement: activeClubsSeries,
        trafficPeaks: activeUsersSeries.map((item, index) => ({ label: item.label, value: item.value + (postsSeries[index]?.value ?? 0) })),
      },
      moderationQueue: reports.map((item) => ({
        id: item.report_id,
        reportedItem: item.target_id,
        user: item.reporter ?? 'System',
        reason: item.reason,
        severity: item.severity,
        reportsCount: item.report_count,
        time: item.created_at.toISOString(),
      })),
      activityFeed: activity.map((item, index) => ({
        id: `${item.type}-${index}`,
        type: item.type,
        description: item.summary,
        timestamp: item.created_at.toISOString(),
      })),
      health: [...health],
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/users', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? '').trim();
  const banned = parseAdminBooleanFilter(req.query.banned);
  const verified = parseAdminBooleanFilter(req.query.verified);
  const status = parseAdminUserStatusFilter(req.query.status);
  const department = String(req.query.department ?? '').trim();
  const sort = parseAdminUserSortKey(req.query.sort);
  const order = parseAdminSortOrder(req.query.order);
  const page = parsePositiveInt(req.query.page, 1, 1, 10_000);
  const limit = parsePositiveInt(req.query.limit, 20, 1, 100);
  const offset = (page - 1) * limit;
  const safeOrder = order.toUpperCase();
  const safeSortColumn = ADMIN_USER_SORT_COLUMNS[sort];
  const searchPattern = `%${query}%`;

  try {
    const listSql = `
      SELECT
        u.user_id,
        u.display_name,
        u.username,
        u.email,
        COALESCE(sp.branch, ap.branch, 'Unknown') AS branch,
        (SELECT COUNT(*)::int FROM follows f WHERE f.followed_user_id = u.user_id) AS follower_count,
        (SELECT COUNT(*)::int FROM posts p WHERE p.author_user_id = u.user_id AND p.deleted_at IS NULL) AS post_count,
        (SELECT COUNT(*)::int FROM admin_reports r WHERE r.target_type = CAST('user' AS "AdminReportTargetType") AND r.target_user_id = u.user_id) AS reports_count,
        COALESCE(u.last_seen_at, u.created_at) AS last_active,
        u.is_banned,
        u.suspended_until,
        u.verified_at,
        u.profile_photo_url,
        u.created_at
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
      WHERE
        ($1 = '' OR u.username ILIKE $2 OR u.display_name ILIKE $2 OR u.email ILIKE $2)
        AND ($3 = '' OR ($3 = 'true' AND u.is_banned = TRUE) OR ($3 = 'false' AND u.is_banned = FALSE))
        AND ($4 = '' OR ($4 = 'true' AND u.verified_at IS NOT NULL) OR ($4 = 'false' AND u.verified_at IS NULL))
        AND (
          $5 = ''
          OR ($5 = 'active' AND u.is_banned = FALSE AND (u.suspended_until IS NULL OR u.suspended_until <= NOW()))
          OR ($5 = 'suspended' AND u.is_banned = FALSE AND u.suspended_until IS NOT NULL AND u.suspended_until > NOW())
          OR ($5 = 'banned' AND u.is_banned = TRUE)
        )
        AND ($6 = '' OR COALESCE(sp.branch, ap.branch, 'Unknown') = $6)
      ORDER BY ${safeSortColumn} ${safeOrder}, u.user_id ${safeOrder}
      LIMIT $7
      OFFSET $8
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
      WHERE
        ($1 = '' OR u.username ILIKE $2 OR u.display_name ILIKE $2 OR u.email ILIKE $2)
        AND ($3 = '' OR ($3 = 'true' AND u.is_banned = TRUE) OR ($3 = 'false' AND u.is_banned = FALSE))
        AND ($4 = '' OR ($4 = 'true' AND u.verified_at IS NOT NULL) OR ($4 = 'false' AND u.verified_at IS NULL))
        AND (
          $5 = ''
          OR ($5 = 'active' AND u.is_banned = FALSE AND (u.suspended_until IS NULL OR u.suspended_until <= NOW()))
          OR ($5 = 'suspended' AND u.is_banned = FALSE AND u.suspended_until IS NOT NULL AND u.suspended_until > NOW())
          OR ($5 = 'banned' AND u.is_banned = TRUE)
        )
        AND ($6 = '' OR COALESCE(sp.branch, ap.branch, 'Unknown') = $6)
    `;
    const [rows, totalRows, departmentRows] = await Promise.all([
      prisma.$queryRawUnsafe<
      Array<{
        user_id: string;
        display_name: string;
        username: string;
        email: string;
        branch: string | null;
        follower_count: number;
        post_count: number;
        reports_count: number;
        last_active: Date | null;
        is_banned: boolean;
        suspended_until: Date | null;
        verified_at: Date | null;
        profile_photo_url: string | null;
        created_at: Date;
      }>
      >(listSql, query, searchPattern, banned, verified, status, department, limit, offset),
      prisma.$queryRawUnsafe<
        Array<{ total: number }>
      >(countSql, query, searchPattern, banned, verified, status, department),
      prisma.$queryRaw<
        Array<{ department: string }>
      >`
        SELECT department
        FROM (
          SELECT DISTINCT COALESCE(sp.branch, ap.branch, 'Unknown') AS department
          FROM users u
          LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
          LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
        ) departments
        ORDER BY department ASC
      `,
    ]);

    const total = totalRows[0]?.total ?? 0;
    const pageCount = total === 0 ? 1 : Math.ceil(total / limit);

    return res.status(200).json({
      items: rows.map((row) => ({
        id: row.user_id,
        username: row.username,
        fullName: row.display_name,
        email: row.email,
        college: 'GBPUAT',
        department: row.branch,
        followers: row.follower_count,
        postsCount: row.post_count,
        reportsCount: row.reports_count,
        lastActive: row.last_active ? row.last_active.toISOString() : null,
        createdAt: row.created_at.toISOString(),
        suspendedUntil: row.suspended_until ? row.suspended_until.toISOString() : null,
        status: row.is_banned ? 'banned' : row.suspended_until && row.suspended_until > new Date() ? 'suspended' : 'active',
        verified: Boolean(row.verified_at),
        avatarUrl: row.profile_photo_url,
      })),
      pageInfo: {
        page,
        limit,
        total,
        totalPages: pageCount,
        hasNextPage: page < pageCount,
        hasPreviousPage: page > 1,
      },
      filterOptions: {
        departments: departmentRows.map((row) => row.department),
      },
    });
  } catch (err) {
    console.error('Error loading admin users:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/users/:userId', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const [users, posts, clubs, reports, sessions, auditLogs] = await Promise.all([
      prisma.$queryRaw<Array<{ user_id: string; display_name: string; username: string; email: string; bio: string | null; headline: string | null; branch: string | null; is_banned: boolean; suspended_until: Date | null; verified_at: Date | null; created_at: Date; last_seen_at: Date | null; profile_photo_url: string | null }>>`
        SELECT
          u.user_id,
          u.display_name,
          u.username,
          u.email,
          u.bio,
          u.headline,
          COALESCE(sp.branch, ap.branch, 'Unknown') AS branch,
          u.is_banned,
          u.suspended_until,
          u.verified_at,
          u.created_at,
          u.last_seen_at,
          u.profile_photo_url
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
        LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
        WHERE u.user_id = ${userId}
        LIMIT 1
      `,
      prisma.$queryRaw<Array<{ post_id: string; title: string | null; content_text: string | null; created_at: Date; hidden_at: Date | null; deleted_at: Date | null }>>`
        SELECT post_id, title, content_text, created_at, hidden_at, deleted_at
        FROM posts
        WHERE author_user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 5
      `,
      prisma.$queryRaw<Array<{ club_id: string; name: string; role: string; status: string }>>`
        SELECT c.club_id, c.name, cm.role::text, cm.status::text
        FROM club_memberships cm
        JOIN clubs c ON c.club_id = cm.club_id
        WHERE cm.user_id = ${userId}
        ORDER BY c.name ASC
        LIMIT 10
      `,
      prisma.$queryRaw<Array<{ report_id: string; reason: string; status: string; created_at: Date }>>`
        SELECT report_id, reason, status::text, created_at
        FROM admin_reports
        WHERE target_user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 10
      `,
      prisma.$queryRaw<Array<{ session_id: string; browser_name: string | null; platform: string | null; location_label: string | null; last_seen_at: Date | null; created_at: Date }>>`
        SELECT session_id, browser_name, platform, location_label, last_seen_at, created_at
        FROM user_sessions
        WHERE user_id = ${userId}
        ORDER BY COALESCE(last_seen_at, created_at) DESC
        LIMIT 10
      `,
      prisma.$queryRaw<Array<{ audit_log_id: string; action_type: string; summary: string; severity: string; created_at: Date; actor: string; metadata: unknown }>>`
        SELECT l.audit_log_id, l.action_type, l.summary, l.severity::text, l.created_at, actor.username AS actor, l.metadata
        FROM admin_audit_logs l
        JOIN users actor ON actor.user_id = l.actor_user_id
        WHERE l.target_type = 'user' AND l.target_id = ${userId}
        ORDER BY l.created_at DESC
        LIMIT 20
      `,
    ]);

    const user = users[0];
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({
      id: user.user_id,
      username: user.username,
      fullName: user.display_name,
      email: user.email,
      bio: user.bio,
      headline: user.headline,
      college: 'GBPUAT',
      department: user.branch,
      verified: Boolean(user.verified_at),
      status: user.is_banned ? 'banned' : user.suspended_until && user.suspended_until > new Date() ? 'suspended' : 'active',
      avatarUrl: user.profile_photo_url,
      createdAt: user.created_at.toISOString(),
      lastSeenAt: user.last_seen_at ? user.last_seen_at.toISOString() : null,
      suspendedUntil: user.suspended_until ? user.suspended_until.toISOString() : null,
      recentPosts: posts.map((post) => ({
        id: post.post_id,
        title: post.title,
        preview: post.content_text,
        createdAt: post.created_at.toISOString(),
        status: post.deleted_at ? 'deleted' : post.hidden_at ? 'hidden' : 'live',
      })),
      clubs: clubs.map((club) => ({
        id: club.club_id,
        name: club.name,
        role: club.role,
        status: club.status,
      })),
      reports: reports.map((report) => ({
        id: report.report_id,
        reason: report.reason,
        status: report.status,
        createdAt: report.created_at.toISOString(),
      })),
      moderationHistory: auditLogs.map((entry) => ({
        id: entry.audit_log_id,
        actionType: entry.action_type,
        actor: entry.actor,
        severity: entry.severity,
        summary: entry.summary,
        timestamp: entry.created_at.toISOString(),
        metadata: entry.metadata ?? {},
      })),
      loginHistory: sessions.map((session) => ({
        id: session.session_id,
        browser: session.browser_name ?? 'Unknown browser',
        platform: session.platform ?? 'Unknown platform',
        location: session.location_label ?? 'Unknown location',
        lastSeenAt: session.last_seen_at ? session.last_seen_at.toISOString() : null,
        createdAt: session.created_at.toISOString(),
      })),
    });
  } catch (err) {
    console.error('Error loading admin user detail:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/users/:userId/actions', async (req: Request<{ userId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { userId } = req.params;
  const { action, note, durationDays } = req.body as { action?: string; note?: string; durationDays?: number };
  const normalizedNote = note?.trim();

  if (!action) {
    return res.status(400).json({ message: 'Missing action' });
  }

  let suspendDays: number | null = null;
  if (action === 'suspend') {
    const parsedDuration = Number(durationDays);
    if (!Number.isInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 365) {
      return res.status(400).json({ message: 'durationDays must be an integer between 1 and 365' });
    }
    suspendDays = parsedDuration;
  }

  try {
    if (action === 'warn') {
      await applyModerationAction({
        adminUserId: adminReq.auth!.userId,
        targetUserId: userId,
        actionType: 'warn',
        reason: normalizedNote || 'Please review our community guidelines.',
      });
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'user.warn',
        targetType: 'user',
        targetId: userId,
        severity: 'warning',
        summary: normalizedNote || 'User warned by admin',
        metadata: normalizedNote ? { note: normalizedNote } : undefined,
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'suspend') {
      await applyModerationAction({
        adminUserId: adminReq.auth!.userId,
        targetUserId: userId,
        actionType: 'suspend',
        reason: normalizedNote || 'Account suspended for policy violations.',
        durationDays: suspendDays!,
      });
    } else if (action === 'ban') {
      const targetRows = await prisma.$queryRaw<Array<{ email: string; display_name: string | null }>>`
        SELECT email, display_name
        FROM users
        WHERE user_id = ${userId}
        LIMIT 1
      `;
      const targetUser = targetRows[0];
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      await applyModerationAction({
        adminUserId: adminReq.auth!.userId,
        targetUserId: userId,
        actionType: 'ban',
        reason: normalizedNote || 'Account permanently banned for policy violations.',
      });

      let banEmail: { attempted: true; sent: boolean; error?: string } = { attempted: true, sent: true };
      try {
        await sendModerationBanEmail({
          email: targetUser.email,
          displayName: targetUser.display_name,
          reason: normalizedNote || 'Account permanently banned for policy violations.',
        });
      } catch (emailErr) {
        const errorMessage = emailErr instanceof Error ? emailErr.message : 'Unknown email delivery failure';
        banEmail = { attempted: true, sent: false, error: errorMessage };
        console.error('Error sending moderation ban email:', emailErr);
      }

      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'user.ban',
        targetType: 'user',
        targetId: userId,
        severity: 'warning',
        summary: 'Admin performed ban on user',
        metadata: {
          ...(normalizedNote ? { note: normalizedNote } : {}),
          banEmailSent: banEmail.sent,
          ...(banEmail.error ? { banEmailError: banEmail.error } : {}),
        },
      });

      return res.status(200).json({ success: true, email: banEmail });
    } else if (action === 'unsuspend') {
      await applyModerationAction({
        adminUserId: adminReq.auth!.userId,
        targetUserId: userId,
        actionType: 'unsuspend',
        reason: normalizedNote || 'Suspension lifted by admin.',
      });
    } else if (action === 'unban') {
      await applyModerationAction({
        adminUserId: adminReq.auth!.userId,
        targetUserId: userId,
        actionType: 'unban',
        reason: normalizedNote || 'Ban lifted by admin.',
      });
    } else if (action === 'verify') {
      await prisma.$queryRaw`
        UPDATE users
        SET verified_at = NOW(), updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    } else {
      return res.status(400).json({ message: 'Unsupported action' });
    }

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: `user.${action}`,
      targetType: 'user',
      targetId: userId,
      severity: action === 'verify' ? 'info' : 'warning',
      summary: `Admin performed ${action} on user`,
      metadata: {
        ...(normalizedNote ? { note: normalizedNote } : {}),
        ...(action === 'suspend' && suspendDays !== null ? { durationDays: suspendDays } : {}),
      },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error performing user action:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/clubs', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? '').trim();
  const statusFilter = (() => {
    const v = String(req.query.status ?? '').trim().toLowerCase();
    return ['active', 'featured', 'frozen', 'deleted', 'all'].includes(v) ? v : '';
  })();
  const verifiedFilter = parseAdminBooleanFilter(req.query.verified);
  const sortRaw = String(req.query.sort ?? '').trim();
  const validSorts: Record<string, string> = {
    members: 'members',
    posts: 'posts_count',
    reports: 'reports',
    createdAt: 'c.created_at',
    lastActivity: 'last_activity',
  };
  const sortColumn = validSorts[sortRaw] ?? 'members';
  const order = parseAdminSortOrder(req.query.order);
  const safeOrder = order.toUpperCase();
  const page = parsePositiveInt(req.query.page, 1, 1, 10_000);
  const limit = parsePositiveInt(req.query.limit, 20, 1, 100);
  const offset = (page - 1) * limit;
  const searchPattern = `%${query}%`;

  try {
    const listSql = `
      SELECT
        c.club_id, c.name, c.slug, c.avatar_url,
        (SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.club_id = c.club_id AND cm.status = CAST('active' AS "ClubMembershipStatus")) AS members,
        (SELECT COUNT(*)::int FROM posts p WHERE p.club_id = c.club_id AND p.deleted_at IS NULL) AS posts_count,
        (SELECT COUNT(*)::int FROM admin_reports r WHERE r.target_type = CAST('club' AS "AdminReportTargetType") AND r.target_id = c.club_id::text) AS reports,
        u.username AS created_by,
        c.is_verified, c.frozen_at, c.featured_at, c.deleted_at, c.created_at,
        COALESCE(
          (SELECT MAX(p2.created_at) FROM posts p2 WHERE p2.club_id = c.club_id AND p2.deleted_at IS NULL),
          c.created_at
        ) AS last_activity
      FROM clubs c
      JOIN users u ON u.user_id = c.created_by_user_id
      WHERE
        ($1 = '' OR c.name ILIKE $2 OR c.slug ILIKE $2 OR u.username ILIKE $2)
        AND ($3 = '' OR ($3 = 'true' AND c.is_verified = TRUE) OR ($3 = 'false' AND c.is_verified = FALSE))
        AND (
          $4 = ''
          OR ($4 = 'active' AND c.deleted_at IS NULL AND c.frozen_at IS NULL AND c.featured_at IS NULL)
          OR ($4 = 'featured' AND c.deleted_at IS NULL AND c.frozen_at IS NULL AND c.featured_at IS NOT NULL)
          OR ($4 = 'frozen' AND c.deleted_at IS NULL AND c.frozen_at IS NOT NULL)
          OR ($4 = 'deleted' AND c.deleted_at IS NOT NULL)
          OR ($4 = 'all')
        )
        AND ($4 != '' OR c.deleted_at IS NULL)
      ORDER BY ${sortColumn} ${safeOrder}, c.club_id ${safeOrder}
      LIMIT $5 OFFSET $6
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM clubs c
      JOIN users u ON u.user_id = c.created_by_user_id
      WHERE
        ($1 = '' OR c.name ILIKE $2 OR c.slug ILIKE $2 OR u.username ILIKE $2)
        AND ($3 = '' OR ($3 = 'true' AND c.is_verified = TRUE) OR ($3 = 'false' AND c.is_verified = FALSE))
        AND (
          $4 = ''
          OR ($4 = 'active' AND c.deleted_at IS NULL AND c.frozen_at IS NULL AND c.featured_at IS NULL)
          OR ($4 = 'featured' AND c.deleted_at IS NULL AND c.frozen_at IS NULL AND c.featured_at IS NOT NULL)
          OR ($4 = 'frozen' AND c.deleted_at IS NULL AND c.frozen_at IS NOT NULL)
          OR ($4 = 'deleted' AND c.deleted_at IS NOT NULL)
          OR ($4 = 'all')
        )
        AND ($4 != '' OR c.deleted_at IS NULL)
    `;

    type AdminClubRow = {
      club_id: string; name: string; slug: string; avatar_url: string | null;
      members: number; posts_count: number; reports: number; created_by: string;
      is_verified: boolean; frozen_at: Date | null; featured_at: Date | null;
      deleted_at: Date | null; created_at: Date; last_activity: Date;
    };

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRawUnsafe<AdminClubRow[]>(listSql, query, searchPattern, verifiedFilter, statusFilter, limit, offset),
      prisma.$queryRawUnsafe<Array<{ total: number }>>(countSql, query, searchPattern, verifiedFilter, statusFilter),
    ]);

    const total = totalRows[0]?.total ?? 0;
    const pageCount = total === 0 ? 1 : Math.ceil(total / limit);

    function deriveClubStatus(row: Pick<AdminClubRow, 'deleted_at' | 'frozen_at' | 'featured_at'>): string {
      if (row.deleted_at) return 'deleted';
      if (row.frozen_at) return 'frozen';
      if (row.featured_at) return 'featured';
      return 'active';
    }

    return res.status(200).json({
      items: rows.map((row) => ({
        id: row.club_id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.avatar_url,
        members: row.members,
        activityScore: row.posts_count + row.members,
        postsCount: row.posts_count,
        reports: row.reports,
        createdBy: row.created_by,
        verified: row.is_verified,
        status: deriveClubStatus(row),
        createdAt: row.created_at.toISOString(),
        lastActivity: row.last_activity.toISOString(),
      })),
      pageInfo: {
        page, limit, total, totalPages: pageCount,
        hasNextPage: page < pageCount,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error('Error loading admin clubs:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/clubs/:clubId', async (req: Request<{ clubId: string }>, res: Response) => {
  const { clubId } = req.params;

  try {
    const [clubs, ownerRows, memberCounts, topPosts, linkedReports, history, memberGrowthRows, engagementRows] = await Promise.all([
      prisma.$queryRaw<Array<{
        club_id: string; name: string; slug: string; description: string | null;
        is_verified: boolean; featured_at: Date | null; frozen_at: Date | null;
        deleted_at: Date | null; created_at: Date; created_by_user_id: string;
      }>>`
        SELECT club_id, name, slug, description, is_verified, featured_at, frozen_at, deleted_at, created_at, created_by_user_id
        FROM clubs WHERE club_id = ${clubId} LIMIT 1
      `,
      prisma.$queryRaw<Array<{ user_id: string; username: string; email: string; profile_photo_url: string | null }>>`
        SELECT u.user_id, u.username, u.email, u.profile_photo_url
        FROM clubs c JOIN users u ON u.user_id = c.created_by_user_id
        WHERE c.club_id = ${clubId} LIMIT 1
      `,
      prisma.$queryRaw<Array<{ total_members: number; admin_count: number }>>`
        SELECT
          (SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.club_id = ${clubId} AND cm.status = CAST('active' AS "ClubMembershipStatus")) AS total_members,
          (SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.club_id = ${clubId} AND cm.status = CAST('active' AS "ClubMembershipStatus") AND cm.role IN (CAST('admin' AS "ClubMembershipRole"), CAST('owner' AS "ClubMembershipRole"))) AS admin_count
      `,
      prisma.$queryRaw<Array<{ post_id: string; title: string | null; content_text: string | null; like_count: number; created_at: Date }>>`
        SELECT p.post_id, p.title, p.content_text,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
          p.created_at
        FROM posts p WHERE p.club_id = ${clubId} AND p.deleted_at IS NULL
        ORDER BY like_count DESC, p.created_at DESC LIMIT 5
      `,
      prisma.$queryRaw<Array<{ report_id: string; reason: string; severity: string; status: string; created_at: Date }>>`
        SELECT r.report_id, r.reason, r.severity::text, r.status::text, r.created_at
        FROM admin_reports r
        WHERE r.target_type = CAST('club' AS "AdminReportTargetType") AND r.target_id = ${clubId}
        ORDER BY r.created_at DESC LIMIT 10
      `,
      prisma.$queryRaw<Array<{ audit_log_id: string; action_type: string; summary: string; severity: string; created_at: Date; actor: string; metadata: unknown }>>`
        SELECT l.audit_log_id, l.action_type, l.summary, l.severity::text, l.created_at, actor.username AS actor, l.metadata
        FROM admin_audit_logs l
        JOIN users actor ON actor.user_id = l.actor_user_id
        WHERE l.target_type = 'club' AND l.target_id = ${clubId}
        ORDER BY l.created_at DESC LIMIT 20
      `,
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM club_memberships cm
        WHERE cm.club_id = ${clubId}
          AND cm.status = CAST('active' AS "ClubMembershipStatus")
          AND cm.joined_at >= NOW() - INTERVAL '30 day'
      `,
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COALESCE(
          (SELECT COUNT(*)::int FROM post_likes pl JOIN posts p ON p.post_id = pl.post_id WHERE p.club_id = ${clubId} AND p.created_at >= NOW() - INTERVAL '30 day' AND p.deleted_at IS NULL), 0
        ) + COALESCE(
          (SELECT COUNT(*)::int FROM post_comments pc JOIN posts p ON p.post_id = pc.post_id WHERE p.club_id = ${clubId} AND p.created_at >= NOW() - INTERVAL '30 day' AND p.deleted_at IS NULL), 0
        ) AS count
      `,
    ]);

    const club = clubs[0];
    if (!club) return res.status(404).json({ message: 'Club not found' });

    const owner = ownerRows[0] ?? null;
    const counts = memberCounts[0] ?? { total_members: 0, admin_count: 0 };

    function deriveStatus(c: typeof club): string {
      if (c.deleted_at) return 'deleted';
      if (c.frozen_at) return 'frozen';
      if (c.featured_at) return 'featured';
      return 'active';
    }

    return res.status(200).json({
      id: club.club_id,
      name: club.name,
      slug: club.slug,
      description: club.description,
      verified: club.is_verified,
      status: deriveStatus(club),
      createdAt: club.created_at.toISOString(),
      owner: owner ? { id: owner.user_id, username: owner.username, email: owner.email, avatarUrl: owner.profile_photo_url } : null,
      memberSnapshot: { totalMembers: counts.total_members, adminCount: counts.admin_count },
      analytics: {
        memberGrowth30d: memberGrowthRows[0]?.count ?? 0,
        engagement30d: engagementRows[0]?.count ?? 0,
      },
      topPosts: topPosts.map((post) => ({
        id: post.post_id, title: post.title, preview: post.content_text,
        likes: post.like_count, createdAt: post.created_at.toISOString(),
      })),
      linkedReports: linkedReports.map((r) => ({
        id: r.report_id, reason: r.reason, severity: r.severity,
        status: r.status, createdAt: r.created_at.toISOString(),
      })),
      moderationHistory: history.map((entry) => ({
        id: entry.audit_log_id, actionType: entry.action_type, actor: entry.actor,
        severity: entry.severity, summary: entry.summary,
        timestamp: entry.created_at.toISOString(), metadata: entry.metadata ?? {},
      })),
    });
  } catch (err) {
    console.error('Error loading admin club detail:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/clubs/:clubId/actions', async (req: Request<{ clubId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { clubId } = req.params;
  const { action, targetUserId } = req.body as { action?: string; targetUserId?: string };

  if (!action) {
    return res.status(400).json({ message: 'Missing action' });
  }

  try {
    const clubRows = await prisma.$queryRaw<Array<{ created_by_user_id: string }>>`
      SELECT created_by_user_id
      FROM clubs
      WHERE club_id = ${clubId}
      LIMIT 1
    `;
    const clubRow = clubRows[0];
    if (!clubRow) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (action === 'verify') {
      await prisma.$queryRaw`UPDATE clubs SET is_verified = TRUE, updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'feature') {
      await prisma.$queryRaw`UPDATE clubs SET featured_at = NOW(), updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'unfeature') {
      await prisma.$queryRaw`UPDATE clubs SET featured_at = NULL, updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'freeze') {
      await prisma.$queryRaw`UPDATE clubs SET frozen_at = NOW(), updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'unfreeze') {
      await prisma.$queryRaw`UPDATE clubs SET frozen_at = NULL, updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'delete') {
      const dbRows = await prisma.$queryRaw<Array<{ avatar_url: string | null; cover_image_url: string | null; user_id: string | null }>>`
        SELECT c.avatar_url, c.cover_image_url, cm.user_id
        FROM clubs c
        LEFT JOIN club_memberships cm ON cm.club_id = c.club_id
        WHERE c.club_id = ${clubId}
      `;
      const row = dbRows[0];
      if (row) {
        await prisma.$queryRaw`DELETE FROM clubs WHERE club_id = ${clubId}`;
        await Promise.allSettled([
          deleteManagedClubMediaByUrl(row.avatar_url),
          deleteManagedClubMediaByUrl(row.cover_image_url),
        ]);
        await purgeClubCaches(
          clubId,
          dbRows.map((item) => item.user_id).filter((userId): userId is string => Boolean(userId)),
        );
      }
    } else if (action === 'restore') {
      await prisma.$queryRaw`UPDATE clubs SET deleted_at = NULL, updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'transfer_ownership') {
      if (!targetUserId) {
        return res.status(400).json({ message: 'Missing targetUserId for ownership transfer' });
      }

      // Validate target is an active member
      const targetMembership = await prisma.$queryRaw<Array<{ user_id: string; role: string; status: string }>>`
        SELECT cm.user_id, cm.role::text, cm.status::text
        FROM club_memberships cm
        WHERE cm.club_id = ${clubId} AND cm.user_id = ${targetUserId} LIMIT 1
      `;
      const target = targetMembership[0];
      if (!target || target.status !== 'active') {
        return res.status(400).json({ message: 'Target user is not an active member of this club' });
      }

      // Find current owner
      const currentOwnerRows = await prisma.$queryRaw<Array<{ user_id: string }>>`
        SELECT cm.user_id FROM club_memberships cm
        WHERE cm.club_id = ${clubId} AND cm.role = CAST('owner' AS "ClubMembershipRole")
        LIMIT 1
      `;
      const oldOwnerId = currentOwnerRows[0]?.user_id;

      // Transaction: promote target to owner, demote current owner to admin, update clubs.created_by_user_id
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          UPDATE club_memberships
          SET role = CAST('owner' AS "ClubMembershipRole"), updated_at = NOW()
          WHERE club_id = ${clubId} AND user_id = ${targetUserId}
        `;
        if (oldOwnerId && oldOwnerId !== targetUserId) {
          await tx.$queryRaw`
            UPDATE club_memberships
            SET role = CAST('admin' AS "ClubMembershipRole"), updated_at = NOW()
            WHERE club_id = ${clubId} AND user_id = ${oldOwnerId}
          `;
        }
        await tx.$queryRaw`
          UPDATE clubs SET created_by_user_id = ${targetUserId}, updated_at = NOW()
          WHERE club_id = ${clubId}
        `;
      });

      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'club.transfer_ownership',
        targetType: 'club',
        targetId: clubId,
        severity: 'warning',
        summary: `Ownership transferred to user ${targetUserId}`,
        metadata: { oldOwnerId: oldOwnerId ?? null, newOwnerId: targetUserId },
      });

      await invalidateAdminClubCaches(clubId, [targetUserId, ...(oldOwnerId ? [oldOwnerId] : [])]);

      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ message: 'Unsupported action' });
    }

    if (action === 'freeze' || action === 'delete') {
      await createNotification({
        recipientUserId: clubRow.created_by_user_id,
        type: 'club',
        title: 'Club Moderation Action',
        message: `Your club has been ${action === 'freeze' ? 'frozen' : 'deleted'} by the administration.`,
        entityType: 'club',
        entityId: clubId,
      });
    }

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: `club.${action}`,
      targetType: 'club',
      targetId: clubId,
      severity: action === 'delete' ? 'critical' : 'warning',
      summary: `Admin performed ${action} on club`,
    });

    await invalidateAdminClubCaches(clubId, [clubRow.created_by_user_id]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error performing club action:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/clubs/:clubId/members', async (req: Request<{ clubId: string }>, res: Response) => {
  const { clubId } = req.params;
  const query = String(req.query.q ?? '').trim();
  const searchPattern = `%${query}%`;

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ user_id: string; username: string; email: string; role: string; profile_photo_url: string | null }>
    >(`
      SELECT u.user_id, u.username, u.email, cm.role::text, u.profile_photo_url
      FROM club_memberships cm
      JOIN users u ON u.user_id = cm.user_id
      WHERE cm.club_id = $1
        AND cm.status = CAST('active' AS "ClubMembershipStatus")
        AND ($2 = '' OR u.username ILIKE $3)
      ORDER BY
        CASE cm.role
          WHEN CAST('owner' AS "ClubMembershipRole") THEN 0
          WHEN CAST('admin' AS "ClubMembershipRole") THEN 1
          ELSE 2
        END,
        u.username ASC
      LIMIT 50
    `, clubId, query, searchPattern);

    return res.status(200).json(rows.map((row) => ({
      id: row.user_id,
      username: row.username,
      email: row.email,
      role: row.role,
      avatarUrl: row.profile_photo_url,
    })));
  } catch (err) {
    console.error('Error loading club members for admin:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/posts', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? '').trim();
  const clubFilter = String(req.query.club ?? '').trim();
  const statusFilter = (() => {
    const value = String(req.query.status ?? '').trim().toLowerCase();
    return ['live', 'hidden', 'deleted', 'all'].includes(value) ? value : '';
  })();
  const severityFilter = (() => {
    const value = String(req.query.severity ?? '').trim().toLowerCase();
    return value === 'warning' || value === 'critical' ? value : '';
  })();
  const sortRaw = String(req.query.sort ?? '').trim();
  const validSorts: Record<string, string> = {
    createdAt: 'p.created_at',
    reports: 'reports_count',
    engagement: 'engagement_total',
  };
  const sortColumn = validSorts[sortRaw] ?? 'p.created_at';
  const order = parseAdminSortOrder(req.query.order).toUpperCase();
  const page = parsePositiveInt(req.query.page, 1, 1, 10_000);
  const limit = parsePositiveInt(req.query.limit, 20, 1, 100);
  const offset = (page - 1) * limit;
  const searchPattern = `%${query}%`;
  const clubPattern = `%${clubFilter}%`;

  try {
    const listSql = `
      SELECT
        p.post_id,
        p.title,
        p.content_text,
        u.username,
        c.name AS club_name,
        c.slug AS club_slug,
        p.club_id,
        (SELECT pm.media_url FROM post_media pm WHERE pm.post_id = p.post_id ORDER BY pm.sort_order ASC, pm.created_at ASC LIMIT 1) AS media_url,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS likes,
        (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comments,
        (SELECT COUNT(*)::int FROM admin_reports r WHERE r.target_type = CAST('post' AS "AdminReportTargetType") AND r.target_id = p.post_id::text) AS reports_count,
        COALESCE((
          SELECT CASE
            WHEN BOOL_OR(r.severity = CAST('critical' AS "AdminSeverity")) THEN 'critical'
            WHEN BOOL_OR(r.severity = CAST('warning' AS "AdminSeverity")) THEN 'warning'
            ELSE ''
          END
          FROM admin_reports r
          WHERE r.target_type = CAST('post' AS "AdminReportTargetType") AND r.target_id = p.post_id::text
        ), '') AS highest_severity,
        p.hidden_at,
        p.hidden_reason,
        p.deleted_at,
        p.created_at,
        p.author_user_id,
        ((SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) + (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id)) AS engagement_total
      FROM posts p
      JOIN users u ON u.user_id = p.author_user_id
      LEFT JOIN clubs c ON c.club_id = p.club_id
      WHERE
        ($1 = '' OR COALESCE(p.title, '') ILIKE $2 OR COALESCE(p.content_text, '') ILIKE $2 OR u.username ILIKE $2 OR COALESCE(c.name, '') ILIKE $2)
        AND ($3 = '' OR COALESCE(c.name, '') ILIKE $4)
        AND (
          $5 = ''
          OR ($5 = 'live' AND p.deleted_at IS NULL AND p.hidden_at IS NULL)
          OR ($5 = 'hidden' AND p.deleted_at IS NULL AND p.hidden_at IS NOT NULL)
          OR ($5 = 'deleted' AND p.deleted_at IS NOT NULL)
          OR ($5 = 'all')
        )
        AND ($5 != '' OR p.deleted_at IS NULL)
        AND (
          $6 = ''
          OR (
            $6 = COALESCE((
              SELECT CASE
                WHEN BOOL_OR(r.severity = CAST('critical' AS "AdminSeverity")) THEN 'critical'
                WHEN BOOL_OR(r.severity = CAST('warning' AS "AdminSeverity")) THEN 'warning'
                ELSE ''
              END
              FROM admin_reports r
              WHERE r.target_type = CAST('post' AS "AdminReportTargetType") AND r.target_id = p.post_id::text
            ), '')
          )
        )
      ORDER BY ${sortColumn} ${order}, p.post_id ${order}
      LIMIT $7 OFFSET $8
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM posts p
      JOIN users u ON u.user_id = p.author_user_id
      LEFT JOIN clubs c ON c.club_id = p.club_id
      WHERE
        ($1 = '' OR COALESCE(p.title, '') ILIKE $2 OR COALESCE(p.content_text, '') ILIKE $2 OR u.username ILIKE $2 OR COALESCE(c.name, '') ILIKE $2)
        AND ($3 = '' OR COALESCE(c.name, '') ILIKE $4)
        AND (
          $5 = ''
          OR ($5 = 'live' AND p.deleted_at IS NULL AND p.hidden_at IS NULL)
          OR ($5 = 'hidden' AND p.deleted_at IS NULL AND p.hidden_at IS NOT NULL)
          OR ($5 = 'deleted' AND p.deleted_at IS NOT NULL)
          OR ($5 = 'all')
        )
        AND ($5 != '' OR p.deleted_at IS NULL)
        AND (
          $6 = ''
          OR (
            $6 = COALESCE((
              SELECT CASE
                WHEN BOOL_OR(r.severity = CAST('critical' AS "AdminSeverity")) THEN 'critical'
                WHEN BOOL_OR(r.severity = CAST('warning' AS "AdminSeverity")) THEN 'warning'
                ELSE ''
              END
              FROM admin_reports r
              WHERE r.target_type = CAST('post' AS "AdminReportTargetType") AND r.target_id = p.post_id::text
            ), '')
          )
        )
    `;

    type AdminPostRow = {
      post_id: string;
      title: string | null;
      content_text: string | null;
      username: string;
      club_name: string | null;
      club_slug: string | null;
      club_id: string | null;
      media_url: string | null;
      likes: number;
      comments: number;
      reports_count: number;
      highest_severity: '' | 'warning' | 'critical';
      hidden_at: Date | null;
      hidden_reason: string | null;
      deleted_at: Date | null;
      created_at: Date;
      author_user_id: string;
      engagement_total: number;
    };

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRawUnsafe<AdminPostRow[]>(listSql, query, searchPattern, clubFilter, clubPattern, statusFilter, severityFilter, limit, offset),
      prisma.$queryRawUnsafe<Array<{ total: number }>>(countSql, query, searchPattern, clubFilter, clubPattern, statusFilter, severityFilter),
    ]);

    const total = totalRows[0]?.total ?? 0;
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

    return res.status(200).json({
      items: rows.map((row) => ({
        id: row.post_id,
        author: row.username,
        authorUserId: row.author_user_id,
        club: row.club_name ? { id: row.club_id, name: row.club_name, slug: row.club_slug } : null,
        title: row.title,
        preview: row.content_text,
        mediaUrl: row.media_url,
        engagement: {
          likes: row.likes,
          comments: row.comments,
          total: row.engagement_total,
        },
        reportsCount: row.reports_count,
        highestSeverity: row.highest_severity,
        hiddenReason: row.hidden_reason,
        status: row.deleted_at ? 'deleted' : row.hidden_at ? 'hidden' : 'live',
        createdAt: row.created_at.toISOString(),
      })),
      pageInfo: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error('Error loading admin posts:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/posts/:postId', async (req: Request<{ postId: string }>, res: Response) => {
  const { postId } = req.params;

  try {
    const [postRows, mediaRows, reportRows, historyRows] = await Promise.all([
      prisma.$queryRaw<Array<{
        post_id: string;
        title: string | null;
        content_text: string | null;
        hidden_reason: string | null;
        hidden_at: Date | null;
        deleted_at: Date | null;
        created_at: Date;
        author_user_id: string;
        author_username: string;
        author_email: string;
        author_avatar_url: string | null;
        club_id: string | null;
        club_name: string | null;
        club_slug: string | null;
        likes: number;
        comments: number;
      }>>`
        SELECT
          p.post_id,
          p.title,
          p.content_text,
          p.hidden_reason,
          p.hidden_at,
          p.deleted_at,
          p.created_at,
          u.user_id AS author_user_id,
          u.username AS author_username,
          u.email AS author_email,
          u.profile_photo_url AS author_avatar_url,
          c.club_id,
          c.name AS club_name,
          c.slug AS club_slug,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS likes,
          (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comments
        FROM posts p
        JOIN users u ON u.user_id = p.author_user_id
        LEFT JOIN clubs c ON c.club_id = p.club_id
        WHERE p.post_id = ${postId}
        LIMIT 1
      `,
      prisma.$queryRaw<Array<{ post_media_id: string; media_url: string; media_type: string; sort_order: number }>>`
        SELECT post_media_id, media_url, media_type::text, sort_order
        FROM post_media
        WHERE post_id = ${postId}
        ORDER BY sort_order ASC, created_at ASC
      `,
      prisma.$queryRaw<Array<{ report_id: string; reason: string; severity: string; status: string; created_at: Date }>>`
        SELECT report_id, reason, severity::text, status::text, created_at
        FROM admin_reports
        WHERE target_type = CAST('post' AS "AdminReportTargetType")
          AND target_id = ${postId}
        ORDER BY created_at DESC
        LIMIT 20
      `,
      prisma.$queryRaw<Array<{ audit_log_id: string; action_type: string; summary: string; severity: string; created_at: Date; actor: string; metadata: unknown }>>`
        SELECT l.audit_log_id, l.action_type, l.summary, l.severity::text, l.created_at, actor.username AS actor, l.metadata
        FROM admin_audit_logs l
        JOIN users actor ON actor.user_id = l.actor_user_id
        WHERE l.target_type = 'post' AND l.target_id = ${postId}
        ORDER BY l.created_at DESC
        LIMIT 20
      `,
    ]);

    const post = postRows[0];
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    return res.status(200).json({
      id: post.post_id,
      title: post.title,
      content: post.content_text,
      hiddenReason: post.hidden_reason,
      status: post.deleted_at ? 'deleted' : post.hidden_at ? 'hidden' : 'live',
      createdAt: post.created_at.toISOString(),
      author: {
        id: post.author_user_id,
        username: post.author_username,
        email: post.author_email,
        avatarUrl: post.author_avatar_url,
      },
      club: post.club_id && post.club_name ? { id: post.club_id, name: post.club_name, slug: post.club_slug } : null,
      engagement: {
        likes: post.likes,
        comments: post.comments,
        total: post.likes + post.comments,
      },
      media: mediaRows.map((media) => ({
        id: media.post_media_id,
        url: media.media_url,
        type: media.media_type,
        sortOrder: media.sort_order,
      })),
      linkedReports: reportRows.map((report) => ({
        id: report.report_id,
        reason: report.reason,
        severity: report.severity,
        status: report.status,
        createdAt: report.created_at.toISOString(),
      })),
      moderationHistory: historyRows.map((entry) => ({
        id: entry.audit_log_id,
        actionType: entry.action_type,
        actor: entry.actor,
        severity: entry.severity,
        summary: entry.summary,
        timestamp: entry.created_at.toISOString(),
        metadata: entry.metadata ?? {},
      })),
    });
  } catch (err) {
    console.error('Error loading admin post detail:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/posts/:postId/comments', async (req: Request<{ postId: string }>, res: Response) => {
  const { postId } = req.params;
  const parentCommentId = String(req.query.parentCommentId ?? '').trim() || null;
  const cursor = parseAdminCommentCursor(req.query.cursor);
  const limit = parsePositiveInt(req.query.limit, 20, 1, 100);

  try {
    const postRows = await prisma.$queryRaw<Array<{ post_id: string }>>`
      SELECT post_id
      FROM posts
      WHERE post_id = ${postId}
      LIMIT 1
    `;
    if (!postRows[0]) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const rows = await prisma.$queryRaw<Array<{
      comment_id: string;
      post_id: string;
      author_user_id: string;
      author_username: string;
      author_profile_photo_url: string | null;
      parent_comment_id: string | null;
      content: string;
      like_count: number;
      reply_count: number;
      created_at: Date;
      updated_at: Date;
    }>>`
      SELECT
        c.comment_id,
        c.post_id,
        c.author_user_id,
        u.username AS author_username,
        u.profile_photo_url AS author_profile_photo_url,
        c.parent_comment_id,
        c.content,
        (SELECT COUNT(*)::int FROM post_comment_likes pcl WHERE pcl.comment_id = c.comment_id) AS like_count,
        (SELECT COUNT(*)::int FROM post_comments replies WHERE replies.parent_comment_id = c.comment_id) AS reply_count,
        c.created_at,
        c.updated_at
      FROM post_comments c
      JOIN users u ON u.user_id = c.author_user_id
      WHERE c.post_id = ${postId}
        AND (
          (${parentCommentId}::uuid IS NULL AND c.parent_comment_id IS NULL)
          OR c.parent_comment_id = ${parentCommentId}
        )
        AND (${cursor}::timestamp IS NULL OR c.created_at > ${cursor})
      ORDER BY c.created_at ASC
      LIMIT ${limit + 1}
    `;

    const pageRows = rows.slice(0, limit);

    return res.status(200).json({
      comments: mapAdminFlatCommentRows(pageRows),
      nextCursor: rows.length > limit ? pageRows[pageRows.length - 1]?.created_at.toISOString() ?? null : null,
    });
  } catch (err) {
    console.error('Error loading admin post comments:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/:postId/actions', async (req: Request<{ postId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { postId } = req.params;
  const { action, note } = req.body as { action?: string; note?: string };
  const normalizedNote = note?.trim() || '';

  try {
    const postRows = await prisma.$queryRaw<Array<{ author_user_id: string; club_id: string | null }>>`
      SELECT author_user_id, club_id FROM posts WHERE post_id = ${postId} LIMIT 1
    `;
    const post = postRows[0];
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (action === 'hide') {
      if (!normalizedNote) {
        return res.status(400).json({ message: 'A moderation note is required to hide a post' });
      }
      await prisma.$queryRaw`
        UPDATE posts
        SET hidden_at = NOW(), hidden_reason = ${normalizedNote}, hidden_by_user_id = ${adminReq.auth!.userId}, updated_at = NOW()
        WHERE post_id = ${postId}
      `;
    } else if (action === 'unhide') {
      await prisma.$queryRaw`
        UPDATE posts
        SET hidden_at = NULL, hidden_reason = NULL, hidden_by_user_id = NULL, updated_at = NOW()
        WHERE post_id = ${postId}
      `;
    } else if (action === 'delete') {
      await prisma.$queryRaw`
        UPDATE posts
        SET deleted_at = NOW(), deleted_by_user_id = ${adminReq.auth!.userId}, updated_at = NOW()
        WHERE post_id = ${postId}
      `;
    } else if (action === 'restore') {
      await prisma.$queryRaw`
        UPDATE posts
        SET deleted_at = NULL, deleted_by_user_id = NULL, updated_at = NOW()
        WHERE post_id = ${postId}
      `;
    } else if (action === 'warn') {
      if (!normalizedNote) {
        return res.status(400).json({ message: 'A moderation note is required to warn an author' });
      }
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'post.warn_author',
        targetType: 'post',
        targetId: postId,
        severity: 'warning',
        summary: normalizedNote,
        metadata: { note: normalizedNote },
      });
      return res.status(200).json({ success: true });
    } else if (action === 'suspend_author') {
      await prisma.$queryRaw`
        UPDATE users
        SET suspended_until = NOW() + INTERVAL '7 day', updated_at = NOW()
        WHERE user_id = ${post.author_user_id}
      `;
    } else if (action === 'escalate') {
      if (!normalizedNote) {
        return res.status(400).json({ message: 'A moderation note is required to escalate a post' });
      }
      const reportRows = await prisma.$queryRaw<Array<{ report_id: string }>>`
        INSERT INTO admin_reports (
          reporter_user_id,
          target_type,
          target_id,
          target_user_id,
          reason,
          severity,
          status,
          report_count,
          assigned_admin_user_id,
          internal_notes
        )
        VALUES (
          ${adminReq.auth!.userId},
          CAST('post' AS "AdminReportTargetType"),
          ${postId},
          ${post.author_user_id},
          ${normalizedNote},
          CAST('critical' AS "AdminSeverity"),
          CAST('pending' AS "AdminReportStatus"),
          1,
          ${adminReq.auth!.userId},
          ${normalizedNote}
        )
        RETURNING report_id
      `;
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'post.escalate',
        targetType: 'post',
        targetId: postId,
        severity: 'critical',
        summary: 'Admin escalated post into a moderation report',
        metadata: { note: normalizedNote, reportId: reportRows[0]?.report_id ?? null },
      });
      await invalidateAdminPostCaches(postId, post.club_id);
      return res.status(200).json({ success: true, reportId: reportRows[0]?.report_id ?? null });
    } else {
      return res.status(400).json({ message: 'Unsupported action' });
    }

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: `post.${action}`,
      targetType: 'post',
      targetId: postId,
      severity: action === 'delete' ? 'critical' : 'warning',
      summary: `Admin performed ${action} on post`,
      metadata: normalizedNote ? { note: normalizedNote } : undefined,
    });

    await invalidateAdminPostCaches(postId, post.club_id);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error performing post action:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/comments/:commentId/actions', async (req: Request<{ commentId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { commentId } = req.params;
  const { action, note } = req.body as { action?: string; note?: string };
  const normalizedNote = note?.trim() || '';

  try {
    const commentRows = await prisma.$queryRaw<Array<{
      comment_id: string;
      post_id: string;
      parent_comment_id: string | null;
      author_user_id: string;
      club_id: string | null;
    }>>`
      SELECT
        c.comment_id,
        c.post_id,
        c.parent_comment_id,
        c.author_user_id,
        p.club_id
      FROM post_comments c
      JOIN posts p ON p.post_id = c.post_id
      WHERE c.comment_id = ${commentId}
      LIMIT 1
    `;
    const comment = commentRows[0];
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (action === 'delete') {
      await prisma.$queryRaw`
        DELETE FROM post_comments
        WHERE comment_id = ${commentId}
      `;
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'comment.delete',
        targetType: 'comment',
        targetId: commentId,
        severity: 'warning',
        summary: 'Admin deleted comment',
      });
      await reconcilePostEngagement(comment.post_id);
      if (!comment.parent_comment_id) {
        await invalidateRecentComments(comment.post_id);
      }
      await invalidateAdminPostCaches(comment.post_id, comment.club_id);
      return res.status(200).json({ success: true });
    }

    if (action === 'warn_author') {
      if (!normalizedNote) {
        return res.status(400).json({ message: 'A moderation note is required to warn a comment author' });
      }
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'comment.warn_author',
        targetType: 'comment',
        targetId: commentId,
        severity: 'warning',
        summary: normalizedNote,
        metadata: {
          note: normalizedNote,
          postId: comment.post_id,
          commentAuthorUserId: comment.author_user_id,
        },
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'suspend_author') {
      await prisma.$queryRaw`
        UPDATE users
        SET suspended_until = NOW() + INTERVAL '7 day', updated_at = NOW()
        WHERE user_id = ${comment.author_user_id}
      `;
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'comment.suspend_author',
        targetType: 'comment',
        targetId: commentId,
        severity: 'warning',
        summary: 'Admin suspended comment author',
        metadata: normalizedNote ? { note: normalizedNote, postId: comment.post_id } : { postId: comment.post_id },
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ message: 'Unsupported action' });
  } catch (err) {
    console.error('Error performing comment moderation action:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/reports', async (req: Request, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const query = String(req.query.q ?? '').trim();
  const status = parseAdminReportStatusFilter(req.query.status);
  const severity = parseAdminSeverityFilter(req.query.severity);
  const targetType = parseAdminReportTargetTypeFilter(req.query.targetType);
  const assignee = parseAdminReportAssigneeFilter(req.query.assignee);
  const from = parseAdminDateFilter(req.query.from);
  const to = parseAdminDateFilter(req.query.to, true);
  const page = parsePositiveInt(req.query.page, 1, 1, 10_000);
  const limit = parsePositiveInt(req.query.limit, 20, 1, 100);
  const offset = (page - 1) * limit;
  const searchPattern = `%${query}%`;

  const reportBaseSql = `
    FROM admin_reports r
    LEFT JOIN users reporter ON reporter.user_id = r.reporter_user_id
    LEFT JOIN users assignee_user ON assignee_user.user_id = r.assigned_admin_user_id
    LEFT JOIN users target_user ON target_user.user_id = r.target_user_id
    LEFT JOIN clubs target_club ON r.target_type = CAST('club' AS "AdminReportTargetType") AND target_club.club_id::text = r.target_id
    LEFT JOIN posts target_post ON r.target_type = CAST('post' AS "AdminReportTargetType") AND target_post.post_id::text = r.target_id
    WHERE
      ($1 = '' OR (
        COALESCE(reporter.username, 'System') ILIKE $2
        OR r.reason ILIKE $2
        OR COALESCE(r.evidence, '') ILIKE $2
        OR (
          CASE
            WHEN r.target_type = CAST('user' AS "AdminReportTargetType") THEN COALESCE(target_user.username, r.target_id)
            WHEN r.target_type = CAST('club' AS "AdminReportTargetType") THEN COALESCE(target_club.name, r.target_id)
            WHEN r.target_type = CAST('post' AS "AdminReportTargetType") THEN COALESCE(NULLIF(target_post.title, ''), NULLIF(LEFT(COALESCE(target_post.content_text, ''), 120), ''), r.target_id)
            WHEN r.target_type = CAST('comment' AS "AdminReportTargetType") THEN COALESCE(r.context_snapshot->>'content', r.target_id)
            WHEN r.target_type = CAST('message' AS "AdminReportTargetType") THEN COALESCE(r.context_snapshot->>'content', r.target_id)
            ELSE r.target_id
          END
        ) ILIKE $2
      ))
      AND ($3 = '' OR r.status::text = $3)
      AND ($4 = '' OR r.severity::text = $4)
      AND ($5 = '' OR r.target_type::text = $5)
      AND (
        $6 = 'all'
        OR ($6 = 'me' AND r.assigned_admin_user_id = $7)
        OR ($6 = 'unassigned' AND r.assigned_admin_user_id IS NULL)
      )
      AND ($8::timestamp IS NULL OR r.created_at >= $8::timestamp)
      AND ($9::timestamp IS NULL OR r.created_at <= $9::timestamp)
  `;

  try {
    type AdminReportListRow = {
      report_id: string;
      reporter: string | null;
      reporter_user_id: string | null;
      target_type: string;
      target_id: string;
      conversation_id: string | null;
      target_user_id: string | null;
      target_label: string;
      reason: string;
      evidence: string | null;
      report_count: number;
      severity: string;
      status: string;
      assigned_to: string | null;
      assigned_admin_user_id: string | null;
      internal_notes: string | null;
      created_at: Date;
      updated_at: Date;
      resolved_at: Date | null;
    };

    const listSql = `
      SELECT
        r.report_id,
        reporter.username AS reporter,
        r.reporter_user_id,
        r.target_type::text,
        r.target_id,
        r.conversation_id,
        r.target_user_id,
        CASE
          WHEN r.target_type = CAST('user' AS "AdminReportTargetType") THEN COALESCE(target_user.username, r.target_id)
          WHEN r.target_type = CAST('club' AS "AdminReportTargetType") THEN COALESCE(target_club.name, r.target_id)
          WHEN r.target_type = CAST('post' AS "AdminReportTargetType") THEN COALESCE(NULLIF(target_post.title, ''), NULLIF(LEFT(COALESCE(target_post.content_text, ''), 120), ''), r.target_id)
          WHEN r.target_type = CAST('comment' AS "AdminReportTargetType") THEN COALESCE(LEFT(r.context_snapshot->>'content', 120), r.target_id)
          WHEN r.target_type = CAST('message' AS "AdminReportTargetType") THEN COALESCE(LEFT(r.context_snapshot->>'content', 120), r.target_id)
          ELSE r.target_id
        END AS target_label,
        r.reason,
        r.evidence,
        r.report_count,
        r.severity::text,
        r.status::text,
        assignee_user.username AS assigned_to,
        r.assigned_admin_user_id,
        r.internal_notes,
        r.created_at,
        r.updated_at,
        r.resolved_at
      ${reportBaseSql}
      ORDER BY
        CASE r.status
          WHEN CAST('pending' AS "AdminReportStatus") THEN 0
          WHEN CAST('under_review' AS "AdminReportStatus") THEN 1
          ELSE 3
        END,
        r.created_at DESC,
        r.report_id DESC
      LIMIT $10
      OFFSET $11
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      ${reportBaseSql}
    `;

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRawUnsafe<AdminReportListRow[]>(
        listSql,
        query,
        searchPattern,
        status,
        severity,
        targetType,
        assignee,
        adminReq.auth!.userId,
        from,
        to,
        limit,
        offset,
      ),
      prisma.$queryRawUnsafe<Array<{ total: number }>>(
        countSql,
        query,
        searchPattern,
        status,
        severity,
        targetType,
        assignee,
        adminReq.auth!.userId,
        from,
        to,
      ),
    ]);

    const total = totalRows[0]?.total ?? 0;
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

    return res.status(200).json({
      items: rows.map((row) => ({
        id: row.report_id,
        reporter: row.reporter ?? 'System',
        reporterUserId: row.reporter_user_id,
        targetType: row.target_type,
        targetId: row.target_id,
        targetUserId: row.target_user_id,
        targetLabel: row.target_label,
        reason: row.reason,
        evidence: row.evidence,
        reportFrequency: row.report_count,
        severity: row.severity,
        status: row.status,
        assignedModerator: row.assigned_to,
        assignedAdminUserId: row.assigned_admin_user_id,
        internalNotes: row.internal_notes,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
      })),
      pageInfo: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error('Error loading reports:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/reports/:reportId', async (req: Request<{ reportId: string }>, res: Response) => {
  const { reportId } = req.params;

  try {
    const reportRows = await prisma.$queryRaw<Array<{
      report_id: string;
      reporter_user_id: string | null;
      reporter_username: string | null;
      reporter_email: string | null;
      reporter_avatar_url: string | null;
      target_type: string;
      target_id: string;
      conversation_id: string | null;
      target_user_id: string | null;
      reason: string;
      evidence: string | null;
      severity: string;
      status: string;
      report_count: number;
      assigned_admin_user_id: string | null;
      reviewed_by_user_id: string | null;
      reviewed_by_username: string | null;
      reviewed_by_email: string | null;
      reviewed_by_avatar_url: string | null;
      reviewed_at: Date | null;
      action_taken: string | null;
      context_snapshot: unknown;
      assigned_admin_username: string | null;
      assigned_admin_email: string | null;
      assigned_admin_avatar_url: string | null;
      internal_notes: string | null;
      created_at: Date;
      updated_at: Date;
      resolved_at: Date | null;
    }>>`
      SELECT
        r.report_id,
        r.reporter_user_id,
        reporter.username AS reporter_username,
        reporter.email AS reporter_email,
        reporter.profile_photo_url AS reporter_avatar_url,
        r.target_type::text,
        r.target_id,
        r.conversation_id,
        r.target_user_id,
        r.reason,
        r.evidence,
        r.severity::text,
        r.status::text,
        r.report_count,
        r.assigned_admin_user_id,
        r.reviewed_by_user_id,
        reviewer.username AS reviewed_by_username,
        reviewer.email AS reviewed_by_email,
        reviewer.profile_photo_url AS reviewed_by_avatar_url,
        r.reviewed_at,
        r.action_taken,
        r.context_snapshot,
        assignee_user.username AS assigned_admin_username,
        assignee_user.email AS assigned_admin_email,
        assignee_user.profile_photo_url AS assigned_admin_avatar_url,
        r.internal_notes,
        r.created_at,
        r.updated_at,
        r.resolved_at
      FROM admin_reports r
      LEFT JOIN users reporter ON reporter.user_id = r.reporter_user_id
      LEFT JOIN users assignee_user ON assignee_user.user_id = r.assigned_admin_user_id
      LEFT JOIN users reviewer ON reviewer.user_id = r.reviewed_by_user_id
      WHERE r.report_id = ${reportId}
      LIMIT 1
    `;

    const report = reportRows[0];
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const [noteRows, auditRows, submissionRows, userTargetRows, clubTargetRows, postTargetRows] = await Promise.all([
      prisma.$queryRaw<Array<{
        report_note_id: string;
        admin_user_id: string;
        admin_username: string;
        admin_email: string;
        admin_avatar_url: string | null;
        note: string;
        created_at: Date;
      }>>`
        SELECT
          n.report_note_id,
          n.admin_user_id,
          u.username AS admin_username,
          u.email AS admin_email,
          u.profile_photo_url AS admin_avatar_url,
          n.note,
          n.created_at
        FROM admin_report_notes n
        JOIN users u ON u.user_id = n.admin_user_id
        WHERE n.report_id = ${reportId}
        ORDER BY n.created_at DESC, n.report_note_id DESC
      `,
      prisma.$queryRaw<Array<{
        audit_log_id: string;
        action_type: string;
        summary: string;
        severity: string;
        created_at: Date;
        actor_user_id: string;
        actor_username: string;
        actor_email: string;
        actor_avatar_url: string | null;
        metadata: unknown;
      }>>`
        SELECT
          l.audit_log_id,
          l.action_type,
          l.summary,
          l.severity::text,
          l.created_at,
          actor.user_id AS actor_user_id,
          actor.username AS actor_username,
          actor.email AS actor_email,
          actor.profile_photo_url AS actor_avatar_url,
          l.metadata
        FROM admin_audit_logs l
        JOIN users actor ON actor.user_id = l.actor_user_id
        WHERE l.target_type = 'report' AND l.target_id = ${reportId}
        ORDER BY l.created_at DESC, l.audit_log_id DESC
      `,
      prisma.$queryRaw<Array<{
        report_submission_id: string;
        reporter_user_id: string;
        reporter_username: string;
        reporter_email: string;
        reporter_avatar_url: string | null;
        reason: string;
        description: string | null;
        created_at: Date;
      }>>`
        SELECT
          s.report_submission_id,
          s.reporter_user_id,
          reporter.username AS reporter_username,
          reporter.email AS reporter_email,
          reporter.profile_photo_url AS reporter_avatar_url,
          s.reason,
          s.description,
          s.created_at
        FROM report_submissions s
        JOIN users reporter ON reporter.user_id = s.reporter_user_id
        WHERE s.report_id = ${reportId}
        ORDER BY s.created_at DESC, s.report_submission_id DESC
      `,
      report.target_type === 'user' && report.target_user_id
        ? prisma.$queryRaw<Array<{
            user_id: string;
            username: string;
            email: string;
            profile_photo_url: string | null;
            is_banned: boolean;
            suspended_until: Date | null;
            verified_at: Date | null;
          }>>`
            SELECT user_id, username, email, profile_photo_url, is_banned, suspended_until, verified_at
            FROM users
            WHERE user_id = ${report.target_user_id}
            LIMIT 1
          `
        : Promise.resolve([]),
      report.target_type === 'club'
        ? prisma.$queryRaw<Array<{
            club_id: string;
            name: string;
            slug: string;
            avatar_url: string | null;
            is_verified: boolean;
            featured_at: Date | null;
            frozen_at: Date | null;
            deleted_at: Date | null;
            created_at: Date;
          }>>`
            SELECT club_id, name, slug, avatar_url, is_verified, featured_at, frozen_at, deleted_at, created_at
            FROM clubs
            WHERE club_id::text = ${report.target_id}
            LIMIT 1
          `
        : Promise.resolve([]),
      report.target_type === 'post'
        ? prisma.$queryRaw<Array<{
            post_id: string;
            title: string | null;
            content_text: string | null;
            created_at: Date;
            hidden_at: Date | null;
            deleted_at: Date | null;
            author_user_id: string;
            author_username: string;
            club_id: string | null;
            club_name: string | null;
          }>>`
            SELECT
              p.post_id,
              p.title,
              p.content_text,
              p.created_at,
              p.hidden_at,
              p.deleted_at,
              p.author_user_id,
              author.username AS author_username,
              p.club_id,
              c.name AS club_name
            FROM posts p
            JOIN users author ON author.user_id = p.author_user_id
            LEFT JOIN clubs c ON c.club_id = p.club_id
            WHERE p.post_id::text = ${report.target_id}
            LIMIT 1
          `
        : Promise.resolve([]),
    ]);

    const contextSnapshot = (report.context_snapshot ?? {}) as Record<string, unknown>;

    let targetPreview: Record<string, unknown> = {
      kind: report.target_type,
      id: report.target_id,
      label: report.target_id,
    };

    if (report.target_type === 'user') {
      const user = userTargetRows[0];
      targetPreview = user
        ? {
            kind: 'user',
            id: user.user_id,
            label: user.username,
            email: user.email,
            avatarUrl: user.profile_photo_url,
            status: user.is_banned ? 'banned' : user.suspended_until && user.suspended_until > new Date() ? 'suspended' : 'active',
            verified: Boolean(user.verified_at),
          }
        : { kind: 'user', id: report.target_user_id ?? report.target_id, label: report.target_id };
    } else if (report.target_type === 'club') {
      const club = clubTargetRows[0];
      targetPreview = club
        ? {
            kind: 'club',
            id: club.club_id,
            label: club.name,
            slug: club.slug,
            avatarUrl: club.avatar_url,
            verified: club.is_verified,
            status: club.deleted_at ? 'deleted' : club.frozen_at ? 'frozen' : club.featured_at ? 'featured' : 'active',
            createdAt: club.created_at.toISOString(),
          }
        : { kind: 'club', id: report.target_id, label: report.target_id };
    } else if (report.target_type === 'post') {
      const post = postTargetRows[0];
      targetPreview = post
        ? {
            kind: 'post',
            id: post.post_id,
            label: post.title || post.content_text || post.post_id,
            preview: post.content_text,
            authorUserId: post.author_user_id,
            authorUsername: post.author_username,
            clubId: post.club_id,
            clubName: post.club_name,
            status: post.deleted_at ? 'deleted' : post.hidden_at ? 'hidden' : 'live',
            createdAt: post.created_at.toISOString(),
          }
        : { kind: 'post', id: report.target_id, label: report.target_id };
    } else if (report.target_type === 'comment') {
      targetPreview = {
        kind: 'comment',
        id: report.target_id,
        label: String((contextSnapshot.content as string | undefined) ?? report.target_id),
        preview: (contextSnapshot.content as string | undefined) ?? null,
        post: (contextSnapshot.post as Record<string, unknown> | undefined) ?? null,
      };
    } else if (report.target_type === 'message') {
      targetPreview = {
        kind: 'message',
        id: report.target_id,
        label: String((contextSnapshot.content as string | undefined) ?? report.target_id),
        preview: (contextSnapshot.content as string | undefined) ?? null,
        conversationId: report.conversation_id,
        surroundingMessages: (contextSnapshot.surroundingMessages as unknown[] | undefined) ?? [],
      };
    }

    return res.status(200).json({
      id: report.report_id,
      reporter: report.reporter_user_id ? {
        id: report.reporter_user_id,
        username: report.reporter_username ?? 'Unknown user',
        email: report.reporter_email ?? '',
        avatarUrl: report.reporter_avatar_url,
      } : null,
      targetType: report.target_type,
      targetId: report.target_id,
      targetUserId: report.target_user_id,
      reason: report.reason,
      evidence: report.evidence,
      contextSnapshot,
      severity: report.severity,
      status: report.status,
      reportFrequency: report.report_count,
      reviewedBy: report.reviewed_by_user_id ? {
        id: report.reviewed_by_user_id,
        username: report.reviewed_by_username ?? 'Unknown admin',
        email: report.reviewed_by_email ?? '',
        avatarUrl: report.reviewed_by_avatar_url,
      } : null,
      reviewedAt: report.reviewed_at ? report.reviewed_at.toISOString() : null,
      actionTaken: report.action_taken,
      assignee: report.assigned_admin_user_id ? {
        id: report.assigned_admin_user_id,
        username: report.assigned_admin_username ?? 'Unknown admin',
        email: report.assigned_admin_email ?? '',
        avatarUrl: report.assigned_admin_avatar_url,
      } : null,
      internalNotes: report.internal_notes,
      createdAt: report.created_at.toISOString(),
      updatedAt: report.updated_at.toISOString(),
      resolvedAt: report.resolved_at ? report.resolved_at.toISOString() : null,
      targetPreview,
      submissions: submissionRows.map((submission) => ({
        id: submission.report_submission_id,
        reporter: {
          id: submission.reporter_user_id,
          username: submission.reporter_username,
          email: submission.reporter_email,
          avatarUrl: submission.reporter_avatar_url,
        },
        reason: submission.reason,
        description: submission.description,
        createdAt: submission.created_at.toISOString(),
      })),
      noteEntries: noteRows.map((note) => ({
        id: note.report_note_id,
        author: {
          id: note.admin_user_id,
          username: note.admin_username,
          email: note.admin_email,
          avatarUrl: note.admin_avatar_url,
        },
        note: note.note,
        createdAt: note.created_at.toISOString(),
      })),
      auditHistory: auditRows.map((entry) => ({
        id: entry.audit_log_id,
        actionType: entry.action_type,
        summary: entry.summary,
        severity: entry.severity,
        timestamp: entry.created_at.toISOString(),
        actor: {
          id: entry.actor_user_id,
          username: entry.actor_username,
          email: entry.actor_email,
          avatarUrl: entry.actor_avatar_url,
        },
        metadata: entry.metadata ?? {},
      })),
    });
  } catch (err) {
    console.error('Error loading report detail:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/reports/:reportId', async (req: Request<{ reportId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { reportId } = req.params;
  const { status, internalNotes, assignToMe, clearAssignee } = req.body as {
    status?: string;
    internalNotes?: string;
    assignToMe?: boolean;
    clearAssignee?: boolean;
  };

  try {
    await prisma.$queryRaw`
      UPDATE admin_reports
      SET
        status = CASE
          WHEN ${status ?? ''} = '' THEN status
          ELSE CAST(${status ?? 'pending'} AS "AdminReportStatus")
        END,
        internal_notes = CASE
          WHEN ${internalNotes === undefined} THEN internal_notes
          ELSE ${internalNotes?.trim() || null}
        END,
        assigned_admin_user_id = CASE
          WHEN ${clearAssignee ? true : false} THEN NULL
          WHEN ${assignToMe ? true : false} THEN ${adminReq.auth!.userId}
          ELSE assigned_admin_user_id
        END,
        resolved_at = CASE
          WHEN ${status === 'resolved' || status === 'dismissed'} THEN NOW()
          WHEN ${status === 'pending' || status === 'under_review'} THEN NULL
          ELSE resolved_at
        END,
        updated_at = NOW()
      WHERE report_id = ${reportId}
    `;

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: 'report.updated',
      targetType: 'report',
      targetId: reportId,
      severity: 'info',
      summary: 'Admin updated report ticket',
      metadata: {
        status,
        assignToMe: Boolean(assignToMe),
        clearAssignee: Boolean(clearAssignee),
        internalNotesUpdated: internalNotes !== undefined,
      },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating report:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reports/:reportId/actions', async (req: Request<{ reportId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { reportId } = req.params;
  const body = req.body as {
    action?: 'assign_to_me' | 'mark_under_review' | 'resolve' | 'dismiss' | 'warn_user' | 'suspend_user' | 'ban_user' | 'delete_content';
    reason?: string;
    durationDays?: number;
  };

  const action = String(body.action ?? '').trim();
  const reason = body.reason?.trim() || '';
  const durationDays = Math.min(365, Math.max(1, Number.isFinite(Number(body.durationDays)) ? Number(body.durationDays) : 7));

  if (!action) {
    return res.status(400).json({ message: 'Missing action' });
  }

  try {
    const reportRows = await prisma.$queryRaw<Array<{
      report_id: string;
      target_type: string;
      target_id: string;
      target_user_id: string | null;
      status: string;
    }>>`
      SELECT report_id, target_type::text, target_id, target_user_id, status::text
      FROM admin_reports
      WHERE report_id = ${reportId}
      LIMIT 1
    `;
    const report = reportRows[0];
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    if (action === 'assign_to_me' || action === 'mark_under_review') {
      await prisma.$queryRaw`
        UPDATE admin_reports
        SET
          status = CAST('under_review' AS "AdminReportStatus"),
          assigned_admin_user_id = ${adminReq.auth!.userId},
          updated_at = NOW()
        WHERE report_id = ${reportId}
      `;
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'report.under_review',
        targetType: 'report',
        targetId: reportId,
        summary: 'Report moved to under review',
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'dismiss') {
      await prisma.$queryRaw`
        UPDATE admin_reports
        SET
          status = CAST('dismissed' AS "AdminReportStatus"),
          reviewed_by_user_id = ${adminReq.auth!.userId},
          reviewed_at = NOW(),
          resolved_at = NOW(),
          action_taken = 'dismiss',
          updated_at = NOW()
        WHERE report_id = ${reportId}
      `;
      if (report.target_user_id) {
        const userExistsRows = await prisma.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM users WHERE user_id = ${report.target_user_id}`;
        if (userExistsRows.length > 0) {
          await applyModerationAction({
            adminUserId: adminReq.auth!.userId,
            targetUserId: report.target_user_id,
            reportId,
            actionType: 'dismiss',
            reason: reason || 'Report dismissed with no policy violation found.',
          });
        }
      }
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'report.dismissed',
        targetType: 'report',
        targetId: reportId,
        summary: reason || 'Report dismissed',
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'resolve') {
      await prisma.$queryRaw`
        UPDATE admin_reports
        SET
          status = CAST('resolved' AS "AdminReportStatus"),
          reviewed_by_user_id = ${adminReq.auth!.userId},
          reviewed_at = NOW(),
          resolved_at = NOW(),
          action_taken = COALESCE(action_taken, 'resolve'),
          updated_at = NOW()
        WHERE report_id = ${reportId}
      `;
      if (report.target_user_id) {
        const userExistsRows = await prisma.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM users WHERE user_id = ${report.target_user_id}`;
        if (userExistsRows.length > 0) {
          await applyModerationAction({
            adminUserId: adminReq.auth!.userId,
            targetUserId: report.target_user_id,
            reportId,
            actionType: 'resolve',
            reason: reason || 'Report resolved by moderation team.',
          });
        }
      }
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'report.resolved',
        targetType: 'report',
        targetId: reportId,
        summary: reason || 'Report resolved',
      });
      return res.status(200).json({ success: true });
    }

    if (!report.target_user_id && (action === 'warn_user' || action === 'suspend_user' || action === 'ban_user')) {
      return res.status(400).json({ message: 'This report does not have a target user to moderate.' });
    }

    if (action === 'warn_user' || action === 'suspend_user' || action === 'ban_user') {
      const userExistsRows = await prisma.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM users WHERE user_id = ${report.target_user_id!}`;
      if (userExistsRows.length === 0) {
        return res.status(404).json({ message: 'Target user no longer exists.' });
      }

      const actionType = action === 'warn_user' ? 'warn' : action === 'suspend_user' ? 'suspend' : 'ban';
      await applyModerationAction({
        adminUserId: adminReq.auth!.userId,
        targetUserId: report.target_user_id!,
        reportId,
        actionType,
        reason: reason || 'Action taken by moderation team.',
        durationDays: actionType === 'suspend' ? durationDays : undefined,
      });
      await prisma.$queryRaw`
        UPDATE admin_reports
        SET
          status = CAST('resolved' AS "AdminReportStatus"),
          reviewed_by_user_id = ${adminReq.auth!.userId},
          reviewed_at = NOW(),
          resolved_at = NOW(),
          action_taken = ${actionType},
          updated_at = NOW()
        WHERE report_id = ${reportId}
      `;
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: `report.${actionType}`,
        targetType: 'report',
        targetId: reportId,
        severity: actionType === 'ban' ? 'critical' : 'warning',
        summary: reason || `Report ${actionType}`,
        metadata: actionType === 'suspend' ? { durationDays } : undefined,
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'delete_content') {
      if (report.target_type === 'post') {
        await prisma.$queryRaw`
          UPDATE posts
          SET deleted_at = NOW(), deleted_by_user_id = ${adminReq.auth!.userId}, updated_at = NOW()
          WHERE post_id::text = ${report.target_id}
        `;
      } else if (report.target_type === 'comment') {
        await prisma.$queryRaw`
          DELETE FROM post_comments
          WHERE comment_id::text = ${report.target_id}
        `;
      } else if (report.target_type === 'message') {
        await prisma.$queryRaw`
          UPDATE messages
          SET deleted_at = NOW()
          WHERE message_id::text = ${report.target_id}
        `;
      } else {
        return res.status(400).json({ message: 'Delete content is not supported for this target type.' });
      }

      if (report.target_user_id) {
        const userExistsRows = await prisma.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM users WHERE user_id = ${report.target_user_id}`;
        if (userExistsRows.length > 0) {
          await applyModerationAction({
            adminUserId: adminReq.auth!.userId,
            targetUserId: report.target_user_id,
            reportId,
            actionType: report.target_type === 'post' ? 'delete_post' : report.target_type === 'comment' ? 'delete_comment' : 'delete_message',
            reason: reason || 'Reported content removed by moderation.',
          });
        }
      }

      await prisma.$queryRaw`
        UPDATE admin_reports
        SET
          status = CAST('resolved' AS "AdminReportStatus"),
          reviewed_by_user_id = ${adminReq.auth!.userId},
          reviewed_at = NOW(),
          resolved_at = NOW(),
          action_taken = 'delete_content',
          updated_at = NOW()
        WHERE report_id = ${reportId}
      `;
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'report.delete_content',
        targetType: 'report',
        targetId: reportId,
        severity: 'warning',
        summary: reason || 'Reported content deleted',
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ message: 'Unsupported report action' });
  } catch (err) {
    console.error('Error applying report action:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reports/:reportId/notes', async (req: Request<{ reportId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { reportId } = req.params;
  const { note } = req.body as { note?: string };

  if (!note?.trim()) {
    return res.status(400).json({ message: 'Note is required' });
  }

  try {
    await prisma.$queryRaw`
      INSERT INTO admin_report_notes (report_id, admin_user_id, note)
      VALUES (${reportId}, ${adminReq.auth!.userId}, ${note.trim()})
    `;

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: 'report.note_added',
      targetType: 'report',
      targetId: reportId,
      severity: 'info',
      summary: 'Admin added report note',
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error adding report note:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/verification-requests', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        verification_request_id: string;
        request_type: string;
        target_user_id: string | null;
        target_club_id: string | null;
        document_urls: unknown;
        profile_preview: unknown;
        notes: string | null;
        decision_note: string | null;
        status: string;
        requested_at: Date;
        reviewed_at: Date | null;
        reviewed_by_user_id: string | null;
        reviewer_username: string | null;
        reviewer_email: string | null;
        target_username: string | null;
        target_email: string | null;
        target_profile_photo_url: string | null;
        target_verification_state: string | null;
        target_verified_at: Date | null;
        target_club_name: string | null;
        target_club_slug: string | null;
        target_club_avatar_url: string | null;
        target_club_verified: boolean | null;
      }>
    >`
      SELECT
        avr.verification_request_id,
        avr.request_type::text,
        avr.target_user_id,
        avr.target_club_id,
        avr.document_urls,
        avr.profile_preview,
        avr.notes,
        avr.decision_note,
        avr.status::text,
        avr.requested_at,
        avr.reviewed_at,
        avr.reviewed_by_user_id,
        reviewer.username AS reviewer_username,
        reviewer.email AS reviewer_email,
        target_user.username AS target_username,
        target_user.email AS target_email,
        target_user.profile_photo_url AS target_profile_photo_url,
        target_user.verification_state::text AS target_verification_state,
        target_user.verified_at AS target_verified_at,
        target_club.name AS target_club_name,
        target_club.slug AS target_club_slug,
        target_club.avatar_url AS target_club_avatar_url,
        target_club.is_verified AS target_club_verified
      FROM admin_verification_requests avr
      LEFT JOIN users reviewer ON reviewer.user_id = avr.reviewed_by_user_id
      LEFT JOIN users target_user ON target_user.user_id = avr.target_user_id
      LEFT JOIN clubs target_club ON target_club.club_id = avr.target_club_id
      ORDER BY requested_at DESC
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.verification_request_id,
      type: row.request_type,
      targetUserId: row.target_user_id,
      targetClubId: row.target_club_id,
      documentUrls: Array.isArray(row.document_urls) ? row.document_urls : [],
      profilePreview: row.profile_preview && typeof row.profile_preview === 'object' ? row.profile_preview : null,
      notes: row.notes,
      decisionNote: row.decision_note,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
      reviewedBy: row.reviewed_by_user_id ? {
        id: row.reviewed_by_user_id,
        username: row.reviewer_username ?? 'Unknown admin',
        email: row.reviewer_email ?? '',
      } : null,
      verificationState: row.target_verification_state,
      targetSummary: row.target_user_id ? {
        kind: 'user',
        id: row.target_user_id,
        label: row.target_username ?? row.target_email ?? row.target_user_id,
        email: row.target_email,
        avatarUrl: row.target_profile_photo_url,
        verificationState: row.target_verification_state,
        verified: Boolean(row.target_verified_at),
      } : row.target_club_id ? {
        kind: 'club',
        id: row.target_club_id,
        label: row.target_club_name ?? row.target_club_id,
        slug: row.target_club_slug,
        avatarUrl: row.target_club_avatar_url,
        verified: Boolean(row.target_club_verified),
      } : null,
    })));
  } catch (err) {
    console.error('Error loading verification requests:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/verification-requests/:requestId', async (req: Request<{ requestId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { requestId } = req.params;
  const { status, decisionNote, notes } = req.body as { status?: string; decisionNote?: string; notes?: string };

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    const verificationEmailTarget = await prisma.$transaction(async (tx) => {
      let emailTarget: null | {
      userId: string;
      email: string;
      displayName: string | null;
      requestType: 'student' | 'alumni' | 'club';
      } = null;

      await tx.$queryRaw`
        UPDATE admin_verification_requests
        SET
          status = CAST(${status} AS "VerificationRequestStatus"),
          decision_note = CASE
            WHEN ${decisionNote === undefined && notes === undefined} THEN decision_note
            ELSE ${(decisionNote ?? notes)?.trim() || null}
          END,
          reviewed_at = NOW(),
          reviewed_by_user_id = ${adminReq.auth!.userId}
        WHERE verification_request_id = ${requestId}
      `;

      const targets = await tx.$queryRaw<Array<{ target_user_id: string | null; target_club_id: string | null; request_type: 'student' | 'alumni' | 'club' }>>`
        SELECT target_user_id, target_club_id, request_type::text
        FROM admin_verification_requests
        WHERE verification_request_id = ${requestId}
        LIMIT 1
      `;
      const target = targets[0];
      if (target && status === 'approved') {
        if (target.target_user_id) {
          const verificationState =
            target.request_type === 'alumni'
              ? 'alumni_verified'
              : 'student_google_verified';
          await tx.$queryRaw`
            UPDATE users
            SET verified_at = NOW(),
                verification_state = CAST(${verificationState} AS "UserVerificationState"),
                updated_at = NOW()
            WHERE user_id = ${target.target_user_id}
          `;
          await invalidateUserCache(target.target_user_id);
        }
        if (target.target_club_id) {
          await tx.$queryRaw`UPDATE clubs SET is_verified = TRUE, updated_at = NOW() WHERE club_id = ${target.target_club_id}`;
        }
      } else if (target?.target_user_id && target.request_type === 'alumni') {
        if (status === 'rejected') {
          await tx.$queryRaw`
            UPDATE users
            SET verified_at = NULL,
                verification_state = 'alumni_rejected'::"UserVerificationState",
                updated_at = NOW()
            WHERE user_id = ${target.target_user_id}
          `;
          await invalidateUserCache(target.target_user_id);
        } else if (status === 'more_info') {
          await tx.$queryRaw`
            UPDATE users
            SET verified_at = NULL,
                verification_state = 'alumni_pending_review'::"UserVerificationState",
                updated_at = NOW()
            WHERE user_id = ${target.target_user_id}
          `;
          await invalidateUserCache(target.target_user_id);
        }
      }

      if (target?.target_user_id && (status === 'approved' || status === 'rejected' || status === 'more_info')) {
        const rows = await tx.$queryRaw<Array<{
          user_id: string;
          email: string;
          display_name: string | null;
          request_type: 'student' | 'alumni' | 'club';
        }>>`
          SELECT
            u.user_id,
            u.email,
            u.display_name,
            avr.request_type::text AS request_type
          FROM admin_verification_requests avr
          JOIN users u ON u.user_id = avr.target_user_id
          WHERE avr.verification_request_id = ${requestId}
          LIMIT 1
        `;
        emailTarget = rows[0]
          ? {
            userId: rows[0].user_id,
            email: rows[0].email,
            displayName: rows[0].display_name,
            requestType: rows[0].request_type,
          }
          : null;
      }

      return emailTarget;
    });

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: 'verification.updated',
      targetType: 'verification',
      targetId: requestId,
      severity: status === 'rejected' ? 'warning' : 'info',
      summary: `Verification request marked ${status}`,
    });

    if (verificationEmailTarget && (status === 'approved' || status === 'rejected' || status === 'more_info')) {
      const clientBaseUrl = getClientBaseUrl();
      const approvedUrl =
        `${clientBaseUrl}/?authFlow=login&verificationStatus=approved&email=${encodeURIComponent(verificationEmailTarget.email)}`;
      const moreInfoToken = signVerificationActionToken({
        userId: verificationEmailTarget.userId,
        email: verificationEmailTarget.email,
        requestId,
        status: 'more_info',
      });
      const moreInfoUrl =
        `${clientBaseUrl}/?authFlow=resubmit&verificationToken=${encodeURIComponent(moreInfoToken)}`;

      try {
        await sendVerificationDecisionEmail({
          email: verificationEmailTarget.email,
          displayName: verificationEmailTarget.displayName,
          status,
          decisionNote: (decisionNote ?? notes)?.trim() || null,
          actionUrl: status === 'approved' ? approvedUrl : status === 'more_info' ? moreInfoUrl : null,
        });
      } catch (emailError) {
        console.error('Error sending verification decision email:', emailError);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating verification request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/analytics', async (req: Request, res: Response) => {
  const range = parseDashboardRange(req.query.range);
  const segment = parseAdminAnalyticsSegment(req.query.segment);

  if (!range) {
    return res.status(400).json({ message: 'Invalid analytics range' });
  }

  const dayCount = DASHBOARD_RANGE_DAYS[range];
  const segmentSql = segment === 'students'
    ? "u.user_type = CAST('student' AS \"UserType\")"
    : segment === 'alumni'
      ? "u.user_type = CAST('alumni' AS \"UserType\")"
      : 'TRUE';

  try {
    const [summaryRows, userGrowth, engagement, activeDepartments, topClubs, contentPerformance, deviceBreakdown, retentionRows, trendingHashtags] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{
        dau: number;
        wau: number;
        mau: number;
        new_users: number;
        posts_created: number;
        comments_created: number;
        likes_created: number;
        active_clubs: number;
      }>>(`
        WITH scoped_users AS (
          SELECT u.user_id
          FROM users u
          WHERE ${segmentSql}
        )
        SELECT
          (SELECT COUNT(DISTINCT s.user_id)::int FROM user_sessions s JOIN scoped_users su ON su.user_id = s.user_id WHERE COALESCE(s.last_seen_at, s.created_at) >= NOW() - INTERVAL '1 day' AND s.revoked_at IS NULL) AS dau,
          (SELECT COUNT(DISTINCT s.user_id)::int FROM user_sessions s JOIN scoped_users su ON su.user_id = s.user_id WHERE COALESCE(s.last_seen_at, s.created_at) >= NOW() - INTERVAL '7 day' AND s.revoked_at IS NULL) AS wau,
          (SELECT COUNT(DISTINCT s.user_id)::int FROM user_sessions s JOIN scoped_users su ON su.user_id = s.user_id WHERE COALESCE(s.last_seen_at, s.created_at) >= NOW() - INTERVAL '30 day' AND s.revoked_at IS NULL) AS mau,
          (SELECT COUNT(*)::int FROM users u WHERE ${segmentSql} AND u.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day') AS new_users,
          (SELECT COUNT(*)::int FROM posts p JOIN users u ON u.user_id = p.author_user_id WHERE ${segmentSql} AND p.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day' AND p.deleted_at IS NULL) AS posts_created,
          (SELECT COUNT(*)::int FROM post_comments c JOIN users u ON u.user_id = c.author_user_id WHERE ${segmentSql} AND c.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day') AS comments_created,
          (SELECT COUNT(*)::int FROM post_likes pl JOIN users u ON u.user_id = pl.user_id WHERE ${segmentSql} AND pl.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day') AS likes_created,
          (SELECT COUNT(DISTINCT p.club_id)::int FROM posts p JOIN users u ON u.user_id = p.author_user_id WHERE ${segmentSql} AND p.club_id IS NOT NULL AND p.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day' AND p.deleted_at IS NULL) AS active_clubs
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(u.user_id)::int AS value
        FROM generate_series(CURRENT_DATE - INTERVAL '${dayCount - 1} day', CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN users u ON DATE_TRUNC('day', u.created_at) = day_bucket AND ${segmentSql}
        GROUP BY day_bucket
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; posts: number; comments: number; likes: number }>>(`
        SELECT
          TO_CHAR(day_bucket, 'Mon DD') AS label,
          COALESCE(posts.value, 0)::int AS posts,
          COALESCE(comments.value, 0)::int AS comments,
          COALESCE(likes.value, 0)::int AS likes
        FROM generate_series(CURRENT_DATE - INTERVAL '${dayCount - 1} day', CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS value
          FROM posts p
          JOIN users u ON u.user_id = p.author_user_id
          WHERE ${segmentSql} AND DATE_TRUNC('day', p.created_at) = day_bucket AND p.deleted_at IS NULL
        ) posts ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS value
          FROM post_comments c
          JOIN users u ON u.user_id = c.author_user_id
          WHERE ${segmentSql} AND DATE_TRUNC('day', c.created_at) = day_bucket
        ) comments ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS value
          FROM post_likes pl
          JOIN users u ON u.user_id = pl.user_id
          WHERE ${segmentSql} AND DATE_TRUNC('day', pl.created_at) = day_bucket
        ) likes ON TRUE
        ORDER BY day_bucket
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT COALESCE(sp.branch, ap.branch, 'Unknown') AS label, COUNT(*)::int AS value
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
        LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
        WHERE ${segmentSql}
        GROUP BY label
        ORDER BY value DESC, label ASC
        LIMIT 8
      `),
      prisma.$queryRawUnsafe<Array<{
        club_id: string;
        label: string;
        posts: number;
        comments: number;
        likes: number;
        engagement: number;
      }>>(`
        SELECT
          c.club_id,
          c.name AS label,
          COUNT(DISTINCT p.post_id)::int AS posts,
          COUNT(DISTINCT pc.comment_id)::int AS comments,
          COUNT(DISTINCT pl.user_id || ':' || pl.post_id)::int AS likes,
          (COUNT(DISTINCT pc.comment_id) + COUNT(DISTINCT pl.user_id || ':' || pl.post_id))::int AS engagement
        FROM clubs c
        JOIN posts p ON p.club_id = c.club_id AND p.deleted_at IS NULL AND p.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day'
        JOIN users u ON u.user_id = p.author_user_id
        LEFT JOIN post_comments pc ON pc.post_id = p.post_id AND pc.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day'
        LEFT JOIN post_likes pl ON pl.post_id = p.post_id AND pl.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day'
        WHERE c.deleted_at IS NULL AND ${segmentSql}
        GROUP BY c.club_id, c.name
        ORDER BY engagement DESC, likes DESC, comments DESC, c.name ASC
        LIMIT 6
      `),
      prisma.$queryRawUnsafe<Array<{
        post_id: string;
        title: string | null;
        preview: string | null;
        author_username: string;
        created_at: Date;
        likes: number;
        comments: number;
        engagement: number;
      }>>(`
        SELECT
          p.post_id,
          p.title,
          LEFT(COALESCE(p.content_text, ''), 160) AS preview,
          u.username AS author_username,
          p.created_at,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day') AS likes,
          (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id AND pc.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day') AS comments,
          (
            (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day')
            + (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id AND pc.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day')
          ) AS engagement
        FROM posts p
        JOIN users u ON u.user_id = p.author_user_id
        WHERE ${segmentSql} AND p.deleted_at IS NULL AND p.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day'
        ORDER BY engagement DESC, p.created_at DESC
        LIMIT 8
      `),
      prisma.$queryRawUnsafe<Array<{ label: string; value: number }>>(`
        SELECT COALESCE(NULLIF(platform, ''), NULLIF(device_name, ''), 'Unknown') AS label, COUNT(*)::int AS value
        FROM user_sessions s
        JOIN users u ON u.user_id = s.user_id
        WHERE ${segmentSql} AND COALESCE(s.last_seen_at, s.created_at) >= CURRENT_DATE - INTERVAL '${dayCount - 1} day' AND s.revoked_at IS NULL
        GROUP BY label
        ORDER BY value DESC, label ASC
        LIMIT 8
      `),
      prisma.$queryRawUnsafe<Array<{
        cohort_label: string;
        cohort_size: number;
        week1_retained: number;
        week4_retained: number;
      }>>(`
        WITH cohorts AS (
          SELECT
            DATE_TRUNC('week', u.created_at) AS cohort_week,
            u.user_id,
            u.created_at
          FROM users u
          WHERE ${segmentSql} AND u.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day'
        )
        SELECT
          TO_CHAR(cohort_week, 'Mon DD') AS cohort_label,
          COUNT(*)::int AS cohort_size,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM user_sessions s
              WHERE s.user_id = c.user_id
                AND s.revoked_at IS NULL
                AND COALESCE(s.last_seen_at, s.created_at) >= c.created_at + INTERVAL '7 day'
            )
          )::int AS week1_retained,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM user_sessions s
              WHERE s.user_id = c.user_id
                AND s.revoked_at IS NULL
                AND COALESCE(s.last_seen_at, s.created_at) >= c.created_at + INTERVAL '28 day'
            )
          )::int AS week4_retained
        FROM cohorts c
        GROUP BY cohort_week
        ORDER BY cohort_week DESC
        LIMIT 8
      `),
      (async () => {
        const cached = await getTrendingHashtagsForApi(6);
        if (cached.length > 0) {
          return cached.map((item) => ({
            tag: item.tag,
            postCount: item.post_count,
            label: item.label,
          }));
        }
        const fallbackRows = await prisma.$queryRawUnsafe<Array<{ tag: string; post_count: number }>>(`
          SELECT h.tag_name AS tag, COUNT(ph.post_id)::int AS post_count
          FROM hashtags h
          JOIN post_hashtags ph ON ph.hashtag_id = h.hashtag_id
          JOIN posts p ON p.post_id = ph.post_id
          JOIN users u ON u.user_id = p.author_user_id
          WHERE ${segmentSql}
            AND p.deleted_at IS NULL
            AND p.created_at >= CURRENT_DATE - INTERVAL '${dayCount - 1} day'
          GROUP BY h.tag_name
          ORDER BY post_count DESC, h.tag_name ASC
          LIMIT 8
        `);
        return fallbackRows.map((item) => ({
          tag: item.tag,
          postCount: item.post_count,
          label: 'ranked' as const,
        }));
      })(),
    ]);

    const summary = summaryRows[0] ?? {
      dau: 0,
      wau: 0,
      mau: 0,
      new_users: 0,
      posts_created: 0,
      comments_created: 0,
      likes_created: 0,
      active_clubs: 0,
    };

    return res.status(200).json({
      range,
      segment,
      generatedAt: new Date().toISOString(),
      summary: [
        { key: 'dau', label: 'Daily Active Users', value: summary.dau },
        { key: 'wau', label: 'Weekly Active Users', value: summary.wau },
        { key: 'mau', label: 'Monthly Active Users', value: summary.mau },
        { key: 'newUsers', label: 'New users', value: summary.new_users },
        { key: 'postsCreated', label: 'Posts', value: summary.posts_created },
        { key: 'commentsCreated', label: 'Comments', value: summary.comments_created },
        { key: 'likesCreated', label: 'Likes', value: summary.likes_created },
        { key: 'activeClubs', label: 'Active clubs', value: summary.active_clubs },
      ],
      userGrowth,
      engagement: engagement.map((row) => ({
        label: row.label,
        posts: row.posts,
        comments: row.comments,
        likes: row.likes,
      })),
      retention: retentionRows.map((row) => ({
        cohortLabel: row.cohort_label,
        cohortSize: row.cohort_size,
        week1Rate: row.cohort_size > 0 ? Math.round((row.week1_retained / row.cohort_size) * 1000) / 10 : null,
        week4Rate: row.cohort_size > 0 && dayCount >= 30 ? Math.round((row.week4_retained / row.cohort_size) * 1000) / 10 : null,
      })),
      activeDepartments,
      topClubs: topClubs.map((row) => ({
        id: row.club_id,
        label: row.label,
        engagement: row.engagement,
        posts: row.posts,
        comments: row.comments,
        likes: row.likes,
      })),
      contentPerformance: contentPerformance.map((row) => ({
        id: row.post_id,
        title: row.title || 'Untitled post',
        subtitle: row.preview || `By ${row.author_username}`,
        engagement: row.engagement,
        likes: row.likes,
        comments: row.comments,
        createdAt: row.created_at.toISOString(),
      })),
      trendingHashtags,
      deviceBreakdown,
    });
  } catch (err) {
    console.error('Error loading analytics:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/announcements/options', async (_req: Request, res: Response) => {
  try {
    const [clubs, branches] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; label: string }>>`
        SELECT club_id::text AS id, name AS label
        FROM clubs
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      `,
      prisma.$queryRaw<Array<{ id: string; label: string }>>`
        SELECT DISTINCT COALESCE(sp.branch, ap.branch, 'Unknown') AS id, COALESCE(sp.branch, ap.branch, 'Unknown') AS label
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
        LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
        ORDER BY label ASC
      `,
    ]);

    return res.status(200).json({ clubs, branches });
  } catch (err) {
    console.error('Error loading announcement options:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/announcements/preview', async (req: Request, res: Response) => {
  const { audienceType, audienceIds } = req.body as { audienceType?: string; audienceIds?: string[] };
  const normalizedAudienceType = parseAnnouncementAudienceType(audienceType);
  if (!normalizedAudienceType) {
    return res.status(400).json({ message: 'Invalid audienceType' });
  }

  try {
    const recipientCount = await getAnnouncementRecipientCount(normalizedAudienceType, normalizeAnnouncementAudienceIds(audienceIds));
    return res.status(200).json({ recipientCount });
  } catch (err) {
    console.error('Error previewing announcement recipients:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/announcements', async (req: Request, res: Response) => {
  const status = String(req.query.status ?? '').trim().toLowerCase();
  const pinned = parseAdminBooleanFilter(req.query.pinned);
  const pushEnabled = parseAdminBooleanFilter(req.query.pushEnabled);

  try {
    const rows = await prisma.$queryRaw<Array<{
      announcement_id: string;
      title: string;
      content: string;
      audience_type: string;
      audience_ids: unknown;
      status: string;
      pinned: boolean;
      push_enabled: boolean;
      scheduled_for: Date | null;
      created_at: Date;
      updated_at: Date;
      created_by_user_id: string;
      creator_username: string;
      creator_email: string;
    }>>`
      SELECT
        a.announcement_id,
        a.title,
        a.content,
        a.audience_type,
        a.audience_ids,
        a.status::text,
        a.pinned,
        a.push_enabled,
        a.scheduled_for,
        a.created_at,
        a.updated_at,
        a.created_by_user_id,
        u.username AS creator_username,
        u.email AS creator_email
      FROM admin_announcements a
      JOIN users u ON u.user_id = a.created_by_user_id
      WHERE
        (${status} = '' OR a.status::text = ${status})
        AND (${pinned} = '' OR (${pinned} = 'true' AND a.pinned = TRUE) OR (${pinned} = 'false' AND a.pinned = FALSE))
        AND (${pushEnabled} = '' OR (${pushEnabled} = 'true' AND a.push_enabled = TRUE) OR (${pushEnabled} = 'false' AND a.push_enabled = FALSE))
      ORDER BY a.created_at DESC
    `;

    const items = await Promise.all(rows.map(async (row) => {
      const audienceType = parseAnnouncementAudienceType(row.audience_type) ?? 'all_users';
      const audienceIds = Array.isArray(row.audience_ids) ? row.audience_ids.map((item) => String(item)) : [];
      const recipientCount = await getAnnouncementRecipientCount(audienceType, audienceIds);
      return {
        id: row.announcement_id,
        title: row.title,
        content: row.content,
        audienceType,
        audienceIds,
        status: row.status,
        pinned: row.pinned,
        pushEnabled: row.push_enabled,
        scheduledFor: row.scheduled_for ? row.scheduled_for.toISOString() : null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        publishedAt: row.status === 'published' ? row.updated_at.toISOString() : null,
        recipientCount,
        createdBy: {
          id: row.created_by_user_id,
          username: row.creator_username,
          email: row.creator_email,
        },
      };
    }));

    return res.status(200).json(items);
  } catch (err) {
    console.error('Error loading announcements:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/announcements/:announcementId', async (req: Request<{ announcementId: string }>, res: Response) => {
  const { announcementId } = req.params;

  try {
    const rows = await prisma.$queryRaw<Array<{
      announcement_id: string;
      title: string;
      content: string;
      audience_type: string;
      audience_ids: unknown;
      status: string;
      pinned: boolean;
      push_enabled: boolean;
      scheduled_for: Date | null;
      created_at: Date;
      updated_at: Date;
      created_by_user_id: string;
      creator_username: string;
      creator_email: string;
    }>>`
      SELECT
        a.announcement_id,
        a.title,
        a.content,
        a.audience_type,
        a.audience_ids,
        a.status::text,
        a.pinned,
        a.push_enabled,
        a.scheduled_for,
        a.created_at,
        a.updated_at,
        a.created_by_user_id,
        u.username AS creator_username,
        u.email AS creator_email
      FROM admin_announcements a
      JOIN users u ON u.user_id = a.created_by_user_id
      WHERE a.announcement_id = ${announcementId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Announcement not found' });
    const audienceType = parseAnnouncementAudienceType(row.audience_type) ?? 'all_users';
    const audienceIds = Array.isArray(row.audience_ids) ? row.audience_ids.map((item) => String(item)) : [];
    const recipientCount = await getAnnouncementRecipientCount(audienceType, audienceIds);

    return res.status(200).json({
      id: row.announcement_id,
      title: row.title,
      content: row.content,
      audienceType,
      audienceIds,
      status: row.status,
      pinned: row.pinned,
      pushEnabled: row.push_enabled,
      scheduledFor: row.scheduled_for ? row.scheduled_for.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      publishedAt: row.status === 'published' ? row.updated_at.toISOString() : null,
      recipientCount,
      createdBy: {
        id: row.created_by_user_id,
        username: row.creator_username,
        email: row.creator_email,
      },
    });
  } catch (err) {
    console.error('Error loading announcement detail:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/announcements', async (req: Request, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { title, content, audienceType, audienceIds, scheduledFor, pinned, pushEnabled } = req.body as {
    title?: string;
    content?: string;
    audienceType?: string;
    audienceIds?: string[];
    scheduledFor?: string | null;
    pinned?: boolean;
    pushEnabled?: boolean;
  };

  const normalizedAudienceType = parseAnnouncementAudienceType(audienceType);
  const normalizedAudienceIds = normalizeAnnouncementAudienceIds(audienceIds);

  if (!title?.trim() || !content?.trim() || !normalizedAudienceType) {
    return res.status(400).json({ message: 'Title, content, and audienceType are required' });
  }

  try {
    const isScheduled = Boolean(scheduledFor && new Date(scheduledFor).getTime() > Date.now());
    await prisma.$queryRaw`
      INSERT INTO admin_announcements (
        title,
        content,
        audience_type,
        audience_ids,
        scheduled_for,
        pinned,
        push_enabled,
        status,
        created_by_user_id
      )
      VALUES (
        ${title.trim()},
        ${content.trim()},
        ${normalizedAudienceType},
        ${JSON.stringify(normalizedAudienceIds)}::jsonb,
        ${scheduledFor ? new Date(scheduledFor) : null},
        ${Boolean(pinned)},
        ${Boolean(pushEnabled)},
        CAST(${isScheduled ? 'scheduled' : 'published'} AS "AnnouncementStatus"),
        ${adminReq.auth!.userId}
      )
    `;

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: 'announcement.created',
      targetType: 'announcement',
      severity: 'info',
      summary: `Announcement created: ${title.trim()}`,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error creating announcement:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/announcements/:announcementId', async (req: Request<{ announcementId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { announcementId } = req.params;
  const { title, content, audienceType, audienceIds, scheduledFor, pinned, pushEnabled, action } = req.body as {
    title?: string;
    content?: string;
    audienceType?: string;
    audienceIds?: string[];
    scheduledFor?: string | null;
    pinned?: boolean;
    pushEnabled?: boolean;
    action?: string;
  };

  const lifecycleAction = parseAnnouncementLifecycleAction(action);
  const normalizedAudienceType = audienceType === undefined ? undefined : parseAnnouncementAudienceType(audienceType);
  if (audienceType !== undefined && !normalizedAudienceType) {
    return res.status(400).json({ message: 'Invalid audienceType' });
  }
  const normalizedAudienceIds = audienceIds === undefined ? undefined : normalizeAnnouncementAudienceIds(audienceIds);
  const hasScheduledFor = Object.prototype.hasOwnProperty.call(req.body, 'scheduledFor');
  const hasPinned = Object.prototype.hasOwnProperty.call(req.body, 'pinned');
  const hasPushEnabled = Object.prototype.hasOwnProperty.call(req.body, 'pushEnabled');

  try {
    const existingRows = await prisma.$queryRaw<Array<{ announcement_id: string; status: string; scheduled_for: Date | null }>>`
      SELECT announcement_id, status::text, scheduled_for
      FROM admin_announcements
      WHERE announcement_id = ${announcementId}
      LIMIT 1
    `;
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'Announcement not found' });

    let nextStatus = existing.status;
    let nextScheduledFor = hasScheduledFor ? (scheduledFor ? new Date(scheduledFor) : null) : existing.scheduled_for;
    if (lifecycleAction === 'publish_now') {
      nextStatus = 'published';
      nextScheduledFor = null;
    } else if (lifecycleAction === 'cancel_schedule') {
      nextStatus = 'draft';
      nextScheduledFor = null;
    } else if (lifecycleAction === 'unpublish') {
      nextStatus = 'draft';
    } else if (hasScheduledFor) {
      nextStatus = nextScheduledFor && nextScheduledFor.getTime() > Date.now() ? 'scheduled' : 'published';
    }

    await prisma.$queryRaw`
      UPDATE admin_announcements
      SET
        title = CASE WHEN ${title === undefined} THEN title ELSE ${title?.trim() || title} END,
        content = CASE WHEN ${content === undefined} THEN content ELSE ${content?.trim() || content} END,
        audience_type = CASE WHEN ${normalizedAudienceType === undefined} THEN audience_type ELSE ${normalizedAudienceType} END,
        audience_ids = CASE WHEN ${normalizedAudienceIds === undefined} THEN audience_ids ELSE ${JSON.stringify(normalizedAudienceIds)}::jsonb END,
        scheduled_for = ${nextScheduledFor},
        pinned = CASE WHEN ${hasPinned} THEN ${Boolean(pinned)} ELSE pinned END,
        push_enabled = CASE WHEN ${hasPushEnabled} THEN ${Boolean(pushEnabled)} ELSE push_enabled END,
        status = CAST(${nextStatus} AS "AnnouncementStatus"),
        updated_at = NOW()
      WHERE announcement_id = ${announcementId}
    `;

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: lifecycleAction ? `announcement.${lifecycleAction}` : 'announcement.updated',
      targetType: 'announcement',
      targetId: announcementId,
      severity: 'info',
      summary: lifecycleAction ? `Announcement ${lifecycleAction.replace('_', ' ')}` : 'Announcement updated',
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating announcement:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/announcements/:announcementId', async (req: Request<{ announcementId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { announcementId } = req.params;

  try {
    await prisma.$queryRaw`
      DELETE FROM admin_announcements
      WHERE announcement_id = ${announcementId}
    `;

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: 'announcement.deleted',
      targetType: 'announcement',
      targetId: announcementId,
      severity: 'info',
      summary: 'Announcement deleted',
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting announcement:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/logs', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? '').trim();
  const severity = parseAdminAuditLogSeverityFilter(req.query.severity);
  const actionType = String(req.query.actionType ?? '').trim();
  const targetType = String(req.query.targetType ?? '').trim();
  const actor = String(req.query.actor ?? '').trim();
  const from = parseAdminDateFilter(req.query.from);
  const to = parseAdminDateFilter(req.query.to, true);
  const page = parsePositiveInt(req.query.page, 1, 1, 10_000);
  const limit = parsePositiveInt(req.query.limit, 20, 1, 10_000);
  const offset = (page - 1) * limit;
  const queryPattern = `%${query}%`;
  const actionPattern = `%${actionType}%`;
  const targetTypePattern = `%${targetType}%`;
  const actorPattern = `%${actor}%`;

  const logBaseSql = `
    FROM admin_audit_logs l
    JOIN users actor_user ON actor_user.user_id = l.actor_user_id
    WHERE
      ($1 = '' OR (
        l.summary ILIKE $2
        OR l.action_type ILIKE $2
        OR actor_user.username ILIKE $2
      ))
      AND ($3 = '' OR l.severity::text = $3)
      AND ($4 = '' OR l.action_type ILIKE $5)
      AND ($6 = '' OR COALESCE(l.target_type, '') ILIKE $7)
      AND ($8 = '' OR actor_user.username ILIKE $9 OR actor_user.email ILIKE $9)
      AND ($10::timestamp IS NULL OR l.created_at >= $10::timestamp)
      AND ($11::timestamp IS NULL OR l.created_at <= $11::timestamp)
  `;

  try {
    type AdminLogListRow = {
      audit_log_id: string;
      action_type: string;
      target_type: string | null;
      target_id: string | null;
      severity: string;
      summary: string;
      created_at: Date;
      actor: string;
    };

    const listSql = `
      SELECT
        l.audit_log_id,
        l.action_type,
        l.target_type,
        l.target_id,
        l.severity::text,
        l.summary,
        l.created_at,
        actor_user.username AS actor
      ${logBaseSql}
      ORDER BY l.created_at DESC, l.audit_log_id DESC
      LIMIT $12
      OFFSET $13
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      ${logBaseSql}
    `;

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRawUnsafe<AdminLogListRow[]>(
        listSql,
        query,
        queryPattern,
        severity,
        actionType,
        actionPattern,
        targetType,
        targetTypePattern,
        actor,
        actorPattern,
        from,
        to,
        limit,
        offset,
      ),
      prisma.$queryRawUnsafe<Array<{ total: number }>>(
        countSql,
        query,
        queryPattern,
        severity,
        actionType,
        actionPattern,
        targetType,
        targetTypePattern,
        actor,
        actorPattern,
        from,
        to,
      ),
    ]);

    const total = totalRows[0]?.total ?? 0;
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

    return res.status(200).json({
      items: rows.map((row) => ({
        id: row.audit_log_id,
        actionType: row.action_type,
        targetType: row.target_type,
        targetId: row.target_id,
        severity: row.severity,
        summary: row.summary,
        actor: row.actor,
        createdAt: row.created_at.toISOString(),
      })),
      pageInfo: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error('Error loading system logs:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/logs/:logId', async (req: Request<{ logId: string }>, res: Response) => {
  const { logId } = req.params;

  try {
    type AdminLogDetailRow = {
      audit_log_id: string;
      action_type: string;
      target_type: string | null;
      target_id: string | null;
      severity: string;
      summary: string;
      created_at: Date;
      metadata: unknown;
      actor_user_id: string;
      actor_username: string;
      actor_email: string;
      actor_avatar_url: string | null;
      target_label: string | null;
    };

    const rows = await prisma.$queryRaw<AdminLogDetailRow[]>`
      SELECT
        l.audit_log_id,
        l.action_type,
        l.target_type,
        l.target_id,
        l.severity::text,
        l.summary,
        l.created_at,
        l.metadata,
        actor_user.user_id AS actor_user_id,
        actor_user.username AS actor_username,
        actor_user.email AS actor_email,
        actor_user.profile_photo_url AS actor_avatar_url,
        CASE
          WHEN l.target_type = 'user' THEN target_user.username
          WHEN l.target_type = 'club' THEN target_club.name
          WHEN l.target_type = 'post' THEN COALESCE(NULLIF(target_post.title, ''), NULLIF(LEFT(COALESCE(target_post.content_text, ''), 120), ''), l.target_id)
          WHEN l.target_type = 'announcement' THEN target_announcement.title
          WHEN l.target_type = 'report' THEN report_target.reason
          ELSE NULL
        END AS target_label
      FROM admin_audit_logs l
      JOIN users actor_user ON actor_user.user_id = l.actor_user_id
      LEFT JOIN users target_user ON l.target_type = 'user' AND target_user.user_id::text = l.target_id
      LEFT JOIN clubs target_club ON l.target_type = 'club' AND target_club.club_id::text = l.target_id
      LEFT JOIN posts target_post ON l.target_type = 'post' AND target_post.post_id::text = l.target_id
      LEFT JOIN admin_announcements target_announcement ON l.target_type = 'announcement' AND target_announcement.announcement_id::text = l.target_id
      LEFT JOIN admin_reports report_target ON l.target_type = 'report' AND report_target.report_id::text = l.target_id
      WHERE l.audit_log_id = ${logId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'Log entry not found' });
    }

    return res.status(200).json({
      id: row.audit_log_id,
      actionType: row.action_type,
      targetType: row.target_type,
      targetId: row.target_id,
      targetLabel: row.target_label ?? row.target_id,
      severity: row.severity,
      summary: row.summary,
      createdAt: row.created_at.toISOString(),
      actor: {
        id: row.actor_user_id,
        username: row.actor_username,
        email: row.actor_email,
        avatarUrl: row.actor_avatar_url,
      },
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    });
  } catch (err) {
    console.error('Error loading system log detail:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await ensureAdminSettingsRecord();
    return res.status(200).json(settings);
  } catch (err) {
    console.error('Error loading admin settings:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/settings', async (req: Request, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const validation = validateAdminSettingsPayload(req.body);

  if (!validation.value) {
    return res.status(400).json({ message: validation.message ?? 'Invalid settings payload' });
  }

  try {
    const previousSettings = await ensureAdminSettingsRecord();
    const nextSettings = validation.value;
    const changedKeys = flattenAdminSettingsChanges(previousSettings, nextSettings);

    try {
      await prisma.$queryRaw`
        UPDATE admin_settings
        SET
          settings = ${JSON.stringify(nextSettings)}::jsonb,
          updated_at = NOW(),
          updated_by_user_id = ${adminReq.auth!.userId}
        WHERE settings_key = ${ADMIN_SETTINGS_SINGLETON_KEY}
      `;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2010'
        && String(error.meta?.message ?? '').includes('relation "admin_settings" does not exist')
      ) {
        return res.status(503).json({ message: 'Settings persistence is unavailable until the admin_settings migration is applied' });
      }
      throw error;
    }

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: 'settings.updated',
      targetType: 'settings',
      targetId: ADMIN_SETTINGS_SINGLETON_KEY,
      severity: 'info',
      summary: 'Operational settings updated',
      metadata: {
        changedKeys,
        previousSettings,
        nextSettings,
      },
    });

    return res.status(200).json(nextSettings);
  } catch (err) {
    console.error('Error updating admin settings:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
