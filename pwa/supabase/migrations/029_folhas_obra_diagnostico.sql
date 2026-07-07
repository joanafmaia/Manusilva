-- 029 — Folhas de obra: diagnóstico técnico antes do orçamento RH (R.C)
-- Executar no Supabase → SQL Editor (após 028)

BEGIN;

ALTER TABLE public.folhas_obra
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico text NOT NULL DEFAULT '';

ALTER TABLE public.folhas_obra DROP CONSTRAINT IF EXISTS folhas_obra_estado_check;
ALTER TABLE public.folhas_obra
  ADD CONSTRAINT folhas_obra_estado_check
  CHECK (estado IN (
    'rascunho',
    'em_diagnostico',
    'aguarda_orcamento',
    'orcamento_enviado',
    'em_reparacao',
    'pendente_faturacao',
    'faturado',
    'dispensado'
  ));

COMMENT ON COLUMN public.folhas_obra.diagnostico_tecnico IS
  'Diagnóstico técnico da oficina (R.C) — obrigatório antes de enviar ao RH orçamentar';

COMMIT;
