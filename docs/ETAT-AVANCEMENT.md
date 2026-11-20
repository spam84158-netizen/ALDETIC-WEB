# État d'avancement réel (13/11/2026) — NON FINAL

Légende : **Testé** = exécuté avec succès ici. **Écrit** = code et tests écrits, jamais exécutés (la CI GitHub les exécute au premier push). **À faire** = absent.

| Domaine | Base de données | Serveur | Interface | Statut |
|---|---|---|---|---|
| Vérification téléphone | Écrit (001, 002, 10_test) | Écrit (`phone-otp`, logique pure testée) | Mode simulation ajouté : code serveur après 3 s, validation Supabase | Test statique JS/HTML/Edge OK ; navigateur non exécuté (Chromium absent dans l'environnement) | À déployer : fonction Edge `phone-otp` + fichiers statiques |
| Portefeuille, dépôts, retraits | Écrit (003, 008, 011, 20_, 70_ et 75_test) | `wallet-api` (Flutterwave : paiement hébergé), `payment-webhook` (signature + revérification chez le prestataire), `wallet-admin` ; 28 tests unitaires passent (faux prestataire, jamais le vrai) | **Page `portefeuille.html` réelle, testée en navigateur (18/18, faux serveur)** | Code des 6 canaux écrit : 4 mobile money + cartes via Flutterwave, virement avec confirmation admin. NON testé avec le vrai Flutterwave (clés de test requises) ; aucun moyen activé par défaut |
| Passerelle IA 5 fournisseurs | Écrit (004, 30_test) | Routeur **testé** (14/14), `ai-gateway` écrit | À faire (pages IA → `ai-gateway`) | Aucun appel réel (pas de clés) |
| Communauté | Écrit (005, 40_test) | — | Page déjà branchée sur les tables (posts, commentaires, réactions, signalements) ; non testée contre une vraie base | À vérifier de bout en bout |
| Parrainage | Écrit (006, 50_test) | — | Page déjà branchée (`referral_progress`, `referral_code_ensure`) ; non testée contre une vraie base | À vérifier de bout en bout |
| Recrutement + badge | Écrit (006, 010, 50_ et 90_test : droits, transitions, badge, CV privés) | Fonctions SQL ; e-mail d'alerte `notify-application` conservé | **`carrieres.html` et `admin.html` réels, testés en navigateur (32/32, faux serveur)** : offres, candidature avec CV, suivi, réponse, examen, décisions, notes internes, gestion des offres | À vérifier sur la vraie base |
| Projets + éditeur | Écrit (009, 80_test : droits, versions, conflits, plafonds) | Fonctions SQL (pas d'Edge) | **Pages `projets.html` et `editor.html` réelles, testées en navigateur (33/33, faux serveur)** : création, archivage, visibilité, fichiers, onglets, coloration, recherche, versions, restauration, lecture seule | À vérifier sur la vraie base |
| Git, My Cloud (déploiement), API, terminal | À faire | À faire | Pages encore en attente | Déploiement : nécessite un compte Cloudflare (clé API) |
| Notifications | Écrit (005, 007, 60_test) | — | **Page réelle, testée en navigateur (13/13, faux client)** : liste, lu/non lu, filtre, préférences | À vérifier sur la vraie base |
| Assistance (tickets) | Écrit (012, 95_test : isolation, notes internes, notifications, plafond, clôture) | Règles en SQL | **`support.html` et `admin-support.html` réels, testés en navigateur (faux serveur)** : création, fil de discussion, réponse, clôture, filtres, notes internes, priorité, attribution | À vérifier sur la vraie base |
| Terminal | — | — | **`terminal.html` réel (terminal de projet en lecture seule : projects, use, ls, tree, cat, head, grep, wc, versions, stats)**, testé en navigateur | Pas un shell système : l'écriture se fait dans l'éditeur |
| Super Admin | À faire | À faire | À faire | |
| Langues (fr/en/es/ar RTL) | — | — | À faire | |

Hypothèses à confirmer par l'export du schéma réel : `profiles(id, phone, phone_verified)`, `user_roles(user_id, role)`, forme de la table `applications` si elle existe déjà en production (la migration 006 la suppose absente ou compatible).


## Correction du 14/11
- La table `notifications` de shema.sql utilise `type` et `action_url` ; mes migrations 005/006 utilisaient `category` et `link` et auraient échoué sur votre base. Corrigé, tests alignés.
- Mon affirmation précédente « la page communauté fonctionne en stockage local » était fausse : elle appelle déjà Supabase.

## 14/11 (suite)
- Composant « petit tableau » (`assets/js/table.js` + styles) : tri, recherche, pagination, cartes sur mobile. Utilisé sur Statut et Parrainage ; testé en navigateur (15/15 avec faux client). À généraliser : déploiements, clés API, transactions, candidatures, tickets.
- Illustration miniature à droite du titre de 19 interfaces (`assets/brand/illustrations/`), d'après la capture NotPanel fournie. Reste à faire : tableau de bord et contact (pas de bandeau titre), barre de navigation mobile flottante.
- Ancien script d'aperçu des notifications retiré (il entrait en conflit avec la page réelle).

## 14/11 (suite 2)
- Barre de navigation mobile flottante (5 entrées, bouton central), pastilles de filtre, cartes/pastilles : testées (8/8).
- Page Portefeuille : soldes, dépôt, retrait avec frais et net avant confirmation, historique, dépôts, retraits.
- Frais à 0 et tous les moyens désactivés par défaut (migration 008) : le propriétaire fixe les frais réels et active chaque moyen après intégration et test.

## 14/11 (suite 3)
- Espace projet : migration 009 (projets, fichiers, historique de 50 versions, concurrence par version attendue, 200 fichiers et 20 projets maximum, 500 000 caractères par fichier). Éditeur : numéros de ligne, coloration (HTML, CSS, JS/TS, JSON, Python, SQL), onglets, recherche, Ctrl+S, avertissement avant de quitter avec des modifications non enregistrées.

## 14/11 (suite 4)
- Recrutement : tables préfixées `recruitment_*` (la table `applications` de la production, si elle existe, n'est pas touchée ni migrée ; import à décider après l'export du schéma). CV : stockage privé `recruitment-cv` (migration 010), 5 Mo, PDF/DOCX, dossier par candidat.
- Statuts du nouveau circuit : reçue, en examen, informations demandées, entretien, retenue, non retenue.

## 15/11 (suite 5)
- Paiements : adaptateur Flutterwave v3 (paiement hébergé, vérification serveur à serveur, transferts), webhook signé et revérifié, actions admin (confirmer un virement, approuver, refuser avec motif, payer manuellement avec référence réelle ou via le prestataire), page `admin-paiements.html` (dépôts, retraits, réglages des moyens, frais, consignes bancaires, journal d'audit) testée 22/22 en navigateur (faux serveur).
- À valider au premier test avec les clés de TEST : code opérateur MTN pour les transferts (`FMM`), forme exacte des réponses Flutterwave.

## 15/11 (suite 6)
- Assistance : migration 012 (tickets 5 ouverts max, statut automatique selon qui répond, notification au membre, un membre ne peut que clore), pages membre et administration.
- Terminal de projet : 18 commandes testées ; les noms hérités (`constructor`) et commandes inconnues sont refusés.
- Tests navigateur support/terminal : 38/38 (faux serveur).
- Encore à construire : Git (import/export), My Cloud (déploiement Cloudflare), plateforme API, équipes, Super Admin, profil public, récompenses, Lia (page chat), tableau de bord, langues fr/en/es/ar complètes, FAQ/remboursement/changelog, retrait des derniers textes d'attente.
