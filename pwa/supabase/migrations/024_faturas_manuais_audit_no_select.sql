-- 024 — Ocultar auditoria de eliminações à app (só Supabase dashboard / SQL Editor)
-- Executar se já aplicaste a 023 com política SELECT aberta.

BEGIN;

DROP POLICY IF EXISTS "authenticated_read_faturas_manuais_eliminadas" ON public.faturas_manuais_eliminadas;

COMMENT ON TABLE public.faturas_manuais_eliminadas IS
  'Auditoria interna — consultar apenas no Supabase (SQL Editor / Table Editor). A app regista INSERT mas não lê.';

COMMIT;
