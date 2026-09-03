-- 039 — Storage PDFs: políticas completas (incl. DELETE) + leitura pública
-- Equivale a pwa/supabase-storage-pdfs.sql

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs_trabalhos', 'pdfs_trabalhos', true, 8388608, NULL)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit;

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

CREATE POLICY "public_read_pdfs_trabalhos"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'pdfs_trabalhos');

COMMIT;
