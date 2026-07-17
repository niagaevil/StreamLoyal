import { prisma } from "@streamloyal/db";
import { ChatActions } from "./types";

interface TimerState {
  chatLines: number;
  // timerId -> { lastFiredAt, linesAtLastFire }
  fired: Map<string, { at: number; lines: number }>;
}

const states = new Map<string, TimerState>();

function getState(channelId: string): TimerState {
  let st = states.get(channelId);
  if (!st) {
    st = { chatLines: 0, fired: new Map() };
    states.set(channelId, st);
  }
  return st;
}

/** Conta uma linha de chat (condição de atividade dos timers). */
export function onChatLine(channelId: string) {
  getState(channelId).chatLines += 1;
}

/** Dispara os timers vencidos do canal (chamar periodicamente no loop). */
export async function tickTimers(channelId: string, actions: ChatActions) {
  const timers = await prisma.chatTimer.findMany({
    where: { channelId, enabled: true },
  });
  if (timers.length === 0) return;

  const st = getState(channelId);
  const now = Date.now();

  for (const timer of timers) {
    const info = st.fired.get(timer.id) ?? { at: now, lines: st.chatLines };
    if (!st.fired.has(timer.id)) st.fired.set(timer.id, info);

    const dueByTime = now - info.at >= timer.intervalMin * 60_000;
    const dueByLines = st.chatLines - info.lines >= timer.minChatLines;
    if (dueByTime && dueByLines) {
      st.fired.set(timer.id, { at: now, lines: st.chatLines });
      try {
        await actions.send(timer.message.slice(0, 480));
      } catch (err) {
        console.error(`[timers] falha ao enviar timer no canal ${channelId}`, err);
      }
    }
  }
}

/** Limpa o estado de timers de uma live encerrada. */
export function clearTimerState(channelId: string) {
  states.delete(channelId);
}
