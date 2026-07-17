import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

async function toggleQueue() {
  "use server";
  const channel = await requireMyChannel();
  await prisma.channel.update({
    where: { id: channel.id },
    data: { queueOpen: !channel.queueOpen },
  });
  revalidatePath("/dashboard/chat");
}

async function removeFromQueue(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  await prisma.queueEntry.deleteMany({ where: { id, channelId: channel.id } });
  revalidatePath("/dashboard/chat");
}

async function clearQueue() {
  "use server";
  const channel = await requireMyChannel();
  await prisma.queueEntry.deleteMany({ where: { channelId: channel.id } });
  revalidatePath("/dashboard/chat");
}

async function addQuote(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const last = await prisma.quote.findFirst({
    where: { channelId: channel.id },
    orderBy: { number: "desc" },
  });
  await prisma.quote.create({
    data: {
      channelId: channel.id,
      number: (last?.number ?? 0) + 1,
      text,
      addedBy: "painel",
    },
  });
  revalidatePath("/dashboard/chat");
}

async function deleteQuote(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  await prisma.quote.deleteMany({ where: { id, channelId: channel.id } });
  revalidatePath("/dashboard/chat");
}

export default async function ChatPage() {
  const channel = await requireMyChannel();
  const [queue, quotes] = await Promise.all([
    prisma.queueEntry.findMany({
      where: { channelId: channel.id },
      orderBy: { joinedAt: "asc" },
      include: { viewer: true },
    }),
    prisma.quote.findMany({
      where: { channelId: channel.id },
      orderBy: { number: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="max-w-4xl space-y-12">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Fila de espectadores</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Espectadores entram com !join no chat. Chame o próximo e remova
              da lista.
            </p>
          </div>
          <div className="flex gap-2">
            <form action={toggleQueue}>
              <button
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  channel.queueOpen
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {channel.queueOpen ? "Fechar fila" : "Abrir fila"}
              </button>
            </form>
            {queue.length > 0 && (
              <form action={clearQueue}>
                <button className="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:border-red-500 transition-colors">
                  Limpar
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {queue.length === 0 && (
            <p className="text-sm text-zinc-500">
              Fila vazia{channel.queueOpen ? " — aguardando !join" : " (fechada)"}.
            </p>
          )}
          {queue.map((entry, i) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5"
            >
              <span className="w-6 text-center font-bold text-violet-300">
                {i + 1}
              </span>
              <span className="flex-1 text-sm">{entry.viewer.displayName}</span>
              <span className="text-xs text-zinc-500">
                {entry.joinedAt.toLocaleTimeString("pt-BR")}
              </span>
              <form action={removeFromQueue}>
                <input type="hidden" name="id" value={entry.id} />
                <button className="rounded-lg border border-zinc-700 px-3 py-1 text-xs hover:border-violet-400 transition-colors">
                  {i === 0 ? "Chamar / remover" : "Remover"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-xl font-bold">Quotes</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Frases marcantes da live. No chat: !addquote (mods), !quote e
          !removequote.
        </p>
        <form action={addQuote} className="mb-4 flex gap-2">
          <input
            name="text"
            required
            placeholder="Nova quote..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
          />
          <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm font-semibold transition-colors">
            Adicionar
          </button>
        </form>
        <div className="space-y-2">
          {quotes.length === 0 && (
            <p className="text-sm text-zinc-500">Nenhuma quote ainda.</p>
          )}
          {quotes.map((quote) => (
            <div
              key={quote.id}
              className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5"
            >
              <span className="font-mono text-xs text-violet-300">
                #{quote.number}
              </span>
              <span className="flex-1 text-sm">{quote.text}</span>
              {quote.addedBy && (
                <span className="text-xs text-zinc-500">{quote.addedBy}</span>
              )}
              <form action={deleteQuote}>
                <input type="hidden" name="id" value={quote.id} />
                <button className="rounded-lg border border-red-900 px-3 py-1 text-xs text-red-400 hover:border-red-500 transition-colors">
                  Excluir
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
