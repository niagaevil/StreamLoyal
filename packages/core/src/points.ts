import { prisma, LedgerReason, Prisma } from "@streamloyal/db";

export interface AwardPointsInput {
  channelId: string;
  viewerId: string;
  delta: number;
  reason: LedgerReason;
  refId?: string;
  note?: string;
  /** Se repetido, o crédito é ignorado (proteção contra reprocessamento). */
  idempotencyKey?: string;
}

/**
 * Aplica uma variação de pontos com registro no ledger, de forma atômica.
 * Retorna false se a idempotencyKey já foi usada ou se o saldo ficaria negativo.
 */
export async function awardPoints(input: AwardPointsInput): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      // Decremento condicional: falha se o saldo ficaria negativo, mesmo com
      // débitos concorrentes (evita a corrida ler-saldo → decrementar)
      const updated = await tx.viewerProfile.updateMany({
        where: {
          id: input.viewerId,
          ...(input.delta < 0 ? { points: { gte: -input.delta } } : {}),
        },
        data: { points: { increment: input.delta } },
      });
      if (updated.count !== 1) throw new Error("INSUFFICIENT_POINTS");
      await tx.pointLedger.create({
        data: {
          channelId: input.channelId,
          viewerId: input.viewerId,
          delta: input.delta,
          reason: input.reason,
          refId: input.refId,
          note: input.note,
          idempotencyKey: input.idempotencyKey,
        },
      });
    });
    return true;
  } catch (err) {
    // Violação de unicidade da idempotencyKey => crédito duplicado ignorado
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return false;
    }
    if (err instanceof Error && err.message === "INSUFFICIENT_POINTS") {
      return false;
    }
    throw err;
  }
}

export interface TransferPointsInput {
  channelId: string;
  fromViewerId: string;
  toViewerId: string;
  amount: number;
  fromNote?: string;
  toNote?: string;
}

/**
 * Transfere pontos entre espectadores numa única transação (débito condicional
 * + crédito + duas linhas no ledger). Retorna false se o saldo for insuficiente.
 */
export async function transferPoints(input: TransferPointsInput): Promise<boolean> {
  if (input.amount <= 0 || input.fromViewerId === input.toViewerId) return false;
  try {
    await prisma.$transaction(async (tx) => {
      const debited = await tx.viewerProfile.updateMany({
        where: { id: input.fromViewerId, points: { gte: input.amount } },
        data: { points: { decrement: input.amount } },
      });
      if (debited.count !== 1) throw new Error("INSUFFICIENT_POINTS");
      await tx.viewerProfile.update({
        where: { id: input.toViewerId },
        data: { points: { increment: input.amount } },
      });
      await tx.pointLedger.createMany({
        data: [
          {
            channelId: input.channelId,
            viewerId: input.fromViewerId,
            delta: -input.amount,
            reason: "GIVE",
            note: input.fromNote,
          },
          {
            channelId: input.channelId,
            viewerId: input.toViewerId,
            delta: input.amount,
            reason: "GIVE",
            note: input.toNote,
          },
        ],
      });
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_POINTS") {
      return false;
    }
    throw err;
  }
}

export interface EnsureViewerInput {
  channelId: string;
  /** ID do usuário na plataforma do canal (YouTube channelId / Twitch user id). */
  platformUserId: string;
  displayName: string;
  avatarUrl?: string | null;
  isModerator?: boolean;
  isMember?: boolean;
}

/** Cria ou atualiza o perfil do espectador no canal. */
export async function ensureViewer(input: EnsureViewerInput) {
  return prisma.viewerProfile.upsert({
    where: {
      channelId_platformUserId: {
        channelId: input.channelId,
        platformUserId: input.platformUserId,
      },
    },
    create: {
      channelId: input.channelId,
      platformUserId: input.platformUserId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? undefined,
      isModerator: input.isModerator ?? false,
      isMember: input.isMember ?? false,
    },
    update: {
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? undefined,
      isModerator: input.isModerator ?? undefined,
      isMember: input.isMember ?? undefined,
      lastSeenAt: new Date(),
    },
  });
}
