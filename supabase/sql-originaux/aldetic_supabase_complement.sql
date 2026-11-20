-- ALDETIC — migration complémentaire Supabase
-- À exécuter UNE SEULE FOIS dans le SQL Editor du projet nogdmnojpsdjfaapsrhe.
-- Ne recrée pas les 9 tables déjà présentes. N'efface aucune donnée existante.

begin;

-- 1) Profils publics : champs complémentaires pour les pages de profil.
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists website text,
  add column if not exists public_profile_enabled boolean not null default true;

grant update (username, display_name, bio, lang, phone, avatar_url, website, public_profile_enabled)
on public.profiles to authenticated;

-- 2) Notifications : création côté serveur, lecture et marquage comme lu par le destinataire.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_read_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_read_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Pas de politique INSERT/DELETE pour authenticated : les notifications sont créées côté serveur.

-- 3) Équipes et collaboration.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member')),
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists team_members_user_idx on public.team_members(user_id);
create index if not exists team_invites_email_idx on public.team_invites(lower(email));

create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.team_members tm
  where tm.team_id = p_team_id and tm.user_id = auth.uid()
); $$;
create or replace function public.is_team_admin(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.teams t where t.id = p_team_id and t.owner_id = auth.uid()
) or exists (
  select 1 from public.team_members tm
  where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.role in ('owner','admin')
); $$;
revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.is_team_admin(uuid) from public;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_team_admin(uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
drop policy if exists "teams_read_members" on public.teams;
drop policy if exists "teams_create_own" on public.teams;
drop policy if exists "teams_update_admin" on public.teams;
drop policy if exists "teams_delete_owner" on public.teams;
create policy "teams_read_members" on public.teams for select to authenticated
  using (owner_id = auth.uid() or public.is_team_member(id));
create policy "teams_create_own" on public.teams for insert to authenticated
  with check (owner_id = auth.uid());
create policy "teams_update_admin" on public.teams for update to authenticated
  using (public.is_team_admin(id)) with check (public.is_team_admin(id));
create policy "teams_delete_owner" on public.teams for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "team_members_read_team" on public.team_members;
drop policy if exists "team_members_add_admin" on public.team_members;
drop policy if exists "team_members_remove_admin_or_self" on public.team_members;
create policy "team_members_read_team" on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.is_team_member(team_id));
create policy "team_members_add_admin" on public.team_members for insert to authenticated
  with check (public.is_team_admin(team_id));
create policy "team_members_remove_admin_or_self" on public.team_members for delete to authenticated
  using (public.is_team_admin(team_id) or user_id = auth.uid());

drop policy if exists "team_invites_read_admin_or_invitee" on public.team_invites;
drop policy if exists "team_invites_create_admin" on public.team_invites;
drop policy if exists "team_invites_update_admin_or_invitee" on public.team_invites;
drop policy if exists "team_invites_delete_admin" on public.team_invites;
create policy "team_invites_read_admin_or_invitee" on public.team_invites for select to authenticated
  using (public.is_team_admin(team_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));
create policy "team_invites_create_admin" on public.team_invites for insert to authenticated
  with check (invited_by = auth.uid() and public.is_team_admin(team_id));
create policy "team_invites_update_admin_or_invitee" on public.team_invites for update to authenticated
  using (public.is_team_admin(team_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')))
  with check (public.is_team_admin(team_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));
create policy "team_invites_delete_admin" on public.team_invites for delete to authenticated
  using (public.is_team_admin(team_id));

-- 4) Parrainage : codes privés, inscriptions référées. Les récompenses restent côté serveur.
create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','qualified','rewarded','rejected')),
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_no_self check (referrer_id <> referred_user_id)
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_id, created_at desc);
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
drop policy if exists "referral_codes_read_own" on public.referral_codes;
drop policy if exists "referral_codes_create_own" on public.referral_codes;
drop policy if exists "referrals_read_participants" on public.referrals;
create policy "referral_codes_read_own" on public.referral_codes for select to authenticated
  using (user_id = auth.uid());
create policy "referral_codes_create_own" on public.referral_codes for insert to authenticated
  with check (user_id = auth.uid());
create policy "referrals_read_participants" on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_user_id = auth.uid());
-- Aucun INSERT/UPDATE client sur referrals : attribution et validation via fonction serveur.

-- 5) XP, niveaux et badges. Les utilisateurs consultent leurs données ; attribution serveur uniquement.
create table if not exists public.xp_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  updated_at timestamptz not null default now()
);
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  icon_url text,
  xp_reward integer not null default 0 check (xp_reward >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index if not exists xp_transactions_user_idx on public.xp_transactions(user_id, created_at desc);
alter table public.xp_accounts enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
drop policy if exists "xp_accounts_read_own" on public.xp_accounts;
drop policy if exists "xp_transactions_read_own" on public.xp_transactions;
drop policy if exists "badges_read_active" on public.badges;
drop policy if exists "user_badges_read_own" on public.user_badges;
create policy "xp_accounts_read_own" on public.xp_accounts for select to authenticated
  using (user_id = auth.uid());
create policy "xp_transactions_read_own" on public.xp_transactions for select to authenticated
  using (user_id = auth.uid());
create policy "badges_read_active" on public.badges for select to authenticated
  using (active = true or public.is_staff(array['owner','admin']));
create policy "user_badges_read_own" on public.user_badges for select to authenticated
  using (user_id = auth.uid());
-- Pas de politique client d'écriture XP/badges : seul le serveur peut attribuer des points.

-- 6) Centre d'aide : tickets et échanges avec le support.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  description text not null,
  status text not null default 'open' check (status in ('open','in_progress','waiting_user','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
drop policy if exists "support_tickets_read_owner_or_staff" on public.support_tickets;
drop policy if exists "support_tickets_create_own" on public.support_tickets;
drop policy if exists "support_tickets_update_staff" on public.support_tickets;
drop policy if exists "support_messages_read_owner_or_staff" on public.support_messages;
drop policy if exists "support_messages_create_owner_or_staff" on public.support_messages;
create policy "support_tickets_read_owner_or_staff" on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.is_staff(array['owner','admin','support']));
create policy "support_tickets_create_own" on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid());
create policy "support_tickets_update_staff" on public.support_tickets for update to authenticated
  using (public.is_staff(array['owner','admin','support']))
  with check (public.is_staff(array['owner','admin','support']));
create policy "support_messages_read_owner_or_staff" on public.support_messages for select to authenticated
  using (
    (not is_internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()))
    or public.is_staff(array['owner','admin','support'])
  );
create policy "support_messages_create_owner_or_staff" on public.support_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and (
      (not is_internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()))
      or public.is_staff(array['owner','admin','support'])
    )
  );

-- 7) Journaux d'audit : consultation staff, écriture réservée au serveur.
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_read_admin" on public.audit_logs;
create policy "audit_logs_read_admin" on public.audit_logs for select to authenticated
  using (public.is_staff(array['owner','admin']));

-- 8) État de maintenance et paramètres publics du site.
create table if not exists public.service_status (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  label text not null,
  status text not null default 'operational' check (status in ('operational','degraded','maintenance','outage')),
  message text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.site_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.service_status enable row level security;
alter table public.site_settings enable row level security;
drop policy if exists "service_status_read_all" on public.service_status;
drop policy if exists "service_status_manage_staff" on public.service_status;
drop policy if exists "site_settings_read_public_or_staff" on public.site_settings;
drop policy if exists "site_settings_manage_admin" on public.site_settings;
create policy "service_status_read_all" on public.service_status for select to anon, authenticated using (true);
create policy "service_status_manage_staff" on public.service_status for all to authenticated
  using (public.is_staff(array['owner','admin','tech_lead']))
  with check (public.is_staff(array['owner','admin','tech_lead']));
create policy "site_settings_read_public_or_staff" on public.site_settings for select to anon, authenticated
  using (is_public = true or public.is_staff(array['owner','admin']));
create policy "site_settings_manage_admin" on public.site_settings for all to authenticated
  using (public.is_staff(array['owner','admin']))
  with check (public.is_staff(array['owner','admin']));

-- 9) Données de départ pour le tableau de statut (sans écraser les valeurs existantes).
insert into public.service_status (service_key, label)
values
  ('website','Site Aldetic'),
  ('database','Base de données'),
  ('authentication','Authentification'),
  ('ai','Services IA'),
  ('git','MY GIT'),
  ('cloud','MY CLOUD')
on conflict (service_key) do nothing;

commit;

-- Contrôle final : cette requête affiche les tables ajoutées par cette migration.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
  and table_name in (
    'notifications','teams','team_members','team_invites',
    'referral_codes','referrals','xp_accounts','xp_transactions',
    'badges','user_badges','support_tickets','support_messages',
    'audit_logs','service_status','site_settings'
  )
order by table_name;
