export interface Student {
  id: string;
  name: string;
  email: string;
  branch: string;
  year: number;
  avatar: string;
  bio: string;
  skills: string[];
  interests: string[];
  certifications: string[];
  projects: Project[];
  resumeUrl?: string;
  connections: string[];
  pendingRequests: string[];
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
}

export interface Notification {
  id: string;
  type: 'connection' | 'like' | 'comment' | 'message' | 'opportunity' | 'club';
  title: string;
  message: string;
  avatar: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}
