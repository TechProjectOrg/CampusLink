import type { ApiUserProfile } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

export interface LoginResult {
  profile: ApiUserProfile;
  token?: string;
}

export interface StudentSignupPayload {
  name: string;
  email: string;
  password: string;
  branch: string;
  year: string | number;
}

export interface AlumniSignupPayload {
  name: string;
  email: string;
  graduationYear: string | number;
  branch: string;
  currentStatus: string;
  password: string;
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiLogin(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Login failed');
  }

  const data = (await response.json()) as ApiUserProfile & { token?: string };
  return { profile: data, token: data.token };
}

export async function apiSignupStudent(payload: StudentSignupPayload): Promise<LoginResult> {
  const response = await fetch(`${API_BASE}/auth/signup/student`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Signup failed');
  }

  const data = (await response.json()) as ApiUserProfile & { token?: string };
  return { profile: data, token: data.token };
}

export async function apiSignupAlumni(payload: AlumniSignupPayload): Promise<LoginResult> {
  const response = await fetch(`${API_BASE}/auth/signup/alumni`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Signup failed');
  }

  const data = (await response.json()) as ApiUserProfile & { token?: string };
  return { profile: data, token: data.token };
}

export async function apiFetchUserProfile(userId: string, token?: string): Promise<ApiUserProfile> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to fetch user profile');
  }

  return (await response.json()) as ApiUserProfile;
}

export async function apiDeleteAccount(userId: string, password: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to delete account');
  }
}
