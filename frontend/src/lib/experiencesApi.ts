import { resolveApiBaseUrl } from './apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

export interface UserExperience {
  id: string;
  roleTitle: string;
  organization: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  isCurrentlyWorking: boolean;
  createdAt: string;
}

export interface UpsertExperiencePayload {
  roleTitle: string;
  organization: string;
  description?: string;
  startDate: string;
  endDate?: string | null;
  isCurrentlyWorking?: boolean;
}

export async function apiFetchUserExperiences(userId: string, token?: string): Promise<UserExperience[]> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/experiences`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(data) ? (data as UserExperience[]) : [];
}

export async function apiCreateUserExperience(
  userId: string,
  payload: UpsertExperiencePayload,
  token?: string,
): Promise<UserExperience> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/experiences`, {
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

  return (await response.json()) as UserExperience;
}

export async function apiUpdateUserExperience(
  userId: string,
  experienceId: string,
  payload: Partial<UpsertExperiencePayload>,
  token?: string,
): Promise<UserExperience> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/experiences/${encodeURIComponent(experienceId)}`,
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

  return (await response.json()) as UserExperience;
}

export async function apiDeleteUserExperience(userId: string, experienceId: string, token?: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/experiences/${encodeURIComponent(experienceId)}`,
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
