-- 003 — Endurecimento RLS: escrita em clientes só para RH (authenticated)
-- Requer user_metadata.role = 'RH' no Supabase Auth

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Leitura: equipa autenticada + anon (combobox técnico legado)
DROP POLICY IF EXISTS "anon_read_clientes" ON public.clientes;
CREATE POLICY "anon_read_clientes"
  ON public.clientes FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "authenticated_read_clientes" ON public.clientes;
CREATE POLICY "authenticated_read_clientes"
  ON public.clientes FOR SELECT TO authenticated USING (true);

-- Remover escrita anon (qualquer pessoa com a chave anon)
DROP POLICY IF EXISTS "anon_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "anon_update_clientes" ON public.clientes;

-- Inserção / atualização: apenas RH autenticado
DROP POLICY IF EXISTS "authenticated_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_update_clientes" ON public.clientes;

CREATE POLICY "rh_insert_clientes"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'RH');

CREATE POLICY "rh_update_clientes"
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'RH')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'RH');
