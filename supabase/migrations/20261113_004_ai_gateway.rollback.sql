-- Supprime le journal IA (destructif pour l'historique d'usage). Sauvegarder avant.
begin; drop table if exists public.ai_provider_state, public.ai_requests; commit;
