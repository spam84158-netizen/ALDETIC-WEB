-- 001 — Correctif de sécurité : suppression de la fausse vérification téléphonique.
-- Contexte : aldetic_confirm_demo_phone() (shema.sql, bloc 11) marquait phone_verified = true
-- pour tout utilisateur connecté, sans code. aldetic_generate_demo_phone_code() renvoyait le code
-- au navigateur. Les deux sont supprimées. Idempotent. Rien d'autre n'est touché.
-- ATTENTION : non exécuté sur une base ici (aucun moteur Postgres disponible dans l'environnement de travail).
begin;

drop function if exists public.aldetic_confirm_demo_phone();
drop function if exists public.aldetic_confirm_demo_phone(text);
drop function if exists public.aldetic_generate_demo_phone_code(text);
drop table    if exists public.aldetic_demo_phone_codes;

commit;
