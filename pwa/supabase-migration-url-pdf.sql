-- Coluna url_pdf em trabalhos (bases já criadas antes desta alteração)
ALTER TABLE public.trabalhos ADD COLUMN IF NOT EXISTS url_pdf text;
