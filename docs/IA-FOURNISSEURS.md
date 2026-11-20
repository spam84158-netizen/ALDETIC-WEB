# Passerelle IA : cinq fournisseurs gratuits (Groq conservé)

Fonction Edge `ai-gateway` + routeur `_shared/ai-router.ts`. Toutes les sections IA passent par ce point unique ; les clés restent dans les secrets Supabase.

| Fournisseur | Rôle | Secret | Limites gratuites utilisées par défaut | Données |
|---|---|---|---|---|
| **Groq** (conservé) | Principal : chat, code, diagnostic, admin, cloud | `GROQ_API_KEY` | 30 req/min, 14 400 req/jour (source tierce 2026, à valider sur console.groq.com) | Exploitation des données non vérifiée : à confirmer avant usage sensible |
| Cerebras | Chat, code, projets | `CEREBRAS_API_KEY` | valeurs prudentes identiques, à valider | à confirmer |
| Google Gemini | Chat, projets | `GEMINI_API_KEY` | 10 req/min, 250 req/jour par défaut prudent | **Vérifié : offre gratuite = contenu utilisé pour améliorer les produits Google, relecture humaine possible** |
| Mistral | Code, chat | `MISTRAL_API_KEY` | 1 req/min, 500 req/jour par défaut prudent | à confirmer (offre d'essai) |
| OpenRouter (modèles `:free`) | Dernier secours | `OPENROUTER_API_KEY` | 20 req/min, 50 req/jour | selon le modèle |

Ces cinq choix sont ma sélection ; ils ne sont pas encore validés par des appels réels (aucune clé disponible ici). Les limites sont des valeurs prudentes modifiables dans `DEFAULT_PROVIDERS`, et les modèles se changent sans code via `AI_MODEL_<FOURNISSEUR>_<TACHE>`.

## Garde-fous implémentés et testés (14 tests, `node --test`)
- Basculement automatique sur 429, 5xx, délai dépassé, réponse vide, clé refusée (401/403), modèle introuvable ; pas de basculement sur une erreur 400 de notre requête.
- Pause (cooldown) d'un fournisseur en échec, quotas par minute et par jour, répartition selon le poids.
- **Données sensibles** (tâches admin, diagnostic, cloud, ou demande explicite) : jamais envoyées à un fournisseur dont l'offre gratuite exploite les données.
- OpenRouter : tout modèle non `:free` est bloqué par le code.
- Les clés n'apparaissent ni dans les réponses ni dans le journal (`ai_requests`).
- Aucun crédit ni abonnement : n'activez AUCUNE facturation chez ces fournisseurs.

## Branchement
`supabase secrets set GROQ_API_KEY=… CEREBRAS_API_KEY=… GEMINI_API_KEY=… MISTRAL_API_KEY=… OPENROUTER_API_KEY=…` puis `supabase functions deploy ai-gateway`. Un fournisseur sans clé est simplement ignoré.

## Limite actuelle
Le routeur est testé avec des réponses simulées ; la fonction `ai-gateway` n'a jamais été appelée contre Supabase ni contre un vrai fournisseur. Les pages IA du site utilisent encore l'ancienne fonction `ask-ai` : leur raccordement à `ai-gateway` est à faire.
