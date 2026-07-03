-- 021 — Propostas comerciais fora de «Por faturar» + visita OP-43 (Quinta Da Foz)
--
-- REGRA: «Por faturar» = relatórios técnicos (incl. pedido de orçamento = Sim).
--        Propostas MS.015 (tipo proposta_ms015_rh) = aba Orçamentos, não Faturação.
--
-- Executar no Supabase → SQL Editor (projeto ManuSilva).
-- 1) PRÉ-VISUALIZAÇÃO → 2) APLICAR → 3) VERIFICAÇÃO

-- ═══════════════════════════════════════════════════════════════════
-- PRÉ-VISUALIZAÇÃO — só propostas comerciais (não relatórios técnicos)
-- ═══════════════════════════════════════════════════════════════════

SELECT
  r.id AS relatorio_id,
  COALESCE(t.numero_ordem, s.numero_ordem) AS op,
  c.nome_empresa AS cliente,
  r.tipo_servico,
  r.estado,
  r.faturacao_status,
  r.dados->>'orcamentoOrigem' AS orcamento_origem
FROM public.relatorios r
LEFT JOIN public.trabalhos t ON t.id = r.trabalho_id
LEFT JOIN public.servicos s ON s.id = r.servico_id
LEFT JOIN public.clientes c ON c.id = COALESCE(r.cliente_id, t.cliente_id, s.cliente_id)
WHERE r.estado = 'approved'
  AND COALESCE(r.faturacao_status, '') NOT IN ('faturado', 'via_servico', 'dispensado')
  AND (
    r.tipo_servico = 'proposta_ms015_rh'
    OR r.dados->>'orcamentoOrigem' = 'rh_standalone'
  )
ORDER BY op NULLS LAST, cliente;

-- ═══════════════════════════════════════════════════════════════════
-- PRÉ-VISUALIZAÇÃO — OP 43 / Quinta Da Foz (visita + relatórios)
-- ═══════════════════════════════════════════════════════════════════

SELECT
  s.id AS servico_id,
  s.numero_ordem,
  s.data,
  s.estado AS servico_estado,
  s.faturacao_status AS servico_faturacao,
  s.numero_fatura,
  c.nome_empresa
FROM public.servicos s
LEFT JOIN public.clientes c ON c.id = s.cliente_id
WHERE s.numero_ordem = 43
   OR (c.nome_empresa ILIKE '%quinta%foz%' AND s.data = DATE '2026-06-29')
ORDER BY s.numero_ordem;

SELECT
  r.id AS relatorio_id,
  r.estado,
  r.tipo_servico,
  r.servico_id,
  r.trabalho_id,
  t.numero_ordem AS op_trabalho,
  t.servico_id AS trabalho_servico_id,
  r.faturacao_status,
  c.nome_empresa
FROM public.relatorios r
LEFT JOIN public.trabalhos t ON t.id = r.trabalho_id
LEFT JOIN public.servicos s ON s.id = COALESCE(r.servico_id, t.servico_id)
LEFT JOIN public.clientes c ON c.id = COALESCE(r.cliente_id, t.cliente_id, s.cliente_id)
WHERE t.numero_ordem = 43
   OR s.numero_ordem = 43
   OR (c.nome_empresa ILIKE '%quinta%foz%' AND COALESCE(s.data, t.data) = DATE '2026-06-29')
ORDER BY r.estado, r.criado_em;

-- ═══════════════════════════════════════════════════════════════════
-- APLICAR — propostas comerciais fora de «Por faturar»
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- (Removido: não repor pedido_orcamento=Sim para «pendente» — esses relatórios
--  ficam em Orçamentos até aceite do cliente; ver billing-workflow.js)

UPDATE public.relatorios r
SET
  faturacao_status = 'dispensado',
  atualizado_em = now()
WHERE r.estado = 'approved'
  AND COALESCE(r.faturacao_status, '') NOT IN ('faturado', 'via_servico', 'dispensado')
  AND (
    r.tipo_servico = 'proposta_ms015_rh'
    OR r.dados->>'orcamentoOrigem' = 'rh_standalone'
  );

-- Duplicado técnico na mesma OP que já tem proposta comercial → dispensar só o duplicado técnico
UPDATE public.relatorios r_tech
SET
  faturacao_status = 'dispensado',
  atualizado_em = now()
FROM public.trabalhos t_tech
WHERE r_tech.trabalho_id = t_tech.id
  AND r_tech.estado = 'approved'
  AND COALESCE(r_tech.faturacao_status, '') NOT IN ('faturado', 'via_servico', 'dispensado')
  AND r_tech.servico_id IS NULL
  AND r_tech.tipo_servico IS DISTINCT FROM 'proposta_ms015_rh'
  AND t_tech.numero_ordem IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.relatorios r_prop
    LEFT JOIN public.trabalhos t_prop ON t_prop.id = r_prop.trabalho_id
    WHERE COALESCE(t_prop.numero_ordem, 0) = t_tech.numero_ordem
      AND r_prop.id <> r_tech.id
      AND (
        r_prop.tipo_servico = 'proposta_ms015_rh'
        OR r_prop.dados->>'orcamentoOrigem' = 'rh_standalone'
      )
  );

-- ═══════════════════════════════════════════════════════════════════
-- APLICAR — OP 43 Quinta Da Foz: visita concluída + relatório ligado
-- ═══════════════════════════════════════════════════════════════════

-- Ligar trabalhos da OP 43 ao serviço da visita
UPDATE public.trabalhos t
SET
  servico_id = s.id,
  estado = CASE WHEN t.estado IN ('scheduled', 'in_progress') THEN 'completed' ELSE t.estado END,
  atualizado_em = now()
FROM public.servicos s
WHERE s.numero_ordem = 43
  AND t.numero_ordem = 43
  AND (t.servico_id IS NULL OR t.servico_id IS DISTINCT FROM s.id);

-- Ligar relatórios aprovados ao serviço (via trabalho ou OP+cliente)
UPDATE public.relatorios r
SET
  servico_id = s.id,
  faturacao_status = CASE
    WHEN COALESCE(s.faturacao_status, '') = 'faturado' THEN 'via_servico'
    ELSE r.faturacao_status
  END,
  atualizado_em = now()
FROM public.servicos s
JOIN public.trabalhos t ON t.numero_ordem = s.numero_ordem
WHERE s.numero_ordem = 43
  AND r.trabalho_id = t.id
  AND r.estado = 'approved'
  AND (r.servico_id IS NULL OR r.servico_id IS DISTINCT FROM s.id);

-- Relatórios aprovados órfãos (mesmo cliente + OP no formulário)
UPDATE public.relatorios r
SET
  servico_id = s.id,
  faturacao_status = CASE
    WHEN COALESCE(s.faturacao_status, '') = 'faturado' THEN 'via_servico'
    ELSE r.faturacao_status
  END,
  atualizado_em = now()
FROM public.servicos s
JOIN public.clientes c ON c.id = s.cliente_id
WHERE s.numero_ordem = 43
  AND r.estado = 'approved'
  AND r.servico_id IS NULL
  AND r.cliente_id = s.cliente_id
  AND (
    regexp_replace(COALESCE(r.dados->'values'->>'numero_ordem', ''), '\D', '', 'g') = '43'
    OR r.tipo_servico = 'manutencao_preventiva_empilhadores'
  );

-- Eliminar rascunhos obsoletos na visita OP 43 (mantém aprovados)
DELETE FROM public.relatorios r
USING public.servicos s
WHERE s.numero_ordem = 43
  AND (
    r.servico_id = s.id
    OR r.id IN (
      SELECT r2.id
      FROM public.relatorios r2
      JOIN public.trabalhos t2 ON t2.id = r2.trabalho_id
      WHERE t2.numero_ordem = 43 AND r2.estado = 'draft'
    )
  )
  AND r.estado = 'draft'
  AND EXISTS (
    SELECT 1 FROM public.relatorios ra
    WHERE ra.servico_id = s.id AND ra.estado = 'approved'
  );

-- Atualizar estado da visita (se já faturada ou todos relatórios aprovados)
UPDATE public.servicos s
SET
  estado = 'approved',
  aprovado_em = COALESCE(
    s.aprovado_em,
    (SELECT max(r.aprovado_em) FROM public.relatorios r WHERE r.servico_id = s.id AND r.estado = 'approved')
  ),
  email_cliente_enviado_em = COALESCE(
    s.email_cliente_enviado_em,
    NULLIF(s.dados->>'visitClienteEmailSentAt', '')::timestamptz,
    (SELECT NULLIF(max(r.dados->>'visitClienteEmailSentAt'), '')::timestamptz
     FROM public.relatorios r WHERE r.servico_id = s.id)
  ),
  atualizado_em = now()
WHERE s.numero_ordem = 43
  AND (
    s.faturacao_status = 'faturado'
    OR NOT EXISTS (
      SELECT 1 FROM public.relatorios r
      WHERE r.servico_id = s.id AND r.estado NOT IN ('approved', 'rejected')
    )
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de APLICAR)
-- ═══════════════════════════════════════════════════════════════════

SELECT 'propostas_ainda_por_faturar' AS check_name, COUNT(*) AS n
FROM public.relatorios r
WHERE r.estado = 'approved'
  AND COALESCE(r.faturacao_status, '') IN ('pendente', '')
  AND r.servico_id IS NULL
  AND (
    r.tipo_servico = 'proposta_ms015_rh'
    OR r.dados->>'orcamentoOrigem' = 'rh_standalone'
  );

SELECT 'op43_servico' AS check_name, s.estado, s.faturacao_status, s.numero_fatura,
       (SELECT COUNT(*) FROM public.relatorios r WHERE r.servico_id = s.id AND r.estado = 'approved') AS relatorios_aprovados
FROM public.servicos s
WHERE s.numero_ordem = 43;
