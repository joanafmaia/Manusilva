-- 001 — Schema base da tabela clientes (referência no repositório)
-- Executar no Supabase → SQL Editor (projeto ManuSilva)

CREATE TABLE IF NOT EXISTS public.clientes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome_empresa text NOT NULL,
  nif text,
  email text,
  morada text,
  codigo_postal text,
  localidade text,
  telemovel text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clientes_nome_idx ON public.clientes (nome_empresa);
CREATE INDEX IF NOT EXISTS clientes_nif_idx ON public.clientes (nif);
CREATE INDEX IF NOT EXISTS clientes_email_idx ON public.clientes (email);
