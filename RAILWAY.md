# Deploy Manusilva na Railway

## 1. Criar projeto

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Escolher o repositório `Manusilva`
3. Plano **Hobby** ($5/mês)

O `railway.toml` na raiz define build (`npm run build`) e start (`npm start`).

## 2. Variáveis de ambiente

Em **Variables**:

| Variável | Obrigatória | Notas |
|----------|-------------|--------|
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Sim | Chave anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Técnicos + avaliações |
| `GOOGLE_CLIENT_ID` | **Sim (e-mail)** | Gmail API OAuth — e-mails em **Enviados** |
| `GOOGLE_CLIENT_SECRET` | **Sim (e-mail)** | Secret OAuth |
| `GOOGLE_REFRESH_TOKEN` | **Sim (e-mail)** | Obtido com `npm run gmail:oauth` |
| `EMAIL_USER` | Sim | `manusilva.lda@gmail.com` — conta autorizada |
| `EMAIL_FROM` | Opcional | Ex. `ManuSilva <manusilva.lda@gmail.com>` |
| `EMAIL_PASS` | Opcional | Só local/dev (SMTP); na Railway falha com ETIMEDOUT |
| `APP_BASE_URL` | Recomendado | URL público sem `/` final |
| `MAPBOX_ACCESS_TOKEN` | Opcional | Mapas / deslocação |
| `AVALIACAO_TOKEN_SECRET` | Opcional | Tokens de avaliação |
| `VAPID_PUBLIC_KEY` | **Sim (avisos fechados)** | `npm run vapid:keys` — chave pública Web Push |
| `VAPID_PRIVATE_KEY` | **Sim (avisos fechados)** | Chave privada (não commitar) |
| `VAPID_SUBJECT` | Opcional | Default: `mailto:manusilva.lda@gmail.com` |

### E-mail — Gmail API

Na Railway o SMTP Gmail (portas 465/587) costuma falhar. A app envia só pela **Gmail API** (HTTPS).

**Verificar:** `https://SEU-DOMINIO/api/health` → `"email": { "active": "gmail_api", ... }`.

Se o envio falhar com **invalid_grant** / token expirado: o ecrã OAuth em modo **Testing** caduca o refresh token **aos 7 dias**. Volte a correr `npm run gmail:oauth` e atualize `GOOGLE_REFRESH_TOKEN`. Para deixar de caducar, publique a app no Google Cloud (OAuth consent → Production).

#### Configurar OAuth (uma vez)

1. [Google Cloud Console](https://console.cloud.google.com/) → projeto
2. Ativar **Gmail API**
3. OAuth consent (External) → utilizador de teste: `manusilva.lda@gmail.com`
4. Credentials → OAuth client → tipo **Desktop app**
5. No PC:

```powershell
$env:GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET="GOCSPX-..."
npm run gmail:oauth
```

6. Autorizar com `manusilva.lda@gmail.com` → copiar `GOOGLE_REFRESH_TOKEN` para a Railway
7. Redeploy → testar envio

Podes **apagar** `BREVO_API_KEY` / `RESEND_API_KEY` se existirem — já não são usadas.

### Web Push — avisos com a app fechada

Técnicos e RH recebem aviso do sistema (trabalho atribuído, relatório pendente, rejeição/aprovação) mesmo com o browser fechado.

1. No PC: `npm run vapid:keys` → copiar as variáveis para a Railway
2. No Supabase → SQL Editor: executar `pwa/supabase/migrations/043_push_subscriptions.sql`
3. Redeploy
4. Na app: o primeiro clique pede permissão de notificações (uma vez)
5. iPhone: instalar a PWA no ecrã inicial (Safari). O Chrome no iOS não recebe Web Push

Verificar: `https://SEU-DOMINIO/api/health` → `"push": { "configured": true }`.

A Railway define `PORT` automaticamente. `RAILWAY_PUBLIC_DOMAIN` serve de fallback de URL base.

## 3. Domínio

- Settings → Networking → **Generate Domain** (`.up.railway.app`)
- Ou domínio próprio (ex. `app.manusilva.pt`)
- Atualizar `APP_BASE_URL` com o URL final
- No Supabase → Authentication → URL Configuration: adicionar o novo URL + `/index.html`

## 4. Após o deploy

- `https://SEU-DOMINIO/` → login
- `https://SEU-DOMINIO/api/health` → `{ "ok": true, "email": { "active": "gmail_api", ... }, "push": { "configured": true } }`

## 5. Local

```bash
npm install
npm run build
npm start
```

Abrir http://localhost:3000 — Gmail API OAuth ou, em último caso, `EMAIL_USER` + `EMAIL_PASS` (SMTP).
