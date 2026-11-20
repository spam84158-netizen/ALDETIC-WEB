-- DESTRUCTIF : supprime l'historique des déploiements. Les sites déjà publiés chez Cloudflare ne sont pas supprimés.
begin;
drop function if exists public.project_file_import(uuid, uuid, text, text);
drop table if exists public.project_domains, public.project_env_keys, public.deployment_logs, public.deployments;
drop function if exists public.deployments_guard();
commit;
