# Manusilva PWA

Progressive Web App mobile-first para a **ManuSilva** — gestão de intervenções técnicas (empilhadores, manutenção, baterias), relatórios em PDF, orçamentos, faturação interna e painel RH.

Backend: **Supabase** (Postgres + Auth + Storage). Deploy recomendado: **Railway** (`server/index.cjs` serve a PWA + `/api`). Vercel permanece como opção legada.

## Estrutura do repositório

```
Manusilva/
├── server/index.cjs            Express (Railway) — estático + API
├── pwa/
│   ├── index.html              Login (técnico / RH / armazém)
│   ├── dashboard.html          Painel do técnico (tablet)
│   ├── admin.html              Painel RH (desktop)
│   ├── warehouse.html          Painel armazém / folhas de obra
│   ├── js/                     Módulos ES (relatórios, serviços, PDF, faturação…)
│   ├── api/                    Endpoints (e-mail, clientes, técnicos, avaliações)
│   ├── supabase/migrations/    SQL versionado (fonte de verdade; até 036)
│   ├── tests/                  Testes Node (`*.test.mjs`)
│   ├── css/                    Estilos (base / tech / admin / warehouse)
│   └── sw.js                   Service worker
├── railway.toml
└── package.json                `npm test`, lint, build, start
```

## Modelo «Serviço» (visita multi-relatório)

A migração **`pwa/supabase/migrations/020_servicos_multi_relatorio.sql`** introduz visitas ao cliente com vários relatórios:

| Entidade | Papel |
|----------|--------|
| **servico** | Visita (cliente, data, técnicos, assinaturas partilhadas, faturação, e-mail) |
| **relatorio** | Um por tipo de intervenção na mesma visita (aprovação/rejeição individual) |
| **trabalho** | Modelo legado (1 relatório); mantido para dados antigos |

### Fluxo resumido

1. **RH** cria um **serviço** no calendário (sem tipo fixo).
2. **Técnico** abre a visita, adiciona N relatórios por tipo, **conclui visita** com assinaturas únicas.
3. **RH** revê cada relatório na pasta da visita (rejeição individual possível).
4. Quando **todos aprovados** → **um e-mail** ao cliente com todos os PDFs.
5. **Faturação** regista **uma fatura por visita** (relatórios legados sem serviço mantêm o fluxo anterior).

Módulos principais: `servicos-db.js`, `servicos-workflow.js`, `servicos-submit-workflow.js`, `servicos-rh-review.js`, `servicos-email-workflow.js`, `servicos-billing-workflow.js`.

## Executar localmente

```bash
cd pwa
python -m http.server 3456
```

Abrir: http://localhost:3456/index.html

Para API + PWA como em produção: `npm run build` e `npm start` na raiz (ver `RAILWAY.md`).

## Testes

Na raiz do repositório:

```bash
npm test
```

## Autenticação e RH

- Contas da equipa: ver **`pwa/supabase-auth-equipa.md`**
- Joana e Filipa: role **`RH`** (ou e-mail na allowlist) — acesso total
- Verificações partilhadas: `pwa/js/auth-roles-core.js` + `pwa/server-lib/auth-roles.js` (`npm run sync:rh-config`)
- Técnicos podem usar o painel **Armazém**
- Após Auth no Supabase, aplicar migrations em `pwa/supabase/migrations/` (incl. **036** para `is_rh_admin` sem bypass só por nome)

Ficheiros SQL soltos em `pwa/supabase-*.sql` são referência legada — a fonte de verdade são as migrations.

## Migrações SQL

Executar no Supabase → SQL Editor, por ordem numérica em `pwa/supabase/migrations/`.

Há dois pares com o mesmo prefixo (`007_*`, `022_*`) — aplicar **ambos** (ordem alfabética dentro do número).

A **020** é obrigatória para o modelo serviço/visita. A **036** alinha RLS RH com a app.

## Scripts úteis

| Comando | Descrição |
|---------|-----------|
| `npm test` | Testes unitários |
| `npm run lint` | ESLint em `pwa/js` e `pwa/api` |
| `npm run sync:rh-config` | Sincroniza config RH (`shared/rh-admin-config.json`) |
| `npm run import:catalogo` | Importa catálogo de produtos |

## Deploy

- **Railway (recomendado):** ver [`RAILWAY.md`](RAILWAY.md) — PWA + API no mesmo serviço (`npm run build` / `npm start`).
- **Vercel (legado):** `vercel.json` na raiz (output `pwa/`) ou `pwa/vercel.json` (deploy a partir de `pwa/`); ambos correm o build completo (mapbox, version, API config, sync RH).

Variáveis: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_USER`, `EMAIL_PASS`, `APP_BASE_URL`, etc.
