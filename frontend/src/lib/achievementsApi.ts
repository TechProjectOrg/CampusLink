import { resolveApiBaseUrl } from './apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

export interface UserAchievement {
  id: string;
  title: string;
  description: string | null;
  year: number;
  createdAt: string;
}

export interface UpsertAchievementPayload {
  title: string;
  description?: string;
  year: number;
}

export async function apiFetchUserAchievements(userId: string, token?: string): Promise<UserAchievement[]> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/achievements`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as UserAchievement[]) : [];
}

export async function apiCreateUserAchievement(
  userId: string,
  payload: UpsertAchievementPayload,
  token?: string,
): Promise<UserAchievement> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/achievements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as UserAchievement;
}

export async function apiUpdateUserAchievement(
  userId: string,
  achievementId: string,
  payload: Partial<UpsertAchievementPayload>,
  token?: string,
): Promise<UserAchievement> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/achievements/${encodeURIComponent(achievementId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as UserAchievement;
}

export async function apiDeleteUserAchievement(
  userId: string,
  achievementId: string,
  token?: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/achievements/${encodeURIComponent(achievementId)}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeaders(token),
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}
