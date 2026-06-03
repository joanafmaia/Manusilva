-- Ativar Realtime (postgres_changes) para o painel de administração
-- Supabase → Database → Publications → supabase_realtime → adicionar tabelas
-- Ou executar no SQL Editor:

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trabalhos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.relatorios;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
