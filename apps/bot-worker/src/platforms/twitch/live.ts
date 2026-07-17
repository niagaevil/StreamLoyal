import { prisma } from "@streamloyal/db";
import { getTwitchAccessToken } from "./tokens";
import { getLiveStream } from "./helix";

/** Sincroniza o estado LiveStream de um canal Twitch. Retorna a live ativa. */
export async function syncTwitchLiveState(
  channelId: string,
  ownerId: string,
  broadcasterId: string
) {
  const token = await getTwitchAccessToken(ownerId);
  const stream = token ? await getLiveStream(broadcasterId, token) : null;

  const current = await prisma.liveStream.findFirst({
    where: { channelId, status: "LIVE" },
  });

  if (stream) {
    if (current && current.videoId === stream.id) return current;
    if (current) {
      await prisma.liveStream.update({
        where: { id: current.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
    }
    return prisma.liveStream.upsert({
      where: { channelId_videoId: { channelId, videoId: stream.id } },
      create: { channelId, videoId: stream.id },
      update: { status: "LIVE", endedAt: null },
    });
  }

  if (current) {
    await prisma.liveStream.update({
      where: { id: current.id },
      data: { status: "ENDED", endedAt: new Date() },
    });
  }
  return null;
}
