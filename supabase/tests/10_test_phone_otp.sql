\set ON_ERROR_STOP on
-- Données
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','a@test'),('00000000-0000-0000-0000-0000000000b2','b@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b2') on conflict do nothing;

do $$
declare r jsonb; a uuid := '00000000-0000-0000-0000-0000000000a1'; b uuid := '00000000-0000-0000-0000-0000000000b2'; n int;
begin
  -- 1. émission OK, 2. trop tôt, 3. mauvais code décompte, 4. bon code vérifie
  r := public.phone_otp_issue(a, '+2250700000001', 'h1', 600);          assert (r->>'ok')::boolean, 'issue ok';
  r := public.phone_otp_issue(a, '+2250700000001', 'h2', 600);          assert r->>'reason' = 'too_soon', 'too_soon';
  r := public.phone_otp_verify(a, 'mauvais');                           assert r->>'reason' = 'invalid_code' and (r->>'attempts_left')::int = 4, 'invalid_code';
  assert not (select phone_verified from public.profiles where id = a), 'pas vérifié après mauvais code';
  r := public.phone_otp_verify(a, 'h1');                                assert (r->>'ok')::boolean, 'verify ok';
  assert (select phone_verified and phone = '+2250700000001' from public.profiles where id = a), 'profil vérifié';
  r := public.phone_otp_verify(a, 'h1');                                assert r->>'reason' = 'no_pending', 'code à usage unique';
  -- 5. numéro déjà vérifié chez un autre
  r := public.phone_otp_issue(b, '+2250700000001', 'h3', 600);          assert r->>'reason' = 'phone_taken', 'phone_taken';
  -- 6. format invalide
  r := public.phone_otp_issue(b, '0700000001', 'h4', 600);              assert r->>'reason' = 'invalid_phone', 'invalid_phone';
  -- 7. expiration
  r := public.phone_otp_issue(b, '+2250700000002', 'h5', 600);          assert (r->>'ok')::boolean;
  update public.phone_otps set expires_at = now() - interval '1 second' where user_id = b;
  r := public.phone_otp_verify(b, 'h5');                                assert r->>'reason' = 'expired', 'expired';
  -- 8. 5 tentatives maximum
  r := public.phone_otp_issue(b, '+2250700000002', 'h6', 600);          assert (r->>'ok')::boolean, 'réémission après expiration';
  update public.phone_otps set created_at = now() - interval '1 minute' where user_id = b;
  for i in 1..5 loop r := public.phone_otp_verify(b, 'x'); end loop;
  r := public.phone_otp_verify(b, 'h6');                                assert r->>'reason' = 'too_many_attempts', 'blocage après 5 essais';
  -- 9. limite d'envoi : 5 par heure
  delete from public.phone_otps where user_id = b;
  r := public.phone_otp_issue(b, '+2250700000002', 'k0', 600);
  for i in 1..4 loop
    update public.phone_otps set created_at = now() - interval '1 minute' where user_id = b;
    r := public.phone_otp_issue(b, '+2250700000002', 'k' || i, 600); assert (r->>'ok')::boolean, 'envoi ' || i;
  end loop;
  update public.phone_otps set created_at = now() - interval '1 minute' where user_id = b;
  r := public.phone_otp_issue(b, '+2250700000002', 'k9', 600);          assert r->>'reason' = 'rate_limited', 'rate_limited';
end $$;

-- Droits : le navigateur (authenticated) ne peut appeler aucune fonction OTP ni lire phone_otps
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin perform public.phone_otp_verify('00000000-0000-0000-0000-0000000000b2', 'x'); raise exception 'FAIL: verify appelable'; exception when insufficient_privilege then null; end;
  begin perform public.phone_otp_issue('00000000-0000-0000-0000-0000000000b2', '+2250700000009', 'x', 60); raise exception 'FAIL: issue appelable'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.phone_otps; raise exception 'FAIL: phone_otps lisible'; exception when insufficient_privilege then null; end;
  -- Garde-fou profiles : phone_verified interdit, changement de numéro remet à faux
  begin update public.profiles set phone_verified = true where id = '00000000-0000-0000-0000-0000000000b2'; raise exception 'FAIL: phone_verified modifiable';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.profiles set phone = '+2250799999999' where id = '00000000-0000-0000-0000-0000000000a1';
  reset role;
end $$;
do $$ begin
  -- a (vérifié) a changé son numéro via le navigateur : doit être repassé à non vérifié.
  -- NB : la politique RLS profiles_update_own interdit de toucher la ligne de a depuis b : aucune ligne modifiée.
  assert (select phone_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'RLS : b ne peut pas modifier a';
end $$;
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  update public.profiles set phone = '+2250711111111' where id = '00000000-0000-0000-0000-0000000000a1';
  reset role;
  assert not (select phone_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'changement de numéro => non vérifié';
end $$;
select 'OK 10_test_phone_otp' as result;
