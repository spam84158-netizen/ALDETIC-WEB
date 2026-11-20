-- 009 — Espace projet : projets, fichiers, historique des versions. Toute écriture de fichier passe par des fonctions
-- qui vérifient le propriétaire, la concurrence (version attendue), la taille et le chemin.
begin;
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  visibility text not null default 'private' check (visibility in ('private','public')),
  status text not null default 'active' check (status in ('active','archived')),
  repo_url text check (repo_url is null or repo_url ~ '^https://[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]{4,300}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);
create index if not exists projects_public_idx on public.projects (updated_at desc) where visibility = 'public' and status = 'active';

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null check (path ~ '^[A-Za-z0-9._/-]{1,200}$' and path !~ '\.\.' and path !~ '^/' and path !~ '//'),
  content text not null default '' check (char_length(content) <= 500000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);
create table if not exists public.project_versions (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.project_files(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null, content text not null, saved_by uuid, created_at timestamptz not null default now(),
  unique (file_id, version)
);

create or replace function public.projects_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.projects where owner_id = new.owner_id and status = 'active') >= 20 then raise exception 'too_many_projects'; end if;
  else
    if new.owner_id <> old.owner_id or new.slug <> old.slug then raise exception 'immutable_field'; end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists projects_guard on public.projects;
create trigger projects_guard before insert or update on public.projects for each row execute function public.projects_guard();

create or replace function public.project_file_save(p_project uuid, p_path text, p_content text, p_expected integer default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare pr public.projects%rowtype; f public.project_files%rowtype; v integer;
begin
  select * into pr from public.projects where id = p_project;
  if not found or pr.owner_id is distinct from auth.uid() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if pr.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'archived'); end if;
  if p_path !~ '^[A-Za-z0-9._/-]{1,200}$' or p_path ~ '\.\.' or p_path ~ '^/' or p_path ~ '//' then return jsonb_build_object('ok', false, 'reason', 'invalid_path'); end if;
  if char_length(coalesce(p_content, '')) > 500000 then return jsonb_build_object('ok', false, 'reason', 'too_large'); end if;
  select * into f from public.project_files where project_id = p_project and path = p_path for update;
  if found then
    if p_expected is distinct from f.version then return jsonb_build_object('ok', false, 'reason', 'conflict', 'current', f.version); end if;
    v := f.version + 1;
    update public.project_files set content = coalesce(p_content, ''), version = v, updated_at = now() where id = f.id;
  else
    if p_expected is not null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    if (select count(*) from public.project_files where project_id = p_project) >= 200 then return jsonb_build_object('ok', false, 'reason', 'too_many_files'); end if;
    v := 1;
    insert into public.project_files (project_id, path, content) values (p_project, p_path, coalesce(p_content, '')) returning * into f;
  end if;
  insert into public.project_versions (file_id, project_id, version, content, saved_by) values (f.id, p_project, v, coalesce(p_content, ''), auth.uid());
  delete from public.project_versions where file_id = f.id and version <= v - 50;
  update public.projects set updated_at = now() where id = p_project;
  return jsonb_build_object('ok', true, 'version', v);
end $$;

create or replace function public.project_file_rename(p_project uuid, p_from text, p_to text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.projects where id = p_project and owner_id = auth.uid() and status = 'active') then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if p_to !~ '^[A-Za-z0-9._/-]{1,200}$' or p_to ~ '\.\.' or p_to ~ '^/' or p_to ~ '//' then return jsonb_build_object('ok', false, 'reason', 'invalid_path'); end if;
  if exists (select 1 from public.project_files where project_id = p_project and path = p_to) then return jsonb_build_object('ok', false, 'reason', 'exists'); end if;
  update public.project_files set path = p_to, updated_at = now() where project_id = p_project and path = p_from;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.project_file_delete(p_project uuid, p_path text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.projects where id = p_project and owner_id = auth.uid() and status = 'active') then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  delete from public.project_files where project_id = p_project and path = p_path;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

alter table public.projects enable row level security; alter table public.project_files enable row level security; alter table public.project_versions enable row level security;
drop policy if exists projects_read on public.projects; create policy projects_read on public.projects for select to authenticated using (owner_id = auth.uid() or (visibility = 'public' and status = 'active'));
drop policy if exists projects_insert on public.projects; create policy projects_insert on public.projects for insert to authenticated with check (owner_id = auth.uid() and public.aldetic_is_verified());
drop policy if exists projects_update on public.projects; create policy projects_update on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists projects_delete on public.projects; create policy projects_delete on public.projects for delete to authenticated using (owner_id = auth.uid());
drop policy if exists project_files_read on public.project_files;
create policy project_files_read on public.project_files for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or (p.visibility = 'public' and p.status = 'active'))));
drop policy if exists project_versions_read on public.project_versions;
create policy project_versions_read on public.project_versions for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
revoke all on public.projects, public.project_files, public.project_versions from public, anon, authenticated;
grant select on public.projects, public.project_files, public.project_versions to authenticated;
grant insert (slug, name, description, visibility) on public.projects to authenticated;
grant update (name, description, visibility, status, repo_url) on public.projects to authenticated;
grant delete on public.projects to authenticated;
grant all on public.projects, public.project_files, public.project_versions to service_role;
revoke all on function public.project_file_save(uuid, text, text, integer), public.project_file_rename(uuid, text, text), public.project_file_delete(uuid, text) from public, anon;
grant execute on function public.project_file_save(uuid, text, text, integer), public.project_file_rename(uuid, text, text), public.project_file_delete(uuid, text) to authenticated;
commit;
