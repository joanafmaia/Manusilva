-- 020 — Serviços: visita ao cliente com N relatórios, assinaturas partilhadas, faturação por serviço
-- Executar no Supabase → SQL Editor (bloco completo).
--
-- Modelo:
--   servicos     = visita (cliente + data + técnicos + assinaturas + faturação + e-mail)
--   relatorios   = N por serviço (tipo escolhido pelo técnico; aprovação/rejeição individual)
--   trabalhos    = legado (mantido); servico_id liga ao contentor; deixa de impor 1 relatório/trabalho

BEGIN;

-- ─── Tabela servicos ───
CREATE TABLE IF NOT EXISTS public.servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ordem bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  cliente_id bigint REFERENCES public.clientes(id) ON DELETE SET NULL,
  data date NOT NULL,
  hora time,
  /** Nomes dos técnicos atribuídos, ex.: «Hugo, Filipe» (igual a trabalhos.tecnico_id) */
  tecnico_ids text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'scheduled',
  nota_rejeicao text,
  submetido_em timestamptz,
  aprovado_em timestamptz,
  email_cliente_enviado_em timestamptz,
  faturacao_status text,
  numero_fatura text,
  data_fatura date,
  valor_faturado numeric(12, 2),
  condicao_pagamento text,
  status_recebimento text,
  data_vencimento date,
  data_recebimento date,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.servicos IS
  'Visita/serviço no cliente: agrupa vários relatórios, assinaturas partilhadas e faturação única.';
COMMENT ON COLUMN public.servicos.estado IS
  'scheduled | in_progress | pending_review | approved — derivado dos relatórios; ver app.';
COMMENT ON COLUMN public.servicos.dados IS
  'Assinaturas partilhadas (signatures), metadados da visita, etc.';

CREATE UNIQUE INDEX IF NOT EXISTS servicos_numero_ordem_unique_idx
  ON public.servicos (numero_ordem)
  WHERE numero_ordem IS NOT NULL;

CREATE INDEX IF NOT EXISTS servicos_data_idx ON public.servicos (data);
CREATE INDEX IF NOT EXISTS servicos_cliente_idx ON public.servicos (cliente_id);
CREATE INDEX IF NOT EXISTS servicos_estado_idx ON public.servicos (estado);
CREATE INDEX IF NOT EXISTS servicos_faturacao_status_idx ON public.servicos (faturacao_status);

-- ─── Migrar trabalhos existentes → servicos (mesmo UUID e mesmo numero_ordem) ───
INSERT INTO public.servicos (
  id,
  numero_ordem,
  cliente_id,
  data,
  hora,
  tecnico_ids,
  estado,
  nota_rejeicao,
  submetido_em,
  aprovado_em,
  dados,
  criado_em,
  atualizado_em
)
OVERRIDING SYSTEM VALUE
SELECT
  t.id,
  t.numero_ordem,
  t.cliente_id,
  t.data,
  t.hora,
  COALESCE(NULLIF(trim(t.tecnico_id), ''), '—'),
  CASE
    WHEN t.estado = 'completed' THEN 'approved'
    WHEN t.estado = 'rejected' THEN 'pending_review'
    WHEN EXISTS (
      SELECT 1 FROM public.relatorios r
      WHERE r.trabalho_id = t.id AND r.estado = 'pending_review'
    ) THEN 'pending_review'
    WHEN EXISTS (
      SELECT 1 FROM public.relatorios r
      WHERE r.trabalho_id = t.id AND r.estado IN ('draft', 'rejected')
    ) THEN 'in_progress'
    ELSE 'scheduled'
  END,
  t.nota_rejeicao,
  (SELECT max(r.submetido_em) FROM public.relatorios r WHERE r.trabalho_id = t.id),
  (SELECT max(r.aprovado_em) FROM public.relatorios r WHERE r.trabalho_id = t.id AND r.estado = 'approved'),
  '{}'::jsonb,
  t.criado_em,
  t.atualizado_em
FROM public.trabalhos t
ON CONFLICT (id) DO NOTHING;

-- Sincronizar numero_ordem dos serviços migrados com o trabalho de origem
DO $$
DECLARE
  seq bigint;
BEGIN
  SELECT COALESCE(max(numero_ordem), 0) INTO seq FROM public.servicos;
  PERFORM setval(
    pg_get_serial_sequence('public.servicos', 'numero_ordem'),
    GREATEST(seq, 1),
    true
  );
END $$;

-- Faturação: copiar do relatório aprovado (ou único) para o serviço
UPDATE public.servicos s
SET
  faturacao_status = r.faturacao_status,
  numero_fatura = r.numero_fatura,
  data_fatura = r.data_fatura,
  valor_faturado = r.valor_faturado,
  condicao_pagamento = r.condicao_pagamento,
  status_recebimento = r.status_recebimento,
  data_vencimento = r.data_vencimento,
  data_recebimento = r.data_recebimento,
  email_cliente_enviado_em = NULLIF(r.dados->>'visitClienteEmailSentAt', '')::timestamptz
FROM (
  SELECT DISTINCT ON (r.trabalho_id)
    r.trabalho_id,
    r.faturacao_status,
    r.numero_fatura,
    r.data_fatura,
    r.valor_faturado,
    r.condicao_pagamento,
    r.status_recebimento,
    r.data_vencimento,
    r.data_recebimento,
    r.dados
  FROM public.relatorios r
  WHERE r.trabalho_id IS NOT NULL
  ORDER BY
    r.trabalho_id,
    CASE r.estado WHEN 'approved' THEN 0 ELSE 1 END,
    r.aprovado_em DESC NULLS LAST,
    r.criado_em DESC
) r
WHERE s.id = r.trabalho_id;

-- ─── Relatórios: ligar ao serviço ───
ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS servico_id uuid REFERENCES public.servicos(id) ON DELETE CASCADE;

UPDATE public.relatorios r
SET servico_id = r.trabalho_id
WHERE r.servico_id IS NULL
  AND r.trabalho_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS relatorios_servico_idx ON public.relatorios (servico_id);

-- Permitir vários relatórios no mesmo serviço (remove limite 1 por trabalho)
DROP INDEX IF EXISTS public.relatorios_trabalho_id_unique_idx;

-- ─── Trabalhos: ligação ao serviço (legado) ───
ALTER TABLE public.trabalhos
  ADD COLUMN IF NOT EXISTS servico_id uuid REFERENCES public.servicos(id) ON DELETE SET NULL;

UPDATE public.trabalhos t
SET servico_id = t.id
WHERE t.servico_id IS NULL;

CREATE INDEX IF NOT EXISTS trabalhos_servico_idx ON public.trabalhos (servico_id);

-- tipo_servico deixa de ser obrigatório no trabalho legado (o tipo está em cada relatório)
ALTER TABLE public.trabalhos
  ALTER COLUMN tipo_servico DROP NOT NULL;

-- ─── RLS servicos ───
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_servicos" ON public.servicos;
CREATE POLICY "authenticated_all_servicos" ON public.servicos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
