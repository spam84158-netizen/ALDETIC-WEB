// Edge Function ai-gateway — point d'entrée unique de toutes les fonctions IA (Lia, projets, code, diagnostic, cloud, admin).
// Secrets : GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY (tous optionnels : un fournisseur sans clé est ignoré),
//           AI_DAILY_LIMIT (défaut 50 par utilisateur), AI_MODEL_<FOURNISSEUR>_<TACHE> (surcharge de modèle).
import { createClient } from "npm:@supabase/supabase-js@2";
import { routeChat, DEFAULT_PROVIDERS } from "../_shared/ai-router.ts";
import type { Store, LogEvent, Task } from "../_shared/ai-router.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (s: number, b: Record<string, unknown>) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const TASKS = ["chat", "project", "code", "diagnostic", "admin", "cloud"];

function dbStore(admin: any): Store {
  return {
    async countSince(provider, since) {
      const { count } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("provider", provider).eq("status", "ok").gte("created_at", new Date(since).toISOString());
      return count ?? 0;
    },
    async record(e: LogEvent) {
      await admin.from("ai_requests").insert({ user_id: e.userId ?? null, provider: e.provider, model: e.model, task: e.task, status: e.status, reason: e.reason ?? null, latency_ms: e.latencyMs, created_at: new Date(e.at).toISOString() });
    },
    async getCooldownUntil(provider) {
      const { data } = await admin.from("ai_provider_state").select("disabled_until").eq("provider", provider).maybeSingle();
      return data ? new Date(data.disabled_until).getTime() : 0;
    },
    async setCooldown(provider, until, reason) {
      await admin.from("ai_provider_state").upsert({ provider, disabled_until: new Date(until).toISOString(), reason, updated_at: new Date().toISOString() });
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json(503, { error: "server_not_configured" });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!token) return json(401, { error: "auth_required" });
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u?.user) return json(401, { error: "invalid_session" });
    const { data: prof } = await admin.from("profiles").select("phone_verified").eq("id", u.user.id).maybeSingle();
    if (!prof?.phone_verified) return json(403, { error: "phone_not_verified" });

    const body = await req.json().catch(() => ({}));
    const task = String(body.task || "chat") as Task;
    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!TASKS.includes(task) || !messages || messages.length === 0 || messages.length > 40) return json(400, { error: "invalid_request" });
    const clean = messages.map((m: any) => ({ role: ["system", "user", "assistant"].includes(m?.role) ? m.role : "user", content: String(m?.content ?? "").slice(0, 12000) }));

    // Les tâches « admin » sont réservées au personnel ; elles sont traitées comme sensibles.
    if (task === "admin") {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
      if (!(roles ?? []).some((r: any) => ["owner", "admin"].includes(r.role))) return json(403, { error: "forbidden" });
    }
    const limit = Math.max(0, Number(Deno.env.get("AI_DAILY_LIMIT") ?? "50") || 0);
    if (limit > 0) {
      const since = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
      const { count } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).eq("status", "ok").gte("created_at", since);
      if ((count ?? 0) >= limit) return json(429, { error: "daily_limit_reached" });
    }
    const sensitive = task === "admin" || task === "diagnostic" || task === "cloud" || body.sensitive === true;
    const r = await routeChat({ task, sensitivity: sensitive ? "sensitive" : "normal", messages: clean, maxTokens: 1200, userId: u.user.id }, DEFAULT_PROVIDERS,
      { env: (k) => Deno.env.get(k), fetch: (a, b) => fetch(a, b), now: () => Date.now(), store: dbStore(admin), timeoutMs: 30000 });
    if (!r.ok) return json(r.error === "bad_request" ? 400 : 503, { error: r.error, attempts: r.attempts });
    return json(200, { answer: r.text, provider: r.provider, model: r.model });
  } catch (e) { console.error("ai-gateway", String(e)); return json(500, { error: "internal" }); }
});
