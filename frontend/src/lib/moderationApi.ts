import { resolveApiBaseUrl } from './apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export const REPORT_REASON_OPTIONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment_or_bullying', label: 'Harassment or Bullying' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'fake_account', label: 'Fake Account' },
  { value: 'inappropriate_content', label: 'Inappropriate Content' },
  { value: 'violence_or_threats', label: 'Violence or Threats' },
  { value: 'sexual_content', label: 'Sexual Content' },
  { value: 'scam_or_fraud', label: 'Scam or Fraud' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'self_harm_concern', label: 'Self-harm Concern' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReasonValue = (typeof REPORT_REASON_OPTIONS)[number]['value'];
export type ReportTargetTypeValue = 'post' | 'comment' | 'message' | 'user' | 'club';

export interface ModerationStateResponse {
  isBanned: boolean;
  bannedAt: string | null;
  isSuspended: boolean;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  suspensionStartedAt: string | null;
  warningCount: number;
  lastWarningAt: string | null;
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({}));
  return new Error(payload?.message || `Request failed (${response.status})`);
}

export async function apiCreateModerationReport(
  input: {
    targetType: ReportTargetTypeValue;
    targetId: string;
    reason: ReportReasonValue;
    description?: string;
  },
  token?: string,
): Promise<{ success: true; reportId: string; message: string }> {
  const response = await fetch(`${API_BASE}/moderation/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json() as Promise<{ success: true; reportId: string; message: string }>;
}

export async function apiFetchModerationState(token?: string): Promise<ModerationStateResponse> {
  const response = await fetch(`${API_BASE}/moderation/me/state`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json() as Promise<ModerationStateResponse>;
}
