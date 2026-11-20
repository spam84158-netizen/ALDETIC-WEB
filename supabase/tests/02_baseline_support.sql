-- Réplique minimale des tables de support de shema.sql pour la CI (en production elles existent déjà, avec leurs propres politiques).
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, subject text not null, description text not null,
  status text not null default 'open' check (status in ('open','in_progress','waiting_user','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade, sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null, is_internal boolean not null default false, created_at timestamptz not null default now());
alter table public.support_tickets enable row level security; alter table public.support_messages enable row level security;
grant select, insert, update on public.support_tickets, public.support_messages to authenticated;
drop policy if exists t_read on public.support_tickets;
create policy t_read on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists t_create on public.support_tickets;
create policy t_create on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
drop policy if exists t_update on public.support_tickets;
create policy t_update on public.support_tickets for update to authenticated using (public.aldetic_is_staff());
drop policy if exists m_read on public.support_messages;
create policy m_read on public.support_messages for select to authenticated using (public.aldetic_is_staff() or (not is_internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));
drop policy if exists m_create on public.support_messages;
create policy m_create on public.support_messages for insert to authenticated with check (sender_id = auth.uid() and (public.aldetic_is_staff() or (not is_internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()))));
