-- ═══════════════════════════════════════════════════════════════════
-- Permissões ManuSilva — colar TUDO no SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════
-- Pacote único: Storage (PDFs + fotos), RLS das tabelas, perfis RH/Armazém.
-- Idempotente. NÃO uses ALTER TABLE storage.objects (erro 42501).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1) Funções de perfil
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_rh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL THEN false
    ELSE
      COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
        'RH', 'rh', 'admin', 'Admin', 'ADMIN', 'administracao', 'Administracao'
      )
      OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN (
        'joanamaia97@gmail.com',
        'filipa@sistema.com',
        'filipa@rh.manusilva.internal'
      )
  END;
$$;

COMMENT ON FUNCTION public.is_rh_admin() IS
  'True para RH/Admin (metadata.role ou e-mail autorizado). Sem bypass só por nome.';

CREATE OR REPLACE FUNCTION public.is_rh_admin_or_warehouse()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL THEN false
    ELSE
      public.is_rh_admin()
      OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
        'Armazem', 'armazem', 'warehouse'
      )
  END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 2) Metadados Auth — Joana, Filipa, Armazém
-- ═══════════════════════════════════════════════════════════════════

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', 'RH',
  'nome', 'Joana'
)
WHERE lower(email) = 'joanamaia97@gmail.com';

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', 'RH',
  'nome', 'Filipa'
)
WHERE lower(email) IN ('filipa@sistema.com', 'filipa@rh.manusilva.internal');

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', 'Armazem',
  'nome', 'Armazém'
)
WHERE lower(email) = 'armazem@sistema.com';

-- ═══════════════════════════════════════════════════════════════════
-- 3) RPCs
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reservar_numero_orcamento(p_ano integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num integer;
BEGIN
  IF NOT public.is_rh_admin() THEN
    RAISE EXCEPTION 'Acesso reservado a Recursos Humanos / Administração'
      USING ERRCODE = '42501';
  END IF;

  IF p_ano IS NULL OR p_ano < 2000 OR p_ano > 2100 THEN
    RAISE EXCEPTION 'Ano de orçamento inválido: %', p_ano;
  END IF;

  INSERT INTO public.orcamento_numeracao (ano, ultimo_numero)
  VALUES (p_ano, 1)
  ON CONFLICT (ano) DO UPDATE
    SET ultimo_numero = public.orcamento_numeracao.ultimo_numero + 1,
        updated_at = now()
  RETURNING ultimo_numero INTO v_num;

  RETURN v_num;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_numero_orcamento(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_numero_orcamento(integer) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.assign_relatorio_numero_ordem(uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.assign_relatorio_numero_ordem(uuid) TO authenticated';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4) Storage — buckets públicos + políticas
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs_trabalhos', 'pdfs_trabalhos', true, 8388608, NULL)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos_trabalhos', 'fotos_trabalhos', true, 10485760, NULL)
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
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'pdfs_trabalhos')
  WITH CHECK (bucket_id = 'pdfs_trabalhos');

CREATE POLICY "public_read_pdfs_trabalhos"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'pdfs_trabalhos');

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
DROP POLICY IF EXISTS "public_read_fotos_trabalhos" ON storage.objects;

CREATE POLICY "authenticated_all_fotos_trabalhos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'fotos_trabalhos')
  WITH CHECK (bucket_id = 'fotos_trabalhos');

CREATE POLICY "public_read_fotos_trabalhos"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'fotos_trabalhos');

-- ═══════════════════════════════════════════════════════════════════
-- 5) RLS tabelas — anon sem acesso; authenticated conforme perfil
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabalhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_clientes" ON public.clientes;
DROP POLICY IF EXISTS "anon_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "anon_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_read_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "authenticated_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "rh_update_clientes" ON public.clientes;
DROP POLICY IF EXISTS "warehouse_insert_clientes" ON public.clientes;
DROP POLICY IF EXISTS "warehouse_update_clientes" ON public.clientes;

CREATE POLICY "authenticated_read_clientes"
  ON public.clientes FOR SELECT TO authenticated USING (true);

CREATE POLICY "warehouse_insert_clientes"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (public.is_rh_admin_or_warehouse());

CREATE POLICY "warehouse_update_clientes"
  ON public.clientes FOR UPDATE TO authenticated
  USING (public.is_rh_admin_or_warehouse())
  WITH CHECK (public.is_rh_admin_or_warehouse());

-- Relatórios: RH total; técnico lê/cria e só altera rascunhos/pendentes/rejeitados
DROP POLICY IF EXISTS "anon_all_relatorios" ON public.relatorios;
DROP POLICY IF EXISTS "authenticated_all_relatorios" ON public.relatorios;
DROP POLICY IF EXISTS "rh_all_relatorios" ON public.relatorios;
DROP POLICY IF EXISTS "auth_select_relatorios" ON public.relatorios;
DROP POLICY IF EXISTS "auth_insert_relatorios" ON public.relatorios;
DROP POLICY IF EXISTS "auth_update_relatorios_open" ON public.relatorios;

CREATE POLICY "rh_all_relatorios"
  ON public.relatorios FOR ALL TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "auth_select_relatorios"
  ON public.relatorios FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_relatorios"
  ON public.relatorios FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_relatorios_open"
  ON public.relatorios FOR UPDATE TO authenticated
  USING (
    NOT public.is_rh_admin()
    AND estado IN ('draft', 'pending_review', 'rejected')
  )
  WITH CHECK (
    NOT public.is_rh_admin()
    AND estado IN ('draft', 'pending_review', 'rejected')
  );

-- Trabalhos: RH total; técnico atualiza os que ainda não estão concluídos
DROP POLICY IF EXISTS "anon_all_trabalhos" ON public.trabalhos;
DROP POLICY IF EXISTS "authenticated_all_trabalhos" ON public.trabalhos;
DROP POLICY IF EXISTS "rh_all_trabalhos" ON public.trabalhos;
DROP POLICY IF EXISTS "auth_select_trabalhos" ON public.trabalhos;
DROP POLICY IF EXISTS "auth_insert_trabalhos" ON public.trabalhos;
DROP POLICY IF EXISTS "auth_update_trabalhos_open" ON public.trabalhos;

CREATE POLICY "rh_all_trabalhos"
  ON public.trabalhos FOR ALL TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "auth_select_trabalhos"
  ON public.trabalhos FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_trabalhos"
  ON public.trabalhos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_trabalhos_open"
  ON public.trabalhos FOR UPDATE TO authenticated
  USING (
    NOT public.is_rh_admin()
    AND estado NOT IN ('completed', 'approved')
  )
  WITH CHECK (NOT public.is_rh_admin());

DO $$
BEGIN
  IF to_regclass('public.servicos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_all_servicos" ON public.servicos';
    EXECUTE 'CREATE POLICY "authenticated_all_servicos" ON public.servicos FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.folhas_obra') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.folhas_obra ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_all_folhas_obra" ON public.folhas_obra';
    EXECUTE 'CREATE POLICY "authenticated_all_folhas_obra" ON public.folhas_obra FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.cliente_equipamentos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.cliente_equipamentos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_all_cliente_equipamentos" ON public.cliente_equipamentos';
    EXECUTE 'CREATE POLICY "authenticated_all_cliente_equipamentos" ON public.cliente_equipamentos FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  IF to_regclass('public.catalogo_produtos') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.catalogo_produtos ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_read_catalogo_produtos" ON public.catalogo_produtos';
    EXECUTE 'DROP POLICY IF EXISTS "rh_write_catalogo_produtos" ON public.catalogo_produtos';
    EXECUTE 'CREATE POLICY "authenticated_read_catalogo_produtos" ON public.catalogo_produtos FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "rh_write_catalogo_produtos" ON public.catalogo_produtos FOR ALL TO authenticated USING (public.is_rh_admin()) WITH CHECK (public.is_rh_admin())';
  END IF;

  IF to_regclass('public.orcamento_numeracao') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orcamento_numeracao ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_read_orcamento_numeracao" ON public.orcamento_numeracao';
    EXECUTE 'CREATE POLICY "authenticated_read_orcamento_numeracao" ON public.orcamento_numeracao FOR SELECT TO authenticated USING (true)';
  END IF;

  IF to_regclass('public.faturas_manuais') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.faturas_manuais ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_all_faturas_manuais" ON public.faturas_manuais';
    EXECUTE 'DROP POLICY IF EXISTS "rh_all_faturas_manuais" ON public.faturas_manuais';
    EXECUTE 'CREATE POLICY "rh_all_faturas_manuais" ON public.faturas_manuais FOR ALL TO authenticated USING (public.is_rh_admin()) WITH CHECK (public.is_rh_admin())';
  END IF;

  IF to_regclass('public.faturas_manuais_eliminadas') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.faturas_manuais_eliminadas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_read_faturas_manuais_eliminadas" ON public.faturas_manuais_eliminadas';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_insert_faturas_manuais_eliminadas" ON public.faturas_manuais_eliminadas';
    EXECUTE 'DROP POLICY IF EXISTS "rh_insert_faturas_manuais_eliminadas" ON public.faturas_manuais_eliminadas';
    EXECUTE 'CREATE POLICY "rh_insert_faturas_manuais_eliminadas" ON public.faturas_manuais_eliminadas FOR INSERT TO authenticated WITH CHECK (public.is_rh_admin())';
  END IF;

  IF to_regclass('public.avaliacoes_servico') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.avaliacoes_servico ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS avaliacoes_servico_select_rh ON public.avaliacoes_servico';
    EXECUTE 'CREATE POLICY avaliacoes_servico_select_rh ON public.avaliacoes_servico FOR SELECT TO authenticated USING (public.is_rh_admin())';
  END IF;

  IF to_regclass('public.cliente_alteracoes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.cliente_alteracoes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_insert_cliente_alteracoes" ON public.cliente_alteracoes';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_read_cliente_alteracoes" ON public.cliente_alteracoes';
    EXECUTE 'DROP POLICY IF EXISTS "rh_insert_cliente_alteracoes" ON public.cliente_alteracoes';
    EXECUTE 'DROP POLICY IF EXISTS "rh_read_cliente_alteracoes" ON public.cliente_alteracoes';
    EXECUTE 'DROP POLICY IF EXISTS "rh_or_warehouse_insert_cliente_alteracoes" ON public.cliente_alteracoes';
    EXECUTE 'CREATE POLICY "rh_or_warehouse_insert_cliente_alteracoes" ON public.cliente_alteracoes FOR INSERT TO authenticated WITH CHECK (public.is_rh_admin_or_warehouse())';
    EXECUTE 'CREATE POLICY "rh_read_cliente_alteracoes" ON public.cliente_alteracoes FOR SELECT TO authenticated USING (public.is_rh_admin())';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 6) Grants: anon sem tabelas da app; authenticated com DML
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes',
    'trabalhos',
    'relatorios',
    'servicos',
    'folhas_obra',
    'cliente_alteracoes',
    'cliente_equipamentos',
    'catalogo_produtos',
    'orcamento_numeracao',
    'faturas_manuais',
    'faturas_manuais_eliminadas',
    'avaliacoes_servico'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
        t
      );
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- Verificação (corre depois do COMMIT)
-- ═══════════════════════════════════════════════════════════════════

SELECT email,
       raw_user_meta_data ->> 'role' AS role,
       raw_user_meta_data ->> 'nome' AS nome
FROM auth.users
WHERE lower(email) IN (
  'joanamaia97@gmail.com',
  'filipa@sistema.com',
  'filipa@rh.manusilva.internal',
  'armazem@sistema.com'
)
ORDER BY email;

SELECT policyname, roles::text, cmd
FROM pg_policies
WHERE (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%trabalhos%')
   OR (schemaname = 'public' AND tablename IN (
     'clientes', 'relatorios', 'trabalhos', 'faturas_manuais', 'cliente_alteracoes'
   ))
ORDER BY schemaname, tablename, policyname;
