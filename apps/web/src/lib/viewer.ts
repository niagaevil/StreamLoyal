import { prisma, Platform } from "@streamloyal/db";
import { auth } from "@/lib/auth";

/**
 * Retorna (criando se preciso) o perfil de espectador do usuário logado
 * em um canal. A identidade usa a conta da plataforma do canal (YouTube ou
 * Twitch); contas sem essa vinculação usam uma chave sintética estável.
 */
export async function getOrCreateMyViewerProfile(
  channelId: string,
  platform: Platform
) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) return null;

  const platformUserId =
    (platform === "TWITCH" ? user.twitchUserId : user.ytChannelId) ??
    `site:${user.id}`;

  return prisma.viewerProfile.upsert({
    where: { channelId_platformUserId: { channelId, platformUserId } },
    create: {
      channelId,
      platformUserId,
      displayName: user.name ?? "Espectador",
      avatarUrl: user.image,
    },
    update: { lastSeenAt: new Date() },
  });
}
