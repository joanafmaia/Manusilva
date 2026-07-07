-- 026 — Permitir criação de clientes pelo perfil Armazém
-- Executar no Supabase → SQL Editor

BEGIN;

CREATE OR REPLACE FUNCTION public.is_rh_admin_or_warehouse()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL THEN false
    ELSE
      public.is_rh_admin()
      OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
        'Armazem', 'armazem', 'warehouse'
      )
  END;
$$;

COMMENT ON FUNCTION public.is_rh_admin_or_warehouse() IS
  'True para RH/Admin e para o perfil Armazém na escrita de clientes.';

DROP POLICY IF EXISTS "rh_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "warehouse_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "warehouse_update_clientes" ON public.clientes;

CREATE POLICY "warehouse_insert_clientes"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_rh_admin_or_warehouse());

CREATE POLICY "warehouse_update_clientes"
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (public.is_rh_admin_or_warehouse())
  WITH CHECK (public.is_rh_admin_or_warehouse());

COMMIT;
