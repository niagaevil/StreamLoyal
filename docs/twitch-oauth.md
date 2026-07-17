# Configurar credenciais Twitch OAuth

Estas credenciais são gratuitas e permitem o login com Twitch, a leitura do
chat/eventos da live (EventSub) e a lista de espectadores (lurkers ganham
pontos sem falar). Todo o processo leva menos de 5 minutos.

## 1. Registrar a aplicação

1. Acesse [dev.twitch.tv/console](https://dev.twitch.tv/console)
2. Entre com sua conta Twitch (será pedido ativar autenticação em duas etapas
   em [twitch.tv/settings/security](https://www.twitch.tv/settings/security),
   se ainda não tiver)
3. Menu **Applications** → **Register Your Application**
4. Preencha:
   - **Name**: `StreamLoyal` (ou outro nome livre)
   - **OAuth Redirect URLs**: clique em **Add** e cole exatamente:

     ```
     http://localhost:3000/api/auth/callback/twitch
     ```

   - **Category**: `Website Integration`
   - **Client Type**: **Confidential**
5. Clique em **Create**

## 2. Copiar as credenciais

1. Na lista de aplicações, clique em **Manage** na aplicação criada
2. Copie o **Client ID**
3. Clique em **New Secret** e copie o **Client Secret**
   (ele só aparece uma vez; se perder, gere outro)

## 3. Preencher os arquivos .env

Cole os dois valores em **ambos** os arquivos:

`apps/web/.env`

```bash
AUTH_TWITCH_ID="seu-client-id"
AUTH_TWITCH_SECRET="seu-client-secret"
```

`apps/bot-worker/.env`

```bash
AUTH_TWITCH_ID="seu-client-id"
AUTH_TWITCH_SECRET="seu-client-secret"
```

## 4. Testar

```bash
pnpm --filter web dev
```

Abra `http://localhost:3000`, clique em **Entrar com Twitch** e autorize.
No onboarding, escolha **Vincular canal da Twitch**. Pronto: seu painel e a
página pública `/c/seu-canal` estarão criados.

> Diferente do Google, a Twitch **não exige verificação nem lista de usuários
> de teste** — qualquer conta pode autorizar seu app assim que ele é criado.

## Escopos usados

O streamer autoriza no login (as ações de bot saem em nome da própria conta
do streamer, que é sempre "moderador" do próprio canal):

| Escopo | Para quê |
|---|---|
| `user:read:email` | Identificar a conta no login |
| `user:read:chat` | Ler o chat da live (EventSub) |
| `user:write:chat` | Responder comandos e timers no chat |
| `channel:read:subscriptions` | Bônus de pontos em subs e gifts |
| `bits:read` | Bônus de pontos em bits |
| `moderator:read:followers` | Bônus de pontos ao seguir |
| `moderator:read:chatters` | Lista de espectadores (pontos para lurkers) |
| `moderator:manage:chat_messages` | Moderação automática (apagar mensagens) |
| `moderator:manage:banned_users` | Moderação automática (timeout) |

> Se você já tinha feito login antes dessa versão, **refaça o login** para
> autorizar os novos escopos — sem eles o bot não consegue responder no chat.

## Problemas comuns

| Erro | Causa provável |
|---|---|
| `redirect_mismatch` | O Redirect URL no console não é exatamente `http://localhost:3000/api/auth/callback/twitch` |
| Login funciona mas eventos não chegam | `AUTH_TWITCH_ID`/`SECRET` ausentes no `apps/bot-worker/.env` |
| Lurkers sem pontos | O streamer precisa refazer o login se os escopos mudaram depois da autorização |
| Live não é detectada | O worker checa a cada 2 min — aguarde um ciclo |

## Produção (quando publicar)

- Adicione também o Redirect URL `https://seudominio.com/api/auth/callback/twitch`
- Atualize `AUTH_URL` no `.env` para o domínio público
- Não há processo de revisão da Twitch para publicar; os limites de API
  (800 pontos/min por Client ID) são suficientes para muitos canais
