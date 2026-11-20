-- DESTRUCTIF : supprime tout le contenu communautaire. Sauvegarde et accord du propriétaire requis.
begin;
drop view if exists public.post_stats;
drop table if exists public.notifications, public.reports, public.reactions, public.comments, public.posts;
drop function if exists public.community_notify(); drop function if exists public.community_guard();
drop function if exists public.aldetic_is_verified(); drop function if exists public.aldetic_is_staff();
commit;
