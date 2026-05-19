export function resolveApiBaseUrl(rawValue: string | undefined): string {
  const raw = (rawValue ?? '').trim();
  if (!raw) {
    // Local dev convenience: if no env is set, call backend dev server directly.
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'http://localhost:4000';
    }
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

export function resolveRealtimeWebSocketUrl(apiBase: string): string {
  const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000';
  const parsed = (() => {
    try {
      return new URL(apiBase || fallbackOrigin, fallbackOrigin);
    } catch {
      return new URL(fallbackOrigin);
    }
  })();

  const socketProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${socketProtocol}//${parsed.host}/ws`;
}
