import crypto from 'crypto';
import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken from '../middleware/authenticateToken';
import requireAdmin, { type AdminAuthedRequest } from '../middleware/requireAdmin';
import { hashPassword, signAuthToken, verifyPassword } from '../lib/auth';
import { probeRedisHealth } from '../lib/cache';
import { socketsByUserId } from '../lib/realtime';
import {
  getAdminAccountByUserId,
  markAdminLogin,
  recordAdminAuditLog,
} from '../lib/admin';
import {
  invalidateClubMembershipCache,
  invalidateClubMetaCache,
  invalidateClubStatsCache,
} from '../lib/clubCache';

const router = express.Router();

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

async function invalidateAdminClubCaches(clubId: string, memberUserIds: string[] = []): Promise<void> {
  await Promise.allSettled([
    invalidateClubMetaCache(clubId),
    invalidateClubStatsCache(clubId),
    ...memberUserIds.map((userId) => invalidateClubMembershipCache(clubId, userId)),
  ]);
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
        WHERE r.status IN (CAST('open' AS "AdminReportStatus"), CAST('reviewing' AS "AdminReportStatus"), CAST('escalated' AS "AdminReportStatus"))
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
          SELECT 'signup'::text AS type, CONCAT(username, ' joined CampusLink') AS summary, created_at
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
        ($1 = '' OR u.username ILIKE $2 OR u.email ILIKE $2)
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
        ($1 = '' OR u.username ILIKE $2 OR u.email ILIKE $2)
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
        fullName: row.username,
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
      prisma.$queryRaw<Array<{ user_id: string; username: string; email: string; bio: string | null; headline: string | null; branch: string | null; is_banned: boolean; suspended_until: Date | null; verified_at: Date | null; created_at: Date; last_seen_at: Date | null; profile_photo_url: string | null }>>`
        SELECT
          u.user_id,
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
      fullName: user.username,
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
  const suspendDays = Math.min(365, Math.max(1, Number.isFinite(Number(durationDays)) ? Number(durationDays) : 7));

  if (!action) {
    return res.status(400).json({ message: 'Missing action' });
  }

  try {
    if (action === 'warn') {
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
      await prisma.$queryRawUnsafe(`
        UPDATE users
        SET suspended_until = NOW() + INTERVAL '${suspendDays} day', is_banned = FALSE, updated_at = NOW()
        WHERE user_id = ${userId}
      `);
    } else if (action === 'ban') {
      await prisma.$queryRaw`
        UPDATE users
        SET is_banned = TRUE, suspended_until = NULL, updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    } else if (action === 'unsuspend') {
      await prisma.$queryRaw`
        UPDATE users
        SET suspended_until = NULL, updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    } else if (action === 'unban') {
      await prisma.$queryRaw`
        UPDATE users
        SET is_banned = FALSE, updated_at = NOW()
        WHERE user_id = ${userId}
      `;
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
        ...(action === 'suspend' ? { durationDays: suspendDays } : {}),
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
      await prisma.$queryRaw`UPDATE clubs SET deleted_at = NOW(), updated_at = NOW() WHERE club_id = ${clubId}`;
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

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        post_id: string;
        title: string | null;
        content_text: string | null;
        username: string;
        club_name: string | null;
        media_url: string | null;
        likes: number;
        comments: number;
        reports: number;
        hidden_at: Date | null;
        deleted_at: Date | null;
        created_at: Date;
        author_user_id: string;
      }>
    >`
      SELECT
        p.post_id,
        p.title,
        p.content_text,
        u.username,
        c.name AS club_name,
        (SELECT pm.media_url FROM post_media pm WHERE pm.post_id = p.post_id ORDER BY pm.sort_order ASC, pm.created_at ASC LIMIT 1) AS media_url,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS likes,
        (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comments,
        (SELECT COUNT(*)::int FROM admin_reports r WHERE r.target_type = CAST('post' AS "AdminReportTargetType") AND r.target_id = p.post_id::text) AS reports,
        p.hidden_at,
        p.deleted_at,
        p.created_at,
        p.author_user_id
      FROM posts p
      JOIN users u ON u.user_id = p.author_user_id
      LEFT JOIN clubs c ON c.club_id = p.club_id
      WHERE ${query} = '' OR COALESCE(p.title, '') ILIKE ${`%${query}%`} OR COALESCE(p.content_text, '') ILIKE ${`%${query}%`} OR u.username ILIKE ${`%${query}%`}
      ORDER BY p.created_at DESC
      LIMIT 100
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.post_id,
      author: row.username,
      authorUserId: row.author_user_id,
      club: row.club_name,
      title: row.title,
      preview: row.content_text,
      mediaUrl: row.media_url,
      engagement: {
        likes: row.likes,
        comments: row.comments,
      },
      reportsCount: row.reports,
      status: row.deleted_at ? 'deleted' : row.hidden_at ? 'hidden' : 'live',
      createdAt: row.created_at.toISOString(),
    })));
  } catch (err) {
    console.error('Error loading admin posts:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/posts/:postId/actions', async (req: Request<{ postId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { postId } = req.params;
  const { action, note } = req.body as { action?: string; note?: string };

  try {
    const postRows = await prisma.$queryRaw<Array<{ author_user_id: string }>>`
      SELECT author_user_id FROM posts WHERE post_id = ${postId} LIMIT 1
    `;
    const post = postRows[0];
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (action === 'hide') {
      await prisma.$queryRaw`
        UPDATE posts
        SET hidden_at = NOW(), hidden_reason = ${note ?? 'Hidden by admin'}, hidden_by_user_id = ${adminReq.auth!.userId}, updated_at = NOW()
        WHERE post_id = ${postId}
      `;
    } else if (action === 'delete') {
      await prisma.$queryRaw`
        UPDATE posts
        SET deleted_at = NOW(), deleted_by_user_id = ${adminReq.auth!.userId}, updated_at = NOW()
        WHERE post_id = ${postId}
      `;
    } else if (action === 'warn') {
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'post.warn_author',
        targetType: 'post',
        targetId: postId,
        severity: 'warning',
        summary: note?.trim() || 'Author warned for post',
      });
      return res.status(200).json({ success: true });
    } else if (action === 'suspend_author') {
      await prisma.$queryRaw`
        UPDATE users
        SET suspended_until = NOW() + INTERVAL '7 day', updated_at = NOW()
        WHERE user_id = ${post.author_user_id}
      `;
    } else if (action === 'escalate') {
      await prisma.$queryRaw`
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
          ${note?.trim() || 'Escalated by admin during moderation'},
          CAST('critical' AS "AdminSeverity"),
          CAST('escalated' AS "AdminReportStatus"),
          1,
          ${adminReq.auth!.userId},
          ${note?.trim() || null}
        )
      `;
    } else {
      return res.status(400).json({ message: 'Unsupported action' });
    }

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: `post.${action}`,
      targetType: 'post',
      targetId: postId,
      severity: action === 'delete' || action === 'escalate' ? 'critical' : 'warning',
      summary: `Admin performed ${action} on post`,
      metadata: note ? { note } : undefined,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error performing post action:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/reports', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        report_id: string;
        reporter: string | null;
        target_type: string;
        target_id: string;
        reason: string;
        evidence: string | null;
        report_count: number;
        severity: string;
        status: string;
        assigned_to: string | null;
        internal_notes: string | null;
        created_at: Date;
      }>
    >`
      SELECT
        r.report_id,
        reporter.username AS reporter,
        r.target_type::text,
        r.target_id,
        r.reason,
        r.evidence,
        r.report_count,
        r.severity::text,
        r.status::text,
        assignee.username AS assigned_to,
        r.internal_notes,
        r.created_at
      FROM admin_reports r
      LEFT JOIN users reporter ON reporter.user_id = r.reporter_user_id
      LEFT JOIN users assignee ON assignee.user_id = r.assigned_admin_user_id
      ORDER BY
        CASE r.status
          WHEN CAST('open' AS "AdminReportStatus") THEN 0
          WHEN CAST('reviewing' AS "AdminReportStatus") THEN 1
          WHEN CAST('escalated' AS "AdminReportStatus") THEN 2
          ELSE 3
        END,
        r.created_at DESC
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.report_id,
      reporter: row.reporter ?? 'System',
      targetType: row.target_type,
      targetContent: row.target_id,
      reason: row.reason,
      evidence: row.evidence,
      reportFrequency: row.report_count,
      severity: row.severity,
      status: row.status,
      assignedModerator: row.assigned_to,
      internalNotes: row.internal_notes,
      createdAt: row.created_at.toISOString(),
    })));
  } catch (err) {
    console.error('Error loading reports:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/reports/:reportId', async (req: Request<{ reportId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { reportId } = req.params;
  const { status, internalNotes, assignToMe } = req.body as { status?: string; internalNotes?: string; assignToMe?: boolean };

  try {
    await prisma.$queryRaw`
      UPDATE admin_reports
      SET
        status = CASE
          WHEN ${status ?? ''} = '' THEN status
          ELSE CAST(${status ?? 'open'} AS "AdminReportStatus")
        END,
        internal_notes = CASE
          WHEN ${internalNotes === undefined} THEN internal_notes
          ELSE ${internalNotes?.trim() || null}
        END,
        assigned_admin_user_id = CASE
          WHEN ${assignToMe ? true : false} THEN ${adminReq.auth!.userId}
          ELSE assigned_admin_user_id
        END,
        resolved_at = CASE
          WHEN ${status === 'resolved' || status === 'rejected'} THEN NOW()
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
      severity: status === 'escalated' ? 'critical' : 'info',
      summary: 'Admin updated report ticket',
      metadata: { status, assignToMe: Boolean(assignToMe) },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating report:', err);
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
        notes: string | null;
        status: string;
        requested_at: Date;
      }>
    >`
      SELECT verification_request_id, request_type::text, target_user_id, target_club_id, document_urls, notes, status::text, requested_at
      FROM admin_verification_requests
      ORDER BY requested_at DESC
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.verification_request_id,
      type: row.request_type,
      targetUserId: row.target_user_id,
      targetClubId: row.target_club_id,
      documentUrls: Array.isArray(row.document_urls) ? row.document_urls : [],
      notes: row.notes,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
    })));
  } catch (err) {
    console.error('Error loading verification requests:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch('/verification-requests/:requestId', async (req: Request<{ requestId: string }>, res: Response) => {
  const adminReq = req as AdminAuthedRequest;
  const { requestId } = req.params;
  const { status, notes } = req.body as { status?: string; notes?: string };

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        UPDATE admin_verification_requests
        SET
          status = CAST(${status} AS "VerificationRequestStatus"),
          notes = CASE WHEN ${notes === undefined} THEN notes ELSE ${notes?.trim() || null} END,
          reviewed_at = NOW(),
          reviewed_by_user_id = ${adminReq.auth!.userId}
        WHERE verification_request_id = ${requestId}
      `;

      const targets = await tx.$queryRaw<Array<{ target_user_id: string | null; target_club_id: string | null; request_type: 'student' | 'club' }>>`
        SELECT target_user_id, target_club_id, request_type::text
        FROM admin_verification_requests
        WHERE verification_request_id = ${requestId}
        LIMIT 1
      `;
      const target = targets[0];
      if (target && status === 'approved') {
        if (target.target_user_id) {
          await tx.$queryRaw`UPDATE users SET verified_at = NOW(), updated_at = NOW() WHERE user_id = ${target.target_user_id}`;
        }
        if (target.target_club_id) {
          await tx.$queryRaw`UPDATE clubs SET is_verified = TRUE, updated_at = NOW() WHERE club_id = ${target.target_club_id}`;
        }
      }
    });

    await recordAdminAuditLog({
      actorUserId: adminReq.auth!.userId,
      actionType: 'verification.updated',
      targetType: 'verification',
      targetId: requestId,
      severity: status === 'rejected' ? 'warning' : 'info',
      summary: `Verification request marked ${status}`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating verification request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const [userGrowth, activeColleges, topClubs] = await Promise.all([
      prisma.$queryRaw<Array<{ label: string; value: number }>>`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(u.user_id)::int AS value
        FROM generate_series(CURRENT_DATE - INTERVAL '29 day', CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN users u ON DATE_TRUNC('day', u.created_at) = day_bucket
        GROUP BY day_bucket
        ORDER BY day_bucket
      `,
      prisma.$queryRaw<Array<{ label: string; value: number }>>`
        SELECT COALESCE(sp.branch, ap.branch, 'Unknown') AS label, COUNT(*)::int AS value
        FROM users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
        LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
        GROUP BY label
        ORDER BY value DESC
        LIMIT 8
      `,
      prisma.$queryRaw<Array<{ label: string; value: number }>>`
        SELECT c.name AS label, COUNT(p.post_id)::int AS value
        FROM clubs c
        LEFT JOIN posts p ON p.club_id = c.club_id AND p.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
        GROUP BY c.club_id, c.name
        ORDER BY value DESC, c.name ASC
        LIMIT 5
      `,
    ]);

    return res.status(200).json({
      userGrowth,
      retention: userGrowth.slice(-7),
      engagement: topClubs,
      activeColleges,
      topClubs,
      trendingHashtags: [],
      contentPerformance: topClubs,
      trafficSources: [
        { label: 'Direct', value: 54 },
        { label: 'Campus referrals', value: 31 },
        { label: 'Notifications', value: 15 },
      ],
    });
  } catch (err) {
    console.error('Error loading analytics:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/announcements', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ announcement_id: string; title: string; content: string; audience_type: string; status: string; pinned: boolean; scheduled_for: Date | null; created_at: Date }>>`
      SELECT announcement_id, title, content, audience_type, status::text, pinned, scheduled_for, created_at
      FROM admin_announcements
      ORDER BY created_at DESC
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.announcement_id,
      title: row.title,
      content: row.content,
      audienceType: row.audience_type,
      status: row.status,
      pinned: row.pinned,
      scheduledFor: row.scheduled_for ? row.scheduled_for.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    })));
  } catch (err) {
    console.error('Error loading announcements:', err);
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

  if (!title?.trim() || !content?.trim() || !audienceType?.trim()) {
    return res.status(400).json({ message: 'Title, content, and audienceType are required' });
  }

  try {
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
        ${audienceType.trim()},
        ${JSON.stringify(Array.isArray(audienceIds) ? audienceIds : [])}::jsonb,
        ${scheduledFor ? new Date(scheduledFor) : null},
        ${Boolean(pinned)},
        ${Boolean(pushEnabled)},
        CAST(${scheduledFor ? 'scheduled' : 'published'} AS "AnnouncementStatus"),
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

router.get('/logs', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? '').trim();

  try {
    const rows = await prisma.$queryRaw<Array<{ audit_log_id: string; action_type: string; target_type: string | null; target_id: string | null; severity: string; summary: string; created_at: Date; actor: string }>>`
      SELECT l.audit_log_id, l.action_type, l.target_type, l.target_id, l.severity::text, l.summary, l.created_at, u.username AS actor
      FROM admin_audit_logs l
      JOIN users u ON u.user_id = l.actor_user_id
      WHERE ${query} = '' OR l.summary ILIKE ${`%${query}%`} OR l.action_type ILIKE ${`%${query}%`} OR u.username ILIKE ${`%${query}%`}
      ORDER BY l.created_at DESC
      LIMIT 200
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.audit_log_id,
      actionType: row.action_type,
      targetType: row.target_type,
      targetId: row.target_id,
      severity: row.severity,
      summary: row.summary,
      actor: row.actor,
      createdAt: row.created_at.toISOString(),
    })));
  } catch (err) {
    console.error('Error loading system logs:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/settings', async (_req: Request, res: Response) => {
  return res.status(200).json({
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
  });
});

export default router;
