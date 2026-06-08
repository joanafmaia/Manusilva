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

DROP POLICY IF EXISTS "authenticated_read_clientes" ON public.clientes;
CREATE POLICY "authenticated_read_clientes"
  ON public.clientes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_insert_clientes" ON public.clientes;
CREATE POLICY "authenticated_insert_clientes"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- A coluna id já é IDENTITY: não uses DEFAULT/SEQUENCE manual.
-- Após importar ids 1..129, o próximo INSERT deve ser 130, 131, …
DO $$
DECLARE
  next_id bigint;
BEGIN
  SELECT COALESCE(MAX(id), 0) + 1 INTO next_id FROM public.clientes;
  EXECUTE format(
    'ALTER TABLE public.clientes ALTER COLUMN id RESTART WITH %s',
    next_id
  );
END $$;
