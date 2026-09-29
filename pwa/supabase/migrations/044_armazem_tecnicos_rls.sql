-- 044 — Técnicos no painel Armazém: criar clientes e gravar folhas sem erro 42501.
-- Pré-requisito: 026, 042.
-- Executar no Supabase → SQL Editor.
--
-- O JWT do técnico continua com role Tecnico mesmo quando entra como «Armazém».
-- 026 só permitia INSERT de clientes com metadata Armazem → RLS 42501.
-- 042 dispara se o PATCH envia '' vs NULL ou 'pendente' vs NULL nas colunas de fatura.
-- Folhas: 042 não tinha DELETE para oficina.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_rh_admin_or_warehouse()
RETURNS boolean
LANGUAGE sql
STABLE
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

COMMENT ON FUNCTION public.is_rh_admin_or_warehouse() IS
  'True para RH/Admin e para a conta com JWT Armazém (não inclui técnicos).';

-- Técnicos autenticados podem criar clientes a partir do painel Armazém.
CREATE OR REPLACE FUNCTION public.is_rh_admin_warehouse_or_technician()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN auth.jwt() IS NULL THEN false
    ELSE
      public.is_rh_admin()
      OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') IN (
        'Armazem', 'armazem', 'warehouse',
        'Tecnico', 'tecnico', 'technician'
      )
  END;
$$;

COMMENT ON FUNCTION public.is_rh_admin_warehouse_or_technician() IS
  'True para RH, Armazém e Técnicos — INSERT de clientes na oficina.';

DROP POLICY IF EXISTS "warehouse_insert_clientes" ON public.clientes;
CREATE POLICY "warehouse_insert_clientes"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_rh_admin_warehouse_or_technician());

-- UPDATE de clientes (incl. condição de pagamento) continua só RH + JWT Armazém.
DROP POLICY IF EXISTS "warehouse_update_clientes" ON public.clientes;
CREATE POLICY "warehouse_update_clientes"
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (public.is_rh_admin_or_warehouse())
  WITH CHECK (public.is_rh_admin_or_warehouse());

-- '' e NULL (e 'pendente' vs NULL no recebimento) não contam como alteração de fatura.
CREATE OR REPLACE FUNCTION public.invoice_text_unchanged(new_val text, old_val text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(COALESCE(new_val, '')), ''), '')
       = COALESCE(NULLIF(btrim(COALESCE(old_val, '')), ''), '');
$$;

CREATE OR REPLACE FUNCTION public.invoice_status_unchanged(new_val text, old_val text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(btrim(COALESCE(new_val, '')), ''), 'pendente')
       = COALESCE(NULLIF(btrim(COALESCE(old_val, '')), ''), 'pendente');
$$;

CREATE OR REPLACE FUNCTION public.prevent_non_rh_invoice_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_rh_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT public.invoice_text_unchanged(NEW.numero_fatura, OLD.numero_fatura)
     OR NEW.data_fatura IS DISTINCT FROM OLD.data_fatura
     OR NEW.valor_faturado IS DISTINCT FROM OLD.valor_faturado
     OR NEW.valor_recebido IS DISTINCT FROM OLD.valor_recebido
     OR NOT public.invoice_text_unchanged(NEW.condicao_pagamento, OLD.condicao_pagamento)
     OR NOT public.invoice_status_unchanged(NEW.status_recebimento, OLD.status_recebimento)
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
  'Bloqueia número/valor/recebimento de fatura se o JWT não for RH. Ignora '' vs NULL.';

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

DROP POLICY IF EXISTS "auth_delete_folhas_obra_open" ON public.folhas_obra;
CREATE POLICY "auth_delete_folhas_obra_open"
  ON public.folhas_obra
  FOR DELETE
  TO authenticated
  USING (
    NOT public.is_rh_admin()
    AND estado IN ('rascunho', 'em_diagnostico', 'em_reparacao')
  );

COMMIT;
