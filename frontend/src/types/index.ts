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
  headline?: string;
  username: string;
  email: string;
  branch: string;
  year: number;
  avatar: string;
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
  type: 'general' | 'internship' | 'hackathon' | 'event' | 'contest' | 'club';
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
  isLikedByMe?: boolean;
  canDelete?: boolean;
}

export interface Club {
  id: string;
  name: string;
  description: string;
  avatar: string;
  members: string[];
  admin: string;
  posts: string[];
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
  participantAvatar: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  isGroup?: boolean;
  groupMembers?: string[];
}

export interface Notification {
  id: string;
  type: 'follow' | 'follow_request' | 'follow_accept' | 'like' | 'comment' | 'message' | 'opportunity' | 'club';
  title: string;
  message: string;
  avatar: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  entityId?: string | null;
  actorId?: string;
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

export interface ApiUserProfile {
  userId: string;
  username: string;
  email: string;
  bio: string | null;
  profilePictureUrl: string | null;
  isPublic: boolean;
  createdAt: string; // ISO string
  type: ApiUserType;
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
    weeklyDigest: boolean;
  };
  privacy: {
    accountType: AccountType;
    showEmail: boolean;
    showProjects: boolean;
    allowMessages: boolean;
  };
}
