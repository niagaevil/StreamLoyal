import { prisma, LiveStream } from "@streamloyal/db";
import { awardPoints, ensureViewer } from "@streamloyal/core";
import { getStreamerAccessToken, getYouTubeBotAccessToken } from "./tokens";
import { processChatMessage, tickTimers, ChatActions } from "../../engine";
import { sendChatMessage, deleteChatMessage, timeoutChatUser } from "./api";
import { emitAlert } from "../../engine/alerts";

interface ChatMessage {
  id: string;
  snippet: {
    type: string;
    publishedAt: string;
    displayMessage?: string;
    superChatDetails?: { amountMicros: string; currency: string };
  };
  authorDetails: {
    channelId: string;
    displayName: string;
    profileImageUrl?: string;
    isChatOwner: boolean;
    isChatModerator: boolean;
    isChatSponsor: boolean;
  };
}

interface PollState {
  pageToken?: string;
  /** Participantes ativos desde o último payout. */
  activeSince: Map<string, { displayName: string; avatarUrl?: string }>;
  lastPayoutAt: number;
  /** Índice do intervalo atual (para idempotência do payout). */
  intervalIndex: number;
  offline: boolean;
  /** O primeiro poll traz histórico antigo — não executa comandos nele. */
  initialized: boolean;
}

const states = new Map<string, PollState>();

function getState(liveStreamId: string): PollState {
  let st = states.get(liveStreamId);
  if (!st) {
    st = {
      activeSince: new Map(),
      lastPayoutAt: Date.now(),
      intervalIndex: 0,
      offline: false,
      initialized: false,
    };
    states.set(liveStreamId, st);
  }
  return st;
}

/**
 * Lê novas mensagens do chat da live, registra participantes ativos e
 * credita bônus de eventos (Super Chat, membros, presentes).
 * Retorna o intervalo sugerido pela API para o próximo poll (ms).
 */
export async function pollChat(
  channelId: string,
  ownerId: string,
  live: LiveStream
): Promise<number> {
  if (!live.liveChatId) return 30_000;

  const token = await getStreamerAccessToken(ownerId);
  if (!token) return 60_000;
  const botToken = (await getYouTubeBotAccessToken(channelId, ownerId)) ?? token;

  const st = getState(live.id);
  const url = new URL(
    "https://www.googleapis.com/youtube/v3/liveChat/messages"
  );
  url.searchParams.set("liveChatId", live.liveChatId);
  url.searchParams.set("part", "snippet,authorDetails");
  url.searchParams.set("maxResults", "200");
  if (st.pageToken) url.searchParams.set("pageToken", st.pageToken);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      st.offline = true;
    }
    console.error(`[chat] erro ${res.status} no canal ${channelId}`);
    return 60_000;
  }

  const data = (await res.json()) as {
    items?: ChatMessage[];
    nextPageToken?: string;
    pollingIntervalMillis?: number;
    offlineAt?: string;
  };
  st.pageToken = data.nextPageToken;
  if (data.offlineAt) st.offline = true;

  const liveChatId = live.liveChatId;
  const actions: ChatActions = {
    send: (text) => sendChatMessage(botToken, liveChatId, text),
    deleteMessage: (messageId) => deleteChatMessage(botToken, messageId),
    timeoutUser: (userId, seconds) =>
      timeoutChatUser(botToken, liveChatId, userId, seconds),
  };
  const runEngine = st.initialized;
  st.initialized = true;

  const settings = await prisma.loyaltySettings.findUnique({
    where: { channelId },
  });
  if (!settings) return data.pollingIntervalMillis ?? 15_000;

  const blocked = new Set(
    (
      await prisma.blockedUser.findMany({
        where: { channelId },
        select: { platformUserId: true },
      })
    ).map((b) => b.platformUserId)
  );

  for (const msg of data.items ?? []) {
    const author = msg.authorDetails;
    if (!author?.channelId || blocked.has(author.channelId)) continue;

    st.activeSince.set(author.channelId, {
      displayName: author.displayName,
      avatarUrl: author.profileImageUrl,
    });

    const viewer = await ensureViewer({
      channelId,
      platformUserId: author.channelId,
      displayName: author.displayName,
      avatarUrl: author.profileImageUrl,
      isModerator: author.isChatModerator || author.isChatOwner,
      isMember: author.isChatSponsor,
    });

    // Moderação, timers e comandos (só em mensagens novas)
    if (runEngine && msg.snippet.type === "textMessageEvent") {
      await processChatMessage(
        { channelId, platform: "YOUTUBE", liveId: live.id },
        {
          messageId: msg.id,
          userId: author.channelId,
          displayName: author.displayName,
          text: msg.snippet.displayMessage ?? "",
          isModerator: author.isChatModerator || author.isChatOwner,
          isMember: author.isChatSponsor,
        },
        actions
      );
    }

    // Bônus por eventos do chat
    const type = msg.snippet.type;
    if (type === "superChatEvent" && msg.snippet.superChatDetails) {
      const units = Math.floor(
        Number(msg.snippet.superChatDetails.amountMicros) / 1_000_000
      );
      const delta = units * settings.pointsPerSuperChatUnit;
      if (settings.enabled && delta > 0) {
        await awardPoints({
          channelId,
          viewerId: viewer.id,
          delta,
          reason: "SUPER_CHAT",
          refId: msg.id,
          idempotencyKey: `msg:${msg.id}`,
        });
      }
      await emitAlert({
        channelId,
        type: "super_chat",
        userName: author.displayName,
        amount: units,
        message: `${author.displayName} enviou um Super Chat!`,
        sourceKey: `youtube:${msg.id}`,
      });
    } else if (type === "superStickerEvent") {
      if (settings.enabled && settings.pointsOnSuperSticker > 0) {
        await awardPoints({
          channelId,
          viewerId: viewer.id,
          delta: settings.pointsOnSuperSticker,
          reason: "SUPER_STICKER",
          refId: msg.id,
          idempotencyKey: `msg:${msg.id}`,
        });
      }
      await emitAlert({
        channelId,
        type: "super_sticker",
        userName: author.displayName,
        message: `${author.displayName} enviou um Super Sticker!`,
        sourceKey: `youtube:${msg.id}`,
      });
    } else if (type === "newSponsorEvent") {
      if (settings.enabled && settings.pointsOnNewMember > 0) {
        await awardPoints({
          channelId,
          viewerId: viewer.id,
          delta: settings.pointsOnNewMember,
          reason: "NEW_MEMBER",
          refId: msg.id,
          idempotencyKey: `msg:${msg.id}`,
        });
      }
      await emitAlert({
        channelId,
        type: "member",
        userName: author.displayName,
        message: `${author.displayName} virou membro!`,
        sourceKey: `youtube:${msg.id}`,
      });
    } else if (
      type === "membershipGiftingEvent"
    ) {
      if (settings.enabled && settings.pointsOnGiftGiver > 0) {
        await awardPoints({
          channelId,
          viewerId: viewer.id,
          delta: settings.pointsOnGiftGiver,
          reason: "GIFT_GIVEN",
          refId: msg.id,
          idempotencyKey: `msg:${msg.id}`,
        });
      }
      await emitAlert({
        channelId,
        type: "gift",
        userName: author.displayName,
        message: `${author.displayName} presenteou uma assinatura!`,
        sourceKey: `youtube:${msg.id}`,
      });
    } else if (
      type === "giftMembershipReceivedEvent"
    ) {
      if (settings.enabled && settings.pointsOnGiftReceiver > 0) {
        await awardPoints({
          channelId,
          viewerId: viewer.id,
          delta: settings.pointsOnGiftReceiver,
          reason: "GIFT_RECEIVED",
          refId: msg.id,
          idempotencyKey: `msg:${msg.id}`,
        });
      }
      await emitAlert({
        channelId,
        type: "gift",
        userName: author.displayName,
        message: `${author.displayName} recebeu uma assinatura presenteada!`,
        sourceKey: `youtube:${msg.id}`,
      });
    } else if (type === "memberMilestoneChatEvent") {
      await emitAlert({
        channelId,
        type: "member",
        userName: author.displayName,
        message: `${author.displayName} celebrou um marco de membro!`,
        sourceKey: `youtube:${msg.id}`,
      });
    }
  }

  // Payout por intervalo para quem participou do chat
  const intervalMs = settings.payoutIntervalMin * 60_000;
  if (Date.now() - st.lastPayoutAt >= intervalMs) {
    st.intervalIndex += 1;
    const participants = [...st.activeSince.entries()];
    st.activeSince.clear();
    st.lastPayoutAt = Date.now();

    if (settings.enabled && settings.pointsPerIntervalActive > 0) {
      for (const [ytChannelId, info] of participants) {
        const viewer = await ensureViewer({
          channelId,
          platformUserId: ytChannelId,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
        });
        const base = settings.pointsPerIntervalActive;
        const delta = viewer.isMember
          ? Math.round(base * settings.memberMultiplier)
          : base;
        const ok = await awardPoints({
          channelId,
          viewerId: viewer.id,
          delta,
          reason: "CHAT_ACTIVITY",
          refId: live.id,
          idempotencyKey: `chat:${live.id}:${st.intervalIndex}:${ytChannelId}`,
        });
        if (ok) {
          await prisma.viewerProfile.update({
            where: { id: viewer.id },
            data: {
              activeMinutes: { increment: settings.payoutIntervalMin },
            },
          });
        }
      }
      console.log(
        `[chat] canal ${channelId}: payout #${st.intervalIndex} para ${participants.length} participantes`
      );
    }
  }

  // Timers automáticos do canal
  if (runEngine) {
    await tickTimers(channelId, actions);
  }

  return data.pollingIntervalMillis ?? 15_000;
}

/** Limpa o estado em memória de uma live encerrada. */
export function clearChatState(liveStreamId: string) {
  states.delete(liveStreamId);
}
