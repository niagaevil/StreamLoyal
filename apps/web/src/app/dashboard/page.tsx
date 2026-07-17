import { prisma } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

export default async function DashboardOverview() {
  const channel = await requireMyChannel();

  const [viewerCount, totalPoints, pendingRedemptions, live] =
    await Promise.all([
      prisma.viewerProfile.count({ where: { channelId: channel.id } }),
      prisma.viewerProfile.aggregate({
        where: { channelId: channel.id },
        _sum: { points: true },
      }),
      prisma.redemption.count({
        where: { channelId: channel.id, status: "PENDING" },
      }),
      prisma.liveStream.findFirst({
        where: { channelId: channel.id, status: "LIVE" },
      }),
    ]);

  const cards = [
    { label: "Espectadores registrados", value: viewerCount },
    {
      label: `Total de ${channel.loyaltySettings?.currencyName ?? "pontos"} em circulação`,
      value: totalPoints._sum.points ?? 0,
    },
    { label: "Resgates pendentes", value: pendingRedemptions },
    { label: "Status da live", value: live ? "AO VIVO" : "Offline" },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{channel.title}</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Página pública: <span className="text-violet-300">/c/{channel.slug}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
          >
            <p className="text-sm text-zinc-400">{c.label}</p>
            <p className="mt-2 text-3xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
