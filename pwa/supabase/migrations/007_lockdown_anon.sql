-- 007 — Lockdown role anon (trabalhos, relatórios, clientes, storage fotos)
-- Pré-requisito: 006_rh_admin_roles.sql
-- Após aplicar: a app deve usar Supabase Auth (sessão authenticated), não anon.

-- ─── trabalhos: remover acesso anon ───
DROP POLICY IF EXISTS "anon_all_trabalhos" ON public.trabalhos;

DROP POLICY IF EXISTS "authenticated_all_trabalhos" ON public.trabalhos;
CREATE POLICY "authenticated_all_trabalhos"
  ON public.trabalhos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── relatórios: remover acesso anon ───
DROP POLICY IF EXISTS "anon_all_relatorios" ON public.relatorios;

DROP POLICY IF EXISTS "authenticated_all_relatorios" ON public.relatorios;
CREATE POLICY "authenticated_all_relatorios"
  ON public.relatorios FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── clientes: leitura só authenticated (combobox / catálogo) ───
DROP POLICY IF EXISTS "anon_read_clientes" ON public.clientes;
DROP POLICY IF EXISTS "anon_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "anon_update_clientes" ON public.clientes;

DROP POLICY IF EXISTS "authenticated_read_clientes" ON public.clientes;
CREATE POLICY "authenticated_read_clientes"
  ON public.clientes FOR SELECT TO authenticated
  USING (true);

-- Escrita RH: mantém políticas de 006 (rh_insert_clientes / rh_update_clientes)

-- ─── storage fotos_trabalhos: remover acesso anon ───
DROP POLICY IF EXISTS "anon_all_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_upload_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_fotos_trabalhos" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_fotos_trabalhos" ON storage.objects;

DROP POLICY IF EXISTS "authenticated_all_fotos_trabalhos" ON storage.objects;
CREATE POLICY "authenticated_all_fotos_trabalhos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');
