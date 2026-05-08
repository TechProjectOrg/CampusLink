import { runDeduped } from './requestDeduper';
import { createCacheEntry, incrementCacheRevalidations, readCacheEntry, writeCacheEntry } from './client';
import type { CacheEntry, CachePolicy } from './types';

export interface FetchWithCacheOptions<T> {
  key: string;
  policy: CachePolicy;
  fetcher: () => Promise<T>;
  getVersion?: (value: T) => string | number | null | undefined;
  getUpdatedAt?: (value: T) => number | undefined;
  mode?: 'cache-first' | 'stale-while-revalidate' | 'network-only';
  onCached?: (value: T, entry: CacheEntry<T>) => void;
  onFresh?: (value: T) => void;
}

export async function fetchWithCache<T>(options: FetchWithCacheOptions<T>): Promise<T> {
  const {
    key,
    policy,
    fetcher,
    getVersion,
    getUpdatedAt,
    mode = 'stale-while-revalidate',
    onCached,
    onFresh,
  } = options;

  const cached = await readCacheEntry<T>(key);
  if (cached) {
    onCached?.(cached.data, cached);
    if (mode === 'cache-first' && !cached.stale) {
      return cached.data;
    }
  }

  if (mode !== 'network-only' && cached && cached.stale) {
    incrementCacheRevalidations();
  }

  const fresh = await runDeduped(key, fetcher);
  const entry = createCacheEntry({
    key,
    data: fresh,
    policy,
    version: getVersion?.(fresh),
    updatedAt: getUpdatedAt?.(fresh),
    source: 'network',
    syncState: 'full',
  });
  await writeCacheEntry(entry, policy);
  onFresh?.(fresh);
  return fresh;
}
