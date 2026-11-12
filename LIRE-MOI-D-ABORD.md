# Aldetic — version corrigée

1. Lisez `DEPLOIEMENT-COMPLET.md` : SQL et fonctions Edge doivent être déployés avant les tests.
2. `AUDIT.md` décrit les fonctions réelles et les limites.
3. La configuration Supabase existante dans `assets/js/config.js` a été conservée.
4. Le code téléphone `000000` est une démonstration contrôlée côté serveur, pas un SMS ni une vérification réelle.
5. N'exposez jamais `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` ou `RESEND_API_KEY` dans les fichiers du site.
