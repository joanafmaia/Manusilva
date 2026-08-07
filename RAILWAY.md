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
| `EMAIL_USER` | Sim | Conta Gmail (ex. `manusilva.lda@gmail.com`) |
| `EMAIL_PASS` | Sim | **App Password** do Google (conta com 2FA) — não a password normal |
| `APP_BASE_URL` | Recomendado | URL público (sem `/` final), ex. `https://manusilva-production.up.railway.app` |
| `MAPBOX_ACCESS_TOKEN` | Opcional | Mapas / deslocação |
| `SMTP_HOST` / `SMTP_PORT` | Opcional | Só se **não** for Gmail. Com Gmail a app usa `smtp.gmail.com` (587 → fallback 465, IPv4) |
| `AVALIACAO_TOKEN_SECRET` | Opcional | Tokens dos links de avaliação |

### E-mail (Gmail)

1. Conta Google → Segurança → verificação em 2 passos **ligada**
2. Criar **App Password** → copiar para `EMAIL_PASS` na Railway (sem espaços)
3. `EMAIL_USER` = o mesmo endereço Gmail
4. Se aparecer `ETIMEDOUT` / SMTP inacessível: confirme as variáveis no serviço Railway (não só no `.env` local) e veja os logs do deploy. A app tenta a porta **587** e depois **465**.

A Railway define `PORT` automaticamente — não precisas de a criar. `RAILWAY_PUBLIC_DOMAIN` também pode ser usada como fallback de URL base.

## 3. Domínio

- Settings → Networking → **Generate Domain** (`.up.railway.app`)
- Ou domínio próprio (ex. `app.manusilva.pt`)
- Atualizar `APP_BASE_URL` com o URL final
- No Supabase → Authentication → URL Configuration: adicionar o novo URL + `/index.html`

## 4. Após o deploy

Abrir:

- `https://SEU-DOMINIO/` → login
- `https://SEU-DOMINIO/api/health` → `{ "ok": true }`

Testar envio de e-mail no painel RH.

## 5. Local

```bash
npm install
npm run build
npm start
```

Abrir http://localhost:3000
