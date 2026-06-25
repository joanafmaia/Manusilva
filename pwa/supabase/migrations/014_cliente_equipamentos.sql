-- 014 — Equipamentos por cliente (empilhadores, baterias, carregadores)
-- Histórico preenchido pelos técnicos nos relatórios; reutilizado em formulários futuros.

CREATE TABLE IF NOT EXISTS public.cliente_equipamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id bigint NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('empilhador', 'bateria', 'carregador')),
  chave text NOT NULL,
  marca text,
  modelo text,
  numero_serie text,
  matricula text,
  maquina text,
  tipo text,
  n_interno text,
  data_fabrico date,
  tensao_v text,
  densidade text,
  horas text,
  ultimo_servico text,
  ultima_intervencao_em timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (cliente_id, categoria, chave)
);

CREATE INDEX IF NOT EXISTS cliente_equipamentos_cliente_idx
  ON public.cliente_equipamentos (cliente_id);

CREATE INDEX IF NOT EXISTS cliente_equipamentos_cliente_cat_idx
  ON public.cliente_equipamentos (cliente_id, categoria);

COMMENT ON TABLE public.cliente_equipamentos IS
  'Equipamentos identificados em relatórios — pré-preenchimento em intervenções futuras do mesmo cliente.';

COMMENT ON COLUMN public.cliente_equipamentos.chave IS
  'Identificador normalizado (nº série, matrícula ou máquina) para upsert sem duplicar.';

ALTER TABLE public.cliente_equipamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_cliente_equipamentos" ON public.cliente_equipamentos;
CREATE POLICY "authenticated_all_cliente_equipamentos"
  ON public.cliente_equipamentos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
