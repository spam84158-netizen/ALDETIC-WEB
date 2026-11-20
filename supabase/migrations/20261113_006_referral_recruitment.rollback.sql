-- DESTRUCTIF pour candidatures et parrainages ajoutés par 006. Les tables referral_codes/referrals/badges/user_badges (shema.sql) sont conservées.
begin;
drop trigger if exists referral_on_verified on public.profiles; drop function if exists public.referral_on_verified();
drop view if exists public.referral_progress;
drop function if exists public.application_comment(uuid, text), public.application_reply(uuid, text), public.application_transition(uuid, text, text, boolean);
drop function if exists public.referral_consume(uuid), public.referral_qualify(uuid), public.referral_claim(text), public.referral_code_ensure();
drop table if exists public.recruitment_events, public.recruitment_applications, public.job_offers, public.referral_uses;
drop function if exists public.recruitment_recruitment_log_created(), public.recruitment_recruitment_guard();
alter table public.referrals drop column if exists consumed_at, drop column if exists reject_reason;
drop table if exists public.platform_settings;
drop function if exists public.aldetic_is_admin();
commit;
