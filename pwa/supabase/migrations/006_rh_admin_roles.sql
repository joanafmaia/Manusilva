-- 006 — Perfis RH/Admin (Joana, Filipa) + RLS alinhado
-- Executar no Supabase → SQL Editor

-- Função partilhada pelas políticas RLS de escrita em clientes
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
        'filipa@rh.manusilva.internal'
      )
  END;
$$;

COMMENT ON FUNCTION public.is_rh_admin() IS
  'True para utilizadores RH/Admin (metadata.role ou e-mail autorizado).';

-- ─── Atribuir role RH na Auth (Joana) ───
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', 'RH',
  'nome', 'Joana'
)
WHERE lower(email) = 'joanamaia97@gmail.com';

-- Filipa (sem e-mail pessoal): identificador interno só para o Supabase Auth.
-- Dashboard → Authentication → Users → Add user:
--   E-mail: filipa@rh.manusilva.internal  |  Password: Filipa.2026
--   User Metadata: {"role":"RH","nome":"Filipa"}
-- Ela entra na app com o nome «Filipa» + palavra-passe (nunca precisa do e-mail interno).
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', 'RH',
  'nome', 'Filipa'
)
WHERE lower(email) = 'filipa@rh.manusilva.internal';

-- ─── clientes: escrita só RH/Admin ───
DROP POLICY IF EXISTS "rh_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_update_clientes" ON public.clientes;

CREATE POLICY "rh_insert_clientes"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "rh_update_clientes"
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());
