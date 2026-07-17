import { prisma } from "@streamloyal/db";
import { decryptSecret, encryptSecret } from "@streamloyal/core";

/**
 * Retorna um access token Twitch válido para o usuário,
 * renovando via refresh_token quando expirado.
 */
export async function getTwitchAccessToken(
  userId: string
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "twitch" },
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
  if (!res.ok) return null;

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

export interface MyTwitchUser {
  id: string;
  login: string;
  displayName: string;
  description: string;
  avatarUrl?: string;
}

/** Busca o usuário/canal Twitch da conta logada. */
export async function fetchMyTwitchUser(
  accessToken: string
): Promise<MyTwitchUser | null> {
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": process.env.AUTH_TWITCH_ID!,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    data?: {
      id: string;
      login: string;
      display_name: string;
      description: string;
      profile_image_url?: string;
    }[];
  };
  const u = data.data?.[0];
  if (!u) return null;
  return {
    id: u.id,
    login: u.login,
    displayName: u.display_name,
    description: u.description,
    avatarUrl: u.profile_image_url,
  };
}
