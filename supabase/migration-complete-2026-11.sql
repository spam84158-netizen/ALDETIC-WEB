-- Aldetic : migration complémentaire. Additive et sans suppression de données.
-- À exécuter dans Supabase SQL Editor du projet existant.
begin;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists public_profile_enabled boolean not null default true;
revoke update on public.profiles from public,anon,authenticated;
revoke update (phone_verified) on public.profiles from public,anon,authenticated;
grant update (username,display_name,bio,lang,phone,avatar_url,website,public_profile_enabled) on public.profiles to authenticated;
-- La politique de profil doit limiter les modifications au propriétaire de la ligne.
-- Helper RLS utilisé par les politiques de support, audit et administration.
create or replace function public.is_staff(allowed_roles text[]) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role)=any(allowed_roles)); $$;
revoke all on function public.is_staff(text[]) from public;
grant execute on function public.is_staff(text[]) to authenticated;
-- Profils : l'utilisateur ne peut modifier que sa propre ligne et les colonnes autorisées.
alter table public.profiles enable row level security;
grant select,insert on public.profiles to authenticated;
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles for select to authenticated using(id=auth.uid());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check(id=auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
-- Rôles : lecture du rôle propre uniquement. Les écritures restent réservées au serveur.
alter table public.user_roles enable row level security;
grant select on public.user_roles to authenticated;
drop policy if exists "user_roles_read_own" on public.user_roles;
create policy "user_roles_read_own" on public.user_roles for select to authenticated using(user_id=auth.uid());
-- Le bucket est public uniquement pour afficher les avatars; écriture limitée au dossier UUID de l'utilisateur.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id='avatars');
drop policy if exists "avatars_user_insert" on storage.objects;
create policy "avatars_user_insert" on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "avatars_user_update" on storage.objects;
create policy "avatars_user_update" on storage.objects for update to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "avatars_user_delete" on storage.objects;
create policy "avatars_user_delete" on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create table if not exists public.teams(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,name text not null,description text,created_at timestamptz not null default now());
create table if not exists public.team_members(team_id uuid not null references public.teams(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,role text not null default 'member' check(role in ('owner','admin','member')),joined_at timestamptz not null default now(),primary key(team_id,user_id));
create table if not exists public.team_invites(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,invited_by uuid not null references public.profiles(id) on delete cascade,email text not null,role text not null default 'member' check(role in ('admin','member')),token uuid not null unique default gen_random_uuid(),expires_at timestamptz not null default(now()+interval '7 days'),accepted_at timestamptz,created_at timestamptz not null default now());
create or replace function public.is_team_member(p_team_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.team_members tm where tm.team_id=p_team_id and tm.user_id=auth.uid()); $$;
create or replace function public.is_team_admin(p_team_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.teams t where t.id=p_team_id and t.owner_id=auth.uid()) or exists(select 1 from public.team_members tm where tm.team_id=p_team_id and tm.user_id=auth.uid() and tm.role in ('owner','admin')); $$;
revoke all on function public.is_team_member(uuid) from public; revoke all on function public.is_team_admin(uuid) from public; grant execute on function public.is_team_member(uuid),public.is_team_admin(uuid) to authenticated;
alter table public.teams enable row level security; alter table public.team_members enable row level security; alter table public.team_invites enable row level security;
drop policy if exists "teams_read_members" on public.teams; create policy "teams_read_members" on public.teams for select to authenticated using(owner_id=auth.uid() or public.is_team_member(id));
drop policy if exists "teams_create_own" on public.teams; create policy "teams_create_own" on public.teams for insert to authenticated with check(owner_id=auth.uid());
drop policy if exists "teams_update_admin" on public.teams; create policy "teams_update_admin" on public.teams for update to authenticated using(public.is_team_admin(id)) with check(public.is_team_admin(id));
drop policy if exists "teams_delete_owner" on public.teams; create policy "teams_delete_owner" on public.teams for delete to authenticated using(owner_id=auth.uid());
drop policy if exists "team_members_read_team" on public.team_members; create policy "team_members_read_team" on public.team_members for select to authenticated using(user_id=auth.uid() or public.is_team_member(team_id));
drop policy if exists "team_members_add_admin" on public.team_members; create policy "team_members_add_admin" on public.team_members for insert to authenticated with check(public.is_team_admin(team_id));
drop policy if exists "team_members_remove_admin_or_self" on public.team_members; create policy "team_members_remove_admin_or_self" on public.team_members for delete to authenticated using(public.is_team_admin(team_id) or user_id=auth.uid());
drop policy if exists "team_invites_read_admin_or_invitee" on public.team_invites; create policy "team_invites_read_admin_or_invitee" on public.team_invites for select to authenticated using(public.is_team_admin(team_id) or lower(email)=lower(coalesce(auth.jwt()->>'email','')));
drop policy if exists "team_invites_create_admin" on public.team_invites; create policy "team_invites_create_admin" on public.team_invites for insert to authenticated with check(invited_by=auth.uid() and public.is_team_admin(team_id));
drop policy if exists "team_invites_update_admin_or_invitee" on public.team_invites; create policy "team_invites_update_admin_or_invitee" on public.team_invites for update to authenticated using(public.is_team_admin(team_id) or lower(email)=lower(coalesce(auth.jwt()->>'email',''))) with check(public.is_team_admin(team_id) or lower(email)=lower(coalesce(auth.jwt()->>'email','')));
drop policy if exists "team_invites_delete_admin" on public.team_invites; create policy "team_invites_delete_admin" on public.team_invites for delete to authenticated using(public.is_team_admin(team_id));
create table if not exists public.support_tickets(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,subject text not null,description text not null,status text not null default 'open' check(status in ('open','in_progress','waiting_user','resolved','closed')),priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),assigned_to uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.support_messages(id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.support_tickets(id) on delete cascade,sender_id uuid not null references public.profiles(id) on delete cascade,body text not null,is_internal boolean not null default false,created_at timestamptz not null default now());
alter table public.support_tickets enable row level security; alter table public.support_messages enable row level security;
drop policy if exists "support_tickets_read_owner_or_staff" on public.support_tickets; create policy "support_tickets_read_owner_or_staff" on public.support_tickets for select to authenticated using(user_id=auth.uid() or public.is_staff(array['owner','admin','support']));
drop policy if exists "support_tickets_create_own" on public.support_tickets; create policy "support_tickets_create_own" on public.support_tickets for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "support_messages_read_owner_or_staff" on public.support_messages; create policy "support_messages_read_owner_or_staff" on public.support_messages for select to authenticated using((not is_internal and exists(select 1 from public.support_tickets t where t.id=ticket_id and t.user_id=auth.uid())) or public.is_staff(array['owner','admin','support']));
drop policy if exists "support_messages_create_owner_or_staff" on public.support_messages; create policy "support_messages_create_owner_or_staff" on public.support_messages for insert to authenticated with check(sender_id=auth.uid() and not is_internal and exists(select 1 from public.support_tickets t where t.id=ticket_id and t.user_id=auth.uid()));
create table if not exists public.notification_preferences(user_id uuid primary key references public.profiles(id) on delete cascade,account boolean not null default true,projects boolean not null default true,teams boolean not null default true,community boolean not null default false,news boolean not null default false,updated_at timestamptz not null default now());
alter table public.notification_preferences enable row level security;
drop policy if exists "notification_preferences_own" on public.notification_preferences; create policy "notification_preferences_own" on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create table if not exists public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,type text not null default 'info',title text not null,body text,action_url text,read_at timestamptz,created_at timestamptz not null default now());
alter table public.notifications enable row level security;
drop policy if exists "notifications_read_own" on public.notifications; create policy "notifications_read_own" on public.notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists "notifications_update_own" on public.notifications; create policy "notifications_update_own" on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.teams,public.team_members,public.team_invites to authenticated;
grant select,insert on public.support_tickets to authenticated;
grant select,insert on public.support_messages to authenticated;
grant select,insert,update,delete on public.notification_preferences to authenticated;
grant select,update on public.notifications to authenticated;
create table if not exists public.contact_messages(
 id uuid primary key default gen_random_uuid(), name text not null, email text not null,
 message text not null, created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists "contact_messages_staff_read" on public.contact_messages;
create policy "contact_messages_staff_read" on public.contact_messages for select to authenticated using (public.is_staff(array['owner','admin','support']));
revoke all on public.contact_messages from anon,authenticated;
grant select on public.contact_messages to authenticated;
alter table public.applications enable row level security;
grant select,update on public.applications to authenticated;
drop policy if exists "applications_staff_read" on public.applications;
create policy "applications_staff_read" on public.applications for select to authenticated using(public.is_staff(array['owner','admin']));
drop policy if exists "applications_staff_update" on public.applications;
create policy "applications_staff_update" on public.applications for update to authenticated using(public.is_staff(array['owner','admin'])) with check(public.is_staff(array['owner','admin']));
create table if not exists public.application_replies(
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
 admin_id uuid not null references public.profiles(id) on delete restrict, message text not null check(char_length(message) between 2 and 3000), sent_at timestamptz not null default now()
);
alter table public.applications add column if not exists name text;
alter table public.applications add column if not exists profile text;
alter table public.applications add column if not exists message text;
alter table public.applications add column if not exists replied_at timestamptz;
alter table public.application_replies enable row level security;
drop policy if exists "application_replies_owner_read" on public.application_replies;
create policy "application_replies_owner_read" on public.application_replies for select to authenticated using(public.is_staff(array['owner','admin']));
grant select on public.application_replies to authenticated;
revoke insert,update,delete on public.application_replies from anon,authenticated;
create table if not exists public.audit_logs(
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id) on delete set null,
 action text not null, target_type text, target_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_read_admin" on public.audit_logs;
create policy "audit_logs_read_admin" on public.audit_logs for select to authenticated using(public.is_staff(array['owner','admin']));
grant select on public.audit_logs to authenticated;
revoke insert,update,delete on public.audit_logs from anon,authenticated;
commit;
