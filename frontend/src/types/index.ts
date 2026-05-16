export type RequestStatus = 'none' | 'requested';

export type AccountType = 'public' | 'private';

export interface Certification {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  issuedAt?: string | null;
  createdAt?: string;
}

export interface Experience {
  id: string;
  roleTitle: string;
  organization: string;
  duration: string;
  description: string;
}

export interface Society {
  id: string;
  societyName: string;
  role: string;
  duration: string;
}

export interface Achievement {
  id: string;
  title: string;
  year: number;
  description?: string;
}

export interface Student {
  id: string;
  name: string;
  displayName?: string;
  username: string;
  email: string;
  createdAt?: string;
  branch: string;
  year: number;
  avatar: string;
  coverPhotoUrl?: string;
  bio?: string;
  skills: string[];
  interests: string[];
  certifications: Certification[];
  experience: Experience[];
  societies: Society[];
  achievements: Achievement[];
  projects: Project[];
  resumeUrl?: string;
  accountType: AccountType;
  stats?: {
    followerCount: number;
    followingCount: number;
    postCount: number;
  };
  viewerHasBlockedUser?: boolean;
  profileVisibility?: 'full' | 'blocked-by-viewer' | 'restricted';
}

export interface Project {
  id: string;
  title: string;
  description: string;
  link: string;
  tags: string[];
}

export interface Opportunity {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  clubId?: string | null;
  clubName?: string | null;
  clubSlug?: string | null;
  clubAvatarUrl?: string | null;
  type: 'general' | 'internship' | 'hackathon' | 'event' | 'contest' | 'club' | 'project';
  title: string;
  description: string;
  date: string;
  company?: string;
  deadline?: string;
  stipend?: string;
  duration?: string;
  location?: string;
  link?: string;
  image?: string;
  imageFile?: File;
  tags?: string[];
  likes: string[];
  comments: Comment[];
  saved: string[];
  likeCount?: number;
  saveCount?: number;
  commentCount?: number;
  isLikedByMe?: boolean;
  isSavedByMe?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export interface Comment {
  id: string;
  postId?: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: string;
  parentCommentId?: string | null;
  replies?: Comment[];
  likeCount?: number;
  replyCount?: number;
  isLikedByMe?: boolean;
  canDelete?: boolean;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description: string | null;
  privacy: 'open' | 'request' | 'private';
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  primaryCategory?: {
    id: string;
    displayName: string | null;
  } | null;
  tags: string[];
  memberCount: number;
  postCount: number;
  membership?: {
    status: 'active' | 'pending' | 'invited' | 'removed' | 'left' | null;
    role: 'owner' | 'admin' | 'member' | null;
  };
  permissions?: {
    canViewClub: boolean;
    canJoinClub: boolean;
    canRequestJoin: boolean;
    canManageClub: boolean;
    canModerateMembers: boolean;
    canCreatePosts: boolean;
    canComment: boolean;
    canInviteMembers: boolean;
    membershipStatus: 'active' | 'pending' | 'invited' | 'removed' | 'left' | null;
    membershipRole: 'owner' | 'admin' | 'member' | null;
  } | null;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export interface ChatConversation {
  id: string;
  participantId: string;
  participantName: string;
  participantUsername?: string;
  participantAvatar: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  isRequest?: boolean;
  viewerHasBlockedUser?: boolean;
  isPending?: boolean;
  isGroup?: boolean;
  groupMembers?: string[];
  groupMemberCount?: number;
}

export interface Notification {
  id: string;
  type:
    | 'follow'
    | 'follow_request'
    | 'follow_accept'
    | 'follow_reject'
    | 'like'
    | 'comment'
    | 'reply'
    | 'message'
    | 'opportunity'
    | 'club';
  title: string;
  message: string;
  avatar: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  entityType?: string | null;
  entityId?: string | null;
  actorId?: string;
  actorUsername?: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  avatar: string;
  members: string[];
  admins: string[];
  createdAt: string;
  createdBy: string;
}

// ==============================
// Backend API types
// ==============================
export type ApiUserType = 'student' | 'alumni' | 'teacher' | 'unknown';
export type ApiUserVerificationState =
  | 'student_google_verified'
  | 'alumni_pending_review'
  | 'alumni_verified'
  | 'alumni_rejected';
export type ApiAuthProvider = 'google' | 'magic_link';

export interface ApiUserProfile {
  userId: string;
  displayName: string;
  username: string;
  email: string;
  bio: string | null;
  headline?: string | null;
  profilePictureUrl: string | null;
  coverPhotoUrl?: string | null;
  isPublic: boolean;
  createdAt: string; // ISO string
  type: ApiUserType;
  authProvider?: ApiAuthProvider;
  verificationState?: ApiUserVerificationState | null;
  onboardingCompletedAt?: string | null;
  details?: {
    branch?: string;
    year?: number;
    passingYear?: number;
  };
  stats?: {
    followerCount: number;
    followingCount: number;
    postCount: number;
  };
  adminAccess?: {
    role: 'super_admin';
    mustChangePassword: boolean;
    lastLoginAt: string | null;
  } | null;
  viewerHasBlockedUser?: boolean;
  profileVisibility?: 'full' | 'blocked-by-viewer' | 'restricted';
}

export interface BlockedUserListItem {
  userId: string;
  displayName: string;
  username: string;
  profilePictureUrl: string | null;
  type: 'student' | 'alumni';
  branch: string | null;
  year: number | null;
  createdAt: string;
}

export interface ApiUserSession {
  sessionId: string;
  deviceName: string;
  browserName: string;
  platform: string;
  locationLabel: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  isCurrent: boolean;
}

export interface ApiUserSettings {
  notifications: {
    emailNotifications: boolean;
    followRequests: boolean;
    newMessages: boolean;
    opportunityAlerts: boolean;
    clubUpdates: boolean;
    newPostAlerts: boolean;
  };
  privacy: {
    accountType: AccountType;
    showEmail: boolean;
    showProjects: boolean;
    allowMessages: boolean;
  };
}
