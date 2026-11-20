\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e201','cl1@test'),('00000000-0000-0000-0000-00000000e202','cl2@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000e201'),('00000000-0000-0000-0000-00000000e202') on conflict do nothing;
update public.profiles set phone_verified = true where id in ('00000000-0000-0000-0000-00000000e201','00000000-0000-0000-0000-00000000e202');
do $$
declare a uuid := '00000000-0000-0000-0000-00000000e201'; b uuid := '00000000-0000-0000-0000-00000000e202'; pid uuid; did uuid; r jsonb; n int; ok boolean;
begin
  insert into public.projects (owner_id, slug, name) values (a, 'site-cloud', 'Site cloud') returning id into pid;
  insert into public.deployments (project_id, owner_id) values (pid, a) returning id into did;
  insert into public.deployment_logs (deployment_id, message) values (did, 'Vérification'); insert into public.project_env_keys (project_id, key) values (pid, 'API_KEY');
  insert into public.project_domains (project_id, domain) values (pid, 'mon-site.exemple.ci');
  ok := false; begin insert into public.project_env_keys (project_id, key) values (pid, 'mauvaise clé'); exception when check_violation then ok := true; end; assert ok, 'nom de variable invalide refusé';
  ok := false; begin insert into public.project_domains (project_id, domain) values (pid, 'mon-site.exemple.ci'); exception when unique_violation then ok := true; end; assert ok, 'domaine unique';
  set local role authenticated; perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  select count(*) into n from public.deployments; assert n = 1, 'le propriétaire voit ses déploiements';
  select count(*) into n from public.deployment_logs; assert n = 1, 'et leurs journaux';
  select count(*) into n from public.project_env_keys; assert n = 1, 'et les NOMS de variables';
  ok := false; begin insert into public.deployments (project_id, owner_id, status) values (pid, a, 'ready'); exception when insufficient_privilege then ok := true; end; assert ok, 'un membre ne fabrique pas un déploiement « ready »';
  ok := false; begin update public.deployments set status = 'ready'; exception when insufficient_privilege then ok := true; end; assert ok, 'pas de modification du statut';
  ok := false; begin perform public.project_file_import(a, pid, 'x.txt', 'x'); exception when insufficient_privilege then ok := true; end; assert ok, 'import réservé au serveur';
  perform set_config('request.jwt.claim.sub', b::text, true);
  select count(*) into n from public.deployments; assert n = 0, 'un autre membre ne voit rien';
  select count(*) into n from public.deployment_logs; assert n = 0; select count(*) into n from public.project_env_keys; assert n = 0; select count(*) into n from public.project_domains; assert n = 0;
  reset role;
  r := public.project_file_import(a, pid, 'index.html', '<h1>a</h1>'); assert (r->>'ok')::boolean and (r->>'version')::int = 1, 'import v1';
  r := public.project_file_import(a, pid, 'index.html', '<h1>b</h1>'); assert (r->>'version')::int = 2, 'import v2 (historique conservé)';
  r := public.project_file_import(b, pid, 'index.html', 'piraté'); assert r->>'reason' = 'forbidden', 'import refusé pour un autre propriétaire';
  r := public.project_file_import(a, pid, '../x', 'x'); assert r->>'reason' = 'invalid_path', 'chemin dangereux refusé';
  assert (select count(*) from public.project_versions where project_id = pid) = 2, 'versions enregistrées';
  -- plafond : 10 déploiements par heure
  for i in 1..9 loop insert into public.deployments (project_id, owner_id) values (pid, a); end loop;
  ok := false; begin insert into public.deployments (project_id, owner_id) values (pid, a); exception when others then ok := sqlerrm = 'rate_limited'; end; assert ok, 'plafond de déploiements';
end $$;
select 'OK 85_test_cloud' as result;
