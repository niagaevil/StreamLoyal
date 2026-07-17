import { prisma } from "@streamloyal/db";
import { auth } from "@/lib/auth";

/** Retorna o canal do usuário logado (ou null). */
export async function getMyChannel() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.channel.findUnique({
    where: { ownerId: session.user.id },
    include: { loyaltySettings: true, storeTheme: true },
  });
}

/** Exige sessão + canal; lança se não houver. */
export async function requireMyChannel() {
  const channel = await getMyChannel();
  if (!channel) throw new Error("NO_CHANNEL");
  return channel;
}
