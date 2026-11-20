begin;
drop trigger  if exists profiles_guard_phone on public.profiles;
drop function if exists public.profiles_guard_phone();
drop function if exists public.phone_otp_verify(uuid, text);
drop function if exists public.phone_otp_cancel(uuid);
drop function if exists public.phone_otp_issue(uuid, text, text, integer);
drop table    if exists public.phone_otps;
drop index    if exists public.profiles_phone_verified_unique;
commit;
