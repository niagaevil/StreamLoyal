import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

async function createTimer(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const name = String(formData.get("name") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!name || !message) return;

  await prisma.chatTimer.create({
    data: {
      channelId: channel.id,
      name,
      message,
      intervalMin: Math.max(
        1,
        parseInt(String(formData.get("intervalMin") ?? "15"), 10) || 15
      ),
      minChatLines: Math.max(
        0,
        parseInt(String(formData.get("minChatLines") ?? "5"), 10) || 0
      ),
    },
  });
  revalidatePath("/dashboard/timers");
}

async function toggleTimer(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const timer = await prisma.chatTimer.findFirst({
    where: { id, channelId: channel.id },
  });
  if (!timer) return;
  await prisma.chatTimer.update({
    where: { id },
    data: { enabled: !timer.enabled },
  });
  revalidatePath("/dashboard/timers");
}

async function deleteTimer(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  await prisma.chatTimer.deleteMany({ where: { id, channelId: channel.id } });
  revalidatePath("/dashboard/timers");
}

export default async function TimersPage() {
  const channel = await requireMyChannel();
  const timers = await prisma.chatTimer.findMany({
    where: { channelId: channel.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">Timers</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Mensagens automáticas durante a live. Cada timer só dispara se o chat
        teve o mínimo de mensagens desde o último disparo (evita falar num
        chat parado).
      </p>

      <div className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 font-semibold text-violet-300">Novo timer</h2>
        <form action={createTimer} className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Nome</span>
            <input
              name="name"
              required
              placeholder="Divulgar redes sociais"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Mensagem</span>
            <textarea
              name="message"
              required
              rows={2}
              placeholder="Siga nas redes: instagram.com/exemplo"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Intervalo (min)
            </span>
            <input
              name="intervalMin"
              type="number"
              defaultValue={15}
              min={1}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Mínimo de mensagens no chat
            </span>
            <input
              name="minChatLines"
              type="number"
              defaultValue={5}
              min={0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 font-semibold transition-colors sm:col-span-2">
            Criar timer
          </button>
        </form>
      </div>

      <h2 className="mb-4 font-semibold">Timers ({timers.length})</h2>
      <div className="space-y-3">
        {timers.length === 0 && (
          <p className="text-sm text-zinc-500">Nenhum timer ainda.</p>
        )}
        {timers.map((timer) => (
          <div
            key={timer.id}
            className={`flex items-center gap-4 rounded-xl border p-4 ${
              timer.enabled
                ? "border-zinc-800 bg-zinc-900/50"
                : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
            }`}
          >
            <div className="flex-1">
              <span className="font-medium">{timer.name}</span>
              <p className="mt-1 truncate text-sm text-zinc-400">
                {timer.message}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                A cada {timer.intervalMin} min · mínimo {timer.minChatLines}{" "}
                mensagens
              </p>
            </div>
            <form action={toggleTimer}>
              <input type="hidden" name="id" value={timer.id} />
              <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:border-violet-400 transition-colors">
                {timer.enabled ? "Desativar" : "Ativar"}
              </button>
            </form>
            <form action={deleteTimer}>
              <input type="hidden" name="id" value={timer.id} />
              <button className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-500 transition-colors">
                Excluir
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
