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

// ============================================================
// Types
// ============================================================

export interface ApiNotification {
  id: string;
  type: string; // e.g. 'follow', 'follow_request', 'follow_accept'
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string; // ISO string
  actor: {
    userId: string;
    username: string | null;
    profilePictureUrl: string | null;
  } | null;
}

// ============================================================
// Fetch Notifications
// ============================================================

export async function apiFetchNotifications(
  token?: string,
  unreadOnly = false
): Promise<ApiNotification[]> {
  const params = unreadOnly ? '?unread_only=true' : '';
  const response = await safeFetch(`${API_BASE}/notifications${params}`, {
    headers: { ...authHeaders(token) },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to fetch notifications');
  }

  return (await response.json()) as ApiNotification[];
}

// ============================================================
// Mark as Read
// ============================================================

export async function apiMarkNotificationRead(
  notificationId: string,
  token?: string
): Promise<void> {
  const response = await safeFetch(
    `${API_BASE}/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token) },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to mark notification as read');
  }
}

export async function apiMarkAllNotificationsRead(token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/notifications/read-all`, {
    method: 'PATCH',
    headers: { ...authHeaders(token) },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to mark all notifications as read');
  }
}

export async function apiFetchPushPublicKey(token?: string): Promise<string | null> {
  const response = await safeFetch(`${API_BASE}/notifications/push/public-key`, {
    headers: { ...authHeaders(token) },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to fetch push public key');
  }

  const data = (await response.json().catch(() => ({}))) as { publicKey?: string | null };
  return data.publicKey ?? null;
}

export async function apiSavePushSubscription(subscription: PushSubscription, token?: string): Promise<void> {
  const json = subscription.toJSON();
  const response = await safeFetch(`${API_BASE}/notifications/push/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to save push subscription');
  }
}

export async function apiDeletePushSubscription(endpoint: string, token?: string): Promise<void> {
  const response = await safeFetch(`${API_BASE}/notifications/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Failed to delete push subscription');
  }
}
