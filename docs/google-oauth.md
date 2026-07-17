# Configurar credenciais Google OAuth

Estas credenciais são gratuitas e permitem o login com Google e a leitura do canal/chat do YouTube pela API oficial. Todo o processo leva de 5 a 10 minutos.

## 1. Criar o projeto

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Entre com sua conta Google
3. No topo da página, clique no seletor de projetos e em **Novo projeto**
4. Dê um nome (ex.: `StreamLoyal`) e clique em **Criar**
5. Selecione o projeto recém-criado

## 2. Ativar a API do YouTube

1. Menu lateral: **APIs e serviços → Biblioteca**
2. Busque por **YouTube Data API v3**
3. Clique em **Ativar**

## 3. Configurar o app no Google Auth Platform

> O console mudou: a antiga "Tela de consentimento OAuth" virou a seção
> **Google Auth Platform**, com as páginas **Branding**, **Público** e
> **Clientes**.

1. Menu lateral: **Google Auth Platform** (ou busque "Google Auth Platform"
   na barra de pesquisa do console)
2. Se aparecer "Google Auth Platform ainda não configurado", clique em
   **Começar** (Get Started) e preencha o assistente:
   - **Informações do app**: nome (ex.: `StreamLoyal`) e e-mail de suporte
     (seu Gmail) → **Avançar**
   - **Público**: selecione **Externo** → **Avançar**
   - **Informações de contato**: seu Gmail → **Avançar**
   - **Concluir**: aceite a Política de Dados do Usuário → **Continuar** →
     **Criar**
3. Adicione os usuários de teste:
   - Menu lateral: **Google Auth Platform → Público** (Audience)
   - Em **Usuários de teste**, clique em **Add users**, inclua o seu Gmail e
     o de quem for testar → **Salvar**
4. **Escopos** (página **Acesso a dados** / Data Access): pode pular — o app
   pede os escopos em tempo de login

> Enquanto o app estiver em **modo de teste** (publishing status "Testing" na
> página Público), apenas os usuários de teste conseguem fazer login (limite
> de 100). Para liberar para qualquer pessoa é preciso passar pela
> verificação do Google — prevista na fase de produção do plano.

## 4. Criar as credenciais

1. Menu lateral: **Google Auth Platform → Clientes** (Clients)
2. Clique em **Criar cliente** (Create Client)
3. Tipo de aplicativo: **Aplicativo da Web**
4. Nome: `StreamLoyal Web`
5. Em **URIs de redirecionamento autorizados**, clique em **Adicionar URI** e
   cole exatamente:

   ```
   http://localhost:3000/api/auth/callback/google
   http://localhost:3000/api/bot/callback/youtube
   ```

   O segundo URI permite vincular uma conta separada para responder como bot.

6. Clique em **Criar**. O Google exibirá:
   - **ID do cliente** → algo como `1234567890-abc123.apps.googleusercontent.com`
   - **Chave secreta do cliente** → algo como `GOCSPX-...`

> A chave secreta só é exibida **uma vez**, na criação do cliente. Copie os
> dois valores agora; se perder, será preciso gerar uma nova chave na página
> Clientes.

## 5. Preencher os arquivos .env

Cole os dois valores em **ambos** os arquivos:

`apps/web/.env`

```bash
AUTH_GOOGLE_ID="1234567890-abc123.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-sua-chave"
```

`apps/bot-worker/.env`

```bash
AUTH_GOOGLE_ID="1234567890-abc123.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-sua-chave"
```

## 6. Testar

```bash
pnpm --filter web dev
```

Abra `http://localhost:3000`, clique em **Entrar com Google** e autorize com
uma conta que esteja na lista de usuários de teste. Se aparecer a tela de
onboarding pedindo para criar o canal, está tudo funcionando.

## Problemas comuns

| Erro | Causa provável |
|---|---|
| `redirect_uri_mismatch` | O URI de redirecionamento no console não é exatamente `http://localhost:3000/api/auth/callback/google` |
| `access_denied` / app não verificado | Sua conta não está em **Usuários de teste** |
| `403` ao buscar canal | YouTube Data API v3 não foi ativada no projeto |
| Login funciona mas não acha canal | A conta Google usada não tem canal no YouTube |

## Produção (quando publicar)

- Adicione também o URI `https://seudominio.com/api/auth/callback/google`
- Adicione `https://seudominio.com/api/bot/callback/youtube` se usar conta
  personalizada do bot
- Atualize `AUTH_URL` no `.env` para o domínio público
- Solicite a verificação OAuth do Google (escopo `youtube.force-ssl` é sensível)
- Peça aumento de quota da YouTube Data API se houver muitos canais
