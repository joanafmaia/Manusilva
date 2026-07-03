-- 022 — Faturas registadas manualmente (sem relatório/visita na app)
-- Executar no Supabase → SQL Editor

BEGIN;

CREATE TABLE IF NOT EXISTS public.faturas_manuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id integer NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  numero_fatura text NOT NULL,
  data_fatura date NOT NULL,
  valor_faturado numeric(12, 2),
  condicao_pagamento text,
  status_recebimento text NOT NULL DEFAULT 'pendente',
  data_vencimento date,
  data_recebimento date,
  descricao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.faturas_manuais IS
  'Controlo interno — faturas emitidas externamente sem relatório ou visita na app';

CREATE INDEX IF NOT EXISTS faturas_manuais_cliente_idx ON public.faturas_manuais (cliente_id);
CREATE INDEX IF NOT EXISTS faturas_manuais_data_fatura_idx ON public.faturas_manuais (data_fatura);
CREATE INDEX IF NOT EXISTS faturas_manuais_status_recebimento_idx
  ON public.faturas_manuais (status_recebimento);

ALTER TABLE public.faturas_manuais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_faturas_manuais" ON public.faturas_manuais;
CREATE POLICY "authenticated_all_faturas_manuais" ON public.faturas_manuais
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
