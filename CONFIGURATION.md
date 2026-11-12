# Configuration à fournir

Cette version est prête à recevoir les identifiants. Tant qu'ils ne sont pas renseignés, les boutons de connexion et d'envoi affichent qu'ils ne sont pas disponibles. Aucun envoi n'est simulé.

## 1. Supabase (base de données, authentification)

1. Créer un projet sur supabase.com.
2. Dans Settings > API, copier l'URL du projet et la clé `anon public`.
3. Renseigner `assets/js/config.js` :
   - `url` : l'URL du projet ;
   - `anonKey` : la clé anon (publique, jamais la clé `service_role`).
4. Exécuter `supabase/schema.sql` dans l'éditeur SQL.
5. Dans Authentication > URL Configuration :
   - Site URL : l'adresse publique du site ;
   - Redirect URLs : `<adresse>/tableau-de-bord.html`.

## 2. Google (connexion)

1. Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID (Web application).
2. Authorized redirect URI : `https://<projet>.supabase.co/auth/v1/callback`.
3. Copier le Client ID et le Client secret.
4. Supabase > Authentication > Providers > Google : coller les deux valeurs et activer.

## 3. GitHub (connexion)

1. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App.
2. Authorization callback URL : `https://<projet>.supabase.co/auth/v1/callback`.
3. Copier le Client ID et générer un Client secret.
4. Supabase > Authentication > Providers > GitHub : coller les deux valeurs et activer.

## 4. E-mail (codes de vérification)

Fournisseur recommandé : Resend (offre gratuite). Alternative : Brevo.

1. Créer un compte sur resend.com, vérifier un domaine d'envoi (ou utiliser le domaine de test pour les essais).
2. Créer une clé API.
3. La stocker comme secret serveur, jamais dans le site :
   `supabase secrets set RESEND_API_KEY=...`
4. La fonction d'envoi des codes (Edge Function) n'est pas encore écrite : elle sera livrée avec cette clé.

## 5. SMS (vérification du numéro, +225 Côte d'Ivoire)

Fournisseur à choisir parmi ceux qui couvrent la Côte d'Ivoire (par exemple Twilio, Vonage, Africa's Talking).

Données à fournir : identifiant du compte, jeton ou clé API, expéditeur autorisé.
À confirmer : format exact des numéros ivoiriens (10 chiffres après l'indicatif +225 dans la configuration actuelle).

Tant que le fournisseur n'est pas configuré, le numéro est enregistré mais jamais marqué comme vérifié.

## 6. Intelligence artificielle (AI CHAT)

Fournisseur à choisir (par exemple Groq). Clé à stocker comme secret serveur :
`supabase secrets set AI_PROVIDER_KEY=...`
La fonction serveur d'appel n'est pas encore écrite.

## 7. Git distant (MY GIT) et publication (MY CLOUD)

Moteur à choisir (Forgejo ou Gitea), hébergé sur un serveur. Données à fournir : adresse du serveur et identifiants d'administration. Non encore branché.
