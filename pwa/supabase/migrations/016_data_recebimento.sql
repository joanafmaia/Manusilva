-- Data em que o pagamento foi recebido (confirmação RH)
-- Executar no Supabase → SQL Editor (após 009_faturacao_condicao_status.sql)

ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS data_recebimento date;

COMMENT ON COLUMN public.relatorios.data_recebimento IS
  'Data em que o valor da fatura foi recebido (confirmado no painel de faturação)';

CREATE INDEX IF NOT EXISTS relatorios_data_recebimento_idx
  ON public.relatorios (data_recebimento);
