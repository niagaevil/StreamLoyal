import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@streamloyal/db";
import { slugify } from "@streamloyal/core";
import { fetchMyYouTubeChannel, getGoogleAccessToken } from "@/lib/google";
import { fetchMyTwitchUser, getTwitchAccessToken } from "@/lib/twitch";

async function uniqueSlug(base: string, fallbackSuffix: string) {
  let slug = slugify(base);
  const taken = await prisma.channel.findUnique({ where: { slug } });
  if (taken) slug = `${slug}-${fallbackSuffix.slice(-6).toLowerCase()}`;
  return slug;
}

async function createYouTubeChannel() {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const existing = await prisma.channel.findUnique({
    where: { ownerId: session.user.id },
  });
  if (existing) redirect("/dashboard");

  const token = await getGoogleAccessToken(session.user.id);
  if (!token) {
    await signIn("google", { redirectTo: "/onboarding" });
    return;
  }

  const yt = await fetchMyYouTubeChannel(token);
  if (!yt) redirect("/?erro=sem-canal");

  await prisma.channel.create({
    data: {
      ownerId: session.user.id,
      platform: "YOUTUBE",
      platformChannelId: yt.id,
      slug: await uniqueSlug(yt.title, yt.id),
      title: yt.title,
      description: yt.description || null,
      avatarUrl: yt.avatarUrl,
      loyaltySettings: { create: {} },
      storeTheme: { create: {} },
    },
  });

  redirect("/dashboard");
}

async function createTwitchChannel() {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const existing = await prisma.channel.findUnique({
    where: { ownerId: session.user.id },
  });
  if (existing) redirect("/dashboard");

  const token = await getTwitchAccessToken(session.user.id);
  if (!token) {
    // Conta ainda sem Twitch vinculada — inicia o OAuth da Twitch
    await signIn("twitch", { redirectTo: "/onboarding" });
    return;
  }

  const tw = await fetchMyTwitchUser(token);
  if (!tw) redirect("/?erro=sem-canal");

  await prisma.channel.create({
    data: {
      ownerId: session.user.id,
      platform: "TWITCH",
      platformChannelId: tw.id,
      platformLogin: tw.login,
      slug: await uniqueSlug(tw.displayName || tw.login, tw.id),
      title: tw.displayName || tw.login,
      description: tw.description || null,
      avatarUrl: tw.avatarUrl,
      loyaltySettings: { create: {} },
      storeTheme: { create: {} },
    },
  });

  redirect("/dashboard");
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const channel = await prisma.channel.findUnique({
    where: { ownerId: session.user.id },
  });
  if (channel) redirect("/dashboard");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <h1 className="mb-3 text-2xl font-bold">Quase lá!</h1>
        <p className="mb-6 text-zinc-400">
          Escolha a plataforma da sua live para criar sua página de pontos e
          lojinha. Você poderá personalizar tudo depois.
        </p>

        <div className="space-y-3">
          <form action={createYouTubeChannel}>
            <button className="w-full rounded-xl bg-red-600 hover:bg-red-500 px-6 py-3 font-semibold transition-colors">
              Vincular canal do YouTube
            </button>
          </form>
          <form action={createTwitchChannel}>
            <button className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-3 font-semibold transition-colors">
              {user?.twitchUserId
                ? "Vincular canal da Twitch"
                : "Conectar conta da Twitch"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          Usamos as APIs oficiais apenas para ler as informações públicas do
          seu canal e o chat das suas lives.
        </p>
      </div>
    </main>
  );
}
