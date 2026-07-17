# StreamLoyal

Plataforma gratuita de **pontos de fidelidade** e **loja de recompensas** para streamers do **YouTube** e da **Twitch** — inspirada no Cloudbot, com marca e código próprios.

## O que já funciona

- Login com Google/YouTube ou Twitch (OAuth)
- Onboarding: escolha a plataforma, vincule o canal e crie a página pública `/c/[slug]`
- Painel do streamer:
  - **Fidelidade** — nome da moeda, intervalo, pontos por chat e bônus por plataforma
  - **Loja** — criar perks, sons e códigos; ativar/destaque/excluir
  - **Comandos** — comandos personalizados (permissão, custo, cooldowns, aliases)
  - **Timers** — mensagens automáticas com mínimo de atividade no chat
  - **Fila & Quotes** — fila de espectadores (!join) e frases marcantes
  - **Moderação** — filtros de caps, links, palavras e símbolos + log de ações
  - **Engajamento** — sorteios, enquetes, apostas e minigames
  - **OBS & Mídia** — alertas, sons e Media Share com URLs privadas
  - **Conta do bot** — canal YouTube separado e gratuito
  - **Importar/Exportar** — backup JSON e CSV
  - **Espectadores** — ranking, ajuste manual, bloqueio
  - **Resgates** — aprovar / reembolsar
  - **Aparência** — cores, layout, banner, logo
- Página pública: loja + ranking + saldo + lista de comandos
- **bot-worker**: detecta a live, credita pontos e responde comandos no chat
  (as respostas saem pela conta do próprio streamer)

### Comandos padrão no chat

`!pontos` `!top` `!tophours` `!give` `!redeem` `!quote` `!join` `!leave`
`!fila` `!comandos` — e para moderadores: `!addpoints` `!removepoints`
`!addquote` `!removequote` `!openqueue` `!closequeue` `!permit`

Jogos e engajamento: `!8ball`, `!gamble`, `!slots`, `!duel`, `!heist`,
`!combo`, `!pyramid`, `!ticket`, `!vote`, `!bet`, `!media` e `!skip`.

### YouTube

- Pontos para quem participa do chat + bônus de Super Chat/Sticker/membros/gifts
- **Watch & Earn**: assistir a live embutida no site (logado, aba visível) gera pontos mesmo em silêncio

### Twitch

- **Lurkers ganham pontos sem falar** — o worker usa a lista oficial de espectadores (Get Chatters)
- Eventos em tempo real via EventSub (WebSocket): follow, sub/resub, gift subs, bits e raids valem bônus
- Aba Assistir embute o player e o chat da Twitch

## Pré-requisitos

- Node.js 20+
- pnpm
- Docker (PostgreSQL + Redis)

## Setup local

```bash
# 1. Subir banco
docker compose up -d

# 2. Instalar dependências
pnpm install

# 3. Criar os arquivos .env a partir dos exemplos
cp packages/db/.env.example    packages/db/.env
cp apps/web/.env.example       apps/web/.env
cp apps/bot-worker/.env.example apps/bot-worker/.env
# (no Windows PowerShell, use Copy-Item no lugar de cp)

# 4. Gerar Prisma Client e criar tabelas (migrations versionadas)
pnpm --filter @streamloyal/db exec prisma generate
pnpm --filter @streamloyal/db exec prisma migrate deploy

# 5. Configurar OAuth (pode configurar só a plataforma que for usar)
#    Google/YouTube: docs/google-oauth.md
#    Twitch:         docs/twitch-oauth.md
#    Preencha as credenciais em apps/web/.env e apps/bot-worker/.env
#    Gere também:
#      AUTH_SECRET            -> npx auth secret  (ou 32+ caracteres aleatórios)
#      TOKEN_ENCRYPTION_KEY   -> 64 caracteres hex (32 bytes), a MESMA nos dois .env
#        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 6. Rodar
pnpm --filter web dev          # http://localhost:3000
pnpm --filter bot-worker dev   # worker (outro terminal)

# Verificação
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Como os pontos funcionam

| Origem | YouTube | Twitch |
|---|---|---|
| Chat ativo | Quem enviou mensagem no intervalo | Quem enviou mensagem no intervalo |
| Assistir em silêncio | Só pela aba **Assistir** do site (Watch & Earn) | **Automático** — lista oficial de espectadores |
| Eventos pagos | Super Chat / Sticker / membro / gift | Bits / sub / gift sub |
| Outros eventos | — | Follow e raid |

No YouTube, assistir em silêncio **no player nativo** não gera pontos — a API
não lista espectadores; use a aba Assistir da página pública. Na Twitch isso
não é necessário: quem está conectado ao chat (mesmo calado) já pontua.

## Estrutura

```
apps/web                     Next.js — painel, loja pública, APIs
apps/bot-worker              Processo que lê lives/chat e paga pontos
  src/platforms/youtube      Adaptador YouTube (polling liveChat)
  src/platforms/twitch       Adaptador Twitch (EventSub WS + Get Chatters)
packages/db                  Prisma + PostgreSQL
packages/core                Regras de pontos e resgates (agnósticas)
```

## Rodando em produção (Linux)

Toda a stack (Node.js, PostgreSQL, Redis, Docker Compose) roda nativamente em
Linux — recomendado para o servidor. O desenvolvimento funciona igualmente em
Windows e macOS.

## Produção e segurança

- Deploy Linux/Docker: `docs/deploy-linux.md`
- Operação, métricas e segurança: `docs/operations.md`
- Modelo de privacidade/remoção: `docs/privacy.md`
- Health web: `/api/health`; worker: porta 3001 `/health`
- Tokens OAuth são criptografados em AES-256-GCM quando
  `TOKEN_ENCRYPTION_KEY` está configurada
- URLs do OBS são revogáveis e só têm o hash persistido no banco

> **Nota (escopos):** esta versão pede escopos novos (YouTube
> `youtube.force-ssl`; Twitch `user:write:chat` e `moderator:manage:*`).
> Quem já tinha feito login precisa **sair e entrar de novo** para o bot
> conseguir responder e moderar o chat.
