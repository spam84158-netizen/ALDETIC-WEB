-- DESTRUCTIF : supprime les projets, fichiers et versions. Sauvegarde et accord du propriétaire requis.
begin;
drop function if exists public.project_file_delete(uuid, text), public.project_file_rename(uuid, text, text), public.project_file_save(uuid, text, text, integer);
drop table if exists public.project_versions, public.project_files, public.projects;
drop function if exists public.projects_guard();
commit;
