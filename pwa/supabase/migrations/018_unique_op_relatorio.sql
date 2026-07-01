-- 018 — Um relatório por trabalho; OP oficial única (quando atribuída)
-- Executar no Supabase → SQL Editor.
-- Se o índice relatorios_trabalho_id_unique_idx falhar, há duplicados — ver consulta no fim.

CREATE UNIQUE INDEX IF NOT EXISTS relatorios_trabalho_id_unique_idx
  ON public.relatorios (trabalho_id)
  WHERE trabalho_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trabalhos_numero_ordem_unique_idx
  ON public.trabalhos (numero_ordem)
  WHERE numero_ordem IS NOT NULL;

-- Diagnóstico: OPs ou trabalhos duplicados (antes de limpar manualmente)
-- SELECT numero_ordem, COUNT(*) FROM public.trabalhos
-- WHERE numero_ordem IS NOT NULL GROUP BY numero_ordem HAVING COUNT(*) > 1;
--
-- SELECT trabalho_id, COUNT(*) FROM public.relatorios
-- WHERE trabalho_id IS NOT NULL GROUP BY trabalho_id HAVING COUNT(*) > 1;
