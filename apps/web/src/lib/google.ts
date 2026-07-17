import { prisma } from "@streamloyal/db";
import { decryptSecret, encryptSecret } from "@streamloyal/core";

/**
 * Retorna um access token Google válido para o usuário,
 * renovando via refresh_token quando expirado.
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
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
  if (!res.ok) return null;

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
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

export interface MyYouTubeChannel {
  id: string;
  title: string;
  description: string;
  avatarUrl?: string;
}

/** Busca o canal do YouTube da conta logada. */
export async function fetchMyYouTubeChannel(
  accessToken: string
): Promise<MyYouTubeChannel | null> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: {
      id: string;
      snippet: {
        title: string;
        description: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    }[];
  };
  const ch = data.items?.[0];
  if (!ch) return null;
  return {
    id: ch.id,
    title: ch.snippet.title,
    description: ch.snippet.description,
    avatarUrl:
      ch.snippet.thumbnails?.medium?.url ?? ch.snippet.thumbnails?.default?.url,
  };
}
