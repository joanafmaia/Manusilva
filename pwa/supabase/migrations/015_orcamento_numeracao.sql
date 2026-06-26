-- 015 — Numeração sequencial de orçamentos MS.015 (por ano civil)
-- Formato na app: «297.0/2026» (n.º sequencial + sufixo .0 + ano)

CREATE TABLE IF NOT EXISTS public.orcamento_numeracao (
  ano integer PRIMARY KEY,
  ultimo_numero integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orcamento_numeracao IS
  'Contador anual de propostas comerciais (MS.015). O próximo número é ultimo_numero + 1.';

-- Último orçamento conhecido em 2026 no modelo da empresa era 296 → próximo = 297
INSERT INTO public.orcamento_numeracao (ano, ultimo_numero)
VALUES (2026, 296)
ON CONFLICT (ano) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reservar_numero_orcamento(p_ano integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num integer;
BEGIN
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

ALTER TABLE public.orcamento_numeracao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_orcamento_numeracao" ON public.orcamento_numeracao;
CREATE POLICY "authenticated_read_orcamento_numeracao"
  ON public.orcamento_numeracao
  FOR SELECT
  TO authenticated
  USING (true);
