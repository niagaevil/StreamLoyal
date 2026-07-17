import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@streamloyal/db";

// Identifica esta réplica do worker; leases são renovados enquanto o loop roda
export const WORKER_ID = randomUUID();

const LEASE_TTL_MS = 90_000;
export const LEASE_RENEW_MS = 30_000;

function nextExpiry() {
  return new Date(Date.now() + LEASE_TTL_MS);
}

/**
 * Tenta assumir o canal para esta réplica. Retorna true se o lease foi
 * adquirido (ou já era nosso); false se outra réplica ativa o detém.
 */
export async function acquireLease(channelId: string): Promise<boolean> {
  const taken = await prisma.workerLease.updateMany({
    where: {
      channelId,
      OR: [{ holderId: WORKER_ID }, { expiresAt: { lt: new Date() } }],
    },
    data: { holderId: WORKER_ID, expiresAt: nextExpiry() },
  });
  if (taken.count === 1) return true;

  try {
    await prisma.workerLease.create({
      data: { channelId, holderId: WORKER_ID, expiresAt: nextExpiry() },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false; // outra réplica criou o lease primeiro
    }
    throw error;
  }
}

/** Renova o lease; retorna false se ele foi perdido para outra réplica. */
export async function renewLease(channelId: string): Promise<boolean> {
  const renewed = await prisma.workerLease.updateMany({
    where: { channelId, holderId: WORKER_ID },
    data: { expiresAt: nextExpiry() },
  });
  return renewed.count === 1;
}

/** Libera o lease ao encerrar o loop, permitindo takeover imediato. */
export async function releaseLease(channelId: string): Promise<void> {
  await prisma.workerLease
    .deleteMany({ where: { channelId, holderId: WORKER_ID } })
    .catch(() => undefined);
}
