import prisma from '../prisma';
import { getUserStatsById, getUserSummaryById } from '../lib/userCache';

export type UserType = 'student' | 'alumni';
export type UserVerificationState =
  | 'student_google_verified'
  | 'alumni_pending_review'
  | 'alumni_verified'
  | 'alumni_rejected';

export interface UserProfile {
  userId: string;
  displayName: string;
  username: string;
  email: string;
  authProvider: 'google' | 'magic_link';
  bio: string | null;
  profilePictureUrl: string | null;
  coverPhotoUrl: string | null;
  isPublic: boolean;
  headline: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  onboardingCompletedAt: string | null;
  type: UserType;
  verificationState: UserVerificationState | null;
  details: {
    branch?: string;
    year?: number;
    passingYear?: number;
  };
  allowMessages: boolean;
  stats: {
    followerCount: number;
    followingCount: number;
    postCount: number;
  };
  adminAccess?: {
    role: 'super_admin';
    mustChangePassword: boolean;
    lastLoginAt: string | null;
  } | null;
  moderation?: {
    isBanned: boolean;
    bannedAt: string | null;
    isSuspended: boolean;
    suspendedUntil: string | null;
    suspensionReason: string | null;
    suspensionStartedAt: string | null;
    warningCount: number;
    lastWarningAt: string | null;
  } | null;
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const [summary, stats, adminRows, moderationRows] = await Promise.all([
    getUserSummaryById(userId),
    getUserStatsById(userId),
    prisma.$queryRaw<
      Array<{
        role: 'super_admin';
        must_change_password: boolean;
        last_login_at: Date | null;
      }>
    >`
      SELECT role::text AS role, must_change_password, last_login_at
      FROM admin_accounts
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    prisma.$queryRaw<
      Array<{
        is_deleted: boolean;
        is_banned: boolean;
        banned_at: Date | null;
        suspended_until: Date | null;
        suspension_reason: string | null;
        suspension_started_at: Date | null;
        warning_count: number;
        last_warning_at: Date | null;
      }>
    >`
      SELECT
        is_deleted,
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
    `,
  ]);
  if (!summary || !stats) return null;

  const admin = adminRows[0];
  const moderation = moderationRows[0];

  if (moderation?.is_deleted) {
    return null;
  }

  return {
    userId: summary.userId,
    displayName: summary.displayName,
    username: summary.username,
    email: summary.email,
    authProvider: summary.authProvider,
    bio: summary.bio,
    headline: summary.headline,
    profilePictureUrl: summary.profilePictureUrl,
    coverPhotoUrl: summary.coverPhotoUrl,
    isPublic: !summary.isPrivate,
    isActive: summary.isActive,
    isOnline: summary.isOnline,
    lastSeenAt: summary.lastSeenAt ? new Date(summary.lastSeenAt) : null,
    createdAt: new Date(summary.createdAt),
    onboardingCompletedAt: summary.onboardingCompletedAt,
    type: summary.type as UserType,
    verificationState: (summary.verificationState ?? null) as UserVerificationState | null,
    details: summary.details,
    allowMessages: summary.allowMessages,
    stats: {
      followerCount: stats.followerCount,
      followingCount: stats.followingCount,
      postCount: stats.postCount,
    },
    adminAccess: admin
      ? {
          role: admin.role,
          mustChangePassword: admin.must_change_password,
          lastLoginAt: admin.last_login_at ? new Date(admin.last_login_at).toISOString() : null,
        }
      : null,
    moderation: moderation
      ? {
          isBanned: moderation.is_banned,
          bannedAt: moderation.banned_at ? new Date(moderation.banned_at).toISOString() : null,
          isSuspended: Boolean(moderation.suspended_until && moderation.suspended_until > new Date()),
          suspendedUntil: moderation.suspended_until ? new Date(moderation.suspended_until).toISOString() : null,
          suspensionReason: moderation.suspension_reason,
          suspensionStartedAt: moderation.suspension_started_at ? new Date(moderation.suspension_started_at).toISOString() : null,
          warningCount: moderation.warning_count,
          lastWarningAt: moderation.last_warning_at ? new Date(moderation.last_warning_at).toISOString() : null,
        }
      : null,
  };
}
