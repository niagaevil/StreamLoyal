import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@streamloyal/db";
import { encryptSecret } from "@streamloyal/core";

function sameState(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/dashboard/bot?error=${encodeURIComponent(reason)}`);
  const session = await auth();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get("bot_oauth_state")?.value;
  if (!session?.user?.id || !code || !state || !expected || !sameState(state, expected)) {
    return fail("oauth_state");
  }
  const channel = await prisma.channel.findUnique({
    where: { ownerId: session.user.id },
    include: { botConnection: true },
  });
  if (!channel) return fail("channel");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${base}/api/bot/callback/youtube`,
    }),
  });
  if (!tokenResponse.ok) return fail("token");
  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const channelResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );
  if (!channelResponse.ok) return fail("youtube");
  const payload = (await channelResponse.json()) as {
    items?: { id: string; snippet: { title: string } }[];
  };
  const bot = payload.items?.[0];
  if (!bot) return fail("no_channel");
  if (channel.platform === "YOUTUBE" && channel.platformChannelId === bot.id) {
    return fail("same_channel");
  }
  await prisma.botConnection.upsert({
    where: { channelId: channel.id },
    create: {
      channelId: channel.id,
      platform: "YOUTUBE",
      platformUserId: bot.id,
      displayName: bot.snippet.title,
      accessToken: encryptSecret(tokens.access_token)!,
      refreshToken: encryptSecret(tokens.refresh_token),
      expiresAt: tokens.expires_in
        ? Math.floor(Date.now() / 1000) + tokens.expires_in
        : null,
    },
    update: {
      platformUserId: bot.id,
      displayName: bot.snippet.title,
      accessToken: encryptSecret(tokens.access_token)!,
      refreshToken:
        encryptSecret(tokens.refresh_token) ?? channel.botConnection?.refreshToken,
      expiresAt: tokens.expires_in
        ? Math.floor(Date.now() / 1000) + tokens.expires_in
        : null,
    },
  });
  const response = NextResponse.redirect(`${base}/dashboard/bot?ok=1`);
  response.cookies.delete("bot_oauth_state");
  return response;
}
