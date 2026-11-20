# Audit fonctionnel — Aldetic (v6)

Statuts : **WORKING** (fonctionne, testé) · **PARTIAL** (une partie fonctionne) · **NOT IMPLEMENTED** (absent) · **BLOCKED** (dépend d'un service ou d'identifiants absents).
Tests : `flows3.py` (parcours), `flows4.py` (recherche et copie), `audit.py` (inventaire des contrôles, aucune erreur au chargement sur les 25 pages).
Pour chaque élément, « Résultat » indique le test réellement exécuté. « Non testé » signifie qu'aucun test n'a été fait : ce n'est donc pas un succès.

## 1. Site institutionnel

| Élément | Comportement attendu | Statut | Manque | Dépendance | Test | Résultat |
|---|---|---|---|---|---|---|
| Navigation desktop et lien par page | Ouvrir chaque page | WORKING | — | — | audit.py (25 pages chargées, 0 erreur) | PASS |
| Menu burger mobile | Ouvrir / fermer le menu | WORKING | — | — | flows3 `t_menu` | PASS |
| Sélecteur de langue | Changer de langue, mémoriser | WORKING | Traductions es/pt/de/ar incomplètes (texte anglais de repli) | — | audit.py + libellé zh corrigé | PASS (libellé) |
| Accueil : code illustratif | Affichage seulement | WORKING | Marqué « Exemple illustratif » | — | visuel | PASS |
| Accueil : bouton « Demander à l'IA » | Ouvrir le panneau | WORKING | — | — | flows3 `t_ia` | PASS |
| Assistant IA : envoi | Réponse du modèle | BLOCKED | Fonction serveur `ask-ai`, clé GROQ_API_KEY, modèle à confirmer | Supabase + clé fournisseur | flows3 `t_ia` : aucune réponse inventée | PASS (pas de faux texte) |
| Services : onglets | Changer de catégorie | WORKING | — | — | flows3 `t_services` | PASS |
| À propos, conditions, confidentialité | Lecture | PARTIAL | Conditions et confidentialité sont des brouillons à faire relire | Relecture juridique | — | Non testé (contenu) |
| Projets : recherche | Filtrer, afficher l'état vide | WORKING | Liste vide tant qu'aucun projet public | — | flows4 | PASS |
| Tarifs : bouton « Pas encore disponible » | Désactivé | NOT IMPLEMENTED | Formules payantes non définies | Décision commerciale, moyens de paiement | audit.py (désactivé) | Désactivé et signalé |
| Carrières : offres | Afficher les offres publiées | PARTIAL | Table `job_offers` non alimentée : état vide affiché | Supabase | — | Non testé |
| Carrières : candidature | Valider, enregistrer | PARTIAL | Validation WORKING ; enregistrement réel `applications` écrit mais jamais exécuté | Supabase | flows3 `t_candidature` : sans base, message honnête | PASS (sans base) |
| Contact : formulaire | Valider, envoyer | PARTIAL | Validation WORKING ; envoi BLOCKED, message honnête affiché | Service de messagerie | flows3 `t_contact` | PASS |

## 2. Authentification et comptes

| Élément | Comportement attendu | Statut | Manque | Dépendance | Test | Résultat |
|---|---|---|---|---|---|---|
| Connexion (e-mail + mot de passe) | Ouvrir une session | BLOCKED | Projet Supabase non configuré (config.js) | URL et clé anon Supabase | — | Non testé |
| Inscription | Créer un compte, e-mail de vérification | BLOCKED | Idem | Supabase Auth | — | Non testé |
| Connexion Google | OAuth | BLOCKED | Fournisseur Google non activé | Supabase + identifiants Google | — | Non testé |
| Mot de passe oublié | Envoi du lien | NOT IMPLEMENTED | Aucun écran dédié | Supabase Auth | — | — |
| Vérification téléphone : saisie | Valider l'indicatif et la longueur | WORKING | — | — | flows3 `t_telephone` (redirection sans compte) | PASS |
| Vérification téléphone : envoi du code | Envoyer un SMS, vérifier le code | BLOCKED | Aucun code n'est inventé. Le fournisseur SMS n'est pas choisi | Fournisseur SMS + validation serveur | Code auto-rempli supprimé | PASS (corrigé) |
| Vérification téléphone : marquage « vérifié » | Marquer le compte | BLOCKED | Le marquage n'a lieu qu'après un code réel côté serveur | Idem | Corrigé : plus jamais marqué en navigateur | PASS (corrigé) |
| Pages protégées | Accès seulement connecté et vérifié | PARTIAL | Logique présente, testée sans compte | Supabase | flows3 `t_telephone` ; MY GIT redirige vers connexion | PASS |
| Tableau de bord | Quotas, activité | PARTIAL | Aucune donnée réelle : texte honnête, pas de chiffre inventé | Supabase, table `ai_usage` | Non testé (protégé) | — |

## 3. Developer Hub (communauté)

| Élément | Comportement attendu | Statut | Manque | Dépendance | Test | Résultat |
|---|---|---|---|---|---|---|
| Publier un message | Ajouter au fil | PARTIAL | Stockage navigateur uniquement (démo), pas de comptes | Supabase `posts` | flows3 `t_communaute` | PASS (démo locale) |
| J'aime | Compter | PARTIAL | Local, pas partagé | Supabase | Non testé isolément | Non testé |
| Signaler | Envoyer au modérateur | BLOCKED | Message corrigé : « non transmis » (avant : faux « envoyé ») | Table de modération | flows3 `t_communaute` | PASS (corrigé) |
| Commentaires, favoris, suivi, profils publics, modération | — | NOT IMPLEMENTED | Non développés | Supabase, règles RLS | — | — |

## 4. Modules techniques

| Module | Élément | Statut | Manque | Dépendance | Test | Résultat |
|---|---|---|---|---|---|---|
| MY GIT | Créer un dépôt | PARTIAL | Enregistrement local uniquement ; le message l'indique. Page protégée : sans compte, redirection vers connexion (comportement voulu) | Moteur Git (Forgejo/Gitea), serveur | flows3 `t_git` : le test attendait à tort une page publique ; la redirection est correcte | Redirection OK ; création non testée |
| MY GIT | Commandes Termux copiables | WORKING | — | — | flows4 (bouton copier : notification) | PASS |
| MY GIT | Cloner, pousser, branches, historique, accès | NOT IMPLEMENTED | Aucun serveur Git | Moteur Git | — | — |
| MY CLOUD | Choisir un ZIP | PARTIAL | Contrôle local (extension, taille) fonctionne ; aucun envoi | Stockage | Corrigé : message honnête | PASS (contrôle) |
| MY CLOUD | Extraire, détecter, construire, déployer, journaux, domaines, rollback | NOT IMPLEMENTED | Aucun pipeline | Serveur de build, stockage | — | — |
| AI CHAT | Envoyer un message, historique, modèles | BLOCKED | Champ et bouton désactivés, modèle non confirmé | Fonction serveur + fournisseur IA | — | Désactivé et signalé |
| AI STUDIO | Création de projet, génération, exécution, export | NOT IMPLEMENTED | Page « en préparation » | Agent, sandbox d'exécution | — | — |
| MY EDITOR | Explorateur, éditeur, enregistrement | NOT IMPLEMENTED | Page « en préparation » | — | — | — |
| MY TERMINAL | Terminal isolé | NOT IMPLEMENTED | Page « en préparation » | Sandbox isolée (jamais de shell serveur non restreint) | — | — |
| API CENTER | Créer une clé | BLOCKED | Bouton désactivé | Serveur, hachage des clés, quotas | — | Désactivé et signalé |
| API CENTER | Documentation, exemples | PARTIAL | Documentation présente, non vérifiée | — | — | Non testé |
| Admin (candidatures) | Lister, changer le statut | BLOCKED | Nécessite Supabase, rôle propriétaire | Supabase + RLS | — | Non testé |
| Super Admin : autres modules | Utilisateurs, paiements, parrainages, sécurité, journaux | NOT IMPLEMENTED | Non développés | Supabase, paiements | — | — |

## 5. Fondateur et portfolio

| Élément | Statut | Test | Résultat |
|---|---|---|---|
| Page publique sans compte | WORKING | audit.py | PASS |
| Formulaire de contact : validation | WORKING | Non testé isolément (la validation est exécutée à la soumission) | Non testé |
| Formulaire de contact : envoi | BLOCKED | Bouton désactivé, texte explicite | Désactivé et signalé |
| Coordonnées (e-mail, Telegram) | BLOCKED | Non fournies par le propriétaire | « à renseigner » |

## 6. Maquette mobile (visuel)

| Élément | Statut | Test | Résultat |
|---|---|---|---|
| Bouton « Passer en sombre » | WORKING | flows3 `t_maquette` | PASS |
| Interrupteur « Mode sombre » | WORKING | flows3 `t_maquette` | PASS |
| Interrupteur « Notifications » | BLOCKED | Désactivé, signalé « Non branché » | Désactivé et signalé |
| Onglets de la barre | Non cliquables (maquette) | Désactivés | Désactivés et signalés |

## 7. Android

| Élément | Statut | Dépendance |
|---|---|---|
| Coque WebView (Kotlin) | PARTIAL | Code présent, non compilé |
| APK installable | BLOCKED | SDK Android, Gradle, clé de signature |
| Sur appareil réel | BLOCKED | Appareil ou émulateur |

## 8. Interfaces complémentaires ajoutées (passe Aldetic)

Les interfaces suivantes sont maintenant présentes dans le projet : `notifications.html`, `equipes.html`, `aide.html`, `parrainage.html`, `recompenses.html`, `profil-public.html`, `super-admin.html`, `audit-securite.html`, `maintenance.html`, `mot-de-passe-oublie.html` et le hub `espace.html`. Les logos vectoriels dédiés sont dans `assets/brand/logos/`.

**Important :** les écrans et leurs états visuels sont développés. Les fonctions qui nécessitent une base, un service e-mail/SMS, des rôles, des journaux serveur, un moteur QR public ou une supervision restent à brancher et à rendre opérationnelles. Les aperçus locaux sont explicitement signalés comme tels ; ils ne simulent pas un envoi ou une validation serveur.

## 9. Skills et dépendances

| Élément | Statut |
|---|---|
| `frontend-design`, `awwwards`, `karpathy-guidelines` | Lues et appliquées (direction, tokens, mouvement réduit, changements chirurgicaux) |
| `gsap-*`, `genjutsu`, `design-taste`, `ui-ux-pro-max`, `playwright-skill` | BLOCKED : absentes de l'environnement |

## 10. Faux succès corrigés pendant cet audit

1. Vérification téléphone : code auto-rempli et compte marqué vérifié en navigateur. **Supprimé.**
2. Candidature : « Candidature reçue » affiché sans enregistrement. **Enregistrement réel, sinon message honnête.**
3. Signalement : « envoyé aux modérateurs » sans envoi. **Remplacé par « non transmis ».**
4. MY CLOUD : « reçue, vérification en cours » sans envoi. **Remplacé par « contrôle local, aucune archive envoyée ».**
5. Maquette : interrupteurs statiques et liens `#`. **Un seul interrupteur agit ; les autres sont désactivés.**
6. Libellé 中文 manquant dans le choix de langue (affichait « undefined »). **Corrigé.**

## 11. Ce qui reste nécessaire pour compléter

- **Supabase** : URL, clé anon, exécution de `schema.sql`, activation e-mail et Google (débloque connexion, inscription, profils, candidatures, admin, communauté).
- **Fournisseur SMS** choisi et validation côté serveur (débloque la vérification téléphone).
- **Fonction serveur de messagerie** (contact, signalements).
- **Fournisseur IA** et clé côté serveur (débloque AI CHAT, Demander à l'IA).
- **Moteur Git** et serveur de build (MY GIT, MY CLOUD).
- **SDK Android, Gradle, clé de signature** (APK).
- **Branchement et mise en service** : notifications, équipes, badges/XP, parrainage, support, profils publics/QR, Super Admin, audit et supervision. Les interfaces correspondantes sont maintenant créées dans la passe Aldetic complémentaire.

## 12. Application une page (`aldetic-app.html`)

| Élément | Statut | Test | Résultat |
|---|---|---|---|
| Écran de bienvenue, boutons d'accès | WORKING | app_test.py | PASS |
| Connexion et inscription | BLOCKED (Supabase) | Boutons désactivés, aucun faux succès | PASS |
| Continuer sans compte (mode local) | WORKING | Accès à l'accueil, mémorisé au rechargement | PASS |
| Barre d'onglets (accueil, projets, alertes, profil) | WORKING | Changement de vue | PASS |
| Projets : ajout, recherche, filtres, stockage local | WORKING (local uniquement) | Ajout, conservation après rechargement, filtres, état vide | PASS |
| Projets : validation du nom | WORKING | Nom de 1 caractère refusé | PASS |
| Alertes : lecture, tout marquer comme lu, badge | WORKING (exemples locaux) | Badge retiré | PASS |
| Profil : mode sombre, mémorisé | WORKING | Rechargement | PASS |
| Profil : notifications serveur | BLOCKED | Interrupteur désactivé | Désactivé et signalé |
| Modules MY GIT, MY CLOUD, AI CHAT | NOT IMPLEMENTED (message honnête) | Toast « non relié à un serveur » | PASS |
| Visuel mobile du ZIP | PARTIAL | Capture mobile vérifiée | Visuel OK, pas encore d'animations GSAP |


## 13. Passe complète du design (v8)

Pages refaites dans le système de design commun (mise en page, cartes, pilules, onglets, formulaires, états vides), en conservant leurs identifiants et leurs scripts :
accueil, services, tarifs, à propos, projets, communauté, contact, carrières, documentation, confidentialité, conditions, API CENTER, MY EDITOR, MY TERMINAL, AI STUDIO, connexion, inscription, vérification du téléphone, tableau de bord, AI CHAT, MY GIT, MY CLOUD, administration.

Corrections pendant la passe :
- Connexion et inscription sans base : la fausse connexion locale (compte créé dans le navigateur puis redirection) est supprimée. Le formulaire explique que le service n'est pas configuré.
- MY GIT : champ d'erreur manquant corrigé (la validation du nom plantait).
- Tableau de bord : les indicateurs affichent « — » au lieu de zéros inventés.

Restent (dépendances externes, documentées section 11) : authentification réelle, envoi SMS, assistant IA, dépôts Git distants, publication MY CLOUD, administration réelle, APK.

Traductions : portugais et allemand couvrent environ 200 textes sur 315. Les nouveaux textes de la passe v8 restent en français.
Animations : entrée douce des blocs (CSS), désactivée avec prefers-reduced-motion. Les animations GSAP des pages ne sont pas vérifiables sans accès au CDN.


## 14. Interfaces complémentaires — livraison

- Hub des modules : `espace.html`.
- Centre de notifications et préférences : `notifications.html`.
- Équipes et collaboration : `equipes.html`.
- Help Center et demandes de support : `aide.html`.
- Parrainage : `parrainage.html`.
- XP, badges et défis : `recompenses.html`.
- Profil public et zone QR : `profil-public.html`.
- Console Super Admin : `super-admin.html`.
- Audit et sécurité : `audit-securite.html`.
- Statut et maintenance : `maintenance.html`.
- Récupération de mot de passe : `mot-de-passe-oublie.html`.
- Logo vectoriel principal et logos des modules : `assets/brand/logos/`.
