-- Base minimale supposée de public.profiles. À REMPLACER par l'export réel du schéma de production
-- (voir docs/EXPORT-SUPABASE.md) dès qu'il est disponible, pour que les tests tournent sur la vraie structure.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text, display_name text, phone text, phone_verified boolean not null default false
);
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (username, display_name, phone) on public.profiles to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Hypothèse sur les rôles (à confirmer avec l'export réel) : public.user_roles(user_id, role).
create table if not exists public.user_roles (user_id uuid not null references auth.users(id) on delete cascade, role text not null, primary key (user_id, role));
grant select on public.user_roles to authenticated;
