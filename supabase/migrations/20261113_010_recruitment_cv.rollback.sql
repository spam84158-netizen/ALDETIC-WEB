-- Retire les règles d'accès. Les fichiers déjà envoyés ne sont pas supprimés.
begin;
drop policy if exists recruitment_cv_insert on storage.objects;
drop policy if exists recruitment_cv_read on storage.objects;
drop policy if exists recruitment_cv_delete on storage.objects;
commit;
