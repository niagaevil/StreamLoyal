import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { redeemItem } from "@streamloyal/core";
import { auth, signIn } from "@/lib/auth";
import { getOrCreateMyViewerProfile } from "@/lib/viewer";

async function redeemAction(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("itemId"));

  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) return;

  const viewer = await getOrCreateMyViewerProfile(channel.id, channel.platform);
  if (!viewer) {
    await signIn(channel.platform === "TWITCH" ? "twitch" : "google", {
      redirectTo: `/c/${slug}`,
    });
    return;
  }

  await redeemItem({ channelId: channel.id, itemId, viewerId: viewer.id });
  revalidatePath(`/c/${slug}`);
}

export default async function PublicChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const channel = await prisma.channel.findUnique({
    where: { slug },
    include: { loyaltySettings: true, storeTheme: true },
  });
  if (!channel) notFound();

  const session = await auth();
  const [items, topViewers, live, myViewer, commands] = await Promise.all([
    prisma.storeItem.findMany({
      where: { channelId: channel.id, isActive: true },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
    }),
    prisma.viewerProfile.findMany({
      where: { channelId: channel.id },
      orderBy: { points: "desc" },
      take: 25,
    }),
    prisma.liveStream.findFirst({
      where: { channelId: channel.id, status: "LIVE" },
    }),
    session?.user?.id
      ? getOrCreateMyViewerProfile(channel.id, channel.platform)
      : null,
    prisma.chatCommand.findMany({
      where: { channelId: channel.id, enabled: true, permission: "EVERYONE" },
      orderBy: { name: "asc" },
    }),
  ]);

  const loginProvider = channel.platform === "TWITCH" ? "twitch" : "google";

  const theme = channel.storeTheme;
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";
  const accent = theme?.accentColor ?? "#7c3aed";

  return (
    <main className="min-h-screen">
      {theme?.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={theme.bannerUrl}
          alt=""
          className="h-40 w-full object-cover"
        />
      )}
      <header
        className="border-b border-zinc-800 px-6 py-6"
        style={{ borderTopColor: accent, borderTopWidth: 3 }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          {(theme?.logoUrl || channel.avatarUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme?.logoUrl ?? channel.avatarUrl ?? ""}
              alt={channel.title}
              className="h-14 w-14 rounded-full object-cover"
            />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {theme?.headline ?? channel.title}
            </h1>
            {theme?.about && (
              <p className="text-sm text-zinc-400">{theme.about}</p>
            )}
          </div>
          {live && (
            <Link
              href={`/c/${slug}/watch`}
              className="flex items-center gap-2 rounded-xl px-4 py-2 font-semibold"
              style={{ backgroundColor: accent }}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
              AO VIVO — assista e ganhe
            </Link>
          )}
          {session?.user ? (
            <div className="text-right">
              <p className="text-sm text-zinc-400">{session.user.name}</p>
              <p className="font-bold" style={{ color: accent }}>
                {myViewer?.points ?? 0} {currency}
              </p>
            </div>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn(loginProvider, { redirectTo: `/c/${slug}` });
              }}
            >
              <button
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: accent }}
              >
                Entrar para ver meus {currency}
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-10 lg:grid-cols-[1fr_300px]">
        <section>
          <h2 className="mb-4 text-lg font-semibold">Loja de recompensas</h2>
          {items.length === 0 && (
            <p className="text-sm text-zinc-500">
              O streamer ainda não criou recompensas.
            </p>
          )}
          <div
            className={
              theme?.layout === "list"
                ? "space-y-3"
                : "grid gap-4 sm:grid-cols-2"
            }
          >
            {items.map((item) => {
              const soldOut = item.stock !== null && item.stock <= 0;
              const canAfford = (myViewer?.points ?? 0) >= item.cost;
              return (
                <div
                  key={item.id}
                  className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
                >
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="mb-3 h-28 w-full rounded-xl object-cover"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{item.name}</h3>
                    {item.isFeatured && (
                      <span
                        className="rounded px-2 py-0.5 text-xs"
                        style={{ backgroundColor: `${accent}33`, color: accent }}
                      >
                        Destaque
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-1 flex-1 text-sm text-zinc-400">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-bold" style={{ color: accent }}>
                      {item.cost} {currency}
                    </span>
                    {session?.user ? (
                      <form action={redeemAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <button
                          disabled={soldOut || !canAfford}
                          className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ backgroundColor: accent }}
                        >
                          {soldOut ? "Esgotado" : "Resgatar"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-zinc-500">
                        Entre para resgatar
                      </span>
                    )}
                  </div>
                  {item.stock !== null && !soldOut && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {item.stock} restantes
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <aside>
          <h2 className="mb-4 text-lg font-semibold">Comandos do chat</h2>
          <div className="mb-8 space-y-2">
            {[
              ["!pontos", `Ver seus ${currency}`],
              ["!top", "Ranking do canal"],
              ["!redeem <item>", "Resgatar pelo chat"],
              ["!gamble <qtd>", "Jogo de pontos"],
              ["!ticket [qtd]", "Entrar no sorteio"],
              ["!vote / !bet", "Enquetes e apostas"],
            ].map(([cmd, desc]) => (
              <div
                key={cmd}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm"
              >
                <code className="font-mono" style={{ color: accent }}>
                  {cmd}
                </code>
                <span className="flex-1 text-right text-xs text-zinc-500">
                  {desc}
                </span>
              </div>
            ))}
            {commands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm"
              >
                <code className="font-mono" style={{ color: accent }}>
                  !{cmd.name}
                </code>
                <span className="flex-1 truncate text-right text-xs text-zinc-500">
                  {cmd.costPoints > 0
                    ? `${cmd.costPoints} ${currency}`
                    : cmd.response}
                </span>
              </div>
            ))}
          </div>

          <h2 className="mb-4 text-lg font-semibold">Ranking</h2>
          <ol className="space-y-2">
            {topViewers.length === 0 && (
              <p className="text-sm text-zinc-500">
                Ninguém pontuou ainda. Participe da próxima live!
              </p>
            )}
            {topViewers.map((v, i) => (
              <li
                key={v.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2"
              >
                <span
                  className="w-6 text-center font-bold"
                  style={{ color: i < 3 ? accent : undefined }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-sm">{v.displayName}</span>
                <span className="text-sm font-semibold">
                  {v.points.toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}
