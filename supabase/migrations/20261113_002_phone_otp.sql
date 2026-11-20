-- 002 — Vérification téléphonique réelle (OTP hachés, expiration, tentatives, limite d'envoi).
-- Dépend de : public.profiles(id, phone, phone_verified), auth.users. Suppose les rôles Supabase (service_role).
-- Les fonctions ne sont appelables que par service_role (fonction Edge phone-otp).
-- ATTENTION : non exécuté sur une base ici (aucun moteur Postgres disponible dans l'environnement de travail).
begin;

alter table public.profiles add column if not exists phone_verified boolean not null default false;

-- Unicité des numéros VÉRIFIÉS. Arrêt explicite s'il existe déjà des doublons (rien n'est supprimé ni modifié).
do $$
declare v_dups text;
begin
  select string_agg(phone || ' (' || n || ')', ', ') into v_dups
  from (select phone, count(*) n from public.profiles
        where phone_verified and phone is not null and phone <> ''
        group by phone having count(*) > 1) d;
  if v_dups is not null then
    raise exception 'Doublons de numéros vérifiés à traiter avant migration : %', v_dups;
  end if;
end $$;

create unique index if not exists profiles_phone_verified_unique
  on public.profiles (phone) where phone_verified and phone is not null and phone <> '';

-- Codes en attente : jamais lisibles par le navigateur.
create table if not exists public.phone_otps (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  phone        text not null check (phone ~ '^\+[0-9]{7,15}$'),
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  sent_count   integer not null default 1,
  window_start timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
alter table public.phone_otps enable row level security;
revoke all on public.phone_otps from public, anon, authenticated;

create or replace function public.phone_otp_issue(p_user uuid, p_phone text, p_hash text, p_ttl_seconds integer default 600)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.phone_otps%rowtype;
begin
  if p_phone !~ '^\+[0-9]{7,15}$' then return jsonb_build_object('ok', false, 'reason', 'invalid_phone'); end if;
  if exists (select 1 from public.profiles where phone = p_phone and phone_verified and id <> p_user) then
    return jsonb_build_object('ok', false, 'reason', 'phone_taken');
  end if;
  select * into r from public.phone_otps where user_id = p_user for update;
  if found then
    if r.created_at > now() - interval '30 seconds' then
      return jsonb_build_object('ok', false, 'reason', 'too_soon');
    end if;
    if r.window_start > now() - interval '1 hour' and r.sent_count >= 5 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
    update public.phone_otps set
      phone = p_phone, code_hash = p_hash, expires_at = now() + make_interval(secs => p_ttl_seconds),
      attempts = 0, created_at = now(),
      sent_count = case when window_start > now() - interval '1 hour' then sent_count + 1 else 1 end,
      window_start = case when window_start > now() - interval '1 hour' then window_start else now() end
    where user_id = p_user;
  else
    insert into public.phone_otps (user_id, phone, code_hash, expires_at)
    values (p_user, p_phone, p_hash, now() + make_interval(secs => p_ttl_seconds));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.phone_otp_cancel(p_user uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.phone_otps where user_id = p_user;
$$;

create or replace function public.phone_otp_verify(p_user uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.phone_otps%rowtype;
begin
  select * into r from public.phone_otps where user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_pending'); end if;
  if r.expires_at < now() then
    delete from public.phone_otps where user_id = p_user;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if r.attempts >= 5 then
    delete from public.phone_otps where user_id = p_user;
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;
  if r.code_hash <> p_hash then
    update public.phone_otps set attempts = attempts + 1 where user_id = p_user;
    return jsonb_build_object('ok', false, 'reason', 'invalid_code', 'attempts_left', 4 - r.attempts);
  end if;
  begin
    update public.profiles set phone = r.phone, phone_verified = true where id = p_user;
    if not found then return jsonb_build_object('ok', false, 'reason', 'profile_missing'); end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'phone_taken');
  end;
  delete from public.phone_otps where user_id = p_user;
  return jsonb_build_object('ok', true, 'phone', r.phone);
end $$;

revoke all on function public.phone_otp_issue(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.phone_otp_cancel(uuid) from public, anon, authenticated;
revoke all on function public.phone_otp_verify(uuid, text) from public, anon, authenticated;
grant execute on function public.phone_otp_issue(uuid, text, text, integer) to service_role;
grant execute on function public.phone_otp_cancel(uuid) to service_role;
grant execute on function public.phone_otp_verify(uuid, text) to service_role;

-- Garde-fou : seul le serveur peut passer phone_verified à vrai ; un changement de numéro côté client le remet à faux.
create or replace function public.profiles_guard_phone()
returns trigger language plpgsql as $$
declare v_priv boolean := coalesce(auth.role(), '') = 'service_role'
                          or current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if new.phone_verified is distinct from old.phone_verified and not v_priv then
    raise exception 'phone_verified ne peut être modifié que par le serveur';
  end if;
  if new.phone is distinct from old.phone and not v_priv then
    new.phone_verified := false;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_phone on public.profiles;
create trigger profiles_guard_phone before update on public.profiles
  for each row execute function public.profiles_guard_phone();

commit;
