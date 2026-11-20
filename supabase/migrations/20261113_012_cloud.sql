-- 012 — My Cloud : déploiements, journaux, noms des variables d'environnement, domaines, import de fichiers (serveur uniquement).
-- Les valeurs des variables ne sont JAMAIS stockées ici : elles vont directement chez Cloudflare comme secrets.
begin;
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'building' check (status in ('building','ready','failed','rolled_back')),
  url text, pages_project text, provider_ref text, error text, files_count integer not null default 0,
  created_at timestamptz not null default now(), finished_at timestamptz
);
create index if not exists deployments_project_idx on public.deployments (project_id, created_at desc);
create table if not exists public.deployment_logs (
  id bigint generated always as identity primary key,
  deployment_id uuid not null references public.deployments(id) on delete cascade,
  level text not null default 'info' check (level in ('info','error')), message text not null, at timestamptz not null default now()
);
create index if not exists deployment_logs_idx on public.deployment_logs (deployment_id, id);
create table if not exists public.project_env_keys (
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null check (key ~ '^[A-Z][A-Z0-9_]{1,63}$'), updated_at timestamptz not null default now(),
  primary key (project_id, key)
);
create table if not exists public.project_domains (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null unique check (domain ~ '^[a-z0-9.-]{4,253}$'),
  status text not null default 'pending' check (status in ('pending','active','failed')), created_at timestamptz not null default now()
);

create or replace function public.deployments_guard() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.deployments where owner_id = new.owner_id and created_at > now() - interval '1 hour') >= 10 then raise exception 'rate_limited'; end if;
  return new;
end $$;
drop trigger if exists deployments_guard on public.deployments;
create trigger deployments_guard before insert on public.deployments for each row execute function public.deployments_guard();

create or replace function public.project_file_import(p_owner uuid, p_project uuid, p_path text, p_content text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare pr public.projects%rowtype; f public.project_files%rowtype; v integer;
begin
  select * into pr from public.projects where id = p_project and owner_id = p_owner;
  if not found then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if pr.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'archived'); end if;
  if p_path !~ '^[A-Za-z0-9._/-]{1,200}$' or p_path ~ '\.\.' or p_path ~ '^/' or p_path ~ '//' then return jsonb_build_object('ok', false, 'reason', 'invalid_path'); end if;
  if char_length(coalesce(p_content, '')) > 500000 then return jsonb_build_object('ok', false, 'reason', 'too_large'); end if;
  select * into f from public.project_files where project_id = p_project and path = p_path for update;
  if found then v := f.version + 1; update public.project_files set content = coalesce(p_content, ''), version = v, updated_at = now() where id = f.id;
  else
    if (select count(*) from public.project_files where project_id = p_project) >= 200 then return jsonb_build_object('ok', false, 'reason', 'too_many_files'); end if;
    v := 1; insert into public.project_files (project_id, path, content) values (p_project, p_path, coalesce(p_content, '')) returning * into f;
  end if;
  insert into public.project_versions (file_id, project_id, version, content, saved_by) values (f.id, p_project, v, coalesce(p_content, ''), p_owner);
  delete from public.project_versions where file_id = f.id and version <= v - 50;
  update public.projects set updated_at = now() where id = p_project;
  return jsonb_build_object('ok', true, 'version', v);
end $$;

alter table public.deployments enable row level security; alter table public.deployment_logs enable row level security;
alter table public.project_env_keys enable row level security; alter table public.project_domains enable row level security;
drop policy if exists deployments_read on public.deployments; create policy deployments_read on public.deployments for select to authenticated using (owner_id = auth.uid());
drop policy if exists deployment_logs_read on public.deployment_logs; create policy deployment_logs_read on public.deployment_logs for select to authenticated using (exists (select 1 from public.deployments d where d.id = deployment_id and d.owner_id = auth.uid()));
drop policy if exists env_keys_read on public.project_env_keys; create policy env_keys_read on public.project_env_keys for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
drop policy if exists domains_read on public.project_domains; create policy domains_read on public.project_domains for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
revoke all on public.deployments, public.deployment_logs, public.project_env_keys, public.project_domains from public, anon, authenticated;
grant select on public.deployments, public.deployment_logs, public.project_env_keys, public.project_domains to authenticated;
grant all on public.deployments, public.deployment_logs, public.project_env_keys, public.project_domains to service_role;
revoke all on function public.project_file_import(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.project_file_import(uuid, uuid, text, text) to service_role;
commit;
