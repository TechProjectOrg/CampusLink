import type { ApiUserProfile } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || 'http://localhost:4000';

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

// ============================================================
// Types
// ============================================================

export interface NetworkUser {
  userId: string;
  username: string;
  profilePictureUrl: string | null;
  isPrivate: boolean;
  type: string;
  branch: string | null;
  year: number | null;
}

export interface NetworkUserWithRequest extends NetworkUser {
  requestId: string;
}

export interface FollowGraphResponse {
  followers: NetworkUser[];
  following: NetworkUser[];
  incomingRequests: NetworkUserWithRequest[];
  outgoingRequests: NetworkUserWithRequest[];
}

export interface SearchUserResult {
  userId: string;
  username: string;
  email: string;
  profilePictureUrl: string | null;
  isPrivate: boolean;
  type: string;
  branch: string | null;
  year: number | null;
}

export interface SearchHashtagResult {
  hashtag: string;
  postCount: number;
}

export interface UnifiedSearchResult {
  users: SearchUserResult[];
  hashtags: SearchHashtagResult[];
}

// ============================================================
// Search
// ============================================================

export async function apiSearchUsers(
  query: string,
  token?: string,
  limit = 20,
  offset = 0
): Promise<SearchUserResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
  const response = await safeFetch(`${API_BASE}/search/users?${params}`, {
    headers: { ...authHeaders(token) },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Search failed');
  }

  return (await response.json()) as SearchUserResult[];
}

export async function apiSearchAll(
  query: string,
  token?: string,
  usersLimit = 20,
  hashtagsLimit = 20
): Promise<UnifiedSearchResult> {
  const params = new URLSearchParams({
    q: query,
    usersLimit: String(usersLimit),
    hashtagsLimit: String(hashtagsLimit),
  });
  const response = await safeFetch(`${API_BASE}/search/all?${params}`, {
    headers: { ...authHeaders(token) },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Search failed');
  }

  return (await response.json()) as UnifiedSearchResult;
}

// ============================================================
// Follow Graph
// ============================================================

export async function apiGetFollowGraph(token?: string): Promise<FollowGraphResponse> {
  const response = await safeFetch(`${API_BASE}/network/graph`, {
    headers: { ...authHeaders(token) },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to fetch follow graph');
  }

  return (await response.json()) as FollowGraphResponse;
}

// ============================================================
// Follow / Unfollow
// ============================================================

export async function apiFollow(
  targetUserId: string,
  token?: string
): Promise<{ status: 'following' | 'requested'; requestId?: string }> {
  const response = await safeFetch(`${API_BASE}/network/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ targetUserId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Follow failed');
  }

  return await response.json();
}

export async function apiUnfollow(targetUserId: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/network/follow/${encodeURIComponent(targetUserId)}`, {
    method: 'DELETE',
    headers: { ...authHeaders(token) },
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unfollow failed');
  }
}

// ============================================================
// Remove Follower
// ============================================================

export async function apiRemoveFollower(followerUserId: string, token?: string): Promise<void> {
  const response = await safeFetch(
    `${API_BASE}/network/followers/${encodeURIComponent(followerUserId)}`,
    {
      method: 'DELETE',
      headers: { ...authHeaders(token) },
    }
  );

  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Remove follower failed');
  }
}

// ============================================================
// Follow Requests
// ============================================================

export async function apiAcceptFollowRequest(requestId: string, token?: string): Promise<void> {
  const response = await safeFetch(
    `${API_BASE}/network/requests/${encodeURIComponent(requestId)}/accept`,
    {
      method: 'POST',
      headers: { ...authHeaders(token) },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Accept request failed');
  }
}

export async function apiRejectFollowRequest(requestId: string, token?: string): Promise<void> {
  const response = await safeFetch(
    `${API_BASE}/network/requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: 'POST',
      headers: { ...authHeaders(token) },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Reject request failed');
  }
}

export async function apiCancelFollowRequest(targetUserId: string, token?: string): Promise<void> {
  const response = await safeFetch(
    `${API_BASE}/network/requests/${encodeURIComponent(targetUserId)}`,
    {
      method: 'DELETE',
      headers: { ...authHeaders(token) },
    }
  );

  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Cancel request failed');
  }
}
