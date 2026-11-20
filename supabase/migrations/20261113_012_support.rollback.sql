-- Retire les déclencheurs et règles ajoutés ; les tickets et messages existants sont conservés.
begin;
drop trigger if exists support_message_guard on public.support_messages; drop trigger if exists support_message_after on public.support_messages; drop trigger if exists support_ticket_guard on public.support_tickets;
drop function if exists public.support_message_guard(), public.support_message_after(), public.support_ticket_guard();
drop policy if exists m012_messages_insert on public.support_messages; drop policy if exists m012_messages_read on public.support_messages;
drop policy if exists m012_tickets_update on public.support_tickets; drop policy if exists m012_tickets_insert on public.support_tickets; drop policy if exists m012_tickets_read on public.support_tickets;
commit;
