-- Separa condição de pagamento e estado de recebimento na fatura
-- Executar após 008_contas_receber.sql

ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS condicao_pagamento text,
  ADD COLUMN IF NOT EXISTS status_recebimento text;

COMMENT ON COLUMN public.relatorios.condicao_pagamento IS
  'Condição de pagamento da fatura: pronto_pagamento | 30_dias | 60_dias';

COMMENT ON COLUMN public.relatorios.status_recebimento IS
  'Cobrança da fatura: pendente | pago';

-- Migrar dados do modelo anterior (prazo_pagamento + pagamento_status)
UPDATE public.relatorios
SET
  condicao_pagamento = CASE COALESCE(prazo_pagamento, '')
    WHEN 'pronto' THEN 'pronto_pagamento'
    WHEN '30_dias' THEN '30_dias'
    WHEN '60_dias' THEN '60_dias'
    WHEN 'pendente' THEN 'pronto_pagamento'
    ELSE condicao_pagamento
  END,
  status_recebimento = COALESCE(status_recebimento, pagamento_status)
WHERE faturacao_status = 'faturado';

CREATE INDEX IF NOT EXISTS relatorios_condicao_pagamento_idx
  ON public.relatorios (condicao_pagamento);

CREATE INDEX IF NOT EXISTS relatorios_status_recebimento_idx
  ON public.relatorios (status_recebimento);
