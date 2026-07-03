-- 023 — Auditoria de faturas manuais eliminadas
-- Executar no Supabase → SQL Editor (após 022_faturas_manuais.sql)

BEGIN;

CREATE TABLE IF NOT EXISTS public.faturas_manuais_eliminadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL,
  cliente_id integer NOT NULL REFERENCES public.clientes (id) ON DELETE RESTRICT,
  numero_fatura text NOT NULL,
  data_fatura date,
  valor_faturado numeric(12, 2),
  descricao text,
  status_recebimento text,
  snapshot jsonb NOT NULL,
  eliminado_por text NOT NULL,
  eliminado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.faturas_manuais_eliminadas IS
  'Auditoria interna — consultar apenas no Supabase (SQL Editor / Table Editor). A app regista INSERT mas não lê.';

CREATE INDEX IF NOT EXISTS faturas_manuais_eliminadas_em_idx
  ON public.faturas_manuais_eliminadas (eliminado_em DESC);

CREATE INDEX IF NOT EXISTS faturas_manuais_eliminadas_cliente_idx
  ON public.faturas_manuais_eliminadas (cliente_id);

ALTER TABLE public.faturas_manuais_eliminadas ENABLE ROW LEVEL SECURITY;

-- Sem SELECT para authenticated — histórico só visível no dashboard Supabase (service role).
DROP POLICY IF EXISTS "authenticated_read_faturas_manuais_eliminadas" ON public.faturas_manuais_eliminadas;

DROP POLICY IF EXISTS "authenticated_insert_faturas_manuais_eliminadas" ON public.faturas_manuais_eliminadas;
CREATE POLICY "authenticated_insert_faturas_manuais_eliminadas"
  ON public.faturas_manuais_eliminadas
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMIT;
