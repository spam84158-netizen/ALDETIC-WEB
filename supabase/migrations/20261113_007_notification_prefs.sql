-- 007 — Préférences de notification : un membre peut désactiver une catégorie ; sécurité et compte restent obligatoires.
begin;
create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('projects','teams','community','news','referral','recruitment','ai','support','deployments','monetization','deposits','withdrawals','revenue')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_prefs_own on public.notification_preferences;
create policy notification_prefs_own on public.notification_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, delete on public.notification_preferences to authenticated;
grant update (enabled, updated_at) on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

create or replace function public.notifications_respect_prefs() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.type in ('security', 'account', 'info') then return new; end if;
  if exists (select 1 from public.notification_preferences where user_id = new.user_id and type = new.type and not enabled) then return null; end if;
  return new;
end $$;
drop trigger if exists notifications_respect_prefs on public.notifications;
create trigger notifications_respect_prefs before insert on public.notifications for each row execute function public.notifications_respect_prefs();
commit;
