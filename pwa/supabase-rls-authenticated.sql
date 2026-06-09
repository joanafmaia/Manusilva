-- RLS para utilizadores com Supabase Auth (role = authenticated)
-- Executar no SQL Editor DEPOIS de supabase-schema-operacoes.sql
-- Corrige: "Sem permissão na tabela trabalhos (RLS)" após login da equipa

-- ─── trabalhos ───
DROP POLICY IF EXISTS "authenticated_all_trabalhos" ON public.trabalhos;
CREATE POLICY "authenticated_all_trabalhos"
  ON public.trabalhos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── relatorios ───
DROP POLICY IF EXISTS "authenticated_all_relatorios" ON public.relatorios;
CREATE POLICY "authenticated_all_relatorios"
  ON public.relatorios
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── clientes (leitura + escrita só RH) — ver também pwa/supabase-rls-clientes.sql ───
DROP POLICY IF EXISTS "authenticated_read_clientes" ON public.clientes;
CREATE POLICY "authenticated_read_clientes"
  ON public.clientes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_update_clientes" ON public.clientes;

CREATE OR REPLACE FUNCTION public.is_rh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL THEN false
    ELSE
      COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
        'RH', 'rh', 'admin', 'Admin', 'ADMIN', 'administracao', 'Administracao'
      )
      OR lower(COALESCE(auth.jwt() -> 'user_metadata' ->> 'nome', '')) IN ('joana', 'filipa')
      OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
        'joanamaia97@gmail.com',
        'filipa@rh.manusilva.internal'
      )
  END;
$$;

CREATE POLICY "rh_insert_clientes"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "rh_update_clientes"
  ON public.clientes FOR UPDATE TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

-- ─── Storage PDFs ───
DROP POLICY IF EXISTS "authenticated_upload_pdfs_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_upload_pdfs_trabalhos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pdfs_trabalhos');

DROP POLICY IF EXISTS "authenticated_update_pdfs_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_update_pdfs_trabalhos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pdfs_trabalhos')
  WITH CHECK (bucket_id = 'pdfs_trabalhos');

DROP POLICY IF EXISTS "authenticated_read_pdfs_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_read_pdfs_trabalhos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pdfs_trabalhos');

-- ─── Storage fotos (ver também pwa/supabase-storage-fotos.sql) ───
DROP POLICY IF EXISTS "authenticated_all_fotos_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_all_fotos_trabalhos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');
