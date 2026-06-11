-- 007 — Filipa: login por nome → filipa@sistema.com
-- Executar no Supabase → SQL Editor (após criar/migrar o utilizador)

CREATE OR REPLACE FUNCTION public.is_rh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL THEN false
    ELSE
      COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
        'RH', 'rh', 'admin', 'Admin', 'ADMIN', 'administracao', 'Administracao'
      )
      OR lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'nome', '')) IN ('joana', 'filipa')
      OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
        'joanamaia97@gmail.com',
        'filipa@sistema.com',
        'filipa@rh.manusilva.internal'
      )
  END;
$$;

-- Se a conta antiga existir, migrar e-mail para @sistema.com
UPDATE auth.users
SET
  email = 'filipa@sistema.com',
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'RH',
    'nome', 'Filipa'
  )
WHERE lower(email) = 'filipa@rh.manusilva.internal';

-- Conta nova (se ainda não existir): Dashboard → Authentication → Users → Add user
--   E-mail: filipa@sistema.com  |  Password: Filipa.2026
--   User Metadata: {"role":"RH","nome":"Filipa"}
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', 'RH',
  'nome', 'Filipa'
)
WHERE lower(email) = 'filipa@sistema.com';
