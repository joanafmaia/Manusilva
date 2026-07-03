# Manusilva PWA

Progressive Web App mobile-first para a **ManuSilva** — gestão de intervenções técnicas (empilhadores, manutenção, baterias), relatórios em PDF, orçamentos, faturação interna e painel RH.

Backend: **Supabase** (Postgres + Auth + Storage). E-mail ao cliente via API serverless (`pwa/api/enviar-email.js`, tipicamente na Vercel).

## Estrutura do repositório

```
Manusilva/
├── pwa/
│   ├── index.html              Login (técnico / RH)
│   ├── dashboard.html          Painel do técnico (tablet)
│   ├── admin.html              Painel RH (desktop)
│   ├── js/                     Módulos ES (relatórios, serviços, PDF, faturação…)
│   ├── api/                    Endpoints serverless (e-mail, clientes, técnicos)
│   ├── supabase/migrations/    SQL versionado (incl. 020 serviços)
│   ├── tests/                  Testes Node (`*.test.mjs`)
│   ├── css/                    Estilos
│   ├── sw.js                   Service worker
│   └── vercel.json             Deploy da PWA + API
├── scripts/                    Utilitários (catálogo, templates)
└── package.json                `npm test`, lint, format
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

Para Supabase em produção, configure as variáveis no runtime da PWA (ver `pwa/js/supabase-client.js` e scripts `npm run sync:api-config`). Sem migração 020, a app continua a funcionar em modo legado (só trabalhos).

## Testes

Na raiz do repositório:

```bash
npm test
```

Inclui testes de serviços, e-mail agrupado, faturação por visita, PDFs, orçamentos, etc.

## Autenticação e RH

- Contas da equipa: ver **`pwa/supabase-auth-equipa.md`**
- Joana e Filipa: role **`RH`** (acesso total — clientes, revisão, faturação, calendário)
- Após criar utilizadores no Supabase Auth, aplicar migrações RLS (`pwa/supabase-rls-authenticated.sql`, `006_rh_admin_roles.sql`)

## Migrações SQL

Executar no Supabase → SQL Editor, por ordem numérica em `pwa/supabase/migrations/`.

A **020** é obrigatória para o modelo serviço/visita. Copia faturação legada para `servicos` e liga `relatorios.servico_id`.

## Scripts úteis

| Comando | Descrição |
|---------|-----------|
| `npm test` | Testes unitários |
| `npm run lint` | ESLint em `pwa/js` e `pwa/api` |
| `npm run sync:rh-config` | Sincroniza config RH (`shared/rh-admin-config.json`) |
| `npm run import:catalogo` | Importa catálogo de produtos |

## Deploy

A PWA e a API de e-mail deployam a partir de `pwa/` (Vercel). Variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `EMAIL_USER`, `EMAIL_PASS`, etc. (ver `pwa/api/lib/supabase-env.js` e `pwa/api/enviar-email.js`).
