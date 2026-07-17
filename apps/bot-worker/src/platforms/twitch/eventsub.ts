const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";

export interface TwitchChatEvent {
  messageId: string;
  userId: string;
  login: string;
  displayName: string;
  text: string;
  isModerator: boolean;
  isSubscriber: boolean;
}

export interface TwitchEventHandlers {
  onChatMessage(e: TwitchChatEvent): void;
  onFollow(userId: string, displayName: string): void;
  onSub(userId: string, displayName: string, messageId: string): void;
  onGiftSub(
    userId: string | null,
    displayName: string | null,
    total: number,
    messageId: string
  ): void;
  onCheer(
    userId: string | null,
    displayName: string | null,
    bits: number,
    messageId: string
  ): void;
  onRaid(
    fromUserId: string,
    fromDisplayName: string,
    viewers: number,
    messageId: string
  ): void;
}

interface EventSubMessage {
  metadata: {
    message_id: string;
    message_type: string;
    subscription_type?: string;
  };
  payload: {
    session?: {
      id: string;
      keepalive_timeout_seconds?: number;
      reconnect_url?: string;
    };
    subscription?: { type: string };
    event?: Record<string, unknown>;
  };
}

/**
 * Cliente EventSub via WebSocket para um canal Twitch.
 * Usa o token do próprio streamer (broadcaster é moderador de si mesmo).
 */
export class TwitchEventSubClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveMs = 70_000;

  constructor(
    private broadcasterId: string,
    private getToken: () => Promise<string | null>,
    private handlers: TwitchEventHandlers,
    private label: string
  ) {}

  start() {
    this.stopped = false;
    this.connect(EVENTSUB_WS_URL);
  }

  stop() {
    this.stopped = true;
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.ws?.close();
    this.ws = null;
  }

  private connect(url: string) {
    if (this.stopped) return;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener("message", (ev) => {
      void this.onMessage(String(ev.data), ws);
    });
    ws.addEventListener("close", () => {
      if (this.stopped || this.ws !== ws) return;
      console.log(`[eventsub] ${this.label}: conexão fechada, reconectando…`);
      setTimeout(() => this.connect(EVENTSUB_WS_URL), 5_000);
    });
    ws.addEventListener("error", () => {
      // o evento close cuida da reconexão
    });
  }

  private bumpKeepalive() {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      if (this.stopped) return;
      console.log(`[eventsub] ${this.label}: keepalive perdido, reconectando…`);
      this.ws?.close();
    }, this.keepaliveMs);
  }

  private async onMessage(raw: string, ws: WebSocket) {
    let msg: EventSubMessage;
    try {
      msg = JSON.parse(raw) as EventSubMessage;
    } catch {
      return;
    }
    this.bumpKeepalive();

    switch (msg.metadata.message_type) {
      case "session_welcome": {
        const session = msg.payload.session!;
        if (session.keepalive_timeout_seconds) {
          this.keepaliveMs = (session.keepalive_timeout_seconds + 15) * 1000;
        }
        await this.subscribeAll(session.id);
        break;
      }
      case "session_reconnect": {
        const url = msg.payload.session?.reconnect_url;
        if (url) {
          const old = this.ws;
          this.ws = null; // evita reconexão dupla pelo close do socket antigo
          this.connect(url);
          old?.close();
        }
        break;
      }
      case "notification":
        this.dispatch(
          msg.payload.subscription?.type ?? "",
          msg.payload.event ?? {},
          msg.metadata.message_id
        );
        break;
      case "revocation":
        console.error(
          `[eventsub] ${this.label}: assinatura revogada (${msg.payload.subscription?.type}) — verifique os escopos`
        );
        break;
      default:
        break; // keepalive
    }
    void ws;
  }

  private async subscribeAll(sessionId: string) {
    const token = await this.getToken();
    if (!token) {
      console.error(`[eventsub] ${this.label}: sem token para assinar eventos`);
      return;
    }
    const b = this.broadcasterId;
    const subs: { type: string; version: string; condition: Record<string, string> }[] = [
      {
        type: "channel.chat.message",
        version: "1",
        condition: { broadcaster_user_id: b, user_id: b },
      },
      {
        type: "channel.follow",
        version: "2",
        condition: { broadcaster_user_id: b, moderator_user_id: b },
      },
      { type: "channel.subscribe", version: "1", condition: { broadcaster_user_id: b } },
      {
        type: "channel.subscription.message",
        version: "1",
        condition: { broadcaster_user_id: b },
      },
      {
        type: "channel.subscription.gift",
        version: "1",
        condition: { broadcaster_user_id: b },
      },
      { type: "channel.cheer", version: "1", condition: { broadcaster_user_id: b } },
      { type: "channel.raid", version: "1", condition: { to_broadcaster_user_id: b } },
    ];

    for (const sub of subs) {
      const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": process.env.AUTH_TWITCH_ID!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...sub,
          transport: { method: "websocket", session_id: sessionId },
        }),
      });
      if (!res.ok && res.status !== 409) {
        console.error(
          `[eventsub] ${this.label}: falha ao assinar ${sub.type} (${res.status})`
        );
      }
    }
    console.log(`[eventsub] ${this.label}: eventos assinados`);
  }

  private dispatch(
    type: string,
    e: Record<string, unknown>,
    messageId: string
  ) {
    const str = (k: string) => (typeof e[k] === "string" ? (e[k] as string) : "");
    const num = (k: string) => (typeof e[k] === "number" ? (e[k] as number) : 0);

    switch (type) {
      case "channel.chat.message": {
        const badges = Array.isArray(e.badges)
          ? (e.badges as { set_id: string }[])
          : [];
        const has = (id: string) => badges.some((x) => x.set_id === id);
        const message = e.message as { text?: string } | undefined;
        this.handlers.onChatMessage({
          messageId: str("message_id"),
          userId: str("chatter_user_id"),
          login: str("chatter_user_login"),
          displayName: str("chatter_user_name") || str("chatter_user_login"),
          text: message?.text ?? "",
          isModerator: has("moderator") || has("broadcaster"),
          isSubscriber: has("subscriber") || has("founder"),
        });
        break;
      }
      case "channel.follow":
        this.handlers.onFollow(
          str("user_id"),
          str("user_name") || str("user_login")
        );
        break;
      case "channel.subscribe":
      case "channel.subscription.message":
        this.handlers.onSub(
          str("user_id"),
          str("user_name") || str("user_login"),
          messageId
        );
        break;
      case "channel.subscription.gift": {
        const anonymous = e.is_anonymous === true;
        this.handlers.onGiftSub(
          anonymous ? null : str("user_id"),
          anonymous ? null : str("user_name") || str("user_login"),
          num("total") || 1,
          messageId
        );
        break;
      }
      case "channel.cheer": {
        const anonymous = e.is_anonymous === true;
        this.handlers.onCheer(
          anonymous ? null : str("user_id"),
          anonymous ? null : str("user_name") || str("user_login"),
          num("bits"),
          messageId
        );
        break;
      }
      case "channel.raid":
        this.handlers.onRaid(
          str("from_broadcaster_user_id"),
          str("from_broadcaster_user_name") ||
            str("from_broadcaster_user_login"),
          num("viewers"),
          messageId
        );
        break;
      default:
        break;
    }
  }
}
