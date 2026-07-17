import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { drawGiveaway, settleBettingRound } from "@streamloyal/core";
import { requireMyChannel } from "@/lib/channel";

const path = "/dashboard/engagement";
const values = (raw: FormDataEntryValue | null) =>
  String(raw ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);

async function saveEngagementSettings(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const on = (name: string) => formData.get(name) === "on";
  const data = {
    gamesEnabled: on("gamesEnabled"),
    giveawaysEnabled: on("giveawaysEnabled"),
    pollsEnabled: on("pollsEnabled"),
    bettingEnabled: on("bettingEnabled"),
    maxWager: Math.max(1, Math.min(1_000_000, Number(formData.get("maxWager")) || 10_000)),
    gameCooldownSec: Math.max(1, Math.min(3600, Number(formData.get("gameCooldownSec")) || 10)),
  };
  await prisma.engagementSettings.upsert({
    where: { channelId: channel.id },
    create: { channelId: channel.id, ...data },
    update: data,
  });
  revalidatePath(path);
}

async function createGiveaway(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await prisma.$transaction([
    prisma.giveaway.updateMany({
      where: { channelId: channel.id, status: "OPEN" },
      data: { status: "CANCELLED", endedAt: new Date() },
    }),
    prisma.giveaway.create({
      data: {
        channelId: channel.id,
        title,
        keyword: String(formData.get("keyword") ?? "sorteio").trim() || "sorteio",
        ticketCost: Math.max(0, Number(formData.get("ticketCost")) || 0),
        maxTickets: Math.max(1, Number(formData.get("maxTickets")) || 1),
        memberWeight: Math.max(1, Number(formData.get("memberWeight")) || 1),
      },
    }),
  ]);
  revalidatePath(path);
}

async function draw(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const giveaway = await prisma.giveaway.findFirst({
    where: { id, channelId: channel.id, status: "OPEN" },
  });
  if (giveaway) await drawGiveaway(giveaway.id).catch(() => null);
  revalidatePath(path);
}

async function createPoll(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const question = String(formData.get("question") ?? "").trim();
  const options = values(formData.get("options"));
  if (!question || options.length < 2) return;
  await prisma.$transaction(async (tx) => {
    await tx.poll.updateMany({
      where: { channelId: channel.id, status: "OPEN" },
      data: { status: "CANCELLED", endedAt: new Date() },
    });
    await tx.poll.create({
      data: {
        channelId: channel.id,
        question,
        options: {
          create: options.map((label, index) => ({ label, number: index + 1 })),
        },
      },
    });
  });
  revalidatePath(path);
}

async function closePoll(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  await prisma.poll.updateMany({
    where: {
      id: String(formData.get("id")),
      channelId: channel.id,
      status: "OPEN",
    },
    data: { status: "CLOSED", endedAt: new Date() },
  });
  revalidatePath(path);
}

async function createBet(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const title = String(formData.get("title") ?? "").trim();
  const options = values(formData.get("options"));
  if (!title || options.length < 2) return;
  await prisma.$transaction(async (tx) => {
    await tx.bettingRound.updateMany({
      where: { channelId: channel.id, status: "OPEN" },
      data: { status: "CANCELLED", endedAt: new Date() },
    });
    await tx.bettingRound.create({
      data: {
        channelId: channel.id,
        title,
        options: {
          create: options.map((label, index) => ({ label, number: index + 1 })),
        },
      },
    });
  });
  revalidatePath(path);
}

async function settleBet(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const round = await prisma.bettingRound.findFirst({
    where: { id, channelId: channel.id, status: "OPEN" },
  });
  const option = Number(formData.get("option"));
  if (round && Number.isInteger(option)) {
    await settleBettingRound(round.id, option).catch(() => null);
  }
  revalidatePath(path);
}

const field =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none";

export default async function EngagementPage() {
  const channel = await requireMyChannel();
  const [giveaway, poll, bet, settings] = await Promise.all([
    prisma.giveaway.findFirst({
      where: { channelId: channel.id },
      orderBy: { createdAt: "desc" },
      include: { winner: true, entries: true },
    }),
    prisma.poll.findFirst({
      where: { channelId: channel.id },
      orderBy: { createdAt: "desc" },
      include: {
        options: {
          orderBy: { number: "asc" },
          include: { _count: { select: { votes: true } } },
        },
      },
    }),
    prisma.bettingRound.findFirst({
      where: { channelId: channel.id },
      orderBy: { createdAt: "desc" },
      include: {
        options: {
          orderBy: { number: "asc" },
          include: { bets: true },
        },
        bets: true,
      },
    }),
    prisma.engagementSettings.findUnique({ where: { channelId: channel.id } }),
  ]);
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Engajamento e jogos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Sorteios, enquetes e apostas são controlados aqui. Jogos disponíveis:
          !8ball, !gamble, !slots, !duel, !heist, !combo e !pyramid.
        </p>
      </div>

      <form
        action={saveEngagementSettings}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <h2 className="mb-4 text-lg font-semibold text-violet-300">
          Limites e módulos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["gamesEnabled", "Minigames", settings?.gamesEnabled ?? true],
            ["giveawaysEnabled", "Sorteios", settings?.giveawaysEnabled ?? true],
            ["pollsEnabled", "Enquetes", settings?.pollsEnabled ?? true],
            ["bettingEnabled", "Apostas", settings?.bettingEnabled ?? true],
          ].map(([name, label, checked]) => (
            <label key={String(name)} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={String(name)}
                defaultChecked={Boolean(checked)}
                className="accent-violet-500"
              />
              {label}
            </label>
          ))}
          <input
            name="maxWager"
            type="number"
            min={1}
            max={1_000_000}
            defaultValue={settings?.maxWager ?? 10_000}
            placeholder="Aposta máxima"
            className={field}
          />
          <input
            name="gameCooldownSec"
            type="number"
            min={1}
            max={3600}
            defaultValue={settings?.gameCooldownSec ?? 10}
            placeholder="Cooldown dos jogos (s)"
            className={field}
          />
        </div>
        <button className="mt-4 rounded-lg bg-violet-600 px-4 py-2 font-medium hover:bg-violet-500">
          Salvar limites
        </button>
      </form>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-violet-300">Sorteio</h2>
        {giveaway && (
          <div className="mb-5 rounded-xl bg-zinc-950/60 p-4 text-sm">
            <b>{giveaway.title}</b> · {giveaway.status} ·{" "}
            {giveaway.entries.length} participante(s)
            {giveaway.winner && (
              <span className="ml-2 text-emerald-300">
                Vencedor: {giveaway.winner.displayName}
              </span>
            )}
            {giveaway.status === "OPEN" && giveaway.entries.length > 0 && (
              <form action={draw} className="mt-3">
                <input type="hidden" name="id" value={giveaway.id} />
                <button className="rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500">
                  Sortear agora
                </button>
              </form>
            )}
          </div>
        )}
        <form action={createGiveaway} className="grid gap-3 sm:grid-cols-2">
          <input name="title" required placeholder="Prêmio do sorteio" className={field} />
          <input name="keyword" defaultValue="sorteio" placeholder="Palavra-chave" className={field} />
          <input name="ticketCost" type="number" min={0} defaultValue={0} placeholder={`Custo em ${currency}`} className={field} />
          <input name="maxTickets" type="number" min={1} defaultValue={1} placeholder="Máximo de tickets" className={field} />
          <input name="memberWeight" type="number" min={1} defaultValue={2} placeholder="Peso de membros/subs" className={field} />
          <button className="rounded-lg bg-violet-600 px-4 py-2 font-medium hover:bg-violet-500">
            Abrir novo sorteio
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-violet-300">Enquete</h2>
        {poll && (
          <div className="mb-5 rounded-xl bg-zinc-950/60 p-4 text-sm">
            <b>{poll.question}</b> · {poll.status}
            <ol className="mt-2 space-y-1 text-zinc-400">
              {poll.options.map((option) => (
                <li key={option.id}>
                  {option.number}. {option.label} — {option._count.votes} voto(s)
                </li>
              ))}
            </ol>
            {poll.status === "OPEN" && (
              <form action={closePoll} className="mt-3">
                <input type="hidden" name="id" value={poll.id} />
                <button className="rounded-lg border border-zinc-700 px-4 py-2 hover:border-violet-400">
                  Encerrar enquete
                </button>
              </form>
            )}
          </div>
        )}
        <form action={createPoll} className="grid gap-3">
          <input name="question" required placeholder="Pergunta" className={field} />
          <textarea name="options" required rows={3} placeholder={"Uma opção por linha\nOpção A\nOpção B"} className={field} />
          <button className="rounded-lg bg-violet-600 px-4 py-2 font-medium hover:bg-violet-500">
            Abrir nova enquete
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-violet-300">Aposta com pote</h2>
        {bet && (
          <div className="mb-5 rounded-xl bg-zinc-950/60 p-4 text-sm">
            <b>{bet.title}</b> · {bet.status} · pote{" "}
            {bet.bets.reduce((sum, item) => sum + item.amount, 0)} {currency}
            <ol className="mt-2 space-y-2 text-zinc-400">
              {bet.options.map((option) => (
                <li key={option.id} className="flex items-center gap-3">
                  <span className="flex-1">
                    {option.number}. {option.label} —{" "}
                    {option.bets.reduce((sum, item) => sum + item.amount, 0)} {currency}
                  </span>
                  {bet.status === "OPEN" && (
                    <form action={settleBet}>
                      <input type="hidden" name="id" value={bet.id} />
                      <input type="hidden" name="option" value={option.number} />
                      <button className="rounded border border-emerald-800 px-2 py-1 text-xs text-emerald-300">
                        Marcar vencedora
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
        <form action={createBet} className="grid gap-3">
          <input name="title" required placeholder="O que vai acontecer?" className={field} />
          <textarea name="options" required rows={3} placeholder={"Uma opção por linha\nSim\nNão"} className={field} />
          <button className="rounded-lg bg-violet-600 px-4 py-2 font-medium hover:bg-violet-500">
            Abrir nova aposta
          </button>
        </form>
      </section>
    </div>
  );
}
