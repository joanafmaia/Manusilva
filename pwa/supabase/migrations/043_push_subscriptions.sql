-- 043 — Subscrições Web Push (avisos com a PWA fechada)
-- Executar no Supabase → SQL Editor.
-- A app grava/consulta via API Railway (service role). Sem políticas para authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  role text NOT NULL DEFAULT '',
  technician_id text NOT NULL DEFAULT '',
  technician_name text NOT NULL DEFAULT '',
  user_agent text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
  ON public.push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_tech_name_idx
  ON public.push_subscriptions (lower(technician_name));

COMMENT ON TABLE public.push_subscriptions IS
  'Endpoints Web Push por dispositivo. Só a API (service role) lê/escreve.';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_push_subscriptions" ON public.push_subscriptions;

COMMIT;
