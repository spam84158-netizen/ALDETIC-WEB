-- 013 — Support : pièces jointes privées, notifications automatiques, mise à jour de l'horodatage des tickets.
-- Les tables support_tickets / support_messages et leurs politiques existent déjà (shema.sql) : elles ne sont pas modifiées, sauf une colonne ajoutée.
-- Dépend de 005 (notifications, aldetic_is_staff, aldetic_is_verified).
begin;
alter table public.support_messages add column if not exists attachment_path text;
alter table public.support_messages drop constraint if exists support_attachment_path_check;
alter table public.support_messages add constraint support_attachment_path_check check (attachment_path is null or attachment_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$');
grant insert (attachment_path) on public.support_messages to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-files', 'support-files', false, 5242880, array['application/pdf','image/png','image/jpeg','image/webp','text/plain'])
on conflict (id) do nothing;
drop policy if exists support_files_insert on storage.objects;
create policy support_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'support-files' and (storage.foldername(name))[1] = auth.uid()::text and public.aldetic_is_verified());
drop policy if exists support_files_read on storage.objects;
create policy support_files_read on storage.objects for select to authenticated using (bucket_id = 'support-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.aldetic_is_staff()));
drop policy if exists support_files_delete on storage.objects;
create policy support_files_delete on storage.objects for delete to authenticated using (bucket_id = 'support-files' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.support_on_message() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.support_tickets%rowtype;
begin
  select * into t from public.support_tickets where id = new.ticket_id;
  if not found then return new; end if;
  update public.support_tickets set updated_at = now(),
    status = case when new.sender_id = t.user_id and t.status = 'waiting_user' then 'in_progress' else t.status end where id = t.id;
  if new.sender_id <> t.user_id and not new.is_internal then
    insert into public.notifications (user_id, type, title, body, action_url) values (t.user_id, 'support', 'Réponse du support', left(new.body, 140), 'support.html#' || t.id);
  end if;
  return new;
end $$;
drop trigger if exists support_on_message on public.support_messages;
create trigger support_on_message after insert on public.support_messages for each row execute function public.support_on_message();

create or replace function public.support_on_status() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status and auth.uid() is distinct from new.user_id then
    insert into public.notifications (user_id, type, title, body, action_url) values (new.user_id, 'support', 'Votre demande a été mise à jour', new.subject, 'support.html#' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists support_on_status on public.support_tickets;
create trigger support_on_status after update of status on public.support_tickets for each row execute function public.support_on_status();
commit;
