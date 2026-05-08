import { cachePolicies } from './policies';
import { configureRequestDeduper } from './requestDeduper';
import { deletePersistentEntries, readAllPersistentEntries, readPersistentEntry, writePersistentEntry } from './storage';
import type {
  CacheEntry,
  CacheInvalidationEvent,
  CachePolicy,
  CacheSource,
  CacheStats,
  PaginatedCacheEntry,
} from './types';

const memoryCache = new Map<string, CacheEntry<unknown>>();
const stats: CacheStats = {
  memoryHits: 0,
  persistentHits: 0,
  misses: 0,
  writes: 0,
  evictions: 0,
  staleServed: 0,
  revalidations: 0,
  dedupedRequests: 0,
};

configureRequestDeduper(stats);

function isDev(): boolean {
  return Boolean(import.meta.env.DEV);
}

function logCache(message: string, details?: unknown): void {
  if (!isDev()) return;
  // Keep logging compact; the debug API is available for deeper inspection.
  console.debug(`[cache] ${message}`, details ?? '');
}

function estimateByteSize(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

function normalizeVersion(version: string | number | null | undefined, fallbackUpdatedAt: number): string {
  if (version == null) return String(fallbackUpdatedAt);
  return String(version);
}

function compareVersions(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

export function isEntryExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() >= entry.expiresAt;
}

function shouldReplaceEntry(current: CacheEntry<unknown> | null, incoming: CacheEntry<unknown>): boolean {
  if (!current) return true;
  if (current.source === 'optimistic' && incoming.source === 'network') {
    return compareVersions(current.version, incoming.version) <= 0;
  }
  if (compareVersions(current.version, incoming.version) > 0) {
    return false;
  }
  return incoming.updatedAt >= current.updatedAt;
}

function touchEntry<T>(entry: CacheEntry<T>): CacheEntry<T> {
  return {
    ...entry,
    lastAccessedAt: Date.now(),
  };
}

async function pruneExpiredEntries(): Promise<void> {
  const expiredKeys = Array.from(memoryCache.entries())
    .filter(([, entry]) => isEntryExpired(entry))
    .map(([key]) => key);

  expiredKeys.forEach((key) => {
    memoryCache.delete(key);
    stats.evictions += 1;
  });

  const persistentEntries = await readAllPersistentEntries();
  const persistentExpiredKeys = persistentEntries
    .filter((entry) => isEntryExpired(entry))
    .map((entry) => entry.key);
  if (persistentExpiredKeys.length > 0) {
    await deletePersistentEntries(persistentExpiredKeys);
    stats.evictions += persistentExpiredKeys.length;
  }
}

async function enforcePolicyLimit(policy: CachePolicy): Promise<void> {
  if (!policy.maxEntries) return;
  const matchingEntries = Array.from(memoryCache.values()).filter((entry) => {
    const prefix = `${policy.scope === 'entity' ? 'entity' : policy.scope === 'page' ? 'page' : 'list'}:`;
    return entry.key.startsWith(prefix) && entry.key.includes(policy.entityType);
  });

  if (matchingEntries.length <= policy.maxEntries) return;

  const overflow = matchingEntries
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)
    .slice(0, matchingEntries.length - policy.maxEntries);

  const keysToDelete = overflow.map((entry) => entry.key);
  keysToDelete.forEach((key) => memoryCache.delete(key));
  if (policy.persist) {
    await deletePersistentEntries(keysToDelete);
  }
  stats.evictions += keysToDelete.length;
}

export function createCacheEntry<T>(params: {
  key: string;
  data: T;
  policy: CachePolicy;
  version?: string | number | null;
  source?: CacheSource;
  stale?: boolean;
  syncState?: CacheEntry<T>['syncState'];
  updatedAt?: number;
}): CacheEntry<T> {
  const now = Date.now();
  const updatedAt = params.updatedAt ?? now;
  return {
    key: params.key,
    data: params.data,
    createdAt: now,
    updatedAt,
    expiresAt: now + params.policy.ttlMs,
    version: normalizeVersion(params.version, updatedAt),
    source: params.source ?? 'network',
    stale: Boolean(params.stale),
    syncState: params.syncState ?? 'full',
    lastAccessedAt: now,
    byteSize: estimateByteSize(params.data),
  };
}

export function createPageEntry<TId>(params: {
  key: string;
  ids: TId[];
  policy: CachePolicy;
  pageParam: string;
  hasMore: boolean;
  nextCursor?: string | null;
  nextOffset?: number | null;
  version?: string | number | null;
  source?: CacheSource;
  updatedAt?: number;
  entityType: string;
}): PaginatedCacheEntry<TId> {
  const base = createCacheEntry<TId[]>({
    key: params.key,
    data: params.ids,
    policy: params.policy,
    version: params.version,
    source: params.source,
    updatedAt: params.updatedAt,
  });

  return {
    ...base,
    pageParam: params.pageParam,
    ids: params.ids,
    hasMore: params.hasMore,
    nextCursor: params.nextCursor ?? null,
    nextOffset: params.nextOffset ?? null,
    entityType: params.entityType,
  };
}

export async function readCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached) {
    stats.memoryHits += 1;
    const touched = touchEntry(cached);
    memoryCache.set(key, touched);
    if (isEntryExpired(touched)) {
      touched.stale = true;
      stats.staleServed += 1;
    }
    return touched;
  }

  const persistent = await readPersistentEntry<T>(key);
  if (!persistent) {
    stats.misses += 1;
    return null;
  }

  stats.persistentHits += 1;
  const touched = touchEntry(persistent);
  if (isEntryExpired(touched)) {
    touched.stale = true;
    stats.staleServed += 1;
  }
  memoryCache.set(key, touched as CacheEntry<unknown>);
  return touched;
}

export async function readCacheEntries<T>(keys: string[]): Promise<Array<CacheEntry<T> | null>> {
  return Promise.all(keys.map((key) => readCacheEntry<T>(key)));
}

export async function writeCacheEntry<T>(entry: CacheEntry<T>, policy: CachePolicy): Promise<void> {
  const current = memoryCache.get(entry.key) as CacheEntry<T> | undefined;
  if (!shouldReplaceEntry(current ?? null, entry)) {
    return;
  }

  memoryCache.set(entry.key, entry as CacheEntry<unknown>);
  stats.writes += 1;
  if (policy.persist) {
    await writePersistentEntry(entry);
  }
  await enforcePolicyLimit(policy);
  void pruneExpiredEntries();
}

export async function patchCacheEntry<T>(
  key: string,
  policy: CachePolicy,
  updater: (current: T | null) => T | null,
  options?: { source?: CacheSource; version?: string | number | null; syncState?: CacheEntry<T>['syncState'] },
): Promise<void> {
  const current = await readCacheEntry<T>(key);
  const next = updater(current?.data ?? null);
  if (next === null) {
    await invalidateCache({ reason: 'patch:null', keys: [key] });
    return;
  }

  const entry = createCacheEntry({
    key,
    data: next,
    policy,
    version: options?.version ?? current?.version ?? Date.now(),
    source: options?.source ?? 'realtime',
    syncState: options?.syncState ?? current?.syncState ?? 'partial',
    updatedAt: Date.now(),
  });
  await writeCacheEntry(entry, policy);
}

export async function invalidateCache(event: CacheInvalidationEvent): Promise<void> {
  const keys = new Set<string>(event.keys ?? []);

  if (event.prefixes?.length) {
    for (const key of memoryCache.keys()) {
      if (event.prefixes.some((prefix) => key.startsWith(prefix))) {
        keys.add(key);
      }
    }

    const persistentEntries = await readAllPersistentEntries();
    for (const entry of persistentEntries) {
      if (event.prefixes.some((prefix) => entry.key.startsWith(prefix))) {
        keys.add(entry.key);
      }
    }
  }

  if (keys.size === 0) return;

  const keysToDelete = Array.from(keys);
  keysToDelete.forEach((key) => memoryCache.delete(key));
  await deletePersistentEntries(keysToDelete);
  logCache(`invalidated ${event.reason}`, keysToDelete);
}

export function getCacheStats(): CacheStats {
  return { ...stats };
}

export function incrementCacheRevalidations(): void {
  stats.revalidations += 1;
}

function getMemorySnapshot(): Record<string, CacheEntry<unknown>> {
  return Object.fromEntries(memoryCache.entries());
}

declare global {
  interface Window {
    __CACHE_DEBUG__?: {
      stats: () => CacheStats;
      memory: () => Record<string, CacheEntry<unknown>>;
      invalidate: (prefix: string) => Promise<void>;
    };
  }
}

if (typeof window !== 'undefined' && isDev()) {
  window.__CACHE_DEBUG__ = {
    stats: () => getCacheStats(),
    memory: () => getMemorySnapshot(),
    invalidate: (prefix: string) => invalidateCache({ reason: 'debug', prefixes: [prefix] }),
  };
}

// Export a small preset helper so callers don't need to import both keys and policies for basics.
export const defaultPolicies = cachePolicies;
