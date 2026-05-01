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

type RedisCommandValue = string | number | boolean;

const STREAM_POLL_INTERVAL_MS = 1000;

function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

export function isRedisConfigured(): boolean {
  return getUpstashConfig() !== null;
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

export async function cacheExpire(key: string, ttlSeconds: number): Promise<void> {
  if (!ttlSeconds || ttlSeconds <= 0) return;
  await runCommand(['EXPIRE', key, ttlSeconds]);
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

export async function cacheHashSet(
  key: string,
  fields: Record<string, string | number | boolean | null | undefined>,
  ttlSeconds?: number,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  const args = entries.flatMap(([field, value]) => [field, value === null ? 'null' : String(value)]);
  await runCommand(['HSET', key, ...args]);

  if (ttlSeconds && ttlSeconds > 0) {
    await cacheExpire(key, ttlSeconds);
  }
}

export async function cacheHashDelete(key: string, ...fields: string[]): Promise<void> {
  if (fields.length === 0) return;
  await runCommand(['HDEL', key, ...fields]);
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

export async function cacheHashGet(key: string, field: string): Promise<string | null> {
  const result = await runCommand<string>(['HGET', key, field]);
  return typeof result === 'string' ? result : null;
}

export async function cacheHashMultiGet(
  key: string,
  fields: string[],
): Promise<Array<string | null>> {
  if (fields.length === 0) return [];
  const result = await runCommand<Array<string | null>>(['HMGET', key, ...fields]);
  if (!Array.isArray(result)) {
    return fields.map(() => null);
  }

  return result.map((value) => (typeof value === 'string' ? value : null));
}

export async function cacheHashIncrementBy(
  key: string,
  field: string,
  amount: number,
  ttlSeconds?: number,
): Promise<number | null> {
  const result = await runCommand<number>(['HINCRBY', key, field, amount]);
  if (ttlSeconds && ttlSeconds > 0) {
    await cacheExpire(key, ttlSeconds);
  }
  return typeof result === 'number' ? result : null;
}

export async function cacheSetAdd(key: string, ...members: string[]): Promise<void> {
  if (members.length === 0) return;
  await runCommand(['SADD', key, ...members]);
}

export async function cacheSetMembers(key: string): Promise<string[]> {
  const result = await runCommand<string[]>(['SMEMBERS', key]);
  if (!Array.isArray(result)) return [];
  return result.map((item) => String(item));
}

export async function cacheSetCardinality(key: string): Promise<number> {
  const result = await runCommand<number>(['SCARD', key]);
  return typeof result === 'number' ? result : 0;
}

async function appendStreamMessage(channel: string, payload: string): Promise<void> {
  await runCommand(['XADD', channel, '*', 'payload', payload]);
}

class PollingRedisSubscriber implements RedisSubscriber {
  private readonly channels = new Set<string>();
  private readonly handlers = new Set<(channel: string, payload: string) => void>();
  private readonly cursors = new Map<string, string>();
  private polling = false;
  private disposed = false;

  async subscribe(channel: string): Promise<void> {
    if (!channel.trim()) return;
    this.channels.add(channel);
    if (!this.cursors.has(channel)) {
      this.cursors.set(channel, '$');
    }
    this.start();
  }

  on(_event: 'message', handler: (channel: string, payload: string) => void): void {
    this.handlers.add(handler);
  }

  private start(): void {
    if (this.polling || this.disposed || this.channels.size === 0) return;
    this.polling = true;
    void this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    while (!this.disposed && this.channels.size > 0) {
      try {
        await Promise.all(Array.from(this.channels).map((channel) => this.pollChannel(channel)));
      } catch (err) {
        console.warn('Redis subscriber poll failed:', err);
      }

      await new Promise((resolve) => setTimeout(resolve, STREAM_POLL_INTERVAL_MS));
    }

    this.polling = false;
  }

  private async pollChannel(channel: string): Promise<void> {
    const cursor = this.cursors.get(channel) ?? '$';
    const result = await runCommand<Array<[string, Array<Record<string, string>>]>>([
      'XRANGE',
      channel,
      cursor === '$' ? '-' : `(${cursor}`,
      '+',
      'COUNT',
      100,
    ]);

    if (!Array.isArray(result) || result.length === 0) {
      if (cursor === '$') {
        const latest = await runCommand<Array<[string, Array<Record<string, string>>]>>([
          'XREVRANGE',
          channel,
          '+',
          '-',
          'COUNT',
          1,
        ]);
        const latestEntry = Array.isArray(latest) ? latest[0] : null;
        if (latestEntry?.[0]) {
          this.cursors.set(channel, String(latestEntry[0]));
        }
      }
      return;
    }

    for (const entry of result) {
      const entryId = String(entry[0] ?? '');
      const fields = Array.isArray(entry[1]) ? entry[1] : [];
      const payloadField = fields.find((field) => typeof field?.payload === 'string');
      if (payloadField?.payload) {
        for (const handler of this.handlers) {
          handler(channel, payloadField.payload);
        }
      }
      if (entryId) {
        this.cursors.set(channel, entryId);
      }
    }
  }
}

export function createRedisSubscriber(): RedisSubscriber | null {
  if (!getUpstashConfig()) return null;
  return new PollingRedisSubscriber();
}

export function createRedisPublisher(): RedisPublisher | null {
  if (!getUpstashConfig()) return null;
  return {
    async publish(channel: string, payload: string): Promise<void> {
      await appendStreamMessage(channel, payload);
    },
  };
}
