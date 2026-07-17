import { revalidatePath } from "next/cache";
import { prisma, ModPunishment } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

async function saveModeration(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();

  const on = (field: string) => formData.get(field) === "on";
  const int = (field: string, def: number, min = 0) =>
    Math.max(min, parseInt(String(formData.get(field) ?? def), 10) || def);
  const list = (field: string) =>
    String(formData.get(field) ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const data = {
    enabled: on("enabled"),
    punishment:
      (String(formData.get("punishment")) as ModPunishment) || "DELETE",
    timeoutSec: int("timeoutSec", 60, 1),
    sendWarning: on("sendWarning"),
    exemptMembers: on("exemptMembers"),
    capsEnabled: on("capsEnabled"),
    capsMinLen: int("capsMinLen", 10, 1),
    capsMaxPercent: int("capsMaxPercent", 70, 1),
    linksEnabled: on("linksEnabled"),
    linkWhitelist: list("linkWhitelist"),
    wordsEnabled: on("wordsEnabled"),
    bannedWords: list("bannedWords"),
    symbolsEnabled: on("symbolsEnabled"),
    symbolsMaxPercent: int("symbolsMaxPercent", 50, 1),
    repetitionEnabled: on("repetitionEnabled"),
    maxRepeatedChars: int("maxRepeatedChars", 8, 1),
    linesEnabled: on("linesEnabled"),
    maxLines: int("maxLines", 5, 1),
    zalgoEnabled: on("zalgoEnabled"),
    maxCombiningMarks: int("maxCombiningMarks", 8, 1),
    emotesEnabled: on("emotesEnabled"),
    maxEmotes: int("maxEmotes", 10, 1),
    regexEnabled: on("regexEnabled"),
    bannedPatterns: list("bannedPatterns").filter(
      (pattern) => pattern.length <= 100
    ),
  };

  await prisma.moderationSettings.upsert({
    where: { channelId: channel.id },
    create: { channelId: channel.id, ...data },
    update: data,
  });
  revalidatePath("/dashboard/moderation");
}

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none";

export default async function ModerationPage() {
  const channel = await requireMyChannel();
  const [settings, logs] = await Promise.all([
    prisma.moderationSettings.findUnique({ where: { channelId: channel.id } }),
    prisma.moderationLog.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">Moderação automática</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Filtros aplicados no chat durante a live. Moderadores nunca são
        punidos. Use !permit &lt;usuário&gt; para liberar um link pontual.
      </p>

      <form
        action={saveModeration}
        className="mb-10 space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings?.enabled ?? false}
              className="h-4 w-4 accent-violet-500"
            />
            Moderação ativada
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="sendWarning"
              defaultChecked={settings?.sendWarning ?? true}
              className="h-4 w-4 accent-violet-500"
            />
            Avisar no chat
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="exemptMembers"
              defaultChecked={settings?.exemptMembers ?? false}
              className="h-4 w-4 accent-violet-500"
            />
            Membros/subs isentos
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Punição</span>
            <select
              name="punishment"
              defaultValue={settings?.punishment ?? "DELETE"}
              className={inputCls}
            >
              <option value="DELETE">Apagar mensagem</option>
              <option value="TIMEOUT">Timeout</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Duração do timeout (s)
            </span>
            <input
              name="timeoutSec"
              type="number"
              min={1}
              defaultValue={settings?.timeoutSec ?? 60}
              className={inputCls}
            />
          </label>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="capsEnabled"
              defaultChecked={settings?.capsEnabled ?? false}
              className="h-4 w-4 accent-violet-500"
            />
            Filtro de maiúsculas (CAPS)
          </label>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Tamanho mínimo da mensagem
              </span>
              <input
                name="capsMinLen"
                type="number"
                min={1}
                defaultValue={settings?.capsMinLen ?? 10}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Máximo de maiúsculas (%)
              </span>
              <input
                name="capsMaxPercent"
                type="number"
                min={1}
                max={100}
                defaultValue={settings?.capsMaxPercent ?? 70}
                className={inputCls}
              />
            </label>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="linksEnabled"
              defaultChecked={settings?.linksEnabled ?? false}
              className="h-4 w-4 accent-violet-500"
            />
            Bloquear links
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm text-zinc-300">
              Domínios permitidos (um por linha)
            </span>
            <textarea
              name="linkWhitelist"
              rows={3}
              defaultValue={settings?.linkWhitelist.join("\n") ?? ""}
              placeholder={"youtube.com\ntwitch.tv"}
              className={inputCls}
            />
          </label>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="wordsEnabled"
              defaultChecked={settings?.wordsEnabled ?? false}
              className="h-4 w-4 accent-violet-500"
            />
            Palavras bloqueadas
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm text-zinc-300">
              Lista (uma por linha)
            </span>
            <textarea
              name="bannedWords"
              rows={3}
              defaultValue={settings?.bannedWords.join("\n") ?? ""}
              className={inputCls}
            />
          </label>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="symbolsEnabled"
              defaultChecked={settings?.symbolsEnabled ?? false}
              className="h-4 w-4 accent-violet-500"
            />
            Filtro de símbolos
          </label>
          <label className="mt-3 block sm:w-1/2">
            <span className="mb-1 block text-sm text-zinc-300">
              Máximo de símbolos (%)
            </span>
            <input
              name="symbolsMaxPercent"
              type="number"
              min={1}
              max={100}
              defaultValue={settings?.symbolsMaxPercent ?? 50}
              className={inputCls}
            />
          </label>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <h3 className="mb-3 text-sm font-medium">Filtros avançados</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["repetitionEnabled", "Repetição de caracteres", "maxRepeatedChars", settings?.repetitionEnabled ?? false, settings?.maxRepeatedChars ?? 8],
              ["linesEnabled", "Parágrafos/linhas", "maxLines", settings?.linesEnabled ?? false, settings?.maxLines ?? 5],
              ["zalgoEnabled", "Texto Zalgo", "maxCombiningMarks", settings?.zalgoEnabled ?? false, settings?.maxCombiningMarks ?? 8],
              ["emotesEnabled", "Excesso de emotes", "maxEmotes", settings?.emotesEnabled ?? false, settings?.maxEmotes ?? 10],
            ].map(([toggle, label, numberName, checked, defaultValue]) => (
              <div key={String(toggle)} className="rounded-xl bg-zinc-950/40 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={String(toggle)}
                    defaultChecked={Boolean(checked)}
                    className="h-4 w-4 accent-violet-500"
                  />
                  {label}
                </label>
                <input
                  name={String(numberName)}
                  type="number"
                  min={1}
                  defaultValue={Number(defaultValue)}
                  className={`${inputCls} mt-2`}
                />
              </div>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="regexEnabled"
              defaultChecked={settings?.regexEnabled ?? false}
              className="h-4 w-4 accent-violet-500"
            />
            Padrões regex bloqueados
          </label>
          <textarea
            name="bannedPatterns"
            rows={3}
            defaultValue={settings?.bannedPatterns.join("\n") ?? ""}
            placeholder="Um padrão por linha (máximo 100 caracteres)"
            className={`${inputCls} mt-2`}
          />
        </div>

        <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 font-semibold transition-colors">
          Salvar moderação
        </button>
      </form>

      <h2 className="mb-4 font-semibold">Últimas ações ({logs.length})</h2>
      <div className="space-y-2">
        {logs.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nenhuma ação de moderação registrada ainda.
          </p>
        )}
        {logs.map((log) => (
          <div
            key={log.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{log.displayName}</span>
              <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                {log.filter}
              </span>
              <span className="text-xs text-zinc-500">
                {log.action === "timeout" ? "timeout" : "mensagem apagada"} ·{" "}
                {log.createdAt.toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="mt-1 truncate text-zinc-400">{log.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
