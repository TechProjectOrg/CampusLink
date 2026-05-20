import type { ApiUserProfile, ApiUserSession, ApiUserSettings, BlockedUserListItem } from '../types';
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

export interface AlumniVerificationResubmissionContext {
  email: string;
  displayName: string;
  username: string;
  graduationYear: number | null;
  branch: string | null;
  currentStatus: string | null;
  decisionNote: string | null;
}

export interface AuthOnboardingResponse {
  onboardingRequired: true;
  sessionId: string;
  provider: 'google' | 'magic_link';
  accountType: 'student' | 'alumni';
  email: string;
  fullName: string;
  suggestedUsername?: string | null;
  profilePhotoUrl: string | null;
}

export type GoogleAuthResult = LoginResult | AuthOnboardingResponse;
export type SignupExchangeResult = AuthOnboardingResponse;

export interface AlumniSignupPayload {
  sessionId: string;
  displayName: string;
  username: string;
  graduationYear: string | number;
  branch: string;
  currentStatus: string;
  password: string;
  proofFiles: File[];
}

export interface AlumniVerificationResubmissionPayload {
  token: string;
  displayName: string;
  username: string;
  graduationYear: string | number;
  branch: string;
  currentStatus: string;
  proofFiles: File[];
}

export interface StudentSignupPayload {
  sessionId: string;
  displayName: string;
  username: string;
  password: string;
  branch: string;
  year: string | number;
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

export async function apiLogin(email: string, password: string): Promise<LoginResult> {
  const response = await safeFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to sign in');
  }

  const data = (await response.json()) as ApiUserProfile & { token?: string };
  return { profile: data, token: data.token };
}

export async function apiAuthenticateWithGoogle(payload: {
  idToken: string;
  intent?: 'login' | 'signup';
  accountType?: 'student' | 'alumni';
}): Promise<GoogleAuthResult> {
  const response = await safeFetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

export async function apiSendSignupVerificationLink(
  email: string,
  accountType: 'student' | 'alumni'
): Promise<{ message: string }> {
  const response = await safeFetch(`${API_BASE}/auth/signup/verify-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, accountType }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to send verification link');
  }

  return (await response.json()) as { message: string };
}

export async function apiExchangeSignupVerification(exchangeCode: string): Promise<SignupExchangeResult> {
  const response = await safeFetch(`${API_BASE}/auth/signup/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ exchangeCode }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to finish verification');
  }

  return (await response.json()) as AuthOnboardingResponse;
}

export async function apiCompleteStudentSignup(payload: StudentSignupPayload): Promise<LoginResult> {
  const response = await safeFetch(`${API_BASE}/auth/signup/student`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to complete student signup');
  }

  const data = (await response.json()) as ApiUserProfile & { token?: string };
  return { profile: data, token: data.token };
}

export async function apiSignupAlumni(payload: AlumniSignupPayload): Promise<AlumniPendingVerificationResult> {
  const formData = new FormData();
  formData.append('sessionId', payload.sessionId);
  formData.append('displayName', payload.displayName);
  formData.append('username', payload.username);
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

export async function apiFetchAlumniVerificationResubmission(token: string): Promise<AlumniVerificationResubmissionContext> {
  const response = await safeFetch(`${API_BASE}/auth/alumni/resubmission?token=${encodeURIComponent(token)}`);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to open the alumni verification resubmission link');
  }

  return (await response.json()) as AlumniVerificationResubmissionContext;
}

export async function apiResubmitAlumniVerification(payload: AlumniVerificationResubmissionPayload): Promise<AlumniPendingVerificationResult> {
  const formData = new FormData();
  formData.append('token', payload.token);
  formData.append('displayName', payload.displayName);
  formData.append('username', payload.username);
  formData.append('graduationYear', String(payload.graduationYear));
  formData.append('branch', payload.branch);
  formData.append('currentStatus', payload.currentStatus);
  payload.proofFiles.forEach((file) => {
    formData.append('proofFiles', file);
  });

  const response = await safeFetch(`${API_BASE}/auth/alumni/resubmit`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to resubmit alumni verification proof');
  }

  return (await response.json()) as AlumniPendingVerificationResult;
}

export async function apiCompleteGoogleOnboarding(payload: StudentSignupPayload): Promise<LoginResult> {
  return await apiCompleteStudentSignup(payload);
}

export async function apiSendMagicLink(email: string): Promise<{ message: string }> {
  return await apiSendSignupVerificationLink(email, 'student');
}

export async function apiExchangeMagicLink(exchangeCode: string): Promise<SignupExchangeResult> {
  return await apiExchangeSignupVerification(exchangeCode);
}

export async function apiCompleteMagicLinkOnboarding(payload: StudentSignupPayload): Promise<LoginResult> {
  return await apiCompleteStudentSignup(payload);
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

export async function apiFetchBlockedUsers(userId: string, token?: string): Promise<BlockedUserListItem[]> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/blocks`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to fetch blocked users');
  }

  return (await response.json()) as BlockedUserListItem[];
}

export async function apiBlockUser(userId: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/block`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to block user');
  }
}

export async function apiUnblockUser(userId: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/block`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to unblock user');
  }
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

export interface PasswordResetRequestResult {
  message: string;
  lookupType: 'email' | 'username';
  deliveryEmail: string;
  maskedDeliveryEmail: string;
}

export interface PasswordResetExchangeResult {
  resetToken: string;
  email: string;
  maskedEmail: string;
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

export async function apiRequestPasswordReset(identifier: string): Promise<PasswordResetRequestResult> {
  const response = await safeFetch(`${API_BASE}/auth/password-reset/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identifier }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to request password reset');
  }

  return (await response.json()) as PasswordResetRequestResult;
}

export async function apiExchangePasswordReset(exchangeCode: string): Promise<PasswordResetExchangeResult> {
  const response = await safeFetch(`${API_BASE}/auth/password-reset/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ exchangeCode }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to verify password reset link');
  }

  return (await response.json()) as PasswordResetExchangeResult;
}

export async function apiCompletePasswordReset(payload: {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  const response = await safeFetch(`${API_BASE}/auth/password-reset/complete`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const detail = err?.details ? ` ${err.details}` : '';
    throw new Error(err?.message ? `${err.message}${detail}` : 'Unable to reset password');
  }
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
  displayName?: string;
  username?: string;
  branch?: string;
  year?: string | number;
  bio?: string | null;
  headline?: string | null;
}

export interface UsernameAvailabilityResult {
  available: boolean;
  normalizedUsername: string;
  message?: string;
}

export async function apiCheckUsernameAvailability(
  username: string,
  token?: string
): Promise<UsernameAvailabilityResult> {
  const params = new URLSearchParams({ username });
  const response = await safeFetch(`${API_BASE}/users/username-availability?${params.toString()}`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to check username');
  }

  return (await response.json()) as UsernameAvailabilityResult;
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

export async function apiDeleteAccount(
  userId: string,
  password: string,
  token?: string,
  options?: {
    groupAdminTransfers?: Array<{ chatId: string; successorUserId: string }>;
  },
): Promise<void> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({
      password,
      groupAdminTransfers: options?.groupAdminTransfers ?? [],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Unable to delete account');
  }
}

// ============================================================================
// Switch to Alumni Account Functions
// ============================================================================

export interface AlumniSwitchOtpRequestResult {
  success: boolean;
  message: string;
}

export interface AlumniSwitchOtpVerifyResult {
  success: boolean;
  message: string;
  email: string;
  userType: string;
}

export async function apiRequestAlumniSwitchOtp(
  userId: string,
  newEmail: string,
  changeToken: string,
  token?: string,
): Promise<AlumniSwitchOtpRequestResult> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/switch-to-alumni/request-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ newEmail, changeToken }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to request OTP for alumni switch');
  }

  return response.json();
}

export async function apiVerifyAlumniSwitchOtp(
  userId: string,
  newEmail: string,
  otp: string,
  token?: string,
): Promise<AlumniSwitchOtpVerifyResult> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/switch-to-alumni/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ newEmail, otp }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to verify OTP for alumni switch');
  }

  return response.json();
}

// ============================================================================
// Change Email Functions (For Any User)
// ============================================================================

export interface EmailChangeOtpRequestResult {
  success: boolean;
  message: string;
}

export interface EmailChangeOtpVerifyResult {
  success: boolean;
  message: string;
  email: string;
}

export async function apiRequestEmailChangeOtp(
  userId: string,
  newEmail: string,
  changeToken: string,
  token?: string,
): Promise<EmailChangeOtpRequestResult> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/email/request-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ newEmail, changeToken }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to request OTP for email change');
  }

  return response.json();
}

export async function apiVerifyEmailChangeOtp(
  userId: string,
  newEmail: string,
  otp: string,
  token?: string,
): Promise<EmailChangeOtpVerifyResult> {
  const response = await safeFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/email/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ newEmail, otp }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to verify OTP for email change');
  }

  return response.json();
}
