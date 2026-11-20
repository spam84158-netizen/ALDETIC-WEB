\set ON_ERROR_STOP on
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000a11','g@test'),('00000000-0000-0000-0000-000000000b22','h@test'),
 ('00000000-0000-0000-0000-000000000c33','mod@test'),('00000000-0000-0000-0000-000000000d44','unv@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-000000000a11'),('00000000-0000-0000-0000-000000000b22'),('00000000-0000-0000-0000-000000000c33'),('00000000-0000-0000-0000-000000000d44') on conflict do nothing;
update public.profiles set phone_verified = true where id in ('00000000-0000-0000-0000-000000000a11','00000000-0000-0000-0000-000000000b22','00000000-0000-0000-0000-000000000c33');
insert into public.user_roles values ('00000000-0000-0000-0000-000000000c33','moderator');

do $$
declare g text := '00000000-0000-0000-0000-000000000a11'; h text := '00000000-0000-0000-0000-000000000b22'; m text := '00000000-0000-0000-0000-000000000c33'; u text := '00000000-0000-0000-0000-000000000d44';
  p1 uuid; c1 uuid; c2 uuid; n int; ok boolean;
begin
  set local role authenticated;
  -- Non vérifié : ne peut ni publier ni réagir
  perform set_config('request.jwt.claim.sub', u, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  ok := false; begin insert into public.posts (author_id, body) values (u::uuid, 'spam'); exception when insufficient_privilege or check_violation then ok := true; end; assert ok, 'non vérifié ne publie pas';
  -- g publie ; ne peut pas usurper un auteur
  perform set_config('request.jwt.claim.sub', g, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.posts (author_id, body) values (g::uuid, 'Bonjour ALDETIC') returning id into p1;
  ok := false; begin insert into public.posts (author_id, body) values (h::uuid, 'usurpation'); exception when check_violation or insufficient_privilege then ok := true; end; assert ok, 'usurpation refusée';
  ok := false; begin insert into public.posts (author_id, body) values (g::uuid, ''); exception when check_violation then ok := true; end; assert ok, 'corps vide refusé';
  -- h commente : g est notifié ; h ne peut pas modifier le post de g ; h réagit
  perform set_config('request.jwt.claim.sub', h, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.comments (post_id, author_id, body) values (p1, h::uuid, 'Super !') returning id into c1;
  insert into public.reactions (user_id, target_type, target_id) values (h::uuid, 'post', p1);
  ok := false; begin insert into public.reactions (user_id, target_type, target_id) values (h::uuid, 'post', p1); exception when unique_violation then ok := true; end; assert ok, 'une réaction par cible';
  ok := false; begin insert into public.reactions (user_id, target_type, target_id) values (h::uuid, 'post', gen_random_uuid()); exception when others then ok := sqlerrm = 'unknown_target'; end; assert ok, 'cible inexistante refusée';
  update public.posts set body = 'piraté' where id = p1;
  get diagnostics n = row_count; assert n = 0, 'h ne modifie pas le post de g';
  -- g répond à h : h est notifié ; g est notifié du commentaire et de la réaction
  perform set_config('request.jwt.claim.sub', g, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.comments (post_id, parent_id, author_id, body) values (p1, c1, g::uuid, 'Merci') returning id into c2;
  select count(*) into n from public.notifications; assert n = 2, 'g reçoit 2 notifications (commentaire + réaction), obtenu ' || n;
  insert into public.comments (post_id, author_id, body) values (p1, g::uuid, 'auto-commentaire');
  select count(*) into n from public.notifications; assert n = 2, 'pas de notification pour ses propres actions';
  update public.notifications set read_at = now() where read_at is null; select count(*) into n from public.notifications where read_at is not null; assert n = 2, 'marquage lu';
  ok := false; begin insert into public.notifications (user_id, type, title) values (g::uuid, 'admin', 'faux'); exception when insufficient_privilege then ok := true; end; assert ok, 'pas de création de notification par le client';
  perform set_config('request.jwt.claim.sub', h, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.notifications; assert n = 1, 'h ne voit que sa notification (réponse)';
  -- statistiques
  select count(*) into n from public.post_stats where post_id = p1 and comments = 3 and reactions = 1; assert n = 1, 'post_stats cohérentes';
  -- repartage + notification
  perform set_config('request.jwt.claim.sub', h, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.posts (author_id, body, repost_of) values (h::uuid, 'Je partage', p1);
  perform set_config('request.jwt.claim.sub', g, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.notifications where title like '%repartagée%'; assert n = 1, 'notification de repartage';
  -- signalement : h signale, ne peut le faire qu'une fois, g ne le voit pas, le modérateur oui
  perform set_config('request.jwt.claim.sub', h, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.reports (reporter_id, target_type, target_id, reason) values (h::uuid, 'post', p1, 'contenu suspect');
  ok := false; begin insert into public.reports (reporter_id, target_type, target_id, reason) values (h::uuid, 'post', p1, 'encore'); exception when unique_violation then ok := true; end; assert ok, 'un signalement par cible';
  ok := false; begin update public.reports set status = 'actioned'; get diagnostics n = row_count; ok := n = 0; end; assert ok, 'un membre ne traite pas les signalements';
  perform set_config('request.jwt.claim.sub', g, true); perform set_config('request.jwt.claim.role', 'authenticated', true);  select count(*) into n from public.reports; assert n = 0, 'g ne voit pas le signalement de h';
  perform set_config('request.jwt.claim.sub', m, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.reports; assert n = 1, 'modérateur voit les signalements';
  update public.reports set status = 'actioned', handled_by = m::uuid, handled_at = now();
  update public.posts set deleted_at = now() where id = p1;
  get diagnostics n = row_count; assert n = 1, 'modérateur masque un contenu';
  ok := false; begin update public.posts set body = 'modifié par modo' where id = p1; exception when others then ok := sqlerrm = 'only_author_can_edit'; end; assert ok, 'modérateur ne réécrit pas le texte';
  -- post masqué : invisible pour les autres, visible pour l'auteur et le staff
  perform set_config('request.jwt.claim.sub', h, true); perform set_config('request.jwt.claim.role', 'authenticated', true);  select count(*) into n from public.posts where id = p1; assert n = 0, 'post masqué invisible';
  perform set_config('request.jwt.claim.sub', g, true); perform set_config('request.jwt.claim.role', 'authenticated', true);  select count(*) into n from public.posts where id = p1; assert n = 1, 'auteur voit son post masqué';
  reset role;
end $$;

-- Limite anti-spam : 30 publications par heure
do $$
declare g text := '00000000-0000-0000-0000-000000000a11';
begin
  for i in 1..40 loop insert into public.posts (author_id, body) values (g::uuid, 'p' || i); end loop;
  raise exception 'FAIL: aucune limite de publication';
exception when others then
  if sqlerrm <> 'rate_limited' then raise; end if;
end $$;
select 'OK 40_test_community' as result;
