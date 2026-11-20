-- 004 — Journal et état de la passerelle IA (quotas, basculement, disponibilité). Écriture réservée à service_role.
begin;
create table if not exists public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  provider text not null, model text not null,
  task text not null check (task in ('chat','project','code','diagnostic','admin','cloud')),
  status text not null check (status in ('ok','error')),
  reason text, latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_provider_idx on public.ai_requests (provider, created_at desc);
create index if not exists ai_requests_user_idx on public.ai_requests (user_id, created_at desc);
create table if not exists public.ai_provider_state (
  provider text primary key, disabled_until timestamptz not null default 'epoch', reason text, updated_at timestamptz not null default now()
);
alter table public.ai_requests enable row level security;
alter table public.ai_provider_state enable row level security;
drop policy if exists ai_requests_read_own on public.ai_requests;
create policy ai_requests_read_own on public.ai_requests for select to authenticated using (user_id = auth.uid());
revoke all on public.ai_requests, public.ai_provider_state from public, anon, authenticated;
grant select on public.ai_requests to authenticated;
grant select, insert, update on public.ai_requests, public.ai_provider_state to service_role;
commit;
