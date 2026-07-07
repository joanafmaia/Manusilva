-- 028 — Folhas de obra: M.S / R.C, orçamento RH e consumíveis
-- Executar no Supabase → SQL Editor (após 025)

BEGIN;

ALTER TABLE public.folhas_obra
  ADD COLUMN IF NOT EXISTS responsabilidade text NOT NULL DEFAULT 'RC',
  ADD COLUMN IF NOT EXISTS orcamento_report_id uuid,
  ADD COLUMN IF NOT EXISTS orcamento_aceite_em timestamptz,
  ADD COLUMN IF NOT EXISTS consumiveis jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.folhas_obra DROP CONSTRAINT IF EXISTS folhas_obra_responsabilidade_check;
ALTER TABLE public.folhas_obra
  ADD CONSTRAINT folhas_obra_responsabilidade_check
  CHECK (responsabilidade IN ('MS', 'RC'));

ALTER TABLE public.folhas_obra DROP CONSTRAINT IF EXISTS folhas_obra_estado_check;
ALTER TABLE public.folhas_obra
  ADD CONSTRAINT folhas_obra_estado_check
  CHECK (estado IN (
    'rascunho',
    'aguarda_orcamento',
    'orcamento_enviado',
    'em_reparacao',
    'pendente_faturacao',
    'faturado',
    'dispensado'
  ));

COMMENT ON COLUMN public.folhas_obra.responsabilidade IS 'MS = máquina Manusilva; RC = responsabilidade do cliente';
COMMENT ON COLUMN public.folhas_obra.orcamento_report_id IS 'Proposta MS.015 ligada (só R.C)';
COMMENT ON COLUMN public.folhas_obra.consumiveis IS 'Consumíveis adicionados na reparação [{artigo,qtd}]';

COMMIT;
