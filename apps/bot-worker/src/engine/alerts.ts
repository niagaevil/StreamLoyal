import { prisma } from "@streamloyal/db";

export async function emitAlert(input: {
  channelId: string;
  type: string;
  userName?: string | null;
  message: string;
  amount?: number | null;
  imageUrl?: string | null;
  soundUrl?: string | null;
  sourceKey?: string | null;
}) {
  const settings = await prisma.alertSettings.findUnique({
    where: { channelId: input.channelId },
  });
  if (settings && !settings.enabled) return;
  if (
    settings &&
    ((input.type === "follow" && !settings.followsEnabled) ||
      (["member", "subscription", "gift"].includes(input.type) &&
        !settings.membershipsEnabled) ||
      (["super_chat", "super_sticker", "bits"].includes(input.type) &&
        !settings.paidEnabled) ||
      (input.type === "raid" && !settings.raidsEnabled) ||
      (input.type === "redemption" && !settings.redemptionsEnabled))
  ) {
    return;
  }
  if (
    input.sourceKey &&
    (await prisma.alertEvent.findFirst({
      where: { sourceKey: input.sourceKey },
      select: { id: true },
    }))
  ) {
    return;
  }
  await prisma.alertEvent
    .create({
      data: {
        channelId: input.channelId,
        type: input.type,
        userName: input.userName,
        message: input.message.slice(0, 500),
        amount: input.amount,
        imageUrl: input.imageUrl,
        soundUrl: input.soundUrl ?? settings?.soundUrl,
        sourceKey: input.sourceKey,
      },
    })
    .catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return null;
      }
      throw error;
    });
}
