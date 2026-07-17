import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { awardPoints } from "@streamloyal/core";
import { requireMyChannel } from "@/lib/channel";

async function adjustPoints(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const viewerId = String(formData.get("viewerId"));
  const delta = parseInt(String(formData.get("delta") ?? "0"), 10);
  if (!delta) return;

  const viewer = await prisma.viewerProfile.findFirst({
    where: { id: viewerId, channelId: channel.id },
  });
  if (!viewer) return;

  await awardPoints({
    channelId: channel.id,
    viewerId,
    delta,
    reason: "MANUAL",
    note: "Ajuste manual pelo painel",
  });
  revalidatePath("/dashboard/viewers");
}

async function toggleBlock(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const platformUserId = String(formData.get("platformUserId"));
  const existing = await prisma.blockedUser.findUnique({
    where: {
      channelId_platformUserId: { channelId: channel.id, platformUserId },
    },
  });
  if (existing) {
    await prisma.blockedUser.delete({ where: { id: existing.id } });
  } else {
    await prisma.blockedUser.create({
      data: { channelId: channel.id, platformUserId },
    });
  }
  revalidatePath("/dashboard/viewers");
}

export default async function ViewersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const channel = await requireMyChannel();

  const [viewers, blocked] = await Promise.all([
    prisma.viewerProfile.findMany({
      where: {
        channelId: channel.id,
        ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { points: "desc" },
      take: 100,
    }),
    prisma.blockedUser.findMany({ where: { channelId: channel.id } }),
  ]);
  const blockedSet = new Set(blocked.map((b) => b.platformUserId));
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">Espectadores</h1>

      <form className="mb-6">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nome..."
          className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
        />
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Espectador</th>
              <th className="px-4 py-3">{currency}</th>
              <th className="px-4 py-3">Min. ativos</th>
              <th className="px-4 py-3">Min. assistidos</th>
              <th className="px-4 py-3">Ajustar</th>
              <th className="px-4 py-3">Bloqueio</th>
            </tr>
          </thead>
          <tbody>
            {viewers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Nenhum espectador ainda. Eles aparecem aqui quando interagem
                  na live ou assistem pela sua página.
                </td>
              </tr>
            )}
            {viewers.map((v) => (
              <tr key={v.id} className="border-t border-zinc-800/60">
                <td className="px-4 py-3 font-medium">{v.displayName}</td>
                <td className="px-4 py-3">{v.points}</td>
                <td className="px-4 py-3">{v.activeMinutes}</td>
                <td className="px-4 py-3">{v.watchMinutes}</td>
                <td className="px-4 py-3">
                  <form action={adjustPoints} className="flex gap-2">
                    <input type="hidden" name="viewerId" value={v.id} />
                    <input
                      name="delta"
                      type="number"
                      placeholder="+/-"
                      className="w-20 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500 focus:outline-none"
                    />
                    <button className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:border-violet-400 transition-colors">
                      OK
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <form action={toggleBlock}>
                    <input
                      type="hidden"
                      name="platformUserId"
                      value={v.platformUserId}
                    />
                    <button
                      className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                        blockedSet.has(v.platformUserId)
                          ? "border-red-500 text-red-400"
                          : "border-zinc-700 hover:border-red-500"
                      }`}
                    >
                      {blockedSet.has(v.platformUserId)
                        ? "Desbloquear"
                        : "Bloquear"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
