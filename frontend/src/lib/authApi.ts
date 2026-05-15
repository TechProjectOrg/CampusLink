import type { ApiUserProfile, ApiUserSession, ApiUserSettings } from '../types';
import { resolveApiBaseUrl } from './apiBase';

export const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export interface LoginResult {
  profile: ApiUserProfile;
  token?: string;
}

export interface AlumniPendingVerificationResult {
  pendingVerification: true;
  message: string;
  request: {
    id: string;
    status: string;
    requestedAt: string;
    verificationState: 'alumni_pending_review';
  };
}

export interface AuthOnboardingResponse {
  onboardingRequired: true;
  sessionId: string;
  provider: 'google' | 'magic_link';
  email: string;
  fullName: string;
  profilePhotoUrl: string | null;
  suggestedUsername: string | null;
  accountType: 'student';
  missingFields: string[];
}

export type GoogleAuthResult = LoginResult | AuthOnboardingResponse;
export type MagicLinkExchangeResult = LoginResult | AuthOnboardingResponse;

export interface AlumniSignupPayload {
  name: string;
  email: string;
  graduationYear: string | number;
  branch: string;
  currentStatus: string;
  password: string;
  proofFiles: File[];
}

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

export async function apiAuthenticateWithGoogle(idToken: string): Promise<GoogleAuthResult> {
  const response = await safeFetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Google sign-in failed');
  }

  const data = (await response.json()) as (ApiUserProfile & { token?: string }) | AuthOnboardingResponse;
  if ('onboardingRequired' in data) {
    return data;
  }

  return { profile: data, token: data.token };
}

export async function apiCompleteGoogleOnboarding(payload: {
  sessionId: string;
  username?: string;
  branch: string;
  year: string | number;
  accountType?: 'student';
}): Promise<LoginResult> {
  const response = await safeFetch(`${API_BASE}/auth/google/onboarding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to complete Google signup');
  }

  const data = (await response.json()) as ApiUserProfile & { token?: string };
  return { profile: data, token: data.token };
}

export async function apiSendMagicLink(email: string): Promise<{ message: string }> {
  const response = await safeFetch(`${API_BASE}/auth/magic-link/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to send magic link');
  }

  return (await response.json()) as { message: string };
}

export async function apiExchangeMagicLink(exchangeCode: string): Promise<MagicLinkExchangeResult> {
  const response = await safeFetch(`${API_BASE}/auth/magic-link/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ exchangeCode }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to finish magic link sign-in');
  }

  const data = (await response.json()) as (ApiUserProfile & { token?: string }) | AuthOnboardingResponse;
  if ('onboardingRequired' in data) {
    return data;
  }

  return { profile: data, token: data.token };
}

export async function apiCompleteMagicLinkOnboarding(payload: {
  sessionId: string;
  username?: string;
  branch: string;
  year: string | number;
  accountType?: 'student';
}): Promise<LoginResult> {
  const response = await safeFetch(`${API_BASE}/auth/magic-link/onboarding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to complete your account');
  }

  const data = (await response.json()) as ApiUserProfile & { token?: string };
  return { profile: data, token: data.token };
}

export async function apiSignupAlumni(payload: AlumniSignupPayload): Promise<AlumniPendingVerificationResult> {
  const formData = new FormData();
  formData.append('name', payload.name);
  formData.append('email', payload.email);
  formData.append('graduationYear', String(payload.graduationYear));
  formData.append('branch', payload.branch);
  formData.append('currentStatus', payload.currentStatus);
  formData.append('password', payload.password);
  payload.proofFiles.forEach((file) => {
    formData.append('proofFiles', file);
  });

  const response = await safeFetch(`${API_BASE}/auth/signup/alumni`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Signup failed');
  }

  return (await response.json()) as AlumniPendingVerificationResult;
}

export async function apiFetchUserProfile(userId: string, token?: string): Promise<ApiUserProfile> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
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

export async function apiFetchUserSettings(userId: string, token?: string): Promise<ApiUserSettings> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/settings`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to fetch user settings');
  }

  return (await response.json()) as ApiUserSettings;
}

export async function apiUpdateUserSettings(
  userId: string,
  payload: Partial<ApiUserSettings>,
  token?: string
): Promise<ApiUserSettings> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to update user settings');
  }

  return (await response.json()) as ApiUserSettings;
}

export async function apiFetchUserSessions(token?: string): Promise<ApiUserSession[]> {
  const response = await safeFetch(`${API_BASE}/auth/sessions`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to fetch active sessions');
  }

  return (await response.json()) as ApiUserSession[];
}

export async function apiRevokeUserSession(sessionId: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to revoke session');
  }
}

export interface PasswordChangeVerifyResult {
  changeToken: string;
}

export async function apiVerifyPasswordChange(
  userId: string,
  currentPassword: string,
  token?: string
): Promise<PasswordChangeVerifyResult> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/password/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ currentPassword }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to verify current password');
  }

  return (await response.json()) as PasswordChangeVerifyResult;
}

export async function apiChangePassword(
  userId: string,
  payload: { changeToken: string; newPassword: string },
  token?: string
): Promise<void> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/password`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const detail = err?.details ? ` ${err.details}` : '';
    throw new Error(err?.message ? `${err.message}${detail}` : 'Unable to change password');
  }
}

export interface UpdateUserProfilePayload {
  username?: string;
  branch?: string;
  year?: string | number;
  bio?: string | null;
  headline?: string | null;
}

export async function apiUpdateUserProfile(
  userId: string,
  payload: UpdateUserProfilePayload,
  token?: string
): Promise<ApiUserProfile> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to update user profile');
  }

  return (await response.json()) as ApiUserProfile;
}

export async function apiUpdateUserProfilePicture(
  userId: string,
  profilePictureUrl: string | null,
  token?: string
): Promise<ApiUserProfile> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/profile-picture`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ profilePictureUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to update profile picture');
  }

  return (await response.json()) as ApiUserProfile;
}

export async function apiUploadUserProfilePicture(
  userId: string,
  file: File,
  token?: string
): Promise<ApiUserProfile> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/profile-picture`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to upload profile picture');
  }

  return (await response.json()) as ApiUserProfile;
}

export async function apiUpdateUserCoverPhoto(
  userId: string,
  coverPhotoUrl: string | null,
  token?: string,
): Promise<ApiUserProfile> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/cover-photo`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ coverPhotoUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to update cover photo');
  }

  return (await response.json()) as ApiUserProfile;
}

export async function apiUploadUserCoverPhoto(
  userId: string,
  file: File,
  token?: string,
): Promise<ApiUserProfile> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/cover-photo`, {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to upload cover photo');
  }

  return (await response.json()) as ApiUserProfile;
}

export async function apiDeleteAccount(userId: string, password: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
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
