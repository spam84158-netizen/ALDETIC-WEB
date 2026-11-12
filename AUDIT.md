# ALDETIC — audit fonctionnel après corrections (12 novembre 2026)

## Périmètre vérifié

- Projet complet multi-pages et scripts partagés.
- Contrôle syntaxique Node.js des scripts inline HTML : **28 blocs contrôlés, 0 erreur après correction**.
- Contrôle syntaxique de `assets/js/app.js`, `assets/js/ask-ai.js` et `assets/js/phone.js` : **OK**.
- Vérification statique des références de configuration : l'URL Supabase et la clé publique déjà présentes dans `assets/js/config.js` ont été conservées.
- **Non effectué depuis cet environnement :** exécution réelle sur le projet Supabase, envoi réel Resend, appel réel Groq, test OAuth, test sur le navigateur du téléphone. Ces vérifications nécessitent le déploiement SQL/Edge et une session réelle.

## Corrections livrées dans le code

| Fonction | État du code | Dépendance / remarque |
|---|---|---|
| Assistant IA | CORS + requête OPTIONS, authentification vérifiée dans la fonction, gestion d'erreurs, timeout Groq, réponse vide gérée, quota contrôlé | Déployer `ask-ai`; vérifier `GROQ_API_KEY` et le modèle réellement actif dans Groq. |
| Vérification téléphone | Code de démo `000000` rempli automatiquement après 5 secondes puis envoyé automatiquement à la fonction serveur; le serveur met `phone_verified=true` | Déployer `verify-demo-phone` et définir `DEMO_PHONE_VERIFICATION=true`. C'est une simulation, pas un SMS ni une preuve de possession du numéro. |
| Profil | Nom, identifiant, bio, site, visibilité; chargement et sauvegarde Supabase; photo upload Storage avec limite 2 Mo | Exécuter la migration pour les colonnes, droits et bucket `avatars`. |
| Navigation compte | Connexion/inscription masquées si connecté; liens Mon compte et Mon profil; Super Admin visible uniquement au rôle owner; déconnexion | Nécessite Supabase Auth et la table `user_roles`. |
| Candidatures | Enregistrement serveur, notification Resend, statut admin; réponse saisissable et envoyée par e-mail via `reply-application` | Déployer fonctions; migration; rôle owner/admin; secrets Resend et domaine expéditeur vérifié. |
| Contact | Le message est enregistré dans `contact_messages`; notification e-mail si Resend est configuré; pas de faux succès en cas d'échec | Migration et secrets Resend. |
| Centre d'aide | Création réelle de ticket et premier message; historique des tickets de l'utilisateur | Migration et compte connecté. Interface d'administration des tickets encore à développer. |
| Équipes | Création/suppression des équipes et stockage des invitations dans Supabase; droits RLS | Migration. L'invitation est enregistrée mais l'e-mail automatique et l'acceptation par lien ne sont pas encore implémentés. |
| Notifications | Lecture des notifications serveur, marquage lu, préférences persistées par compte | Migration. Les notifications doivent être créées par les fonctions serveur; les notifications push ne sont pas intégrées. |
| Audit sécurité | Lecture des 100 derniers événements réels, filtre par action, compteur d'événements suspects basé sur le nom de l'action | Rôle owner et migration. Ce compteur n'est pas un moteur de détection de fraude. |
| Super Admin | Accès de page et lien de navigation réservés au rôle owner | Le tableau de bord central reste partiellement une interface : gestion des paiements, comptes et modération non construite. |
| Motion design | Animations d'entrée, révélations au scroll, parallaxe légère; ticker animé ajouté à l'accueil | GSAP/ScrollTrigger chargés par les pages. Respect de `prefers-reduced-motion`. |

## Modules qui restent partiels ou non opérationnels

| Module | État honnête | Ce qui manque pour le rendre réel |
|---|---|---|
| MY GIT | Aperçu local et commandes Termux | Serveur Forgejo/Gitea, création de dépôts via API, authentification et permissions. |
| MY CLOUD | Interface et contrôle local du fichier | Stockage privé, extraction isolée, runner de build, déploiement, journaux, domaines et rollback. |
| AI CHAT distinct | Interface non reliée au moteur de chat complet | Historique, sessions, modèles et branchement à l'API IA. Le widget « Demander à l'IA » est séparé et corrigé. |
| AI STUDIO | Maquette / en préparation | Agent de génération, sandbox, exécution et export. |
| MY EDITOR | Maquette / en préparation | Explorateur et stockage de fichiers avec sauvegarde réelle. |
| MY TERMINAL | Maquette / en préparation | Terminal isolé et sandbox sécurisée. Ne jamais exposer un shell serveur général. |
| API CENTER | Documentation / interface | Génération et hachage de clés, quotas, révocation et endpoint API. |
| Parrainage | Maquette | Attribution anti-fraude côté serveur, lien d'invitation et règle de récompense. |
| Récompenses / XP | Maquette | Calcul et attribution serveur des XP, niveaux et badges. |
| Profil public partageable | Paramètres de profil sauvegardés | Route publique de profil, slug public, rendu public et QR code. |
| APK Android | Coque de projet | Compilation Gradle/SDK, signature et test sur appareil réel. |
| Paiements / abonnements | Non implémentés | Choix du prestataire, règles commerciales et webhooks vérifiés côté serveur. |
| SMS réel | Non implémenté | Fournisseur SMS couvrant la Côte d'Ivoire, identifiants et vérification serveur. |

## Sécurité ajoutée

- `supabase/config.toml` désactive la validation JWT automatique de la passerelle pour les Edge Functions concernées, afin de permettre la clé `sb_publishable_` utilisée par le site. Les fonctions privées vérifient elles-mêmes le jeton utilisateur; les fonctions publiques contact/candidature valident les champs et écrivent avec le service role.
- Le navigateur ne reçoit jamais la clé service role, Groq ou Resend.
- Les écritures `phone_verified` sont retirées des droits `authenticated`; seule la fonction serveur de démonstration les modifie.
- Les profils sont limités à leur propre ligne et à des colonnes modifiables définies.
- Les pages Super Admin/Audit vérifient le rôle owner; les données administratives sont filtrées par RLS.
- Les photos sont dans le bucket `avatars`, lecture publique des fichiers, écriture limitée au dossier UUID du propriétaire.

## À faire dans Supabase avant les tests réels

1. Exécuter `supabase/migration-complete-2026-11.sql` dans SQL Editor.
2. Déployer les cinq Edge Functions listées dans `DEPLOIEMENT-COMPLET.md`.
3. Vérifier les secrets Resend et Groq.
4. Définir `DEMO_PHONE_VERIFICATION=true` uniquement si le mode de test téléphonique est voulu.
5. Vérifier que le compte propriétaire possède bien `role='owner'` dans `user_roles`.

**Important :** le ZIP contient les corrections de code et la migration, mais il ne peut pas exécuter à ta place les changements sur ton projet Supabase/Cloudflare. Tant que les étapes de déploiement ne sont pas faites, les nouvelles fonctions serveur ne seront pas actives en production.
