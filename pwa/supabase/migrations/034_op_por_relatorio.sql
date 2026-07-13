-- 034 — Uma OP por relatório (sequência partilhada com trabalhos)
-- Visitas deixam de consumir OP na criação; cada relatório aprovado recebe a sua.
-- Executar no Supabase → SQL Editor.

BEGIN;

ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS numero_ordem bigint;

CREATE UNIQUE INDEX IF NOT EXISTS relatorios_numero_ordem_unique_idx
  ON public.relatorios (numero_ordem)
  WHERE numero_ordem IS NOT NULL;

COMMENT ON COLUMN public.relatorios.numero_ordem IS
  'OP oficial do relatório (sequência partilhada com trabalhos).';

-- Copiar OP existente do trabalho ligado
UPDATE public.relatorios r
SET numero_ordem = t.numero_ordem
FROM public.trabalhos t
WHERE r.trabalho_id = t.id
  AND r.numero_ordem IS NULL
  AND t.numero_ordem IS NOT NULL;

-- Copiar OP legada guardada no formulário (dados.values)
UPDATE public.relatorios r
SET numero_ordem = NULLIF(
  regexp_replace(r.dados->'values'->>'numero_ordem', '\D', '', 'g'),
  ''
)::bigint
WHERE r.numero_ordem IS NULL
  AND (r.dados->'values'->>'numero_ordem') ~ '\d';

-- Relatórios aprovados sem OP própria → atribuir uma OP distinta por relatório
DO $$
DECLARE
  rec RECORD;
  new_op bigint;
BEGIN
  FOR rec IN
    SELECT r.id
    FROM public.relatorios r
    WHERE r.numero_ordem IS NULL
      AND r.estado = 'approved'
      AND NOT EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = r.cliente_id
          AND c.eh_teste = true
      )
    ORDER BY COALESCE(r.aprovado_em, r.submetido_em, r.criado_em), r.id
  LOOP
    new_op := nextval('public.trabalhos_numero_ordem_seq');
    UPDATE public.relatorios
    SET numero_ordem = new_op
    WHERE id = rec.id;
  END LOOP;
END $$;

SELECT setval(
  'public.trabalhos_numero_ordem_seq',
  GREATEST(
    COALESCE((SELECT MAX(numero_ordem) FROM public.trabalhos), 0),
    COALESCE((SELECT MAX(numero_ordem) FROM public.servicos), 0),
    COALESCE((SELECT MAX(numero_ordem) FROM public.relatorios), 0),
    1
  )
);

-- Visitas novas já não consomem número OP (fica no relatório na aprovação)
CREATE OR REPLACE FUNCTION public.servicos_assign_numero_ordem()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.numero_ordem := NULL;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.servicos_assign_numero_ordem() IS
  'Visitas não recebem OP na criação; cada relatório aprovado recebe numero_ordem próprio.';

-- Reserva atómica de OP para um relatório (antes de gerar o PDF na aprovação)
CREATE OR REPLACE FUNCTION public.assign_relatorio_numero_ordem(p_relatorio_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.relatorios%ROWTYPE;
  v_op bigint;
BEGIN
  SELECT * INTO v_row
  FROM public.relatorios
  WHERE id = p_relatorio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.numero_ordem IS NOT NULL THEN
    RETURN v_row.numero_ordem;
  END IF;

  IF v_row.trabalho_id IS NOT NULL THEN
    SELECT t.numero_ordem INTO v_op
    FROM public.trabalhos t
    WHERE t.id = v_row.trabalho_id;

    IF v_op IS NOT NULL THEN
      UPDATE public.relatorios
      SET numero_ordem = v_op
      WHERE id = p_relatorio_id;
      RETURN v_op;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = v_row.cliente_id
      AND c.eh_teste = true
  ) THEN
    RETURN NULL;
  END IF;

  v_op := nextval('public.trabalhos_numero_ordem_seq');

  UPDATE public.relatorios
  SET numero_ordem = v_op
  WHERE id = p_relatorio_id;

  RETURN v_op;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_relatorio_numero_ordem(uuid) TO authenticated;

COMMENT ON FUNCTION public.assign_relatorio_numero_ordem(uuid) IS
  'Atribui ou devolve a OP oficial do relatório (sequência partilhada com trabalhos).';

COMMIT;
