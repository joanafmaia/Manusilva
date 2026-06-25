-- 011 — Clientes de teste não consomem numero_ordem (OP oficial)
-- Executar no Supabase → SQL Editor (após schema de trabalhos/relatórios).

-- 1) Marcar clientes de teste na ficha
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS eh_teste boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.eh_teste IS
  'Cliente de simulação — trabalhos não recebem numero_ordem (OP oficial).';

UPDATE public.clientes
SET eh_teste = true
WHERE LOWER(TRIM(nome_empresa)) LIKE 'cliente teste%';

-- 2) numero_ordem: sequência manual só para clientes reais
-- (substitui IDENTITY que atribuía OP a todos os INSERT)

ALTER TABLE public.trabalhos
  ALTER COLUMN numero_ordem DROP IDENTITY IF EXISTS;

ALTER TABLE public.trabalhos
  ALTER COLUMN numero_ordem DROP NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.trabalhos_numero_ordem_seq;

SELECT setval(
  'public.trabalhos_numero_ordem_seq',
  GREATEST(COALESCE((SELECT MAX(numero_ordem) FROM public.trabalhos), 0), 1)
);

CREATE OR REPLACE FUNCTION public.trabalhos_assign_numero_ordem()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero_ordem IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = NEW.cliente_id
      AND c.eh_teste = true
  ) THEN
    NEW.numero_ordem := NULL;
    RETURN NEW;
  END IF;

  NEW.numero_ordem := nextval('public.trabalhos_numero_ordem_seq');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trabalhos_assign_numero_ordem_trigger ON public.trabalhos;

CREATE TRIGGER trabalhos_assign_numero_ordem_trigger
  BEFORE INSERT ON public.trabalhos
  FOR EACH ROW
  EXECUTE FUNCTION public.trabalhos_assign_numero_ordem();

-- Verificação: clientes de teste
SELECT id, nome_empresa, eh_teste
FROM public.clientes
WHERE eh_teste = true
ORDER BY nome_empresa;
