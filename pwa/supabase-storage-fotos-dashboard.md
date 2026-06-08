# Fotos — políticas via Dashboard (se o SQL falhar)

Se o SQL Editor der erro **42501 must be owner of table objects** nas políticas, cria-as pela UI:

## Bucket

1. **Storage** → **New bucket**
2. Nome: `fotos_trabalhos`
3. **Public bucket**: ON
4. Create

## Políticas (repetir 2× — uma para cada role)

**Storage** → `fotos_trabalhos` → **Policies** → **New policy**

### Política A — utilizadores com login

- Policy name: `authenticated_all_fotos_trabalhos`
- Allowed operation: **ALL** (ou marcar SELECT + INSERT + UPDATE)
- Target roles: **authenticated**
- Policy definition (USING e WITH CHECK):

```sql
bucket_id = 'fotos_trabalhos'
```

### Política B — sem login (opcional)

- Policy name: `anon_all_fotos_trabalhos`
- Allowed operation: **ALL**
- Target roles: **anon**
- USING / WITH CHECK:

```sql
bucket_id = 'fotos_trabalhos'
```

## Colunas na base de dados

No **SQL Editor**, só isto (funciona sem erro de owner):

```sql
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_antes text;
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_depois text;
```
