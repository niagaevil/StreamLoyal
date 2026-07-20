import { prisma, LedgerReason, Prisma } from "@streamloyal/db";
import { InsufficientPointsError } from "./errors";

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

type Tx = Prisma.TransactionClient;

/**
 * Aplica delta + ledger dentro de um client de transação já aberto.
 * Débito usa updateMany condicional para evitar saldo negativo em corrida.
 */
export async function applyPointsDelta(tx: Tx, input: AwardPointsInput) {
  const updated = await tx.viewerProfile.updateMany({
    where: {
      id: input.viewerId,
      ...(input.delta < 0 ? { points: { gte: -input.delta } } : {}),
    },
    data: { points: { increment: input.delta } },
  });
  if (updated.count !== 1) throw new InsufficientPointsError();
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
}

/**
 * Aplica uma variação de pontos com registro no ledger, de forma atômica.
 * Retorna false se a idempotencyKey já foi usada ou se o saldo ficaria negativo.
 */
export async function awardPoints(input: AwardPointsInput): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await applyPointsDelta(tx, input);
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
    if (err instanceof InsufficientPointsError) {
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
      if (debited.count !== 1) throw new InsufficientPointsError();
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
    if (err instanceof InsufficientPointsError) {
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
  const existing = await prisma.viewerProfile.findUnique({
    where: {
      channelId_platformUserId: {
        channelId: input.channelId,
        platformUserId: input.platformUserId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.viewerProfile.update({
      where: { id: existing.id },
      data: {
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? undefined,
        isModerator: input.isModerator ?? undefined,
        isMember: input.isMember ?? undefined,
        lastSeenAt: new Date(),
      },
    });
  }

  const created = await prisma.viewerProfile.create({
    data: {
      channelId: input.channelId,
      platformUserId: input.platformUserId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? undefined,
      isModerator: input.isModerator ?? false,
      isMember: input.isMember ?? false,
    },
  });

  // Espectador novo: aplica pontos importados de outra plataforma que estavam
  // aguardando esse nome aparecer (ex.: migração do Streamlabs).
  const applied = await applyPendingImport(
    input.channelId,
    created.id,
    input.displayName
  );
  return applied ?? created;
}

/**
 * Se houver pontos importados pendentes para o nome informado, credita-os via
 * ledger (idempotente) e remove a pendência na mesma transação.
 * Retorna o perfil atualizado ou null.
 */
export async function applyPendingImport(
  channelId: string,
  viewerId: string,
  displayName: string
) {
  const nameKey = displayName.trim().toLowerCase();
  if (!nameKey) return null;

  return prisma.$transaction(async (tx) => {
    const pending = await tx.pendingPointsImport.findUnique({
      where: { channelId_nameKey: { channelId, nameKey } },
    });
    if (!pending) return null;

    const idempotencyKey = `import:${pending.source}:${channelId}:${nameKey}`;

    if (pending.points > 0) {
      // Evita P2002 no meio da txn (abortaria o delete): se já creditou, só limpa.
      const already = await tx.pointLedger.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (!already) {
        await applyPointsDelta(tx, {
          channelId,
          viewerId,
          delta: pending.points,
          reason: "MANUAL",
          note: `Importado do ${pending.source}`,
          idempotencyKey,
        });
      }
    }

    await tx.pendingPointsImport.delete({ where: { id: pending.id } });
    return tx.viewerProfile.findUnique({ where: { id: viewerId } });
  });
}
