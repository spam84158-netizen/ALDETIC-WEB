
begin;

create table if not exists public.aldetic_demo_phone_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);

alter table public.aldetic_demo_phone_codes enable row level security;

revoke all on public.aldetic_demo_phone_codes
from public, anon, authenticated;

create or replace function public.aldetic_generate_demo_phone_code(
  p_phone text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  if p_phone !~ '^\+[0-9]{7,15}$' then
    raise exception 'Numéro invalide';
  end if;

  v_code := floor(100000 + random() * 900000)::text;

  update public.profiles
  set phone = p_phone, phone_verified = false
  where id = v_user;

  if not found then
    raise exception 'Profil introuvable';
  end if;

  insert into public.aldetic_demo_phone_codes
    (user_id, phone, code, expires_at, attempts)
  values
    (v_user, p_phone, v_code, now() + interval '10 minutes', 0)
  on conflict (user_id) do update
  set phone = excluded.phone,
      code = excluded.code,
      expires_at = excluded.expires_at,
      attempts = 0;

  return v_code;
end;
$$;

create or replace function public.aldetic_confirm_demo_phone(
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_pending public.aldetic_demo_phone_codes%rowtype;
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  select * into v_pending
  from public.aldetic_demo_phone_codes
  where user_id = v_user
  for update;

  if not found then
    return false;
  end if;

  if v_pending.expires_at < now() or v_pending.attempts >= 5 then
    delete from public.aldetic_demo_phone_codes
    where user_id = v_user;
    return false;
  end if;

  if p_code !~ '^[0-9]{6}$' or p_code <> v_pending.code then
    update public.aldetic_demo_phone_codes
    set attempts = attempts + 1
    where user_id = v_user;
    return false;
  end if;

  update public.profiles
  set phone_verified = true
  where id = v_user
    and phone = v_pending.phone;

  if not found then
    return false;
  end if;

  delete from public.aldetic_demo_phone_codes
  where user_id = v_user;

  return true;
end;
$$;

revoke all on function public.aldetic_generate_demo_phone_code(text)
from public, anon;

revoke all on function public.aldetic_confirm_demo_phone(text)
from public, anon;

grant execute on function public.aldetic_generate_demo_phone_code(text)
to authenticated;

grant execute on function public.aldetic_confirm_demo_phone(text)
to authenticated;

commit;
