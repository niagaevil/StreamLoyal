<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# apps/web — painel, loja pública e API

## Propósito

App Next.js (App Router, Turbopack): painel do streamer (`/dashboard/*`), loja e
ranking públicos (`/c/[slug]`), aba Assistir (`/c/[slug]/watch`), overlays OBS
(`/overlay/[token]/*`) e API routes (`/api/*`).

## Contratos locais

- Toda página do painel usa Server Components com server actions co-localizadas
  (`"use server"`), sempre iniciando com `requireMyChannel()` de `src/lib/channel.ts`.
- Após mutação em server action, chame `revalidatePath()` da página afetada.
- Auth: NextAuth v5 em `src/lib/auth.ts` (providers Google e Twitch, adapter Prisma,
  sessões em banco). Tokens são criptografados no `linkAccount`. Mudou escopo OAuth?
  Atualize `docs/google-oauth.md` / `docs/twitch-oauth.md` e avise que exige re-login.
- Refresh de tokens: `src/lib/google.ts` e `src/lib/twitch.ts` (não duplicar essa lógica).
- Identidade de espectador: `getOrCreateMyViewerProfile` em `src/lib/viewer.ts`
  recebe a `Platform` do canal e resolve o `platformUserId` correto.
- Overlays OBS: URLs contêm segredo cujo hash fica em `OverlayAccess`
  (`src/lib/overlay-token.ts`); validação em `/api/overlay/[token]/*`, revogável no painel.
- Rate limiting de rotas públicas via `src/lib/rate-limit.ts` (Redis com fallback
  em memória; o fallback faz sweep de chaves expiradas e limita o tamanho do Map
  para evitar leak se o Redis cair).
- No `signIn` (`auth.ts`), falhas ao buscar identidade YouTube/Twitch são logadas
  com `console.warn` (login segue, mas sem `ytChannelId`/`twitchUserId`).
- Componentes client que dependem de `window` (players, overlays) usam
  `useSyncExternalStore` para evitar mismatch de hidratação.
- Headers de segurança globais em `next.config.ts`.

## Verificação

`pnpm --filter web lint`, `pnpm typecheck`, `pnpm build` da raiz.
`/api/health` verifica PostgreSQL e Redis; `/api/metrics` exige Bearer `METRICS_TOKEN`.
