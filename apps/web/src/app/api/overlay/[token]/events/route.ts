import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@streamloyal/db";
import { verifyOverlayToken } from "@/lib/overlay-token";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const access = await verifyOverlayToken(token, "ALERTS");
  if (!access) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await rateLimit(`overlay-events:${access.id}`, 120, 60)).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const afterRaw = request.nextUrl.searchParams.get("after");
  const after = afterRaw ? new Date(Number(afterRaw)) : new Date(Date.now() - 10_000);
  const upperBound = new Date();
  const [settings, events] = await Promise.all([
    prisma.alertSettings.findUnique({ where: { channelId: access.channelId } }),
    prisma.alertEvent.findMany({
      where: {
        channelId: access.channelId,
        createdAt: {
          gt: Number.isNaN(after.getTime()) ? upperBound : after,
          lte: upperBound,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);
  return NextResponse.json(
    { settings, events, serverTime: upperBound.getTime() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
