-- 019 — Catálogo de produtos/serviços (cresce ao preparar orçamentos MS.015)
-- Complementa data/catalogo-produtos.json importado do Excel.

CREATE TABLE IF NOT EXISTS public.catalogo_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'Produto',
  codigo text,
  descricao text NOT NULL,
  descricao_normalizada text NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  preco_venda numeric(12, 2),
  origem text NOT NULL DEFAULT 'orcamento',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_produtos_descricao_normalizada_key UNIQUE (descricao_normalizada)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalogo_produtos_codigo_lower_idx
  ON public.catalogo_produtos (lower(trim(codigo)))
  WHERE codigo IS NOT NULL AND trim(codigo) <> '';

COMMENT ON TABLE public.catalogo_produtos IS
  'Artigos para autocomplete de orçamentos. Alimentado pelo RH ao guardar linhas de proposta.';

ALTER TABLE public.catalogo_produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_catalogo_produtos" ON public.catalogo_produtos;
CREATE POLICY "authenticated_read_catalogo_produtos"
  ON public.catalogo_produtos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rh_write_catalogo_produtos" ON public.catalogo_produtos;
CREATE POLICY "rh_write_catalogo_produtos"
  ON public.catalogo_produtos
  FOR ALL
  TO authenticated
  USING (public.is_rh_admin())
  WITH CHECK (public.is_rh_admin());
