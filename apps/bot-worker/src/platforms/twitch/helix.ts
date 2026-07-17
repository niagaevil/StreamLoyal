/** Chamada autenticada à API Helix da Twitch. */
export async function helix<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T | null> {
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": process.env.AUTH_TWITCH_ID!,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    if (res.status !== 401 && res.status !== 403) {
      console.error(`[helix] erro ${res.status} em ${path}`);
    }
    return null;
  }
  return (await res.json()) as T;
}

export interface TwitchStream {
  id: string;
  type: string;
}

/** Stream ao vivo do broadcaster (ou null se offline). */
export async function getLiveStream(
  broadcasterId: string,
  token: string
): Promise<TwitchStream | null> {
  const data = await helix<{ data: TwitchStream[] }>(
    `/streams?user_id=${broadcasterId}&first=1`,
    token
  );
  const stream = data?.data?.[0];
  return stream?.type === "live" ? stream : null;
}

/** Envia mensagem no chat (em nome do streamer). */
export async function sendChatMessage(
  broadcasterId: string,
  token: string,
  text: string
) {
  await helix("/chat/messages", token, {
    method: "POST",
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      sender_id: broadcasterId,
      message: text,
    }),
  });
}

/** Remove uma mensagem do chat. */
export async function deleteChatMessage(
  broadcasterId: string,
  token: string,
  messageId: string
) {
  const qs = new URLSearchParams({
    broadcaster_id: broadcasterId,
    moderator_id: broadcasterId,
    message_id: messageId,
  });
  await helix(`/moderation/chat?${qs}`, token, { method: "DELETE" });
}

/** Timeout temporário de um usuário. */
export async function timeoutUser(
  broadcasterId: string,
  token: string,
  userId: string,
  seconds: number,
  reason?: string
) {
  const qs = new URLSearchParams({
    broadcaster_id: broadcasterId,
    moderator_id: broadcasterId,
  });
  await helix(`/moderation/bans?${qs}`, token, {
    method: "POST",
    body: JSON.stringify({
      data: { user_id: userId, duration: seconds, reason },
    }),
  });
}

export interface TwitchChatter {
  user_id: string;
  user_login: string;
  user_name: string;
}

/**
 * Lista de usuários conectados ao chat (inclui lurkers).
 * O broadcaster conta como moderador de si mesmo.
 */
export async function getChatters(
  broadcasterId: string,
  token: string
): Promise<TwitchChatter[]> {
  const chatters: TwitchChatter[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      broadcaster_id: broadcasterId,
      moderator_id: broadcasterId,
      first: "1000",
    });
    if (cursor) qs.set("after", cursor);
    const data = await helix<{
      data: TwitchChatter[];
      pagination?: { cursor?: string };
    }>(`/chat/chatters?${qs}`, token);
    if (!data) break;
    chatters.push(...data.data);
    cursor = data.pagination?.cursor;
  } while (cursor);
  return chatters;
}
