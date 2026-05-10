import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import { getUserProfileById } from '../services/userProfile';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { hashPassword, signPasswordChangeToken, verifyPassword, verifyPasswordChangeToken } from '../lib/auth';
import {
  deleteManagedPhotoByUrl,
  deleteManagedPostMediaByUrl,
  uploadPostMediaToStorage,
  uploadProfilePhotoToStorage,
} from '../lib/objectStorage';
import { createPostPublishedNotifications, notifyClubPostPublished } from '../lib/notifications';
import {
  addPostToFeedCaches,
  getPostFeedRecipientIds,
  invalidateUserFeedCache,
  refreshPostCaches,
} from '../lib/feedCache';
import {
  getCachedClubPermissionSnapshot,
  incrementClubStat,
  invalidateClubFeedCaches,
} from '../lib/clubCache';
import { invalidateConversationLists } from '../lib/chatCache';
import { emitFeedEvent } from '../lib/realtime';
import { incrementUserStat, patchUserSummary } from '../lib/userCache';
import { requireActiveClubMembership } from '../lib/clubs';
import { queueSuggestedUsersRecompute, trackPostCreatedHashtags } from '../lib/socialInsights';

const router = express.Router();

interface GetUserParams {
  userId: string;
}

const requireOwnUser: RequestHandler = (req, res, next: NextFunction) => {
  const authedRequest = req as unknown as AuthedRequest;
  const { userId } = req.params as unknown as GetUserParams;

  if (!authedRequest.auth || authedRequest.auth.userId !== userId) {
    return res.status(403).json({ message: 'You can only access your own account data' });
  }

  return next();
};

// Apply authentication to all routes (allows reading public data while knowing who's requesting)
router.use('/:userId', authenticateToken);

interface UpdateUserBody {
  username?: string;
  branch?: string;
  year?: string | number;
  bio?: string | null;
  headline?: string | null;
}

interface UpdateProfilePictureBody {
  profilePictureUrl?: string | null;
}

interface UpdateCoverPhotoBody {
  coverPhotoUrl?: string | null;
}

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const postMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});

interface VerifyPasswordBody {
  currentPassword: string;
}

interface ChangePasswordBody {
  changeToken: string;
  newPassword: string;
}

interface UserSettingsRow {
  is_private: boolean;
  email_notifications: boolean | null;
  follow_request_notifications: boolean | null;
  message_notifications: boolean | null;
  opportunity_alerts: boolean | null;
  club_update_notifications: boolean | null;
  weekly_digest_enabled: boolean | null;
  show_email: boolean | null;
  show_projects: boolean | null;
  allow_messages: boolean | null;
}

interface UserSettingsResponse {
  notifications: {
    emailNotifications: boolean;
    followRequests: boolean;
    newMessages: boolean;
    opportunityAlerts: boolean;
    clubUpdates: boolean;
    newPostAlerts: boolean;
  };
  privacy: {
    accountType: 'public' | 'private';
    showEmail: boolean;
    showProjects: boolean;
    allowMessages: boolean;
  };
}

interface UpdateUserSettingsBody {
  notifications?: Partial<UserSettingsResponse['notifications']> & { weeklyDigest?: boolean };
  privacy?: Partial<UserSettingsResponse['privacy']>;
}

type DbPostType = 'general' | 'opportunity' | 'event' | 'club_activity';
type DbOpportunityType = 'internship' | 'hackathon' | 'event' | 'contest' | 'club';
type DbPostVisibility = 'public' | 'followers' | 'club_members';

interface CreateUserPostBody {
  postType?: DbPostType;
  opportunityType?: DbOpportunityType | null;
  title?: string;
  contentText?: string;
  company?: string;
  deadline?: string;
  stipend?: string;
  duration?: string;
  eventDate?: string;
  location?: string;
  externalUrl?: string;
  visibility?: DbPostVisibility;
  clubId?: string | null;
  hashtags?: string[];
  media?: Array<{
    mediaUrl?: string;
    mediaType?: string;
    sortOrder?: number;
  }>;
}

interface UserPostMediaResponse {
  postMediaId: string;
  mediaUrl: string;
  mediaType: string;
  sortOrder: number;
}

interface UserPostResponse {
  id: string;
  authorUserId: string;
  clubId: string | null;
  postType: DbPostType;
  opportunityType: DbOpportunityType | null;
  title: string | null;
  contentText: string | null;
  company: string | null;
  deadline: string | null;
  stipend: string | null;
  duration: string | null;
  eventDate: string | null;
  location: string | null;
  externalUrl: string | null;
  visibility: DbPostVisibility;
  hashtags: string[];
  media: UserPostMediaResponse[];
  likeCount: number;
  commentCount: number;
  saveCount: number;
  createdAt: string;
  updatedAt: string;
}

interface UserPostRow {
  post_id: string;
  author_user_id: string;
  club_id: string | null;
  post_type: DbPostType;
  opportunity_type: DbOpportunityType | null;
  title: string | null;
  content_text: string | null;
  company_name: string | null;
  application_deadline: Date | null;
  stipend: string | null;
  duration: string | null;
  event_date: Date | null;
  location: string | null;
  external_url: string | null;
  visibility: DbPostVisibility;
  hashtags: string[] | null;
  media: unknown;
  like_count: number;
  comment_count: number;
  save_count: number;
  created_at: Date;
  updated_at: Date;
}

function normalizeHashtag(rawTag: string): string | null {
  const compact = rawTag.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
  if (!compact) return null;
  if (compact.length > 100) return null;
  if (!/^[a-z0-9_][a-z0-9_-]*$/.test(compact)) return null;
  return compact;
}

function normalizeHashtags(rawTags?: string[]): string[] {
  if (!Array.isArray(rawTags)) return [];
  const unique = new Set<string>();

  for (const tag of rawTags) {
    const normalized = normalizeHashtag(String(tag));
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function parseMediaValue(rawMedia: unknown): UserPostMediaResponse[] {
  let source: unknown = rawMedia;
  if (typeof rawMedia === 'string') {
    try {
      source = JSON.parse(rawMedia) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const mediaItem = item as Record<string, unknown>;
      const postMediaId = mediaItem.postMediaId;
      const mediaUrl = mediaItem.mediaUrl;
      const mediaType = mediaItem.mediaType;
      const sortOrder = mediaItem.sortOrder;

      if (
        typeof postMediaId !== 'string' ||
        typeof mediaUrl !== 'string' ||
        typeof mediaType !== 'string' ||
        typeof sortOrder !== 'number'
      ) {
        return null;
      }

      return {
        postMediaId,
        mediaUrl,
        mediaType,
        sortOrder,
      };
    })
    .filter((item): item is UserPostMediaResponse => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapUserPostRow(row: UserPostRow): UserPostResponse {
  return {
    id: row.post_id,
    authorUserId: row.author_user_id,
    clubId: row.club_id,
    postType: row.post_type,
    opportunityType: row.opportunity_type,
    title: row.title,
    contentText: row.content_text,
    company: row.company_name,
    deadline: row.application_deadline ? row.application_deadline.toISOString() : null,
    stipend: row.stipend,
    duration: row.duration,
    eventDate: row.event_date ? row.event_date.toISOString() : null,
    location: row.location,
    externalUrl: row.external_url,
    visibility: row.visibility,
    hashtags: row.hashtags ?? [],
    media: parseMediaValue(row.media),
    likeCount: row.like_count,
    commentCount: row.comment_count,
    saveCount: row.save_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function settingsFromRow(row: UserSettingsRow): UserSettingsResponse {
  return {
    notifications: {
      emailNotifications: row.email_notifications ?? true,
      followRequests: row.follow_request_notifications ?? true,
      newMessages: row.message_notifications ?? true,
      opportunityAlerts: row.opportunity_alerts ?? true,
      clubUpdates: row.club_update_notifications ?? true,
      newPostAlerts: row.weekly_digest_enabled ?? false,
    },
    privacy: {
      accountType: row.is_private ? 'private' : 'public',
      showEmail: row.show_email ?? true,
      showProjects: row.show_projects ?? true,
      allowMessages: row.allow_messages ?? true,
    },
  };
}

const passwordRequirements = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

function passwordRequirementMessage(): string {
  return 'Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*).';
}

async function getFollowerUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT follower_user_id AS user_id
    FROM follows
    WHERE followed_user_id = ${userId}
  `;

  return rows.map((row) => row.user_id);
}

async function getConversationViewerUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
    SELECT DISTINCT cp2.user_id
    FROM chat_participants cp1
    JOIN chat_participants cp2
      ON cp2.chat_id = cp1.chat_id
     AND cp2.left_at IS NULL
    WHERE cp1.user_id = ${userId}
      AND cp1.left_at IS NULL
  `;

  const unique = new Set<string>([userId]);
  rows.forEach((row) => unique.add(row.user_id));
  return Array.from(unique);
}

router.get('/:userId', async (req: Request<GetUserParams>, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  try {
    const profile = await getUserProfileById(userId);
    if (!profile) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(profile);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:userId/settings', async (req: Request<GetUserParams>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<UserSettingsRow[]>`
      SELECT
        u.is_private,
        us.email_notifications,
        us.follow_request_notifications,
        us.message_notifications,
        us.opportunity_alerts,
        us.club_update_notifications,
        us.weekly_digest_enabled,
        us.show_email,
        us.show_projects,
        us.allow_messages
      FROM users u
      LEFT JOIN user_settings us ON us.user_id = u.user_id
      WHERE u.user_id = ${userId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(settingsFromRow(row));
  } catch (err) {
    console.error('Error fetching user settings:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch(
  '/:userId/settings',
  requireOwnUser,
  async (req: Request<GetUserParams, unknown, UpdateUserSettingsBody>, res: Response) => {
    const { userId } = req.params;
    const { notifications, privacy } = req.body;

    if (!notifications && !privacy) {
      return res.status(400).json({ message: 'No settings payload provided' });
    }

    if (
      privacy?.accountType !== undefined &&
      privacy.accountType !== 'public' &&
      privacy.accountType !== 'private'
    ) {
      return res.status(400).json({ message: 'accountType must be either public or private' });
    }

    try {
      const rows = await prisma.$queryRaw<UserSettingsRow[]>`
        SELECT
          u.is_private,
          us.email_notifications,
          us.follow_request_notifications,
          us.message_notifications,
          us.opportunity_alerts,
          us.club_update_notifications,
          us.weekly_digest_enabled,
          us.show_email,
          us.show_projects,
          us.allow_messages
        FROM users u
        LEFT JOIN user_settings us ON us.user_id = u.user_id
        WHERE u.user_id = ${userId}
        LIMIT 1
      `;

      const row = rows[0];
      if (!row) {
        return res.status(404).json({ message: 'User not found' });
      }

      const current = settingsFromRow(row);

      const next: UserSettingsResponse = {
        notifications: {
          emailNotifications:
            notifications?.emailNotifications ?? current.notifications.emailNotifications,
          followRequests: notifications?.followRequests ?? current.notifications.followRequests,
          newMessages: notifications?.newMessages ?? current.notifications.newMessages,
          opportunityAlerts:
            notifications?.opportunityAlerts ?? current.notifications.opportunityAlerts,
          clubUpdates: notifications?.clubUpdates ?? current.notifications.clubUpdates,
          newPostAlerts:
            notifications?.newPostAlerts ??
            notifications?.weeklyDigest ??
            current.notifications.newPostAlerts,
        },
        privacy: {
          accountType: privacy?.accountType ?? current.privacy.accountType,
          showEmail: privacy?.showEmail ?? current.privacy.showEmail,
          showProjects: privacy?.showProjects ?? current.privacy.showProjects,
          allowMessages: privacy?.allowMessages ?? current.privacy.allowMessages,
        },
      };

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          UPDATE users
          SET is_private = ${next.privacy.accountType === 'private'}
          WHERE user_id = ${userId}
        `;

        await tx.$queryRaw`
          INSERT INTO user_settings (
            user_id,
            email_notifications,
            follow_request_notifications,
            message_notifications,
            opportunity_alerts,
            club_update_notifications,
            weekly_digest_enabled,
            show_email,
            show_projects,
            allow_messages
          )
          VALUES (
            ${userId},
            ${next.notifications.emailNotifications},
            ${next.notifications.followRequests},
            ${next.notifications.newMessages},
            ${next.notifications.opportunityAlerts},
            ${next.notifications.clubUpdates},
            ${next.notifications.newPostAlerts},
            ${next.privacy.showEmail},
            ${next.privacy.showProjects},
            ${next.privacy.allowMessages}
          )
          ON CONFLICT (user_id)
          DO UPDATE SET
            email_notifications = EXCLUDED.email_notifications,
            follow_request_notifications = EXCLUDED.follow_request_notifications,
            message_notifications = EXCLUDED.message_notifications,
            opportunity_alerts = EXCLUDED.opportunity_alerts,
            club_update_notifications = EXCLUDED.club_update_notifications,
            weekly_digest_enabled = EXCLUDED.weekly_digest_enabled,
            show_email = EXCLUDED.show_email,
            show_projects = EXCLUDED.show_projects,
            allow_messages = EXCLUDED.allow_messages
        `;
      });

      await patchUserSummary(userId, (current) => ({
        ...current,
        isPrivate: next.privacy.accountType === 'private',
        allowMessages: next.privacy.allowMessages,
      }));

      if (current.privacy.accountType !== next.privacy.accountType) {
        const affectedViewerIds = [userId, ...(await getFollowerUserIds(userId))];
        await Promise.all(affectedViewerIds.map((viewerId) => invalidateUserFeedCache(viewerId)));
      }

      return res.status(200).json(next);
    } catch (err) {
      console.error('Error updating user settings:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.patch(
  '/:userId',
  requireOwnUser,
  async (req: Request<GetUserParams, unknown, UpdateUserBody>, res: Response) => {
    const { userId } = req.params;
    const { username, branch, year, bio, headline } = req.body;

    const trimmedUsername = username?.trim();
    const trimmedBranch = branch?.trim();
    const numericYear = typeof year === 'string' ? Number.parseInt(year, 10) : year;
    const hasBioUpdate = Object.prototype.hasOwnProperty.call(req.body, 'bio');
    const hasHeadlineUpdate = Object.prototype.hasOwnProperty.call(req.body, 'headline');

    const hasUsernameUpdate = trimmedUsername !== undefined;
    const hasBranchOrYearUpdate = branch !== undefined || year !== undefined;

    if (
      !hasUsernameUpdate &&
      !hasBranchOrYearUpdate &&
      !hasBioUpdate &&
      !hasHeadlineUpdate
    ) {
      return res.status(400).json({ message: 'No profile fields provided for update' });
    }

    if (hasUsernameUpdate && !trimmedUsername) {
      return res.status(400).json({ message: 'Username cannot be empty' });
    }

    if (hasBranchOrYearUpdate && (!trimmedBranch || year === undefined || year === null)) {
      return res.status(400).json({ message: 'Branch and year must both be provided together' });
    }

    if (hasBranchOrYearUpdate && Number.isNaN(numericYear)) {
      return res.status(400).json({ message: 'Year must be a valid number' });
    }

    try {
      const profileRows = await prisma.$queryRaw<{ user_type: 'student' | 'alumni' }[]>`
        SELECT user_type
        FROM users
        WHERE user_id = ${userId}
      `;

      const profileRow = profileRows[0];
      if (!profileRow) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (
        hasBranchOrYearUpdate &&
        profileRow.user_type === 'student' &&
        (typeof numericYear !== 'number' || !Number.isInteger(numericYear) || numericYear < 1 || numericYear > 4)
      ) {
        return res.status(400).json({ message: 'Student year must be between 1 and 4' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          UPDATE users
          SET
            username = CASE WHEN ${hasUsernameUpdate} THEN ${trimmedUsername} ELSE username END,
            bio = CASE WHEN ${hasBioUpdate} THEN ${bio?.trim() || null} ELSE bio END,
            headline = CASE WHEN ${hasHeadlineUpdate} THEN ${headline?.trim() || null} ELSE headline END
          WHERE user_id = ${userId}
        `;

        if (!hasBranchOrYearUpdate) {
          return;
        }

        if (profileRow.user_type === 'student') {
          await tx.$queryRaw`
            UPDATE student_profiles
            SET branch = ${trimmedBranch}, year = ${numericYear}
            WHERE user_id = ${userId}
          `;
          return;
        }

        await tx.$queryRaw`
          UPDATE alumni_profiles
          SET branch = ${trimmedBranch}, passing_year = ${numericYear}
          WHERE user_id = ${userId}
        `;
      });

      await patchUserSummary(userId, (current) => ({
        ...current,
        username: trimmedUsername ?? current.username,
        bio: hasBioUpdate ? bio?.trim() || null : current.bio,
        headline: hasHeadlineUpdate ? headline?.trim() || null : current.headline,
        details:
          hasBranchOrYearUpdate && profileRow.user_type === 'student'
            ? {
                ...current.details,
                branch: trimmedBranch,
                year: typeof numericYear === 'number' ? numericYear : current.details.year,
              }
            : hasBranchOrYearUpdate
            ? {
                ...current.details,
                branch: trimmedBranch,
                passingYear:
                  typeof numericYear === 'number' ? numericYear : current.details.passingYear,
              }
            : current.details,
      }));

      if (hasUsernameUpdate) {
        await invalidateConversationLists(await getConversationViewerUserIds(userId));
      }

      const updatedProfile = await getUserProfileById(userId);
      if (!updatedProfile) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json(updatedProfile);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ message: 'Username already exists' });
      }

      console.error('Error updating user profile:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.patch(
  '/:userId/profile-picture',
  requireOwnUser,
  profilePhotoUpload.single('image') as unknown as RequestHandler<GetUserParams>,
  async (
    req: Request<GetUserParams, unknown, UpdateProfilePictureBody> & { file?: Express.Multer.File },
    res: Response,
  ) => {
    const { userId } = req.params;
    const { profilePictureUrl } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile && profilePictureUrl === undefined) {
      return res.status(400).json({ message: 'Provide an image file or profilePictureUrl=null' });
    }

    if (uploadedFile && !uploadedFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Only image uploads are allowed' });
    }

    if (!uploadedFile && profilePictureUrl !== null) {
      return res.status(400).json({ message: 'profilePictureUrl must be null when no file is uploaded' });
    }

    try {
      const currentProfile = await getUserProfileById(userId);
      if (!currentProfile) {
        return res.status(404).json({ message: 'User not found' });
      }

      let nextPhoto: string | null = currentProfile.profilePictureUrl;

      if (uploadedFile) {
        nextPhoto = await uploadProfilePhotoToStorage({
          userId,
          fileBuffer: uploadedFile.buffer,
          mimeType: uploadedFile.mimetype,
        });
      } else {
        nextPhoto = null;
      }

      await prisma.$queryRaw`
        UPDATE users
        SET profile_photo_url = ${nextPhoto}
        WHERE user_id = ${userId}
      `;

      await patchUserSummary(userId, (current) => ({
        ...current,
        profilePictureUrl: nextPhoto,
      }));

      await invalidateConversationLists(await getConversationViewerUserIds(userId));

      if (currentProfile.profilePictureUrl && currentProfile.profilePictureUrl !== nextPhoto) {
        try {
          await deleteManagedPhotoByUrl(currentProfile.profilePictureUrl);
        } catch (storageErr) {
          console.warn('Unable to delete previous profile photo from object storage:', storageErr);
        }
      }

      const updatedProfile = await getUserProfileById(userId);
      if (!updatedProfile) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json(updatedProfile);
    } catch (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Profile picture must be 5MB or smaller' });
      }

      if (err instanceof Error && err.message.startsWith('Missing required environment variable')) {
        return res.status(500).json({ message: 'Profile image storage is not configured on the server' });
      }

      console.error('Error updating profile picture:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.patch(
  '/:userId/cover-photo',
  requireOwnUser,
  profilePhotoUpload.single('image') as unknown as RequestHandler<GetUserParams>,
  async (
    req: Request<GetUserParams, unknown, UpdateCoverPhotoBody> & { file?: Express.Multer.File },
    res: Response,
  ) => {
    const { userId } = req.params;
    const { coverPhotoUrl } = req.body;
    const uploadedFile = req.file;

    if (!uploadedFile && coverPhotoUrl === undefined) {
      return res.status(400).json({ message: 'Provide an image file or coverPhotoUrl=null' });
    }

    if (uploadedFile && !uploadedFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Only image uploads are allowed' });
    }

    if (!uploadedFile && coverPhotoUrl !== null) {
      return res.status(400).json({ message: 'coverPhotoUrl must be null when no file is uploaded' });
    }

    try {
      const currentProfile = await getUserProfileById(userId);
      if (!currentProfile) {
        return res.status(404).json({ message: 'User not found' });
      }

      let nextPhoto: string | null = currentProfile.coverPhotoUrl;

      if (uploadedFile) {
        nextPhoto = await uploadProfilePhotoToStorage({
          userId,
          fileBuffer: uploadedFile.buffer,
          mimeType: uploadedFile.mimetype,
        });
      } else {
        nextPhoto = null;
      }

      await prisma.$queryRaw`
        UPDATE users
        SET cover_photo_url = ${nextPhoto}
        WHERE user_id = ${userId}
      `;

      await patchUserSummary(userId, (current) => ({
        ...current,
        coverPhotoUrl: nextPhoto,
      }));

      if (currentProfile.coverPhotoUrl && currentProfile.coverPhotoUrl !== nextPhoto) {
        try {
          await deleteManagedPhotoByUrl(currentProfile.coverPhotoUrl);
        } catch (storageErr) {
          console.warn('Unable to delete previous cover photo from object storage:', storageErr);
        }
      }

      const updatedProfile = await getUserProfileById(userId);
      if (!updatedProfile) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json(updatedProfile);
    } catch (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Cover photo must be 5MB or smaller' });
      }

      if (err instanceof Error && err.message.startsWith('Missing required environment variable')) {
        return res.status(500).json({ message: 'Cover image storage is not configured on the server' });
      }

      console.error('Error updating cover photo:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.post(
  '/:userId/password/verify',
  async (req: Request<GetUserParams, unknown, Partial<VerifyPasswordBody>>, res: Response) => {
    const { userId } = req.params;
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ message: 'Current password is required' });
    }

    try {
      const rows = await prisma.$queryRaw<{ password_hash: string }[]>`
        SELECT password_hash
        FROM users
        WHERE user_id = ${userId}
      `;

      const row = rows[0];
      if (!row) {
        return res.status(404).json({ message: 'User not found' });
      }

      const passwordMatches = await verifyPassword(currentPassword, row.password_hash);
      if (!passwordMatches) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      return res.status(200).json({ changeToken: signPasswordChangeToken(userId) });
    } catch (err) {
      console.error('Error verifying current password:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.patch(
  '/:userId/password',
  requireOwnUser,
  async (req: Request<GetUserParams, unknown, Partial<ChangePasswordBody>>, res: Response) => {
    const { userId } = req.params;
    const { changeToken, newPassword } = req.body;

    if (!changeToken) {
      return res.status(400).json({ message: 'Password change token is required' });
    }

    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }

    if (!passwordRequirements.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet the requirements.',
        details: passwordRequirementMessage(),
      });
    }

    try {
      const tokenPayload = verifyPasswordChangeToken(changeToken);
      if (tokenPayload.userId !== userId) {
        return res.status(403).json({ message: 'Invalid password change token' });
      }

      const rows = await prisma.$queryRaw<{ user_id: string }[]>`
        SELECT user_id
        FROM users
        WHERE user_id = ${userId}
      `;

      if (!rows[0]) {
        return res.status(404).json({ message: 'User not found' });
      }

      await prisma.$queryRaw`
        UPDATE users
        SET password_hash = ${hashPassword(newPassword)}, updated_at = NOW()
        WHERE user_id = ${userId}
      `;

      return res.status(200).json({ message: 'Password updated successfully' });
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid password change token') {
        return res.status(401).json({ message: 'Invalid or expired password change token' });
      }

      console.error('Error updating password:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

interface DeleteUserBody {
  password: string;
}

// Deletes the user and all dependent records via DB cascades.
// For now, this uses password confirmation (no JWT/session validation implemented yet).
router.delete(
  '/:userId',
  requireOwnUser,
  async (req: Request<GetUserParams, unknown, Partial<DeleteUserBody>>, res: Response) => {
  const { userId } = req.params;
  const { password } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  if (!password) {
    return res.status(400).json({ message: 'Password is required to delete account' });
  }

  try {
    const rows = await prisma.$queryRaw<{ password_hash: string }[]>`
      SELECT password_hash
      FROM users
      WHERE user_id = ${userId}
    `;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'User not found' });
    }

    const passwordMatches = await verifyPassword(password, row.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    await prisma.$queryRaw`
      DELETE FROM users
      WHERE user_id = ${userId}
    `;

    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting user account:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ==============================
// Profile: Skills
// ==============================
router.get('/:userId/skills', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      { user_skill_id: string; name: string; created_at: Date }[]
    >`
      SELECT user_skill_id, name, created_at
      FROM user_skills
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return res
      .status(200)
      .json(
        rows.map((r: { user_skill_id: string; name: string; created_at: Date }) => ({
          id: r.user_skill_id,
          name: r.name,
          createdAt: r.created_at.toISOString(),
        }))
      );
  } catch (err) {
    console.error('Error fetching skills:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/skills',
  requireOwnUser,
  async (req: Request<{ userId: string }, unknown, { name?: string }>, res: Response) => {
    const { userId } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Skill name is required' });
    }

    try {
      const rows = await prisma.$queryRaw<
      { user_skill_id: string; name: string; created_at: Date }[]
      >`
        INSERT INTO user_skills (user_id, name)
        VALUES (${userId}, ${name.trim()})
        RETURNING user_skill_id, name, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.user_skill_id,
        name: created.name,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err: any) {
      // Unique violation (duplicate skill)
      if (err?.code === '23505') {
        return res.status(409).json({ message: 'Skill already exists' });
      }

      console.error('Error creating skill:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.delete(
  '/:userId/skills/:skillId',
  requireOwnUser,
  async (req: Request<{ userId: string; skillId: string }>, res: Response) => {
    const { userId, skillId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM user_skills
          WHERE user_id = ${userId} AND user_skill_id = ${skillId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Skill not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting skill:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ==============================
// Profile: Certifications
// ==============================
router.get('/:userId/certifications', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      {
        certification_id: string;
        name: string;
        issuer: string | null;
        description: string | null;
        credential_url: string | null;
        image_url: string | null;
        issued_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT certification_id, name, issuer, description, credential_url, image_url, issued_at, created_at
      FROM user_certifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return res.status(200).json(
      rows.map((r: {
        certification_id: string;
        name: string;
        issuer: string | null;
        description: string | null;
        credential_url: string | null;
        image_url: string | null;
        issued_at: Date | null;
        created_at: Date;
      }) => ({
        id: r.certification_id,
        name: r.name,
        issuer: r.issuer,
        description: r.description,
        credentialUrl: r.credential_url,
        imageUrl: r.image_url,
        issuedAt: r.issued_at ? r.issued_at.toISOString().slice(0, 10) : null,
        createdAt: r.created_at.toISOString(),
      }))
    );
  } catch (err) {
    console.error('Error fetching certifications:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/certifications',
  requireOwnUser,
  async (
    req: Request<
      { userId: string },
      unknown,
      {
        name?: string;
        issuer?: string;
        credentialUrl?: string;
        issuedAt?: string;
        description?: string;
        imageUrl?: string;
      }
    >,
    res: Response
  ) => {
    const { userId } = req.params;
    const { name, issuer, credentialUrl, issuedAt, description, imageUrl } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Certification name is required' });
    }

    const issuerValue = issuer?.trim() || null;
    const descriptionValue = description?.trim() || null;
    const credentialUrlValue = credentialUrl?.trim() || null;
    const imageUrlValue = imageUrl?.trim() || null;

    const issuedAtDate = issuedAt ? new Date(issuedAt) : null;
    if (issuedAt && Number.isNaN(issuedAtDate?.getTime())) {
      return res.status(400).json({ message: 'issuedAt must be a valid date (YYYY-MM-DD)' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          certification_id: string;
          name: string;
          issuer: string | null;
          description: string | null;
          credential_url: string | null;
          image_url: string | null;
          issued_at: Date | null;
          created_at: Date;
        }[]
      >`
        INSERT INTO user_certifications (user_id, name, issuer, description, credential_url, image_url, issued_at)
        VALUES (${userId}, ${name.trim()}, ${issuerValue}, ${descriptionValue}, ${credentialUrlValue}, ${imageUrlValue}, ${issuedAtDate})
        RETURNING certification_id, name, issuer, description, credential_url, image_url, issued_at, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.certification_id,
        name: created.name,
        issuer: created.issuer,
        description: created.description,
        credentialUrl: created.credential_url,
        imageUrl: created.image_url,
        issuedAt: created.issued_at ? created.issued_at.toISOString().slice(0, 10) : null,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error creating certification:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.patch(
  '/:userId/certifications/:certificationId',
  requireOwnUser,
  async (
    req: Request<
      { userId: string; certificationId: string },
      unknown,
      {
        name?: string;
        issuer?: string;
        credentialUrl?: string;
        issuedAt?: string;
        description?: string;
        imageUrl?: string;
      }
    >,
    res: Response,
  ) => {
    const { userId, certificationId } = req.params;
    const { name, issuer, credentialUrl, issuedAt, description, imageUrl } = req.body;

    const hasName = Object.prototype.hasOwnProperty.call(req.body, 'name');
    const hasIssuer = Object.prototype.hasOwnProperty.call(req.body, 'issuer');
    const hasCredentialUrl = Object.prototype.hasOwnProperty.call(req.body, 'credentialUrl');
    const hasIssuedAt = Object.prototype.hasOwnProperty.call(req.body, 'issuedAt');
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body, 'description');
    const hasImageUrl = Object.prototype.hasOwnProperty.call(req.body, 'imageUrl');

    if (!hasName && !hasIssuer && !hasCredentialUrl && !hasIssuedAt && !hasDescription && !hasImageUrl) {
      return res.status(400).json({ message: 'No certification fields provided for update' });
    }

    if (hasName && !name?.trim()) {
      return res.status(400).json({ message: 'Certification name cannot be empty' });
    }

    const issuedAtDate = hasIssuedAt ? (issuedAt ? new Date(issuedAt) : null) : undefined;
    if (hasIssuedAt && issuedAt && Number.isNaN(issuedAtDate?.getTime())) {
      return res.status(400).json({ message: 'issuedAt must be a valid date (YYYY-MM-DD)' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          certification_id: string;
          name: string;
          issuer: string | null;
          description: string | null;
          credential_url: string | null;
          image_url: string | null;
          issued_at: Date | null;
          created_at: Date;
        }[]
      >`
        UPDATE user_certifications
        SET
          name = CASE WHEN ${hasName} THEN ${name?.trim()} ELSE name END,
          issuer = CASE WHEN ${hasIssuer} THEN ${issuer?.trim() || null} ELSE issuer END,
          description = CASE WHEN ${hasDescription} THEN ${description?.trim() || null} ELSE description END,
          credential_url = CASE WHEN ${hasCredentialUrl} THEN ${credentialUrl?.trim() || null} ELSE credential_url END,
          image_url = CASE WHEN ${hasImageUrl} THEN ${imageUrl?.trim() || null} ELSE image_url END,
          issued_at = CASE WHEN ${hasIssuedAt} THEN ${issuedAtDate ?? null} ELSE issued_at END,
          updated_at = NOW()
        WHERE user_id = ${userId} AND certification_id = ${certificationId}
        RETURNING certification_id, name, issuer, description, credential_url, image_url, issued_at, created_at
      `;

      const updated = rows[0];
      if (!updated) {
        return res.status(404).json({ message: 'Certification not found' });
      }

      return res.status(200).json({
        id: updated.certification_id,
        name: updated.name,
        issuer: updated.issuer,
        description: updated.description,
        credentialUrl: updated.credential_url,
        imageUrl: updated.image_url,
        issuedAt: updated.issued_at ? updated.issued_at.toISOString().slice(0, 10) : null,
        createdAt: updated.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error updating certification:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.delete(
  '/:userId/certifications/:certificationId',
  requireOwnUser,
  async (req: Request<{ userId: string; certificationId: string }>, res: Response) => {
    const { userId, certificationId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM user_certifications
          WHERE user_id = ${userId} AND certification_id = ${certificationId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Certification not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting certification:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ==============================
// Profile: Projects
// ==============================
router.get('/:userId/projects', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      {
        project_id: string;
        title: string;
        description: string;
        source_url: string | null;
        demo_url: string | null;
        image_url: string | null;
        created_at: Date;
        tags: string[] | null;
      }[]
    >`
      SELECT
        p.project_id,
        p.title,
        p.description,
        p.source_url,
        p.demo_url,
        p.image_url,
        p.created_at,
        COALESCE(
          ARRAY_AGG(pt.tag_name ORDER BY pt.tag_name) FILTER (WHERE pt.tag_name IS NOT NULL),
          ARRAY[]::text[]
        ) AS tags
      FROM user_projects p
      LEFT JOIN project_tags pt ON pt.project_id = p.project_id
      WHERE p.user_id = ${userId}
      GROUP BY p.project_id, p.title, p.description, p.source_url, p.demo_url, p.image_url, p.created_at
      ORDER BY p.created_at DESC
    `;

    return res.status(200).json(
      rows.map((r) => ({
        id: r.project_id,
        title: r.title,
        description: r.description,
        link: r.demo_url ?? r.source_url,
        sourceUrl: r.source_url,
        demoUrl: r.demo_url,
        imageUrl: r.image_url,
        tags: r.tags ?? [],
        createdAt: r.created_at.toISOString(),
      }))
    );
  } catch (err) {
    console.error('Error fetching projects:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/projects/upload-image',
  requireOwnUser,
  profilePhotoUpload.single('image') as unknown as RequestHandler<GetUserParams>,
  async (
    req: Request<GetUserParams> & { file?: Express.Multer.File },
    res: Response,
  ) => {
    const { userId } = req.params;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: 'Provide an image file' });
    }

    if (!uploadedFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Only image uploads are allowed' });
    }

    try {
      const imageUrl = await uploadPostMediaToStorage({
        userId,
        fileBuffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
      });

      return res.status(200).json({ imageUrl });
    } catch (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Project image must be 5MB or smaller' });
      }

      if (err instanceof Error && err.message.startsWith('Missing required environment variable')) {
        return res.status(500).json({ message: 'Project image storage is not configured on the server' });
      }

      console.error('Error uploading project image:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.post(
  '/:userId/projects',
  requireOwnUser,
  async (
    req: Request<
      { userId: string },
      unknown,
      { title?: string; description?: string; sourceUrl?: string; demoUrl?: string; imageUrl?: string; tags?: string[] }
    >,
    res: Response
  ) => {
    const { userId } = req.params;
    const { title, description, sourceUrl, demoUrl, imageUrl, tags } = req.body;

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Project title and description are required' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          project_id: string;
          title: string;
          description: string;
          source_url: string | null;
          demo_url: string | null;
          image_url: string | null;
          created_at: Date;
        }[]
      >`
        INSERT INTO user_projects (user_id, title, description, source_url, demo_url, image_url, created_at, updated_at)
        VALUES (
          ${userId},
          ${title.trim()},
          ${description.trim()},
          ${sourceUrl?.trim() || null},
          ${demoUrl?.trim() || null},
          ${imageUrl?.trim() || null},
          NOW(),
          NOW()
        )
        RETURNING project_id, title, description, source_url, demo_url, image_url, created_at
      `;

      const created = rows[0];
      const normalizedTags = Array.isArray(tags)
        ? Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
        : [];

      for (const tagName of normalizedTags) {
        await prisma.$queryRaw`
          INSERT INTO project_tags (project_id, tag_name)
          VALUES (${created.project_id}, ${tagName})
        `;
      }

      return res.status(201).json({
        id: created.project_id,
        title: created.title,
        description: created.description,
        link: created.demo_url ?? created.source_url,
        sourceUrl: created.source_url,
        demoUrl: created.demo_url,
        imageUrl: created.image_url,
        tags: normalizedTags,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error creating project:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.patch(
  '/:userId/projects/:projectId',
  requireOwnUser,
  async (
    req: Request<
      { userId: string; projectId: string },
      unknown,
      { title?: string; description?: string; sourceUrl?: string; demoUrl?: string; imageUrl?: string; tags?: string[] }
    >,
    res: Response,
  ) => {
    const { userId, projectId } = req.params;
    const { title, description, sourceUrl, demoUrl, imageUrl, tags } = req.body;

    const hasTitle = Object.prototype.hasOwnProperty.call(req.body, 'title');
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body, 'description');
    const hasSourceUrl = Object.prototype.hasOwnProperty.call(req.body, 'sourceUrl');
    const hasDemoUrl = Object.prototype.hasOwnProperty.call(req.body, 'demoUrl');
    const hasImageUrl = Object.prototype.hasOwnProperty.call(req.body, 'imageUrl');
    const hasTags = Object.prototype.hasOwnProperty.call(req.body, 'tags');

    if (!hasTitle && !hasDescription && !hasSourceUrl && !hasDemoUrl && !hasImageUrl && !hasTags) {
      return res.status(400).json({ message: 'No project fields provided for update' });
    }

    if (hasTitle && !title?.trim()) {
      return res.status(400).json({ message: 'Project title cannot be empty' });
    }

    if (hasDescription && !description?.trim()) {
      return res.status(400).json({ message: 'Project description cannot be empty' });
    }

    try {
      const updatedRows = await prisma.$queryRaw<
        {
          project_id: string;
          title: string;
          description: string;
          source_url: string | null;
          demo_url: string | null;
          image_url: string | null;
          created_at: Date;
        }[]
      >`
        UPDATE user_projects
        SET
          title = CASE WHEN ${hasTitle} THEN ${title?.trim()} ELSE title END,
          description = CASE WHEN ${hasDescription} THEN ${description?.trim()} ELSE description END,
          source_url = CASE WHEN ${hasSourceUrl} THEN ${sourceUrl?.trim() || null} ELSE source_url END,
          demo_url = CASE WHEN ${hasDemoUrl} THEN ${demoUrl?.trim() || null} ELSE demo_url END,
          image_url = CASE WHEN ${hasImageUrl} THEN ${imageUrl?.trim() || null} ELSE image_url END,
          updated_at = NOW()
        WHERE user_id = ${userId} AND project_id = ${projectId}
        RETURNING project_id, title, description, source_url, demo_url, image_url, created_at
      `;

      const updated = updatedRows[0];
      if (!updated) {
        return res.status(404).json({ message: 'Project not found' });
      }

      if (hasTags) {
        const normalizedTags = Array.isArray(tags)
          ? Array.from(new Set(tags.map((tag) => String(tag).trim()).filter(Boolean)))
          : [];

        await prisma.$queryRaw`
          DELETE FROM project_tags
          WHERE project_id = ${projectId}
        `;

        for (const tagName of normalizedTags) {
          await prisma.$queryRaw`
            INSERT INTO project_tags (project_id, tag_name)
            VALUES (${projectId}, ${tagName})
          `;
        }
      }

      const tagRows = await prisma.$queryRaw<{ tag_name: string }[]>`
        SELECT tag_name
        FROM project_tags
        WHERE project_id = ${projectId}
        ORDER BY tag_name
      `;

      return res.status(200).json({
        id: updated.project_id,
        title: updated.title,
        description: updated.description,
        link: updated.demo_url ?? updated.source_url,
        sourceUrl: updated.source_url,
        demoUrl: updated.demo_url,
        imageUrl: updated.image_url,
        tags: tagRows.map((row) => row.tag_name),
        createdAt: updated.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error updating project:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.delete(
  '/:userId/projects/:projectId',
  requireOwnUser,
  async (req: Request<{ userId: string; projectId: string }>, res: Response) => {
    const { userId, projectId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM user_projects
          WHERE user_id = ${userId} AND project_id = ${projectId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Project not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting project:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ==============================
// Profile: Experiences
// ==============================
router.get('/:userId/experiences', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      {
        experience_id: string;
        role_title: string;
        organization: string;
        description: string | null;
        start_date: Date;
        end_date: Date | null;
        is_current: boolean;
        created_at: Date;
      }[]
    >`
      SELECT experience_id, role_title, organization, description, start_date, end_date, is_current, created_at
      FROM user_experiences
      WHERE user_id = ${userId}
      ORDER BY start_date DESC, created_at DESC
    `;

    return res.status(200).json(
      rows.map((row) => ({
        id: row.experience_id,
        roleTitle: row.role_title,
        organization: row.organization,
        description: row.description,
        startDate: row.start_date.toISOString(),
        endDate: row.end_date ? row.end_date.toISOString() : null,
        isCurrentlyWorking: row.is_current,
        createdAt: row.created_at.toISOString(),
      }))
    );
  } catch (err) {
    console.error('Error fetching experiences:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/experiences',
  requireOwnUser,
  async (
    req: Request<
      { userId: string },
      unknown,
      {
        roleTitle?: string;
        organization?: string;
        description?: string;
        startDate?: string;
        endDate?: string | null;
        isCurrentlyWorking?: boolean;
      }
    >,
    res: Response,
  ) => {
    const { userId } = req.params;
    const { roleTitle, organization, description, startDate, endDate, isCurrentlyWorking } = req.body;

    if (!roleTitle?.trim() || !organization?.trim() || !startDate) {
      return res.status(400).json({ message: 'roleTitle, organization, and startDate are required' });
    }

    const startDateValue = new Date(startDate);
    if (Number.isNaN(startDateValue.getTime())) {
      return res.status(400).json({ message: 'startDate must be a valid date string' });
    }

    const endDateValue = endDate ? new Date(endDate) : null;
    if (endDate && Number.isNaN(endDateValue?.getTime())) {
      return res.status(400).json({ message: 'endDate must be a valid date string' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          experience_id: string;
          role_title: string;
          organization: string;
          description: string | null;
          start_date: Date;
          end_date: Date | null;
          is_current: boolean;
          created_at: Date;
        }[]
      >`
        INSERT INTO user_experiences (user_id, role_title, organization, description, start_date, end_date, is_current)
        VALUES (
          ${userId},
          ${roleTitle.trim()},
          ${organization.trim()},
          ${description?.trim() || null},
          ${startDateValue},
          ${isCurrentlyWorking ? null : endDateValue},
          ${Boolean(isCurrentlyWorking)}
        )
        RETURNING experience_id, role_title, organization, description, start_date, end_date, is_current, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.experience_id,
        roleTitle: created.role_title,
        organization: created.organization,
        description: created.description,
        startDate: created.start_date.toISOString(),
        endDate: created.end_date ? created.end_date.toISOString() : null,
        isCurrentlyWorking: created.is_current,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error creating experience:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.patch(
  '/:userId/experiences/:experienceId',
  requireOwnUser,
  async (
    req: Request<
      { userId: string; experienceId: string },
      unknown,
      {
        roleTitle?: string;
        organization?: string;
        description?: string;
        startDate?: string;
        endDate?: string | null;
        isCurrentlyWorking?: boolean;
      }
    >,
    res: Response,
  ) => {
    const { userId, experienceId } = req.params;
    const { roleTitle, organization, description, startDate, endDate, isCurrentlyWorking } = req.body;

    const hasRoleTitle = Object.prototype.hasOwnProperty.call(req.body, 'roleTitle');
    const hasOrganization = Object.prototype.hasOwnProperty.call(req.body, 'organization');
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body, 'description');
    const hasStartDate = Object.prototype.hasOwnProperty.call(req.body, 'startDate');
    const hasEndDate = Object.prototype.hasOwnProperty.call(req.body, 'endDate');
    const hasIsCurrent = Object.prototype.hasOwnProperty.call(req.body, 'isCurrentlyWorking');

    if (!hasRoleTitle && !hasOrganization && !hasDescription && !hasStartDate && !hasEndDate && !hasIsCurrent) {
      return res.status(400).json({ message: 'No experience fields provided for update' });
    }

    if (hasRoleTitle && !roleTitle?.trim()) {
      return res.status(400).json({ message: 'roleTitle cannot be empty' });
    }

    if (hasOrganization && !organization?.trim()) {
      return res.status(400).json({ message: 'organization cannot be empty' });
    }

    const startDateValue = hasStartDate && startDate ? new Date(startDate) : null;
    if (hasStartDate && startDate && Number.isNaN(startDateValue?.getTime())) {
      return res.status(400).json({ message: 'startDate must be a valid date string' });
    }

    const endDateValue = hasEndDate && endDate ? new Date(endDate) : null;
    if (hasEndDate && endDate && Number.isNaN(endDateValue?.getTime())) {
      return res.status(400).json({ message: 'endDate must be a valid date string' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          experience_id: string;
          role_title: string;
          organization: string;
          description: string | null;
          start_date: Date;
          end_date: Date | null;
          is_current: boolean;
          created_at: Date;
        }[]
      >`
        UPDATE user_experiences
        SET
          role_title = CASE WHEN ${hasRoleTitle} THEN ${roleTitle?.trim()} ELSE role_title END,
          organization = CASE WHEN ${hasOrganization} THEN ${organization?.trim()} ELSE organization END,
          description = CASE WHEN ${hasDescription} THEN ${description?.trim() || null} ELSE description END,
          start_date = CASE WHEN ${hasStartDate} THEN ${startDateValue} ELSE start_date END,
          end_date = CASE
            WHEN ${hasIsCurrent} AND ${Boolean(isCurrentlyWorking)} THEN NULL
            WHEN ${hasEndDate} THEN ${endDateValue}
            ELSE end_date
          END,
          is_current = CASE WHEN ${hasIsCurrent} THEN ${Boolean(isCurrentlyWorking)} ELSE is_current END,
          updated_at = NOW()
        WHERE user_id = ${userId} AND experience_id = ${experienceId}
        RETURNING experience_id, role_title, organization, description, start_date, end_date, is_current, created_at
      `;

      const updated = rows[0];
      if (!updated) {
        return res.status(404).json({ message: 'Experience not found' });
      }

      return res.status(200).json({
        id: updated.experience_id,
        roleTitle: updated.role_title,
        organization: updated.organization,
        description: updated.description,
        startDate: updated.start_date.toISOString(),
        endDate: updated.end_date ? updated.end_date.toISOString() : null,
        isCurrentlyWorking: updated.is_current,
        createdAt: updated.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error updating experience:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.delete(
  '/:userId/experiences/:experienceId',
  requireOwnUser,
  async (req: Request<{ userId: string; experienceId: string }>, res: Response) => {
    const { userId, experienceId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM user_experiences
          WHERE user_id = ${userId} AND experience_id = ${experienceId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Experience not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting experience:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

// ==============================
// Profile: Societies
// ==============================
router.get('/:userId/societies', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      {
        user_society_id: string;
        society_name: string;
        role_name: string;
        start_date: Date | null;
        end_date: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT user_society_id, society_name, role_name, start_date, end_date, created_at
      FROM user_societies
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return res.status(200).json(
      rows.map((row) => ({
        id: row.user_society_id,
        societyName: row.society_name,
        role: row.role_name,
        startDate: row.start_date ? row.start_date.toISOString() : null,
        endDate: row.end_date ? row.end_date.toISOString() : null,
        createdAt: row.created_at.toISOString(),
      }))
    );
  } catch (err) {
    console.error('Error fetching societies:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/societies',
  requireOwnUser,
  async (
    req: Request<
      { userId: string },
      unknown,
      { societyName?: string; role?: string; startDate?: string | null; endDate?: string | null }
    >,
    res: Response,
  ) => {
    const { userId } = req.params;
    const { societyName, role, startDate, endDate } = req.body;

    if (!societyName?.trim() || !role?.trim()) {
      return res.status(400).json({ message: 'societyName and role are required' });
    }

    const startDateValue = startDate ? new Date(startDate) : null;
    if (startDate && Number.isNaN(startDateValue?.getTime())) {
      return res.status(400).json({ message: 'startDate must be a valid date string' });
    }

    const endDateValue = endDate ? new Date(endDate) : null;
    if (endDate && Number.isNaN(endDateValue?.getTime())) {
      return res.status(400).json({ message: 'endDate must be a valid date string' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          user_society_id: string;
          society_name: string;
          role_name: string;
          start_date: Date | null;
          end_date: Date | null;
          created_at: Date;
        }[]
      >`
        INSERT INTO user_societies (user_id, society_name, role_name, start_date, end_date)
        VALUES (${userId}, ${societyName.trim()}, ${role.trim()}, ${startDateValue}, ${endDateValue})
        RETURNING user_society_id, society_name, role_name, start_date, end_date, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.user_society_id,
        societyName: created.society_name,
        role: created.role_name,
        startDate: created.start_date ? created.start_date.toISOString() : null,
        endDate: created.end_date ? created.end_date.toISOString() : null,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error creating society:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.patch(
  '/:userId/societies/:societyId',
  requireOwnUser,
  async (
    req: Request<
      { userId: string; societyId: string },
      unknown,
      { societyName?: string; role?: string; startDate?: string | null; endDate?: string | null }
    >,
    res: Response,
  ) => {
    const { userId, societyId } = req.params;
    const { societyName, role, startDate, endDate } = req.body;

    const hasSocietyName = Object.prototype.hasOwnProperty.call(req.body, 'societyName');
    const hasRole = Object.prototype.hasOwnProperty.call(req.body, 'role');
    const hasStartDate = Object.prototype.hasOwnProperty.call(req.body, 'startDate');
    const hasEndDate = Object.prototype.hasOwnProperty.call(req.body, 'endDate');

    if (!hasSocietyName && !hasRole && !hasStartDate && !hasEndDate) {
      return res.status(400).json({ message: 'No society fields provided for update' });
    }

    if (hasSocietyName && !societyName?.trim()) {
      return res.status(400).json({ message: 'societyName cannot be empty' });
    }

    if (hasRole && !role?.trim()) {
      return res.status(400).json({ message: 'role cannot be empty' });
    }

    const startDateValue = hasStartDate && startDate ? new Date(startDate) : null;
    if (hasStartDate && startDate && Number.isNaN(startDateValue?.getTime())) {
      return res.status(400).json({ message: 'startDate must be a valid date string' });
    }

    const endDateValue = hasEndDate && endDate ? new Date(endDate) : null;
    if (hasEndDate && endDate && Number.isNaN(endDateValue?.getTime())) {
      return res.status(400).json({ message: 'endDate must be a valid date string' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          user_society_id: string;
          society_name: string;
          role_name: string;
          start_date: Date | null;
          end_date: Date | null;
          created_at: Date;
        }[]
      >`
        UPDATE user_societies
        SET
          society_name = CASE WHEN ${hasSocietyName} THEN ${societyName?.trim()} ELSE society_name END,
          role_name = CASE WHEN ${hasRole} THEN ${role?.trim()} ELSE role_name END,
          start_date = CASE WHEN ${hasStartDate} THEN ${startDateValue} ELSE start_date END,
          end_date = CASE WHEN ${hasEndDate} THEN ${endDateValue} ELSE end_date END,
          updated_at = NOW()
        WHERE user_id = ${userId} AND user_society_id = ${societyId}
        RETURNING user_society_id, society_name, role_name, start_date, end_date, created_at
      `;

      const updated = rows[0];
      if (!updated) {
        return res.status(404).json({ message: 'Society not found' });
      }

      return res.status(200).json({
        id: updated.user_society_id,
        societyName: updated.society_name,
        role: updated.role_name,
        startDate: updated.start_date ? updated.start_date.toISOString() : null,
        endDate: updated.end_date ? updated.end_date.toISOString() : null,
        createdAt: updated.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error updating society:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.delete(
  '/:userId/societies/:societyId',
  requireOwnUser,
  async (req: Request<{ userId: string; societyId: string }>, res: Response) => {
    const { userId, societyId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM user_societies
          WHERE user_id = ${userId} AND user_society_id = ${societyId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Society not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting society:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

// ==============================
// Profile: Achievements
// ==============================
router.get('/:userId/achievements', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      {
        achievement_id: string;
        title: string;
        description: string | null;
        achievement_year: number;
        created_at: Date;
      }[]
    >`
      SELECT achievement_id, title, description, achievement_year, created_at
      FROM user_achievements
      WHERE user_id = ${userId}
      ORDER BY achievement_year DESC, created_at DESC
    `;

    return res.status(200).json(
      rows.map((row) => ({
        id: row.achievement_id,
        title: row.title,
        description: row.description,
        year: row.achievement_year,
        createdAt: row.created_at.toISOString(),
      }))
    );
  } catch (err) {
    console.error('Error fetching achievements:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/achievements',
  requireOwnUser,
  async (
    req: Request<{ userId: string }, unknown, { title?: string; description?: string; year?: number }>,
    res: Response,
  ) => {
    const { userId } = req.params;
    const { title, description, year } = req.body;

    if (!title?.trim() || year === undefined || !Number.isInteger(year)) {
      return res.status(400).json({ message: 'title and integer year are required' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          achievement_id: string;
          title: string;
          description: string | null;
          achievement_year: number;
          created_at: Date;
        }[]
      >`
        INSERT INTO user_achievements (user_id, title, description, achievement_year)
        VALUES (${userId}, ${title.trim()}, ${description?.trim() || null}, ${year})
        RETURNING achievement_id, title, description, achievement_year, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.achievement_id,
        title: created.title,
        description: created.description,
        year: created.achievement_year,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error creating achievement:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.patch(
  '/:userId/achievements/:achievementId',
  requireOwnUser,
  async (
    req: Request<
      { userId: string; achievementId: string },
      unknown,
      { title?: string; description?: string; year?: number }
    >,
    res: Response,
  ) => {
    const { userId, achievementId } = req.params;
    const { title, description, year } = req.body;

    const hasTitle = Object.prototype.hasOwnProperty.call(req.body, 'title');
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body, 'description');
    const hasYear = Object.prototype.hasOwnProperty.call(req.body, 'year');

    if (!hasTitle && !hasDescription && !hasYear) {
      return res.status(400).json({ message: 'No achievement fields provided for update' });
    }

    if (hasTitle && !title?.trim()) {
      return res.status(400).json({ message: 'title cannot be empty' });
    }

    if (hasYear && (year === undefined || !Number.isInteger(year))) {
      return res.status(400).json({ message: 'year must be an integer' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          achievement_id: string;
          title: string;
          description: string | null;
          achievement_year: number;
          created_at: Date;
        }[]
      >`
        UPDATE user_achievements
        SET
          title = CASE WHEN ${hasTitle} THEN ${title?.trim()} ELSE title END,
          description = CASE WHEN ${hasDescription} THEN ${description?.trim() || null} ELSE description END,
          achievement_year = CASE WHEN ${hasYear} THEN ${year} ELSE achievement_year END,
          updated_at = NOW()
        WHERE user_id = ${userId} AND achievement_id = ${achievementId}
        RETURNING achievement_id, title, description, achievement_year, created_at
      `;

      const updated = rows[0];
      if (!updated) {
        return res.status(404).json({ message: 'Achievement not found' });
      }

      return res.status(200).json({
        id: updated.achievement_id,
        title: updated.title,
        description: updated.description,
        year: updated.achievement_year,
        createdAt: updated.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error updating achievement:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.delete(
  '/:userId/achievements/:achievementId',
  requireOwnUser,
  async (req: Request<{ userId: string; achievementId: string }>, res: Response) => {
    const { userId, achievementId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM user_achievements
          WHERE user_id = ${userId} AND achievement_id = ${achievementId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Achievement not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting achievement:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

// ==============================
// Profile: Posts
// ==============================
router.get('/:userId/posts', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<UserPostRow[]>`
      SELECT
        p.post_id,
        p.author_user_id,
        p.club_id,
        p.post_type,
        p.opportunity_type,
        p.title,
        p.content_text,
        p.company_name,
        p.application_deadline,
        p.stipend,
        p.duration,
        p.event_date,
        p.location,
        p.external_url,
        p.visibility,
        COALESCE(
          (
            SELECT ARRAY_AGG(h.tag_name ORDER BY h.tag_name)
            FROM post_hashtags ph
            JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
            WHERE ph.post_id = p.post_id
          ),
          ARRAY[]::text[]
        ) AS hashtags,
        COALESCE(
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'postMediaId', pm.post_media_id,
                'mediaUrl', pm.media_url,
                'mediaType', pm.media_type,
                'sortOrder', pm.sort_order
              )
              ORDER BY pm.sort_order ASC, pm.created_at ASC
            )
            FROM post_media pm
            WHERE pm.post_id = p.post_id
          ),
          '[]'::json
        ) AS media,
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
        (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comment_count,
        (SELECT COUNT(*)::int FROM post_saves ps WHERE ps.post_id = p.post_id) AS save_count,
        p.created_at,
        p.updated_at
      FROM posts p
      WHERE p.author_user_id = ${userId}
      ORDER BY p.created_at DESC
    `;

    return res.status(200).json(rows.map(mapUserPostRow));
  } catch (err) {
    console.error('Error fetching posts:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/posts',
  requireOwnUser,
  postMediaUpload.array('media', 10),
  async (
    req: Request<{ userId: string }, unknown, CreateUserPostBody & { payload?: string }>,
    res: Response
  ) => {
    const { userId } = req.params;
    let requestBody: CreateUserPostBody;
    try {
      requestBody =
        typeof req.body?.payload === 'string'
          ? (JSON.parse(req.body.payload) as CreateUserPostBody)
          : req.body;
    } catch {
      return res.status(400).json({ message: 'Invalid JSON payload' });
    }

    const {
      postType,
      opportunityType,
      title,
      contentText,
      company,
      deadline,
      stipend,
      duration,
      eventDate,
      location,
      externalUrl,
      visibility,
      clubId,
      hashtags,
      media,
    } = requestBody;

    const clubIdValue = clubId?.trim() || null;

    const allowedPostTypes: DbPostType[] = ['general', 'event', 'opportunity', 'club_activity'];
    const allowedOpportunityTypes: DbOpportunityType[] = ['internship', 'hackathon', 'event', 'contest', 'club'];
    const allowedVisibilities: DbPostVisibility[] = ['public', 'followers', 'club_members'];

    const nextPostType = (postType ?? (clubIdValue ? 'club_activity' : 'general')).toLowerCase() as DbPostType;
    if (!allowedPostTypes.includes(nextPostType)) {
      return res.status(400).json({ message: 'postType must be general, event, opportunity, or club_activity' });
    }

    const nextOpportunityType = opportunityType ? String(opportunityType).toLowerCase() as DbOpportunityType : null;
    if (nextPostType === 'opportunity' && !nextOpportunityType) {
      return res.status(400).json({ message: 'opportunityType is required when postType=opportunity' });
    }

    if (nextOpportunityType && !allowedOpportunityTypes.includes(nextOpportunityType)) {
      return res.status(400).json({ message: 'Invalid opportunityType' });
    }

    if (nextPostType !== 'opportunity' && nextOpportunityType) {
      return res.status(400).json({ message: 'opportunityType is only allowed when postType=opportunity' });
    }

    const nextVisibility = (visibility ?? 'public').toLowerCase() as DbPostVisibility;
    if (!allowedVisibilities.includes(nextVisibility)) {
      return res.status(400).json({ message: 'visibility must be public, followers, or club_members' });
    }

    const titleValue = title?.trim() || null;
    const contentValue = contentText?.trim() || null;
    const companyValue = company?.trim() || null;
    const stipendValue = stipend?.trim() || null;
    const durationValue = duration?.trim() || null;
    const locationValue = location?.trim() || null;
    const externalUrlValue = externalUrl?.trim() || null;
    if (!titleValue && !contentValue) {
      return res.status(400).json({ message: 'At least one of title or contentText is required' });
    }

    if (titleValue && titleValue.length > 255) {
      return res.status(400).json({ message: 'title must be 255 characters or fewer' });
    }

    if (locationValue && locationValue.length > 255) {
      return res.status(400).json({ message: 'location must be 255 characters or fewer' });
    }

    if (companyValue && companyValue.length > 255) {
      return res.status(400).json({ message: 'company must be 255 characters or fewer' });
    }

    if (stipendValue && stipendValue.length > 100) {
      return res.status(400).json({ message: 'stipend must be 100 characters or fewer' });
    }

    if (durationValue && durationValue.length > 100) {
      return res.status(400).json({ message: 'duration must be 100 characters or fewer' });
    }

    if (nextPostType === 'general' && !contentValue) {
      return res.status(400).json({ message: 'contentText is required for general posts' });
    }

    if (nextPostType === 'event' && !titleValue) {
      return res.status(400).json({ message: 'title is required for event posts' });
    }

    if (nextPostType === 'opportunity' && (!titleValue || !contentValue)) {
      return res.status(400).json({ message: 'title and contentText are required for opportunity posts' });
    }

    if (nextPostType === 'club_activity' && !clubIdValue) {
      return res.status(400).json({ message: 'clubId is required for club_activity posts' });
    }

    if (nextVisibility === 'club_members' && !clubIdValue) {
      return res.status(400).json({ message: 'clubId is required when visibility=club_members' });
    }

    const eventDateValue = eventDate ? new Date(eventDate) : null;
    if (eventDate && Number.isNaN(eventDateValue?.getTime())) {
      return res.status(400).json({ message: 'eventDate must be a valid ISO date string' });
    }

    const deadlineValue = deadline ? new Date(deadline) : null;
    if (deadline && Number.isNaN(deadlineValue?.getTime())) {
      return res.status(400).json({ message: 'deadline must be a valid ISO date string' });
    }

    const normalizedHashtags = normalizeHashtags(hashtags);
    const explicitMedia = Array.isArray(media)
      ? media
          .map((item, index) => {
            const mediaUrl = item.mediaUrl?.trim();
            if (!mediaUrl) return null;

            return {
              mediaUrl,
              mediaType: item.mediaType?.trim() || 'image',
              sortOrder: Number.isInteger(item.sortOrder) ? Number(item.sortOrder) : index,
            };
          })
          .filter((item): item is { mediaUrl: string; mediaType: string; sortOrder: number } => item !== null)
      : [];

    const uploadedFiles = Array.isArray(req.files)
      ? req.files
      : Object.values(req.files ?? {}).flat();
    if (uploadedFiles.some((file) => !file.mimetype.startsWith('image/'))) {
      return res.status(400).json({ message: 'Only image uploads are allowed for post media' });
    }

    if (explicitMedia.length + uploadedFiles.length > 10) {
      return res.status(400).json({ message: 'A post can include at most 10 media items' });
    }

    let uploadedMediaEntries: Array<{ mediaUrl: string; mediaType: string; sortOrder: number }> = [];

    try {
      if (clubIdValue) {
        const clubRows = await prisma.$queryRaw<{ club_id: string }[]>`
          SELECT club_id
          FROM clubs
          WHERE club_id = ${clubIdValue}
          LIMIT 1
        `;

        if (!clubRows[0]) {
          return res.status(400).json({ message: 'clubId does not exist' });
        }

        const clubPermissions = await getCachedClubPermissionSnapshot(clubIdValue, userId);
        if (!clubPermissions?.canViewClub) {
          return res.status(403).json({ message: 'You are not allowed to post in this club' });
        }

        const activeMembership = await requireActiveClubMembership(clubIdValue, userId);
        if (nextPostType === 'club_activity' && !activeMembership) {
          return res.status(403).json({ message: 'Active club membership is required for club_activity posts' });
        }

        if (nextVisibility === 'club_members' && !activeMembership) {
          return res.status(403).json({ message: 'Active club membership is required for club_members visibility' });
        }
      }

      uploadedMediaEntries = await Promise.all(
        uploadedFiles.map(async (file, index) => ({
          mediaUrl: await uploadPostMediaToStorage({
            userId,
            fileBuffer: file.buffer,
            mimeType: file.mimetype,
          }),
          mediaType: file.mimetype,
          sortOrder: explicitMedia.length + index,
        }))
      );

      const normalizedMedia = [...explicitMedia, ...uploadedMediaEntries];

      const createdPostId = await prisma.$transaction(async (tx) => {
        const inserted = await tx.$queryRaw<{ post_id: string }[]>`
          INSERT INTO posts (
            author_user_id,
            club_id,
            post_type,
            opportunity_type,
            title,
            content_text,
            company_name,
            application_deadline,
            stipend,
            duration,
            event_date,
            location,
            external_url,
            visibility
          )
          VALUES (
            ${userId},
            ${clubIdValue},
            CAST(${nextPostType} AS "PostType"),
            CAST(${nextOpportunityType} AS "OpportunityType"),
            ${titleValue},
            ${contentValue},
            ${companyValue},
            ${deadlineValue},
            ${stipendValue},
            ${durationValue},
            ${eventDateValue},
            ${locationValue},
            ${externalUrlValue},
            CAST(${nextVisibility} AS "PostVisibility")
          )
          RETURNING post_id
        `;

        const postId = inserted[0]?.post_id;
        if (!postId) {
          throw new Error('Failed to create post');
        }

        for (const tagName of normalizedHashtags) {
          const hashtagRows = await tx.$queryRaw<{ hashtag_id: string }[]>`
            INSERT INTO hashtags (tag_name)
            VALUES (${tagName})
            ON CONFLICT (tag_name)
            DO UPDATE SET tag_name = EXCLUDED.tag_name
            RETURNING hashtag_id
          `;

          const hashtagId = hashtagRows[0]?.hashtag_id;
          if (!hashtagId) {
            throw new Error('Failed to upsert hashtag');
          }

          await tx.$queryRaw`
            INSERT INTO post_hashtags (post_id, hashtag_id)
            VALUES (${postId}, ${hashtagId})
            ON CONFLICT (post_id, hashtag_id) DO NOTHING
          `;
        }

        for (const mediaItem of normalizedMedia) {
          await tx.$queryRaw`
            INSERT INTO post_media (post_id, media_url, media_type, sort_order)
            VALUES (${postId}, ${mediaItem.mediaUrl}, ${mediaItem.mediaType}, ${mediaItem.sortOrder})
          `;
        }

        return postId;
      });

      const rows = await prisma.$queryRaw<UserPostRow[]>`
        SELECT
          p.post_id,
          p.author_user_id,
          p.club_id,
          p.post_type,
          p.opportunity_type,
          p.title,
          p.content_text,
          p.company_name,
          p.application_deadline,
          p.stipend,
          p.duration,
          p.event_date,
          p.location,
          p.external_url,
          p.visibility,
          COALESCE(
            (
              SELECT ARRAY_AGG(h.tag_name ORDER BY h.tag_name)
              FROM post_hashtags ph
              JOIN hashtags h ON h.hashtag_id = ph.hashtag_id
              WHERE ph.post_id = p.post_id
            ),
            ARRAY[]::text[]
          ) AS hashtags,
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'postMediaId', pm.post_media_id,
                  'mediaUrl', pm.media_url,
                  'mediaType', pm.media_type,
                  'sortOrder', pm.sort_order
                )
                ORDER BY pm.sort_order ASC, pm.created_at ASC
              )
              FROM post_media pm
              WHERE pm.post_id = p.post_id
            ),
            '[]'::json
          ) AS media,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
          (SELECT COUNT(*)::int FROM post_comments pc WHERE pc.post_id = p.post_id) AS comment_count,
          (SELECT COUNT(*)::int FROM post_saves ps WHERE ps.post_id = p.post_id) AS save_count,
          p.created_at,
          p.updated_at
        FROM posts p
        WHERE p.author_user_id = ${userId} AND p.post_id = ${createdPostId}
        LIMIT 1
      `;

      const created = rows[0];
      if (!created) {
        return res.status(404).json({ message: 'Created post could not be loaded' });
      }

      const recipients = await getPostFeedRecipientIds(created.post_id);
      await refreshPostCaches(created.post_id, userId);
      await addPostToFeedCaches(created.post_id, created.created_at, recipients);
      if (created.club_id) {
        await invalidateClubFeedCaches(created.club_id);
        await incrementClubStat(created.club_id, 'postCount', 1);
      }
      emitFeedEvent(recipients, {
        type: 'feed:post_created',
        payload: {
          postId: created.post_id,
          authorUserId: userId,
          createdAt: created.created_at.toISOString(),
        },
      });

      await createPostPublishedNotifications({
        authorUserId: userId,
        postId: created.post_id,
        postTitle: created.title,
      });
      if (created.club_id) {
        await notifyClubPostPublished({
          clubId: created.club_id,
          postId: created.post_id,
          actorUserId: userId,
          postTitle: created.title,
        });
      }
      await incrementUserStat(userId, 'postCount', 1);
      await trackPostCreatedHashtags(userId, normalizedHashtags);
      queueSuggestedUsersRecompute(userId);

      return res.status(201).json(mapUserPostRow(created));
    } catch (err) {
      await Promise.allSettled(
        uploadedMediaEntries.map(async (item) => {
          await deleteManagedPostMediaByUrl(item.mediaUrl);
        })
      );

      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Post image must be 10MB or smaller' });
      }

      if (err instanceof Error && err.message.startsWith('Missing required environment variable')) {
        return res.status(500).json({ message: 'Post media storage is not configured on the server' });
      }

      console.error('Error creating post:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;
