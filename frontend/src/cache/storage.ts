import type { CacheEntry } from './types';

const DB_NAME = 'campuslynk-client-cache';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

interface CacheRecord<T = unknown> extends CacheEntry<T> {}

let openPromise: Promise<IDBDatabase | null> | null = null;

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return Promise.resolve(null);
  }
  if (openPromise) {
    return openPromise;
  }

  openPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
          store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return openPromise;
}

function wrapRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPersistentEntry<T>(key: string): Promise<CacheRecord<T> | null> {
  const db = await openDb();
  if (!db) return null;

  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await wrapRequest(store.get(key));
    return (result as CacheRecord<T> | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function writePersistentEntry<T>(entry: CacheRecord<T>): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore persistence errors; memory cache still works.
  }
}

export async function deletePersistentEntries(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    keys.forEach((key) => store.delete(key));
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore persistence errors.
  }
}

export async function readAllPersistentEntries(): Promise<CacheRecord[]> {
  const db = await openDb();
  if (!db) return [];

  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await wrapRequest(store.getAll());
    return Array.isArray(result) ? (result as CacheRecord[]) : [];
  } catch {
    return [];
  }
}
