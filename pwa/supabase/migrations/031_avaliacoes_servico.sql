-- Avaliação do cliente por visita (serviço) — 1 score por servico_id

CREATE TABLE IF NOT EXISTS public.avaliacoes_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  cliente_id bigint REFERENCES public.clientes(id) ON DELETE SET NULL,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 3),
  comentario text,
  email_destino text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avaliacoes_servico_servico_unique UNIQUE (servico_id)
);

COMMENT ON TABLE public.avaliacoes_servico IS
  'Avaliação do cliente após visita técnica. score: 1=insatisfeito, 2=regular, 3=satisfeito.';
COMMENT ON COLUMN public.avaliacoes_servico.score IS '1=vermelho, 2=amarelo, 3=verde';

CREATE INDEX IF NOT EXISTS avaliacoes_servico_cliente_idx ON public.avaliacoes_servico (cliente_id);
CREATE INDEX IF NOT EXISTS avaliacoes_servico_score_idx ON public.avaliacoes_servico (score);
CREATE INDEX IF NOT EXISTS avaliacoes_servico_criado_idx ON public.avaliacoes_servico (criado_em DESC);

ALTER TABLE public.avaliacoes_servico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS avaliacoes_servico_select_rh ON public.avaliacoes_servico;
CREATE POLICY avaliacoes_servico_select_rh ON public.avaliacoes_servico
  FOR SELECT TO authenticated
  USING (public.is_rh_admin());

-- Inserções apenas via API com service role (sem policy para authenticated)
