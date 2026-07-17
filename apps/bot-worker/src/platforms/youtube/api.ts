const BASE = "https://www.googleapis.com/youtube/v3";

/** Envia mensagem no chat da live (em nome do streamer). */
export async function sendChatMessage(
  token: string,
  liveChatId: string,
  text: string
) {
  const res = await fetch(`${BASE}/liveChat/messages?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        liveChatId,
        type: "textMessageEvent",
        textMessageDetails: { messageText: text },
      },
    }),
  });
  if (!res.ok) {
    console.error(`[yt-api] erro ${res.status} ao enviar mensagem`);
  }
}

/** Remove uma mensagem do chat. */
export async function deleteChatMessage(token: string, messageId: string) {
  const res = await fetch(
    `${BASE}/liveChat/messages?id=${encodeURIComponent(messageId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 404) {
    console.error(`[yt-api] erro ${res.status} ao deletar mensagem`);
  }
}

/** Timeout temporário de um usuário no chat. */
export async function timeoutChatUser(
  token: string,
  liveChatId: string,
  userChannelId: string,
  seconds: number
) {
  const res = await fetch(`${BASE}/liveChat/bans?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        liveChatId,
        type: "temporary",
        banDurationSeconds: seconds,
        bannedUserDetails: { channelId: userChannelId },
      },
    }),
  });
  if (!res.ok) {
    console.error(`[yt-api] erro ${res.status} ao aplicar timeout`);
  }
}
