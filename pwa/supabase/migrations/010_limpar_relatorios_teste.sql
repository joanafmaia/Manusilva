-- 010 — Limpar trabalhos e relatórios de teste (manter OP-2026-35)
--
-- Executar no Supabase → SQL Editor (projeto ManuSilva).
-- 1) Correr só o bloco «PRÉ-VISUALIZAÇÃO» e confirmar que OP-2026-35 fica na lista «A MANTER».
-- 2) Correr o bloco «ELIMINAR» dentro da mesma sessão.
--
-- Regras:
--   • Mantém o trabalho com numero_ordem = 35 (OP-2026-35).
--   • Elimina todos os outros trabalhos (relatórios associados caem em CASCADE).
--   • Elimina relatórios ligados a clientes «Cliente Teste» (mesmo que órfãos).
--   • NÃO apaga registos da tabela clientes (só operações).

-- ═══════════════════════════════════════════════════════════════════
-- PRÉ-VISUALIZAÇÃO — correr primeiro
-- ═══════════════════════════════════════════════════════════════════

-- Trabalhos que serão MANTIDOS
SELECT
  t.numero_ordem,
  'OP-2026-' || LPAD(t.numero_ordem::text, 2, '0') AS ordem,
  c.nome_empresa AS cliente,
  t.estado,
  t.data,
  t.id AS trabalho_id
FROM public.trabalhos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
WHERE t.numero_ordem = 35
  AND (
    c.id IS NULL
    OR LOWER(TRIM(c.nome_empresa)) NOT LIKE 'cliente teste%'
  );

-- Trabalhos que serão ELIMINADOS
SELECT
  t.numero_ordem,
  'OP-2026-' || LPAD(t.numero_ordem::text, 2, '0') AS ordem,
  c.nome_empresa AS cliente,
  t.estado,
  t.data,
  t.id AS trabalho_id
FROM public.trabalhos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
WHERE t.numero_ordem IS DISTINCT FROM 35
   OR (
     c.id IS NOT NULL
     AND LOWER(TRIM(c.nome_empresa)) LIKE 'cliente teste%'
   )
ORDER BY t.numero_ordem;

-- Relatórios que serão ELIMINADOS (inclui órfãos / cliente teste)
SELECT
  r.id AS relatorio_id,
  r.estado,
  t.numero_ordem,
  c.nome_empresa AS cliente,
  r.submetido_em,
  r.aprovado_em
FROM public.relatorios r
LEFT JOIN public.trabalhos t ON t.id = r.trabalho_id
LEFT JOIN public.clientes c ON c.id = COALESCE(r.cliente_id, t.cliente_id)
WHERE
  r.trabalho_id IS NULL
  OR t.numero_ordem IS DISTINCT FROM 35
  OR (
    c.id IS NOT NULL
    AND LOWER(TRIM(c.nome_empresa)) LIKE 'cliente teste%'
  )
ORDER BY t.numero_ordem NULLS LAST, r.criado_em;

-- Resumo
SELECT
  (SELECT COUNT(*) FROM public.trabalhos) AS trabalhos_atuais,
  (SELECT COUNT(*) FROM public.relatorios) AS relatorios_atuais,
  (SELECT COUNT(*) FROM public.trabalhos t
   LEFT JOIN public.clientes c ON c.id = t.cliente_id
   WHERE t.numero_ordem = 35
     AND (c.id IS NULL OR LOWER(TRIM(c.nome_empresa)) NOT LIKE 'cliente teste%')
  ) AS trabalhos_a_manter,
  (SELECT COUNT(*) FROM public.trabalhos t
   LEFT JOIN public.clientes c ON c.id = t.cliente_id
   WHERE t.numero_ordem IS DISTINCT FROM 35
      OR (c.id IS NOT NULL AND LOWER(TRIM(c.nome_empresa)) LIKE 'cliente teste%')
  ) AS trabalhos_a_apagar;

-- ═══════════════════════════════════════════════════════════════════
-- ELIMINAR — só depois de validar a pré-visualização
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Relatórios órfãos ou de teste (antes de apagar trabalhos)
DELETE FROM public.relatorios r
WHERE r.trabalho_id IS NULL
   OR r.cliente_id IN (
     SELECT id FROM public.clientes
     WHERE LOWER(TRIM(nome_empresa)) LIKE 'cliente teste%'
   )
   OR r.trabalho_id IN (
     SELECT t.id
     FROM public.trabalhos t
     LEFT JOIN public.clientes c ON c.id = t.cliente_id
     WHERE t.numero_ordem IS DISTINCT FROM 35
        OR (
          c.id IS NOT NULL
          AND LOWER(TRIM(c.nome_empresa)) LIKE 'cliente teste%'
        )
   );

-- Trabalhos de teste (CASCADE remove relatórios ainda ligados)
DELETE FROM public.trabalhos t
WHERE t.numero_ordem IS DISTINCT FROM 35
   OR t.cliente_id IN (
     SELECT id FROM public.clientes
     WHERE LOWER(TRIM(nome_empresa)) LIKE 'cliente teste%'
   );

COMMIT;

-- Verificação final (deve ficar 1 trabalho e 1+ relatório da OP-2026-35)
SELECT
  t.numero_ordem,
  'OP-2026-' || LPAD(t.numero_ordem::text, 2, '0') AS ordem,
  c.nome_empresa AS cliente,
  r.id AS relatorio_id,
  r.estado
FROM public.trabalhos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN public.relatorios r ON r.trabalho_id = t.id
ORDER BY t.numero_ordem;

-- ═══════════════════════════════════════════════════════════════════
-- STORAGE (opcional) — PDFs/fotos antigas no bucket
-- Dashboard → Storage → pdfs_trabalhos / relatorios-fotos
-- Pode apagar manualmente ficheiros que não sejam da ordem 35.
-- ═══════════════════════════════════════════════════════════════════
