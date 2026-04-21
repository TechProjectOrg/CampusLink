import prisma from '../prisma';

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

interface DbUserProfileRow {
  user_id: string;
  username: string;
  email: string;
  bio: string | null;
  headline: string | null;
  profile_photo_url: string | null;
  is_private: boolean;
  is_active: boolean;
  is_online: boolean;
  last_seen_at: Date | null;
  created_at: Date;

  student_branch: string | null;
  student_year: number | null;

  alumni_branch: string | null;
  alumni_passing_year: number | null;

  follower_count: number;
  following_count: number;
  post_count: number;
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const rows = await prisma.$queryRaw<DbUserProfileRow[]>`
    SELECT
      u.user_id,
      u.username,
      u.email,
      u.bio,
      u.headline,
      u.profile_photo_url,
      u.is_private,
      u.is_active,
      u.is_online,
      u.last_seen_at,
      u.created_at,
      sp.branch AS student_branch,
      sp.year AS student_year,
      ap.branch AS alumni_branch,
      ap.passing_year AS alumni_passing_year,
      (SELECT COUNT(*)::int FROM follows f WHERE f.followed_user_id = u.user_id) AS follower_count,
      (SELECT COUNT(*)::int FROM follows f WHERE f.follower_user_id = u.user_id) AS following_count,
      (SELECT COUNT(*)::int FROM posts p WHERE p.author_user_id = u.user_id) AS post_count
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
    LEFT JOIN alumni_profiles ap ON ap.user_id = u.user_id
    WHERE u.user_id = ${userId}
  `;

  const row = rows[0];
  if (!row) return null;

  let type: UserType = 'student';
  const details: UserProfile['details'] = {};

  if (row.student_branch) {
    type = 'student';
    details.branch = row.student_branch;
    if (row.student_year != null) details.year = row.student_year;
  } else if (row.alumni_branch) {
    type = 'alumni';
    details.branch = row.alumni_branch;
    if (row.alumni_passing_year != null) details.passingYear = row.alumni_passing_year;
  }

  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    bio: row.bio,
    headline: row.headline,
    profilePictureUrl: row.profile_photo_url,
    isPublic: !row.is_private,
    isActive: row.is_active,
    isOnline: row.is_online,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    type,
    details,
    stats: {
      followerCount: row.follower_count,
      followingCount: row.following_count,
      postCount: row.post_count,
    },
  };
}
