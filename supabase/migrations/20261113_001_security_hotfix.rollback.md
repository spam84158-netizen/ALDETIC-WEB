Pas de retour arrière SQL : les fonctions supprimées étaient une faille. Ne pas les recréer.
Les profils déjà marqués phone_verified = true par ces fonctions ne sont PAS modifiés par la migration 001.
Les lister avant tout, pour décision : select id, phone from public.profiles where phone_verified;
