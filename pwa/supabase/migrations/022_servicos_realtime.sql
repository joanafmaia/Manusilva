-- 022 — Realtime para servicos (visitas criadas pelo RH)
-- Sem isto, o tablet do técnico só vê novos serviços após refresh manual.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'servicos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.servicos;
  END IF;
END $$;

ALTER TABLE public.servicos REPLICA IDENTITY FULL;

COMMIT;
