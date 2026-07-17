import { redirect } from "next/navigation";
import { prisma } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

async function disconnectBot() {
  "use server";
  const channel = await requireMyChannel();
  await prisma.botConnection.deleteMany({ where: { channelId: channel.id } });
  redirect("/dashboard/bot");
}

export default async function BotPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const channel = await requireMyChannel();
  const query = await searchParams;
  const bot = await prisma.botConnection.findUnique({
    where: { channelId: channel.id },
  });
  const errors: Record<string, string> = {
    oauth_state: "A autorização expirou ou o state OAuth não confere.",
    token: "O Google recusou a troca do código OAuth.",
    youtube: "Não foi possível ler o canal da conta escolhida.",
    no_channel: "A conta escolhida não possui canal no YouTube.",
    same_channel: "Escolha um canal diferente do canal principal.",
  };
  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Conta personalizada do bot</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Opcional: conecte um segundo canal do YouTube para que comandos,
        timers e moderação apareçam com o nome desse canal. Sem isso, a conta
        do streamer responde normalmente.
      </p>
      {query.error && (
        <p className="mb-5 rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
          {errors[query.error] ?? "Não foi possível conectar a conta."}
        </p>
      )}
      {query.ok && (
        <p className="mb-5 rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          Conta do bot conectada.
        </p>
      )}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        {bot ? (
          <>
            <p className="font-semibold text-violet-300">{bot.displayName}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Canal: {bot.platformUserId} · conectado em{" "}
              {bot.createdAt.toLocaleString("pt-BR")}
            </p>
            <div className="mt-5 flex gap-3">
              <a
                href="/api/bot/connect/youtube"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-violet-400"
              >
                Trocar conta
              </a>
              <form action={disconnectBot}>
                <button className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300 hover:border-red-500">
                  Desconectar
                </button>
              </form>
            </div>
          </>
        ) : (
          <a
            href="/api/bot/connect/youtube"
            className="inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500"
          >
            Conectar canal de bot do YouTube
          </a>
        )}
      </div>
      <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-200">
        Depois de conectar, adicione esse canal como moderador no chat do canal
        principal. Caso contrário, ele conseguirá responder, mas não apagar
        mensagens nem aplicar timeout.
      </div>
    </div>
  );
}
