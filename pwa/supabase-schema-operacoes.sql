-- ManuSilva — trabalhos e relatórios (histórico operacional)
-- Executar no Supabase → SQL Editor, DEPOIS de ter a tabela clientes.

-- ─── Trabalhos agendados (equivalente a manusilva_db.jobs) ───
CREATE TABLE IF NOT EXISTS public.trabalhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ordem bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  tecnico_id text NOT NULL,
  cliente_id bigint REFERENCES public.clientes(id) ON DELETE SET NULL,
  numero_serie text,
  tipo_servico text NOT NULL,
  data date NOT NULL,
  hora time,
  estado text NOT NULL DEFAULT 'scheduled',
  nota_rejeicao text,
  url_pdf text,
  foto_antes text,
  foto_depois text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Migração em bases já criadas:
-- ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS url_pdf text;

CREATE UNIQUE INDEX IF NOT EXISTS trabalhos_numero_ordem_idx ON public.trabalhos (numero_ordem);
CREATE INDEX IF NOT EXISTS trabalhos_data_idx ON public.trabalhos (data);
CREATE INDEX IF NOT EXISTS trabalhos_tecnico_idx ON public.trabalhos (tecnico_id);
CREATE INDEX IF NOT EXISTS trabalhos_cliente_idx ON public.trabalhos (cliente_id);

-- ─── Relatórios / intervenções (equivalente a manusilva_db.reports) ───
CREATE TABLE IF NOT EXISTS public.relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabalho_id uuid REFERENCES public.trabalhos(id) ON DELETE CASCADE,
  tecnico_id text NOT NULL,
  cliente_id bigint REFERENCES public.clientes(id) ON DELETE SET NULL,
  numero_serie text,
  tipo_servico text NOT NULL,
  estado text NOT NULL DEFAULT 'draft',
  submetido_em timestamptz,
  aprovado_em timestamptz,
  nome_pdf text,
  nota_rejeicao text,
  faturacao_status text,
  numero_fatura text,
  data_fatura date,
  valor_faturado numeric(12, 2),
  pagamento_status text,
  prazo_pagamento text,
  condicao_pagamento text,
  status_recebimento text,
  data_vencimento date,
  data_recebimento date,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relatorios_trabalho_idx ON public.relatorios (trabalho_id);
CREATE INDEX IF NOT EXISTS relatorios_estado_idx ON public.relatorios (estado);
CREATE INDEX IF NOT EXISTS relatorios_cliente_idx ON public.relatorios (cliente_id);

-- ─── RLS (apenas authenticated — ver migrations/007_lockdown_anon.sql) ───
ALTER TABLE public.trabalhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_trabalhos" ON public.trabalhos;
DROP POLICY IF EXISTS "anon_all_relatorios" ON public.relatorios;

DROP POLICY IF EXISTS "authenticated_all_trabalhos" ON public.trabalhos;
CREATE POLICY "authenticated_all_trabalhos" ON public.trabalhos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_relatorios" ON public.relatorios;
CREATE POLICY "authenticated_all_relatorios" ON public.relatorios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fotos grandes: usar Storage bucket "relatorios-fotos" (opcional, fase 2)
