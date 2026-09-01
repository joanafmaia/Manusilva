-- 038 — Quota plano free: podar auditoria antiga de clientes (tamanho da BD)
-- Executar no SQL Editor quando cliente_alteracoes crescer.
-- Uso: SELECT public.prune_old_cliente_alteracoes();  -- retém 18 meses

BEGIN;

CREATE OR REPLACE FUNCTION public.prune_old_cliente_alteracoes(
  p_retain interval DEFAULT interval '18 months'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.cliente_alteracoes
  WHERE created_at < now() - p_retain;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.prune_old_cliente_alteracoes(interval) IS
  'Apaga cliente_alteracoes mais antigas que o intervalo (omissão 18 meses). Ajuda a quota de 500 MB da BD.';

REVOKE ALL ON FUNCTION public.prune_old_cliente_alteracoes(interval) FROM PUBLIC;

COMMIT;
