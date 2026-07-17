import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@streamloyal/db";

export async function GET(request: NextRequest) {
  const expected = process.env.METRICS_TOKEN;
  const provided = request.headers.get("authorization");
  if (!expected || provided !== `Bearer ${expected}`) {
    return new NextResponse("unauthorized\n", { status: 401 });
  }
  const [channels, liveStreams, viewers, pendingRedemptions, queuedMedia] =
    await Promise.all([
      prisma.channel.count(),
      prisma.liveStream.count({ where: { status: "LIVE" } }),
      prisma.viewerProfile.count(),
      prisma.redemption.count({ where: { status: "PENDING" } }),
      prisma.mediaQueueItem.count({
        where: { status: { in: ["PENDING", "PLAYING"] } },
      }),
    ]);
  const lines = [
    "# HELP streamloyal_channels_total Canais cadastrados",
    "# TYPE streamloyal_channels_total gauge",
    `streamloyal_channels_total ${channels}`,
    "# HELP streamloyal_live_streams Transmissoes ao vivo",
    "# TYPE streamloyal_live_streams gauge",
    `streamloyal_live_streams ${liveStreams}`,
    "# TYPE streamloyal_viewers_total gauge",
    `streamloyal_viewers_total ${viewers}`,
    "# TYPE streamloyal_redemptions_pending gauge",
    `streamloyal_redemptions_pending ${pendingRedemptions}`,
    "# TYPE streamloyal_media_queue gauge",
    `streamloyal_media_queue ${queuedMedia}`,
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${Math.floor(process.uptime())}`,
    "",
  ];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
