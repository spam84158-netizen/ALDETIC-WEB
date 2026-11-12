-- Aldetic patch 2026-11: candidatures, réponses et audit.
-- À exécuter dans Supabase SQL Editor avant de déployer les fonctions Edge.
begin;
alter table public.applications add column if not exists name text;
alter table public.applications add column if not exists profile text;
alter table public.applications add column if not exists message text;
alter table public.applications add column if not exists replied_at timestamptz;
create table if not exists public.application_replies (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.applications(id) on delete cascade,
 admin_id uuid not null references public.profiles(id) on delete restrict,
 message text not null check (char_length(message) between 2 and 3000),
 sent_at timestamptz not null default now()
);
alter table public.application_replies enable row level security;
drop policy if exists "application_replies_owner_read" on public.application_replies;
create policy "application_replies_owner_read" on public.application_replies for select to authenticated
 using (public.is_staff(array['owner','admin']));
revoke insert, update, delete on public.application_replies from anon, authenticated;
commit;
