import { prisma } from "@streamloyal/db";
import { getStreamerAccessToken } from "./tokens";

export interface ActiveBroadcast {
  videoId: string;
  liveChatId: string | null;
}

/**
 * Verifica pela API oficial se o canal está ao vivo agora
 * (liveBroadcasts.list mine=true — custo de quota baixo).
 */
export async function fetchActiveBroadcast(
  ownerId: string
): Promise<ActiveBroadcast | null> {
  const token = await getStreamerAccessToken(ownerId);
  if (!token) return null;

  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status&broadcastStatus=active&maxResults=5",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    if (res.status !== 403 && res.status !== 401) {
      console.error(`[live] erro ${res.status} ao consultar broadcasts`);
    }
    return null;
  }
  const data = (await res.json()) as {
    items?: {
      id: string;
      snippet: { liveChatId?: string };
      status: { lifeCycleStatus: string };
    }[];
  };
  const active = data.items?.find((b) => b.status.lifeCycleStatus === "live");
  if (!active) return null;
  return { videoId: active.id, liveChatId: active.snippet.liveChatId ?? null };
}

/** Sincroniza o estado LiveStream do canal no banco. Retorna a live ativa. */
export async function syncLiveState(channelId: string, ownerId: string) {
  const broadcast = await fetchActiveBroadcast(ownerId);

  const current = await prisma.liveStream.findFirst({
    where: { channelId, status: "LIVE" },
  });

  if (broadcast) {
    if (current && current.videoId === broadcast.videoId) {
      if (!current.liveChatId && broadcast.liveChatId) {
        return prisma.liveStream.update({
          where: { id: current.id },
          data: { liveChatId: broadcast.liveChatId },
        });
      }
      return current;
    }
    // Live anterior terminou e outra começou
    if (current) {
      await prisma.liveStream.update({
        where: { id: current.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
    }
    return prisma.liveStream.upsert({
      where: {
        channelId_videoId: { channelId, videoId: broadcast.videoId },
      },
      create: {
        channelId,
        videoId: broadcast.videoId,
        liveChatId: broadcast.liveChatId,
      },
      update: { status: "LIVE", endedAt: null, liveChatId: broadcast.liveChatId },
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
