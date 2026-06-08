-- Supabase Storage — bucket público para PDFs de trabalhos
-- Dashboard → Storage → New bucket: id = pdfs_trabalhos, Public bucket = ON
-- Depois executa este SQL no SQL Editor.

INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs_trabalhos', 'pdfs_trabalhos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "anon_upload_pdfs_trabalhos" ON storage.objects;
CREATE POLICY "anon_upload_pdfs_trabalhos"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'pdfs_trabalhos');

DROP POLICY IF EXISTS "anon_update_pdfs_trabalhos" ON storage.objects;
CREATE POLICY "anon_update_pdfs_trabalhos"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'pdfs_trabalhos')
  WITH CHECK (bucket_id = 'pdfs_trabalhos');

DROP POLICY IF EXISTS "anon_read_pdfs_trabalhos" ON storage.objects;
CREATE POLICY "anon_read_pdfs_trabalhos"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'pdfs_trabalhos');

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
