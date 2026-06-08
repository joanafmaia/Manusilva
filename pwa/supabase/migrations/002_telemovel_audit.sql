-- 002 — Telemóvel + tabela de auditoria de alterações a clientes

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telemovel text;

CREATE TABLE IF NOT EXISTS public.cliente_alteracoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id bigint NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  alterado_por text,
  origem text DEFAULT 'rh_ficha',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_alteracoes_cliente_idx
  ON public.cliente_alteracoes (cliente_id, created_at DESC);

ALTER TABLE public.cliente_alteracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_insert_cliente_alteracoes" ON public.cliente_alteracoes;
CREATE POLICY "authenticated_insert_cliente_alteracoes"
  ON public.cliente_alteracoes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_cliente_alteracoes" ON public.cliente_alteracoes;
CREATE POLICY "authenticated_read_cliente_alteracoes"
  ON public.cliente_alteracoes
  FOR SELECT
  TO authenticated
  USING (true);
