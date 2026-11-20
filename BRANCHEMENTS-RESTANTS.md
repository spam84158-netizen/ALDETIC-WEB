# Branchement final Aldetic — valeurs vérifiées dans le projet

## Déjà présentes dans le ZIP
- Supabase Project URL : `https://nogdmnojpsdjfaapsrhe.supabase.co` (dans `assets/js/config.js`).
- Clé publique Supabase : `sb_publishable_…` déjà renseignée dans `assets/js/config.js` ; la conserver. Ne jamais y placer une clé `service_role`.
- Compte propriétaire prévu par le SQL : `yureijianyu@gmail.com` (section 10 de `supabase/shema.sql`).
- Vérification téléphone : mode simulation gratuit (fonction Edge `phone-otp`). Code aléatoire généré côté serveur après 3 secondes, affiché dans l'interface, puis validé par Supabase avant de passer `phone_verified` à `true`. Aucun fournisseur ni paiement SMS requis. Cela ne prouve pas la possession physique du numéro.

## Secrets Supabase à configurer
Dans **Supabase > Edge Functions > Secrets** :
- `GROQ_API_KEY` : clé créée dans Groq.
- `GROQ_MODEL` : `llama-3.3-70b-versatile` (facultatif, défaut intégré).
- `AI_DAILY_LIMIT` : `20` (facultatif ; mettre `0` pour désactiver la limite).
- `RESEND_API_KEY` : clé API Resend, uniquement si les notifications e-mail sont voulues.
- `NOTIFY_EMAIL` : adresse qui reçoit les candidatures.
- `FROM_EMAIL` : expéditeur sur un domaine vérifié dans Resend, au format `Aldetic <no-reply@votre-domaine.tld>` ; remplacer par votre vrai domaine.
- `NOTIFY_EMAIL` : adresse qui reçoit les candidatures.

Les secrets serveur `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par l'environnement Supabase Edge Functions. Ne pas les publier dans le site.

## SQL à exécuter
Le schéma de ce ZIP s'appelle `supabase/shema.sql` (orthographe exacte). Ne PAS exécuter `aldetic-demo-phone.sql` (archivé, dangereux). Appliquer à la place `supabase/migrations/` dans l'ordre, après sauvegarde. Ne relancez pas un schéma complet déjà appliqué sans vérifier les migrations.

## Déploiement des fonctions
Déployer `phone-otp` (obligatoire pour la simulation), `ask-ai` et `notify-application` depuis `supabase/functions/`. Les modifications du site statique doivent être publiées sur Cloudflare Pages après mise à jour du dépôt GitHub.

## Limites connues à traiter séparément
- Le formulaire de candidature transmet le CV sélectionné mais le backend actuel ne téléverse pas encore le fichier.
- L'écran d'administration actuel permet de changer le statut d'une candidature, mais ne contient pas encore un véritable fil de réponse écrite au candidat.

