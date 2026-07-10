-- 032 — Registo de quem aprovou relatórios e quem registou faturas (auditoria RH)

ALTER TABLE public.relatorios
  ADD COLUMN IF NOT EXISTS aprovado_por text,
  ADD COLUMN IF NOT EXISTS faturado_por text;

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS aprovado_por text,
  ADD COLUMN IF NOT EXISTS faturado_por text;

ALTER TABLE public.folhas_obra
  ADD COLUMN IF NOT EXISTS faturado_por text;

ALTER TABLE public.faturas_manuais
  ADD COLUMN IF NOT EXISTS registado_por text;

COMMENT ON COLUMN public.relatorios.aprovado_por IS 'Utilizador RH que aprovou o relatório.';
COMMENT ON COLUMN public.relatorios.faturado_por IS 'Utilizador RH que registou a fatura.';
COMMENT ON COLUMN public.servicos.aprovado_por IS 'Utilizador RH associado à aprovação da visita.';
COMMENT ON COLUMN public.servicos.faturado_por IS 'Utilizador RH que registou a fatura da visita.';
COMMENT ON COLUMN public.folhas_obra.faturado_por IS 'Utilizador RH que registou a fatura da folha de obra.';
COMMENT ON COLUMN public.faturas_manuais.registado_por IS 'Utilizador RH que criou o registo manual.';
