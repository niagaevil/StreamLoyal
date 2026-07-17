import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Twitch from "next-auth/providers/twitch";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@streamloyal/db";
import { encryptSecret } from "@streamloyal/core";

// force-ssl cobre leitura + resposta no chat, remoção de mensagens e timeouts
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

// Escopos que permitem ao worker ler chat, chatters, follows, subs, bits e
// raids, além de responder comandos e moderar o chat do próprio streamer
// (o broadcaster é sempre "moderador" de si mesmo).
export const TWITCH_SCOPES = [
  "openid",
  "user:read:email",
  "user:read:chat",
  "user:write:chat",
  "channel:read:subscriptions",
  "bits:read",
  "moderator:read:followers",
  "moderator:read:chatters",
  "moderator:manage:banned_users",
  "moderator:manage:chat_messages",
].join(" ");

const adapter = PrismaAdapter(prisma);
const linkAccount = adapter.linkAccount;
adapter.linkAccount = async (account) => {
  await linkAccount!({
    ...account,
    access_token: encryptSecret(account.access_token) ?? undefined,
    refresh_token: encryptSecret(account.refresh_token) ?? undefined,
    id_token: encryptSecret(account.id_token) ?? undefined,
  });
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  trustHost: true,
  session: { strategy: "database" },
  providers: [
    Google({
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: `openid email profile ${YOUTUBE_SCOPE}`,
        },
      },
    }),
    Twitch({
      authorization: {
        params: { scope: TWITCH_SCOPES },
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    // Ao entrar, descobre a identidade de espectador na plataforma
    // (canal YouTube ou usuário Twitch) para vincular pontos ganhos no chat.
    async signIn({ user, account }) {
      if (!user.id || !account?.access_token) return;

      if (account.provider === "google") {
        try {
          const res = await fetch(
            "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          );
          if (!res.ok) return;
          const data = (await res.json()) as {
            items?: { id: string }[];
          };
          const ch = data.items?.[0];
          if (ch?.id) {
            await prisma.user.update({
              where: { id: user.id },
              data: { ytChannelId: ch.id },
            });
          }
        } catch {
          // sem canal do YouTube — usuário ainda pode usar o site
        }
      }

      if (account.provider === "twitch") {
        try {
          const res = await fetch("https://api.twitch.tv/helix/users", {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              "Client-Id": process.env.AUTH_TWITCH_ID!,
            },
          });
          if (!res.ok) return;
          const data = (await res.json()) as {
            data?: { id: string; login: string }[];
          };
          const tw = data.data?.[0];
          if (tw?.id) {
            await prisma.user.update({
              where: { id: user.id },
              data: { twitchUserId: tw.id, twitchLogin: tw.login },
            });
          }
        } catch {
          // segue sem identidade Twitch
        }
      }
    },
  },
});
