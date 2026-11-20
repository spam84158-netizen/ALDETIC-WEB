begin;
drop trigger if exists notifications_respect_prefs on public.notifications;
drop function if exists public.notifications_respect_prefs();
drop table if exists public.notification_preferences;
commit;
