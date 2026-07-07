-- 030 — Folhas de obra: quem trouxe (R.C) e técnico que arranjou (etiqueta)
-- Executar no Supabase → SQL Editor (após 029)

BEGIN;

ALTER TABLE public.folhas_obra
  ADD COLUMN IF NOT EXISTS entregue_por text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tecnico_reparacao text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.folhas_obra.entregue_por IS
  'R.C — nome de quem trouxe o equipamento à oficina (etiqueta)';
COMMENT ON COLUMN public.folhas_obra.tecnico_reparacao IS
  'Técnico que reparou/arranjou o equipamento (etiqueta M.S e R.C)';

COMMIT;
