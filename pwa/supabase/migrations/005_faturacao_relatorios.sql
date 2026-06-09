-- Controlo interno de faturação (sem emissão legal de faturas na app)
-- Executar no Supabase → SQL Editor

ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS faturacao_status text,
  ADD COLUMN IF NOT EXISTS numero_fatura text,
  ADD COLUMN IF NOT EXISTS data_fatura date;

COMMENT ON COLUMN public.relatorios.faturacao_status IS
  'Estado de faturação interna: pendente | faturado (definido na aprovação do relatório)';

CREATE INDEX IF NOT EXISTS relatorios_faturacao_status_idx
  ON public.relatorios (faturacao_status);
