begin;
drop policy if exists settings_insert_admin on public.platform_settings; drop policy if exists settings_write_admin on public.platform_settings;
revoke insert, update on public.platform_settings from authenticated;
drop policy if exists finance_audit_read_admin on public.finance_audit; revoke select on public.finance_audit from authenticated;
drop policy if exists wallet_entries_read_admin on public.wallet_entries; drop policy if exists withdrawals_read_admin on public.withdrawals; drop policy if exists deposits_read_admin on public.deposits;
commit;
