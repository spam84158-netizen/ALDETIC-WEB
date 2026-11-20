-- Retour arrière : DESTRUCTIF (supprime le journal). À ne jamais lancer en production sans sauvegarde et accord du propriétaire.
begin;
drop function if exists public.withdrawal_transition(uuid, text, uuid, text, text);
drop function if exists public.withdrawal_request(uuid, text, jsonb, bigint, bigint, text);
drop function if exists public.deposit_confirm(text, text, bigint, text, jsonb);
drop function if exists public.deposit_create(uuid, text, text, bigint, text, jsonb);
drop function if exists public.wallet_post(uuid, text, bigint, bigint, text, text, uuid, text, jsonb);
drop view if exists public.wallet_balances;
drop table if exists public.finance_audit, public.withdrawals, public.deposits, public.wallet_entries, public.wallet_accounts;
drop function if exists public.wallet_entries_append_only();
commit;
