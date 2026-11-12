// Supabase Edge Function — secrets requis : GROQ_API_KEY ; optionnels : GROQ_MODEL, AI_DAILY_LIMIT.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!url || !serviceKey) return json(503, { error: "Configuration Supabase serveur incomplète." });
    if (!groqKey) return json(503, { error: "La clé GROQ_API_KEY manque dans les secrets Supabase." });
    if (!token) return json(401, { error: "Connexion requise." });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: authError } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) return json(401, { error: "Session invalide. Reconnectez-vous." });

    const { data: prof, error: profileError } = await admin.from("profiles").select("phone_verified").eq("id", user.id).maybeSingle();
    if (profileError) return json(500, { error: "Impossible de vérifier le profil." });
    if (!prof?.phone_verified) return json(403, { error: "Confirmez votre numéro avant d'utiliser l'assistant." });

    const body = await req.json().catch(() => ({}));
    const question = body?.question;
    if (typeof question !== "string" || question.trim().length < 3 || question.length > 1000)
      return json(400, { error: "Question invalide (3 à 1000 caractères)." });

    const limit = Math.max(0, Number(Deno.env.get("AI_DAILY_LIMIT") ?? "20") || 0);
    if (limit > 0) {
      const since = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
      const { count, error } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
      if (error) return json(500, { error: "Impossible de vérifier le quota IA." });
      if ((count ?? 0) >= limit) return json(429, { error: "Limite quotidienne atteinte." });
    }

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es l'assistant d'Aldetic Frontiers. Réponds dans la langue de la question, clairement, utilement et prudemment." },
          { role: "user", content: question.trim() }
        ], temperature: 0.5, max_tokens: 1200
      })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Groq API error:", upstream.status, result?.error?.message || "upstream error");
      return json(502, { error: upstream.status === 429 ? "Quota du fournisseur IA atteint. Réessayez plus tard." : "Le fournisseur IA a refusé la requête. Vérifiez GROQ_API_KEY et GROQ_MODEL." });
    }
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) return json(502, { error: "Le fournisseur IA n'a renvoyé aucune réponse." });
    const { error: usageError } = await admin.from("ai_usage").insert({ user_id: user.id });
    if (usageError) console.error("AI usage logging failed:", usageError.message);
    return json(200, { answer: answer.trim() });
  } catch (error) {
    console.error("ask-ai error:", error);
    return json(500, { error: "Erreur interne de l'assistant. Réessayez." });
  }
});
