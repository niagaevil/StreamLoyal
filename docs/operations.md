# Operação, segurança e observabilidade

## Health checks

- Web: `GET /api/health` — verifica PostgreSQL e Redis; retorna 503 se degradado.
- Worker: `GET :3001/health` — verifica o último ciclo e loops ativos.
- Métricas web: `GET /api/metrics` com Bearer `METRICS_TOKEN`.
- Métricas worker: `GET :3001/metrics` com o mesmo Bearer.

Métricas são no formato Prometheus. Configure alerta para health 503, worker
sem tick por mais de quatro minutos, crescimento da fila de mídia e resgates
pendentes.

## Múltiplas réplicas do worker

O worker usa um lease distribuído no PostgreSQL (tabela `WorkerLease`): cada
canal ao vivo é assumido por uma única réplica, com renovação a cada 30s e
expiração em 90s. É seguro rodar duas ou mais réplicas — se uma cair, outra
assume o canal em até 90 segundos (ou imediatamente em shutdown gracioso via
SIGTERM, que libera os leases antes de sair).

## Controles implementados

- RBAC com proprietário (painel e configurações), moderador (comandos
  privilegiados no chat) e espectador (recursos públicos), sempre isolado por
  `channelId`;
- sessões HttpOnly do Auth.js e state OAuth;
- state separado e cookie HttpOnly para vincular a conta personalizada do bot;
- tokens OAuth criptografados em AES-256-GCM;
- URLs de Browser Source com segredo aleatório, hash no banco e revogação;
- rate limit Redis com fallback local para heartbeat e overlays;
- ledger de pontos e chaves de idempotência em eventos, jogos e pagamentos;
- validação e limite de tamanho na importação;
- Media Share restrito a URLs do YouTube, blacklist, fila limitada e votação
  única por espectador.

## Segredos

Nunca versione `.env`, dumps ou URLs de Browser Source. Use uma chave
`TOKEN_ENCRYPTION_KEY` de 32 bytes aleatórios e a mesma chave no web e worker.
Rotacionar essa chave exige descriptografar todos os tokens com a chave antiga
e criptografar com a nova; não apenas substitua a variável.

Rotacione imediatamente credenciais OAuth ou URL de overlay vazadas. Alterar
o Client Secret não revoga access tokens já emitidos; revogue também no
console da plataforma quando necessário.

## Resposta a incidentes

1. Desative o worker ou o módulo afetado.
2. Preserve logs e horário do incidente sem copiar tokens.
3. Rotacione segredos comprometidos.
4. Revogue sessões/tokens afetados.
5. Restaure de backup testado se houver corrupção.
6. Documente causa, impacto e correção.

## Checklist antes de publicar

- OAuth em produção e redirects HTTPS exatos;
- PostgreSQL/Redis sem portas públicas;
- backup e restauração testados;
- health checks monitorados;
- `METRICS_TOKEN`, `AUTH_SECRET` e `TOKEN_ENCRYPTION_KEY` fortes;
- política de privacidade e canal de remoção de dados publicados;
- teste manual com um canal YouTube e um Twitch;
- `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build` aprovados.
