# Clés et accès à préparer (liste complète, par ordre)

Principe : aucune clé ne passe par le chat. Vous les enregistrez vous-même comme secrets Supabase (commande ci-dessous) ; le code lit ces secrets côté serveur. Je n'ai pas d'accès réseau à vos services : même avec vos clés, je ne pourrais pas les brancher depuis mon environnement. Je livre le code, vous posez les secrets, et le robot de tests puis vous vérifiez chaque branchement.

Règle générale : créez d'abord les clés de TEST quand le service en propose, et n'activez aucune facturation.

## A. Déjà en place (rien à fournir)
- Connexion Google, e-mail/mot de passe, SMTP Resend dans Supabase : conservés.

## B. Gratuit, sans carte bancaire — à créer maintenant
| Secret | Où le créer | Sert à |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com → API Keys | IA (principal) |
| `CEREBRAS_API_KEY` | cloud.cerebras.ai → API Keys | IA |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | IA (jamais pour les données sensibles) |
| `MISTRAL_API_KEY` | console.mistral.ai → API keys (offre gratuite) | IA |
| `OPENROUTER_API_KEY` | openrouter.ai/keys (modèles « :free » uniquement) | IA, secours |
| Téléphone (simulation) | Aucun secret supplémentaire | Code OTP simulé côté Edge Function ; aucun SMS envoyé |
| `RESEND_API_KEY`, `NOTIFY_EMAIL`, `FROM_EMAIL` | déjà chez Resend (clé existante) | e-mail d'alerte des candidatures |

## C. Publication des projets (Cloudflare)
| Secret | Où |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com/profile/api-tokens → Create Token → Custom → Account · Cloudflare Pages · Edit, limité à votre compte |
| `CLOUDFLARE_ACCOUNT_ID` | REÇU (identifiant non secret, déjà inscrit dans scripts/secrets.example.sh) |

## C2. Paiements : Flutterwave (choix retenu pour la Côte d'Ivoire)
Flutterwave annonce en Côte d'Ivoire l'encaissement mobile money Orange Money, MTN, Moov et Wave (XOF), plus les cartes ; et des retraits (transferts) vers ces portefeuilles mobiles. Source : documentation développeur Flutterwave, relevée le 15/11/2026. À confirmer par vos clés de TEST avant tout argent réel.
| Secret | Où |
|---|---|
| `FLW_SECRET_KEY` | dashboard.flutterwave.com → Settings → API → clé secrète de TEST |
| `FLW_WEBHOOK_HASH` | un texte secret que vous choisissez ; le même à saisir dans Flutterwave → Settings → Webhooks → « Secret hash » |
| `PAYMENT_PROVIDER` | `flutterwave` |
| `APP_URL` | adresse de votre site (retour après paiement) |
URL de webhook à saisir dans Flutterwave : `https://nogdmnojpsdjfaapsrhe.supabase.co/functions/v1/payment-webhook`
Compte marchand : Flutterwave demande l'inscription de la société (documents ALDETIC FRONTIERS LTD) avant d'activer la production. Le virement bancaire, lui, fonctionne sans prestataire (consignes dans Administration → Paiements → Réglages).

## D. Décisions à prendre AVANT de créer les clés (je prépare les comparatifs)
1. Téléphone : le projet utilise actuellement un mode simulation gratuit. Aucun fournisseur SMS ni identifiant payant ne sont requis. Ce mode ne prouve pas la possession réelle du numéro.
2. Paiements : Flutterwave retenu (voir C2). À valider par vous ; alternative locale possible : CinetPay ou PayDunya.
3. Git : voulez-vous que les membres importent des dépôts GitHub ? Si oui : une application OAuth GitHub (Client ID + Client Secret). Sinon rien.

## E. Ne jamais partager
Clé `service_role` Supabase, mot de passe de la base, URL Postgres, jeton GitHub personnel, clés de production de paiement.

## Poser les secrets (une seule commande, sur votre ordinateur)
Copiez `scripts/secrets.example.sh` en `scripts/secrets.sh`, remplacez les valeurs, exécutez-le, puis supprimez-le. Ne le publiez jamais sur GitHub (il est dans `.gitignore`).
