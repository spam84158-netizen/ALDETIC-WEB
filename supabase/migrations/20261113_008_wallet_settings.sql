-- 008 — Paramètres du portefeuille (modifiables par l'administration, jamais par le navigateur).
-- Frais à 0 et moyens désactivés par défaut : le propriétaire fixe les vrais frais et active chaque moyen après intégration et test.
begin;
insert into public.platform_settings (key, value) values
  ('withdraw_fee', '{"percent":0,"min":0}'::jsonb),
  ('withdraw_min', '1000'::jsonb),
  ('deposit_min', '500'::jsonb),
  ('payment_methods', '{"orange_money":false,"mtn_momo":false,"moov_money":false,"wave":false,"card":false,"bank_transfer":false}'::jsonb),
  ('bank_instructions', '{}'::jsonb)
on conflict (key) do nothing;
commit;
