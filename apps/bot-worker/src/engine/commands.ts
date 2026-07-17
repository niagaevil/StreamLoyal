import { prisma } from "@streamloyal/db";
import {
  awardPoints,
  transferPoints,
  ensureViewer,
  redeemItem,
} from "@streamloyal/core";
import { ChannelContext, ChatActions, IncomingChatMessage } from "./types";
import { grantPermit } from "./moderation";
import { handleEngagementCommand } from "./engagement";
import { emitAlert } from "./alerts";

// Cooldowns em memória: chave -> timestamp de liberação
const cooldowns = new Map<string, number>();

function onCooldown(key: string): boolean {
  const until = cooldowns.get(key) ?? 0;
  return until > Date.now();
}

function setCooldown(key: string, seconds: number) {
  if (seconds > 0) cooldowns.set(key, Date.now() + seconds * 1000);
}

async function findViewerByName(channelId: string, name: string) {
  const clean = name.replace(/^@/, "").trim();
  if (!clean) return null;
  return prisma.viewerProfile.findFirst({
    where: {
      channelId,
      displayName: { equals: clean, mode: "insensitive" },
    },
  });
}

/**
 * Processa uma mensagem que começa com "!". Retorna true se algum comando
 * (padrão ou personalizado) respondeu.
 */
export async function handleCommand(
  ctx: ChannelContext,
  msg: IncomingChatMessage,
  actions: ChatActions
): Promise<boolean> {
  const [rawName, ...rest] = msg.text.trim().slice(1).split(/\s+/);
  const name = (rawName ?? "").toLowerCase();
  if (!name) return false;
  const args = rest.join(" ").trim();

  const channel = await prisma.channel.findUnique({
    where: { id: ctx.channelId },
    include: { loyaltySettings: true },
  });
  if (!channel) return false;
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";

  const viewer = await ensureViewer({
    channelId: ctx.channelId,
    platformUserId: msg.userId,
    displayName: msg.displayName,
    isModerator: msg.isModerator,
    isMember: msg.isMember,
  });
  await prisma.commandLog.create({
    data: {
      channelId: ctx.channelId,
      platformUserId: msg.userId,
      displayName: msg.displayName,
      command: name.slice(0, 50),
      args: args.slice(0, 300) || null,
    },
  });

  const reply = (text: string) => actions.send(text.slice(0, 480));

  if (
    await handleEngagementCommand(
      ctx,
      msg,
      actions,
      viewer,
      name,
      args,
      currency
    )
  ) {
    return true;
  }

  switch (name) {
    // ----- pontos -----
    case "pontos":
    case "points": {
      await reply(
        `@${msg.displayName}, você tem ${viewer.points.toLocaleString("pt-BR")} ${currency} (${viewer.activeMinutes + viewer.watchMinutes} min acompanhando).`
      );
      return true;
    }
    case "top": {
      const top = await prisma.viewerProfile.findMany({
        where: { channelId: ctx.channelId },
        orderBy: { points: "desc" },
        take: 5,
      });
      if (top.length === 0) return true;
      await reply(
        "Top " +
          currency +
          ": " +
          top
            .map((v, i) => `${i + 1}. ${v.displayName} (${v.points.toLocaleString("pt-BR")})`)
            .join(" | ")
      );
      return true;
    }
    case "tophours":
    case "tophoras": {
      const many = await prisma.viewerProfile.findMany({
        where: { channelId: ctx.channelId },
        orderBy: { activeMinutes: "desc" },
        take: 100,
      });
      const top = many
        .map((v) => ({ v, min: v.activeMinutes + v.watchMinutes }))
        .sort((a, b) => b.min - a.min)
        .slice(0, 5);
      if (top.length === 0) return true;
      await reply(
        "Top horas: " +
          top
            .map(
              ({ v, min }, i) =>
                `${i + 1}. ${v.displayName} (${(min / 60).toFixed(1)}h)`
            )
            .join(" | ")
      );
      return true;
    }
    case "give":
    case "dar": {
      const [targetName, amountStr] = args.split(/\s+/);
      const amount = parseInt(amountStr ?? "", 10);
      if (!targetName || !Number.isFinite(amount) || amount <= 0) {
        await reply(`@${msg.displayName}, use: !give <usuário> <quantidade>`);
        return true;
      }
      const target = await findViewerByName(ctx.channelId, targetName);
      if (!target || target.id === viewer.id) {
        await reply(`@${msg.displayName}, não encontrei esse usuário.`);
        return true;
      }
      const transferred = await transferPoints({
        channelId: ctx.channelId,
        fromViewerId: viewer.id,
        toViewerId: target.id,
        amount,
        fromNote: `para ${target.displayName}`,
        toNote: `de ${msg.displayName}`,
      });
      if (!transferred) {
        await reply(`@${msg.displayName}, você não tem ${currency} suficientes.`);
        return true;
      }
      await reply(
        `@${msg.displayName} deu ${amount} ${currency} para ${target.displayName}!`
      );
      return true;
    }
    case "addpoints":
    case "removepoints": {
      if (!msg.isModerator) return true;
      const [targetName, amountStr] = args.split(/\s+/);
      const amount = parseInt(amountStr ?? "", 10);
      if (!targetName || !Number.isFinite(amount) || amount <= 0) {
        await reply(`Use: !${name} <usuário> <quantidade>`);
        return true;
      }
      const target = await findViewerByName(ctx.channelId, targetName);
      if (!target) {
        await reply(`Usuário não encontrado.`);
        return true;
      }
      const delta = name === "addpoints" ? amount : -amount;
      const ok = await awardPoints({
        channelId: ctx.channelId,
        viewerId: target.id,
        delta,
        reason: "MANUAL",
        note: `via chat por ${msg.displayName}`,
      });
      await reply(
        ok
          ? `${target.displayName} agora tem ${target.points + delta} ${currency}.`
          : `Não foi possível ajustar (saldo ficaria negativo).`
      );
      return true;
    }
    // ----- loja -----
    case "redeem":
    case "resgatar": {
      if (!args) {
        await reply(`@${msg.displayName}, use: !redeem <nome do item>`);
        return true;
      }
      const item = await prisma.storeItem.findFirst({
        where: {
          channelId: ctx.channelId,
          isActive: true,
          name: { equals: args, mode: "insensitive" },
        },
      });
      if (!item) {
        await reply(`@${msg.displayName}, item não encontrado na loja.`);
        return true;
      }
      const result = await redeemItem({
        channelId: ctx.channelId,
        itemId: item.id,
        viewerId: viewer.id,
      });
      if (result.ok) {
        await emitAlert({
          channelId: ctx.channelId,
          type: "redemption",
          userName: msg.displayName,
          message: `${msg.displayName} resgatou ${item.name}`,
          amount: item.cost,
          imageUrl: item.imageUrl,
          soundUrl: item.soundUrl,
          sourceKey: `redemption:${result.redemptionId}`,
        });
        await reply(
          `@${msg.displayName} resgatou "${item.name}" por ${item.cost} ${currency}!` +
            (result.code ? " O código será entregue pelo site." : "")
        );
      } else {
        const reasons: Record<string, string> = {
          INSUFFICIENT_POINTS: `você não tem ${currency} suficientes`,
          OUT_OF_STOCK: "item esgotado",
          COOLDOWN_GLOBAL: "o item está em cooldown",
          COOLDOWN_USER: "aguarde para resgatar de novo",
          ITEM_UNAVAILABLE: "item indisponível",
          VIEWER_BLOCKED: "resgate indisponível",
        };
        await reply(`@${msg.displayName}, ${reasons[result.error] ?? "não foi possível resgatar"}.`);
      }
      return true;
    }
    // ----- moderação -----
    case "so":
    case "shoutout": {
      if (!msg.isModerator) return true;
      const target = args.split(/\s+/)[0]?.replace(/^@/, "");
      if (!target) {
        await reply("Use: !so <canal>");
        return true;
      }
      const url =
        ctx.platform === "TWITCH"
          ? `https://twitch.tv/${encodeURIComponent(target)}`
          : `https://youtube.com/@${encodeURIComponent(target)}`;
      await reply(`💜 Conheçam ${target}! Sigam em ${url}`);
      return true;
    }
    case "count":
    case "contador": {
      if (!msg.isModerator) return true;
      const counterName =
        args.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30) || "geral";
      const counter = await prisma.chatCounter.upsert({
        where: {
          channelId_name: { channelId: ctx.channelId, name: counterName },
        },
        create: { channelId: ctx.channelId, name: counterName, value: 1 },
        update: { value: { increment: 1 } },
      });
      await reply(`🔢 ${counterName}: ${counter.value}`);
      return true;
    }
    case "setcount": {
      if (!msg.isModerator) return true;
      const [rawCounter = "geral", rawValue = "0"] = args.split(/\s+/);
      const counterName =
        rawCounter.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30) ||
        "geral";
      const value = Math.max(-1_000_000, Math.min(1_000_000, parseInt(rawValue, 10) || 0));
      await prisma.chatCounter.upsert({
        where: {
          channelId_name: { channelId: ctx.channelId, name: counterName },
        },
        create: { channelId: ctx.channelId, name: counterName, value },
        update: { value },
      });
      await reply(`🔢 ${counterName} definido como ${value}.`);
      return true;
    }
    case "permit": {
      if (!msg.isModerator) return true;
      const target = args.split(/\s+/)[0];
      if (!target) {
        await reply("Use: !permit <usuário>");
        return true;
      }
      grantPermit(ctx.channelId, target.replace(/^@/, ""));
      await reply(`${target.replace(/^@/, "")} pode postar 1 link nos próximos 60s.`);
      return true;
    }
    // ----- quotes -----
    case "addquote": {
      if (!msg.isModerator) return true;
      if (!args) {
        await reply("Use: !addquote <frase>");
        return true;
      }
      const last = await prisma.quote.findFirst({
        where: { channelId: ctx.channelId },
        orderBy: { number: "desc" },
      });
      const quote = await prisma.quote.create({
        data: {
          channelId: ctx.channelId,
          number: (last?.number ?? 0) + 1,
          text: args,
          addedBy: msg.displayName,
        },
      });
      await reply(`Quote #${quote.number} adicionada!`);
      return true;
    }
    case "quote": {
      const num = parseInt(args, 10);
      let quote;
      if (Number.isFinite(num)) {
        quote = await prisma.quote.findUnique({
          where: { channelId_number: { channelId: ctx.channelId, number: num } },
        });
      } else {
        const count = await prisma.quote.count({
          where: { channelId: ctx.channelId },
        });
        if (count > 0) {
          const skip = Math.floor(Math.random() * count);
          quote = await prisma.quote.findFirst({
            where: { channelId: ctx.channelId },
            orderBy: { number: "asc" },
            skip,
          });
        }
      }
      await reply(
        quote
          ? `#${quote.number}: "${quote.text}"`
          : "Nenhuma quote encontrada."
      );
      return true;
    }
    case "removequote":
    case "delquote": {
      if (!msg.isModerator) return true;
      const num = parseInt(args, 10);
      if (!Number.isFinite(num)) {
        await reply("Use: !removequote <número>");
        return true;
      }
      const deleted = await prisma.quote
        .delete({
          where: { channelId_number: { channelId: ctx.channelId, number: num } },
        })
        .catch(() => null);
      await reply(deleted ? `Quote #${num} removida.` : `Quote #${num} não existe.`);
      return true;
    }
    // ----- fila -----
    case "join":
    case "entrar": {
      if (!channel.queueOpen) {
        await reply(`@${msg.displayName}, a fila está fechada.`);
        return true;
      }
      await prisma.queueEntry
        .create({ data: { channelId: ctx.channelId, viewerId: viewer.id } })
        .catch(() => null); // já está na fila
      const position = await prisma.queueEntry.count({
        where: {
          channelId: ctx.channelId,
          joinedAt: {
            lte:
              (
                await prisma.queueEntry.findUnique({
                  where: {
                    channelId_viewerId: {
                      channelId: ctx.channelId,
                      viewerId: viewer.id,
                    },
                  },
                })
              )?.joinedAt ?? new Date(),
          },
        },
      });
      await reply(`@${msg.displayName} entrou na fila (posição ${position}).`);
      return true;
    }
    case "leave":
    case "sair": {
      const deleted = await prisma.queueEntry
        .delete({
          where: {
            channelId_viewerId: {
              channelId: ctx.channelId,
              viewerId: viewer.id,
            },
          },
        })
        .catch(() => null);
      if (deleted) await reply(`@${msg.displayName} saiu da fila.`);
      return true;
    }
    case "queue":
    case "fila": {
      const total = await prisma.queueEntry.count({
        where: { channelId: ctx.channelId },
      });
      await reply(
        channel.queueOpen
          ? `Fila aberta com ${total} pessoa(s). Use !join para entrar.`
          : "A fila está fechada."
      );
      return true;
    }
    case "openqueue": {
      if (!msg.isModerator) return true;
      await prisma.channel.update({
        where: { id: ctx.channelId },
        data: { queueOpen: true },
      });
      await reply("Fila aberta! Use !join para entrar.");
      return true;
    }
    case "closequeue": {
      if (!msg.isModerator) return true;
      await prisma.channel.update({
        where: { id: ctx.channelId },
        data: { queueOpen: false },
      });
      await reply("Fila fechada.");
      return true;
    }
    case "comandos":
    case "commands": {
      const custom = await prisma.chatCommand.findMany({
        where: { channelId: ctx.channelId, enabled: true },
        take: 15,
      });
      const names = custom.map((c) => `!${c.name}`).join(" ");
      await reply(
        `Comandos: !pontos !top !give !redeem !quote !join !8ball !gamble !slots !duel !heist !ticket !vote !bet !media${names ? " " + names : ""}`
      );
      return true;
    }
  }

  // ----- comandos personalizados -----
  const command = await prisma.chatCommand.findFirst({
    where: {
      channelId: ctx.channelId,
      enabled: true,
      OR: [{ name }, { aliases: { has: name } }],
    },
  });
  if (!command) return false;
  if (command.permission === "MODERATOR" && !msg.isModerator) return true;

  const globalKey = `cmd:${command.id}`;
  const userKey = `cmd:${command.id}:${msg.userId}`;
  if (onCooldown(globalKey) || onCooldown(userKey)) return true;

  if (command.costPoints > 0) {
    const paid = await awardPoints({
      channelId: ctx.channelId,
      viewerId: viewer.id,
      delta: -command.costPoints,
      reason: "COMMAND_COST",
      refId: command.id,
      note: `!${command.name}`,
    });
    if (!paid) {
      await reply(
        `@${msg.displayName}, !${command.name} custa ${command.costPoints} ${currency} e você não tem saldo.`
      );
      return true;
    }
  }

  setCooldown(globalKey, command.globalCooldownSec);
  setCooldown(userKey, command.userCooldownSec);

  const response = command.response
    .replaceAll("{user}", msg.displayName)
    .replaceAll("{channel}", channel.title)
    .replaceAll("{args}", args);
  await reply(response);
  return true;
}
