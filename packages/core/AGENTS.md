# packages/core — regras de negócio transacionais

## Propósito

Lógica independente de plataforma consumida por `apps/web` e `apps/bot-worker`
(importada como TypeScript direto; sem build próprio).

## Módulos

- `errors.ts` — `DomainError` / `InsufficientPointsError` e helpers (`matchDomainCode`).
  Erros de domínio usam classes tipadas; nunca comparar `error.message` com strings.
- `points.ts` — `awardPoints` / `applyPointsDelta` (delta + ledger, atômico, idempotente),
  `transferPoints` (débito condicional + crédito na mesma transação), `ensureViewer`
  (ao criar um espectador novo, aplica pontos importados pendentes por nome) e
  `applyPendingImport` (credita + apaga `PendingPointsImport` na mesma `$transaction`).
- `redeem.ts` — `redeemItem` (valida bloqueio/saldo/estoque/cooldowns; claim condicional
  de código; aborta via `RedeemAbort` para reverter escritas parciais) e `refundRedemption`.
- `engagement.ts` — jogos de azar (`playChanceGame`, `resolveChanceGame`), duelo,
  sorteios (`enterGiveaway`, `drawGiveaway` com `selectWeightedIndex`), enquetes,
  apostas (`placeBet`, `settleBettingRound`) e Media Share (`queueMedia`, `voteSkipMedia`).
- `crypto.ts` — `encryptSecret`/`decryptSecret` (AES-256-GCM, prefixo `enc:v1:`, chave
  `TOKEN_ENCRYPTION_KEY`). Sem rotação multi-chave ainda: trocar a chave exige
  recriptografar tokens existentes (ou estender o decrypt para aceitar chaves antigas).
- `slug.ts` — geração de slug de canal.

## Contratos locais

- Toda função que mexe em pontos roda em `prisma.$transaction` e grava `PointLedger`.
- Débitos sempre condicionais (`updateMany` com `points: { gte: valor }`); nunca
  ler saldo e decrementar em passos separados. Sob alta contenção na mesma linha de
  `ViewerProfile`, o Postgres serializa via row lock (latência, não saldo negativo).
- Erros de domínio: lançar `DomainError` / subclasses; APIs públicas mapeiam para
  `{ ok: false, error: "CODIGO" }`. Violação de `idempotencyKey` (P2002) é
  tratada como duplicata silenciosa, não exceção.
- Funções que recebem aleatoriedade aceitam `random` como parâmetro para testes.

## Verificação

`pnpm --filter @streamloyal/core test` (vitest: `crypto.test.ts`, `engagement.test.ts`).
Novas regras puras devem ganhar teste no mesmo padrão.
