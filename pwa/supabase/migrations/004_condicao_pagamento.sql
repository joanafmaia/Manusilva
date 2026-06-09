-- 004 — Condição de pagamento na ficha cadastral de clientes

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS condicao_pagamento text;

COMMENT ON COLUMN public.clientes.condicao_pagamento IS
  'Pronto Pagamento, Semanal, Mensal, 30 dias, 60 dias, 90 dias';
