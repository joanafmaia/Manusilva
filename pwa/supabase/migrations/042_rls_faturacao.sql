-- 042 — RLS faturação: técnicos não alteram faturas; RH mantém acesso total.
-- Pré-requisito: 020, 022, 025, 036, 039
-- Executar no Supabase → SQL Editor.
--
-- Técnicos/armazém continuam a criar e a editar visitas e folhas enquanto o
-- trabalho está aberto. Não podem gravar número de fatura, valores nem
-- recebimentos. Faturas manuais: só RH.

BEGIN;

-- ─── Impede PATCH de colunas de fatura por contas que não são RH ───
CREATE OR REPLACE FUNCTION public.prevent_non_rh_invoice_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_rh_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.numero_fatura IS DISTINCT FROM OLD.numero_fatura
     OR NEW.data_fatura IS DISTINCT FROM OLD.data_fatura
     OR NEW.valor_faturado IS DISTINCT FROM OLD.valor_faturado
     OR NEW.valor_recebido IS DISTINCT FROM OLD.valor_recebido
     OR NEW.condicao_pagamento IS DISTINCT FROM OLD.condicao_pagamento
     OR NEW.status_recebimento IS DISTINCT FROM OLD.status_recebimento
     OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
     OR NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
  THEN
    RAISE EXCEPTION 'Só RH / Administração pode alterar dados de faturação'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.faturacao_status IS DISTINCT FROM OLD.faturacao_status
     AND COALESCE(NEW.faturacao_status, '') NOT IN ('', 'pendente', 'via_servico')
  THEN
    RAISE EXCEPTION 'Só RH / Administração pode alterar o estado de faturação'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_non_rh_invoice_fields() IS
  'Bloqueia número/valor/recebimento de fatura se o JWT não for RH. Permite fila pendente (oficina).';

DROP TRIGGER IF EXISTS trg_prevent_non_rh_invoice_servicos ON public.servicos;
CREATE TRIGGER trg_prevent_non_rh_invoice_servicos
  BEFORE UPDATE ON public.servicos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_non_rh_invoice_fields();

DROP TRIGGER IF EXISTS trg_prevent_non_rh_invoice_folhas ON public.folhas_obra;
CREATE TRIGGER trg_prevent_non_rh_invoice_folhas
  BEFORE UPDATE ON public.folhas_obra
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_non_rh_invoice_fields();

-- ─── servicos ───
DROP POLICY IF EXISTS "authenticated_all_servicos" ON public.servicos;
DROP POLICY IF EXISTS "rh_all_servicos" ON public.servicos;
DROP POLICY IF EXISTS "auth_select_servicos" ON public.servicos;
DROP POLICY IF EXISTS "auth_insert_servicos" ON public.servicos;
DROP POLICY IF EXISTS "auth_update_servicos_open" ON public.servicos;

CREATE POLICY "rh_all_servicos"
  ON public.servicos
  FOR ALL
  TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "auth_select_servicos"
  ON public.servicos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth_insert_servicos"
  ON public.servicos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_update_servicos_open"
  ON public.servicos
  FOR UPDATE
  TO authenticated
  USING (
    NOT public.is_rh_admin()
    AND estado IS DISTINCT FROM 'approved'
  )
  WITH CHECK (
    NOT public.is_rh_admin()
    AND estado IS DISTINCT FROM 'approved'
  );

-- ─── faturas_manuais: só RH ───
DROP POLICY IF EXISTS "authenticated_all_faturas_manuais" ON public.faturas_manuais;
DROP POLICY IF EXISTS "rh_all_faturas_manuais" ON public.faturas_manuais;

CREATE POLICY "rh_all_faturas_manuais"
  ON public.faturas_manuais
  FOR ALL
  TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

-- ─── folhas_obra ───
DROP POLICY IF EXISTS "authenticated_all_folhas_obra" ON public.folhas_obra;
DROP POLICY IF EXISTS "rh_all_folhas_obra" ON public.folhas_obra;
DROP POLICY IF EXISTS "auth_select_folhas_obra" ON public.folhas_obra;
DROP POLICY IF EXISTS "auth_insert_folhas_obra" ON public.folhas_obra;
DROP POLICY IF EXISTS "auth_update_folhas_obra_open" ON public.folhas_obra;

CREATE POLICY "rh_all_folhas_obra"
  ON public.folhas_obra
  FOR ALL
  TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());

CREATE POLICY "auth_select_folhas_obra"
  ON public.folhas_obra
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth_insert_folhas_obra"
  ON public.folhas_obra
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_update_folhas_obra_open"
  ON public.folhas_obra
  FOR UPDATE
  TO authenticated
  USING (
    NOT public.is_rh_admin()
    AND estado IS DISTINCT FROM 'faturado'
  )
  WITH CHECK (
    NOT public.is_rh_admin()
    AND estado IS DISTINCT FROM 'faturado'
  );

COMMIT;
