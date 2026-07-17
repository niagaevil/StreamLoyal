import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@streamloyal/db";
import { auth, signIn } from "@/lib/auth";
import { getOrCreateMyViewerProfile } from "@/lib/viewer";
import WatchPlayer from "./WatchPlayer";
import TwitchPlayer from "./TwitchPlayer";

export default async function WatchPage({
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
  const live = await prisma.liveStream.findFirst({
    where: { channelId: channel.id, status: "LIVE" },
  });

  const viewer = session?.user?.id
    ? await getOrCreateMyViewerProfile(channel.id, channel.platform)
    : null;
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";
  const accent = channel.storeTheme?.accentColor ?? "#7c3aed";
  const isTwitch = channel.platform === "TWITCH";
  const loginProvider = isTwitch ? "twitch" : "google";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{channel.title} — ao vivo</h1>
        <Link
          href={`/c/${slug}`}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Voltar para a loja
        </Link>
      </div>

      {!session?.user ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-lg font-semibold">
            Entre para assistir e ganhar {currency}
          </p>
          <p className="mt-2 mb-6 text-sm text-zinc-400">
            {isTwitch
              ? "O crédito funciona com sua conta da Twitch vinculada."
              : "O crédito só funciona com sua conta Google vinculada."}
          </p>
          <form
            action={async () => {
              "use server";
              await signIn(loginProvider, { redirectTo: `/c/${slug}/watch` });
            }}
          >
            <button
              className="rounded-xl px-6 py-3 font-semibold"
              style={{ backgroundColor: accent }}
            >
              {isTwitch ? "Entrar com Twitch" : "Entrar com Google"}
            </button>
          </form>
        </div>
      ) : !live ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-lg font-semibold">O canal está offline agora.</p>
          <p className="mt-2 text-sm text-zinc-400">
            Volte quando a live começar para assistir e ganhar {currency}.
          </p>
        </div>
      ) : isTwitch ? (
        <TwitchPlayer
          login={channel.platformLogin ?? channel.title}
          currencyName={currency}
          accentColor={accent}
        />
      ) : !channel.loyaltySettings?.watchEarnEnabled ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <p className="text-lg font-semibold">
            Este canal não ativou o Assistir &amp; Ganhar.
          </p>
        </div>
      ) : (
        <WatchPlayer
          slug={slug}
          videoId={live.videoId}
          currencyName={currency}
          accentColor={accent}
          initialPoints={viewer?.points ?? 0}
        />
      )}
    </main>
  );
}
