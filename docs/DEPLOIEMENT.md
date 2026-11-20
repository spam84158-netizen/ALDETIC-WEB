# Voir l'interface en ligne (sans aucun branchement supplémentaire)

Le site est statique : il se déploie tel quel. Votre déploiement actuel est aldetic-web.publicpages.workers.dev.

1. Publiez le contenu du ZIP comme vous l'avez fait jusqu'ici (envoi sur le dépôt GitHub, ou envoi direct dans Cloudflare).
2. Le fichier `.assetsignore` empêche de publier les dossiers `supabase`, `docs`, `tests-front`, `.github`, `android` et les `.md` : vos migrations SQL ne doivent pas être téléchargeables publiquement. Si votre méthode de déploiement ignore ce fichier, n'envoyez que les fichiers `.html` et le dossier `assets`.
3. Les pages utilisent la configuration Supabase déjà présente dans `assets/js/config.js`. Les pages qui lisent des tables non encore migrées afficheront un message d'erreur d'usage jusqu'à l'application des migrations (jamais appliquées sans votre accord).
