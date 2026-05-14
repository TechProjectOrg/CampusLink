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
  username: string;
  email: string;
  bio: string | null;
  profilePictureUrl: string | null;
  coverPhotoUrl: string | null;
  isPublic: boolean;
  headline: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  type: UserType;
  verificationState: UserVerificationState | null;
  details: {
    branch?: string;
    year?: number;
    passingYear?: number;
  };
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
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const [summary, stats, adminRows] = await Promise.all([
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
  ]);
  if (!summary || !stats) return null;

  const admin = adminRows[0];

  return {
    userId: summary.userId,
    username: summary.username,
    email: summary.email,
    bio: summary.bio,
    headline: summary.headline,
    profilePictureUrl: summary.profilePictureUrl,
    coverPhotoUrl: summary.coverPhotoUrl,
    isPublic: !summary.isPrivate,
    isActive: summary.isActive,
    isOnline: summary.isOnline,
    lastSeenAt: summary.lastSeenAt ? new Date(summary.lastSeenAt) : null,
    createdAt: new Date(summary.createdAt),
    type: summary.type as UserType,
    verificationState: (summary.verificationState ?? null) as UserVerificationState | null,
    details: summary.details,
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
  };
}
