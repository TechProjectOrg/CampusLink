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

export interface PostComment {
  id: string;
  postId: string;
  authorUserId: string;
  authorUsername: string;
  authorProfilePictureUrl: string | null;
  parentCommentId: string | null;
  content: string;
  likeCount: number;
  isLikedByMe: boolean;
  canDelete: boolean;
  replies: PostComment[];
  createdAt: string;
  updatedAt: string;
}

export interface UserPost {
  id: string;
  authorUserId: string;
  authorUsername?: string;
  authorProfilePictureUrl?: string | null;
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
  isLikedByMe: boolean;
  isSavedByMe: boolean;
  canEdit: boolean;
  canDelete: boolean;
  comments: PostComment[];
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

export interface UpdatePostPayload {
  title?: string;
  contentText?: string;
  company?: string;
  deadline?: string;
  stipend?: string;
  duration?: string;
  eventDate?: string;
  location?: string;
  externalUrl?: string;
  hashtags?: string[];
}

export interface CommentContext {
  commentId: string;
  postId: string;
  parentCommentId: string | null;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

function normalizeComment(raw: any): PostComment {
  return {
    id: String(raw?.id ?? ''),
    postId: String(raw?.postId ?? ''),
    authorUserId: String(raw?.authorUserId ?? ''),
    authorUsername: String(raw?.authorUsername ?? 'Unknown User'),
    authorProfilePictureUrl: raw?.authorProfilePictureUrl ? String(raw.authorProfilePictureUrl) : null,
    parentCommentId: raw?.parentCommentId ? String(raw.parentCommentId) : null,
    content: String(raw?.content ?? ''),
    likeCount: Number.isFinite(Number(raw?.likeCount)) ? Number(raw.likeCount) : 0,
    isLikedByMe: Boolean(raw?.isLikedByMe),
    canDelete: Boolean(raw?.canDelete),
    replies: Array.isArray(raw?.replies) ? raw.replies.map((item: any) => normalizeComment(item)) : [],
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
  };
}

function normalizeUserPost(raw: any): UserPost {
  return {
    id: String(raw?.id ?? ''),
    authorUserId: String(raw?.authorUserId ?? ''),
    authorUsername: raw?.authorUsername ? String(raw.authorUsername) : undefined,
    authorProfilePictureUrl: raw?.authorProfilePictureUrl ? String(raw.authorProfilePictureUrl) : null,
    clubId: raw?.clubId ? String(raw.clubId) : null,
    postType: String(raw?.postType ?? 'general') as PostType,
    opportunityType: raw?.opportunityType ? (String(raw.opportunityType) as OpportunityType) : null,
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
    isLikedByMe: Boolean(raw?.isLikedByMe),
    isSavedByMe: Boolean(raw?.isSavedByMe),
    canEdit: Boolean(raw?.canEdit),
    canDelete: Boolean(raw?.canDelete),
    comments: Array.isArray(raw?.comments) ? raw.comments.map((c: any) => normalizeComment(c)) : [],
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
  };
}

export async function apiFetchFeedPosts(token?: string, hashtag?: string): Promise<UserPost[]> {
  const params = new URLSearchParams();
  if (hashtag?.trim()) {
    params.set('hashtag', hashtag.trim());
  }

  const response = await fetch(`${API_BASE}/posts/feed${params.toString() ? `?${params}` : ''}`, {
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

export async function apiFetchPostById(postId: string, token?: string): Promise<UserPost> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  return normalizeUserPost(data);
}

export async function apiFetchHashtagPosts(
  hashtag: string,
  token?: string,
  limit = 50,
  offset = 0,
): Promise<UserPost[]> {
  const response = await fetch(
    `${API_BASE}/posts/hashtags/${encodeURIComponent(hashtag)}?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
    {
      headers: {
        ...authHeaders(token),
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  if (!Array.isArray(data)) return [];
  return data.map((item) => normalizeUserPost(item));
}

export async function apiFetchUserPosts(userId: string, token?: string): Promise<UserPost[]> {
  return apiFetchProfilePosts(userId, token);
}

export async function apiFetchProfilePosts(userId: string, token?: string, hashtag?: string): Promise<UserPost[]> {
  const params = new URLSearchParams();
  if (hashtag?.trim()) {
    params.set('hashtag', hashtag.trim());
  }

  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/posts${params.toString() ? `?${params}` : ''}`,
    {
      headers: {
        ...authHeaders(token),
      },
    },
  );

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
  mediaFiles?: File[],
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

export async function apiLikePost(postId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/likes`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiUnlikePost(postId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/likes`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiSavePost(postId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/saves`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiUnsavePost(postId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/saves`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiUpdatePost(postId: string, payload: UpdatePostPayload, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiDeletePost(postId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiAddComment(postId: string, content: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiAddReply(commentId: string, content: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/comments/${encodeURIComponent(commentId)}/replies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiDeleteComment(commentId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiLikeComment(commentId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/comments/${encodeURIComponent(commentId)}/likes`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiUnlikeComment(commentId: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/posts/comments/${encodeURIComponent(commentId)}/likes`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiFetchCommentContext(commentId: string, token?: string): Promise<CommentContext> {
  const response = await fetch(`${API_BASE}/posts/comments/${encodeURIComponent(commentId)}/context`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => ({}))) as Partial<CommentContext>;
  return {
    commentId: String(data.commentId ?? commentId),
    postId: String(data.postId ?? ''),
    parentCommentId: data.parentCommentId ? String(data.parentCommentId) : null,
  };
}
