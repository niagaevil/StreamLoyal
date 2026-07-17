# Deploy em servidor Linux

## Requisitos

- Ubuntu 22.04/24.04 ou distribuição equivalente
- Docker Engine com Compose v2
- domínio com HTTPS (Caddy, Nginx ou proxy do provedor)
- portas públicas 80/443; PostgreSQL e Redis não devem ser expostos

## Instalação

```bash
git clone <url-do-repositorio> streamloyal
cd streamloyal
cp .env.production.example .env.production
openssl rand -base64 32  # AUTH_SECRET
openssl rand -hex 32     # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32     # METRICS_TOKEN
```

Preencha `.env.production`. `AUTH_URL` deve ser a URL HTTPS final, sem barra no
fim. Configure nos consoles OAuth:

- Google: `https://dominio/api/auth/callback/google`
- Google (conta personalizada do bot):
  `https://dominio/api/bot/callback/youtube`
- Twitch: `https://dominio/api/auth/callback/twitch`

Suba os serviços:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl https://dominio/api/health
```

O serviço `migrate` executa `prisma migrate deploy` antes de iniciar
web/worker, aplicando as migrations versionadas de
`packages/db/prisma/migrations`. Para alterar o schema, gere uma nova
migration em desenvolvimento com
`pnpm --filter @streamloyal/db exec prisma migrate dev --name descricao`.

## Proxy HTTPS com Caddy

```caddy
stream.seudominio.com {
  reverse_proxy 127.0.0.1:3000
  encode zstd gzip
}
```

Não publique as portas 5432, 6379 ou 3001 no firewall. O endpoint de métricas
do web exige `Authorization: Bearer <METRICS_TOKEN>`. O health do worker fica
somente na rede Docker em `http://worker:3001/health`.

## Backup e restauração

Faça backup diário do PostgreSQL, fora do mesmo disco do servidor:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U streamloyal -Fc streamloyal > "backup-$(date +%F).dump"
```

Teste a restauração periodicamente em outro banco. Também preserve:

- `.env.production` em cofre de segredos;
- `TOKEN_ENCRYPTION_KEY` (sem ela os tokens OAuth não podem ser recuperados);
- configurações do proxy e DNS.

## Atualização

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker image prune -f
```

Confira `/api/health`, logs do `web` e `worker`, login OAuth, detecção de live,
resposta do bot e uma URL de Browser Source depois de cada atualização.

## Google OAuth e quota

Para sair do modo de teste, publique a tela de consentimento e envie a
verificação do escopo sensível `youtube.force-ssl`. Tenha páginas públicas de
privacidade e remoção de dados (modelo em `docs/privacy.md`), domínio
verificado e vídeo demonstrando o uso do escopo. O pedido de aumento de quota
da YouTube Data API é separado da verificação OAuth; inclua estimativas de
canais, lives/dia e chamadas por recurso.
