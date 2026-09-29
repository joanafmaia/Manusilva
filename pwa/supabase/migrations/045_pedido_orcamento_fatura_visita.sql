-- 045 — Pedido de orçamento no relatório: faturar a visita, não a proposta.
-- Pré-requisito: 021.
-- Executar no Supabase → SQL Editor.
--
-- REGRA: «Por faturar» como Proposta = só MS.015 criado pelo RH sem relatório
--        (tipo proposta_ms015_rh / orcamentoOrigem rh_standalone).
--        Se o técnico pediu orçamento no relatório da visita, a fatura é da visita.

BEGIN;

-- Relatórios de visita com pedido_orcamento=Sim ainda na fila de proposta
UPDATE public.relatorios r
SET
  faturacao_status = 'via_servico',
  dados = COALESCE(r.dados, '{}'::jsonb) || jsonb_build_object(
    'faturacaoOrigem', 'via_servico_visita'
  ),
  atualizado_em = now()
WHERE r.estado = 'approved'
  AND COALESCE(r.faturacao_status, '') NOT IN ('faturado', 'via_servico', 'dispensado')
  AND lower(trim(COALESCE(r.dados -> 'values' ->> 'pedido_orcamento', ''))) = 'sim'
  AND r.tipo_servico IS DISTINCT FROM 'proposta_ms015_rh'
  AND COALESCE(r.dados ->> 'orcamentoOrigem', '') NOT IN ('rh_standalone', 'folha_obra_rc');

-- Visitas com esses relatórios, ainda não faturadas, passam a «por faturar»
UPDATE public.servicos s
SET
  faturacao_status = 'pendente',
  atualizado_em = now()
WHERE COALESCE(s.faturacao_status, '') NOT IN ('faturado', 'dispensado')
  AND EXISTS (
    SELECT 1
    FROM public.relatorios r
    WHERE r.servico_id = s.id
      AND r.estado = 'approved'
      AND lower(trim(COALESCE(r.dados -> 'values' ->> 'pedido_orcamento', ''))) = 'sim'
      AND r.tipo_servico IS DISTINCT FROM 'proposta_ms015_rh'
      AND COALESCE(r.dados ->> 'orcamentoOrigem', '') NOT IN ('rh_standalone', 'folha_obra_rc')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.relatorios r
    WHERE r.servico_id = s.id
      AND r.estado NOT IN ('approved', 'rejected')
  );

COMMIT;

-- Verificação
SELECT 'propostas_pedido_ainda_por_faturar' AS check_name, COUNT(*) AS n
FROM public.relatorios r
WHERE r.estado = 'approved'
  AND COALESCE(r.faturacao_status, '') IN ('pendente', 'aguarda_aceite_orcamento', '')
  AND lower(trim(COALESCE(r.dados -> 'values' ->> 'pedido_orcamento', ''))) = 'sim'
  AND r.tipo_servico IS DISTINCT FROM 'proposta_ms015_rh'
  AND COALESCE(r.dados ->> 'orcamentoOrigem', '') NOT IN ('rh_standalone', 'folha_obra_rc');
