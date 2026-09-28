# Supabase Auth — equipa ManuSilva

## Criar utilizadores (Dashboard → Authentication → Users)

Para cada membro, use o **e-mail** da tabela abaixo. A palavra-passe inicial define-se **só no Dashboard** (não fica neste repositório).

## Metadados (User Metadata JSON)

```json
{
  "nome": "Hugo",
  "role": "Tecnico",
  "technician_id": "tech-1"
}
```

RH / Admin (Joana, Filipa): `"role": "RH"` (também aceite: `admin`). Sem `technician_id`.

| Nome   | Como entra na app     | Identificador Supabase (interno) | Role |
|--------|------------------------|-----------------------------------|------|
| Joana  | `Joana` ou e-mail      | joanamaia97@gmail.com             | RH   |
| Filipa | **`Filipa`** + passe   | filipa@sistema.com (legado: filipa@rh.manusilva.internal) | RH   |

**Filipa não tem e-mail real.** O identificador `filipa@sistema.com` existe só no Supabase Auth — ela nunca o vê nem usa recuperação por e-mail.

Criar no Dashboard → Authentication → Users (metadata `{"role":"RH","nome":"Filipa"}`), depois garantir migrations `006`, `007_filipa_*`, **`036`** (RLS sem bypass só por nome) e **`042`** (faturação só RH).

Técnicos podem escolher o perfil **Armazém** no login (PC da oficina). Existe também a conta dedicada `armazem@sistema.com`.

## Redirect de redefinição

Authentication → URL Configuration → adicione o URL do site (ex. URL Railway / `…/index.html`).

## RLS após login (obrigatório)

Com Supabase Auth, os pedidos à base de dados usam o role **`authenticated`** (não `anon`).

Fonte de verdade: **`pwa/supabase/migrations/`** (em especial `006`–`007`, `026`/`027` armazém, `036` segurança RH, `042` faturação).

Sem as migrations de RLS, criar trabalhos/relatórios pode falhar com erro de permissão.
