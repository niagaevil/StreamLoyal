import { prisma, ModerationSettings } from "@streamloyal/db";
import { ChatActions, IncomingChatMessage } from "./types";

const PERMIT_MS = 60_000;
const LINK_REGEX = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|tv|gg|br|io|me|ly)\b/i;

// Permissões temporárias de link: channelId -> nome (lowercase) -> expira em
const permits = new Map<string, Map<string, number>>();

/** Concede permissão de link por 60s (usado pelo !permit). */
export function grantPermit(channelId: string, displayName: string) {
  let byUser = permits.get(channelId);
  if (!byUser) {
    byUser = new Map();
    permits.set(channelId, byUser);
  }
  byUser.set(displayName.toLowerCase(), Date.now() + PERMIT_MS);
}

function hasPermit(channelId: string, displayName: string) {
  const exp = permits.get(channelId)?.get(displayName.toLowerCase());
  return Boolean(exp && exp > Date.now());
}

function violatedFilter(
  s: ModerationSettings,
  text: string,
  channelId: string,
  displayName: string
): string | null {
  if (s.regexEnabled && s.bannedPatterns.length > 0) {
    for (const pattern of s.bannedPatterns) {
      // Limita padrões e bloqueia quantificadores aninhados, principal fonte
      // de ReDoS em regex configurável.
      if (
        !pattern ||
        pattern.length > 100 ||
        /\([^)]*[+*][^)]*\)[+*{]/.test(pattern)
      ) {
        continue;
      }
      try {
        if (new RegExp(pattern, "iu").test(text)) return "regex";
      } catch {
        // padrão inválido é ignorado
      }
    }
  }

  if (s.wordsEnabled && s.bannedWords.length > 0) {
    const lower = text.toLowerCase();
    if (s.bannedWords.some((w) => w && lower.includes(w.toLowerCase()))) {
      return "words";
    }
  }

  if (s.linksEnabled && LINK_REGEX.test(text)) {
    const whitelisted = s.linkWhitelist.some((domain) =>
      domain ? text.toLowerCase().includes(domain.toLowerCase()) : false
    );
    if (!whitelisted && !hasPermit(channelId, displayName)) return "links";
  }

  if (s.capsEnabled && text.length >= s.capsMinLen) {
    const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, "");
    if (letters.length >= s.capsMinLen) {
      const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
      if ((upper / letters.length) * 100 > s.capsMaxPercent) return "caps";
    }
  }

  if (s.symbolsEnabled && text.length >= 6) {
    const symbols = text.replace(/[a-zA-Z0-9À-ÿ\s]/g, "").length;
    if ((symbols / text.length) * 100 > s.symbolsMaxPercent) return "symbols";
  }

  if (s.repetitionEnabled) {
    const repeated = new RegExp(`(.)\\1{${Math.max(1, s.maxRepeatedChars)},}`, "iu");
    if (repeated.test(text)) return "repetition";
  }

  if (s.linesEnabled && text.split(/\r?\n/).length > s.maxLines) {
    return "lines";
  }

  if (s.zalgoEnabled) {
    const combining = text.match(/[\u0300-\u036f]/g)?.length ?? 0;
    if (combining > s.maxCombiningMarks) return "zalgo";
  }

  if (s.emotesEnabled) {
    const colonEmotes = text.match(/:[a-z0-9_]+:/gi)?.length ?? 0;
    const unicodeEmotes = text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
    if (colonEmotes + unicodeEmotes > s.maxEmotes) return "emotes";
  }

  return null;
}

/**
 * Aplica os filtros de moderação. Retorna true se a mensagem foi punida
 * (o processamento dela deve parar).
 */
export async function handleModeration(
  channelId: string,
  msg: IncomingChatMessage,
  actions: ChatActions
): Promise<boolean> {
  // Moderadores nunca são punidos
  if (msg.isModerator) return false;

  const settings = await prisma.moderationSettings.findUnique({
    where: { channelId },
  });
  if (!settings?.enabled) return false;
  if (settings.exemptMembers && msg.isMember) return false;

  const filter = violatedFilter(settings, msg.text, channelId, msg.displayName);
  if (!filter) return false;

  const action = settings.punishment === "TIMEOUT" ? "timeout" : "delete";
  try {
    if (settings.punishment === "TIMEOUT") {
      await actions.timeoutUser(
        msg.userId,
        settings.timeoutSec,
        `Filtro de moderação: ${filter}`
      );
    } else {
      await actions.deleteMessage(msg.messageId);
    }
    if (settings.sendWarning) {
      await actions.send(
        `@${msg.displayName}, sua mensagem foi removida (${labelFor(filter)}).`
      );
    }
  } catch (err) {
    console.error(`[mod] falha ao punir no canal ${channelId}`, err);
  }

  await prisma.moderationLog.create({
    data: {
      channelId,
      platformUserId: msg.userId,
      displayName: msg.displayName,
      filter,
      action,
      message: msg.text.slice(0, 500),
    },
  });
  return true;
}

function labelFor(filter: string) {
  switch (filter) {
    case "caps":
      return "excesso de maiúsculas";
    case "links":
      return "link não permitido";
    case "words":
      return "palavra bloqueada";
    case "symbols":
      return "excesso de símbolos";
    case "repetition":
      return "repetição excessiva";
    case "lines":
      return "linhas demais";
    case "zalgo":
      return "texto Zalgo";
    case "emotes":
      return "emotes demais";
    case "regex":
      return "padrão bloqueado";
    default:
      return filter;
  }
}
