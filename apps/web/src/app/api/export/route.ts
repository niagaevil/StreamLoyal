import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@streamloyal/db";

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const channel = await prisma.channel.findUnique({
    where: { ownerId: session.user.id },
  });
  if (!channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }
  const [commands, timers, viewers, items, moderation] = await Promise.all([
    prisma.chatCommand.findMany({ where: { channelId: channel.id } }),
    prisma.chatTimer.findMany({ where: { channelId: channel.id } }),
    prisma.viewerProfile.findMany({ where: { channelId: channel.id } }),
    prisma.storeItem.findMany({ where: { channelId: channel.id } }),
    prisma.moderationSettings.findUnique({ where: { channelId: channel.id } }),
  ]);
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const type = request.nextUrl.searchParams.get("type") ?? "commands";

  if (format === "csv") {
    const datasets: Record<string, { headers: string[]; rows: unknown[][] }> = {
      commands: {
        headers: ["name", "aliases", "response", "permission", "costPoints", "enabled"],
        rows: commands.map((item) => [
          item.name,
          item.aliases.join("|"),
          item.response,
          item.permission,
          item.costPoints,
          item.enabled,
        ]),
      },
      timers: {
        headers: ["name", "message", "intervalMin", "minChatLines", "enabled"],
        rows: timers.map((item) => [
          item.name,
          item.message,
          item.intervalMin,
          item.minChatLines,
          item.enabled,
        ]),
      },
      viewers: {
        headers: ["platformUserId", "displayName", "points", "activeMinutes", "watchMinutes"],
        rows: viewers.map((item) => [
          item.platformUserId,
          item.displayName,
          item.points,
          item.activeMinutes,
          item.watchMinutes,
        ]),
      },
      items: {
        headers: ["name", "description", "type", "cost", "stock", "isActive"],
        rows: items.map((item) => [
          item.name,
          item.description,
          item.type,
          item.cost,
          item.stock,
          item.isActive,
        ]),
      },
    };
    const dataset = datasets[type];
    if (!dataset) {
      return NextResponse.json({ error: "invalid_type" }, { status: 400 });
    }
    const csv = [
      dataset.headers.map(csvCell).join(","),
      ...dataset.rows.map((row) => row.map(csvCell).join(",")),
    ].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="streamloyal-${type}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      channel: { slug: channel.slug, platform: channel.platform },
      commands,
      timers,
      viewers: viewers.map((viewer) => ({
        platformUserId: viewer.platformUserId,
        displayName: viewer.displayName,
        points: viewer.points,
        activeMinutes: viewer.activeMinutes,
        watchMinutes: viewer.watchMinutes,
      })),
      items: items.map((item) => ({
        name: item.name,
        description: item.description,
        type: item.type,
        cost: item.cost,
        stock: item.stock,
        globalCooldownSec: item.globalCooldownSec,
        userCooldownSec: item.userCooldownSec,
        imageUrl: item.imageUrl,
        soundUrl: item.soundUrl,
        isFeatured: item.isFeatured,
        isActive: item.isActive,
        sortOrder: item.sortOrder,
      })),
      moderation: moderation
        ? {
            bannedWords: moderation.bannedWords,
            linkWhitelist: moderation.linkWhitelist,
          }
        : null,
    },
    {
      headers: {
        "Content-Disposition": 'attachment; filename="streamloyal-backup.json"',
        "Cache-Control": "no-store",
      },
    }
  );
}
