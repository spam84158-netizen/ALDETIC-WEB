-- 011 — Lecture administrateur des données financières et paramètres du portefeuille modifiables par l'administration.
-- Les écritures financières restent réservées aux fonctions serveur ; ici : lecture + réglages (moyens activés, frais, minimums, consignes bancaires).
begin;
drop policy if exists deposits_read_admin on public.deposits;       create policy deposits_read_admin on public.deposits for select to authenticated using (public.aldetic_is_admin());
drop policy if exists withdrawals_read_admin on public.withdrawals; create policy withdrawals_read_admin on public.withdrawals for select to authenticated using (public.aldetic_is_admin());
drop policy if exists wallet_entries_read_admin on public.wallet_entries; create policy wallet_entries_read_admin on public.wallet_entries for select to authenticated using (public.aldetic_is_admin());
drop policy if exists finance_audit_read_admin on public.finance_audit; create policy finance_audit_read_admin on public.finance_audit for select to authenticated using (public.aldetic_is_admin());
grant select on public.finance_audit to authenticated;
drop policy if exists settings_write_admin on public.platform_settings;
create policy settings_write_admin on public.platform_settings for update to authenticated using (public.aldetic_is_admin()) with check (public.aldetic_is_admin());
drop policy if exists settings_insert_admin on public.platform_settings;
create policy settings_insert_admin on public.platform_settings for insert to authenticated with check (public.aldetic_is_admin());
grant insert, update on public.platform_settings to authenticated;
commit;
