# Aldetic — déploiement des corrections

## 1. Sauvegarde et configuration
Le fichier `assets/js/config.js` a été conservé. Ne remplacez pas la clé publique déjà présente et ne mettez jamais la clé `service_role` dans le navigateur.

## 2. Migration SQL (à faire avant les fonctions)
Dans Supabase > SQL Editor, ouvrez et exécutez `supabase/migration-complete-2026-11.sql`. Cette migration ajoute le stockage avatar, la table de messages de contact, le journal et les champs nécessaires sans supprimer les données.

## 3. Secrets Edge Functions
Dans Supabase > Edge Functions > Secrets, vérifiez que les secrets suivants existent : `GROQ_API_KEY`, `GROQ_MODEL`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `FROM_EMAIL`. La clé service_role est fournie automatiquement à l'environnement Supabase Edge Functions.

Ajoutez `DEMO_PHONE_VERIFICATION=true` uniquement si vous acceptez explicitement le mode démonstration : le code `000000` sera auto-rempli et validé côté serveur après cinq secondes. Ce n'est PAS une preuve de possession du numéro et aucun SMS n'est envoyé. Pour un vrai service, désactivez ce secret et branchez un fournisseur SMS couvrant la Côte d'Ivoire.

## 4. Déployer les fonctions
Depuis le dossier du projet avec Supabase CLI connecté au bon projet :

```bash
supabase functions deploy ask-ai
supabase functions deploy contact-message
supabase functions deploy notify-application
supabase functions deploy reply-application
supabase functions deploy verify-demo-phone
```

Le modèle Groq doit être un modèle actif autorisé par votre compte Groq. En cas d'erreur, consultez Supabase > Edge Functions > Logs > ask-ai : le navigateur affiche maintenant un message utile au lieu de rester sur « Réflexion en cours ».

## 5. Vérifier le propriétaire
Dans `public.user_roles`, le compte propriétaire doit avoir une ligne `user_id` égale à l'UUID du compte et `role='owner'`. Ne créez pas ce rôle pour un autre utilisateur. Les pages Super Admin et Audit restent réservées au rôle propriétaire.

## 6. Profil
Le bucket Storage `avatars` est créé par la migration. Les images sont limitées à 2 Mo, PNG/JPG/WebP. Les champs nom, identifiant, biographie, site, photo et visibilité sont sauvegardés dans `profiles`.

## 7. Test après déploiement
1. Connectez-vous avec un compte test.
2. Vérifiez le téléphone : le mode démo auto-remplit `000000` après 5 s et la fonction serveur passe `phone_verified` à true si `DEMO_PHONE_VERIFICATION=true`.
3. Modifiez votre nom et votre photo dans `profil-public.html`, rechargez la page et vérifiez la persistance.
4. Posez une question à l'assistant IA.
5. Envoyez un message via Contact et une candidature via Carrières.
6. Avec le compte owner, testez la réponse par e-mail depuis Admin et l'écran Audit.

## 8. Limites qui ne peuvent pas être activées sans services/choix supplémentaires
MY GIT nécessite un serveur Forgejo/Gitea et ses identifiants. MY CLOUD nécessite un stockage privé et un runner isolé. AI Studio, éditeur collaboratif, terminal sandbox, notifications push, récompenses/XP, paiements et SMS réel nécessitent des services et règles métier dédiés. Les interfaces non encore branchées restent signalées comme telles : elles ne sont pas présentées comme fonctionnelles.

## Commandes CLI (si Supabase CLI est installé)
Depuis la racine du dossier décompressé :

```bash
npx supabase login
npx supabase link --project-ref nogdmnojpsdjfaapsrhe
npx supabase secrets set DEMO_PHONE_VERIFICATION=true
npx supabase functions deploy ask-ai
npx supabase functions deploy contact-message
npx supabase functions deploy notify-application
npx supabase functions deploy reply-application
npx supabase functions deploy verify-demo-phone
```

Pour désactiver le faux code téléphonique plus tard :

```bash
npx supabase secrets unset DEMO_PHONE_VERIFICATION
```

Liens directs du projet :
- SQL Editor : https://supabase.com/dashboard/project/nogdmnojpsdjfaapsrhe/sql/new
- Edge Functions : https://supabase.com/dashboard/project/nogdmnojpsdjfaapsrhe/functions
- Secrets : https://supabase.com/dashboard/project/nogdmnojpsdjfaapsrhe/settings/functions
