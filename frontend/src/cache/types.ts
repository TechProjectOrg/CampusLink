export type CacheSource = 'memory' | 'indexeddb' | 'network' | 'optimistic' | 'realtime';

export type CacheSyncState = 'full' | 'partial' | 'stale';

export interface CachePolicy {
  entityType: string;
  ttlMs: number;
  persist?: boolean;
  maxEntries?: number;
  scope: 'entity' | 'page' | 'list';
  debugLabel?: string;
}

export interface CacheEntry<T> {
  key: string;
  data: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  version: string;
  source: CacheSource;
  stale: boolean;
  syncState: CacheSyncState;
  lastAccessedAt: number;
  byteSize?: number;
}

export interface PaginatedCacheEntry<TId> extends CacheEntry<TId[]> {
  pageParam: string;
  ids: TId[];
  hasMore: boolean;
  nextCursor?: string | null;
  nextOffset?: number | null;
  entityType: string;
}

export interface CacheMutationContext<T> {
  key: string;
  previous: T | null;
  optimisticVersion: string;
  appliedAt: number;
}

export interface CacheInvalidationEvent {
  reason: string;
  keys?: string[];
  prefixes?: string[];
}

export interface RealtimeCachePatch<T> {
  key: string;
  apply: (current: T | null) => T | null;
  source?: CacheSource;
  version?: string;
}

export interface CacheStats {
  memoryHits: number;
  persistentHits: number;
  misses: number;
  writes: number;
  evictions: number;
  staleServed: number;
  revalidations: number;
  dedupedRequests: number;
}
