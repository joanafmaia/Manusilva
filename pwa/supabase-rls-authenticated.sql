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

-- ─── clientes (leitura + inserção) ───
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
