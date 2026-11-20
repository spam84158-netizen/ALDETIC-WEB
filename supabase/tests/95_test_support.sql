\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e201','s1@test'),('00000000-0000-0000-0000-00000000e202','s2@test'),('00000000-0000-0000-0000-00000000e203','sst@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000e201'),('00000000-0000-0000-0000-00000000e202'),('00000000-0000-0000-0000-00000000e203') on conflict do nothing;
insert into public.user_roles values ('00000000-0000-0000-0000-00000000e203','admin') on conflict do nothing;
do $$
declare u1 text := '00000000-0000-0000-0000-00000000e201'; u2 text := '00000000-0000-0000-0000-00000000e202'; st text := '00000000-0000-0000-0000-00000000e203'; t uuid; n int; ok boolean;
begin
  set local role authenticated; perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', u1, true);
  insert into public.support_tickets (category, subject, description) values ('payment', 'Dépôt non crédité', 'Mon dépôt Wave de 5000 FCFA n''apparaît pas.') returning id into t;
  assert (select user_id::text from public.support_tickets where id = t) = u1, 'propriétaire = utilisateur connecté';
  ok := false; begin insert into public.support_tickets (subject, description, priority) values ('Urgent', 'Je veux la priorité maximale svp.', 'urgent'); exception when insufficient_privilege then ok := true; end; assert ok, 'priorité non choisissable';
  ok := false; begin insert into public.support_tickets (subject, description) values ('ab', 'trop court'); exception when check_violation then ok := true; end; assert ok, 'sujet trop court refusé';
  perform set_config('request.jwt.claim.sub', u2, true);
  select count(*) into n from public.support_tickets; assert n = 0, 'ticket invisible pour un autre membre';
  ok := false; begin insert into public.support_messages (ticket_id, body) values (t, 'intrusion'); exception when others then ok := sqlerrm = 'forbidden'; end; assert ok, 'message sur le ticket d''un autre refusé';
  perform set_config('request.jwt.claim.sub', st, true);
  select count(*) into n from public.support_tickets; assert n = 1, 'le personnel voit les tickets';
  insert into public.support_messages (ticket_id, body, is_internal) values (t, 'Vérifier le journal Flutterwave', true);
  assert (select status from public.support_tickets where id = t) = 'open', 'note interne : statut inchangé';
  insert into public.support_messages (ticket_id, body) values (t, 'Nous vérifions votre paiement.');
  assert (select status from public.support_tickets where id = t) = 'waiting_user', 'réponse publique : attente du membre';
  update public.support_tickets set priority = 'high', assigned_to = st::uuid where id = t; get diagnostics n = row_count; assert n = 1, 'le personnel fixe la priorité';
  perform set_config('request.jwt.claim.sub', u1, true);
  select count(*) into n from public.support_messages where ticket_id = t; assert n = 1, 'le membre ne voit pas la note interne';
  select count(*) into n from public.notifications where user_id = u1::uuid and type = 'support'; assert n = 1, 'notification de réponse';
  ok := false; begin insert into public.support_messages (ticket_id, body, is_internal) values (t, 'je me prends pour le support', true); exception when others then ok := sqlerrm = 'staff_only'; end; assert ok, 'le membre ne crée pas de note interne';
  insert into public.support_messages (ticket_id, body) values (t, 'Voici la référence : DEP-1234');
  assert (select status from public.support_tickets where id = t) = 'open', 'réponse du membre : ticket rouvert';
  ok := false; begin update public.support_tickets set priority = 'urgent' where id = t; exception when insufficient_privilege or others then ok := true; end; assert ok, 'le membre ne change pas la priorité';
  ok := false; begin update public.support_tickets set status = 'resolved' where id = t; exception when others then ok := sqlerrm like '%owner_can_only_close%' or sqlerrm like '%permission%'; end; assert ok, 'le membre ne marque pas résolu';
  update public.support_tickets set status = 'closed' where id = t; assert (select status from public.support_tickets where id = t) = 'closed', 'le membre clôt son ticket';
  ok := false; begin insert into public.support_messages (ticket_id, body) values (t, 'message après clôture'); exception when others then ok := sqlerrm = 'ticket_closed'; end; assert ok, 'ticket clos : plus de message';
  -- plafond de 5 tickets ouverts
  for i in 1..5 loop insert into public.support_tickets (subject, description) values ('Sujet ' || i, 'Description suffisamment longue ' || i); end loop;
  ok := false; begin insert into public.support_tickets (subject, description) values ('Sixième', 'Description suffisamment longue 6'); exception when others then ok := sqlerrm = 'too_many_open_tickets'; end; assert ok, 'plafond de 5 tickets ouverts';
  reset role;
end $$;
select 'OK 95_test_support' as result;
