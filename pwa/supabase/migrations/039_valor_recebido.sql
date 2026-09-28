-- 039 — Valor já recebido em faturas (pagamentos parciais / faturas agregadas)
-- Executar no Supabase → SQL Editor
--
-- Permite registar quanto o cliente já pagou e calcular a dívida:
--   dívida = valor_faturado − valor_recebido
-- Estado: pendente | parcial | pago

BEGIN;

ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS valor_recebido numeric(12, 2);

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS valor_recebido numeric(12, 2);

ALTER TABLE public.faturas_manuais
  ADD COLUMN IF NOT EXISTS valor_recebido numeric(12, 2);

ALTER TABLE public.folhas_obra
  ADD COLUMN IF NOT EXISTS valor_recebido numeric(12, 2);

COMMENT ON COLUMN public.relatorios.valor_recebido IS
  'Montante já recebido desta fatura. Dívida = valor_faturado − valor_recebido.';
COMMENT ON COLUMN public.servicos.valor_recebido IS
  'Montante já recebido da fatura da visita.';
COMMENT ON COLUMN public.faturas_manuais.valor_recebido IS
  'Montante já recebido desta fatura manual.';
COMMENT ON COLUMN public.folhas_obra.valor_recebido IS
  'Montante já recebido da fatura da folha de obra.';

UPDATE public.relatorios
SET valor_recebido = valor_faturado
WHERE status_recebimento = 'pago'
  AND valor_recebido IS NULL
  AND valor_faturado IS NOT NULL;

UPDATE public.servicos
SET valor_recebido = valor_faturado
WHERE status_recebimento = 'pago'
  AND valor_recebido IS NULL
  AND valor_faturado IS NOT NULL;

UPDATE public.faturas_manuais
SET valor_recebido = valor_faturado
WHERE status_recebimento = 'pago'
  AND valor_recebido IS NULL
  AND valor_faturado IS NOT NULL;

UPDATE public.folhas_obra
SET valor_recebido = valor_faturado
WHERE status_recebimento = 'pago'
  AND valor_recebido IS NULL
  AND valor_faturado IS NOT NULL;

COMMIT;
