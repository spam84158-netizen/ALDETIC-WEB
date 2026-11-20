-- 010 — Stockage privé des CV : dossier par candidat, PDF/DOCX, 5 Mo ; lecture par le candidat et les administrateurs.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recruitment-cv', 'recruitment-cv', false, 5242880, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
drop policy if exists recruitment_cv_insert on storage.objects;
create policy recruitment_cv_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recruitment-cv' and (storage.foldername(name))[1] = auth.uid()::text and public.aldetic_is_verified());
drop policy if exists recruitment_cv_read on storage.objects;
create policy recruitment_cv_read on storage.objects for select to authenticated
  using (bucket_id = 'recruitment-cv' and ((storage.foldername(name))[1] = auth.uid()::text or public.aldetic_is_admin()));
drop policy if exists recruitment_cv_delete on storage.objects;
create policy recruitment_cv_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recruitment-cv' and (storage.foldername(name))[1] = auth.uid()::text);
commit;
