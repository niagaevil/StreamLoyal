import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { OverlayKind, prisma } from "@streamloyal/db";
import { awardPoints } from "@streamloyal/core";
import { requireMyChannel } from "@/lib/channel";
import {
  createOverlaySecret,
  overlayTokenHash,
} from "@/lib/overlay-token";

const path = "/dashboard/obs";

async function rotateOverlay(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const kind = String(formData.get("kind")) as OverlayKind;
  if (!["ALERTS", "MEDIA"].includes(kind)) return;
  const secret = createOverlaySecret();
  const id = `ov_${randomBytes(12).toString("hex")}`;
  await prisma.$transaction([
    prisma.overlayAccess.updateMany({
      where: { channelId: channel.id, kind, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.overlayAccess.create({
      data: {
        id,
        channelId: channel.id,
        kind,
        tokenHash: overlayTokenHash(secret),
      },
    }),
  ]);
  const key = kind === "ALERTS" ? "alertsToken" : "mediaToken";
  redirect(`${path}?${key}=${encodeURIComponent(`${id}.${secret}`)}`);
}

async function saveSettings(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const enabled = (name: string) => formData.get(name) === "on";
  const number = (name: string, fallback: number, min: number, max: number) =>
    Math.min(
      max,
      Math.max(min, Number(formData.get(name)) || fallback)
    );
  await prisma.$transaction([
    prisma.alertSettings.upsert({
      where: { channelId: channel.id },
      create: {
        channelId: channel.id,
        enabled: enabled("alertsEnabled"),
        durationSec: number("durationSec", 7, 1, 30),
        volume: number("alertVolume", 80, 0, 100),
        accentColor: String(formData.get("accentColor") ?? "#7c3aed"),
        soundUrl: String(formData.get("soundUrl") ?? "").trim() || null,
        template:
          String(formData.get("template") ?? "").trim() ||
          "{message}",
        followsEnabled: enabled("followsEnabled"),
        membershipsEnabled: enabled("membershipsEnabled"),
        paidEnabled: enabled("paidEnabled"),
        raidsEnabled: enabled("raidsEnabled"),
        redemptionsEnabled: enabled("redemptionsEnabled"),
      },
      update: {
        enabled: enabled("alertsEnabled"),
        durationSec: number("durationSec", 7, 1, 30),
        volume: number("alertVolume", 80, 0, 100),
        accentColor: String(formData.get("accentColor") ?? "#7c3aed"),
        soundUrl: String(formData.get("soundUrl") ?? "").trim() || null,
        template:
          String(formData.get("template") ?? "").trim() ||
          "{message}",
        followsEnabled: enabled("followsEnabled"),
        membershipsEnabled: enabled("membershipsEnabled"),
        paidEnabled: enabled("paidEnabled"),
        raidsEnabled: enabled("raidsEnabled"),
        redemptionsEnabled: enabled("redemptionsEnabled"),
      },
    }),
    prisma.mediaSettings.upsert({
      where: { channelId: channel.id },
      create: {
        channelId: channel.id,
        enabled: enabled("mediaEnabled"),
        cost: number("mediaCost", 100, 0, 1_000_000),
        maxDurationSec: number("maxDurationSec", 120, 5, 3600),
        maxQueueSize: number("maxQueueSize", 25, 1, 100),
        volume: number("mediaVolume", 70, 0, 100),
        votesToSkip: number("votesToSkip", 3, 1, 100),
        blacklist: String(formData.get("blacklist") ?? "")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      },
      update: {
        enabled: enabled("mediaEnabled"),
        cost: number("mediaCost", 100, 0, 1_000_000),
        maxDurationSec: number("maxDurationSec", 120, 5, 3600),
        maxQueueSize: number("maxQueueSize", 25, 1, 100),
        volume: number("mediaVolume", 70, 0, 100),
        votesToSkip: number("votesToSkip", 3, 1, 100),
        blacklist: String(formData.get("blacklist") ?? "")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      },
    }),
  ]);
  revalidatePath(path);
}

async function testAlert() {
  "use server";
  const channel = await requireMyChannel();
  await prisma.alertEvent.create({
    data: {
      channelId: channel.id,
      type: "test",
      userName: "Teste",
      message: "Alerta de teste do StreamLoyal!",
    },
  });
  revalidatePath(path);
}

async function rejectMedia(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const item = await prisma.mediaQueueItem.findFirst({
    where: { id, channelId: channel.id, status: "PENDING" },
  });
  if (!item) return;
  await prisma.mediaQueueItem.update({
    where: { id: item.id },
    data: { status: "REJECTED", playedAt: new Date() },
  });
  if (item.viewerId && item.cost > 0) {
    await awardPoints({
      channelId: channel.id,
      viewerId: item.viewerId,
      delta: item.cost,
      reason: "REFUND",
      refId: item.id,
      idempotencyKey: `media-refund:${item.id}`,
    });
  }
  revalidatePath(path);
}

const field =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none";

export default async function ObsPage({
  searchParams,
}: {
  searchParams: Promise<{ alertsToken?: string; mediaToken?: string }>;
}) {
  const channel = await requireMyChannel();
  const query = await searchParams;
  const [alerts, media, queue, accesses] = await Promise.all([
    prisma.alertSettings.findUnique({ where: { channelId: channel.id } }),
    prisma.mediaSettings.findUnique({ where: { channelId: channel.id } }),
    prisma.mediaQueueItem.findMany({
      where: {
        channelId: channel.id,
        status: { in: ["PENDING", "PLAYING"] },
      },
      include: { viewer: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.overlayAccess.findMany({
      where: { channelId: channel.id, revokedAt: null },
    }),
  ]);
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  const alertUrl = query.alertsToken
    ? `${base}/overlay/${query.alertsToken}/alerts`
    : null;
  const mediaUrl = query.mediaToken
    ? `${base}/overlay/${query.mediaToken}/media`
    : null;
  const hasAlerts = accesses.some((access) => access.kind === "ALERTS");
  const hasMedia = accesses.some((access) => access.kind === "MEDIA");

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">OBS, alertas e Media Share</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Gere URLs privadas de Browser Source. Ao rotacionar, a URL anterior
          deixa de funcionar imediatamente.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-violet-300">
          URLs do Browser Source
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            ["ALERTS", "Alertas", alertUrl, hasAlerts],
            ["MEDIA", "Media Share", mediaUrl, hasMedia],
          ].map(([kind, label, url, exists]) => (
            <div key={String(kind)} className="rounded-xl bg-zinc-950/60 p-4">
              <b>{label}</b>
              {url ? (
                <>
                  <input readOnly value={String(url)} className={`${field} mt-3`} />
                  <p className="mt-2 text-xs text-amber-300">
                    Copie agora: por segurança esta URL só é exibida uma vez.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
                  {exists
                    ? "URL ativa. Rotacione se perdeu a cópia."
                    : "Nenhuma URL ativa."}
                </p>
              )}
              <form action={rotateOverlay} className="mt-3">
                <input type="hidden" name="kind" value={String(kind)} />
                <button className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-violet-400">
                  {exists ? "Rotacionar URL" : "Gerar URL"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <form
        action={saveSettings}
        className="grid gap-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 lg:grid-cols-2"
      >
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-violet-300">Alertas</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="alertsEnabled"
              defaultChecked={alerts?.enabled ?? true}
              className="accent-violet-500"
            />
            Ativados
          </label>
          <input name="durationSec" type="number" min={1} max={30} defaultValue={alerts?.durationSec ?? 7} placeholder="Duração (s)" className={field} />
          <input name="alertVolume" type="number" min={0} max={100} defaultValue={alerts?.volume ?? 80} placeholder="Volume" className={field} />
          <input name="accentColor" type="color" defaultValue={alerts?.accentColor ?? "#7c3aed"} className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-1" />
          <input name="soundUrl" type="url" defaultValue={alerts?.soundUrl ?? ""} placeholder="URL de som padrão (HTTPS)" className={field} />
          <input
            name="template"
            defaultValue={alerts?.template ?? "{message}"}
            placeholder="{user}: {message} ({amount})"
            className={field}
          />
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["followsEnabled", "Follows", alerts?.followsEnabled ?? true],
              ["membershipsEnabled", "Membros/subs/gifts", alerts?.membershipsEnabled ?? true],
              ["paidEnabled", "Super Chat/bits", alerts?.paidEnabled ?? true],
              ["raidsEnabled", "Raids", alerts?.raidsEnabled ?? true],
              ["redemptionsEnabled", "Resgates", alerts?.redemptionsEnabled ?? true],
            ].map(([name, label, checked]) => (
              <label key={String(name)} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name={String(name)}
                  defaultChecked={Boolean(checked)}
                  className="accent-violet-500"
                />
                {label}
              </label>
            ))}
          </div>
          <button formAction={testAlert} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-violet-400">
            Enviar alerta de teste
          </button>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-violet-300">Media Share</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="mediaEnabled"
              defaultChecked={media?.enabled ?? false}
              className="accent-violet-500"
            />
            Ativado (!media / !sr)
          </label>
          <input name="mediaCost" type="number" min={0} defaultValue={media?.cost ?? 100} placeholder="Custo em pontos" className={field} />
          <input name="maxDurationSec" type="number" min={5} max={3600} defaultValue={media?.maxDurationSec ?? 120} placeholder="Duração máxima (s)" className={field} />
          <input name="maxQueueSize" type="number" min={1} max={100} defaultValue={media?.maxQueueSize ?? 25} placeholder="Tamanho máximo da fila" className={field} />
          <input name="mediaVolume" type="number" min={0} max={100} defaultValue={media?.volume ?? 70} placeholder="Volume" className={field} />
          <input name="votesToSkip" type="number" min={1} defaultValue={media?.votesToSkip ?? 3} placeholder="Votos para pular" className={field} />
          <textarea name="blacklist" rows={3} defaultValue={media?.blacklist.join("\n") ?? ""} placeholder="Blacklist: termos/IDs, um por linha" className={field} />
        </section>
        <button className="rounded-xl bg-violet-600 px-6 py-3 font-semibold hover:bg-violet-500 lg:col-span-2">
          Salvar configurações
        </button>
      </form>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Fila de mídia ({queue.length})</h2>
        <div className="space-y-2">
          {queue.length === 0 && (
            <p className="text-sm text-zinc-500">Nenhum vídeo na fila.</p>
          )}
          {queue.map((item, index) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
              <span className="text-violet-300">{index + 1}</span>
              <a href={item.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                {item.title ?? item.videoId}
              </a>
              <span className="text-xs text-zinc-500">
                {item.viewer?.displayName ?? "painel"} · {item.status}
              </span>
              {item.status === "PENDING" && (
                <form action={rejectMedia}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="rounded border border-red-900 px-2 py-1 text-xs text-red-300">
                    Rejeitar/reembolsar
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
