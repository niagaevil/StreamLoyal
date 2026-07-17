# packages/core — regras de negócio transacionais

## Propósito

Lógica independente de plataforma consumida por `apps/web` e `apps/bot-worker`
(importada como TypeScript direto; sem build próprio).

## Módulos

- `points.ts` — `awardPoints` (delta + ledger, atômico, idempotente),
  `transferPoints` (débito condicional + crédito na mesma transação), `ensureViewer`
  (ao criar um espectador novo, aplica pontos importados pendentes por nome) e
  `applyPendingImport` (credita `PendingPointsImport` via ledger, idempotente).
- `redeem.ts` — `redeemItem` (valida bloqueio/saldo/estoque/cooldowns; claim condicional
  de código; aborta via `RedeemAbort` para reverter escritas parciais) e `refundRedemption`.
- `engagement.ts` — jogos de azar (`playChanceGame`, `resolveChanceGame`), duelo,
  sorteios (`enterGiveaway`, `drawGiveaway` com `selectWeightedIndex`), enquetes,
  apostas (`placeBet`, `settleBettingRound`) e Media Share (`queueMedia`, `voteSkipMedia`).
- `crypto.ts` — `encryptSecret`/`decryptSecret` (AES-256-GCM, chave `TOKEN_ENCRYPTION_KEY`
  de 32 bytes hex). Usado para todos os tokens OAuth.
- `slug.ts` — geração de slug de canal.

## Contratos locais

- Toda função que mexe em pontos roda em `prisma.$transaction` e grava `PointLedger`.
- Débitos sempre condicionais (`updateMany` com `points: { gte: valor }`); nunca
  ler saldo e decrementar em passos separados.
- Erros de domínio retornam `{ ok: false, error: "CODIGO" }`; violação de
  `idempotencyKey` (P2002) é tratada como duplicata silenciosa, não exceção.
- Funções que recebem aleatoriedade aceitam `random` como parâmetro para testes.

## Verificação

`pnpm --filter @streamloyal/core test` (vitest: `crypto.test.ts`, `engagement.test.ts`).
Novas regras puras devem ganhar teste no mesmo padrão.
