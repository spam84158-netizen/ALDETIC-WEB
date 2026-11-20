\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c3','c@test'),('00000000-0000-0000-0000-0000000000d4','d@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000c3'),('00000000-0000-0000-0000-0000000000d4') on conflict do nothing;

do $$
declare c uuid := '00000000-0000-0000-0000-0000000000c3'; d uuid := '00000000-0000-0000-0000-0000000000d4';
  dep jsonb; r jsonb; ref text; ref2 text; w jsonb; w2 jsonb; av bigint; rs bigint; n int; ok boolean;
begin
  -- Dépôt : créé en attente, aucun crédit
  dep := public.deposit_create(c, 'flutterwave', 'orange_money', 10000, 'XOF', '{"payer":"+2250700000001"}');
  ref := dep->>'internal_ref';
  assert ref like 'DEP-%', 'référence interne';
  assert coalesce((select available from public.wallet_balances where user_id = c), 0) = 0, 'aucun crédit avant confirmation';
  -- Mauvais montant => rejeté, aucun crédit
  r := public.deposit_confirm(ref, 'PROV-1', 9999, 'XOF');                assert r->>'reason' = 'amount_or_currency_mismatch', 'montant';
  assert coalesce((select available from public.wallet_balances where user_id = c), 0) = 0, 'toujours aucun crédit';
  r := public.deposit_confirm(ref, 'PROV-1', 10000, 'XOF');               assert r->>'reason' = 'not_pending', 'dépôt rejeté non réutilisable';
  -- Nouveau dépôt, mauvaise devise
  dep := public.deposit_create(c, 'flutterwave', 'wave', 10000, 'XOF'); ref := dep->>'internal_ref';
  r := public.deposit_confirm(ref, 'PROV-2', 10000, 'USD');               assert r->>'reason' = 'amount_or_currency_mismatch', 'devise';
  -- Dépôt valide, confirmé deux fois => un seul crédit
  dep := public.deposit_create(c, 'flutterwave', 'mtn_momo', 10000, 'XOF'); ref := dep->>'internal_ref';
  r := public.deposit_confirm(ref, 'PROV-3', 10000, 'XOF');               assert (r->>'ok')::boolean, 'confirmation';
  r := public.deposit_confirm(ref, 'PROV-3', 10000, 'XOF');               assert (r->>'already')::boolean, 'idempotence';
  assert (select available from public.wallet_balances where user_id = c) = 10000, 'crédit unique';
  -- Même référence prestataire sur un autre dépôt => refusée
  dep := public.deposit_create(d, 'flutterwave', 'moov_money', 10000, 'XOF'); ref2 := dep->>'internal_ref';
  r := public.deposit_confirm(ref2, 'PROV-3', 10000, 'XOF');              assert r->>'reason' = 'duplicate_provider_ref', 'doublon prestataire';
  assert coalesce((select available from public.wallet_balances where user_id = d), 0) = 0, 'pas de crédit sur doublon';
  r := public.deposit_confirm('DEP-INCONNU', 'X', 1, 'XOF');              assert r->>'reason' = 'unknown_reference', 'référence inconnue';

  -- Retrait : réserve, pas de double retrait
  w := public.withdrawal_request(c, 'wave', '{"phone":"+2250700000001"}', 6000, 200, 'XOF');
  assert (select available from public.wallet_balances where user_id = c) = 4000 and (select reserved from public.wallet_balances where user_id = c) = 6000, 'réservation';
  ok := false;
  begin perform public.withdrawal_request(c, 'wave', '{"phone":"+2250700000001"}', 6000, 200, 'XOF'); exception when others then ok := sqlerrm = 'insufficient_funds'; end;
  assert ok, 'double retrait refusé';
  assert (select count(*) from public.withdrawals where user_id = c) = 1, 'aucune ligne orpheline après échec';
  -- Transitions : paiement impossible sans approbation, référence obligatoire
  r := public.withdrawal_transition((w->>'id')::uuid, 'paid', c);          assert r->>'reason' = 'invalid_transition', 'paid sans approbation';
  r := public.withdrawal_transition((w->>'id')::uuid, 'approved', d);      assert (r->>'ok')::boolean, 'approbation';
  r := public.withdrawal_transition((w->>'id')::uuid, 'paid', d);          assert r->>'reason' = 'provider_ref_required', 'référence réelle obligatoire';
  r := public.withdrawal_transition((w->>'id')::uuid, 'paid', d, null, 'WV-123'); assert (r->>'ok')::boolean, 'paiement';
  assert (select reserved from public.wallet_balances where user_id = c) = 0 and (select available from public.wallet_balances where user_id = c) = 4000, 'réservé consommé';
  r := public.withdrawal_transition((w->>'id')::uuid, 'rejected', d);      assert r->>'reason' = 'invalid_transition', 'payé non annulable';
  -- Rejet : libération
  w2 := public.withdrawal_request(c, 'orange_money', '{"phone":"+2250700000001"}', 3000, 100, 'XOF');
  r := public.withdrawal_transition((w2->>'id')::uuid, 'rejected', d, 'test');
  assert (select available from public.wallet_balances where user_id = c) = 4000 and (select reserved from public.wallet_balances where user_id = c) = 0, 'libération au rejet';
  r := public.withdrawal_transition((w2->>'id')::uuid, 'rejected', d);     assert r->>'reason' = 'invalid_transition', 'pas de double libération';
  -- Journal en ajout seul
  ok := false; begin update public.wallet_entries set available_delta = 1; exception when others then ok := true; end; assert ok, 'update interdit';
  ok := false; begin delete from public.wallet_entries; exception when others then ok := true; end; assert ok, 'delete interdit';
  -- Cohérence : solde = somme du journal
  assert (select available from public.wallet_balances where user_id = c) = (select sum(available_delta) from public.wallet_entries where user_id = c), 'solde = journal';
  assert (select count(*) from public.finance_audit) >= 8, 'audit financier rempli';
end $$;

-- Droits navigateur : lecture de ses lignes seulement, aucune écriture, aucune fonction
do $$
declare c uuid := '00000000-0000-0000-0000-0000000000c3'; ok boolean; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.wallet_entries;                       assert n > 0 and n = (select count(*) from public.wallet_entries where user_id = c), 'ne voit que ses écritures';
  select count(*) into n from public.deposits where user_id <> c;           assert n = 0, 'ne voit pas les dépôts des autres';
  ok := false; begin insert into public.wallet_entries (user_id, currency, available_delta, kind, ref_type, idempotency_key) values (c, 'XOF', 999999, 'adjustment', 'x', 'hack'); exception when insufficient_privilege then ok := true; end; assert ok, 'insert journal interdit';
  ok := false; begin update public.deposits set status = 'confirmed'; exception when insufficient_privilege then ok := true; end; assert ok, 'update dépôt interdit';
  ok := false; begin perform public.deposit_confirm('x', 'x', 1, 'XOF'); exception when insufficient_privilege then ok := true; end; assert ok, 'deposit_confirm non appelable';
  ok := false; begin perform public.wallet_post(c, 'XOF', 999999, 0, 'adjustment', 'x', null, 'hack2'); exception when insufficient_privilege then ok := true; end; assert ok, 'wallet_post non appelable';
  ok := false; begin perform public.withdrawal_request(c, 'wave', '{}', 1, 0, 'XOF'); exception when insufficient_privilege then ok := true; end; assert ok, 'withdrawal_request non appelable';
  reset role;
end $$;

-- Concurrence simulée : deux retraits successifs sur le solde restant ne peuvent pas dépasser le disponible
do $$
declare c uuid := '00000000-0000-0000-0000-0000000000c3'; ok1 boolean := false; ok2 boolean := false;
begin
  begin perform public.withdrawal_request(c, 'wave', '{}', 3000, 0, 'XOF'); ok1 := true; exception when others then null; end;
  begin perform public.withdrawal_request(c, 'wave', '{}', 3000, 0, 'XOF'); ok2 := true; exception when others then null; end;
  assert ok1 and not ok2, 'un seul des deux retraits de 3000 sur 4000 passe';
  assert (select available from public.wallet_balances where user_id = c) = 1000, 'solde restant correct';
end $$;
select 'OK 20_test_wallet' as result;
