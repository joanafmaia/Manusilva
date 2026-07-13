-- Backfill servico_id em relatórios legados (jobId = id da visita ou via trabalho.servico_id).
-- Alinha a BD com resolveServicoIdForReport no cliente (servicos-panel-utils / relatorios-db).

-- Legado: trabalho_id aponta directamente para o id do serviço/visita
UPDATE public.relatorios r
SET
  servico_id = r.trabalho_id,
  atualizado_em = now()
WHERE r.servico_id IS NULL
  AND r.trabalho_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.servicos s WHERE s.id = r.trabalho_id
  );

-- Via trabalho com servico_id
UPDATE public.relatorios r
SET
  servico_id = t.servico_id,
  atualizado_em = now()
FROM public.trabalhos t
WHERE r.servico_id IS NULL
  AND r.trabalho_id = t.id
  AND t.servico_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.servicos s WHERE s.id = t.servico_id
  );

-- Relatórios aprovados ligados a visita: faturação via serviço
UPDATE public.relatorios r
SET
  faturacao_status = 'via_servico',
  atualizado_em = now()
WHERE r.servico_id IS NOT NULL
  AND r.estado = 'approved'
  AND COALESCE(r.faturacao_status, '') NOT IN ('via_servico', 'faturado', 'dispensado');
