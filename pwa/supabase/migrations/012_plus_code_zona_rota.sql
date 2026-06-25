-- 012 — Plus Code e Zona/Rota na ficha de clientes (sincronização com Excel)
-- Executar no Supabase → SQL Editor antes de importar dados do Excel.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS plus_code text,
  ADD COLUMN IF NOT EXISTS zona_rota text;

COMMENT ON COLUMN public.clientes.plus_code IS
  'Google Plus Code da morada (coluna «Plus Code+» do Excel).';

COMMENT ON COLUMN public.clientes.zona_rota IS
  'Zona ou rota de deslocação (coluna «Zona / Rota» do Excel).';

CREATE INDEX IF NOT EXISTS clientes_zona_rota_idx ON public.clientes (zona_rota);
