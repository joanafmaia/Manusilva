-- 037 — Realtime para folhas_obra (oficina R.C. na aba Orçamentos)
-- Sem isto, o painel RH só vê novas folhas / estados após refresh manual.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'folhas_obra'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.folhas_obra;
  END IF;
END $$;

ALTER TABLE public.folhas_obra REPLICA IDENTITY FULL;

COMMIT;
