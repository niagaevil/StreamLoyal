import { prisma } from "@streamloyal/db";

export type RedeemResult =
  | { ok: true; redemptionId: string; code?: string }
  | { ok: false; error: "ITEM_UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_POINTS" | "COOLDOWN_GLOBAL" | "COOLDOWN_USER" | "VIEWER_BLOCKED" };

type RedeemErrorCode = Extract<RedeemResult, { ok: false }>["error"];

/** Erro que aborta (e reverte) a transação após escritas parciais. */
class RedeemAbort extends Error {
  constructor(public readonly code: RedeemErrorCode) {
    super(code);
  }
}

/**
 * Resgata um item da loja de forma transacional:
 * valida saldo, estoque e cooldowns; debita pontos; entrega código se houver.
 */
export async function redeemItem(params: {
  channelId: string;
  itemId: string;
  viewerId: string;
}): Promise<RedeemResult> {
  const { channelId, itemId, viewerId } = params;

  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.storeItem.findFirst({
        where: { id: itemId, channelId, isActive: true },
      });
      if (!item) return { ok: false as const, error: "ITEM_UNAVAILABLE" as const };

      const viewer = await tx.viewerProfile.findUniqueOrThrow({
        where: { id: viewerId },
      });

      const blocked = await tx.blockedUser.findUnique({
        where: {
          channelId_platformUserId: {
            channelId,
            platformUserId: viewer.platformUserId,
          },
        },
      });
      if (blocked) return { ok: false as const, error: "VIEWER_BLOCKED" as const };

      if (viewer.points < item.cost)
        return { ok: false as const, error: "INSUFFICIENT_POINTS" as const };

      if (item.stock !== null && item.stock <= 0)
        return { ok: false as const, error: "OUT_OF_STOCK" as const };

      const now = Date.now();
      if (item.globalCooldownSec > 0) {
        const last = await tx.redemption.findFirst({
          where: { itemId, status: { not: "CANCELLED" } },
          orderBy: { createdAt: "desc" },
        });
        if (last && now - last.createdAt.getTime() < item.globalCooldownSec * 1000)
          return { ok: false as const, error: "COOLDOWN_GLOBAL" as const };
      }
      if (item.userCooldownSec > 0) {
        const lastByUser = await tx.redemption.findFirst({
          where: { itemId, viewerId, status: { not: "CANCELLED" } },
          orderBy: { createdAt: "desc" },
        });
        if (
          lastByUser &&
          now - lastByUser.createdAt.getTime() < item.userCooldownSec * 1000
        )
          return { ok: false as const, error: "COOLDOWN_USER" as const };
      }

      // Reserva código de acesso, se for item do tipo CODE (claim condicional
      // para dois resgates concorrentes não levarem o mesmo código)
      let codeId: string | undefined;
      let codeValue: string | undefined;
      if (item.type === "CODE") {
        const freeCode = await tx.accessCode.findFirst({
          where: { itemId, redeemedAt: null },
        });
        if (!freeCode) return { ok: false as const, error: "OUT_OF_STOCK" as const };
        const claimed = await tx.accessCode.updateMany({
          where: { id: freeCode.id, redeemedAt: null },
          data: { redeemedAt: new Date() },
        });
        if (claimed.count !== 1) throw new RedeemAbort("OUT_OF_STOCK");
        codeId = freeCode.id;
        codeValue = freeCode.code;
      }

      // Decremento condicional de estoque: evita estoque negativo em corrida
      if (item.stock !== null) {
        const taken = await tx.storeItem.updateMany({
          where: { id: itemId, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        });
        if (taken.count !== 1) throw new RedeemAbort("OUT_OF_STOCK");
      }

      const redemption = await tx.redemption.create({
        data: {
          channelId,
          itemId,
          viewerId,
          cost: item.cost,
          codeId,
          // Código entregue na hora é aprovado automaticamente
          status: item.type === "CODE" ? "APPROVED" : "PENDING",
        },
      });

      // Débito condicional de saldo: falha se outra transação gastou antes
      const debited = await tx.viewerProfile.updateMany({
        where: { id: viewerId, points: { gte: item.cost } },
        data: { points: { decrement: item.cost } },
      });
      if (debited.count !== 1) throw new RedeemAbort("INSUFFICIENT_POINTS");
      await tx.pointLedger.create({
        data: {
          channelId,
          viewerId,
          delta: -item.cost,
          reason: "REDEEM",
          refId: redemption.id,
        },
      });

      return { ok: true as const, redemptionId: redemption.id, code: codeValue };
    });
  } catch (err) {
    if (err instanceof RedeemAbort) {
      return { ok: false as const, error: err.code };
    }
    throw err;
  }
}

/** Reembolsa um resgate (cancela e devolve pontos + estoque + código). */
export async function refundRedemption(redemptionId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const redemption = await tx.redemption.findUnique({
      where: { id: redemptionId },
      include: { item: true },
    });
    if (!redemption || redemption.status === "REFUNDED") return false;

    await tx.redemption.update({
      where: { id: redemptionId },
      data: { status: "REFUNDED" },
    });
    if (redemption.item.stock !== null) {
      await tx.storeItem.update({
        where: { id: redemption.itemId },
        data: { stock: { increment: 1 } },
      });
    }
    if (redemption.codeId) {
      await tx.accessCode.update({
        where: { id: redemption.codeId },
        data: { redeemedAt: null },
      });
    }
    await tx.pointLedger.create({
      data: {
        channelId: redemption.channelId,
        viewerId: redemption.viewerId,
        delta: redemption.cost,
        reason: "REFUND",
        refId: redemption.id,
      },
    });
    await tx.viewerProfile.update({
      where: { id: redemption.viewerId },
      data: { points: { increment: redemption.cost } },
    });
    return true;
  });
}
