-- Executar no Supabase → SQL Editor (projeto zhfbezrevosmbmcbyskw)
-- Permite à app (chave anon/publishable no browser) ler e inserir na tabela clientes.

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_clientes" ON public.clientes;
CREATE POLICY "anon_read_clientes"
  ON public.clientes
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_insert_clientes" ON public.clientes;
CREATE POLICY "anon_insert_clientes"
  ON public.clientes
  FOR INSERT
  TO anon
  WITH CHECK (true);
