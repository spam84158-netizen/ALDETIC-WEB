# Corrections Aldetic — ordre exact de déploiement

Le guide à suivre est maintenant `DEPLOIEMENT-COMPLET.md`.

1. Exécuter `supabase/migration-complete-2026-11.sql` dans Supabase SQL Editor.
2. Déployer `ask-ai`, `contact-message`, `notify-application`, `reply-application` et `verify-demo-phone`.
3. Conserver les secrets existants `GROQ_API_KEY`, `GROQ_MODEL`, `RESEND_API_KEY`, `NOTIFY_EMAIL` et `FROM_EMAIL`. Ne jamais les mettre dans les fichiers du site.
4. Définir `DEMO_PHONE_VERIFICATION=true` uniquement pour activer le code de démonstration `000000` (aucun SMS réel).
5. Vérifier que le compte propriétaire possède `role='owner'` dans `public.user_roles`.
6. Tester profil/photo, code téléphone, IA, contact, candidatures, réponse admin, équipes, support, notifications et audit.

La configuration `assets/js/config.js` a été conservée. Aucun secret serveur n'est inclus dans cette archive.
