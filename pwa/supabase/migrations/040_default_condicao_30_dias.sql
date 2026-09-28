-- 040 — Padrão de pagamento: 30 dias (excepções na ficha do cliente)
-- Executar no Supabase → SQL Editor
--
-- Novos clientes e faturas passam a 30 dias.
-- Clientes já gravados como pronto-pagamento passam a 30 dias;
-- os que já têm 60 dias mantêm-se. Depois, altere só as excepções na ficha.
-- As faturas já emitidas NÃO são alteradas aqui — ver 041_faturas_existentes_30_dias.sql.

BEGIN;

ALTER TABLE public.clientes
  ALTER COLUMN condicao_pagamento SET DEFAULT '30_dias';

UPDATE public.clientes
SET condicao_pagamento = '30_dias'
WHERE condicao_pagamento IS NULL
  OR btrim(condicao_pagamento) = ''
  OR lower(condicao_pagamento) IN ('pronto', 'pronto_pagamento', 'pronto-pagamento', 'pronto pagamento');

COMMIT;
