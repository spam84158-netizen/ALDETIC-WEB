# Aldetic : livraison complète

Ouvrir dans un navigateur, sans serveur :
- `aldetic-app.html` : application une page (bienvenue, accueil, projets, alertes, profil ; mode sombre).
- `aldetic-accueil-autonome.html` : page d'accueil seule, CSS et JavaScript intégrés.

Site complet (plusieurs pages) : ouvrir `index.html` avec un petit serveur local (`python3 -m http.server`), car les pages chargent des fichiers dans `assets/`.

Documentation :
- `AUDIT.md` : statut réel de chaque module, bouton et commande (WORKING, PARTIAL, NOT IMPLEMENTED, BLOCKED), avec les tests réalisés.
- `README.md` : historique des versions.
- `supabase/schema.sql` : schéma de base, à exécuter sur un projet Supabase (non configuré ici).
- `android/` : coque Android, non compilée.

Ce qui n'est pas inclus : clés et configuration Supabase, fournisseur SMS, fournisseur IA, moteur Git, SDK Android (voir AUDIT.md, section 11).
