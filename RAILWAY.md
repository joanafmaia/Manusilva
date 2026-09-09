# Deploy Manusilva na Railway

## 1. Criar projeto

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Escolher o repositório `Manusilva`
3. Plano **Hobby** ($5/mês)

O `railway.toml` na raiz define o builder **Railpack** (não Nixpacks), build (`npm run build`) e start (`node server/index.cjs`). O servidor escuta em dual-stack (`::`) para o healthcheck no Railway Metal.

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

**Erro 401 `invalid_client`:** o Google não reconhece o Client ID/Secret (valor incompleto, aspas, ID e secret trocados, cliente apagado, ou o serviço **não reiniciou**). Cria um cliente **Desktop app**, corre `npm run gmail:oauth` até aparecer «OK», cola **os três** `GOOGLE_*` do mesmo cliente nas Variables **do serviço** e faz **Restart/Redeploy**. Sem restart o processo continua com os valores antigos. Não uses API key (`AIza…`). Em Testing, `manusilva.lda@gmail.com` tem de estar em **Test users**.

Podes **apagar** `BREVO_API_KEY` / `RESEND_API_KEY` se existirem — já não são usadas.

A Railway define `PORT` automaticamente. `RAILWAY_PUBLIC_DOMAIN` serve de fallback de URL base.

## 3. Domínio

- Settings → Networking → **Generate Domain** (`.up.railway.app`)
- Ou domínio próprio (ex. `app.manusilva.pt`)
- Atualizar `APP_BASE_URL` com o URL final
- No Supabase → Authentication → URL Configuration: adicionar o novo URL + `/index.html`

## 4. Após o deploy

- `https://SEU-DOMINIO/` → login
- `https://SEU-DOMINIO/api/health` → `{ "ok": true, "email": { "active": "gmail_api", ... } }`

Avisos `SecretsUsedInArgOrEnv` no build Docker são do Nixpacks (copia variáveis para a imagem). Não falham o deploy. Podes desligar «Available at build time» em `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `AVALIACAO_TOKEN_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` — só `MAPBOX_ACCESS_TOKEN` e as chaves públicas do Supabase são precisas no `npm run build`.

## 5. Local

```bash
npm install
npm run build
npm start
```

Abrir http://localhost:3000 — Gmail API OAuth ou, em último caso, `EMAIL_USER` + `EMAIL_PASS` (SMTP).
