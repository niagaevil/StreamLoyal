import { handleModeration } from "./moderation";
import { handleCommand } from "./commands";
import { onChatLine } from "./timers";
import { ChannelContext, ChatActions, IncomingChatMessage } from "./types";

export { tickTimers, clearTimerState } from "./timers";
export type { ChannelContext, ChatActions, IncomingChatMessage } from "./types";

/**
 * Pipeline completo para uma mensagem de chat:
 * moderação -> contagem para timers -> comandos.
 */
export async function processChatMessage(
  ctx: ChannelContext,
  msg: IncomingChatMessage,
  actions: ChatActions
) {
  try {
    const punished = await handleModeration(ctx.channelId, msg, actions);
    if (punished) return;

    onChatLine(ctx.channelId);

    if (msg.text.startsWith("!")) {
      await handleCommand(ctx, msg, actions);
    }
  } catch (err) {
    console.error(`[engine] erro ao processar mensagem no canal ${ctx.channelId}`, err);
  }
}
