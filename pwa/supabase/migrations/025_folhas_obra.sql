-- 025 — Folhas de obra (equipamentos em reparação na oficina/armazém)
-- Executar no Supabase → SQL Editor

BEGIN;

CREATE TABLE IF NOT EXISTS public.folhas_obra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ordem bigint GENERATED ALWAYS AS IDENTITY NOT NULL,

  cliente_id bigint NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  tecnico_id text NOT NULL DEFAULT '',

  tipo text NOT NULL DEFAULT '',
  marca_modelo text NOT NULL DEFAULT '',
  numero_serie text NOT NULL DEFAULT '',
  etq text NOT NULL DEFAULT '',
  data_rececao date,

  intervencoes jsonb NOT NULL DEFAULT '[]'::jsonb,

  maquina_concluida_em date,
  responsavel text NOT NULL DEFAULT '',

  estado text NOT NULL DEFAULT 'rascunho'
    CHECK (estado IN ('rascunho', 'em_reparacao', 'pendente_faturacao', 'faturado', 'dispensado')),

  submetido_em timestamptz,
  faturacao_status text,
  numero_fatura text,
  data_fatura date,
  valor_faturado numeric(12, 2),
  condicao_pagamento text,
  status_recebimento text DEFAULT 'pendente',
  data_vencimento date,
  data_recebimento date,

  observacoes text,

  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.folhas_obra IS
  'Folhas de obra — equipamentos recebidos na oficina para reparação';

CREATE UNIQUE INDEX IF NOT EXISTS folhas_obra_numero_ordem_idx ON public.folhas_obra (numero_ordem);
CREATE INDEX IF NOT EXISTS folhas_obra_cliente_idx ON public.folhas_obra (cliente_id);
CREATE INDEX IF NOT EXISTS folhas_obra_estado_idx ON public.folhas_obra (estado);
CREATE INDEX IF NOT EXISTS folhas_obra_faturacao_status_idx ON public.folhas_obra (faturacao_status);

ALTER TABLE public.folhas_obra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_folhas_obra" ON public.folhas_obra;
CREATE POLICY "authenticated_all_folhas_obra" ON public.folhas_obra
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
