import Redis from "ioredis";

const globalState = globalThis as unknown as {
  redis?: Redis;
  memoryLimits?: Map<string, { count: number; expiresAt: number }>;
  memoryLastSweep?: number;
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

/** Evita crescimento ilimitado se o Redis ficar fora e chaves únicas acumulem. */
const MEMORY_MAX_ENTRIES = 10_000;
const MEMORY_SWEEP_INTERVAL_MS = 60_000;

function sweepExpiredMemory(now: number) {
  const lastSweep = globalState.memoryLastSweep ?? 0;
  const overdue = now - lastSweep >= MEMORY_SWEEP_INTERVAL_MS;
  const overCap = memory.size >= MEMORY_MAX_ENTRIES;
  if (!overdue && !overCap) return;

  globalState.memoryLastSweep = now;
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key);
  }

  if (memory.size <= MEMORY_MAX_ENTRIES) return;
  const overflow = memory.size - MEMORY_MAX_ENTRIES;
  const oldest = [...memory.entries()]
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    .slice(0, overflow);
  for (const [key] of oldest) memory.delete(key);
}

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
    sweepExpiredMemory(now);
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
