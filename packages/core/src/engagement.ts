import { LedgerReason, Prisma, prisma } from "@streamloyal/db";

type Tx = Prisma.TransactionClient;

async function applyDelta(
  tx: Tx,
  input: {
    channelId: string;
    viewerId: string;
    delta: number;
    reason: LedgerReason;
    refId?: string;
    note?: string;
    idempotencyKey?: string;
  }
) {
  if (input.delta < 0) {
    const updated = await tx.viewerProfile.updateMany({
      where: { id: input.viewerId, points: { gte: -input.delta } },
      data: { points: { increment: input.delta } },
    });
    if (updated.count !== 1) throw new Error("INSUFFICIENT_POINTS");
  } else {
    await tx.viewerProfile.update({
      where: { id: input.viewerId },
      data: { points: { increment: input.delta } },
    });
  }

  await tx.pointLedger.create({ data: input });
}

export function resolveChanceGame(
  amount: number,
  winMultiplier: number,
  winChance: number,
  random: number
) {
  const normalizedAmount = Math.max(1, Math.floor(amount));
  const won = random < Math.min(1, Math.max(0, winChance));
  const grossPrize = won ? Math.floor(normalizedAmount * winMultiplier) : 0;
  return {
    amount: normalizedAmount,
    won,
    grossPrize,
    delta: grossPrize - normalizedAmount,
  };
}

export function selectWeightedIndex(weights: number[], random: number) {
  const normalized = weights.map((weight) => Math.max(0, weight));
  const total = normalized.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return -1;
  let cursor = Math.min(0.999999999, Math.max(0, random)) * total;
  for (let index = 0; index < normalized.length; index += 1) {
    cursor -= normalized[index];
    if (cursor < 0) return index;
  }
  return normalized.length - 1;
}

export async function playChanceGame(input: {
  channelId: string;
  viewerId: string;
  amount: number;
  winMultiplier: number;
  winChance: number;
  reason: "GAMBLE" | "SLOTS" | "HEIST";
  idempotencyKey: string;
  random?: number;
}) {
  const { amount, won, grossPrize, delta } = resolveChanceGame(
    input.amount,
    input.winMultiplier,
    input.winChance,
    input.random ?? Math.random()
  );

  try {
    await prisma.$transaction(async (tx) => {
      const eligible = await tx.viewerProfile.count({
        where: {
          id: input.viewerId,
          channelId: input.channelId,
          points: { gte: amount },
        },
      });
      if (eligible !== 1) throw new Error("INSUFFICIENT_POINTS");
      await applyDelta(tx, {
        channelId: input.channelId,
        viewerId: input.viewerId,
        delta,
        reason: input.reason,
        note: won ? `prêmio bruto ${grossPrize}` : "derrota",
        idempotencyKey: input.idempotencyKey,
      });
    });
    return { ok: true as const, won, delta, grossPrize };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_POINTS") {
      return { ok: false as const, error: "INSUFFICIENT_POINTS" as const };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false as const, error: "DUPLICATE" as const };
    }
    throw error;
  }
}

export async function playDuel(input: {
  channelId: string;
  challengerId: string;
  opponentId: string;
  amount: number;
  idempotencyKey: string;
  random?: number;
}) {
  const amount = Math.max(1, Math.floor(input.amount));
  const challengerWon = (input.random ?? Math.random()) < 0.5;
  const winnerId = challengerWon ? input.challengerId : input.opponentId;
  const loserId = challengerWon ? input.opponentId : input.challengerId;

  try {
    await prisma.$transaction(async (tx) => {
      const loser = await tx.viewerProfile.updateMany({
        where: { id: loserId, channelId: input.channelId, points: { gte: amount } },
        data: { points: { decrement: amount } },
      });
      const winner = await tx.viewerProfile.updateMany({
        where: { id: winnerId, channelId: input.channelId, points: { gte: amount } },
        data: { points: { increment: amount } },
      });
      if (loser.count !== 1 || winner.count !== 1) {
        throw new Error("INSUFFICIENT_POINTS");
      }
      await tx.pointLedger.createMany({
        data: [
          {
            channelId: input.channelId,
            viewerId: loserId,
            delta: -amount,
            reason: "DUEL",
            idempotencyKey: `${input.idempotencyKey}:lose`,
          },
          {
            channelId: input.channelId,
            viewerId: winnerId,
            delta: amount,
            reason: "DUEL",
            idempotencyKey: `${input.idempotencyKey}:win`,
          },
        ],
      });
    });
    return { ok: true as const, winnerId, loserId, amount };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_POINTS") {
      return { ok: false as const, error: "INSUFFICIENT_POINTS" as const };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false as const, error: "DUPLICATE" as const };
    }
    throw error;
  }
}

export async function enterGiveaway(input: {
  giveawayId: string;
  viewerId: string;
  tickets: number;
  idempotencyKey: string;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const giveaway = await tx.giveaway.findUniqueOrThrow({
        where: { id: input.giveawayId },
      });
      if (giveaway.status !== "OPEN") throw new Error("CLOSED");

      const current = await tx.giveawayEntry.findUnique({
        where: {
          giveawayId_viewerId: {
            giveawayId: giveaway.id,
            viewerId: input.viewerId,
          },
        },
      });
      const available = giveaway.maxTickets - (current?.tickets ?? 0);
      const tickets = Math.min(Math.max(1, Math.floor(input.tickets)), available);
      if (tickets <= 0) throw new Error("MAX_TICKETS");

      const viewer = await tx.viewerProfile.findUniqueOrThrow({
        where: { id: input.viewerId },
      });
      const cost = giveaway.ticketCost * tickets;
      await applyDelta(tx, {
        channelId: giveaway.channelId,
        viewerId: viewer.id,
        delta: -cost,
        reason: "GIVEAWAY",
        refId: giveaway.id,
        note: `${tickets} ticket(s)`,
        idempotencyKey: input.idempotencyKey,
      });
      const weight = viewer.isMember ? giveaway.memberWeight : 1;
      await tx.giveawayEntry.upsert({
        where: {
          giveawayId_viewerId: {
            giveawayId: giveaway.id,
            viewerId: viewer.id,
          },
        },
        create: { giveawayId: giveaway.id, viewerId: viewer.id, tickets, weight },
        update: { tickets: { increment: tickets }, weight },
      });
      return { ok: true as const, tickets, cost };
    });
  } catch (error) {
    const known = ["CLOSED", "MAX_TICKETS", "INSUFFICIENT_POINTS"];
    if (error instanceof Error && known.includes(error.message)) {
      return { ok: false as const, error: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false as const, error: "DUPLICATE" as const };
    }
    throw error;
  }
}

export async function drawGiveaway(giveawayId: string, random = Math.random()) {
  return prisma.$transaction(async (tx) => {
    const giveaway = await tx.giveaway.findUniqueOrThrow({
      where: { id: giveawayId },
      include: { entries: { include: { viewer: true } } },
    });
    if (giveaway.status !== "OPEN") throw new Error("CLOSED");
    const weighted = giveaway.entries.map((entry) => ({
      entry,
      weight: entry.tickets * Math.max(1, entry.weight),
    }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) throw new Error("NO_ENTRIES");
    const selected = weighted[selectWeightedIndex(weighted.map((item) => item.weight), random)];
    const claimed = await tx.giveaway.updateMany({
      where: { id: giveawayId, status: "OPEN" },
      data: {
        status: "CLOSED",
        winnerId: selected.entry.viewerId,
        endedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new Error("CLOSED");
    return selected.entry.viewer;
  });
}

export async function votePoll(input: {
  pollId: string;
  optionNumber: number;
  viewerId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const poll = await tx.poll.findUniqueOrThrow({ where: { id: input.pollId } });
    if (poll.status !== "OPEN") throw new Error("CLOSED");
    const option = await tx.pollOption.findUniqueOrThrow({
      where: {
        pollId_number: { pollId: poll.id, number: input.optionNumber },
      },
    });
    await tx.pollVote.upsert({
      where: { pollId_viewerId: { pollId: poll.id, viewerId: input.viewerId } },
      create: { pollId: poll.id, optionId: option.id, viewerId: input.viewerId },
      update: { optionId: option.id },
    });
    return option;
  });
}

export async function placeBet(input: {
  roundId: string;
  optionNumber: number;
  viewerId: string;
  amount: number;
  idempotencyKey: string;
}) {
  const amount = Math.max(1, Math.floor(input.amount));
  try {
    return await prisma.$transaction(async (tx) => {
      const round = await tx.bettingRound.findUniqueOrThrow({
        where: { id: input.roundId },
      });
      if (round.status !== "OPEN") throw new Error("CLOSED");
      const option = await tx.bettingOption.findUniqueOrThrow({
        where: {
          roundId_number: { roundId: round.id, number: input.optionNumber },
        },
      });
      const exists = await tx.bet.findUnique({
        where: { roundId_viewerId: { roundId: round.id, viewerId: input.viewerId } },
      });
      if (exists) throw new Error("ALREADY_BET");
      await applyDelta(tx, {
        channelId: round.channelId,
        viewerId: input.viewerId,
        delta: -amount,
        reason: "BET",
        refId: round.id,
        idempotencyKey: input.idempotencyKey,
      });
      await tx.bet.create({
        data: {
          roundId: round.id,
          optionId: option.id,
          viewerId: input.viewerId,
          amount,
        },
      });
      return { ok: true as const, option, amount };
    });
  } catch (error) {
    const known = ["CLOSED", "ALREADY_BET", "INSUFFICIENT_POINTS"];
    if (error instanceof Error && known.includes(error.message)) {
      return { ok: false as const, error: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false as const, error: "DUPLICATE" as const };
    }
    throw error;
  }
}

export async function settleBettingRound(roundId: string, optionNumber: number) {
  return prisma.$transaction(async (tx) => {
    const round = await tx.bettingRound.findUniqueOrThrow({
      where: { id: roundId },
      include: { bets: true },
    });
    if (round.status !== "OPEN") throw new Error("CLOSED");
    const winner = await tx.bettingOption.findUniqueOrThrow({
      where: { roundId_number: { roundId, number: optionNumber } },
    });
    const claimed = await tx.bettingRound.updateMany({
      where: { id: round.id, status: "OPEN" },
      data: { status: "CLOSED", winnerOptionId: winner.id, endedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("CLOSED");
    const pot = round.bets.reduce((sum, bet) => sum + bet.amount, 0);
    const winningBets = round.bets.filter((bet) => bet.optionId === winner.id);
    const winningPool = winningBets.reduce((sum, bet) => sum + bet.amount, 0);

    if (winningPool > 0) {
      let paid = 0;
      for (let index = 0; index < winningBets.length; index += 1) {
        const bet = winningBets[index];
        const payout =
          index === winningBets.length - 1
            ? pot - paid
            : Math.floor((pot * bet.amount) / winningPool);
        paid += payout;
        await applyDelta(tx, {
          channelId: round.channelId,
          viewerId: bet.viewerId,
          delta: payout,
          reason: "BET_PAYOUT",
          refId: round.id,
          idempotencyKey: `bet-payout:${round.id}:${bet.viewerId}`,
        });
      }
    }
    return { pot, winners: winningBets.length, winner };
  });
}

export async function queueMedia(input: {
  channelId: string;
  viewerId: string;
  url: string;
  videoId: string;
  idempotencyKey: string;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const settings = await tx.mediaSettings.findUniqueOrThrow({
        where: { channelId: input.channelId },
      });
      if (!settings.enabled) throw new Error("DISABLED");
      if (!/^[A-Za-z0-9_-]{11}$/.test(input.videoId)) throw new Error("INVALID_URL");
      const lowerUrl = input.url.toLowerCase();
      if (settings.blacklist.some((entry) => lowerUrl.includes(entry.toLowerCase()))) {
        throw new Error("BLACKLISTED");
      }
      const queued = await tx.mediaQueueItem.count({
        where: {
          channelId: input.channelId,
          status: { in: ["PENDING", "PLAYING"] },
        },
      });
      if (queued >= settings.maxQueueSize) throw new Error("QUEUE_FULL");
      await applyDelta(tx, {
        channelId: input.channelId,
        viewerId: input.viewerId,
        delta: -settings.cost,
        reason: "MEDIA_SHARE",
        note: input.videoId,
        idempotencyKey: input.idempotencyKey,
      });
      const item = await tx.mediaQueueItem.create({
        data: {
          channelId: input.channelId,
          viewerId: input.viewerId,
          url: input.url,
          videoId: input.videoId,
          cost: settings.cost,
        },
      });
      return { ok: true as const, item };
    });
  } catch (error) {
    const known = [
      "DISABLED",
      "INVALID_URL",
      "BLACKLISTED",
      "QUEUE_FULL",
      "INSUFFICIENT_POINTS",
    ];
    if (error instanceof Error && known.includes(error.message)) {
      return { ok: false as const, error: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false as const, error: "DUPLICATE" as const };
    }
    throw error;
  }
}

export async function voteSkipMedia(input: {
  channelId: string;
  viewerId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.mediaSettings.findUniqueOrThrow({
      where: { channelId: input.channelId },
    });
    const item = await tx.mediaQueueItem.findFirst({
      where: { channelId: input.channelId, status: "PLAYING" },
      orderBy: { createdAt: "asc" },
    });
    if (!item) throw new Error("NOT_PLAYING");
    await tx.mediaSkipVote.create({
      data: { itemId: item.id, viewerId: input.viewerId },
    });
    const skipVotes = await tx.mediaSkipVote.count({ where: { itemId: item.id } });
    const skipped = skipVotes >= settings.votesToSkip;
    await tx.mediaQueueItem.update({
      where: { id: item.id },
      data: {
        skipVotes,
        status: skipped ? "SKIPPED" : undefined,
        playedAt: skipped ? new Date() : undefined,
      },
    });
    return { skipVotes, required: settings.votesToSkip, skipped };
  });
}
