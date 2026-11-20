\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f001','p1@test'),('00000000-0000-0000-0000-00000000f002','p2@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000f001'),('00000000-0000-0000-0000-00000000f002') on conflict do nothing;
update public.profiles set phone_verified = true where id in ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000f002');
do $$
declare a text := '00000000-0000-0000-0000-00000000f001'; b text := '00000000-0000-0000-0000-00000000f002'; pid uuid; pub uuid; r jsonb; n int; ok boolean;
begin
  set local role authenticated; perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', a, true);
  insert into public.projects (slug, name, visibility) values ('mon-site', 'Mon site', 'private') returning id into pid;
  insert into public.projects (slug, name, description, visibility) values ('vitrine', 'Vitrine', 'Publique', 'public') returning id into pub;
  assert (select owner_id::text from public.projects where id = pid) = a, 'propriétaire = utilisateur connecté';
  ok := false; begin insert into public.projects (slug, name) values ('Mauvais Slug', 'x'); exception when check_violation then ok := true; end; assert ok, 'slug invalide refusé';
  ok := false; begin insert into public.projects (owner_id, slug, name) values (b::uuid, 'usurpe', 'Usurpé'); exception when insufficient_privilege then ok := true; end; assert ok, 'owner_id non choisissable';
  ok := false; begin insert into public.projects (slug, name) values ('mon-site', 'Doublon'); exception when unique_violation then ok := true; end; assert ok, 'slug unique par propriétaire';
  -- fichiers : création, versions, conflit
  r := public.project_file_save(pid, 'index.html', '<h1>Salut</h1>');                assert (r->>'ok')::boolean and (r->>'version')::int = 1, 'création v1';
  r := public.project_file_save(pid, 'index.html', '<h1>Salut 2</h1>', 1);            assert (r->>'ok')::boolean and (r->>'version')::int = 2, 'v2';
  r := public.project_file_save(pid, 'index.html', 'écrasement', 1);                  assert r->>'reason' = 'conflict' and (r->>'current')::int = 2, 'conflit détecté';
  r := public.project_file_save(pid, 'index.html', 'sans version');                   assert r->>'reason' = 'conflict', 'fichier existant sans version attendue';
  r := public.project_file_save(pid, 'nouveau.js', 'x', 3);                           assert r->>'reason' = 'not_found', 'version attendue sur fichier absent';
  r := public.project_file_save(pid, '../etc/passwd', 'x');                           assert r->>'reason' = 'invalid_path', 'traversée de chemin';
  r := public.project_file_save(pid, '/abs.txt', 'x');                                assert r->>'reason' = 'invalid_path', 'chemin absolu';
  r := public.project_file_save(pid, 'a b.txt', 'x');                                 assert r->>'reason' = 'invalid_path', 'espace interdit';
  r := public.project_file_save(pid, 'gros.txt', repeat('x', 500001));                assert r->>'reason' = 'too_large', 'taille limitée';
  assert (select count(*) from public.project_versions where project_id = pid) = 2, 'historique : 2 versions';
  assert (select content from public.project_versions where project_id = pid and version = 1) = '<h1>Salut</h1>', 'contenu v1 conservé';
  -- restauration = nouvelle version avec l'ancien contenu
  r := public.project_file_save(pid, 'index.html', (select content from public.project_versions where project_id = pid and version = 1), 2); assert (r->>'version')::int = 3, 'restauration v3';
  -- historique plafonné à 50
  for i in 1..55 loop r := public.project_file_save(pid, 'index.html', 'v' || i, 3 + i - 1); assert (r->>'ok')::boolean, 'boucle ' || i; end loop;
  select count(*) into n from public.project_versions where project_id = pid; assert n = 50, 'historique plafonné à 50 : ' || n;
  -- renommage / suppression
  r := public.project_file_save(pid, 'b.txt', 'b');
  r := public.project_file_rename(pid, 'b.txt', 'index.html');                        assert r->>'reason' = 'exists', 'renommage vers existant refusé';
  r := public.project_file_rename(pid, 'b.txt', 'c.txt');                             assert (r->>'ok')::boolean, 'renommage';
  r := public.project_file_delete(pid, 'c.txt');                                      assert (r->>'ok')::boolean, 'suppression';
  r := public.project_file_delete(pid, 'c.txt');                                      assert r->>'reason' = 'not_found', 'suppression d''un fichier absent';
  -- écritures directes interdites
  ok := false; begin insert into public.project_files (project_id, path, content) values (pid, 'direct.txt', 'x'); exception when insufficient_privilege then ok := true; end; assert ok, 'insert direct interdit';
  ok := false; begin update public.project_files set content = 'x'; exception when insufficient_privilege then ok := true; end; assert ok, 'update direct interdit';
  r := public.project_file_save(pub, 'README.md', 'public');
  -- autre utilisateur
  perform set_config('request.jwt.claim.sub', b, true);
  select count(*) into n from public.projects where id = pid; assert n = 0, 'projet privé invisible';
  select count(*) into n from public.projects where id = pub; assert n = 1, 'projet public visible';
  select count(*) into n from public.project_files where project_id = pid; assert n = 0, 'fichiers privés invisibles';
  select count(*) into n from public.project_files where project_id = pub; assert n = 1, 'fichiers publics lisibles';
  select count(*) into n from public.project_versions where project_id = pub; assert n = 0, 'historique réservé au propriétaire';
  r := public.project_file_save(pid, 'index.html', 'piraté', 56);                     assert r->>'reason' = 'forbidden', 'écriture refusée à un autre';
  r := public.project_file_save(pub, 'README.md', 'piraté', 1);                       assert r->>'reason' = 'forbidden', 'écriture refusée même sur projet public';
  r := public.project_file_delete(pub, 'README.md');                                  assert r->>'reason' = 'forbidden', 'suppression refusée à un autre';
  update public.projects set name = 'piraté' where id = pub; get diagnostics n = row_count; assert n = 0, 'modification refusée à un autre';
  -- archivage : plus d'écriture
  perform set_config('request.jwt.claim.sub', a, true);
  update public.projects set status = 'archived' where id = pid;
  r := public.project_file_save(pid, 'index.html', 'x', 58);                          assert r->>'reason' = 'archived', 'projet archivé en lecture seule';
  perform set_config('request.jwt.claim.sub', b, true);
  select count(*) into n from public.projects where id = pid; assert n = 0, 'archivé : invisible aux autres';
  reset role;
end $$;
-- Plafond de projets actifs (20)
do $$
declare a text := '00000000-0000-0000-0000-00000000f001';
begin
  set local role authenticated; perform set_config('request.jwt.claim.sub', a, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  for i in 1..25 loop insert into public.projects (slug, name) values ('p-' || lpad(i::text, 3, '0'), 'Projet ' || i); end loop;
  raise exception 'FAIL: pas de plafond';
exception when others then if sqlerrm <> 'too_many_projects' then raise; end if;
end $$;
-- Plafond de fichiers (200)
do $$
declare a text := '00000000-0000-0000-0000-00000000f002'; pid uuid; r jsonb;
begin
  set local role authenticated; perform set_config('request.jwt.claim.sub', a, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.projects (slug, name) values ('gros-projet', 'Gros projet') returning id into pid;
  for i in 1..200 loop r := public.project_file_save(pid, 'f' || i || '.txt', 'x'); assert (r->>'ok')::boolean, 'fichier ' || i; end loop;
  r := public.project_file_save(pid, 'f201.txt', 'x'); assert r->>'reason' = 'too_many_files', 'plafond 200 fichiers';
  reset role;
end $$;
select 'OK 80_test_projects' as result;
