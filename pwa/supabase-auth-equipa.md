# Supabase Auth — equipa ManuSilva

## Criar utilizadores (Dashboard → Authentication → Users)

Para cada membro, use o **e-mail** da tabela `UTILIZADORES` e palavra-passe inicial no formato:

`PrimeiraLetraDoNome` + resto em minúsculas + `.2026`  
Ex.: Hugo → `Hugo.2026` · Joana → `Joana.2026`

## Metadados (User Metadata JSON)

```json
{
  "nome": "Hugo",
  "role": "Tecnico",
  "technician_id": "tech-1"
}
```

RH / Admin (Joana, Filipa): `"role": "RH"` (também aceite: `admin`). Sem `technician_id`.

| Nome   | Como entra na app     | Identificador Supabase (interno) | Role | Palavra-passe |
|--------|------------------------|-----------------------------------|------|---------------|
| Joana  | `Joana` ou e-mail      | joanamaia97@gmail.com             | RH   | `Joana.2026`  |
| Filipa | **`Filipa`** + passe   | filipa@sistema.com (legado: filipa@rh.manusilva.internal) | RH   | `Filipa.2026` |

**Filipa não tem e-mail real.** O identificador `filipa@sistema.com` existe só no Supabase Auth — ela nunca o vê nem usa recuperação por e-mail.

Criar no Dashboard → Authentication → Users (metadata `{"role":"RH","nome":"Filipa"}`), depois executar `006_rh_admin_roles.sql` e `007_filipa_sistema_email.sql`.

## Redirect de redefinição

Authentication → URL Configuration → adicione o URL do site (ex. `https://manusilva.vercel.app/index.html`).

## RLS após login (obrigatório)

Com Supabase Auth, os pedidos à base de dados usam o role **`authenticated`** (não `anon`).

Executa no SQL Editor: **`pwa/supabase-rls-authenticated.sql`**

Sem isto, criar trabalhos/relatórios falha com erro de permissão RLS.
