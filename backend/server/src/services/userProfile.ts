import prisma from '../prisma';

export type UserType = 'student' | 'alumni' | 'teacher' | 'unknown';

export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  bio: string | null;
  profilePictureUrl: string | null;
  isPublic: boolean;
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
  profile_picture_url: string | null;
  is_public: boolean;
  created_at: Date;

  student_branch: string | null;
  student_year: number | null;

  alumni_branch: string | null;
  alumni_passing_year: number | null;

  is_teacher: boolean;

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
      u.profile_picture_url,
      u.is_public,
      u.created_at,
      sp.branch AS student_branch,
      sp.year AS student_year,
      ap.branch AS alumni_branch,
      ap.passing_year AS alumni_passing_year,
      (tp.user_id IS NOT NULL) AS is_teacher,
      (SELECT COUNT(*)::int FROM follows f WHERE f.followee_id = u.user_id) AS follower_count,
      (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.user_id) AS following_count,
      (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.user_id) AS post_count
    FROM users u
    LEFT JOIN studentprofiles sp ON sp.user_id = u.user_id
    LEFT JOIN alumniprofiles ap ON ap.user_id = u.user_id
    LEFT JOIN teacherprofiles tp ON tp.user_id = u.user_id
    WHERE u.user_id = ${userId}
  `;

  const row = rows[0];
  if (!row) return null;

  let type: UserType = 'unknown';
  const details: UserProfile['details'] = {};

  if (row.student_branch) {
    type = 'student';
    details.branch = row.student_branch;
    if (row.student_year != null) details.year = row.student_year;
  } else if (row.alumni_branch) {
    type = 'alumni';
    details.branch = row.alumni_branch;
    if (row.alumni_passing_year != null) details.passingYear = row.alumni_passing_year;
  } else if (row.is_teacher) {
    type = 'teacher';
  }

  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    bio: row.bio,
    profilePictureUrl: row.profile_picture_url,
    isPublic: row.is_public,
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
