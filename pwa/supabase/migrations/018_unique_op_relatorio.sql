-- 018 — Limpar duplicados e impor: 1 relatório por trabalho, 1 OP por número
-- Executar no Supabase → SQL Editor (bloco completo).

BEGIN;

-- ── Pré-visualizar (opcional; comentar o BEGIN/COMMIT e correr só isto) ──
-- SELECT r.trabalho_id, COUNT(*) AS n, array_agg(r.id ORDER BY r.criado_em) AS ids
-- FROM public.relatorios r
-- WHERE r.trabalho_id IS NOT NULL
-- GROUP BY r.trabalho_id HAVING COUNT(*) > 1;

-- 1) Relatórios duplicados no mesmo trabalho — mantém o «melhor» (igual à app)
WITH ranked AS (
  SELECT
    r.id,
    ROW_NUMBER() OVER (
      PARTITION BY r.trabalho_id
      ORDER BY
        CASE r.estado
          WHEN 'approved' THEN 50
          WHEN 'pending_review' THEN 40
          WHEN 'draft' THEN 30
          WHEN 'rejected' THEN 20
          ELSE 0
        END DESC,
        COALESCE(r.aprovado_em, r.submetido_em, r.criado_em) DESC NULLS LAST,
        CASE
          WHEN lower(COALESCE(r.dados->'values'->>'pedido_orcamento', '')) = 'sim' THEN 1
          ELSE 0
        END DESC,
        r.id
    ) AS rn
  FROM public.relatorios r
  WHERE r.trabalho_id IS NOT NULL
)
DELETE FROM public.relatorios r
USING ranked x
WHERE r.id = x.id
  AND x.rn > 1;

-- 2) Trabalhos com o mesmo numero_ordem — só remove extras SEM relatório
WITH ranked_jobs AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (
      PARTITION BY t.numero_ordem
      ORDER BY t.atualizado_em DESC NULLS LAST, t.criado_em DESC NULLS LAST, t.id
    ) AS rn
  FROM public.trabalhos t
  WHERE t.numero_ordem IS NOT NULL
)
DELETE FROM public.trabalhos t
USING ranked_jobs x
WHERE t.id = x.id
  AND x.rn > 1
  AND NOT EXISTS (
    SELECT 1 FROM public.relatorios r WHERE r.trabalho_id = t.id
  );

-- 3) Índices únicos
CREATE UNIQUE INDEX IF NOT EXISTS relatorios_trabalho_id_unique_idx
  ON public.relatorios (trabalho_id)
  WHERE trabalho_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trabalhos_numero_ordem_unique_idx
  ON public.trabalhos (numero_ordem)
  WHERE numero_ordem IS NOT NULL;

COMMIT;

-- Se o passo 3 falhar em trabalhos_numero_ordem, ainda há 2+ trabalhos com a mesma OP
-- e ambos com relatório. Diagnóstico:
--
-- SELECT t.numero_ordem, t.id, c.nome_empresa, r.id AS relatorio_id, r.estado
-- FROM public.trabalhos t
-- LEFT JOIN public.clientes c ON c.id = t.cliente_id
-- LEFT JOIN public.relatorios r ON r.trabalho_id = t.id
-- WHERE t.numero_ordem IN (
--   SELECT numero_ordem FROM public.trabalhos
--   WHERE numero_ordem IS NOT NULL
--   GROUP BY numero_ordem HAVING COUNT(*) > 1
-- )
-- ORDER BY t.numero_ordem, t.criado_em;
