const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type PostType = 'general' | 'event' | 'opportunity' | 'club_activity';
export type OpportunityType = 'internship' | 'hackathon' | 'event' | 'contest' | 'club';
export type PostVisibility = 'public' | 'followers' | 'club_members';

export interface UserPostMedia {
  postMediaId: string;
  mediaUrl: string;
  mediaType: string;
  sortOrder: number;
}

export interface UserPost {
  id: string;
  authorUserId: string;
  clubId: string | null;
  postType: PostType;
  opportunityType: OpportunityType | null;
  title: string | null;
  contentText: string | null;
  company: string | null;
  deadline: string | null;
  stipend: string | null;
  duration: string | null;
  eventDate: string | null;
  location: string | null;
  externalUrl: string | null;
  visibility: PostVisibility;
  hashtags: string[];
  media: UserPostMedia[];
  likeCount: number;
  commentCount: number;
  saveCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPostPayload {
  postType?: PostType;
  opportunityType?: OpportunityType | null;
  title?: string;
  contentText?: string;
  company?: string;
  deadline?: string;
  stipend?: string;
  duration?: string;
  eventDate?: string;
  location?: string;
  externalUrl?: string;
  visibility?: PostVisibility;
  clubId?: string | null;
  hashtags?: string[];
  media?: Array<{
    mediaUrl: string;
    mediaType?: string;
    sortOrder?: number;
  }>;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

function normalizeUserPost(raw: any): UserPost {
  return {
    id: String(raw?.id ?? ''),
    authorUserId: String(raw?.authorUserId ?? ''),
    clubId: raw?.clubId ? String(raw.clubId) : null,
    postType: String(raw?.postType ?? 'general') as PostType,
    opportunityType: raw?.opportunityType ? String(raw.opportunityType) as OpportunityType : null,
    title: raw?.title ? String(raw.title) : null,
    contentText: raw?.contentText ? String(raw.contentText) : null,
    company: raw?.company ? String(raw.company) : null,
    deadline: raw?.deadline ? String(raw.deadline) : null,
    stipend: raw?.stipend ? String(raw.stipend) : null,
    duration: raw?.duration ? String(raw.duration) : null,
    eventDate: raw?.eventDate ? String(raw.eventDate) : null,
    location: raw?.location ? String(raw.location) : null,
    externalUrl: raw?.externalUrl ? String(raw.externalUrl) : null,
    visibility: String(raw?.visibility ?? 'public') as PostVisibility,
    hashtags: Array.isArray(raw?.hashtags) ? raw.hashtags.map((h: unknown) => String(h)) : [],
    media: Array.isArray(raw?.media)
      ? raw.media.map((m: any) => ({
          postMediaId: String(m?.postMediaId ?? ''),
          mediaUrl: String(m?.mediaUrl ?? ''),
          mediaType: String(m?.mediaType ?? 'image'),
          sortOrder: Number.isFinite(Number(m?.sortOrder)) ? Number(m.sortOrder) : 0,
        }))
      : [],
    likeCount: Number.isFinite(Number(raw?.likeCount)) ? Number(raw.likeCount) : 0,
    commentCount: Number.isFinite(Number(raw?.commentCount)) ? Number(raw.commentCount) : 0,
    saveCount: Number.isFinite(Number(raw?.saveCount)) ? Number(raw.saveCount) : 0,
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
  };
}

export async function apiFetchUserPosts(userId: string, token?: string): Promise<UserPost[]> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/posts`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  if (!Array.isArray(data)) return [];

  return data.map((item) => normalizeUserPost(item));
}

export async function apiCreateUserPost(
  userId: string,
  payload: CreateUserPostPayload,
  token?: string,
  mediaFiles?: File[]
): Promise<UserPost> {
  const hasFiles = Array.isArray(mediaFiles) && mediaFiles.length > 0;
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/posts`, {
    method: 'POST',
    headers: hasFiles
      ? { ...authHeaders(token) }
      : {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
    body: hasFiles
      ? (() => {
          const formData = new FormData();
          formData.append('payload', JSON.stringify(payload));
          for (const file of mediaFiles) {
            formData.append('media', file);
          }
          return formData;
        })()
      : JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  return normalizeUserPost(data);
}
