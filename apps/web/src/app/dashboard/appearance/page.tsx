import { revalidatePath } from "next/cache";
import { prisma } from "@streamloyal/db";
import { requireMyChannel } from "@/lib/channel";

async function saveTheme(formData: FormData) {
  "use server";
  const channel = await requireMyChannel();

  const str = (name: string) => String(formData.get(name) ?? "").trim() || null;

  await prisma.storeTheme.update({
    where: { channelId: channel.id },
    data: {
      accentColor: str("accentColor") ?? "#7c3aed",
      layout: str("layout") ?? "grid",
      bannerUrl: str("bannerUrl"),
      logoUrl: str("logoUrl"),
      headline: str("headline"),
      about: str("about"),
    },
  });
  revalidatePath("/dashboard/appearance");
}

export default async function AppearancePage() {
  const channel = await requireMyChannel();
  const t = channel.storeTheme!;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Aparência da página</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Personalize como sua página pública (/c/{channel.slug}) aparece para os
        espectadores.
      </p>

      <form action={saveTheme} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Cor de destaque
            </span>
            <input
              name="accentColor"
              type="color"
              defaultValue={t.accentColor}
              className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Layout</span>
            <select
              name="layout"
              defaultValue={t.layout}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            >
              <option value="grid">Grade</option>
              <option value="list">Lista</option>
              <option value="compact">Compacto</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Título da página (headline)
          </span>
          <input
            name="headline"
            defaultValue={t.headline ?? ""}
            placeholder={`Loja de pontos de ${channel.title}`}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Sobre</span>
          <textarea
            name="about"
            rows={3}
            defaultValue={t.about ?? ""}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              URL do banner
            </span>
            <input
              name="bannerUrl"
              defaultValue={t.bannerUrl ?? ""}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              URL do logo
            </span>
            <input
              name="logoUrl"
              defaultValue={t.logoUrl ?? ""}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
          </label>
        </div>
        <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 font-semibold transition-colors">
          Salvar aparência
        </button>
      </form>
    </div>
  );
}
