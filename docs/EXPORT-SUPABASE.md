# Export du schéma Supabase (à fournir une seule fois)

But : me permettre d'écrire les migrations sur la structure RÉELLE de la production (tables `profiles`, `user_roles`, `applications`, fonction `is_staff`, `ai_usage`, politiques RLS, déclencheurs, index). Le fichier ne contient AUCUNE donnée utilisateur et aucun secret.

## Méthode A — ligne de commande (10 minutes)
1. Installer la CLI Supabase : https://supabase.com/docs/guides/cli (ou `npm i -g supabase`).
2. `supabase login` (ouvre le navigateur, rien à copier).
3. `supabase link --project-ref nogdmnojpsdjfaapsrhe`
4. `supabase db dump -f schema-public.sql` (schéma public uniquement, sans données)
5. `supabase db dump --schema auth,storage -f schema-auth-storage.sql` (utile pour les déclencheurs sur `auth.users`)
6. `supabase functions list > fonctions.txt` et `supabase secrets list > secrets-noms.txt` (n'affiche que les NOMS et empreintes, pas les valeurs)

Envoyez-moi `schema-public.sql`, `schema-auth-storage.sql`, `fonctions.txt`, `secrets-noms.txt`.

## Méthode B — sans CLI (tableau de bord)
Dashboard → SQL Editor → coller et exécuter chaque requête, puis copier le résultat (bouton « Copy as CSV/JSON ») :
```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' order by 1, ordinal_position;
select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public';
select n.nspname, p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where trigger_schema in ('public','auth');
select tablename, indexname, indexdef from pg_indexes where schemaname='public';
select relname as table, n_live_tup as lignes from pg_stat_user_tables order by 1;
```
## Réglages sans secret à me décrire (captures ou texte)
- Authentication → Providers : lesquels sont activés (Email, Google, Phone). **Ne pas copier les Client Secret.**
- Authentication → SMTP : hôte, port, expéditeur (sans le mot de passe).
- Authentication → URL Configuration : Site URL et Redirect URLs.

## À ne JAMAIS m'envoyer
Clé `service_role`, mot de passe de la base, URL de connexion Postgres, clés API Resend/Groq/Google, jeton GitHub.

## Avant toute migration en production
Sauvegarde : Dashboard → Database → Backups (ou `supabase db dump -f sauvegarde-complete.sql --data-only` pour les données). Aucune migration n'est appliquée sans votre accord explicite.
