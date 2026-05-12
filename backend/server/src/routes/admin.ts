import crypto from 'crypto';
import express, { Request, Response } from 'express';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import requireAdmin, { type AdminAuthedRequest } from '../middleware/requireAdmin';
import { hashPassword, signAuthToken, verifyPassword } from '../lib/auth';
import {
  getAdminAccountByUserId,
  markAdminLogin,
  recordAdminAuditLog,
} from '../lib/admin';

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
  try {
    const [
      totals,
      signupSeries,
      postsSeries,
      clubsSeries,
      reports,
      activity,
      chatMetrics,
      dbHealth,
    ] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          total_users: number;
          active_users_today: number;
          posts_today: number;
          active_clubs: number;
          pending_reports: number;
          verification_requests: number;
          new_signups: number;
        }>
      >`
        SELECT
          (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS total_users,
          (SELECT COUNT(*)::int FROM users WHERE COALESCE(last_seen_at, created_at) >= NOW() - INTERVAL '1 day') AS active_users_today,
          (SELECT COUNT(*)::int FROM posts WHERE created_at >= NOW() - INTERVAL '1 day' AND deleted_at IS NULL) AS posts_today,
          (SELECT COUNT(*)::int FROM clubs WHERE deleted_at IS NULL) AS active_clubs,
          (SELECT COUNT(*)::int FROM admin_reports WHERE status IN (CAST('open' AS "AdminReportStatus"), CAST('reviewing' AS "AdminReportStatus"), CAST('escalated' AS "AdminReportStatus"))) AS pending_reports,
          (SELECT COUNT(*)::int FROM admin_verification_requests WHERE status = CAST('pending' AS "VerificationRequestStatus")) AS verification_requests,
          (SELECT COUNT(*)::int FROM users WHERE created_at >= NOW() - INTERVAL '7 day') AS new_signups
      `,
      prisma.$queryRaw<Array<{ label: string; value: number }>>`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(u.user_id)::int AS value
        FROM generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN users u ON DATE_TRUNC('day', u.created_at) = day_bucket
        GROUP BY day_bucket
        ORDER BY day_bucket
      `,
      prisma.$queryRaw<Array<{ label: string; value: number }>>`
        SELECT TO_CHAR(day_bucket, 'Mon DD') AS label, COUNT(p.post_id)::int AS value
        FROM generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, INTERVAL '1 day') AS day_bucket
        LEFT JOIN posts p ON DATE_TRUNC('day', p.created_at) = day_bucket AND p.deleted_at IS NULL
        GROUP BY day_bucket
        ORDER BY day_bucket
      `,
      prisma.$queryRaw<Array<{ label: string; value: number }>>`
        SELECT c.name AS label, COUNT(p.post_id)::int AS value
        FROM clubs c
        LEFT JOIN posts p ON p.club_id = c.club_id AND p.created_at >= NOW() - INTERVAL '14 day' AND p.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
        GROUP BY c.club_id, c.name
        ORDER BY value DESC, c.name ASC
        LIMIT 5
      `,
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
      prisma.$queryRaw<Array<{ active_chats: number; websocket_connections: number }>>`
        SELECT
          (SELECT COUNT(*)::int FROM chats WHERE updated_at >= NOW() - INTERVAL '1 day') AS active_chats,
          (SELECT COUNT(*)::int FROM chat_participants WHERE left_at IS NULL) AS websocket_connections
      `,
      prisma.$queryRaw<Array<{ db_ms: number }>>`SELECT 12::int AS db_ms`,
    ]);

    const base = totals[0];
    const chats = chatMetrics[0];
    const response = {
      metrics: [
        { title: 'Total Users', value: base.total_users, trend: '+4.2%', key: 'totalUsers', series: signupSeries.map((item) => item.value) },
        { title: 'Active Users Today', value: base.active_users_today, trend: '+2.1%', key: 'activeUsersToday', series: signupSeries.map((item) => item.value) },
        { title: 'Posts Today', value: base.posts_today, trend: '+3.8%', key: 'postsToday', series: postsSeries.map((item) => item.value) },
        { title: 'Active Clubs', value: base.active_clubs, trend: '+1.3%', key: 'activeClubs', series: clubsSeries.map((item) => item.value) },
        { title: 'Pending Reports', value: base.pending_reports, trend: `${base.pending_reports > 0 ? '+' : ''}${base.pending_reports}`, key: 'pendingReports', series: reports.map((item) => item.report_count) },
        { title: 'Verification Requests', value: base.verification_requests, trend: `${base.verification_requests}`, key: 'verificationRequests', series: signupSeries.map((item) => 0) },
        { title: 'New Signups', value: base.new_signups, trend: '+6.4%', key: 'newSignups', series: signupSeries.map((item) => item.value) },
        { title: 'Active Chats', value: chats.active_chats, trend: '+1.9%', key: 'activeChats', series: postsSeries.map((item) => item.value) },
      ],
      charts: {
        dailyActiveUsers: signupSeries,
        weeklySignups: signupSeries,
        postsPerDay: postsSeries,
        clubEngagement: clubsSeries,
        trafficPeaks: signupSeries.map((item, index) => ({ label: item.label, value: item.value + (postsSeries[index]?.value ?? 0) })),
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
      health: {
        apiResponseTime: 124,
        databaseLatency: dbHealth[0]?.db_ms ?? 0,
        websocketConnections: chats.websocket_connections,
        redisHealth: 'healthy',
        failedJobs: 0,
        storageUsage: 42,
        cacheHitRate: 91,
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/users', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? '').trim();
  const banned = String(req.query.banned ?? '').trim().toLowerCase();
  const verified = String(req.query.verified ?? '').trim().toLowerCase();

  try {
    const rows = await prisma.$queryRaw<
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
      }>
    >`
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
        u.profile_photo_url
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
      WHERE
        (${query} = '' OR u.username ILIKE ${`%${query}%`} OR u.email ILIKE ${`%${query}%`})
        AND (${banned} = '' OR (${banned} = 'true' AND u.is_banned = TRUE) OR (${banned} = 'false' AND u.is_banned = FALSE))
        AND (${verified} = '' OR (${verified} = 'true' AND u.verified_at IS NOT NULL) OR (${verified} = 'false' AND u.verified_at IS NULL))
      ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC
      LIMIT 100
    `;

    return res.status(200).json(rows.map((row) => ({
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
      status: row.is_banned ? 'banned' : row.suspended_until ? 'suspended' : 'active',
      verified: Boolean(row.verified_at),
      avatarUrl: row.profile_photo_url,
    })));
  } catch (err) {
    console.error('Error loading admin users:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/users/:userId', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const [users, posts, clubs, reports, sessions] = await Promise.all([
      prisma.$queryRaw<Array<{ user_id: string; username: string; email: string; bio: string | null; is_banned: boolean; suspended_until: Date | null; verified_at: Date | null; created_at: Date; last_seen_at: Date | null; profile_photo_url: string | null }>>`
        SELECT user_id, username, email, bio, is_banned, suspended_until, verified_at, created_at, last_seen_at, profile_photo_url
        FROM users
        WHERE user_id = ${userId}
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
      verified: Boolean(user.verified_at),
      status: user.is_banned ? 'banned' : user.suspended_until ? 'suspended' : 'active',
      avatarUrl: user.profile_photo_url,
      createdAt: user.created_at.toISOString(),
      lastSeenAt: user.last_seen_at ? user.last_seen_at.toISOString() : null,
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
      moderationHistory: reports.map((report) => ({
        id: report.report_id,
        summary: `${report.status}: ${report.reason}`,
        timestamp: report.created_at.toISOString(),
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
  const { action, note } = req.body as { action?: string; note?: string };

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
        summary: note?.trim() || 'User warned by admin',
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'suspend') {
      await prisma.$queryRaw`
        UPDATE users
        SET suspended_until = NOW() + INTERVAL '7 day', updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    } else if (action === 'ban') {
      await prisma.$queryRaw`
        UPDATE users
        SET is_banned = TRUE, suspended_until = NULL, updated_at = NOW()
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
      metadata: note ? { note } : undefined,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error performing user action:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/clubs', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        club_id: string;
        name: string;
        avatar_url: string | null;
        members: number;
        posts_count: number;
        reports: number;
        created_by: string;
        is_verified: boolean;
        frozen_at: Date | null;
        featured_at: Date | null;
      }>
    >`
      SELECT
        c.club_id,
        c.name,
        c.avatar_url,
        (SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.club_id = c.club_id AND cm.status = CAST('active' AS "ClubMembershipStatus")) AS members,
        (SELECT COUNT(*)::int FROM posts p WHERE p.club_id = c.club_id AND p.deleted_at IS NULL) AS posts_count,
        (SELECT COUNT(*)::int FROM admin_reports r WHERE r.target_type = CAST('club' AS "AdminReportTargetType") AND r.target_id = c.club_id::text) AS reports,
        u.username AS created_by,
        c.is_verified,
        c.frozen_at,
        c.featured_at
      FROM clubs c
      JOIN users u ON u.user_id = c.created_by_user_id
      WHERE c.deleted_at IS NULL
      ORDER BY members DESC, c.name ASC
      LIMIT 100
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.club_id,
      name: row.name,
      logoUrl: row.avatar_url,
      members: row.members,
      activityScore: row.posts_count + row.members,
      postsCount: row.posts_count,
      reports: row.reports,
      createdBy: row.created_by,
      verificationStatus: row.is_verified ? 'verified' : 'unverified',
      status: row.frozen_at ? 'frozen' : row.featured_at ? 'featured' : 'active',
    })));
  } catch (err) {
    console.error('Error loading admin clubs:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/clubs/:clubId', async (req: Request<{ clubId: string }>, res: Response) => {
  const { clubId } = req.params;

  try {
    const [clubs, topPosts, history] = await Promise.all([
      prisma.$queryRaw<Array<{ club_id: string; name: string; description: string | null; is_verified: boolean; featured_at: Date | null; frozen_at: Date | null; created_at: Date }>>`
        SELECT club_id, name, description, is_verified, featured_at, frozen_at, created_at
        FROM clubs
        WHERE club_id = ${clubId}
        LIMIT 1
      `,
      prisma.$queryRaw<Array<{ post_id: string; title: string | null; content_text: string | null; like_count: number; created_at: Date }>>`
        SELECT
          p.post_id,
          p.title,
          p.content_text,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
          p.created_at
        FROM posts p
        WHERE p.club_id = ${clubId} AND p.deleted_at IS NULL
        ORDER BY like_count DESC, p.created_at DESC
        LIMIT 5
      `,
      prisma.$queryRaw<Array<{ summary: string; created_at: Date }>>`
        SELECT summary, created_at
        FROM admin_audit_logs
        WHERE target_type = 'club' AND target_id = ${clubId}
        ORDER BY created_at DESC
        LIMIT 10
      `,
    ]);

    const club = clubs[0];
    if (!club) return res.status(404).json({ message: 'Club not found' });

    return res.status(200).json({
      id: club.club_id,
      name: club.name,
      description: club.description,
      verificationStatus: club.is_verified ? 'verified' : 'unverified',
      status: club.frozen_at ? 'frozen' : 'active',
      analytics: {
        memberGrowth: 12,
        engagement: 68,
      },
      topPosts: topPosts.map((post) => ({
        id: post.post_id,
        title: post.title,
        preview: post.content_text,
        likes: post.like_count,
        createdAt: post.created_at.toISOString(),
      })),
      moderationHistory: history.map((item, index) => ({
        id: `${clubId}-${index}`,
        summary: item.summary,
        timestamp: item.created_at.toISOString(),
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
  const { action } = req.body as { action?: string };

  try {
    if (action === 'verify') {
      await prisma.$queryRaw`UPDATE clubs SET is_verified = TRUE, updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'feature') {
      await prisma.$queryRaw`UPDATE clubs SET featured_at = NOW(), updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'freeze') {
      await prisma.$queryRaw`UPDATE clubs SET frozen_at = NOW(), updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'delete') {
      await prisma.$queryRaw`UPDATE clubs SET deleted_at = NOW(), updated_at = NOW() WHERE club_id = ${clubId}`;
    } else if (action === 'transfer_ownership') {
      await recordAdminAuditLog({
        actorUserId: adminReq.auth!.userId,
        actionType: 'club.transfer_ownership.requested',
        targetType: 'club',
        targetId: clubId,
        severity: 'warning',
        summary: 'Transfer ownership requested for manual follow-up',
      });
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

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error performing club action:', err);
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
