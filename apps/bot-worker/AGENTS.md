# apps/bot-worker — processo persistente do bot

## Propósito

Processo Node (tsx) que detecta lives, lê o chat, credita pontos, executa
comandos/timers/moderação e emite alertas para YouTube e Twitch.

## Estrutura

- `src/index.ts` — orquestrador: tick de detecção de live a cada 2 min, inicia um
  loop por canal ao vivo, health server (`:3001/health` e `/metrics`) e shutdown gracioso.
- `src/lease.ts` — lease distribuído por canal na tabela `WorkerLease` (renova a 30s,
  expira em 90s). Todo loop de canal precisa adquirir o lease; permite múltiplas réplicas.
- `src/engine/` — chat engine agnóstico de plataforma. Pipeline por mensagem:
  moderação → atividade de timers → comandos (`processChatMessage` em `index.ts`).
  - `types.ts`: `IncomingChatMessage`, `ChannelContext`, `ChatActions` (enviar/apagar/timeout).
  - `commands.ts`: comandos padrão e personalizados; loga uso em `CommandLog`.
  - `engagement.ts`: comandos de jogos/sorteios/enquetes/apostas/media (delegam ao core).
  - `moderation.ts`, `timers.ts`, `alerts.ts` (`emitAlert` idempotente por `sourceKey`).
- `src/platforms/youtube/` — polling do chat (`chat.ts`), detecção de live (`live.ts`),
  tokens (`tokens.ts`, inclui bot dedicado via `BotConnection`).
- `src/platforms/twitch/` — EventSub WebSocket (`eventsub.ts`), Helix (`helix.ts`,
  inclui Get Chatters para lurkers), loop do canal (`loop.ts`), tokens (`tokens.ts`).

## Contratos locais

- Regra de negócio (pontos, resgates, jogos) fica no `@streamloyal/core`, nunca nos adapters.
- Adapters só normalizam eventos para o engine e implementam `ChatActions`.
- Novo adaptador de plataforma = nova pasta em `src/platforms/` implementando o mesmo
  contrato + dispatch em `src/index.ts` e no tick de live.
- Crédito por evento de plataforma sempre com `idempotencyKey` prefixada
  (ex.: `evt:<messageId>`, `follow:<channelId>:<userId>`).
- Cooldowns e estado de timers são em memória por processo; o lease garante que só
  uma réplica processa cada canal.

## Verificação

`pnpm typecheck` da raiz. Smoke: `pnpm --filter bot-worker start` e
`GET http://localhost:3001/health` deve responder 200 com `status: ok`.
