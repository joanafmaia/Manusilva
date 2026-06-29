-- 017 — Fase 2 auditoria: storage PDFs sem anon + auditoria clientes só RH
-- Pré-requisito: 006_rh_admin_roles.sql, 007_lockdown_anon.sql

-- ─── Storage PDFs: remover acesso anon (alinhar com fotos_trabalhos) ───
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

-- ─── Auditoria de clientes: inserção só RH ───
DROP POLICY IF EXISTS "authenticated_insert_cliente_alteracoes" ON public.cliente_alteracoes;
CREATE POLICY "rh_insert_cliente_alteracoes"
  ON public.cliente_alteracoes FOR INSERT TO authenticated
  WITH CHECK (public.is_rh_admin());
