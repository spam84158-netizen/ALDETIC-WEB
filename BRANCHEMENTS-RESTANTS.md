# Branchement final Aldetic — valeurs vérifiées dans le projet

## Déjà présentes dans le ZIP
- Supabase Project URL : `https://nogdmnojpsdjfaapsrhe.supabase.co` (dans `assets/js/config.js`).
- Clé publique Supabase : `sb_publishable_…` déjà renseignée dans `assets/js/config.js` ; la conserver. Ne jamais y placer une clé `service_role`.
- Compte propriétaire prévu par le SQL : `yureijianyu@gmail.com` (section 10 de `supabase/shema.sql`).
- Aucun service SMS à configurer : après 5 secondes, le navigateur génère un code fictif aléatoire à 6 chiffres, le remplit automatiquement puis confirme le compte. Ce mode est une simulation et ne vérifie pas la possession réelle du numéro.

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
Le schéma de ce ZIP s'appelle `supabase/shema.sql` (orthographe exacte). Pour un projet qui a déjà exécuté ce schéma, exécuter uniquement `supabase/aldetic-demo-phone.sql` afin d'ajouter la fonction de confirmation simulée. Ne relancez pas un schéma complet déjà appliqué sans vérifier les migrations.

## Déploiement des fonctions
Déployer `ask-ai` et `notify-application` depuis `supabase/functions/`. Les modifications du site statique doivent être publiées sur Cloudflare Pages après mise à jour du dépôt GitHub.

## Limites connues à traiter séparément
- Le formulaire de candidature transmet le CV sélectionné mais le backend actuel ne téléverse pas encore le fichier.
- L'écran d'administration actuel permet de changer le statut d'une candidature, mais ne contient pas encore un véritable fil de réponse écrite au candidat.
- Le mode téléphone est explicitement une simulation et ne prouve pas la possession du numéro.
