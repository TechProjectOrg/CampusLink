type UpstashResponse<T = unknown> = {
  result?: T;
  error?: string;
};

type RedisPublisher = {
  publish(channel: string, payload: string): Promise<void>;
};

type RedisSubscriber = {
  subscribe(channel: string): Promise<void>;
  on(event: 'message', handler: (channel: string, payload: string) => void): void;
};

function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

async function runCommand<T>(command: Array<string | number>): Promise<T | null> {
  const config = getUpstashConfig();
  if (!config) return null;

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      console.warn(`Upstash Redis command failed with status ${response.status}`);
      return null;
    }

    const data = (await response.json()) as UpstashResponse<T>;
    if (data.error) {
      console.warn('Upstash Redis command error:', data.error);
      return null;
    }

    return data.result ?? null;
  } catch (err) {
    console.warn('Upstash Redis unavailable:', err);
    return null;
  }
}

async function runPipeline<T>(commands: Array<Array<string | number>>): Promise<Array<T | null>> {
  if (commands.length === 0) return [];
  const config = getUpstashConfig();
  if (!config) return commands.map(() => null);

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      console.warn(`Upstash Redis pipeline failed with status ${response.status}`);
      return commands.map(() => null);
    }

    const data = (await response.json()) as Array<UpstashResponse<T>>;
    return data.map((item) => {
      if (item.error) {
        console.warn('Upstash Redis pipeline command error:', item.error);
        return null;
      }
      return item.result ?? null;
    });
  } catch (err) {
    console.warn('Upstash Redis pipeline unavailable:', err);
    return commands.map(() => null);
  }
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const value = await runCommand<string>(['GET', key]);
  return parseJson<T>(value);
}

export async function cacheMGetJson<T>(keys: string[]): Promise<Array<T | null>> {
  if (keys.length === 0) return [];
  const values = await runPipeline<string>(keys.map((key) => ['GET', key]));
  return values.map((value) => parseJson<T>(value));
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const serialized = JSON.stringify(value);
  const command: Array<string | number> =
    ttlSeconds && ttlSeconds > 0
      ? ['SET', key, serialized, 'EX', ttlSeconds]
      : ['SET', key, serialized];

  await runCommand(command);
}

export async function cacheDelete(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await runCommand(['DEL', ...keys]);
}

export async function cacheZRevRange(key: string, start: number, stop: number): Promise<string[] | null> {
  const result = await runCommand<string[]>(['ZREVRANGE', key, start, stop]);
  return Array.isArray(result) ? result.map(String) : null;
}

export async function cacheZAdd(key: string, score: number, member: string): Promise<void> {
  await runCommand(['ZADD', key, score, member]);
}

export async function cacheZAddMany(key: string, items: Array<{ score: number; member: string }>): Promise<void> {
  if (items.length === 0) return;
  const args = items.flatMap((item) => [item.score, item.member]);
  await runCommand(['ZADD', key, ...args]);
}

export async function cacheZRem(key: string, ...members: string[]): Promise<void> {
  if (members.length === 0) return;
  await runCommand(['ZREM', key, ...members]);
}

export async function cacheIncrement(key: string, field: string, amount: number): Promise<void> {
  await runCommand(['HINCRBY', key, field, amount]);
}

export async function cacheHGetAll(key: string): Promise<Record<string, string> | null> {
  const result = await runCommand<string[]>(['HGETALL', key]);
  if (!Array.isArray(result) || result.length === 0) return null;

  const mapped: Record<string, string> = {};
  for (let index = 0; index < result.length; index += 2) {
    mapped[String(result[index])] = String(result[index + 1] ?? '');
  }
  return mapped;
}

export function createRedisSubscriber(): RedisSubscriber | null {
  return null;
}

export function createRedisPublisher(): RedisPublisher | null {
  if (!getUpstashConfig()) return null;
  return {
    async publish(channel: string, payload: string): Promise<void> {
      await runCommand(['PUBLISH', channel, payload]);
    },
  };
}
