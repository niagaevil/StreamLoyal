# packages/db — schema Prisma e cliente

## Propósito

Fonte única do modelo de dados (PostgreSQL) e do cliente Prisma compartilhado.
`src/index.ts` exporta o singleton `prisma` e reexporta todos os tipos/enums usados
por web, worker e core.

## Contratos locais

- Mudança de schema: editar `prisma/schema.prisma` e gerar migration versionada com
  `pnpm --filter @streamloyal/db exec prisma migrate dev --name descricao`
  (baseline em `prisma/migrations/0_init`). Não usar `db push` para mudanças novas.
- Novo model ou enum deve ser reexportado em `src/index.ts` na hora.
- Convenções do modelo:
  - Canal tem `platform` (`YOUTUBE`/`TWITCH`) + `platformChannelId`; espectador usa
    `platformUserId` (nunca campos específicos tipo `ytChannelId`).
  - Relações de dados por canal levam `channelId` com `onDelete: Cascade`.
  - `PointLedger.idempotencyKey` é `@unique`; `AlertEvent.sourceKey` é indexado
    (dedupe na aplicação, não no banco).
  - Colunas de token (`Account`, `BotConnection`) guardam valor criptografado.
- `WorkerLease` é o lock distribuído do worker; não remover.

## Verificação

`pnpm --filter @streamloyal/db exec prisma validate` e `prisma migrate status`
(requer `docker compose up -d`). O CI aplica as migrations num banco limpo e falha
se o schema divergir delas.
