# StreamLoyal — AGENTS.md raiz (DOX)

Plataforma multi-streamer de fidelidade e chatbot para YouTube e Twitch, gratuita:
painel do streamer, loja pública por canal (`/c/[slug]`), pontos, comandos de chat,
moderação, engajamento (sorteios/enquetes/apostas/minigames), overlays OBS e Media Share.

## Contrato DOX

- Antes de editar, leia este arquivo e o `AGENTS.md` mais próximo do caminho alterado.
- Após mudanças relevantes (estrutura, contratos, fluxos, regras), atualize o
  `AGENTS.md` dono da área e este índice se a hierarquia mudar.
- Remova texto obsoleto em vez de acumular histórico.

## Regras do projeto

- Monorepo pnpm + Turborepo. Sempre rode comandos a partir da raiz com filtros
  (`pnpm --filter web ...`) ou tarefas turbo (`pnpm lint|typecheck|test|build`).
- Antes de implementar algo, verifique se já existe para evitar duplicação.
- Multi-tenant: toda leitura/escrita deve ser escopada por `channelId`; no painel,
  sempre via `requireMyChannel()` (`apps/web/src/lib/channel.ts`).
- Toda mutação de pontos passa por transação com linha no `PointLedger`
  (nunca altere `ViewerProfile.points` direto). Débitos usam decremento condicional
  (`updateMany` com `points: { gte: valor }`) para evitar saldo negativo em corrida.
- Operações repetíveis (eventos de plataforma, alertas) usam `idempotencyKey`/`sourceKey`.
- Tokens OAuth são criptografados com AES-256-GCM (`encryptSecret`/`decryptSecret`
  de `@streamloyal/core`); nunca grave token em texto puro.
- Schema muda via migration versionada: `pnpm --filter @streamloyal/db exec prisma migrate dev --name descricao`
  (não use `db push` para mudanças novas).
- Idioma do produto e das mensagens: português.

## Validação global

Da raiz: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
Banco local: `docker compose up -d` antes de comandos Prisma.
Smoke do worker: rodar `pnpm --filter bot-worker start` e conferir `GET :3001/health`.

## Infra e deploy

- Local: `docker-compose.yml` (PostgreSQL 16 + Redis 7).
- Produção: `Dockerfile` multi-stage + `docker-compose.prod.yml`
  (serviço `migrate` roda `prisma migrate deploy` antes de web/worker).
- CI: `.github/workflows/ci.yml` (lint, typecheck, testes, build, migrations num banco limpo).
- Guias operacionais em `docs/` (deploy Linux, OAuth Google/Twitch, operações, privacidade);
  mantenha-os em sincronia ao mudar escopos OAuth, variáveis de ambiente ou fluxo de deploy.

## Índice de DOX filhos

- `apps/web/AGENTS.md` — painel Next.js, loja pública, API routes, overlays OBS, auth.
- `apps/bot-worker/AGENTS.md` — processo persistente: detecção de live, chat engine, adapters YouTube/Twitch, leases.
- `packages/core/AGENTS.md` — regras de negócio transacionais independentes de plataforma.
- `packages/db/AGENTS.md` — schema Prisma, migrations e exportações de tipos.
