import { prisma, ViewerProfile } from "@streamloyal/db";
import {
  enterGiveaway,
  placeBet,
  playChanceGame,
  playDuel,
  queueMedia,
  votePoll,
  voteSkipMedia,
} from "@streamloyal/core";
import { ChannelContext, ChatActions, IncomingChatMessage } from "./types";

const cooldowns = new Map<string, number>();
function takeCooldown(
  channelId: string,
  viewerId: string,
  game: string,
  cooldownSec: number
) {
  const key = `${channelId}:${viewerId}:${game}`;
  const now = Date.now();
  if ((cooldowns.get(key) ?? 0) > now) return false;
  cooldowns.set(key, now + Math.max(1, cooldownSec) * 1000);
  return true;
}

function wager(raw: string, balance: number, maxWager: number) {
  if (raw.toLowerCase() === "all") return Math.min(balance, maxWager);
  return Math.min(Math.max(0, parseInt(raw, 10) || 0), maxWager);
}

async function byName(channelId: string, raw: string) {
  const name = raw.replace(/^@/, "").trim();
  return name
    ? prisma.viewerProfile.findFirst({
        where: { channelId, displayName: { equals: name, mode: "insensitive" } },
      })
    : null;
}

const EIGHT_BALL = [
  "sim",
  "não",
  "com certeza",
  "melhor não contar com isso",
  "as chances são boas",
  "pergunte novamente mais tarde",
  "provavelmente",
  "muito improvável",
];

function youtubeVideoId(raw: string) {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0];
    if (url.hostname.endsWith("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

export async function handleEngagementCommand(
  ctx: ChannelContext,
  msg: IncomingChatMessage,
  actions: ChatActions,
  viewer: ViewerProfile,
  name: string,
  args: string,
  currency: string
): Promise<boolean> {
  const reply = (text: string) => actions.send(text.slice(0, 480));
  const parts = args.split(/\s+/).filter(Boolean);
  const settings = await prisma.engagementSettings.findUnique({
    where: { channelId: ctx.channelId },
  });
  const gamesEnabled = settings?.gamesEnabled ?? true;
  const maxWager = settings?.maxWager ?? 10_000;
  const cooldownSec = settings?.gameCooldownSec ?? 10;

  if (name === "8ball") {
    if (!gamesEnabled) return true;
    if (!args) {
      await reply(`@${msg.displayName}, use: !8ball <pergunta>`);
    } else {
      const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
      await reply(`🎱 @${msg.displayName}: ${answer}.`);
    }
    return true;
  }

  if (["gamble", "apostar", "slots", "heist", "roubo"].includes(name)) {
    if (!gamesEnabled) return true;
    const game =
      name === "slots" ? "SLOTS" : name === "heist" || name === "roubo" ? "HEIST" : "GAMBLE";
    if (!takeCooldown(ctx.channelId, viewer.id, game, cooldownSec)) return true;
    const amount = wager(parts[0] ?? "", viewer.points, maxWager);
    if (amount <= 0) {
      await reply(`@${msg.displayName}, use: !${name} <quantidade|all>`);
      return true;
    }
    const config =
      game === "SLOTS"
        ? { chance: 0.25, multiplier: 3 }
        : game === "HEIST"
          ? { chance: 0.2, multiplier: 4 }
          : { chance: 0.48, multiplier: 2 };
    const result = await playChanceGame({
      channelId: ctx.channelId,
      viewerId: viewer.id,
      amount,
      winChance: config.chance,
      winMultiplier: config.multiplier,
      reason: game,
      idempotencyKey: `game:${ctx.platform}:${msg.messageId}`,
    });
    if (!result.ok) {
      if (result.error === "INSUFFICIENT_POINTS") {
        await reply(`@${msg.displayName}, saldo insuficiente.`);
      }
      return true;
    }
    const icon = game === "SLOTS" ? "🎰" : game === "HEIST" ? "💰" : "🎲";
    await reply(
      result.won
        ? `${icon} @${msg.displayName} venceu e ganhou ${result.grossPrize} ${currency}!`
        : `${icon} @${msg.displayName} perdeu ${amount} ${currency}.`
    );
    return true;
  }

  if (name === "duel" || name === "duelo") {
    if (!gamesEnabled) return true;
    if (!takeCooldown(ctx.channelId, viewer.id, "DUEL", cooldownSec)) return true;
    const opponent = await byName(ctx.channelId, parts[0] ?? "");
    const amount = wager(parts[1] ?? "", viewer.points, maxWager);
    if (!opponent || opponent.id === viewer.id || amount <= 0) {
      await reply(`@${msg.displayName}, use: !duel <usuário> <quantidade>`);
      return true;
    }
    const result = await playDuel({
      channelId: ctx.channelId,
      challengerId: viewer.id,
      opponentId: opponent.id,
      amount,
      idempotencyKey: `duel:${ctx.platform}:${msg.messageId}`,
    });
    if (!result.ok) {
      if (result.error === "INSUFFICIENT_POINTS") {
        await reply(`Os dois participantes precisam ter ${amount} ${currency}.`);
      }
      return true;
    }
    const winner =
      result.winnerId === viewer.id ? msg.displayName : opponent.displayName;
    await reply(`⚔️ ${winner} venceu o duelo e levou ${amount} ${currency}!`);
    return true;
  }

  if (name === "pyramid" || name === "piramide") {
    if (!gamesEnabled) return true;
    const emote = (parts[0] ?? "").slice(0, 30);
    const levels = Math.min(5, Math.max(1, parseInt(parts[1] ?? "3", 10) || 3));
    if (!emote) {
      await reply(`Use: !pyramid <emote> [1-5]`);
      return true;
    }
    const lines: string[] = [];
    for (let index = 1; index <= levels; index += 1) {
      lines.push(Array(index).fill(emote).join(" "));
    }
    for (let index = levels - 1; index >= 1; index -= 1) {
      lines.push(Array(index).fill(emote).join(" "));
    }
    await reply(lines.join(" | "));
    return true;
  }

  if (name === "combo") {
    if (!gamesEnabled) return true;
    const emote = (parts[0] ?? "").slice(0, 30);
    const count = Math.min(20, Math.max(1, parseInt(parts[1] ?? "5", 10) || 5));
    if (emote) await reply(Array(count).fill(emote).join(" "));
    return true;
  }

  if (["ticket", "sorteio", "giveaway"].includes(name)) {
    if (settings && !settings.giveawaysEnabled) return true;
    const giveaway = await prisma.giveaway.findFirst({
      where: { channelId: ctx.channelId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    if (!giveaway) {
      await reply("Não há sorteio aberto.");
      return true;
    }
    const requested =
      name === "ticket" ? Math.max(1, parseInt(parts[0] ?? "1", 10) || 1) : 1;
    const result = await enterGiveaway({
      giveawayId: giveaway.id,
      viewerId: viewer.id,
      tickets: requested,
      idempotencyKey: `giveaway:${giveaway.id}:${msg.messageId}`,
    });
    if (!result.ok) {
      const text =
        result.error === "INSUFFICIENT_POINTS"
          ? "saldo insuficiente"
          : result.error === "MAX_TICKETS"
            ? "você já atingiu o limite de tickets"
            : "o sorteio está fechado";
      await reply(`@${msg.displayName}, ${text}.`);
      return true;
    }
    await reply(
      `🎟️ @${msg.displayName} entrou em "${giveaway.title}" com ${result.tickets} ticket(s)!`
    );
    return true;
  }

  if (name === "vote" || name === "votar") {
    if (settings && !settings.pollsEnabled) return true;
    const poll = await prisma.poll.findFirst({
      where: { channelId: ctx.channelId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    const optionNumber = parseInt(parts[0] ?? "", 10);
    if (!poll || !Number.isFinite(optionNumber)) {
      await reply(poll ? "Use: !vote <número>" : "Não há enquete aberta.");
      return true;
    }
    try {
      const option = await votePoll({
        pollId: poll.id,
        optionNumber,
        viewerId: viewer.id,
      });
      await reply(`🗳️ @${msg.displayName} votou em "${option.label}".`);
    } catch {
      await reply(`@${msg.displayName}, opção inválida ou enquete encerrada.`);
    }
    return true;
  }

  if (name === "bet" || name === "palpite") {
    if (settings && !settings.bettingEnabled) return true;
    const round = await prisma.bettingRound.findFirst({
      where: { channelId: ctx.channelId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    const optionNumber = parseInt(parts[0] ?? "", 10);
    const amount = wager(parts[1] ?? "", viewer.points, maxWager);
    if (!round || !Number.isFinite(optionNumber) || amount <= 0) {
      await reply(round ? "Use: !bet <opção> <quantidade|all>" : "Não há aposta aberta.");
      return true;
    }
    const result = await placeBet({
      roundId: round.id,
      optionNumber,
      viewerId: viewer.id,
      amount,
      idempotencyKey: `bet:${round.id}:${msg.messageId}`,
    });
    if (!result.ok) {
      const text =
        result.error === "ALREADY_BET"
          ? "você já apostou nesta rodada"
          : result.error === "INSUFFICIENT_POINTS"
            ? "saldo insuficiente"
            : "aposta encerrada";
      await reply(`@${msg.displayName}, ${text}.`);
      return true;
    }
    await reply(
      `🎯 @${msg.displayName} apostou ${amount} ${currency} em "${result.option.label}".`
    );
    return true;
  }

  if (name === "media" || name === "sr") {
    const url = parts[0] ?? "";
    const videoId = youtubeVideoId(url);
    if (!videoId) {
      await reply(`@${msg.displayName}, use: !media <URL do YouTube>`);
      return true;
    }
    const result = await queueMedia({
      channelId: ctx.channelId,
      viewerId: viewer.id,
      url,
      videoId,
      idempotencyKey: `media:${ctx.platform}:${msg.messageId}`,
    });
    if (!result.ok) {
      const labels: Record<string, string> = {
        DISABLED: "Media Share está desativado",
        BLACKLISTED: "esse vídeo/canal está bloqueado",
        QUEUE_FULL: "a fila de mídia está cheia",
        INSUFFICIENT_POINTS: `saldo insuficiente`,
        INVALID_URL: "URL inválida",
      };
      await reply(`@${msg.displayName}, ${labels[result.error] ?? "pedido recusado"}.`);
      return true;
    }
    await reply(`📺 @${msg.displayName}, vídeo adicionado à fila de mídia.`);
    return true;
  }

  if (name === "skip" || name === "pular") {
    try {
      const result = await voteSkipMedia({
        channelId: ctx.channelId,
        viewerId: viewer.id,
      });
      await reply(
        result.skipped
          ? "⏭️ Mídia pulada por votação."
          : `⏭️ Voto registrado (${result.skipVotes}/${result.required}).`
      );
    } catch {
      await reply("Não há mídia tocando ou seu voto já foi registrado.");
    }
    return true;
  }

  return false;
}
