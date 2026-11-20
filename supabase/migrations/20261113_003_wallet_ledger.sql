-- 003 — Journal financier, dépôts, retraits (portefeuille calculé depuis le journal).
-- Montants en unités entières (XOF : 1 = 1 FCFA). Journal en ajout seul. Idempotence par clé unique.
-- Toutes les fonctions d'écriture sont réservées à service_role (fonctions Edge) : le navigateur ne peut rien créditer.
-- Dépend de public.profiles(id). Non exécuté ici : exécuté par la CI (voir .github/workflows/db-tests.yml).
begin;

create table if not exists public.wallet_accounts (
  user_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, currency)
);

create table if not exists public.wallet_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  available_delta bigint not null default 0,
  reserved_delta bigint not null default 0,
  kind text not null check (kind in ('deposit','withdrawal_reserve','withdrawal_release','withdrawal_paid','revenue','fee','refund','adjustment')),
  ref_type text not null,
  ref_id uuid,
  idempotency_key text not null unique,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wallet_entries_user_idx on public.wallet_entries (user_id, currency, created_at desc);

create or replace function public.wallet_entries_append_only() returns trigger language plpgsql as $$
begin raise exception 'wallet_entries est en ajout seul'; end $$;
drop trigger if exists wallet_entries_no_update on public.wallet_entries;
create trigger wallet_entries_no_update before update or delete on public.wallet_entries
  for each row execute function public.wallet_entries_append_only();

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null,
  method text not null check (method in ('orange_money','mtn_momo','moov_money','wave','card','bank_transfer')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  internal_ref text not null unique,
  provider_ref text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','failed','refunded')),
  payer_info jsonb not null default '{}'::jsonb,
  provider_response jsonb,
  reject_reason text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index if not exists deposits_provider_ref_unique on public.deposits (provider, provider_ref) where provider_ref is not null;

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  method text not null check (method in ('orange_money','mtn_momo','moov_money','wave','card','bank_transfer')),
  destination jsonb not null,
  amount_minor bigint not null check (amount_minor > 0),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'requested' check (status in ('requested','approved','rejected','paid','failed')),
  decision_reason text,
  provider_ref text,
  decided_by uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  paid_at timestamptz,
  check (fee_minor < amount_minor)
);

create table if not exists public.finance_audit (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create or replace view public.wallet_balances with (security_invoker = true) as
  select user_id, currency, sum(available_delta)::bigint as available, sum(reserved_delta)::bigint as reserved
  from public.wallet_entries group by user_id, currency;

-- Écriture atomique dans le journal : verrou de compte, idempotence, refus des soldes négatifs.
create or replace function public.wallet_post(p_user uuid, p_currency text, p_available bigint, p_reserved bigint,
  p_kind text, p_ref_type text, p_ref_id uuid, p_key text, p_meta jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_av bigint; v_rs bigint; v_id bigint;
begin
  insert into public.wallet_accounts (user_id, currency) values (p_user, p_currency) on conflict do nothing;
  perform 1 from public.wallet_accounts where user_id = p_user and currency = p_currency for update;
  select id into v_id from public.wallet_entries where idempotency_key = p_key;
  if found then return v_id; end if;
  select coalesce(sum(available_delta), 0), coalesce(sum(reserved_delta), 0) into v_av, v_rs
    from public.wallet_entries where user_id = p_user and currency = p_currency;
  if v_av + p_available < 0 then raise exception 'insufficient_funds'; end if;
  if v_rs + p_reserved < 0 then raise exception 'insufficient_reserved'; end if;
  insert into public.wallet_entries (user_id, currency, available_delta, reserved_delta, kind, ref_type, ref_id, idempotency_key, meta)
  values (p_user, p_currency, p_available, p_reserved, p_kind, p_ref_type, p_ref_id, p_key, p_meta)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.deposit_create(p_user uuid, p_provider text, p_method text, p_amount bigint, p_currency text, p_payer jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_ref text;
begin
  v_ref := 'DEP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  insert into public.deposits (user_id, provider, method, amount_minor, currency, internal_ref, payer_info)
  values (p_user, p_provider, p_method, p_amount, p_currency, v_ref, coalesce(p_payer, '{}'::jsonb))
  returning id into v_id;
  insert into public.finance_audit (actor, action, target_type, target_id, details)
  values (p_user, 'deposit_created', 'deposit', v_id, jsonb_build_object('internal_ref', v_ref, 'method', p_method));
  return jsonb_build_object('ok', true, 'id', v_id, 'internal_ref', v_ref);
end $$;

-- Crédit uniquement après vérification montant + devise, une seule fois (idempotent).
create or replace function public.deposit_confirm(p_internal_ref text, p_provider_ref text, p_amount bigint, p_currency text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.deposits%rowtype;
begin
  select * into d from public.deposits where internal_ref = p_internal_ref for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_reference'); end if;
  if d.status = 'confirmed' then return jsonb_build_object('ok', true, 'already', true); end if;
  if d.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', d.status); end if;
  begin
    if d.amount_minor <> p_amount or d.currency <> p_currency then
      update public.deposits set status = 'rejected', provider_ref = p_provider_ref, provider_response = p_payload,
        reject_reason = 'amount_or_currency_mismatch' where id = d.id;
      insert into public.finance_audit (actor, action, target_type, target_id, details)
      values (null, 'deposit_rejected', 'deposit', d.id, jsonb_build_object('reason', 'amount_or_currency_mismatch'));
      return jsonb_build_object('ok', false, 'reason', 'amount_or_currency_mismatch');
    end if;
    perform public.wallet_post(d.user_id, d.currency, d.amount_minor, 0, 'deposit', 'deposit', d.id, 'deposit:' || d.id::text,
      jsonb_build_object('provider_ref', p_provider_ref));
    update public.deposits set status = 'confirmed', provider_ref = p_provider_ref, provider_response = p_payload, confirmed_at = now() where id = d.id;
    insert into public.finance_audit (actor, action, target_type, target_id, details)
    values (null, 'deposit_confirmed', 'deposit', d.id, jsonb_build_object('provider_ref', p_provider_ref));
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_provider_ref');
  end;
  return jsonb_build_object('ok', true);
end $$;

-- Demande de retrait : réserve le montant immédiatement ; échoue si le solde disponible est insuffisant.
create or replace function public.withdrawal_request(p_user uuid, p_method text, p_destination jsonb, p_amount bigint, p_fee bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.withdrawals (user_id, method, destination, amount_minor, fee_minor, currency)
  values (p_user, p_method, p_destination, p_amount, p_fee, p_currency) returning id into v_id;
  perform public.wallet_post(p_user, p_currency, -p_amount, p_amount, 'withdrawal_reserve', 'withdrawal', v_id, 'wd_reserve:' || v_id::text);
  insert into public.finance_audit (actor, action, target_type, target_id, details)
  values (p_user, 'withdrawal_requested', 'withdrawal', v_id, jsonb_build_object('amount', p_amount, 'fee', p_fee));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Transitions admin : requested→approved|rejected ; approved→paid|failed|rejected. Les fonds réservés sont libérés ou consommés.
create or replace function public.withdrawal_transition(p_id uuid, p_to text, p_admin uuid, p_reason text default null, p_provider_ref text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.withdrawals%rowtype;
begin
  select * into w from public.withdrawals where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_withdrawal'); end if;
  if not ((w.status = 'requested' and p_to in ('approved','rejected'))
       or (w.status = 'approved'  and p_to in ('paid','failed','rejected'))) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', w.status, 'to', p_to);
  end if;
  if p_to in ('rejected','failed') then
    perform public.wallet_post(w.user_id, w.currency, w.amount_minor, -w.amount_minor, 'withdrawal_release', 'withdrawal', w.id, 'wd_release:' || w.id::text);
  elsif p_to = 'paid' then
    if p_provider_ref is null or p_provider_ref = '' then return jsonb_build_object('ok', false, 'reason', 'provider_ref_required'); end if;
    perform public.wallet_post(w.user_id, w.currency, 0, -w.amount_minor, 'withdrawal_paid', 'withdrawal', w.id, 'wd_paid:' || w.id::text,
      jsonb_build_object('provider_ref', p_provider_ref, 'fee', w.fee_minor));
  end if;
  update public.withdrawals set status = p_to, decision_reason = coalesce(p_reason, decision_reason), decided_by = p_admin, decided_at = now(),
    provider_ref = coalesce(p_provider_ref, provider_ref), paid_at = case when p_to = 'paid' then now() else paid_at end where id = w.id;
  insert into public.finance_audit (actor, action, target_type, target_id, details)
  values (p_admin, 'withdrawal_' || p_to, 'withdrawal', w.id, jsonb_build_object('reason', p_reason, 'provider_ref', p_provider_ref));
  return jsonb_build_object('ok', true);
end $$;

-- Sécurité : lecture de ses propres lignes uniquement ; aucune écriture directe ; fonctions réservées à service_role.
alter table public.wallet_accounts enable row level security;
alter table public.wallet_entries enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.finance_audit enable row level security;

drop policy if exists wallet_entries_read_own on public.wallet_entries;
create policy wallet_entries_read_own on public.wallet_entries for select to authenticated using (user_id = auth.uid());
drop policy if exists wallet_accounts_read_own on public.wallet_accounts;
create policy wallet_accounts_read_own on public.wallet_accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists deposits_read_own on public.deposits;
create policy deposits_read_own on public.deposits for select to authenticated using (user_id = auth.uid());
drop policy if exists withdrawals_read_own on public.withdrawals;
create policy withdrawals_read_own on public.withdrawals for select to authenticated using (user_id = auth.uid());

revoke all on public.wallet_accounts, public.wallet_entries, public.deposits, public.withdrawals, public.finance_audit from public, anon, authenticated;
grant select on public.wallet_accounts, public.wallet_entries, public.deposits, public.withdrawals to authenticated;
revoke all on public.wallet_balances from public, anon;
grant select on public.wallet_balances to authenticated;

revoke all on function public.wallet_post(uuid, text, bigint, bigint, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.deposit_create(uuid, text, text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.deposit_confirm(text, text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.withdrawal_request(uuid, text, jsonb, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.withdrawal_transition(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.wallet_post(uuid, text, bigint, bigint, text, text, uuid, text, jsonb) to service_role;
grant execute on function public.deposit_create(uuid, text, text, bigint, text, jsonb) to service_role;
grant execute on function public.deposit_confirm(text, text, bigint, text, jsonb) to service_role;
grant execute on function public.withdrawal_request(uuid, text, jsonb, bigint, bigint, text) to service_role;
grant execute on function public.withdrawal_transition(uuid, text, uuid, text, text) to service_role;

commit;
