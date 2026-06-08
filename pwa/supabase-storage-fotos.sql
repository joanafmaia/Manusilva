-- ═══════════════════════════════════════════════════════════════════
-- Fotos Antes/Depois — bucket fotos_trabalhos
-- Supabase → SQL Editor → colar TUDO → Run
-- ═══════════════════════════════════════════════════════════════════
--
-- NOTA: Não uses ALTER TABLE storage.objects — dá erro 42501
--       ("must be owner of table objects"). O RLS já vem ativo no Supabase.
--
-- Se o bucket já existir no Dashboard, podes saltar o bloco 1.
-- Storage → fotos_trabalhos → Public bucket = ON

-- ─── 1) Bucket público (ignora erro se já criaste no Dashboard) ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos_trabalhos', 'fotos_trabalhos', true, 10485760, NULL)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ─── 2) Políticas Storage (anon + authenticated) ───
DROP POLICY IF EXISTS "anon_upload_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_all_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_upload_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_all_fotos_trabalhos" ON storage.objects;

CREATE POLICY "anon_all_fotos_trabalhos"
  ON storage.objects
  FOR ALL
  TO anon
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');

CREATE POLICY "authenticated_all_fotos_trabalhos"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');

-- ─── 3) Colunas na tabela trabalhos ───
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_antes text;
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_depois text;

-- ─── 4) Verificação (deve listar 2 políticas) ───
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%fotos_trabalhos%'
ORDER BY policyname;
