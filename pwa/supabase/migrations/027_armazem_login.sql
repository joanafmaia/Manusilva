-- 027 — Conta partilhada do Armazém (login único na oficina)
-- Executar no Supabase → SQL Editor (após criar o utilizador na Auth)

-- Dashboard → Authentication → Users → Add user:
--   E-mail: armazem@sistema.com
--   Password: Armazem.2026  (ou outra — comunicar à equipa)
--   User Metadata: {"role":"Armazem","nome":"Armazém"}

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role', 'Armazem',
  'nome', 'Armazém'
)
WHERE lower(email) = 'armazem@sistema.com';

COMMENT ON TABLE public.folhas_obra IS
  'Folhas de obra — equipamentos recebidos na oficina. Login armazém: armazem@sistema.com (entrar como «Armazém»).';
