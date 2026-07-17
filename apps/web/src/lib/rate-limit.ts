import Redis from "ioredis";

const globalState = globalThis as unknown as {
  redis?: Redis;
  memoryLimits?: Map<string, { count: number; expiresAt: number }>;
};

export const redis =
  globalState.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
  });
redis.on("error", () => undefined);
if (process.env.NODE_ENV !== "production") globalState.redis = redis;

const memory =
  globalState.memoryLimits ??
  new Map<string, { count: number; expiresAt: number }>();
if (process.env.NODE_ENV !== "production") globalState.memoryLimits = memory;

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number
) {
  try {
    if (redis.status === "wait") await redis.connect();
    const redisKey = `rate:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSec);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    const now = Date.now();
    const current = memory.get(key);
    const entry =
      !current || current.expiresAt <= now
        ? { count: 0, expiresAt: now + windowSec * 1000 }
        : current;
    entry.count += 1;
    memory.set(key, entry);
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
    };
  }
}
