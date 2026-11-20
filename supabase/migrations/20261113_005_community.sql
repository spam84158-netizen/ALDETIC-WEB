-- 005 — Communauté : publications, commentaires/réponses, réactions, repartages, signalements, notifications.
-- Hypothèse à confirmer avec l'export réel : public.user_roles(user_id, role) avec les rôles owner/admin/moderator.
-- Non exécuté ici : exécuté par la CI (supabase/tests/run.sh).
begin;

create or replace function public.aldetic_is_staff() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('owner','admin','moderator'));
$$;
create or replace function public.aldetic_is_verified() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select phone_verified from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.aldetic_is_staff(), public.aldetic_is_verified() to authenticated;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  media jsonb not null default '[]'::jsonb,
  repost_of uuid references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists posts_created_idx on public.posts (created_at desc) where deleted_at is null;
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.reactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  kind text not null default 'like' check (kind in ('like','love','fire','clap')),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index if not exists reactions_target_idx on public.reactions (target_type, target_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','profile')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  handled_by uuid, handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Anti-spam et intégrité
create or replace function public.community_guard() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'posts' then
    if tg_op = 'INSERT' then
      if (select count(*) from public.posts where author_id = new.author_id and created_at > now() - interval '1 hour') >= 30 then raise exception 'rate_limited'; end if;
    else
      if new.body is distinct from old.body and old.author_id <> coalesce(auth.uid(), old.author_id) then raise exception 'only_author_can_edit'; end if;
      if new.author_id <> old.author_id then raise exception 'author_immutable'; end if;
      new.updated_at := now();
    end if;
  elsif tg_table_name = 'comments' then
    if tg_op = 'INSERT' then
      if (select count(*) from public.comments where author_id = new.author_id and created_at > now() - interval '1 hour') >= 60 then raise exception 'rate_limited'; end if;
      if new.parent_id is not null and not exists (select 1 from public.comments where id = new.parent_id and post_id = new.post_id) then raise exception 'invalid_parent'; end if;
    else
      if new.body is distinct from old.body and old.author_id <> coalesce(auth.uid(), old.author_id) then raise exception 'only_author_can_edit'; end if;
      if new.author_id <> old.author_id or new.post_id <> old.post_id then raise exception 'immutable_field'; end if;
    end if;
  elsif tg_table_name = 'reactions' then
    if new.target_type = 'post' and not exists (select 1 from public.posts where id = new.target_id and deleted_at is null) then raise exception 'unknown_target'; end if;
    if new.target_type = 'comment' and not exists (select 1 from public.comments where id = new.target_id and deleted_at is null) then raise exception 'unknown_target'; end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before insert or update on public.posts for each row execute function public.community_guard();
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard before insert or update on public.comments for each row execute function public.community_guard();
drop trigger if exists reactions_guard on public.reactions;
create trigger reactions_guard before insert on public.reactions for each row execute function public.community_guard();

-- Notifications générées par le serveur uniquement (déclencheurs SECURITY DEFINER)
create or replace function public.community_notify() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_post uuid; v_target uuid; v_parent uuid;
begin
  if tg_table_name = 'comments' then
    select author_id into v_target from public.posts where id = new.post_id;
    if v_target is not null and v_target <> new.author_id then
      insert into public.notifications (user_id, type, title, body, action_url) values (v_target, 'community', 'Nouveau commentaire', left(new.body, 140), 'communaute.html#post-' || new.post_id);
    end if;
    if new.parent_id is not null then
      select author_id into v_parent from public.comments where id = new.parent_id;
      if v_parent is not null and v_parent <> new.author_id and v_parent is distinct from v_target then
        insert into public.notifications (user_id, type, title, body, action_url) values (v_parent, 'community', 'Réponse à votre commentaire', left(new.body, 140), 'communaute.html#post-' || new.post_id);
      end if;
    end if;
  elsif tg_table_name = 'reactions' then
    if new.target_type = 'post' then select author_id into v_target from public.posts where id = new.target_id;
    else select author_id into v_target from public.comments where id = new.target_id; end if;
    if v_target is not null and v_target <> new.user_id then
      insert into public.notifications (user_id, type, title, action_url) values (v_target, 'community', 'Nouvelle réaction', 'communaute.html');
    end if;
  elsif tg_table_name = 'posts' and new.repost_of is not null then
    select author_id into v_target from public.posts where id = new.repost_of;
    if v_target is not null and v_target <> new.author_id then
      insert into public.notifications (user_id, type, title, body, action_url) values (v_target, 'community', 'Votre publication a été repartagée', left(new.body, 140), 'communaute.html#post-' || new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments for each row execute function public.community_notify();
drop trigger if exists reactions_notify on public.reactions;
create trigger reactions_notify after insert on public.reactions for each row execute function public.community_notify();
drop trigger if exists posts_notify on public.posts;
create trigger posts_notify after insert on public.posts for each row execute function public.community_notify();

create or replace view public.post_stats with (security_invoker = true) as
  select p.id as post_id,
    (select count(*) from public.comments c where c.post_id = p.id and c.deleted_at is null) as comments,
    (select count(*) from public.reactions r where r.target_type = 'post' and r.target_id = p.id) as reactions,
    (select count(*) from public.posts rp where rp.repost_of = p.id and rp.deleted_at is null) as reposts
  from public.posts p;

-- RLS
alter table public.posts enable row level security; alter table public.comments enable row level security;
alter table public.reactions enable row level security; alter table public.reports enable row level security;
alter table public.notifications enable row level security;

drop policy if exists posts_read on public.posts;     create policy posts_read on public.posts for select to authenticated using (deleted_at is null or author_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists posts_insert on public.posts;   create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid() and public.aldetic_is_verified());
drop policy if exists posts_update on public.posts;   create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid() or public.aldetic_is_staff()) with check (author_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists comments_read on public.comments;   create policy comments_read on public.comments for select to authenticated using (deleted_at is null or author_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists comments_insert on public.comments; create policy comments_insert on public.comments for insert to authenticated with check (author_id = auth.uid() and public.aldetic_is_verified());
drop policy if exists comments_update on public.comments; create policy comments_update on public.comments for update to authenticated using (author_id = auth.uid() or public.aldetic_is_staff()) with check (author_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists reactions_read on public.reactions;   create policy reactions_read on public.reactions for select to authenticated using (true);
drop policy if exists reactions_insert on public.reactions; create policy reactions_insert on public.reactions for insert to authenticated with check (user_id = auth.uid() and public.aldetic_is_verified());
drop policy if exists reactions_delete on public.reactions; create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());
drop policy if exists reports_read on public.reports;     create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.aldetic_is_staff());
drop policy if exists reports_insert on public.reports;   create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists reports_update on public.reports;   create policy reports_update on public.reports for update to authenticated using (public.aldetic_is_staff()) with check (public.aldetic_is_staff());
drop policy if exists notifications_read on public.notifications;   create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications; create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.posts, public.comments, public.reactions, public.reports, public.notifications from public, anon, authenticated;
grant select on public.posts, public.comments, public.reactions, public.reports, public.notifications, public.post_stats to authenticated;
grant insert (author_id, body, media, repost_of) on public.posts to authenticated;
grant update (body, media, deleted_at) on public.posts to authenticated;
grant insert (post_id, parent_id, author_id, body) on public.comments to authenticated;
grant update (body, deleted_at) on public.comments to authenticated;
grant insert (user_id, target_type, target_id, kind) on public.reactions to authenticated;
grant delete on public.reactions to authenticated;
grant insert (reporter_id, target_type, target_id, reason) on public.reports to authenticated;
grant update (status, handled_by, handled_at) on public.reports to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.posts, public.comments, public.reactions, public.reports, public.notifications to service_role;
commit;
