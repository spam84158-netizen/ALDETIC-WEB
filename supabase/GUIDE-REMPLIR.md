# Guide : remplir les clés et brancher les services

Ce guide indique, pour chaque valeur : où la trouver, où la coller, et ce qu'elle débloque.
Ne collez jamais une clé `service_role`, un mot de passe ou un jeton dans un fichier du site.
Les secrets vont uniquement dans le tableau de bord Supabase (Edge Functions > Secrets).

---

## Étape 1 — Créer le projet Supabase

1. Ouvrir https://supabase.com, créer un compte, puis **New project**.
2. Choisir un nom, un mot de passe de base de données (le noter dans un gestionnaire de mots de passe), et une région proche de vos utilisateurs.
3. Attendre la fin de la création (quelques minutes).

## Étape 2 — Créer les tables et les règles de sécurité (une seule fois)

1. Dans le projet : **SQL Editor** > **New query**.
2. Ouvrir le fichier `supabase/shema.sql` du projet, copier tout son contenu, coller, puis **Run**.
3. Avant de lancer, remplacer `REMPLACER-PAR-VOTRE-EMAIL@exemple.com` (dans la section « Attribution du rôle propriétaire ») par l'e-mail du compte qui sera le propriétaire. Ce compte doit d'abord être créé sur le site ; la ligne ne fait rien tant qu'il n'existe pas.
4. Vérifier : **Table Editor** doit afficher les tables `profiles`, `projects`, `posts`, `job_offers`, `applications`, `user_roles`, `repositories`, `deployments`, `ai_usage`.

## Étape 3 — Renseigner l'adresse et la clé publique du site

1. Dans le projet : **Project Settings** > **API**.
2. Copier **Project URL** (ressemble à `https://abcdxyz.supabase.co`).
3. Copier **anon public** (clé publique, longue chaîne commençant par `eyJ`).
4. Ouvrir `assets/js/config.js` et remplacer :
   - `YOUR_SUPABASE_URL` par la Project URL ;
   - `YOUR_SUPABASE_ANON_KEY` par la clé anon.
5. Ne jamais copier la clé **service_role** dans ce fichier.

## Étape 4 — Configurer l'authentification

Dans **Authentication** > **URL Configuration** :
- **Site URL** : l'adresse publique du site (par exemple `https://votre-site.example`).
- **Redirect URLs** : ajouter `https://votre-site.example/tableau-de-bord.html`.

Dans **Authentication** > **Providers** > **Email** : laisser activé. Choisir si la confirmation par e-mail est obligatoire (recommandé : oui).

## Étape 5 — Connexion Google

1. Aller sur https://console.cloud.google.com > **APIs & Services** > **Credentials** > **Create credentials** > **OAuth client ID** > type **Web application**.
2. Dans **Authorized redirect URIs**, ajouter exactement : `https://<VOTRE-PROJET>.supabase.co/auth/v1/callback`
3. Copier le **Client ID** et le **Client secret**.
4. Dans Supabase : **Authentication** > **Providers** > **Google** : coller les deux valeurs, activer, **Save**.

## Étape 6 — Connexion GitHub

1. Aller sur https://github.com/settings/developers > **OAuth Apps** > **New OAuth App**.
2. **Authorization callback URL** : `https://<VOTRE-PROJET>.supabase.co/auth/v1/callback`
3. Créer l'application, copier le **Client ID**, puis **Generate a new client secret** et le copier.
4. Dans Supabase : **Authentication** > **Providers** > **GitHub** : coller, activer, **Save**.

## Étape 7 — Envoi des codes par e-mail (Resend, gratuit pour commencer)

1. Créer un compte sur https://resend.com.
2. **API Keys** > **Create API Key** : copier la clé (elle ne s'affiche qu'une fois). Elle commence par `re_`.
3. Pour envoyer à de vrais destinataires avec votre propre adresse, ajouter et vérifier un domaine dans **Domains**. Sans domaine vérifié, Resend n'envoie qu'à votre propre adresse.
4. Dans Supabase : **Edge Functions** > **Secrets** > **Add new secret** :
   - Name : `RESEND_API_KEY`
   - Value : la clé `re_...`
   - Puis ajouter `FROM_EMAIL` avec l'adresse expéditeur vérifiée (par exemple `Aldetic <no-reply@votre-domaine.example>`).

## Étape 8 — Vérification téléphonique simulée (aucun SMS)
Aucun compte fournisseur SMS, aucune clé SMS et aucun paiement ne sont nécessaires. Après la saisie du numéro, le site attend 5 secondes, génère un code fictif aléatoire à 6 chiffres, le remplit automatiquement et confirme le compte. Cette simulation ne prouve pas que l'utilisateur possède réellement le numéro.

## Étape 9 — Assistant IA (AI CHAT)

1. Créer une clé chez le fournisseur choisi (par exemple Groq : https://console.groq.com > API Keys).
2. Dans Supabase : **Edge Functions** > **Secrets** : `GROQ_API_KEY` = la clé Groq ; `GROQ_MODEL` = `llama-3.3-70b-versatile` (optionnel, valeur par défaut) ; `AI_DAILY_LIMIT` = `20` (optionnel, 0 désactive la limite).
3. La fonction `supabase/functions/ask-ai` lit cette clé côté serveur uniquement.
4. Déployer la fonction : `supabase functions deploy ask-ai` (ou via le tableau de bord).

## Étape 10 — Notifications de candidature (optionnel)

Fonction `supabase/functions/notify-application` : elle utilise `RESEND_API_KEY`, `FROM_EMAIL` et `NOTIFY_EMAIL` (l'adresse qui reçoit les candidatures).

## Étape 11 — Vérifier que tout fonctionne

1. Ouvrir le site, créer un compte, confirmer l'e-mail.
2. Dans **Table Editor** > `profiles` : une ligne doit apparaître avec votre identifiant.
3. Essayer de modifier `phone_verified` depuis le site : la modification doit être refusée.
4. Les connexions Google et GitHub doivent ouvrir la page de l'éditeur, puis revenir sur `tableau-de-bord.html`.

---

## Récapitulatif des valeurs à fournir

| Valeur | Où la trouver | Où la mettre | Débloque |
|---|---|---|---|
| Project URL | Supabase > Project Settings > API | `assets/js/config.js` | Tout le site |
| anon public key | Supabase > Project Settings > API | `assets/js/config.js` | Tout le site |
| E-mail du propriétaire | Votre compte | `schema.sql`, avant exécution | Rôle administrateur |
| Google Client ID / secret | Google Cloud Console | Supabase > Providers > Google | Connexion Google |
| GitHub Client ID / secret | GitHub > OAuth Apps | Supabase > Providers > GitHub | Connexion GitHub |
| RESEND_API_KEY, FROM_EMAIL, NOTIFY_EMAIL | Resend > API Keys / domaine vérifié | Supabase > Edge Functions > Secrets | Notifications de candidature |
| Mode démo téléphone | Aucun secret SMS | Code intégré au site + SQL `aldetic-demo-phone.sql` si schéma déjà installé | Code aléatoire automatique après 5 secondes |
| GROQ_API_KEY | Fournisseur IA | Supabase > Edge Functions > Secrets | AI CHAT |
| NOTIFY_EMAIL | Votre adresse | Supabase > Edge Functions > Secrets | Notifications de candidature |

## Ce qui n'est pas automatique

Je ne peux pas me connecter à votre compte Supabase, ni créer vos clés. L'exécution du schéma, la saisie des clés et la création des comptes Google, GitHub, Resend et du fournisseur SMS doivent être faites par vous, dans les tableaux de bord respectifs. Ce guide indique chaque étape ; il n'y a pas d'étape cachée.
