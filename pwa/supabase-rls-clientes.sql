-- Executar no Supabase → SQL Editor (projeto zhfbezrevosmbmcbyskw)
-- Migrações versionadas: pwa/supabase/migrations/001 → 003 (executar por ordem se tabela nova).
-- Este ficheiro aplica telemovel, auditoria e RLS endurecido (escrita só RH authenticated).

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telemovel text;

CREATE TABLE IF NOT EXISTS public.cliente_alteracoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id bigint NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  alterado_por text,
  origem text DEFAULT 'rh_ficha',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_alteracoes_cliente_idx
  ON public.cliente_alteracoes (cliente_id, created_at DESC);

ALTER TABLE public.cliente_alteracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_insert_cliente_alteracoes" ON public.cliente_alteracoes;
CREATE POLICY "authenticated_insert_cliente_alteracoes"
  ON public.cliente_alteracoes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_cliente_alteracoes" ON public.cliente_alteracoes;
CREATE POLICY "authenticated_read_cliente_alteracoes"
  ON public.cliente_alteracoes FOR SELECT TO authenticated USING (true);

-- ─── clientes RLS ───
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_clientes" ON public.clientes;
CREATE POLICY "anon_read_clientes"
  ON public.clientes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_read_clientes" ON public.clientes;
CREATE POLICY "authenticated_read_clientes"
  ON public.clientes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "anon_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_update_clientes" ON public.clientes;

DROP POLICY IF EXISTS "rh_insert_clientes" ON public.clientes;
CREATE POLICY "rh_insert_clientes"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'RH');

DROP POLICY IF EXISTS "rh_update_clientes" ON public.clientes;
CREATE POLICY "rh_update_clientes"
  ON public.clientes FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'RH')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'RH');

DO $$
DECLARE
  next_id bigint;
BEGIN
  SELECT COALESCE(MAX(id), 0) + 1 INTO next_id FROM public.clientes;
  EXECUTE format(
    'ALTER TABLE public.clientes ALTER COLUMN id RESTART WITH %s',
    next_id
  );
END $$;
