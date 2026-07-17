import { prisma } from "@streamloyal/db";
import { decryptSecret, encryptSecret } from "@streamloyal/core";

/** Access token Twitch válido do dono do canal, renovando se preciso. */
export async function getTwitchAccessToken(
  ownerId: string
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId: ownerId, provider: "twitch" },
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

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_TWITCH_ID!,
      client_secret: process.env.AUTH_TWITCH_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    console.error(`[tokens] falha ao renovar token Twitch do user ${ownerId}`);
    return null;
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: encryptSecret(data.access_token),
      refresh_token: encryptSecret(data.refresh_token ?? refreshToken),
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    },
  });
  return data.access_token;
}
