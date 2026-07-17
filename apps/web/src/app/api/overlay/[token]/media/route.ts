import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@streamloyal/db";
import { verifyOverlayToken } from "@/lib/overlay-token";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const access = await verifyOverlayToken(token, "MEDIA");
  if (!access) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await rateLimit(`overlay-media:${access.id}`, 60, 60)).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const result = await prisma.$transaction(async (tx) => {
    let item = await tx.mediaQueueItem.findFirst({
      where: { channelId: access.channelId, status: "PLAYING" },
      orderBy: { createdAt: "asc" },
    });
    if (!item) {
      item = await tx.mediaQueueItem.findFirst({
        where: { channelId: access.channelId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
      });
      if (item) {
        item = await tx.mediaQueueItem.update({
          where: { id: item.id },
          data: { status: "PLAYING" },
        });
      }
    }
    const settings = await tx.mediaSettings.findUnique({
      where: { channelId: access.channelId },
    });
    return { item, settings };
  });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const access = await verifyOverlayToken(token, "MEDIA");
  if (!access) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await rateLimit(`overlay-media-write:${access.id}`, 30, 60)).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as
    | { itemId?: string; action?: "played" | "skipped" }
    | null;
  if (!body?.itemId || !["played", "skipped"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const updated = await prisma.mediaQueueItem.updateMany({
    where: {
      id: body.itemId,
      channelId: access.channelId,
      status: "PLAYING",
    },
    data: {
      status: body.action === "played" ? "PLAYED" : "SKIPPED",
      playedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: updated.count === 1 });
}
