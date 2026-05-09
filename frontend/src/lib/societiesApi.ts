import { resolveApiBaseUrl } from './apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

export interface UserSociety {
  id: string;
  societyName: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface UpsertSocietyPayload {
  societyName: string;
  role: string;
  startDate?: string | null;
  endDate?: string | null;
}

export async function apiFetchUserSocieties(userId: string, token?: string): Promise<UserSociety[]> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/societies`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as UserSociety[]) : [];
}

export async function apiCreateUserSociety(
  userId: string,
  payload: UpsertSocietyPayload,
  token?: string,
): Promise<UserSociety> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/societies`, {
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

  return (await response.json()) as UserSociety;
}

export async function apiUpdateUserSociety(
  userId: string,
  societyId: string,
  payload: Partial<UpsertSocietyPayload>,
  token?: string,
): Promise<UserSociety> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/societies/${encodeURIComponent(societyId)}`,
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

  return (await response.json()) as UserSociety;
}

export async function apiDeleteUserSociety(userId: string, societyId: string, token?: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/societies/${encodeURIComponent(societyId)}`,
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
