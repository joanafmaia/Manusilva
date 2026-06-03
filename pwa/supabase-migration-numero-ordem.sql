-- Numeração sequencial de trabalhos / ordens de serviço
ALTER TABLE public.trabalhos
  ADD COLUMN IF NOT EXISTS numero_ordem bigint GENERATED ALWAYS AS IDENTITY;

-- Garantir NOT NULL em bases onde a coluna foi adicionada sem constraint
ALTER TABLE public.trabalhos
  ALTER COLUMN numero_ordem SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trabalhos_numero_ordem_idx ON public.trabalhos (numero_ordem);
