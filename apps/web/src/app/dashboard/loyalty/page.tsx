import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

async function saveLoyalty(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();

  const int = (name: string, fallback: number) => {
    const v = parseInt(String(formData.get(name) ?? ""), 10);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };

  const isTwitch = channel.platform === "TWITCH";

  await prisma.loyaltySettings.update({
    where: { channelId: channel.id },
    data: {
      enabled: formData.get("enabled") === "on",
      currencyName:
        String(formData.get("currencyName") ?? "").trim() || "pontos",
      payoutIntervalMin: Math.max(1, int("payoutIntervalMin", 10)),
      pointsPerIntervalActive: int("pointsPerIntervalActive", 10),
      ...(isTwitch
        ? {
            // Twitch
            pointsPerIntervalLurker: int("pointsPerIntervalLurker", 5),
            pointsOnFollow: int("pointsOnFollow", 100),
            pointsOnSub: int("pointsOnSub", 300),
            pointsPerBits100: int("pointsPerBits100", 50),
            pointsOnRaid: int("pointsOnRaid", 200),
            pointsOnGiftGiver: int("pointsOnGiftGiver", 200),
          }
        : {
            // YouTube
            watchEarnEnabled: formData.get("watchEarnEnabled") === "on",
            pointsPerIntervalWatch: int("pointsPerIntervalWatch", 10),
            maxWatchPointsPerStream: int("maxWatchPointsPerStream", 500),
            pointsOnNewMember: int("pointsOnNewMember", 300),
            pointsPerSuperChatUnit: int("pointsPerSuperChatUnit", 50),
            pointsOnSuperSticker: int("pointsOnSuperSticker", 100),
            pointsOnGiftGiver: int("pointsOnGiftGiver", 200),
            pointsOnGiftReceiver: int("pointsOnGiftReceiver", 100),
          }),
    },
  });
  revalidatePath("/dashboard/loyalty");
}

function Field({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export default async function LoyaltyPage() {
  const channel = await requireMyChannel();
  const s = channel.loyaltySettings!;
  const isTwitch = channel.platform === "TWITCH";

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Fidelidade</h1>
      <p className="mb-6 text-sm text-zinc-400">
        A cada {s.payoutIntervalMin} min de live, quem participou do chat ganha{" "}
        {s.pointsPerIntervalActive} {s.currencyName}
        {isTwitch &&
          `; quem está assistindo em silêncio ganha ${s.pointsPerIntervalLurker} ${s.currencyName}`}
        {!isTwitch &&
          s.watchEarnEnabled &&
          `; quem assiste pela sua página ganha ${s.pointsPerIntervalWatch} ${s.currencyName}`}
        .
      </p>

      {isTwitch ? (
        <div className="mb-6 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-200">
          Na Twitch, quem está conectado ao chat ganha pontos{" "}
          <strong>mesmo sem falar</strong> (lista oficial de espectadores).
          Quem participa do chat ganha o valor cheio.
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          O YouTube não informa quem assiste em silêncio. Pontos automáticos
          são creditados a quem <strong>participa do chat</strong> — ou a quem
          assiste logado pela aba <strong>Assistir</strong> da sua página
          (Watch &amp; Earn).
        </div>
      )}

      <form action={saveLoyalty} className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <input
            type="checkbox"
            id="enabled"
            name="enabled"
            defaultChecked={s.enabled}
            className="h-5 w-5 accent-violet-500"
          />
          <label htmlFor="enabled" className="font-medium">
            Sistema de pontos ativado
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nome da moeda"
            name="currencyName"
            defaultValue={s.currencyName}
            hint="Ex.: moedas, estrelas, gemas"
          />
          <Field
            label="Intervalo de pagamento (min)"
            name="payoutIntervalMin"
            defaultValue={s.payoutIntervalMin}
          />
          <Field
            label="Pontos por intervalo (chat ativo)"
            name="pointsPerIntervalActive"
            defaultValue={s.pointsPerIntervalActive}
          />
        </div>

        {isTwitch ? (
          <>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <Field
                label="Pontos por intervalo (assistindo em silêncio)"
                name="pointsPerIntervalLurker"
                defaultValue={s.pointsPerIntervalLurker}
                hint="Lurkers conectados ao chat ganham este valor por intervalo"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Ao seguir o canal"
                name="pointsOnFollow"
                defaultValue={s.pointsOnFollow}
              />
              <Field
                label="Ao assinar (sub) ou renovar"
                name="pointsOnSub"
                defaultValue={s.pointsOnSub}
              />
              <Field
                label="Por 100 bits"
                name="pointsPerBits100"
                defaultValue={s.pointsPerBits100}
              />
              <Field
                label="Ao receber uma raid"
                name="pointsOnRaid"
                defaultValue={s.pointsOnRaid}
                hint="Creditado a quem lidera a raid, se estiver registrado"
              />
              <Field
                label="Quem presenteia subs"
                name="pointsOnGiftGiver"
                defaultValue={s.pointsOnGiftGiver}
              />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="watchEarnEnabled"
                  name="watchEarnEnabled"
                  defaultChecked={s.watchEarnEnabled}
                  className="h-5 w-5 accent-violet-500"
                />
                <label htmlFor="watchEarnEnabled" className="font-medium">
                  Watch &amp; Earn (assistir pela sua página vale pontos)
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Pontos por intervalo assistido"
                  name="pointsPerIntervalWatch"
                  defaultValue={s.pointsPerIntervalWatch}
                />
                <Field
                  label="Teto de pontos por live"
                  name="maxWatchPointsPerStream"
                  defaultValue={s.maxWatchPointsPerStream}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Ao virar membro"
                name="pointsOnNewMember"
                defaultValue={s.pointsOnNewMember}
              />
              <Field
                label="Por unidade de Super Chat"
                name="pointsPerSuperChatUnit"
                defaultValue={s.pointsPerSuperChatUnit}
                hint="Pontos por cada R$1 (ou moeda local) de Super Chat"
              />
              <Field
                label="Super Sticker"
                name="pointsOnSuperSticker"
                defaultValue={s.pointsOnSuperSticker}
              />
              <Field
                label="Quem presenteia membership"
                name="pointsOnGiftGiver"
                defaultValue={s.pointsOnGiftGiver}
              />
              <Field
                label="Quem recebe membership de presente"
                name="pointsOnGiftReceiver"
                defaultValue={s.pointsOnGiftReceiver}
              />
            </div>
          </>
        )}

        <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 font-semibold transition-colors">
          Salvar configurações
        </button>
      </form>
    </div>
  );
}
