export function resolveApiBaseUrl(rawValue: string | undefined): string {
  const raw = (rawValue ?? '').trim();
  if (!raw) return '';

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}
