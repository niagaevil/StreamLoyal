import { prisma, Platform } from "@streamloyal/db";
import { applyPendingImport } from "@streamloyal/core";
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

  const displayName = user.name ?? "Espectador";
  const existing = await prisma.viewerProfile.findUnique({
    where: { channelId_platformUserId: { channelId, platformUserId } },
    select: { id: true },
  });
  if (existing) {
    return prisma.viewerProfile.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
  }

  const created = await prisma.viewerProfile.create({
    data: {
      channelId,
      platformUserId,
      displayName,
      avatarUrl: user.image,
    },
  });
  // Espectador novo pela loja/site: aplica pontos importados pendentes por nome.
  const applied = await applyPendingImport(channelId, created.id, displayName);
  return applied ?? created;
}
