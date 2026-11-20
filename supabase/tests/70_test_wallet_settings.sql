\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e001','s@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000e001') on conflict do nothing;
do $$ declare ok boolean; n int; begin
  assert (select count(*) from public.platform_settings where key in ('withdraw_fee','withdraw_min','deposit_min','payment_methods','bank_instructions')) = 5, 'paramètres présents';
  assert not exists (select 1 from public.platform_settings, jsonb_each_text(value) e where key = 'payment_methods' and e.value = 'true'), 'aucun moyen activé par défaut';
  set local role authenticated; perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e001', true); perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.platform_settings; assert n >= 5, 'lecture par les membres';
  ok := false; begin update public.platform_settings set value = '{"percent":0,"min":0}'::jsonb; exception when insufficient_privilege then ok := true; end; assert ok, 'écriture interdite aux membres';
  ok := false; begin insert into public.platform_settings (key, value) values ('x', '1'::jsonb); exception when insufficient_privilege then ok := true; end; assert ok, 'insertion interdite aux membres';
  reset role;
end $$;
select 'OK 70_test_wallet_settings' as result;
