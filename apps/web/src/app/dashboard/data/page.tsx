import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@streamloyal/db";
import { awardPoints, ensureViewer } from "@streamloyal/core";
import { requireMyChannel } from "@/lib/channel";
import { getTwitchAccessToken, fetchTwitchUsersByLogin } from "@/lib/twitch";

const commandSchema = z.object({
  name: z.string().min(1).max(50),
  aliases: z.array(z.string()).default([]),
  response: z.string().min(1).max(500),
  permission: z.enum(["EVERYONE", "MODERATOR"]).default("EVERYONE"),
  costPoints: z.number().int().min(0).default(0),
  globalCooldownSec: z.number().int().min(0).default(5),
  userCooldownSec: z.number().int().min(0).default(15),
  enabled: z.boolean().default(true),
});
const timerSchema = z.object({
  name: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  intervalMin: z.number().int().min(1).max(1440).default(15),
  minChatLines: z.number().int().min(0).max(10_000).default(5),
  enabled: z.boolean().default(true),
});
const viewerSchema = z.object({
  platformUserId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  points: z.number().int().min(0).max(1_000_000_000).default(0),
  activeMinutes: z.number().int().min(0).default(0),
  watchMinutes: z.number().int().min(0).default(0),
});
const itemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  type: z.enum(["PERK", "SOUND", "CODE"]).default("PERK"),
  cost: z.number().int().min(1),
  stock: z.number().int().min(0).nullable().optional(),
  globalCooldownSec: z.number().int().min(0).default(0),
  userCooldownSec: z.number().int().min(0).default(0),
  imageUrl: z.string().max(2000).nullable().optional(),
  soundUrl: z.string().max(2000).nullable().optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
const backupSchema = z.object({
  version: z.literal(1),
  commands: z.array(commandSchema).max(1000).default([]),
  timers: z.array(timerSchema).max(1000).default([]),
  viewers: z.array(viewerSchema).max(100_000).default([]),
  items: z.array(itemSchema).max(10_000).default([]),
  moderation: z
    .object({
      bannedWords: z.array(z.string().max(200)).max(10_000).default([]),
      linkWhitelist: z.array(z.string().max(300)).max(10_000).default([]),
    })
    .nullable()
    .optional(),
});

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const [headers, ...data] = rows;
  if (!headers) return [];
  return data.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

const bool = (value: string) => value.toLowerCase() === "true";

async function importBackup(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) {
    redirect("/dashboard/data?error=arquivo");
  }
  let parsed: z.infer<typeof backupSchema>;
  try {
    parsed = backupSchema.parse(JSON.parse(await file.text()));
  } catch {
    redirect("/dashboard/data?error=formato");
  }

  await prisma.$transaction(async (tx) => {
    for (const command of parsed.commands) {
      await tx.chatCommand.upsert({
        where: {
          channelId_name: { channelId: channel.id, name: command.name.toLowerCase() },
        },
        create: { channelId: channel.id, ...command, name: command.name.toLowerCase() },
        update: { ...command, name: command.name.toLowerCase() },
      });
    }
    for (const timer of parsed.timers) {
      const existing = await tx.chatTimer.findFirst({
        where: { channelId: channel.id, name: timer.name },
      });
      if (existing) {
        await tx.chatTimer.update({ where: { id: existing.id }, data: timer });
      } else {
        await tx.chatTimer.create({ data: { channelId: channel.id, ...timer } });
      }
    }
    for (const viewer of parsed.viewers) {
      const current = await tx.viewerProfile.findUnique({
        where: {
          channelId_platformUserId: {
            channelId: channel.id,
            platformUserId: viewer.platformUserId,
          },
        },
      });
      const profile = await tx.viewerProfile.upsert({
        where: {
          channelId_platformUserId: {
            channelId: channel.id,
            platformUserId: viewer.platformUserId,
          },
        },
        create: { channelId: channel.id, ...viewer },
        update: {
          displayName: viewer.displayName,
          activeMinutes: viewer.activeMinutes,
          watchMinutes: viewer.watchMinutes,
          points: viewer.points,
        },
      });
      const delta = viewer.points - (current?.points ?? 0);
      if (delta !== 0) {
        await tx.pointLedger.create({
          data: {
            channelId: channel.id,
            viewerId: profile.id,
            delta,
            reason: "MANUAL",
            note: "importação de backup",
          },
        });
      }
    }
    for (const item of parsed.items) {
      const existing = await tx.storeItem.findFirst({
        where: {
          channelId: channel.id,
          name: { equals: item.name, mode: "insensitive" },
        },
      });
      if (existing) {
        await tx.storeItem.update({ where: { id: existing.id }, data: item });
      } else {
        await tx.storeItem.create({ data: { channelId: channel.id, ...item } });
      }
    }
    if (parsed.moderation) {
      await tx.moderationSettings.upsert({
        where: { channelId: channel.id },
        create: { channelId: channel.id, ...parsed.moderation },
        update: parsed.moderation,
      });
    }
  });
  redirect("/dashboard/data?ok=1");
}

async function importCsv(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const file = formData.get("file");
  const type = String(formData.get("type"));
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) {
    redirect("/dashboard/data?error=arquivo");
  }
  const rows = parseCsv(await file.text());
  if (rows.length > 100_000) redirect("/dashboard/data?error=formato");
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (type === "commands") {
          const command = commandSchema.parse({
            name: row.name,
            aliases: (row.aliases ?? "").split("|").filter(Boolean),
            response: row.response,
            permission: row.permission,
            costPoints: Number(row.costPoints),
            enabled: bool(row.enabled ?? "true"),
          });
          await tx.chatCommand.upsert({
            where: {
              channelId_name: {
                channelId: channel.id,
                name: command.name.toLowerCase(),
              },
            },
            create: {
              channelId: channel.id,
              ...command,
              name: command.name.toLowerCase(),
            },
            update: { ...command, name: command.name.toLowerCase() },
          });
        } else if (type === "timers") {
          const timer = timerSchema.parse({
            name: row.name,
            message: row.message,
            intervalMin: Number(row.intervalMin),
            minChatLines: Number(row.minChatLines),
            enabled: bool(row.enabled ?? "true"),
          });
          const existing = await tx.chatTimer.findFirst({
            where: { channelId: channel.id, name: timer.name },
          });
          if (existing) {
            await tx.chatTimer.update({ where: { id: existing.id }, data: timer });
          } else {
            await tx.chatTimer.create({ data: { channelId: channel.id, ...timer } });
          }
        } else if (type === "viewers") {
          const viewer = viewerSchema.parse({
            platformUserId: row.platformUserId,
            displayName: row.displayName,
            points: Number(row.points),
            activeMinutes: Number(row.activeMinutes),
            watchMinutes: Number(row.watchMinutes),
          });
          const current = await tx.viewerProfile.findUnique({
            where: {
              channelId_platformUserId: {
                channelId: channel.id,
                platformUserId: viewer.platformUserId,
              },
            },
          });
          const profile = await tx.viewerProfile.upsert({
            where: {
              channelId_platformUserId: {
                channelId: channel.id,
                platformUserId: viewer.platformUserId,
              },
            },
            create: { channelId: channel.id, ...viewer },
            update: viewer,
          });
          const delta = viewer.points - (current?.points ?? 0);
          if (delta) {
            await tx.pointLedger.create({
              data: {
                channelId: channel.id,
                viewerId: profile.id,
                delta,
                reason: "MANUAL",
                note: "importação CSV",
              },
            });
          }
        } else if (type === "items") {
          const item = itemSchema.parse({
            name: row.name,
            description: row.description || null,
            type: row.type,
            cost: Number(row.cost),
            stock: row.stock === "" ? null : Number(row.stock),
            isActive: bool(row.isActive ?? "true"),
          });
          const existing = await tx.storeItem.findFirst({
            where: {
              channelId: channel.id,
              name: { equals: item.name, mode: "insensitive" },
            },
          });
          if (existing) {
            await tx.storeItem.update({ where: { id: existing.id }, data: item });
          } else {
            await tx.storeItem.create({ data: { channelId: channel.id, ...item } });
          }
        } else {
          throw new Error("INVALID_TYPE");
        }
      }
    });
  } catch {
    redirect("/dashboard/data?error=formato");
  }
  redirect("/dashboard/data?ok=1");
}

const NAME_KEYS = ["username", "user", "name", "viewer", "login", "usuário", "nome"];
const POINTS_KEYS = ["points", "currency", "amount", "balance", "value", "pontos", "saldo"];

function pickColumn(row: Record<string, string>, candidates: string[]) {
  const entries = Object.entries(row);
  for (const key of candidates) {
    const found = entries.find(([header]) => header.trim().toLowerCase() === key);
    if (found) return found[1];
  }
  return undefined;
}

function toPoints(raw: string | undefined) {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d-]/g, "");
  const value = parseInt(cleaned, 10);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1_000_000_000);
}

async function importStreamlabs(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) {
    redirect("/dashboard/data?error=arquivo");
  }

  const rows = parseCsv(await file.text());
  if (rows.length === 0 || rows.length > 100_000) {
    redirect("/dashboard/data?error=formato");
  }

  // Consolida por nome (última linha vence) e descarta pontos inválidos.
  const byName = new Map<string, { display: string; points: number }>();
  for (const row of rows) {
    const display = (pickColumn(row, NAME_KEYS) ?? "").trim();
    const points = toPoints(pickColumn(row, POINTS_KEYS));
    if (!display || points <= 0) continue;
    byName.set(display.toLowerCase(), { display, points });
  }
  if (byName.size === 0) redirect("/dashboard/data?error=formato");

  let imported = 0;
  let pending = 0;

  // Twitch: resolve login → user id e credita direto; o que não resolver fica pendente.
  const resolved =
    channel.platform === "TWITCH"
      ? await (async () => {
          const token = await getTwitchAccessToken(channel.ownerId);
          if (!token) return new Map();
          return fetchTwitchUsersByLogin(token, [...byName.keys()]);
        })()
      : new Map();

  for (const [nameKey, { display, points }] of byName) {
    const match = channel.platform === "TWITCH" ? resolved.get(nameKey) : undefined;
    if (match) {
      const viewer = await ensureViewer({
        channelId: channel.id,
        platformUserId: match.id,
        displayName: match.displayName ?? display,
        avatarUrl: match.avatarUrl ?? null,
      });
      await awardPoints({
        channelId: channel.id,
        viewerId: viewer.id,
        delta: points,
        reason: "MANUAL",
        note: "Importado do Streamlabs",
        idempotencyKey: `import:streamlabs:${channel.id}:${match.id}`,
      });
      imported += 1;
    } else {
      await prisma.pendingPointsImport.upsert({
        where: { channelId_nameKey: { channelId: channel.id, nameKey } },
        create: {
          channelId: channel.id,
          nameKey,
          points,
          source: "streamlabs",
        },
        update: { points },
      });
      pending += 1;
    }
  }

  redirect(`/dashboard/data?imported=${imported}&pending=${pending}`);
}

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    error?: string;
    imported?: string;
    pending?: string;
  }>;
}) {
  const channel = await requireMyChannel();
  const query = await searchParams;
  const exports = [
    ["Comandos", "commands"],
    ["Timers", "timers"],
    ["Espectadores e pontos", "viewers"],
    ["Recompensas", "items"],
  ];
  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Importar e exportar</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Backups não incluem tokens OAuth, sessões, códigos secretos nem URLs
          privadas do OBS.
        </p>
      </div>
      {query.ok && (
        <p className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          Backup importado com sucesso.
        </p>
      )}
      {query.imported !== undefined && (
        <p className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          Importação concluída: {query.imported} espectador(es) creditado(s) agora
          {Number(query.pending) > 0 && (
            <>
              {" "}
              e {query.pending} pendente(s) — esses pontos entram automaticamente
              quando cada pessoa aparecer no chat ou na sua página.
            </>
          )}
          .
        </p>
      )}
      {query.error && (
        <p className="rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
          Arquivo inválido, incompatível ou maior que 5 MB.
        </p>
      )}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-violet-300">Exportar</h2>
        <a
          href="/api/export?format=json"
          className="mb-5 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500"
        >
          Baixar backup completo (JSON)
        </a>
        <div className="flex flex-wrap gap-2">
          {exports.map(([label, type]) => (
            <a
              key={type}
              href={`/api/export?format=csv&type=${type}`}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:border-violet-400"
            >
              {label} (CSV)
            </a>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-violet-300">
          Importar backup JSON
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Registros com o mesmo nome/ID são atualizados; não são duplicados.
        </p>
        <form action={importBackup} className="space-y-4">
          <input
            type="file"
            name="file"
            required
            accept="application/json,.json"
            className="block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm"
          />
          <button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">
            Importar
          </button>
        </form>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-violet-300">
          Importar do Streamlabs
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Migre os pontos sem perder nada. Exporte a lista de moeda/pontos do
          Streamlabs em CSV (uma coluna com o nome/login e outra com os pontos) e
          envie aqui. Reenviar o mesmo arquivo não duplica pontos.
          {channel.platform === "TWITCH" ? (
            <>
              {" "}
              Na Twitch os usuários são casados automaticamente pelo login.
            </>
          ) : (
            <>
              {" "}
              No YouTube o nome não é único, então os pontos ficam pendentes e são
              creditados quando cada pessoa aparecer no chat ou na sua página.
            </>
          )}
        </p>
        <form action={importStreamlabs} className="flex flex-wrap items-center gap-4">
          <input
            type="file"
            name="file"
            required
            accept="text/csv,.csv"
            className="block w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm"
          />
          <button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">
            Importar pontos
          </button>
        </form>
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-violet-300">
          Importar CSV
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Use o mesmo tipo e cabeçalhos gerados pelos botões de exportação.
        </p>
        <form action={importCsv} className="grid gap-4 sm:grid-cols-[180px_1fr_auto]">
          <select name="type" className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
            {exports.map(([label, type]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>
          <input
            type="file"
            name="file"
            required
            accept="text/csv,.csv"
            className="block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm"
          />
          <button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">
            Importar CSV
          </button>
        </form>
      </section>
    </div>
  );
}
