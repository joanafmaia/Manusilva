-- 036 — Segurança: RLS relatórios/trabalhos, RPC OP só RH, is_rh_admin sem bypass por nome
-- Pré-requisito: 006, 007, 034
-- Executar no Supabase → SQL Editor.

BEGIN;

-- ─── is_rh_admin: role ou e-mail autorizado (sem bypass só por metadata.nome) ───
CREATE OR REPLACE FUNCTION public.is_rh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
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
  'True para RH/Admin (metadata.role ou e-mail autorizado).';

-- ─── OP por relatório: só RH pode reservar via RPC ───
CREATE OR REPLACE FUNCTION public.assign_relatorio_numero_ordem(p_relatorio_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.relatorios%ROWTYPE;
  v_op bigint;
BEGIN
  IF NOT public.is_rh_admin() THEN
    RAISE EXCEPTION 'Acesso reservado a Recursos Humanos / Administração'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.relatorios
  WHERE id = p_relatorio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.numero_ordem IS NOT NULL THEN
    RETURN v_row.numero_ordem;
  END IF;

  IF v_row.trabalho_id IS NOT NULL THEN
    SELECT t.numero_ordem INTO v_op
    FROM public.trabalhos t
    WHERE t.id = v_row.trabalho_id;

    IF v_op IS NOT NULL THEN
      UPDATE public.relatorios
      SET numero_ordem = v_op
      WHERE id = p_relatorio_id;
      RETURN v_op;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = v_row.cliente_id
      AND c.eh_teste = true
  ) THEN
    RETURN NULL;
  END IF;

  v_op := nextval('public.trabalhos_numero_ordem_seq');

  UPDATE public.relatorios
  SET numero_ordem = v_op
  WHERE id = p_relatorio_id;

  RETURN v_op;
END;
$$;

COMMENT ON FUNCTION public.assign_relatorio_numero_ordem(uuid) IS
  'Atribui ou devolve a OP oficial do relatório (apenas RH/Admin).';

-- ─── relatórios: RH total; técnicos leem/gravam rascunhos, não alteram aprovados ───
DROP POLICY IF EXISTS "authenticated_all_relatorios" ON public.relatorios;

CREATE POLICY "rh_all_relatorios"
  ON public.relatorios
  FOR ALL
  TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "auth_select_relatorios"
  ON public.relatorios
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth_insert_relatorios"
  ON public.relatorios
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_update_relatorios_open"
  ON public.relatorios
  FOR UPDATE
  TO authenticated
  USING (
    NOT public.is_rh_admin()
    AND estado IN ('draft', 'pending_review', 'rejected')
  )
  WITH CHECK (
    NOT public.is_rh_admin()
    AND estado IN ('draft', 'pending_review', 'rejected')
  );

-- ─── trabalhos: mesmo modelo (técnicos não alteram trabalhos concluídos) ───
DROP POLICY IF EXISTS "authenticated_all_trabalhos" ON public.trabalhos;

CREATE POLICY "rh_all_trabalhos"
  ON public.trabalhos
  FOR ALL
  TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "auth_select_trabalhos"
  ON public.trabalhos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth_insert_trabalhos"
  ON public.trabalhos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_update_trabalhos_open"
  ON public.trabalhos
  FOR UPDATE
  TO authenticated
  USING (
    NOT public.is_rh_admin()
    AND estado NOT IN ('completed', 'approved')
  )
  WITH CHECK (
    NOT public.is_rh_admin()
    AND estado NOT IN ('completed', 'approved')
  );

COMMIT;
