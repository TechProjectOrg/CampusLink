export interface StoredAuthSession {
  userId: string;
  token?: string;
}

const STORAGE_KEY = 'campuslink.auth.session';
export const AUTH_EXPIRED_EVENT = 'campuslynk:auth-expired';

export function readStoredSession(): StoredAuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;

    if (!parsed || typeof parsed.userId !== 'string' || parsed.userId.length === 0) {
      return null;
    }

    if (parsed.token != null && typeof parsed.token !== 'string') {
      return { userId: parsed.userId };
    }

    return { userId: parsed.userId, token: parsed.token };
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredAuthSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: session.userId, token: session.token }));
  } catch {
    // Ignore quota / privacy mode errors
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAuthToken(): string | null {
  return readStoredSession()?.token || null;
}

export function notifyAuthExpired(): void {
  clearStoredSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}
