import { resolveApiBaseUrl } from '../lib/apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

function buildHeaders(token?: string, json = false): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function safeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Request failed');
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface AdminProfile {
  userId: string;
  email: string;
  username: string;
  role: 'super_admin';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export async function apiAdminLogin(email: string, password: string): Promise<{ token: string; admin: AdminProfile }> {
  return safeFetch('/admin/auth/login', {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify({ email, password }),
  });
}

export async function apiAdminSession(token: string): Promise<{ admin: AdminProfile }> {
  return safeFetch('/admin/auth/session', { headers: buildHeaders(token) });
}

export async function apiAdminGet<T>(path: string, token: string): Promise<T> {
  return safeFetch(path, { headers: buildHeaders(token) });
}

export async function apiAdminPost<T>(path: string, token: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  return safeFetch(path, {
    method,
    headers: buildHeaders(token, true),
    body: JSON.stringify(body ?? {}),
  });
}
