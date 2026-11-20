-- 012 — Assistance : tickets et messages (tables déjà définies dans shema.sql ; « if not exists » les laisse intactes).
-- Un membre ne voit que ses tickets et les messages non internes ; le personnel voit tout et peut ajouter des notes internes.
begin;
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null, description text not null,
  status text not null default 'open' check (status in ('open','in_progress','waiting_user','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null, is_internal boolean not null default false, created_at timestamptz not null default now());
alter table public.support_tickets alter column user_id set default auth.uid();
alter table public.support_messages alter column sender_id set default auth.uid();
alter table public.support_tickets add column if not exists category text not null default 'general';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_category_check') then
    alter table public.support_tickets add constraint support_tickets_category_check check (category in ('general','account','payment','project','ai','recruitment','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_len_check') then
    alter table public.support_tickets add constraint support_tickets_len_check check (char_length(subject) between 3 and 120 and char_length(description) between 10 and 4000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_messages_len_check') then
    alter table public.support_messages add constraint support_messages_len_check check (char_length(body) between 1 and 4000) not valid;
  end if;
end $$;
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create or replace function public.support_ticket_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.support_tickets where user_id = new.user_id and status in ('open','in_progress','waiting_user')) >= 5 then raise exception 'too_many_open_tickets'; end if;
  else
    if new.user_id <> old.user_id or new.subject <> old.subject or new.description <> old.description then raise exception 'immutable_field'; end if;
    if not public.aldetic_is_staff() then
      if new.priority <> old.priority or new.assigned_to is distinct from old.assigned_to then raise exception 'staff_only'; end if;
      if new.status <> old.status and new.status <> 'closed' then raise exception 'owner_can_only_close'; end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists support_ticket_guard on public.support_tickets;
create trigger support_ticket_guard before insert or update on public.support_tickets for each row execute function public.support_ticket_guard();

create or replace function public.support_message_after() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.support_tickets%rowtype;
begin
  select * into t from public.support_tickets where id = new.ticket_id;
  if new.sender_id = t.user_id then
    update public.support_tickets set status = case when status in ('waiting_user','resolved') then 'open' else status end, updated_at = now() where id = t.id;
  elsif not new.is_internal then
    update public.support_tickets set status = case when status in ('open','in_progress') then 'waiting_user' else status end, updated_at = now() where id = t.id;
    insert into public.notifications (user_id, type, title, body, action_url) values (t.user_id, 'support', 'Réponse du support', left(new.body, 140), 'support.html#' || t.id);
  else
    update public.support_tickets set updated_at = now() where id = t.id;
  end if;
  return new;
end $$;
drop trigger if exists support_message_after on public.support_messages;
create trigger support_message_after after insert on public.support_messages for each row execute function public.support_message_after();

create or replace function public.support_message_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.support_tickets%rowtype;
begin
  select * into t from public.support_tickets where id = new.ticket_id;
  if not found then raise exception 'unknown_ticket'; end if;
  if not public.aldetic_is_staff() then
    if t.user_id <> auth.uid() then raise exception 'forbidden'; end if;
    if new.is_internal then raise exception 'staff_only'; end if;
    if t.status = 'closed' then raise exception 'ticket_closed'; end if;
  end if;
  return new;
end $$;
drop trigger if exists support_message_guard on public.support_messages;
create trigger support_message_guard before insert on public.support_messages for each row execute function public.support_message_guard();

alter table public.support_tickets enable row level security; alter table public.support_messages enable row level security;
drop policy if exists m012_tickets_read on public.support_tickets; create policy m012_tickets_read on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists m012_tickets_insert on public.support_tickets; create policy m012_tickets_insert on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
drop policy if exists m012_tickets_update on public.support_tickets; create policy m012_tickets_update on public.support_tickets for update to authenticated using (user_id = auth.uid() or public.aldetic_is_staff()) with check (user_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists m012_messages_read on public.support_messages;
create policy m012_messages_read on public.support_messages for select to authenticated using (public.aldetic_is_staff() or (not is_internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())));
drop policy if exists m012_messages_insert on public.support_messages; create policy m012_messages_insert on public.support_messages for insert to authenticated with check (sender_id = auth.uid());
revoke all on public.support_tickets, public.support_messages from public, anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
grant insert (subject, description, category) on public.support_tickets to authenticated;
grant update (status, priority, assigned_to) on public.support_tickets to authenticated;
grant insert (ticket_id, body, is_internal) on public.support_messages to authenticated;
grant all on public.support_tickets, public.support_messages to service_role;
commit;
