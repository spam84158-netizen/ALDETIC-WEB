\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000b001','n1@test'),('00000000-0000-0000-0000-00000000b002','n2@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000b001'),('00000000-0000-0000-0000-00000000b002') on conflict do nothing;
do $$
declare u1 uuid := '00000000-0000-0000-0000-00000000b001'; u2 uuid := '00000000-0000-0000-0000-00000000b002'; n int; ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', u1::text, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.notification_preferences (user_id, type, enabled) values (u1, 'community', false);
  ok := false; begin insert into public.notification_preferences (user_id, type, enabled) values (u2, 'news', false); exception when insufficient_privilege then ok := true; end; assert ok, 'pas de préférence pour un autre';
  ok := false; begin insert into public.notification_preferences (user_id, type, enabled) values (u1, 'inconnu', false); exception when check_violation then ok := true; end; assert ok, 'type inconnu refusé';
  update public.notification_preferences set enabled = true where user_id = u1; update public.notification_preferences set enabled = false where user_id = u1;
  reset role;
  insert into public.notifications (user_id, type, title) values (u1, 'community', 'filtrée'), (u1, 'security', 'obligatoire'), (u1, 'projects', 'autorisée'), (u2, 'community', 'autre membre');
  select count(*) into n from public.notifications where user_id = u1; assert n = 2, 'catégorie désactivée filtrée, sécurité conservée : ' || n;
  assert exists (select 1 from public.notifications where user_id = u2 and type = 'community'), 'préférences isolées par membre';
end $$;
select 'OK 60_test_notification_prefs' as result;
