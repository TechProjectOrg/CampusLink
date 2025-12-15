<<<<<<< HEAD
export type AccountType = 'public' | 'private';
=======
export interface Certification {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  issuedAt?: string | null;
  createdAt?: string;
}
>>>>>>> HimaniBranch

export interface Student {
  id: string;
  name: string;
  username: string;
  email: string;
  branch: string;
  year: number;
  avatar: string;
  bio: string;
  skills: string[];
  interests: string[];
  certifications: Certification[];
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
  type: 'internship' | 'hackathon' | 'event' | 'contest' | 'club';
  title: string;
  description: string;
  date: string;
  location?: string;
  link?: string;
  image?: string;
  likes: string[];
  comments: Comment[];
  saved: string[];
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: string;
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
  type: 'follow' | 'like' | 'comment' | 'message' | 'opportunity' | 'club';
  title: string;
  message: string;
  avatar: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
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
