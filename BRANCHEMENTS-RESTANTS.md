# Branchement restant après corrections

## Obligatoire pour activer les corrections
- SQL : `supabase/migration-complete-2026-11.sql`
- Edge Functions : `ask-ai`, `contact-message`, `notify-application`, `reply-application`, `verify-demo-phone`
- Secrets : `GROQ_API_KEY`, `GROQ_MODEL`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `FROM_EMAIL`
- Démo téléphone : `DEMO_PHONE_VERIFICATION=true` uniquement si tu acceptes que le code 000000 soit une validation de test, sans SMS.

## Services qui nécessitent encore une vraie infrastructure
- SMS réel : fournisseur couvrant la Côte d'Ivoire.
- MY GIT : serveur Forgejo/Gitea.
- MY CLOUD : stockage privé + runner isolé.
- AI Studio / Editor / Terminal : agent et sandbox d'exécution.
- Paiements : prestataire et webhooks.
- Parrainage et XP : règles métier + fonctions anti-fraude.
- Notifications push : service push et autorisations navigateur/appareil.
- APK : SDK Android, compilation et signature.

Voir `AUDIT.md` pour les états fonctionnels détaillés.
