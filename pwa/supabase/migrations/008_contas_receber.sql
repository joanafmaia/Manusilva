-- Contas a receber — valor faturado, estado de pagamento e vencimento
-- Executar no Supabase → SQL Editor (após 005_faturacao_relatorios.sql)

ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS valor_faturado numeric(12, 2),
  ADD COLUMN IF NOT EXISTS pagamento_status text,
  ADD COLUMN IF NOT EXISTS prazo_pagamento text,
  ADD COLUMN IF NOT EXISTS data_vencimento date;

COMMENT ON COLUMN public.relatorios.valor_faturado IS
  'Valor total da fatura registada internamente (EUR)';

COMMENT ON COLUMN public.relatorios.pagamento_status IS
  'Estado de cobrança: pendente | pago';

COMMENT ON COLUMN public.relatorios.prazo_pagamento IS
  'Prazo escolhido na faturação: pendente | pronto | 30_dias | 60_dias';

COMMENT ON COLUMN public.relatorios.data_vencimento IS
  'Data limite de recebimento (30/60 dias após emissão)';

CREATE INDEX IF NOT EXISTS relatorios_pagamento_status_idx
  ON public.relatorios (pagamento_status);

CREATE INDEX IF NOT EXISTS relatorios_data_vencimento_idx
  ON public.relatorios (data_vencimento);
