\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000d001','fa@test'),('00000000-0000-0000-0000-00000000d002','fb@test'),('00000000-0000-0000-0000-00000000d003','fadm@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000d001'),('00000000-0000-0000-0000-00000000d002'),('00000000-0000-0000-0000-00000000d003') on conflict do nothing;
update public.profiles set phone_verified = true where id in ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-00000000d003');
insert into public.user_roles values ('00000000-0000-0000-0000-00000000d003','admin') on conflict do nothing;
do $$
declare a uuid := '00000000-0000-0000-0000-00000000d001'; b uuid := '00000000-0000-0000-0000-00000000d002'; adm text := '00000000-0000-0000-0000-00000000d003'; d jsonb; w jsonb; n int; ok boolean;
begin
  d := public.deposit_create(a, 'bank', 'bank_transfer', 5000, 'XOF'); perform public.deposit_confirm(d->>'internal_ref', 'bank:VIR-1', 5000, 'XOF');
  w := public.withdrawal_request(a, 'wave', '{"phone":"+2250700000001"}', 2000, 50, 'XOF');
  set local role authenticated; perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  select count(*) into n from public.deposits; assert n = 0, 'un membre ne voit pas les dépôts des autres';
  select count(*) into n from public.finance_audit; assert n = 0, 'un membre ne lit pas le journal d''audit';
  ok := false; begin update public.platform_settings set value = '{"orange_money":true}'::jsonb where key = 'payment_methods'; get diagnostics n = row_count; ok := n = 0; exception when insufficient_privilege then ok := true; end; assert ok, 'un membre ne modifie pas les réglages';
  perform set_config('request.jwt.claim.sub', adm, true);
  select count(*) into n from public.deposits; assert n >= 1, 'admin voit tous les dépôts';
  select count(*) into n from public.withdrawals; assert n >= 1, 'admin voit tous les retraits';
  select count(*) into n from public.wallet_entries; assert n >= 3, 'admin voit le journal';
  select count(*) into n from public.finance_audit; assert n >= 3, 'admin lit le journal d''audit';
  update public.platform_settings set value = '{"orange_money":false,"mtn_momo":false,"moov_money":false,"wave":true,"card":false,"bank_transfer":true}'::jsonb where key = 'payment_methods';
  get diagnostics n = row_count; assert n = 1, 'admin active des moyens';
  ok := false; begin perform public.wallet_post(a, 'XOF', 1000000, 0, 'adjustment', 'x', null, 'hack-admin'); exception when insufficient_privilege then ok := true; end; assert ok, 'même un admin ne crédite pas depuis le navigateur';
  ok := false; begin update public.deposits set status = 'confirmed'; exception when insufficient_privilege then ok := true; end; assert ok, 'même un admin ne modifie pas un dépôt depuis le navigateur';
  reset role;
end $$;
select 'OK 75_test_finance_admin' as result;
