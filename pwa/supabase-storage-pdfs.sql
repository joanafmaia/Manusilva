-- ═══════════════════════════════════════════════════════════════════
-- PDFs de relatórios — bucket pdfs_trabalhos
-- Supabase → SQL Editor → colar TUDO → Run
-- ═══════════════════════════════════════════════════════════════════
--
-- Pacote único para o SQL Editor: pwa/supabase-permissoes.sql
-- (Storage PDFs + fotos + RLS de todas as tabelas).
-- NOTA: Não uses ALTER TABLE storage.objects — dá erro 42501.

-- ─── 1) Bucket público ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs_trabalhos', 'pdfs_trabalhos', true, 8388608, NULL)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit;

-- ─── 2) Políticas (authenticated: ler/escrever/apagar; público: ler URL) ───
DROP POLICY IF EXISTS "anon_upload_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_upload_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_all_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "public_read_pdfs_trabalhos" ON storage.objects;

CREATE POLICY "authenticated_all_pdfs_trabalhos"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'pdfs_trabalhos')
  WITH CHECK (bucket_id = 'pdfs_trabalhos');

-- Leitura pública das URLs enviadas por e-mail (bucket public).
CREATE POLICY "public_read_pdfs_trabalhos"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'pdfs_trabalhos');

-- ─── 3) Verificação ───
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%pdfs_trabalhos%'
ORDER BY policyname;
