import { Platform } from "@streamloyal/db";

/** Mensagem de chat normalizada, independente da plataforma. */
export interface IncomingChatMessage {
  messageId: string;
  userId: string;
  displayName: string;
  text: string;
  isModerator: boolean;
  /** Membro (YouTube) ou sub (Twitch). */
  isMember: boolean;
}

/** Ações que o adaptador da plataforma executa no chat. */
export interface ChatActions {
  send(text: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  timeoutUser(userId: string, seconds: number, reason?: string): Promise<void>;
}

/** Contexto do canal para o engine. */
export interface ChannelContext {
  channelId: string;
  platform: Platform;
  liveId: string;
}
