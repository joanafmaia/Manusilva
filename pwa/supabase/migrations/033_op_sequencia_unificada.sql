-- 033 — Uma única sequência de OP (trabalhos + visitas/servicos)
-- Corrige saltos (ex.: última aprovação OP-77 e visita com OP-85).
-- Executar no Supabase → SQL Editor.

BEGIN;

-- Servicos deixam de usar IDENTITY próprio; passam à mesma sequência que trabalhos.
ALTER TABLE public.servicos
  ALTER COLUMN numero_ordem DROP IDENTITY IF EXISTS;

ALTER TABLE public.servicos
  ALTER COLUMN numero_ordem DROP NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.trabalhos_numero_ordem_seq;

CREATE OR REPLACE FUNCTION public.servicos_assign_numero_ordem()
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

DROP TRIGGER IF EXISTS servicos_assign_numero_ordem_trigger ON public.servicos;

CREATE TRIGGER servicos_assign_numero_ordem_trigger
  BEFORE INSERT ON public.servicos
  FOR EACH ROW
  EXECUTE FUNCTION public.servicos_assign_numero_ordem();

-- Alinhar sequência ao maior OP já usado (trabalhos ou visitas).
SELECT setval(
  'public.trabalhos_numero_ordem_seq',
  GREATEST(
    COALESCE((SELECT MAX(numero_ordem) FROM public.trabalhos), 0),
    COALESCE((SELECT MAX(numero_ordem) FROM public.servicos), 0),
    1
  )
);

COMMENT ON FUNCTION public.servicos_assign_numero_ordem() IS
  'Atribui numero_ordem da sequência partilhada com trabalhos; clientes teste ficam sem OP.';

COMMIT;
