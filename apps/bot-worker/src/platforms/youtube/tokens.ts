import { prisma } from "@streamloyal/db";
import { decryptSecret, encryptSecret } from "@streamloyal/core";

/** Access token Google válido do dono do canal, renovando se preciso. */
export async function getStreamerAccessToken(
  ownerId: string
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId: ownerId, provider: "google" },
  });
  if (!account?.access_token) return null;
  const accessToken = decryptSecret(account.access_token);
  const refreshToken = decryptSecret(account.refresh_token);
  if (!accessToken) return null;
  if (
    !account.access_token.startsWith("enc:v1:") ||
    (account.refresh_token && !account.refresh_token.startsWith("enc:v1:"))
  ) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: encryptSecret(accessToken),
        refresh_token: encryptSecret(refreshToken),
      },
    });
  }

  const expiresAt = (account.expires_at ?? 0) * 1000;
  if (expiresAt > Date.now() + 60_000) return accessToken;
  if (!refreshToken) return accessToken;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    console.error(`[tokens] falha ao renovar token Google do user ${ownerId}`);
    return null;
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: encryptSecret(data.access_token),
      refresh_token: encryptSecret(refreshToken),
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    },
  });
  return data.access_token;
}

/** Token da conta de bot personalizada; usa a conta do streamer como fallback. */
export async function getYouTubeBotAccessToken(
  channelId: string,
  ownerId: string
): Promise<string | null> {
  const bot = await prisma.botConnection.findUnique({ where: { channelId } });
  if (!bot || bot.platform !== "YOUTUBE") return getStreamerAccessToken(ownerId);
  const accessToken = decryptSecret(bot.accessToken);
  const refreshToken = decryptSecret(bot.refreshToken);
  if (!accessToken) return getStreamerAccessToken(ownerId);
  if ((bot.expiresAt ?? 0) * 1000 > Date.now() + 60_000) return accessToken;
  if (!refreshToken) return accessToken;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    console.error(`[tokens] falha ao renovar conta de bot do canal ${channelId}`);
    return getStreamerAccessToken(ownerId);
  }
  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  await prisma.botConnection.update({
    where: { id: bot.id },
    data: {
      accessToken: encryptSecret(data.access_token)!,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    },
  });
  return data.access_token;
}
