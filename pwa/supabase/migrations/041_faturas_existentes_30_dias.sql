-- 041 — Faturas já emitidas: passar o antigo padrão (pronto-pagamento) para 30 dias
-- Executar no Supabase → SQL Editor (depois da 040)
--
-- Não altera faturas a 60 dias.
-- Recalcula o vencimento = data de emissão + 30 dias.

BEGIN;

UPDATE public.relatorios
SET
  condicao_pagamento = '30_dias',
  data_vencimento = CASE
    WHEN data_fatura IS NOT NULL THEN (data_fatura + 30)
    ELSE data_vencimento
  END
WHERE faturacao_status = 'faturado'
  AND (
    condicao_pagamento IS NULL
    OR btrim(condicao_pagamento) = ''
    OR lower(condicao_pagamento) IN ('pronto', 'pronto_pagamento', 'pronto-pagamento', 'pronto pagamento')
  );

UPDATE public.servicos
SET
  condicao_pagamento = '30_dias',
  data_vencimento = CASE
    WHEN data_fatura IS NOT NULL THEN (data_fatura + 30)
    ELSE data_vencimento
  END
WHERE data_fatura IS NOT NULL
  AND (
    condicao_pagamento IS NULL
    OR btrim(condicao_pagamento) = ''
    OR lower(condicao_pagamento) IN ('pronto', 'pronto_pagamento', 'pronto-pagamento', 'pronto pagamento')
  );

UPDATE public.faturas_manuais
SET
  condicao_pagamento = '30_dias',
  data_vencimento = (data_fatura + 30)
WHERE
  condicao_pagamento IS NULL
  OR btrim(condicao_pagamento) = ''
  OR lower(condicao_pagamento) IN ('pronto', 'pronto_pagamento', 'pronto-pagamento', 'pronto pagamento');

UPDATE public.folhas_obra
SET
  condicao_pagamento = '30_dias',
  data_vencimento = CASE
    WHEN data_fatura IS NOT NULL THEN (data_fatura + 30)
    ELSE data_vencimento
  END
WHERE data_fatura IS NOT NULL
  AND (
    condicao_pagamento IS NULL
    OR btrim(condicao_pagamento) = ''
    OR lower(condicao_pagamento) IN ('pronto', 'pronto_pagamento', 'pronto-pagamento', 'pronto pagamento')
  );

COMMIT;
