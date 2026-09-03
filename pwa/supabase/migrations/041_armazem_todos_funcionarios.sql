-- 041 — Armazém acessível a todos os funcionários (RH + técnicos)
-- Atualiza is_rh_admin_or_warehouse() para técnicos criarem clientes na oficina.
-- Se ainda não correste pwa/supabase-permissoes.sql, podes correr esse em vez desta.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_rh_admin_or_warehouse()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL THEN false
    ELSE
      public.is_rh_admin()
      OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
        'Armazem', 'armazem', 'warehouse',
        'Tecnico', 'tecnico', 'technician'
      )
  END;
$$;

COMMENT ON FUNCTION public.is_rh_admin_or_warehouse() IS
  'True para RH/Admin, técnicos e Armazém — escrita de clientes no painel oficina.';

COMMIT;
