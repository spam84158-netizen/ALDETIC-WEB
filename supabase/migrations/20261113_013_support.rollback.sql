begin;
drop trigger if exists support_on_status on public.support_tickets; drop function if exists public.support_on_status();
drop trigger if exists support_on_message on public.support_messages; drop function if exists public.support_on_message();
drop policy if exists support_files_insert on storage.objects; drop policy if exists support_files_read on storage.objects; drop policy if exists support_files_delete on storage.objects;
alter table public.support_messages drop constraint if exists support_attachment_path_check;
commit;
