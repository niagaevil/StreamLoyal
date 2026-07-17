import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@streamloyal/db";

export async function GET() {
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", base));
  }
  const channel = await prisma.channel.findUnique({
    where: { ownerId: session.user.id },
  });
  if (!channel) {
    return NextResponse.redirect(new URL("/onboarding", base));
  }
  const state = randomBytes(32).toString("base64url");
  const redirectUri = `${base}/api/bot/callback/youtube`;
  const query = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    state,
    scope:
      "openid profile https://www.googleapis.com/auth/youtube.force-ssl",
  });
  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${query}`
  );
  response.cookies.set("bot_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/bot/callback/youtube",
    maxAge: 600,
  });
  return response;
}
