import Redis from 'ioredis';

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    redis = null;
    return redis;
  }

  redis = new Redis(redisUrl, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    console.warn('Redis cache unavailable:', err.message);
  });

  return redis;
}

async function safe<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  const client = getRedis();
  if (!client) return fallback;

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    return await operation();
  } catch (err) {
    console.warn('Redis cache operation failed:', err);
    return fallback;
  }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  return safe(async () => {
    const value = await getRedis()!.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  }, null);
}

export async function cacheMGetJson<T>(keys: string[]): Promise<Array<T | null>> {
  if (keys.length === 0) return [];

  return safe(async () => {
    const values = await getRedis()!.mget(...keys);
    return values.map((value) => (value ? (JSON.parse(value) as T) : null));
  }, keys.map(() => null));
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  await safe(async () => {
    const serialized = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await getRedis()!.set(key, serialized, 'EX', ttlSeconds);
      return;
    }
    await getRedis()!.set(key, serialized);
  }, undefined);
}

export async function cacheDelete(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await safe(async () => {
    await getRedis()!.del(...keys);
  }, undefined);
}

export async function cacheZRevRange(key: string, start: number, stop: number): Promise<string[] | null> {
  return safe(async () => getRedis()!.zrevrange(key, start, stop), null);
}

export async function cacheZAdd(key: string, score: number, member: string): Promise<void> {
  await safe(async () => {
    await getRedis()!.zadd(key, score, member);
  }, undefined);
}

export async function cacheZAddMany(key: string, items: Array<{ score: number; member: string }>): Promise<void> {
  if (items.length === 0) return;
  await safe(async () => {
    const args = items.flatMap((item) => [String(item.score), item.member]);
    await getRedis()!.zadd(key, ...args);
  }, undefined);
}

export async function cacheZRem(key: string, ...members: string[]): Promise<void> {
  if (members.length === 0) return;
  await safe(async () => {
    await getRedis()!.zrem(key, ...members);
  }, undefined);
}

export async function cacheIncrement(key: string, field: string, amount: number): Promise<void> {
  await safe(async () => {
    await getRedis()!.hincrby(key, field, amount);
  }, undefined);
}

export async function cacheHGetAll(key: string): Promise<Record<string, string> | null> {
  return safe(async () => {
    const value = await getRedis()!.hgetall(key);
    return Object.keys(value).length > 0 ? value : null;
  }, null);
}

export function createRedisSubscriber(): Redis | null {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;
  const client = new Redis(redisUrl, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  client.on('error', (err) => console.warn('Redis subscriber unavailable:', err.message));
  return client;
}

export function createRedisPublisher(): Redis | null {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;
  const client = new Redis(redisUrl, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  client.on('error', (err) => console.warn('Redis publisher unavailable:', err.message));
  return client;
}
