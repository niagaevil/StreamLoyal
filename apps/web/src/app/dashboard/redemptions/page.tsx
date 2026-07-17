import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { refundRedemption } from "@streamloyal/core";
import { requireMyChannel } from "@/lib/channel";

async function setStatus(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const action = String(formData.get("action"));

  const redemption = await prisma.redemption.findFirst({
    where: { id, channelId: channel.id },
  });
  if (!redemption) return;

  if (action === "approve") {
    await prisma.redemption.update({
      where: { id },
      data: { status: "APPROVED" },
    });
  } else if (action === "refund") {
    await refundRedemption(id);
  }
  revalidatePath("/dashboard/redemptions");
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendente", cls: "bg-amber-500/20 text-amber-300" },
  APPROVED: { label: "Aprovado", cls: "bg-emerald-500/20 text-emerald-300" },
  CANCELLED: { label: "Cancelado", cls: "bg-zinc-500/20 text-zinc-300" },
  REFUNDED: { label: "Reembolsado", cls: "bg-red-500/20 text-red-300" },
};

export default async function RedemptionsPage() {
  const channel = await requireMyChannel();
  const redemptions = await prisma.redemption.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { item: true, viewer: true, code: true },
  });
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">Resgates</h1>
      <div className="space-y-3">
        {redemptions.length === 0 && (
          <p className="text-sm text-zinc-500">Nenhum resgate ainda.</p>
        )}
        {redemptions.map((r) => {
          const st = STATUS_LABEL[r.status];
          return (
            <div
              key={r.id}
              className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="flex-1">
                <p className="font-medium">
                  {r.viewer.displayName}{" "}
                  <span className="text-zinc-400">resgatou</span> {r.item.name}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  {r.cost} {currency} ·{" "}
                  {new Date(r.createdAt).toLocaleString("pt-BR")}
                  {r.code && (
                    <>
                      {" "}
                      · código:{" "}
                      <span className="font-mono text-violet-300">
                        {r.code.code}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <span className={`rounded px-2 py-1 text-xs ${st.cls}`}>
                {st.label}
              </span>
              {r.status === "PENDING" && (
                <form action={setStatus} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    name="action"
                    value="approve"
                    className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-400 transition-colors"
                  >
                    Aprovar
                  </button>
                  <button
                    name="action"
                    value="refund"
                    className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-500 transition-colors"
                  >
                    Reembolsar
                  </button>
                </form>
              )}
              {r.status === "APPROVED" && (
                <form action={setStatus}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    name="action"
                    value="refund"
                    className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-500 transition-colors"
                  >
                    Reembolsar
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
