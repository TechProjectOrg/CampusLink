import type { Club } from '../types';
import { normalizeUserPost, type UserPost } from './postsApi';
import { resolveApiBaseUrl } from './apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Network request failed';
    throw new Error(`Cannot reach backend at ${API_BASE}. ${reason}`);
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

export interface ClubCategoryOption {
  id: string;
  displayName: string;
  normalizedName: string;
  isSystem: boolean;
}

export interface ClubMember {
  clubMembershipId: string;
  userId: string;
  username: string;
  profilePictureUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'invited' | 'removed' | 'left';
  joinedAt: string | null;
}

export interface CreateClubPayload {
  name: string;
  shortDescription?: string;
  description: string;
  privacy: 'open' | 'request' | 'private';
  primaryCategory: string;
  tags?: string[];
}

export interface UpdateClubPayload {
  name?: string;
  shortDescription?: string;
  description?: string;
  privacy?: 'open' | 'request' | 'private';
  primaryCategory?: string;
  tags?: string[];
  removeAvatar?: boolean;
  removeCoverImage?: boolean;
}

function normalizeClub(raw: any): Club {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    slug: String(raw?.slug ?? ''),
    shortDescription: raw?.shortDescription ? String(raw.shortDescription) : null,
    description: raw?.description ? String(raw.description) : null,
    privacy: String(raw?.privacy ?? 'open') as Club['privacy'],
    avatarUrl: raw?.avatarUrl ? String(raw.avatarUrl) : null,
    coverImageUrl: raw?.coverImageUrl ? String(raw.coverImageUrl) : null,
    createdByUserId: String(raw?.createdByUserId ?? ''),
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
    primaryCategory: raw?.primaryCategory
      ? {
          id: String(raw.primaryCategory.id ?? ''),
          displayName: raw.primaryCategory.displayName ? String(raw.primaryCategory.displayName) : null,
        }
      : null,
    tags: Array.isArray(raw?.tags) ? raw.tags.map((tag: unknown) => String(tag)) : [],
    memberCount: Number(raw?.memberCount ?? 0),
    postCount: Number(raw?.postCount ?? 0),
    membership: raw?.membership
      ? {
          status: raw.membership.status ? String(raw.membership.status) as Club['membership']['status'] : null,
          role: raw.membership.role ? String(raw.membership.role) as Club['membership']['role'] : null,
        }
      : undefined,
    permissions: raw?.permissions
      ? {
          canViewClub: Boolean(raw.permissions.canViewClub),
          canJoinClub: Boolean(raw.permissions.canJoinClub),
          canRequestJoin: Boolean(raw.permissions.canRequestJoin),
          canManageClub: Boolean(raw.permissions.canManageClub),
          canModerateMembers: Boolean(raw.permissions.canModerateMembers),
          canCreatePosts: Boolean(raw.permissions.canCreatePosts),
          canComment: Boolean(raw.permissions.canComment),
          canInviteMembers: Boolean(raw.permissions.canInviteMembers),
          membershipStatus: raw.permissions.membershipStatus ? String(raw.permissions.membershipStatus) as NonNullable<NonNullable<Club['permissions']>['membershipStatus']> : null,
          membershipRole: raw.permissions.membershipRole ? String(raw.permissions.membershipRole) as NonNullable<NonNullable<Club['permissions']>['membershipRole']> : null,
        }
      : null,
  };
}

export async function apiFetchClubs(token?: string, query?: { q?: string; category?: string; tag?: string; limit?: number; offset?: number }): Promise<Club[]> {
  const params = new URLSearchParams();
  if (query?.q?.trim()) params.set('q', query.q.trim());
  if (query?.category?.trim()) params.set('category', query.category.trim());
  if (query?.tag?.trim()) params.set('tag', query.tag.trim());
  params.set('limit', String(query?.limit ?? 20));
  params.set('offset', String(query?.offset ?? 0));

  const response = await safeFetch(`${API_BASE}/clubs?${params.toString()}`, {
    headers: { ...authHeaders(token) },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown[];
  return Array.isArray(data) ? data.map((item) => normalizeClub(item)) : [];
}

export async function apiFetchClubCategories(token?: string, limit = 6, offset = 0, q?: string): Promise<ClubCategoryOption[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (q?.trim()) params.set('q', q.trim());

  const response = await safeFetch(`${API_BASE}/clubs/categories?${params.toString()}`, {
    headers: { ...authHeaders(token) },
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));

  const data = (await response.json().catch(() => [])) as unknown[];
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({
    id: String(item?.id ?? ''),
    displayName: String(item?.displayName ?? ''),
    normalizedName: String(item?.normalizedName ?? ''),
    isSystem: Boolean(item?.isSystem),
  }));
}

export async function apiCreateClub(payload: CreateClubPayload, token?: string, files?: { avatar?: File | null; coverImage?: File | null }): Promise<Club> {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  if (files?.avatar) formData.append('avatar', files.avatar);
  if (files?.coverImage) formData.append('coverImage', files.coverImage);

  const response = await safeFetch(`${API_BASE}/clubs`, {
    method: 'POST',
    headers: { ...authHeaders(token) },
    body: formData,
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));

  const data = await response.json();
  return normalizeClub(data);
}

export async function apiFetchClub(clubIdOrSlug: string, token?: string): Promise<Club> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubIdOrSlug)}`, {
    headers: { ...authHeaders(token) },
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return normalizeClub(await response.json());
}

export async function apiJoinClub(clubId: string, token?: string): Promise<Club> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}/join`, {
    method: 'POST',
    headers: { ...authHeaders(token) },
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return normalizeClub(await response.json());
}

export async function apiLeaveClub(clubId: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}/leave`, {
    method: 'POST',
    headers: { ...authHeaders(token) },
  });
  if (!response.ok && response.status !== 204) throw new Error(await parseErrorMessage(response));
}

export async function apiFetchClubMembers(clubId: string, token?: string, limit = 20, offset = 0): Promise<ClubMember[]> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}/members?limit=${limit}&offset=${offset}`, {
    headers: { ...authHeaders(token) },
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const data = (await response.json().catch(() => [])) as unknown[];
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({
    clubMembershipId: String(item?.clubMembershipId ?? ''),
    userId: String(item?.userId ?? ''),
    username: String(item?.username ?? ''),
    profilePictureUrl: item?.profilePictureUrl ? String(item.profilePictureUrl) : null,
    role: String(item?.role ?? 'member') as ClubMember['role'],
    status: String(item?.status ?? 'active') as ClubMember['status'],
    joinedAt: item?.joinedAt ? String(item.joinedAt) : null,
  }));
}

export async function apiFetchClubPosts(clubId: string, token?: string, limit = 20, offset = 0): Promise<UserPost[]> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}/posts?limit=${limit}&offset=${offset}`, {
    headers: { ...authHeaders(token) },
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  const data = (await response.json().catch(() => [])) as unknown[];
  return Array.isArray(data) ? data.map((item) => normalizeUserPost(item)) : [];
}

export async function apiApproveClubMember(clubId: string, userId: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok && response.status !== 204) throw new Error(await parseErrorMessage(response));
}

export async function apiRemoveClubMember(
  clubId: string,
  userId: string,
  token?: string,
  options?: { reason?: string; restrictPosting?: boolean; restrictComments?: boolean },
): Promise<void> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}/remove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({
      userId,
      reason: options?.reason,
      restrictPosting: Boolean(options?.restrictPosting),
      restrictComments: Boolean(options?.restrictComments),
    }),
  });
  if (!response.ok && response.status !== 204) throw new Error(await parseErrorMessage(response));
}

export async function apiUpdateClubMemberRole(clubId: string, userId: string, role: 'admin' | 'member', token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ role }),
  });
  if (!response.ok && response.status !== 204) throw new Error(await parseErrorMessage(response));
}

export async function apiUpdateClub(
  clubId: string,
  payload: UpdateClubPayload,
  token?: string,
  files?: { avatar?: File | null; coverImage?: File | null },
): Promise<Club> {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  if (files?.avatar) formData.append('avatar', files.avatar);
  if (files?.coverImage) formData.append('coverImage', files.coverImage);

  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token) },
    body: formData,
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));

  return normalizeClub(await response.json());
}

export async function apiDeleteClub(clubId: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/clubs/${encodeURIComponent(clubId)}`, {
    method: 'DELETE',
    headers: { ...authHeaders(token) },
  });
  if (!response.ok && response.status !== 204) throw new Error(await parseErrorMessage(response));
}
