-- Supabase Storage — bucket público para PDFs de trabalhos
-- Dashboard → Storage → New bucket: id = pdfs_trabalhos, Public bucket = ON
-- Depois executa este SQL no SQL Editor (ou migração 017_phase2_security.sql).

INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs_trabalhos', 'pdfs_trabalhos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Sem acesso anon — apenas authenticated (Fase 2 auditoria)
DROP POLICY IF EXISTS "anon_upload_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_pdfs_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_pdfs_trabalhos" ON storage.objects;

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
