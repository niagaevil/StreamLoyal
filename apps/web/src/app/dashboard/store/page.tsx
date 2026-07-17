import { revalidatePath } from "next/cache";
import { prisma, ItemType } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

async function createItem(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = (String(formData.get("type")) as ItemType) || "PERK";
  const cost = Math.max(1, parseInt(String(formData.get("cost") ?? "100"), 10) || 100);
  const stockRaw = String(formData.get("stock") ?? "").trim();
  const stock = stockRaw === "" ? null : Math.max(0, parseInt(stockRaw, 10) || 0);
  const codes = String(formData.get("codes") ?? "")
    .split("\n")
    .map((c) => c.trim())
    .filter(Boolean);
  const soundUrlRaw = String(formData.get("soundUrl") ?? "").trim();
  const soundUrl =
    type === "SOUND" && /^https:\/\/\S+$/i.test(soundUrlRaw) ? soundUrlRaw : null;

  const maxOrder = await prisma.storeItem.aggregate({
    where: { channelId: channel.id },
    _max: { sortOrder: true },
  });

  await prisma.storeItem.create({
    data: {
      channelId: channel.id,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      type,
      cost,
      stock: type === "CODE" ? codes.length : stock,
      userCooldownSec:
        (parseInt(String(formData.get("userCooldownMin") ?? "0"), 10) || 0) * 60,
      globalCooldownSec:
        (parseInt(String(formData.get("globalCooldownMin") ?? "0"), 10) || 0) * 60,
      imageUrl: String(formData.get("imageUrl") ?? "").trim() || null,
      soundUrl,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      codes: codes.length
        ? { createMany: { data: codes.map((code) => ({ code })) } }
        : undefined,
    },
  });
  revalidatePath("/dashboard/store");
}

async function toggleItem(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const item = await prisma.storeItem.findFirst({
    where: { id, channelId: channel.id },
  });
  if (!item) return;
  await prisma.storeItem.update({
    where: { id },
    data: { isActive: !item.isActive },
  });
  revalidatePath("/dashboard/store");
}

async function toggleFeatured(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  const item = await prisma.storeItem.findFirst({
    where: { id, channelId: channel.id },
  });
  if (!item) return;
  await prisma.storeItem.update({
    where: { id },
    data: { isFeatured: !item.isFeatured },
  });
  revalidatePath("/dashboard/store");
}

async function deleteItem(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();
  const id = String(formData.get("id"));
  await prisma.storeItem.deleteMany({ where: { id, channelId: channel.id } });
  revalidatePath("/dashboard/store");
}

const TYPE_LABEL: Record<string, string> = {
  PERK: "Perk",
  SOUND: "Som",
  CODE: "Código",
};

export default async function StorePage() {
  const channel = await requireMyChannel();
  const items = await prisma.storeItem.findMany({
    where: { channelId: channel.id },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { redemptions: true } } },
  });
  const currency = channel.loyaltySettings?.currencyName ?? "pontos";

  return (
    <div className="max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold">Loja de recompensas</h1>

      <div className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="mb-4 font-semibold text-violet-300">Nova recompensa</h2>
        <form action={createItem} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Nome</span>
            <input
              name="name"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Tipo</span>
            <select
              name="type"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            >
              <option value="PERK">Perk (benefício)</option>
              <option value="SOUND">Efeito sonoro</option>
              <option value="CODE">Código / chave</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">Descrição</span>
            <input
              name="description"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Custo ({currency})
            </span>
            <input
              name="cost"
              type="number"
              defaultValue={100}
              min={1}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Estoque (vazio = ilimitado)
            </span>
            <input
              name="stock"
              type="number"
              min={0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Cooldown por usuário (min)
            </span>
            <input
              name="userCooldownMin"
              type="number"
              defaultValue={0}
              min={0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Cooldown global (min)
            </span>
            <input
              name="globalCooldownMin"
              type="number"
              defaultValue={0}
              min={0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">
              URL da imagem (opcional)
            </span>
            <input
              name="imageUrl"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">
              URL do som (para tipo Efeito sonoro: link https de um .mp3/.ogg,
              tocado no overlay de alertas ao resgatar)
            </span>
            <input
              name="soundUrl"
              type="url"
              placeholder="https://exemplo.com/som.mp3"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm text-zinc-300">
              Códigos (para tipo Código: um por linha, entregues automaticamente)
            </span>
            <textarea
              name="codes"
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 font-semibold transition-colors sm:col-span-2">
            Criar recompensa
          </button>
        </form>
      </div>

      <h2 className="mb-4 font-semibold">Recompensas ({items.length})</h2>
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nenhuma recompensa ainda. Crie a primeira acima.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-4 rounded-xl border p-4 ${
              item.isActive
                ? "border-zinc-800 bg-zinc-900/50"
                : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.name}</span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                  {TYPE_LABEL[item.type]}
                </span>
                {item.isFeatured && (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                    Destaque
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                {item.cost} {currency} ·{" "}
                {item.stock === null ? "estoque ilimitado" : `${item.stock} restantes`}{" "}
                · {item._count.redemptions} resgates
                {item.type === "SOUND" &&
                  (item.soundUrl ? " · som configurado" : " · sem som configurado")}
              </p>
            </div>
            <form action={toggleFeatured}>
              <input type="hidden" name="id" value={item.id} />
              <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:border-amber-400 transition-colors">
                {item.isFeatured ? "Tirar destaque" : "Destacar"}
              </button>
            </form>
            <form action={toggleItem}>
              <input type="hidden" name="id" value={item.id} />
              <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:border-violet-400 transition-colors">
                {item.isActive ? "Desativar" : "Ativar"}
              </button>
            </form>
            <form action={deleteItem}>
              <input type="hidden" name="id" value={item.id} />
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
