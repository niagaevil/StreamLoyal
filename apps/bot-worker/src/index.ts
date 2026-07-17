import "dotenv/config";
import { createServer } from "node:http";
import { prisma, Channel } from "@streamloyal/db";
import { syncLiveState } from "./platforms/youtube/live";
import { pollChat, clearChatState } from "./platforms/youtube/chat";
import { clearTimerState } from "./engine";
import { syncTwitchLiveState } from "./platforms/twitch/live";
import { runTwitchChannelLoop } from "./platforms/twitch/loop";
import {
  acquireLease,
  renewLease,
  releaseLease,
  LEASE_RENEW_MS,
} from "./lease";

const LIVE_CHECK_INTERVAL_MS = 2 * 60_000; // checa live a cada 2 min por canal
const MIN_CHAT_POLL_MS = 5_000;
const MAX_CHAT_POLL_MS = 60_000;

// Canais com loop ativo (evita loops duplicados)
const activeLoops = new Set<string>();
let lastTickAt = 0;
let lastTickOk = false;

async function youtubeChatLoop(
  channelId: string,
  ownerId: string,
  liveId: string
) {
  console.log(`[worker] iniciando leitura de chat (YouTube) do canal ${channelId}`);
  try {
    for (;;) {
      const live = await prisma.liveStream.findUnique({ where: { id: liveId } });
      if (!live || live.status !== "LIVE") break;

      const suggested = await pollChat(channelId, ownerId, live);
      const wait = Math.min(
        Math.max(suggested, MIN_CHAT_POLL_MS),
        MAX_CHAT_POLL_MS
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  } finally {
    clearChatState(liveId);
    clearTimerState(channelId);
  }
}

async function channelLoop(channel: Channel, liveId: string) {
  if (activeLoops.has(channel.id)) return;
  activeLoops.add(channel.id);

  // Lease distribuído: só uma réplica do worker processa cada canal
  if (!(await acquireLease(channel.id))) {
    activeLoops.delete(channel.id);
    return;
  }
  const renewer = setInterval(() => {
    void renewLease(channel.id).then((kept) => {
      if (!kept) {
        console.error(
          `[worker] lease do canal ${channel.slug} perdido para outra réplica`
        );
      }
    });
  }, LEASE_RENEW_MS);

  try {
    if (channel.platform === "TWITCH") {
      console.log(`[worker] iniciando loop Twitch do canal ${channel.slug}`);
      await runTwitchChannelLoop(channel, liveId);
    } else {
      await youtubeChatLoop(channel.id, channel.ownerId, liveId);
    }
  } catch (err) {
    console.error(`[worker] loop do canal ${channel.slug} falhou`, err);
  } finally {
    clearInterval(renewer);
    await releaseLease(channel.id);
    activeLoops.delete(channel.id);
    console.log(`[worker] loop encerrado no canal ${channel.slug}`);
  }
}

async function liveCheckTick() {
  let channels;
  try {
    channels = await prisma.channel.findMany({
      include: { loyaltySettings: true },
    });
  } catch (err) {
    console.error(
      "[worker] banco indisponível, tentando de novo no próximo ciclo",
      err instanceof Error ? err.message : err
    );
    lastTickOk = false;
    lastTickAt = Date.now();
    return;
  }

  for (const channel of channels) {
    try {
      const live =
        channel.platform === "TWITCH"
          ? await syncTwitchLiveState(
              channel.id,
              channel.ownerId,
              channel.platformChannelId
            )
          : await syncLiveState(channel.id, channel.ownerId);
      if (live && !activeLoops.has(channel.id)) {
        void channelLoop(channel, live.id);
      }
    } catch (err) {
      console.error(`[worker] erro ao checar live do canal ${channel.id}`, err);
    }
  }
  lastTickOk = true;
  lastTickAt = Date.now();
}

function startHealthServer() {
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
  createServer((request, response) => {
    if (request.url === "/health") {
      const healthy = lastTickOk && Date.now() - lastTickAt < LIVE_CHECK_INTERVAL_MS * 2;
      response.writeHead(healthy ? 200 : 503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(
        JSON.stringify({
          status: healthy ? "ok" : "degraded",
          lastTickAt: lastTickAt ? new Date(lastTickAt).toISOString() : null,
          activeLoops: activeLoops.size,
          uptimeSec: Math.floor(process.uptime()),
        })
      );
      return;
    }
    if (request.url === "/metrics") {
      const provided = request.headers.authorization;
      if (!process.env.METRICS_TOKEN || provided !== `Bearer ${process.env.METRICS_TOKEN}`) {
        response.writeHead(401).end("unauthorized\n");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/plain; version=0.0.4",
        "Cache-Control": "no-store",
      });
      response.end(
        [
          "# TYPE streamloyal_worker_active_loops gauge",
          `streamloyal_worker_active_loops ${activeLoops.size}`,
          "# TYPE streamloyal_worker_last_tick_ok gauge",
          `streamloyal_worker_last_tick_ok ${lastTickOk ? 1 : 0}`,
          "# TYPE process_uptime_seconds gauge",
          `process_uptime_seconds ${Math.floor(process.uptime())}`,
          "",
        ].join("\n")
      );
      return;
    }
    response.writeHead(404).end("not found\n");
  })
    .listen(port, "0.0.0.0", () => {
      console.log(`[worker] health check em http://0.0.0.0:${port}/health`);
    })
    .on("error", (error) => {
      console.error("[worker] falha ao iniciar health server", error);
    });
}

async function main() {
  console.log("[worker] StreamLoyal bot-worker iniciado (YouTube + Twitch)");
  startHealthServer();
  await liveCheckTick();
  setInterval(() => {
    void liveCheckTick();
  }, LIVE_CHECK_INTERVAL_MS);
}

process.on("unhandledRejection", (err) => {
  console.error("[worker] erro não tratado (processo segue rodando)", err);
});

// Libera os leases no shutdown para outra réplica assumir sem esperar o TTL
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} recebido, liberando leases...`);
  await Promise.all([...activeLoops].map((channelId) => releaseLease(channelId)));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void main();
