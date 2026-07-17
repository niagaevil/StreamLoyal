import { NextResponse } from "next/server";
import { prisma } from "@streamloyal/db";
import { redis } from "@/lib/rate-limit";

export async function GET() {
  const checks = { database: false, redis: false };
  await prisma.$queryRaw`SELECT 1`
    .then(() => {
      checks.database = true;
    })
    .catch(() => undefined);
  try {
    if (redis.status === "wait") await redis.connect();
    checks.redis = (await redis.ping()) === "PONG";
  } catch {
    checks.redis = false;
  }
  const ok = checks.database && checks.redis;
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checks,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
