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
| `BREVO_API_KEY` | **Recomendada** | Envio HTTPS ([brevo.com](https://www.brevo.com)) — mantém remetente Gmail |
| `RESEND_API_KEY` | Alternativa | [resend.com](https://resend.com) — para clientes convém verificar `manusilva.pt` |
| `EMAIL_USER` | Sim (com Brevo) | `manusilva.lda@gmail.com` — remetente / reply-to |
| `EMAIL_FROM` | Opcional | Ex. `ManuSilva <manusilva.lda@gmail.com>` |
| `EMAIL_PASS` | Opcional | App Password Gmail (SMTP); **na Railway costuma falhar com ETIMEDOUT** |
| `APP_BASE_URL` | Recomendado | URL público sem `/` final |
| `MAPBOX_ACCESS_TOKEN` | Opcional | Mapas / deslocação |
| `AVALIACAO_TOKEN_SECRET` | Opcional | Tokens de avaliação |

### E-mail na Railway (obrigatório se aparecer ETIMEDOUT)

A App Password do Gmail pode estar **certa** e mesmo assim falhar: a Railway bloqueia SMTP (portas 465/587).

**Verificar se a chave chegou ao servidor:** abra `https://SEU-DOMINIO/api/health` — deve aparecer `"email": { "active": "brevo", "brevo": true, ... }`. Se `active` for `"smtp"` ou `"none"`, a variável **não** está no serviço em execução.

Checklist se ainda falhar:
1. Nome **exato**: `BREVO_API_KEY` (não “Brevo API Key” nem chave SMTP do Brevo)
2. Variável no **serviço** da app (não só no projeto) → Variables → Shared / Service
3. Após guardar: **Redeploy** (Deployments → Redeploy)
4. Valor = chave de **API** em Brevo → SMTP & API → API keys (`xkeysib-...`), não a password SMTP
5. Se o erro mencionar **unrecognised IP** / `authorised_ips`: em [Security → Authorised IPs](https://app.brevo.com/security/authorised_ips) **desative** a restrição de IPs (o IP da Railway muda nos redeploys). Alternativa: adicionar o IP temporariamente.

#### Opção A — Brevo (mais simples com Gmail)

1. Criar conta em [brevo.com](https://www.brevo.com) (free)
2. **Senders** → adicionar `manusilva.lda@gmail.com` → confirmar o e-mail que o Brevo envia
3. **SMTP & API** → API keys → criar chave
4. **Security → Authorised IPs**: desativar bloqueio por IP (obrigatório na Railway)
5. Na Railway → Variables:
   - `BREVO_API_KEY` = a chave
   - `EMAIL_USER` = `manusilva.lda@gmail.com`
6. Redeploy → confirmar `/api/health` com `"active":"brevo"` → testar envio

#### Opção B — Resend

1. Conta em [resend.com](https://resend.com) → API Key (`re_...`)
2. Railway: `RESEND_API_KEY=re_...`
3. Teste: `EMAIL_FROM=ManuSilva <onboarding@resend.dev>` (só envia para o vosso e-mail de conta)
4. Produção: Domains → verificar `manusilva.pt` → `EMAIL_FROM=ManuSilva <orcamentos@manusilva.pt>`

A Railway define `PORT` automaticamente. `RAILWAY_PUBLIC_DOMAIN` serve de fallback de URL base.

## 3. Domínio

- Settings → Networking → **Generate Domain** (`.up.railway.app`)
- Ou domínio próprio (ex. `app.manusilva.pt`)
- Atualizar `APP_BASE_URL` com o URL final
- No Supabase → Authentication → URL Configuration: adicionar o novo URL + `/index.html`

## 4. Após o deploy

- `https://SEU-DOMINIO/` → login
- `https://SEU-DOMINIO/api/health` → `{ "ok": true, "email": { "active": "brevo", ... } }`

## 5. Local

```bash
npm install
npm run build
npm start
```

Abrir http://localhost:3000 — podes usar Brevo/Resend ou `EMAIL_USER` + `EMAIL_PASS`.
