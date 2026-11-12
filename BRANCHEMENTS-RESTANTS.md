# Aldetic — branchements restants après création des interfaces

Les interfaces complémentaires sont créées et intégrées au design du site. Ce document sépare leur présence visuelle des services nécessaires à leur fonctionnement réel.

| Module | Interface | Branchement / opérationnalisation restante |
|---|---|---|
| Notifications | `notifications.html` | Tables Supabase, événements serveur, temps réel, préférences, push/e-mail |
| Équipes | `equipes.html` | Tables teams/members/invitations, rôles, RLS, envoi d'invitations |
| Help Center | `aide.html` | Base de tickets, stockage, e-mail et console de support |
| Parrainage | `parrainage.html` | Codes uniques, validation serveur, anti-fraude, règles de récompense |
| XP & récompenses | `recompenses.html` | Règles XP côté serveur, catalogue de badges, attribution et historique |
| Profil public | `profil-public.html` | Publication de profil, slug unique, permissions, génération QR réelle |
| Super Admin | `super-admin.html` | RBAC strict côté serveur, RLS, fonctions admin, journalisation |
| Audit sécurité | `audit-securite.html` | Écriture immuable des événements, accès staff, filtres et rétention |
| Maintenance | `maintenance.html` | Sondes/health checks, incidents, calendrier et statut vérifié |
| Mot de passe oublié | `mot-de-passe-oublie.html` | Supabase Auth, URL de redirection, modèle et domaine e-mail |

Aucun écran d'administration ne doit être considéré comme sécurisé par sa seule présence dans le navigateur. Les autorisations doivent être imposées côté serveur.
