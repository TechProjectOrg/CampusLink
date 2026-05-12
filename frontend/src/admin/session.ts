export interface StoredAdminSession {
  token: string;
}

const STORAGE_KEY = 'campuslink.admin.session';

export function readAdminSession(): StoredAdminSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAdminSession>;
    if (!parsed?.token || typeof parsed.token !== 'string') {
      return null;
    }
    return { token: parsed.token };
  } catch {
    return null;
  }
}

export function writeAdminSession(session: StoredAdminSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors.
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
