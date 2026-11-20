# Analyse des références et écart avec ALDETIC (relevé du 14/11/2026)

Sources lues ce jour : notpanel.com, vercel.com, cloudflare.com, et le site ALDETIC en ligne (aldetic-web.publicpages.workers.dev). Seul le contenu de la page d'accueil de chacun a été lu ; les tableaux de bord connectés ne sont pas accessibles sans compte, donc je ne décris pas leurs écrans internes.

## NotPanel (page d'accueil)
Observé : navigation courte (Services, Tarifs, Services gratuits, API, FAQ), sélecteur de 10 langues dont l'arabe, logos clair/sombre, deux boutons (connexion, création de compte). Parcours expliqué en 3 étapes avec aperçu du tableau de bord (portefeuille → choix → suivi). Principe répété : le total est affiché avant confirmation ; chaque service montre prix, quantités min/max, délai de démarrage mesuré sur les 50 derniers démarrages, notes d'acheteurs. Portefeuille prépayé avec limites, frais et consignes de paiement affichées. API documentée avec commandes sûres en cas de nouvel essai (idempotence) et webhooks signés. Page de statut, tickets avec historique complet, programme d'affiliation, pages FAQ / remboursement / conditions / confidentialité. Pastille « vérifié » sur les services testés.
À reprendre pour ALDETIC (sans reprendre l'activité SMM) : affichage frais + net avant tout retrait ou dépôt ; chiffres uniquement mesurés ; historique complet des tickets ; documentation API avec idempotence et webhooks signés ; FAQ et page de remboursement ; portefeuille lisible ; badges de vérification ; langues avec URL propre.

## Vercel (page d'accueil)
Observé : menu Produits / Ressources à grands volets, sélecteur de thème système/clair/sombre, accès tableau de bord. Produits : déploiement avec aperçus, CI, observabilité, sécurité (pare-feu applicatif, gestion des bots), AI Gateway (une passerelle vers de nombreux modèles), bac à sable d'exécution de code, workflows, domaines, marketplace, modèles de projets, changelog, documentation, centre de confiance, page de statut. Un agent analyse les erreurs, planifie une correction et ouvre une demande de modification.
À reprendre : page projet avec liste des déploiements, URL d'aperçu, environnements, journaux, domaines ; passerelle IA (déjà conçue : `ai-gateway`) ; agent d'investigation (proposer, ne jamais appliquer sans autorisation) ; modèles de projets ; changelog ; observabilité ; centre de confiance.

## Cloudflare (page d'accueil)
Observé : menu Produits / Solutions / Ressources / Tarifs, tableau de bord unique. Tarifs lisibles : paliers Gratuit / Pro / Business, quotas gratuits chiffrés pour le développement (par exemple 100 000 requêtes par jour, 10 Go de stockage objet), facturation à l'usage. Sécurité incluse par défaut, page de statut, centre de conformité, intégration avec Git, GitHub Actions, VS Code, aucune dépendance propriétaire.
À reprendre : page tarifs avec quotas réels chiffrés (jamais inventés) ; sécurité et statut visibles ; analytics et journaux par projet ; intégration Git.

## Écart constaté avec ALDETIC (site en ligne + ZIP)
| Élément | Références | ALDETIC aujourd'hui |
|---|---|---|
| Thème clair/sombre et RTL arabe | oui | présents dans la feuille de style (à valider visuellement) |
| Page de statut | oui (3 sur 3) | `statut.html` existe, aucune donnée enregistrée |
| FAQ, remboursement, changelog | oui | absents |
| Tarifs avec quotas chiffrés | oui | `tarifs.html` existe ; chiffres à rattacher aux quotas réels |
| Page projet avec déploiements, aperçus, journaux | Vercel | absente (Git / Cloud / Éditeur en attente) |
| Portefeuille avec frais et net avant confirmation | NotPanel | base de données écrite, interface absente |
| Documentation API avec idempotence, webhooks signés | NotPanel | `api.html` sans fonctionnement |
| Passerelle IA multi-modèles | Vercel | écrite et testée avec de fausses réponses, pas encore raccordée aux pages |
| Agent d'investigation | Vercel | absent |
| Menus à volets, navigation par module | Vercel, Cloudflare | navigation simple |

## Ordre des modifications qui en découle
1. Espace projet façon Vercel : projets, fichiers, éditeur, versions, déploiements, journaux, variables, domaines.
2. Portefeuille façon NotPanel : dépôts, retraits, frais + net, historique, six moyens.
3. Page statut alimentée, FAQ, remboursement, changelog, tarifs chiffrés.
4. Documentation et gestion des clés API avec idempotence et webhooks signés.
5. Raccordement des pages IA à la passerelle, puis agent d'investigation.
6. Navigation à volets et thème système/clair/sombre.
