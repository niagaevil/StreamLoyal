import { revalidatePath } from "next/cache";
import { prisma, CommandPermission } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

const BUILTINS = [
  ["!pontos / !points", "Mostra o saldo do espectador"],
  ["!top", "Top 5 por pontos"],
  ["!tophours", "Top 5 por horas acompanhando"],
  ["!give <usuário> <qtd>", "Transfere pontos para outra pessoa"],
  ["!redeem <item>", "Resgata um item da loja pelo chat"],
  ["!quote [n]", "Mostra uma quote aleatória ou específica"],
  ["!join / !leave", "Entra/sai da fila (quando aberta)"],
  ["!fila / !queue", "Mostra o estado da fila"],
  ["!comandos", "Lista os comandos do canal"],
  ["!8ball / !gamble / !slots", "Minigames com limites e cooldown"],
  ["!duel / !heist", "Duelo e assalto usando pontos"],
  ["!ticket / !vote / !bet", "Sorteio, enquete e aposta aberta"],
  ["!media / !skip", "Media Share e votação para pular"],
  ["!addpoints / !removepoints", "Ajusta pontos (moderadores)"],
  ["!addquote / !removequote", "Gerencia quotes (moderadores)"],
  ["!openqueue / !closequeue", "Abre/fecha a fila (moderadores)"],
  ["!permit <usuário>", "Libera 1 link por 60s (moderadores)"],
] as const;

function sanitizeName(raw: string) {
  return raw.trim().toLowerCase().replace(/^!/, "").replace(/\s+/g, "");
}

async function createCommand(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const name = sanitizeName(String(formData.get("name") ?? ""));
  const response = String(formData.get("response") ?? "").trim();
  if (!name || !response) return;

  const aliases = String(formData.get("aliases") ?? "")
    .split(",")
    .map(sanitizeName)
    .filter(Boolean);
  const permission =
    (String(formData.get("permission")) as CommandPermission) || "EVERYONE";

  const int = (field: string) =>
    Math.max(0, parseInt(String(formData.get(field) ?? "0"), 10) || 0);

  await prisma.chatCommand
    .create({
      data: {
        channelId: channel.id,
        name,
        aliases,
        response,
        permission,
        costPoints: int("costPoints"),
        globalCooldownSec: int("globalCooldownSec"),
        userCooldownSec: int("userCooldownSec"),
      },
    })
    .catch(() => null); // nome duplicado
  revalidatePath("/dashboard/commands");
}

async function toggleCommand(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const cmd = await prisma.chatCommand.findFirst({
    where: { id, channelId: channel.id },
  });
  if (!cmd) return;
  await prisma.chatCommand.update({
    where: { id },
    data: { enabled: !cmd.enabled },
  });
  revalidatePath("/dashboard/commands");
}

async function deleteCommand(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  await prisma.chatCommand.deleteMany({ where: { id, channelId: channel.id } });
  revalidatePath("/dashboard/commands");
}

export default async function CommandsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const channel = await requireMyChannel();
  const query = (await searchParams).q?.trim().slice(0, 50) ?? "";
  const [commands, logs] = await Promise.all([
    prisma.chatCommand.findMany({
      where: { channelId: channel.id },
      orderBy: { name: "asc" },
    }),
    prisma.commandLog.findMany({
      where: {
        channelId: channel.id,
        ...(query
          ? {
              OR: [
                { command: { contains: query, mode: "insensitive" as const } },
                { displayName: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">Comandos</h1>
      <p className="mb-6 text-sm text-zinc-400">
        As respostas são enviadas no chat pela sua própria conta durante a
        live. Variáveis disponíveis: {"{user}"}, {"{channel}"} e {"{args}"}.
      </p>

      <div className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 font-semibold text-violet-300">Novo comando</h2>
        <form action={createCommand} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Nome (sem !)
            </span>
            <input
              name="name"
              required
              placeholder="discord"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Aliases (separados por vírgula)
            </span>
            <input
              name="aliases"
              placeholder="dc, servidor"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Resposta</span>
            <textarea
              name="response"
              required
              rows={2}
              placeholder="Entre no nosso Discord: discord.gg/exemplo"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Permissão</span>
            <select
              name="permission"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            >
              <option value="EVERYONE">Todos</option>
              <option value="MODERATOR">Moderadores</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Custo ({currency})
            </span>
            <input
              name="costPoints"
              type="number"
              defaultValue={0}
              min={0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Cooldown global (s)
            </span>
            <input
              name="globalCooldownSec"
              type="number"
              defaultValue={5}
              min={0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Cooldown por usuário (s)
            </span>
            <input
              name="userCooldownSec"
              type="number"
              defaultValue={15}
              min={0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 font-semibold transition-colors sm:col-span-2">
            Criar comando
          </button>
        </form>
      </div>

      <h2 className="mb-4 font-semibold">Personalizados ({commands.length})</h2>
      <div className="mb-10 space-y-3">
        {commands.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nenhum comando personalizado ainda.
          </p>
        )}
        {commands.map((cmd) => (
          <div
            key={cmd.id}
            className={`flex items-center gap-4 rounded-xl border p-4 ${
              cmd.enabled
                ? "border-zinc-800 bg-zinc-900/50"
                : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">!{cmd.name}</span>
                {cmd.aliases.length > 0 && (
                  <span className="text-xs text-zinc-500">
                    ({cmd.aliases.map((a) => `!${a}`).join(", ")})
                  </span>
                )}
                {cmd.permission === "MODERATOR" && (
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                    Mods
                  </span>
                )}
                {cmd.costPoints > 0 && (
                  <span className="rounded bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
                    {cmd.costPoints} {currency}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm text-zinc-400">{cmd.response}</p>
            </div>
            <form action={toggleCommand}>
              <input type="hidden" name="id" value={cmd.id} />
              <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:border-violet-400 transition-colors">
                {cmd.enabled ? "Desativar" : "Ativar"}
              </button>
            </form>
            <form action={deleteCommand}>
              <input type="hidden" name="id" value={cmd.id} />
              <button className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-500 transition-colors">
                Excluir
              </button>
            </form>
          </div>
        ))}
      </div>

      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Últimos usos ({logs.length})</h2>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="Comando ou usuário"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
            />
            <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm">
              Buscar
            </button>
          </form>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-800">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex gap-3 border-b border-zinc-800 px-3 py-2 text-xs last:border-0"
            >
              <span className="font-mono text-violet-300">!{log.command}</span>
              <span className="flex-1 truncate text-zinc-400">
                {log.args || "—"} · {log.displayName}
              </span>
              <span className="text-zinc-600">
                {log.createdAt.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <p className="p-3 text-sm text-zinc-500">Nenhum uso encontrado.</p>
          )}
        </div>
      </div>

      <h2 className="mb-4 font-semibold">Comandos padrão (sempre ativos)</h2>
      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <tbody>
            {BUILTINS.map(([cmd, desc]) => (
              <tr key={cmd} className="border-t border-zinc-800/60 first:border-t-0">
                <td className="px-4 py-2.5 font-mono text-violet-300">{cmd}</td>
                <td className="px-4 py-2.5 text-zinc-400">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
