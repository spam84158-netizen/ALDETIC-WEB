\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c101','c1@test'),('00000000-0000-0000-0000-00000000c102','c2@test'),('00000000-0000-0000-0000-00000000c103','adm2@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000c101'),('00000000-0000-0000-0000-00000000c102'),('00000000-0000-0000-0000-00000000c103') on conflict do nothing;
update public.profiles set phone_verified = true where id in ('00000000-0000-0000-0000-00000000c101','00000000-0000-0000-0000-00000000c103');
insert into public.user_roles values ('00000000-0000-0000-0000-00000000c103','admin') on conflict do nothing;
do $$
declare c1 text := '00000000-0000-0000-0000-00000000c101'; c2 text := '00000000-0000-0000-0000-00000000c102'; adm text := '00000000-0000-0000-0000-00000000c103'; n int; ok boolean;
begin
  assert exists (select 1 from storage.buckets where id = 'recruitment-cv' and not public and file_size_limit = 5242880), 'bucket privé 5 Mo';
  set local role authenticated; perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', c1, true);
  insert into storage.objects (bucket_id, name) values ('recruitment-cv', c1 || '/cv.pdf');
  ok := false; begin insert into storage.objects (bucket_id, name) values ('recruitment-cv', c2 || '/cv.pdf'); exception when insufficient_privilege then ok := true; end; assert ok, 'dépôt dans le dossier d''un autre refusé';
  ok := false; begin insert into storage.objects (bucket_id, name) values ('recruitment-cv', 'cv-sans-dossier.pdf'); exception when insufficient_privilege then ok := true; end; assert ok, 'dépôt hors dossier refusé';
  perform set_config('request.jwt.claim.sub', c2, true);
  ok := false; begin insert into storage.objects (bucket_id, name) values ('recruitment-cv', c2 || '/cv.pdf'); exception when insufficient_privilege then ok := true; end; assert ok, 'candidat non vérifié refusé';
  select count(*) into n from storage.objects where bucket_id = 'recruitment-cv'; assert n = 0, 'un autre candidat ne voit pas le CV';
  perform set_config('request.jwt.claim.sub', c1, true);
  select count(*) into n from storage.objects where bucket_id = 'recruitment-cv'; assert n = 1, 'le candidat voit son CV';
  perform set_config('request.jwt.claim.sub', adm, true);
  select count(*) into n from storage.objects where bucket_id = 'recruitment-cv'; assert n = 1, 'un administrateur voit les CV';
  delete from storage.objects where bucket_id = 'recruitment-cv'; get diagnostics n = row_count; assert n = 0, 'un administrateur ne supprime pas le CV d''un candidat';
  perform set_config('request.jwt.claim.sub', c1, true);
  delete from storage.objects where bucket_id = 'recruitment-cv'; get diagnostics n = row_count; assert n = 1, 'le candidat supprime son CV';
  reset role;
end $$;
select 'OK 90_test_cv_storage' as result;
