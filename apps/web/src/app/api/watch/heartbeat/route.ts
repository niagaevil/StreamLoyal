import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@streamloyal/db";
import { awardPoints } from "@streamloyal/core";
import { auth } from "@/lib/auth";
import { getOrCreateMyViewerProfile } from "@/lib/viewer";
import { rateLimit } from "@/lib/rate-limit";

const HEARTBEAT_INTERVAL_SEC = 30;
// Tolerância: aceita até 1.5x o intervalo entre heartbeats
const MAX_CREDIT_PER_BEAT_SEC = Math.floor(HEARTBEAT_INTERVAL_SEC * 1.5);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const limited = await rateLimit(`watch:${session.user.id}`, 5, 30);
  if (!limited.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    playing?: boolean;
    visible?: boolean;
  } | null;
  if (!body?.slug) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { slug: body.slug },
    include: { loyaltySettings: true },
  });
  if (!channel?.loyaltySettings?.enabled || !channel.loyaltySettings.watchEarnEnabled) {
    return NextResponse.json({ error: "DISABLED" }, { status: 403 });
  }
  // Na Twitch os lurkers já ganham pontos via lista de chatters — sem heartbeat
  if (channel.platform !== "YOUTUBE") {
    return NextResponse.json({ error: "DISABLED" }, { status: 403 });
  }

  const live = await prisma.liveStream.findFirst({
    where: { channelId: channel.id, status: "LIVE" },
  });
  if (!live) {
    return NextResponse.json({ live: false });
  }

  const viewer = await getOrCreateMyViewerProfile(channel.id, channel.platform);
  if (!viewer) {
    return NextResponse.json({ error: "NO_VIEWER" }, { status: 400 });
  }

  const blocked = await prisma.blockedUser.findUnique({
    where: {
      channelId_platformUserId: {
        channelId: channel.id,
        platformUserId: viewer.platformUserId,
      },
    },
  });
  if (blocked) {
    return NextResponse.json({ error: "BLOCKED" }, { status: 403 });
  }

  // Sessão de watch mais recente desta live (uma ativa por usuário/canal)
  let watchSession = await prisma.watchSession.findFirst({
    where: {
      channelId: channel.id,
      userId: session.user.id,
      videoId: live.videoId,
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
  });
  if (!watchSession) {
    watchSession = await prisma.watchSession.create({
      data: {
        channelId: channel.id,
        userId: session.user.id,
        viewerId: viewer.id,
        videoId: live.videoId,
      },
    });
  }

  const now = new Date();
  const s = channel.loyaltySettings;

  // Só acumula se o player está tocando e a aba visível
  if (body.playing && body.visible) {
    const elapsedSec = Math.floor(
      (now.getTime() - watchSession.lastHeartbeatAt.getTime()) / 1000
    );
    const creditSec = Math.min(Math.max(elapsedSec, 0), MAX_CREDIT_PER_BEAT_SEC);

    const intervalSec = s.payoutIntervalMin * 60;
    const newValid = watchSession.validSeconds + creditSec;

    // Quantos intervalos completos ainda não creditados
    const intervalsDue = Math.floor(newValid / intervalSec);
    const intervalsPaid = Math.floor(watchSession.creditedSeconds / intervalSec);
    let toPay = intervalsDue - intervalsPaid;

    let pointsAwarded = 0;
    if (toPay > 0 && s.pointsPerIntervalWatch > 0) {
      const remainingCap =
        s.maxWatchPointsPerStream - watchSession.pointsAwarded;
      const maxIntervals = Math.floor(remainingCap / s.pointsPerIntervalWatch);
      toPay = Math.min(toPay, Math.max(maxIntervals, 0));

      for (let i = 0; i < toPay; i++) {
        const intervalIndex = intervalsPaid + i + 1;
        const ok = await awardPoints({
          channelId: channel.id,
          viewerId: viewer.id,
          delta: s.pointsPerIntervalWatch,
          reason: "WATCH_TIME",
          refId: watchSession.id,
          idempotencyKey: `watch:${watchSession.id}:${intervalIndex}`,
        });
        if (ok) pointsAwarded += s.pointsPerIntervalWatch;
      }
    }

    await prisma.watchSession.update({
      where: { id: watchSession.id },
      data: {
        lastHeartbeatAt: now,
        validSeconds: newValid,
        creditedSeconds: intervalsDue * intervalSec,
        pointsAwarded: { increment: pointsAwarded },
      },
    });
    if (creditSec > 0) {
      await prisma.viewerProfile.update({
        where: { id: viewer.id },
        data: { watchMinutes: { increment: Math.round(creditSec / 60) } },
      });
    }

    const updatedViewer = await prisma.viewerProfile.findUnique({
      where: { id: viewer.id },
      select: { points: true },
    });
    return NextResponse.json({
      live: true,
      credited: pointsAwarded,
      points: updatedViewer?.points ?? viewer.points,
      validSeconds: newValid,
    });
  }

  // Pausado ou aba oculta: só atualiza o relógio sem creditar
  await prisma.watchSession.update({
    where: { id: watchSession.id },
    data: { lastHeartbeatAt: now },
  });
  return NextResponse.json({
    live: true,
    credited: 0,
    points: viewer.points,
    validSeconds: watchSession.validSeconds,
  });
}
