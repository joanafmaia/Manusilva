-- Supabase Storage — bucket público para fotos Antes/Depois
-- Dashboard → Storage → bucket id = fotos_trabalhos, Public = ON

INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos_trabalhos', 'fotos_trabalhos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- anon (sem login)
DROP POLICY IF EXISTS "anon_upload_fotos_trabalhos" ON storage.objects;
CREATE POLICY "anon_upload_fotos_trabalhos"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'fotos_trabalhos');

DROP POLICY IF EXISTS "anon_update_fotos_trabalhos" ON storage.objects;
CREATE POLICY "anon_update_fotos_trabalhos"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');

DROP POLICY IF EXISTS "anon_read_fotos_trabalhos" ON storage.objects;
CREATE POLICY "anon_read_fotos_trabalhos"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'fotos_trabalhos');

-- authenticated (com Supabase Auth)
DROP POLICY IF EXISTS "authenticated_upload_fotos_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_upload_fotos_trabalhos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos_trabalhos');

DROP POLICY IF EXISTS "authenticated_update_fotos_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_update_fotos_trabalhos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');

DROP POLICY IF EXISTS "authenticated_read_fotos_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_read_fotos_trabalhos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fotos_trabalhos');

-- Colunas em trabalhos (se ainda não existirem)
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_antes text;
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_depois text;
