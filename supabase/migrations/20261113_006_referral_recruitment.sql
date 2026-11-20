-- 006 — Parrainage (attribution, qualification serveur, consommation par lots de N), recrutement (offres, candidatures,
-- historique, décisions) et attribution du badge après acceptation. Dépend de 005 (notifications, aldetic_is_staff).
-- Les tables referral_codes, referrals, badges, user_badges existent déjà dans shema.sql : « if not exists » les laisse intactes.
begin;

create or replace function public.aldetic_is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('owner','admin'));
$$;
grant execute on function public.aldetic_is_admin() to authenticated;

create table if not exists public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
insert into public.platform_settings (key, value) values ('referral_required', '8'::jsonb) on conflict (key) do nothing;
alter table public.platform_settings enable row level security;
drop policy if exists m006_settings_read on public.platform_settings;
create policy m006_settings_read on public.platform_settings for select to authenticated using (true);
revoke all on public.platform_settings from public, anon, authenticated;
grant select on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;

-- Tables existantes (définitions identiques à shema.sql)
create table if not exists public.referral_codes (user_id uuid primary key references public.profiles(id) on delete cascade, code text not null unique, created_at timestamptz not null default now());
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','qualified','rewarded','rejected')),
  qualified_at timestamptz, created_at timestamptz not null default now(),
  constraint referrals_no_self check (referrer_id <> referred_user_id));
create table if not exists public.badges (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text, icon_url text, xp_reward integer not null default 0 check (xp_reward >= 0), active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.user_badges (user_id uuid not null references public.profiles(id) on delete cascade, badge_id uuid not null references public.badges(id) on delete cascade, awarded_at timestamptz not null default now(), primary key (user_id, badge_id));
alter table public.referrals add column if not exists consumed_at timestamptz;
alter table public.referrals add column if not exists reject_reason text;
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create table if not exists public.referral_uses (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, referral_ids uuid[] not null, created_at timestamptz not null default now());
alter table public.referral_codes enable row level security; alter table public.referrals enable row level security;
alter table public.badges enable row level security; alter table public.user_badges enable row level security; alter table public.referral_uses enable row level security;
drop policy if exists m006_codes_read on public.referral_codes; create policy m006_codes_read on public.referral_codes for select to authenticated using (user_id = auth.uid());
drop policy if exists m006_referrals_read on public.referrals; create policy m006_referrals_read on public.referrals for select to authenticated using (referrer_id = auth.uid() or referred_user_id = auth.uid());
drop policy if exists m006_badges_read on public.badges; create policy m006_badges_read on public.badges for select to authenticated using (active);
drop policy if exists m006_user_badges_read on public.user_badges; create policy m006_user_badges_read on public.user_badges for select to authenticated using (user_id = auth.uid());
drop policy if exists m006_uses_read on public.referral_uses; create policy m006_uses_read on public.referral_uses for select to authenticated using (user_id = auth.uid());
grant select on public.referral_codes, public.referrals, public.badges, public.user_badges, public.referral_uses to authenticated;
-- Aucune écriture client sur referrals / badges (le code se crée via referral_code_ensure)
revoke insert, update, delete on public.referral_codes, public.referrals, public.badges, public.user_badges, public.referral_uses from anon, authenticated;
grant all on public.referral_codes, public.referrals, public.badges, public.user_badges, public.referral_uses to service_role;

create or replace function public.referral_code_ensure() returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); v text;
begin
  if me is null then raise exception 'auth_required'; end if;
  select code into v from public.referral_codes where user_id = me;
  if found then return v; end if;
  loop
    v := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin insert into public.referral_codes (user_id, code) values (me, v); return v; exception when unique_violation then
      select code into v from public.referral_codes where user_id = me; if found then return v; end if; end;
  end loop;
end $$;

-- Attribution : un seul parrain par compte, compte de moins de 7 jours, pas d'auto-parrainage, détection de rafales.
create or replace function public.referral_claim(p_code text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); v_ref uuid; v_created timestamptz; v_id uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'auth_required'); end if;
  select user_id into v_ref from public.referral_codes where upper(code) = upper(trim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if v_ref = me then return jsonb_build_object('ok', false, 'reason', 'self_referral'); end if;
  if exists (select 1 from public.referrals where referred_user_id = me) then return jsonb_build_object('ok', false, 'reason', 'already_referred'); end if;
  select created_at into v_created from auth.users where id = me;
  if v_created is null or v_created < now() - interval '7 days' then return jsonb_build_object('ok', false, 'reason', 'too_late'); end if;
  if (select count(*) from public.referrals where referrer_id = v_ref and created_at > now() - interval '1 hour') >= 20 then
    insert into public.referrals (referrer_id, referred_user_id, status, reject_reason) values (v_ref, me, 'rejected', 'velocity');
    return jsonb_build_object('ok', false, 'reason', 'flagged');
  end if;
  insert into public.referrals (referrer_id, referred_user_id) values (v_ref, me) returning id into v_id;
  if (select phone_verified from public.profiles where id = me) then perform public.referral_qualify(me); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Qualification : uniquement quand le filleul a vérifié son numéro par OTP (déclenché côté serveur).
create or replace function public.referral_qualify(p_user uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.referrals%rowtype;
begin
  update public.referrals set status = 'qualified', qualified_at = now() where referred_user_id = p_user and status = 'pending' returning * into r;
  if found then
    insert into public.notifications (user_id, type, title, body, action_url) values (r.referrer_id, 'referral', 'Parrainage validé', 'Un de vos filleuls a vérifié son compte.', 'parrainage.html');
  end if;
end $$;
create or replace function public.referral_on_verified() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin if new.phone_verified and not old.phone_verified then perform public.referral_qualify(new.id); end if; return new; end $$;
drop trigger if exists referral_on_verified on public.profiles;
create trigger referral_on_verified after update of phone_verified on public.profiles for each row execute function public.referral_on_verified();

-- Consommation : N parrainages qualifiés (paramètre referral_required, 8 par défaut) pour une utilisation. Réservé au serveur.
create or replace function public.referral_consume(p_user uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare need int; ids uuid[];
begin
  select (value #>> '{}')::int into need from public.platform_settings where key = 'referral_required';
  need := coalesce(need, 8);
  select array_agg(id) into ids from (select id from public.referrals where referrer_id = p_user and status = 'qualified' and consumed_at is null order by qualified_at limit need for update) s;
  if coalesce(array_length(ids, 1), 0) < need then return jsonb_build_object('ok', false, 'reason', 'not_enough', 'required', need, 'available', coalesce(array_length(ids, 1), 0)); end if;
  update public.referrals set status = 'rewarded', consumed_at = now() where id = any (ids);
  insert into public.referral_uses (user_id, referral_ids) values (p_user, ids);
  return jsonb_build_object('ok', true);
end $$;

create or replace view public.referral_progress with (security_invoker = true) as
  select referrer_id as user_id,
    count(*) filter (where status = 'qualified' and consumed_at is null) as available,
    count(*) filter (where status = 'pending') as pending,
    count(*) filter (where status = 'rewarded') as consumed,
    count(*) filter (where status = 'rejected') as rejected,
    (select (value #>> '{}')::int from public.platform_settings where key = 'referral_required') as required
  from public.referrals group by referrer_id;
grant select on public.referral_progress to authenticated;

-- Recrutement (tables préfixées recruitment_ : la table « applications » de la production, si elle existe, n'est pas touchée)
create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null, summary text,
  responsibilities text[] not null default '{}', requirements text[] not null default '{}',
  conditions text, benefits text,
  status text not null default 'draft' check (status in ('draft','open','closed')),
  badge_code text not null default 'recruit', role_on_accept text check (role_on_accept in ('developer')),
  created_by uuid, created_at timestamptz not null default now());
create table if not exists public.recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique default ('APP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  offer_id uuid references public.job_offers(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_title text, cv_path text, message text not null check (char_length(message) between 20 and 4000), links jsonb not null default '[]'::jsonb,
  status text not null default 'received' check (status in ('received','in_review','info_requested','interview','accepted','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint recruitment_cv_own_folder check (cv_path is null or cv_path like user_id::text || '/%'));
create unique index if not exists recruitment_one_per_offer on public.recruitment_applications (user_id, offer_id) where offer_id is not null;
create table if not exists public.recruitment_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.recruitment_applications(id) on delete cascade,
  actor uuid, kind text not null check (kind in ('status','internal_comment','message_to_candidate','message_from_candidate','system')),
  status_to text, body text, visible_to_candidate boolean not null default false, created_at timestamptz not null default now());
create index if not exists recruitment_events_idx on public.recruitment_events (application_id, created_at);

create or replace function public.recruitment_recruitment_guard() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.recruitment_applications where user_id = new.user_id and status in ('received','in_review','info_requested','interview')) >= 3 then raise exception 'too_many_open_applications'; end if;
  if new.offer_id is not null and not exists (select 1 from public.job_offers where id = new.offer_id and status = 'open') then raise exception 'offer_closed'; end if;
  return new;
end $$;
drop trigger if exists recruitment_guard on public.recruitment_applications;
create trigger recruitment_guard before insert on public.recruitment_applications for each row execute function public.recruitment_recruitment_guard();
create or replace function public.recruitment_recruitment_log_created() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.recruitment_events (application_id, actor, kind, status_to, body, visible_to_candidate) values (new.id, new.user_id, 'status', 'received', 'Candidature reçue', true);
  insert into public.notifications (user_id, type, title, body, action_url) values (new.user_id, 'recruitment', 'Candidature reçue', 'Référence ' || new.public_ref, 'carrieres.html');
  return new;
end $$;
drop trigger if exists recruitment_log_created on public.recruitment_applications;
create trigger recruitment_log_created after insert on public.recruitment_applications for each row execute function public.recruitment_recruitment_log_created();

-- Décision admin : transitions contrôlées, historique, notification, badge (+ rôle « developer » si l'offre le prévoit).
create or replace function public.application_transition(p_id uuid, p_to text, p_note text default null, p_visible boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.recruitment_applications%rowtype; o public.job_offers%rowtype; v_badge uuid; v_code text := 'recruit'; v_role text; v_note text;
begin
  if not public.aldetic_is_admin() then raise exception 'forbidden'; end if;
  select * into a from public.recruitment_applications where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_application'); end if;
  if not ((a.status = 'received' and p_to in ('in_review','rejected')) or (a.status = 'in_review' and p_to in ('info_requested','interview','accepted','rejected'))
       or (a.status = 'info_requested' and p_to in ('in_review','rejected')) or (a.status = 'interview' and p_to in ('accepted','rejected'))) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', a.status, 'to', p_to);
  end if;
  if p_to = 'info_requested' and coalesce(trim(p_note), '') = '' then return jsonb_build_object('ok', false, 'reason', 'message_required'); end if;
  update public.recruitment_applications set status = p_to, updated_at = now() where id = a.id;
  insert into public.recruitment_events (application_id, actor, kind, status_to, body, visible_to_candidate) values (a.id, auth.uid(), case when p_to = 'info_requested' then 'message_to_candidate' else 'status' end, p_to, p_note, p_visible);
  if p_to = 'accepted' then
    if a.offer_id is not null then select * into o from public.job_offers where id = a.offer_id; v_code := coalesce(o.badge_code, 'recruit'); v_role := o.role_on_accept; end if;
    insert into public.badges (code, name, description) values (v_code, 'Recrutement', 'Candidature acceptée par ALDETIC') on conflict (code) do nothing;
    select id into v_badge from public.badges where code = v_code;
    insert into public.user_badges (user_id, badge_id) values (a.user_id, v_badge) on conflict do nothing;
    if v_role is not null then
      begin insert into public.user_roles (user_id, role) values (a.user_id, v_role) on conflict do nothing;
      exception when others then
        insert into public.recruitment_events (application_id, actor, kind, body) values (a.id, auth.uid(), 'system', 'Attribution du rôle impossible : ' || sqlerrm);
      end;
    end if;
  end if;
  insert into public.notifications (user_id, type, title, body, action_url) values (a.user_id, 'recruitment',
    case p_to when 'accepted' then 'Candidature acceptée' when 'rejected' then 'Candidature refusée' when 'info_requested' then 'Informations demandées' when 'interview' then 'Entretien' else 'Candidature en cours d''examen' end,
    case when p_visible then p_note end, 'carrieres.html');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.application_reply(p_id uuid, p_body text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.recruitment_applications%rowtype;
begin
  select * into a from public.recruitment_applications where id = p_id and user_id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_application'); end if;
  if a.status <> 'info_requested' then return jsonb_build_object('ok', false, 'reason', 'no_request_pending'); end if;
  if char_length(coalesce(trim(p_body), '')) < 2 or char_length(p_body) > 4000 then return jsonb_build_object('ok', false, 'reason', 'invalid_body'); end if;
  insert into public.recruitment_events (application_id, actor, kind, body, visible_to_candidate) values (a.id, auth.uid(), 'message_from_candidate', p_body, true);
  update public.recruitment_applications set status = 'in_review', updated_at = now() where id = a.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.application_comment(p_id uuid, p_body text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.aldetic_is_admin() then raise exception 'forbidden'; end if;
  insert into public.recruitment_events (application_id, actor, kind, body, visible_to_candidate) values (p_id, auth.uid(), 'internal_comment', p_body, false);
end $$;

alter table public.job_offers enable row level security; alter table public.recruitment_applications enable row level security; alter table public.recruitment_events enable row level security;
drop policy if exists m006_offers_read on public.job_offers; create policy m006_offers_read on public.job_offers for select to anon, authenticated using (status = 'open' or public.aldetic_is_admin());
drop policy if exists m006_offers_write on public.job_offers; create policy m006_offers_write on public.job_offers for all to authenticated using (public.aldetic_is_admin()) with check (public.aldetic_is_admin());
drop policy if exists m006_apps_read on public.recruitment_applications; create policy m006_apps_read on public.recruitment_applications for select to authenticated using (user_id = auth.uid() or public.aldetic_is_admin());
drop policy if exists m006_apps_insert on public.recruitment_applications; create policy m006_apps_insert on public.recruitment_applications for insert to authenticated with check (user_id = auth.uid() and public.aldetic_is_verified());
drop policy if exists m006_events_read on public.recruitment_events;
create policy m006_events_read on public.recruitment_events for select to authenticated using (public.aldetic_is_admin() or (visible_to_candidate and exists (select 1 from public.recruitment_applications a where a.id = application_id and a.user_id = auth.uid())));
revoke all on public.job_offers, public.recruitment_applications, public.recruitment_events from public, anon, authenticated;
grant select on public.job_offers to anon, authenticated; grant insert, update, delete on public.job_offers to authenticated;
grant select on public.recruitment_applications, public.recruitment_events to authenticated;
grant insert (offer_id, full_name, email, role_title, cv_path, message, links) on public.recruitment_applications to authenticated;
grant all on public.job_offers, public.recruitment_applications, public.recruitment_events to service_role;

revoke all on function public.referral_qualify(uuid), public.referral_consume(uuid) from public, anon, authenticated;
grant execute on function public.referral_qualify(uuid), public.referral_consume(uuid) to service_role;
revoke all on function public.referral_claim(text), public.referral_code_ensure(), public.application_transition(uuid, text, text, boolean), public.application_reply(uuid, text), public.application_comment(uuid, text) from public, anon;
grant execute on function public.referral_claim(text), public.referral_code_ensure(), public.application_transition(uuid, text, text, boolean), public.application_reply(uuid, text), public.application_comment(uuid, text) to authenticated;
commit;
