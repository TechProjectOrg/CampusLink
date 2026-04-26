import { getUserStatsById, getUserSummaryById } from '../lib/userCache';

export type UserType = 'student' | 'alumni';

export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  bio: string | null;
  profilePictureUrl: string | null;
  isPublic: boolean;
  headline: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  type: UserType;
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
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const [summary, stats] = await Promise.all([getUserSummaryById(userId), getUserStatsById(userId)]);
  if (!summary || !stats) return null;

  return {
    userId: summary.userId,
    username: summary.username,
    email: summary.email,
    bio: summary.bio,
    headline: summary.headline,
    profilePictureUrl: summary.profilePictureUrl,
    isPublic: !summary.isPrivate,
    isActive: summary.isActive,
    isOnline: summary.isOnline,
    lastSeenAt: summary.lastSeenAt ? new Date(summary.lastSeenAt) : null,
    createdAt: new Date(summary.createdAt),
    type: summary.type as UserType,
    details: summary.details,
    stats: {
      followerCount: stats.followerCount,
      followingCount: stats.followingCount,
      postCount: stats.postCount,
    },
  };
}
