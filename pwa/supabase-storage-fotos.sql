-- ═══════════════════════════════════════════════════════════════════
-- Fotos Antes/Depois — bucket fotos_trabalhos
-- Supabase → SQL Editor → colar TUDO → Run
-- ═══════════════════════════════════════════════════════════════════
--
-- Se ainda falhar no Dashboard:
--   Storage → fotos_trabalhos → Configuration → Public bucket = ON
--   Allowed MIME types = vazio (ou image/jpeg, image/png, image/webp)
--
-- Com login Supabase Auth a app usa role "authenticated" (não "anon").

-- 1) Bucket público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos_trabalhos', 'fotos_trabalhos', true, 10485760, NULL)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) RLS em storage.objects (já vem ativo no Supabase; garantir)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3) Remover políticas antigas (evita conflitos)
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

-- 4) anon — sem sessão Auth
CREATE POLICY "anon_all_fotos_trabalhos"
  ON storage.objects
  FOR ALL
  TO anon
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');

-- 5) authenticated — com login da equipa (o caso habitual)
CREATE POLICY "authenticated_all_fotos_trabalhos"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');

-- 6) Colunas na tabela trabalhos
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_antes text;
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS foto_depois text;

-- 7) Verificação (deve listar 2 políticas para fotos_trabalhos)
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%fotos_trabalhos%'
ORDER BY policyname;
