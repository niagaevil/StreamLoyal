import { prisma, Channel } from "@streamloyal/db";
import { awardPoints, ensureViewer } from "@streamloyal/core";
import { getTwitchAccessToken } from "./tokens";
import {
  getChatters,
  sendChatMessage,
  deleteChatMessage,
  timeoutUser,
} from "./helix";
import { TwitchEventSubClient } from "./eventsub";
import {
  processChatMessage,
  tickTimers,
  clearTimerState,
  ChatActions,
} from "../../engine";
import { emitAlert } from "../../engine/alerts";

const TICK_MS = 30_000;

async function isBlocked(channelId: string, platformUserId: string) {
  const hit = await prisma.blockedUser.findUnique({
    where: { channelId_platformUserId: { channelId, platformUserId } },
  });
  return Boolean(hit);
}

/**
 * Loop de um canal Twitch ao vivo: escuta eventos via EventSub WebSocket e,
 * a cada intervalo de payout, credita pontos para ativos (falaram no chat) e
 * lurkers (conectados ao chat, via Get Chatters).
 * Retorna quando a live termina.
 */
export async function runTwitchChannelLoop(channel: Channel, liveId: string) {
  const channelId = channel.id;
  const broadcasterId = channel.platformChannelId;
  const getToken = () => getTwitchAccessToken(channel.ownerId);

  // Quem falou no chat desde o último payout
  const spoke = new Map<
    string,
    { displayName: string; isModerator: boolean; isSubscriber: boolean }
  >();
  let intervalIndex = 0;
  let lastPayoutAt = Date.now();

  const creditEvent = async (
    userId: string | null,
    displayName: string | null,
    delta: number,
    reason: "FOLLOW" | "SUBSCRIPTION" | "BITS" | "RAID" | "GIFT_GIVEN",
    idempotencyKey: string
  ) => {
    if (!userId || delta <= 0) return;
    try {
      if (await isBlocked(channelId, userId)) return;
      const viewer = await ensureViewer({
        channelId,
        platformUserId: userId,
        displayName: displayName ?? "Espectador",
      });
      await awardPoints({
        channelId,
        viewerId: viewer.id,
        delta,
        reason,
        refId: liveId,
        idempotencyKey,
      });
    } catch (err) {
      console.error(`[twitch] erro ao creditar ${reason} no canal ${channelId}`, err);
    }
  };

  const settingsNow = () =>
    prisma.loyaltySettings.findUnique({ where: { channelId } });

  const actions: ChatActions = {
    send: async (text) => {
      const token = await getToken();
      if (token) await sendChatMessage(broadcasterId, token, text);
    },
    deleteMessage: async (messageId) => {
      const token = await getToken();
      if (token) await deleteChatMessage(broadcasterId, token, messageId);
    },
    timeoutUser: async (userId, seconds, reason) => {
      const token = await getToken();
      if (token) await timeoutUser(broadcasterId, token, userId, seconds, reason);
    },
  };

  const eventsub = new TwitchEventSubClient(
    broadcasterId,
    getToken,
    {
      onChatMessage: (e) => {
        if (!e.userId) return;
        spoke.set(e.userId, e);
        // Moderação + comandos (não bloqueia o handler do WebSocket)
        void processChatMessage(
          { channelId, platform: "TWITCH", liveId },
          {
            messageId: e.messageId,
            userId: e.userId,
            displayName: e.displayName,
            text: e.text,
            isModerator: e.isModerator || e.userId === broadcasterId,
            isMember: e.isSubscriber,
          },
          actions
        );
      },
      onFollow: (userId, displayName) => {
        void (async () => {
          const s = await settingsNow();
          if (s?.enabled) {
            await creditEvent(
              userId,
              displayName,
              s.pointsOnFollow,
              "FOLLOW",
              `follow:${channelId}:${userId}` // 1x por usuário, mesmo re-seguindo
            );
          }
          await emitAlert({
            channelId,
            type: "follow",
            userName: displayName,
            message: `${displayName ?? "Alguém"} começou a seguir!`,
            sourceKey: `twitch:follow:${channelId}:${userId}`,
          });
        })();
      },
      onSub: (userId, displayName, messageId) => {
        void (async () => {
          const s = await settingsNow();
          if (s?.enabled) {
            await creditEvent(
              userId,
              displayName,
              s.pointsOnSub,
              "SUBSCRIPTION",
              `evt:${messageId}`
            );
          }
          await emitAlert({
            channelId,
            type: "subscription",
            userName: displayName,
            message: `${displayName ?? "Alguém"} virou sub!`,
            sourceKey: `twitch:sub:${messageId}`,
          });
        })();
      },
      onGiftSub: (userId, displayName, total, messageId) => {
        void (async () => {
          const s = await settingsNow();
          if (s?.enabled) {
            await creditEvent(
              userId,
              displayName,
              s.pointsOnGiftGiver * total,
              "GIFT_GIVEN",
              `evt:${messageId}`
            );
          }
          await emitAlert({
            channelId,
            type: "gift",
            userName: displayName,
            amount: total,
            message: `${displayName ?? "Alguém"} presenteou ${total} sub(s)!`,
            sourceKey: `twitch:gift:${messageId}`,
          });
        })();
      },
      onCheer: (userId, displayName, bits, messageId) => {
        void (async () => {
          const s = await settingsNow();
          if (s?.enabled) {
            const delta = Math.floor(bits / 100) * s.pointsPerBits100;
            await creditEvent(userId, displayName, delta, "BITS", `evt:${messageId}`);
          }
          await emitAlert({
            channelId,
            type: "bits",
            userName: displayName,
            amount: bits,
            message: `${displayName ?? "Alguém"} enviou ${bits} bits!`,
            sourceKey: `twitch:bits:${messageId}`,
          });
        })();
      },
      onRaid: (fromUserId, fromDisplayName, _viewers, messageId) => {
        void (async () => {
          const s = await settingsNow();
          if (s?.enabled) {
            await creditEvent(
              fromUserId,
              fromDisplayName,
              s.pointsOnRaid,
              "RAID",
              `evt:${messageId}`
            );
          }
          await emitAlert({
            channelId,
            type: "raid",
            userName: fromDisplayName,
            amount: _viewers,
            message: `Raid de ${fromDisplayName ?? "outro canal"} com ${_viewers} pessoa(s)!`,
            sourceKey: `twitch:raid:${messageId}`,
          });
        })();
      },
    },
    channel.slug
  );
  eventsub.start();

  try {
    for (;;) {
      const live = await prisma.liveStream.findUnique({ where: { id: liveId } });
      if (!live || live.status !== "LIVE") break;

      const settings = await settingsNow();
      if (settings?.enabled) {
        const intervalMs = settings.payoutIntervalMin * 60_000;
        if (Date.now() - lastPayoutAt >= intervalMs) {
          intervalIndex += 1;
          lastPayoutAt = Date.now();
          await payout(intervalIndex);
        }
      }

      await tickTimers(channelId, actions);

      await new Promise((r) => setTimeout(r, TICK_MS));
    }
  } finally {
    eventsub.stop();
    clearTimerState(channelId);
  }

  async function payout(index: number) {
    const settings = await settingsNow();
    if (!settings?.enabled) return;

    const token = await getToken();
    const chatters = token ? await getChatters(broadcasterId, token) : [];
    const spokeNow = new Map(spoke);
    spoke.clear();

    const blocked = new Set(
      (
        await prisma.blockedUser.findMany({
          where: { channelId },
          select: { platformUserId: true },
        })
      ).map((b) => b.platformUserId)
    );

    // Garante que quem falou entra no payout mesmo se faltar na lista de chatters
    const byId = new Map(chatters.map((c) => [c.user_id, c.user_name || c.user_login]));
    for (const [userId, info] of spokeNow) {
      if (!byId.has(userId)) byId.set(userId, info.displayName);
    }

    let actives = 0;
    let lurkers = 0;
    for (const [userId, displayName] of byId) {
      if (userId === broadcasterId || blocked.has(userId)) continue;
      const spokeInfo = spokeNow.get(userId);
      const isActive = Boolean(spokeInfo);

      const viewer = await ensureViewer({
        channelId,
        platformUserId: userId,
        displayName,
        isModerator: spokeInfo?.isModerator,
        isMember: spokeInfo?.isSubscriber,
      });

      const base = isActive
        ? settings.pointsPerIntervalActive
        : settings.pointsPerIntervalLurker;
      if (base <= 0) continue;
      const delta = viewer.isMember
        ? Math.round(base * settings.memberMultiplier)
        : base;

      const ok = await awardPoints({
        channelId,
        viewerId: viewer.id,
        delta,
        reason: isActive ? "CHAT_ACTIVITY" : "LURK_TIME",
        refId: liveId,
        idempotencyKey: `${isActive ? "chat" : "lurk"}:${liveId}:${index}:${userId}`,
      });
      if (ok) {
        await prisma.viewerProfile.update({
          where: { id: viewer.id },
          data: isActive
            ? { activeMinutes: { increment: settings.payoutIntervalMin } }
            : { watchMinutes: { increment: settings.payoutIntervalMin } },
        });
        if (isActive) actives += 1;
        else lurkers += 1;
      }
    }
    console.log(
      `[twitch] canal ${channel.slug}: payout #${index} — ${actives} ativos, ${lurkers} lurkers`
    );
  }
}
