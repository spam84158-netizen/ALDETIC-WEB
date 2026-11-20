\set ON_ERROR_STOP on
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000a001','ref@test'),('00000000-0000-0000-0000-00000000a002','adm@test'),('00000000-0000-0000-0000-00000000a003','cand@test'),('00000000-0000-0000-0000-00000000a004','cand2@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000a001'),('00000000-0000-0000-0000-00000000a002'),('00000000-0000-0000-0000-00000000a003'),('00000000-0000-0000-0000-00000000a004') on conflict do nothing;
update public.profiles set phone_verified = true where id in ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000a003');
insert into public.user_roles values ('00000000-0000-0000-0000-00000000a002','admin');
-- 30 filleuls potentiels
insert into auth.users (id, email) select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'f' || i || '@test' from generate_series(1, 30) i on conflict do nothing;
insert into public.profiles (id) select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 30) i on conflict do nothing;

do $$
declare ref text := '00000000-0000-0000-0000-00000000a001'; v_code text; r jsonb; n int; ok boolean; f uuid; ids uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', ref, true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_code := public.referral_code_ensure(); assert length(v_code) = 8, 'code généré';
  assert public.referral_code_ensure() = v_code, 'code stable';
  r := public.referral_claim(v_code); assert r->>'reason' = 'self_referral', 'auto-parrainage bloqué';
  ok := false; begin insert into public.referrals (referrer_id, referred_user_id) values (ref::uuid, '00000000-0000-0000-0001-000000000001'); exception when insufficient_privilege then ok := true; end; assert ok, 'pas d''insert client sur referrals';
  ok := false; begin insert into public.user_badges (user_id, badge_id) values (ref::uuid, gen_random_uuid()); exception when insufficient_privilege then ok := true; end; assert ok, 'pas de badge par le client';
  -- 10 filleuls réclament le code (aucun n'a vérifié son numéro)
  for i in 1..10 loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-' || lpad(i::text, 12, '0'), true);
    r := public.referral_claim(lower(v_code)); assert (r->>'ok')::boolean, 'claim ' || i;
  end loop;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-000000000001', true);
  r := public.referral_claim(v_code); assert r->>'reason' = 'already_referred', 'un seul parrain';
  r := public.referral_claim('ZZZZZZZZ'); assert r->>'reason' = 'already_referred' or r->>'reason' = 'invalid_code';
  perform set_config('request.jwt.claim.sub', ref, true);
  assert (select pending from public.referral_progress where user_id = ref::uuid) = 10 and (select available from public.referral_progress where user_id = ref::uuid) = 0, 'clics/inscriptions non vérifiées ne comptent pas';
  reset role;
  -- 7 filleuls vérifient leur numéro (serveur) : 7 qualifiés, pas encore 8
  update public.profiles set phone_verified = true where id in (select ('00000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 7) i);
  assert (select count(*) from public.referrals where status = 'qualified') = 7, '7 qualifiés';
  assert (select count(*) from public.notifications where user_id = ref::uuid and type = 'referral') = 7, 'notifications parrain';
  r := public.referral_consume(ref::uuid); assert r->>'reason' = 'not_enough' and (r->>'available')::int = 7, '7 < 8 : refusé';
  update public.profiles set phone_verified = true where id = '00000000-0000-0000-0001-000000000008';
  r := public.referral_consume(ref::uuid); assert (r->>'ok')::boolean, '8 : utilisation accordée';
  assert (select count(*) from public.referrals where status = 'rewarded' and consumed_at is not null) = 8, '8 consommés';
  r := public.referral_consume(ref::uuid); assert r->>'reason' = 'not_enough', 'pas de réutilisation des mêmes 8';
  -- paramètre modifiable
  update public.platform_settings set value = '2' where key = 'referral_required';
  update public.profiles set phone_verified = true where id in ('00000000-0000-0000-0001-000000000009','00000000-0000-0000-0001-000000000010');
  r := public.referral_consume(ref::uuid); assert (r->>'ok')::boolean, 'seuil configurable';
  update public.platform_settings set value = '8' where key = 'referral_required';
  -- rafale : au-delà de 20 en 1 h => rejeté
  for i in 11..30 loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-' || lpad(i::text, 12, '0'), true);
    set local role authenticated; r := public.referral_claim(v_code); reset role;
  end loop;
  assert (select count(*) from public.referrals where status = 'rejected' and reject_reason = 'velocity') = 10, 'rafale détectée';
  -- compte trop ancien
  update auth.users set created_at = now() - interval '30 days' where id = '00000000-0000-0000-0000-00000000a004';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a004', true);
  set local role authenticated; r := public.referral_claim(v_code); reset role;
  assert r->>'reason' in ('too_late', 'flagged'), 'compte ancien refusé : ' || r::text;
end $$;

-- Recrutement
do $$
declare adm text := '00000000-0000-0000-0000-00000000a002'; c1 text := '00000000-0000-0000-0000-00000000a003'; c2 text := '00000000-0000-0000-0000-00000000a004';
  offer uuid; app uuid; r jsonb; n int; ok boolean;
begin
  insert into public.job_offers (slug, title, status, role_on_accept) values ('dev-backend', 'Développeur backend', 'open', 'developer') returning id into offer;
  insert into public.job_offers (slug, title, status) values ('ferme', 'Poste fermé', 'closed');
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  -- non vérifié : refusé
  perform set_config('request.jwt.claim.sub', c2, true);
  ok := false; begin insert into public.recruitment_applications (offer_id, full_name, email, message) values (offer, 'Non Vérifié', 'x@test.io', 'Je souhaite candidater à ce poste très volontiers.'); exception when insufficient_privilege or check_violation then ok := true; end; assert ok, 'candidat non vérifié refusé';
  -- candidat vérifié
  perform set_config('request.jwt.claim.sub', c1, true);
  insert into public.recruitment_applications (offer_id, full_name, email, message) values (offer, 'Awa Koné', 'awa@test.io', 'Développeuse backend, 4 ans d''expérience Node et Postgres.') returning id into app;
  ok := false; begin insert into public.recruitment_applications (offer_id, full_name, email, message) values (offer, 'Awa Koné', 'awa@test.io', 'Deuxième candidature au même poste, refusée.'); exception when unique_violation then ok := true; end; assert ok, 'une candidature par offre';
  ok := false; begin insert into public.recruitment_applications (offer_id, full_name, email, message) select id, 'Awa', 'a@t.io', 'Candidature à une offre fermée, doit échouer.' from public.job_offers where slug = 'ferme'; exception when others then ok := true; end; assert ok, 'offre fermée refusée';
  ok := false; begin insert into public.recruitment_applications (full_name, email, message, cv_path) values ('Awa', 'a@t.io', 'Chemin de CV pointant vers le dossier d''un autre membre.', '00000000-0000-0000-0000-00000000a004/cv.pdf'); exception when check_violation then ok := true; end; assert ok, 'cv_path doit rester dans le dossier du candidat';
  ok := false; begin insert into public.recruitment_applications (full_name, email, message, status) values ('Awa', 'a@t.io', 'Tentative de forcer le statut accepté ici.', 'accepted'); exception when insufficient_privilege then ok := true; end; assert ok, 'statut non forçable';
  assert (select count(*) from public.recruitment_events where application_id = app) = 1, 'historique initial';
  assert (select count(*) from public.notifications where type = 'recruitment') = 1, 'accusé de réception';
  ok := false; begin perform public.application_transition(app, 'accepted'); exception when others then ok := sqlerrm = 'forbidden'; end; assert ok, 'le candidat ne décide pas';
  perform set_config('request.jwt.claim.sub', c2, true);
  select count(*) into n from public.recruitment_applications; assert n = 0, 'un autre candidat ne voit pas la candidature';
  -- admin : examen, demande d'infos, réponse, entretien, acceptation
  perform set_config('request.jwt.claim.sub', adm, true);
  select count(*) into n from public.recruitment_applications; assert n = 1, 'admin voit tout';
  r := public.application_transition(app, 'accepted'); assert r->>'reason' = 'invalid_transition', 'pas d''acceptation directe';
  r := public.application_transition(app, 'in_review'); assert (r->>'ok')::boolean;
  r := public.application_transition(app, 'info_requested'); assert r->>'reason' = 'message_required', 'message obligatoire';
  r := public.application_transition(app, 'info_requested', 'Pouvez-vous joindre votre portfolio ?'); assert (r->>'ok')::boolean;
  perform public.application_comment(app, 'Profil prometteur, à voir en entretien');
  perform set_config('request.jwt.claim.sub', c1, true);
  assert (select count(*) from public.recruitment_events where application_id = app and kind = 'internal_comment') = 0, 'commentaire interne invisible du candidat';
  r := public.application_reply(app, 'Voici mon portfolio : https://exemple.dev'); assert (r->>'ok')::boolean, 'réponse du candidat';
  r := public.application_reply(app, 'encore une réponse'); assert r->>'reason' = 'no_request_pending';
  perform set_config('request.jwt.claim.sub', adm, true);
  r := public.application_transition(app, 'interview', 'Entretien jeudi'); assert (r->>'ok')::boolean;
  assert (select count(*) from public.user_badges) = 0, 'pas de badge avant acceptation';
  r := public.application_transition(app, 'accepted', 'Bienvenue !'); assert (r->>'ok')::boolean;
  r := public.application_transition(app, 'rejected'); assert r->>'reason' = 'invalid_transition', 'décision finale figée';
  reset role;
  assert (select count(*) from public.user_badges ub join public.badges b on b.id = ub.badge_id where ub.user_id = c1::uuid and b.code = 'recruit') = 1, 'badge attribué après acceptation';
  assert exists (select 1 from public.user_roles where user_id = c1::uuid and role = 'developer'), 'rôle prévu par l''offre attribué';
  assert (select count(*) from public.notifications where user_id = c1::uuid and title = 'Candidature acceptée') = 1, 'décision notifiée';
  assert not exists (select 1 from public.user_roles where user_id = c1::uuid and role in ('admin','owner','moderator')), 'aucune élévation de privilèges';
  -- le candidat suit son historique (sans notes internes)
  set local role authenticated; perform set_config('request.jwt.claim.sub', c1, true);
  select count(*) into n from public.recruitment_events where application_id = app; assert n >= 6, 'historique visible : ' || n;
  ok := false; begin update public.recruitment_applications set status = 'accepted' where id = app; exception when insufficient_privilege then ok := true; end; assert ok, 'update direct interdit';
  reset role;
end $$;
select 'OK 50_test_referral_recruitment' as result;
