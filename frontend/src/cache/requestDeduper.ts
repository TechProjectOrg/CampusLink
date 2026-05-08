import type { CacheStats } from './types';

const pendingRequests = new Map<string, Promise<unknown>>();

let statsRef: CacheStats | null = null;

export function configureRequestDeduper(stats: CacheStats): void {
  statsRef = stats;
}

export function runDeduped<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = pendingRequests.get(key);
  if (existing) {
    if (statsRef) {
      statsRef.dedupedRequests += 1;
    }
    return existing as Promise<T>;
  }

  const request = factory().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, request);
  return request;
}
