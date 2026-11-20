// Routeur IA centralisé : routage par tâche, répartition, basculement, quotas, cooldown, journal.
// TypeScript « effaçable » : s'exécute sous Deno (Edge Functions) et sous Node (tests).
// Les clés ne sont lues que via deps.env, jamais journalisées ni renvoyées.

export type Task = "chat" | "project" | "code" | "diagnostic" | "admin" | "cloud";
export type Sensitivity = "normal" | "sensitive";

export interface ProviderCfg {
  id: string;
  baseUrl: string;            // endpoint compatible OpenAI (…/chat/completions)
  keyEnv: string;             // nom du secret serveur
  trainsOnFreeData: boolean;  // conditions de l'offre gratuite autorisant l'usage des données
  rpm: number;                // limites gratuites (à valider sur la page officielle du fournisseur)
  rpd: number;
  weight: number;             // part de charge relative
  strengths: Task[];
  models: Record<string, string>; // par tâche, + "default"
}
export interface LogEvent {
  provider: string; model: string; task: Task; status: "ok" | "error";
  reason?: string; latencyMs: number; at: number; userId?: string;
}
export interface Store {
  countSince(provider: string, sinceMs: number): Promise<number>;
  record(e: LogEvent): Promise<void>;
  getCooldownUntil(provider: string): Promise<number>;
  setCooldown(provider: string, untilMs: number, reason: string): Promise<void>;
}
export interface Deps {
  env: (k: string) => string | undefined;
  fetch: (url: string, init: any) => Promise<any>;
  now: () => number;
  store: Store;
  timeoutMs?: number;
}
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface ChatRequest { task: Task; sensitivity?: Sensitivity; messages: ChatMessage[]; maxTokens?: number; userId?: string }
export interface Attempt { provider: string; reason: string }
export type ChatResult =
  | { ok: true; text: string; provider: string; model: string; attempts: Attempt[] }
  | { ok: false; error: "all_providers_failed" | "bad_request" | "no_provider_configured"; attempts: Attempt[] };

// Valeurs par défaut. Les identifiants de modèles et les limites évoluent chez les fournisseurs :
// toute valeur se surcharge par secret (AI_MODEL_<ID>_<TASK>) sans changer le code.
export const DEFAULT_PROVIDERS: ProviderCfg[] = [
  { id: "groq", baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY", trainsOnFreeData: false, rpm: 30, rpd: 14400, weight: 3,
    strengths: ["chat", "code", "diagnostic", "admin", "cloud", "project"], models: { default: "llama-3.3-70b-versatile" } },
  { id: "cerebras", baseUrl: "https://api.cerebras.ai/v1", keyEnv: "CEREBRAS_API_KEY", trainsOnFreeData: false, rpm: 30, rpd: 14400, weight: 2,
    strengths: ["chat", "code", "project"], models: { default: "llama-3.3-70b" } },
  { id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY", trainsOnFreeData: true, rpm: 10, rpd: 250, weight: 1,
    strengths: ["chat", "project"], models: { default: "gemini-2.0-flash" } },
  { id: "mistral", baseUrl: "https://api.mistral.ai/v1", keyEnv: "MISTRAL_API_KEY", trainsOnFreeData: true, rpm: 1, rpd: 500, weight: 1,
    strengths: ["code", "chat"], models: { default: "mistral-small-latest", code: "codestral-latest" } },
  { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY", trainsOnFreeData: true, rpm: 20, rpd: 50, weight: 1,
    strengths: ["chat"], models: { default: "meta-llama/llama-3.3-70b-instruct:free" } },
];

const utcMidnight = (now: number) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

export function resolveModel(p: ProviderCfg, task: Task, env: Deps["env"]): string {
  return env(`AI_MODEL_${p.id.toUpperCase()}_${task.toUpperCase()}`) || p.models[task] || p.models.default;
}

export async function routeChat(req: ChatRequest, providers: ProviderCfg[], deps: Deps): Promise<ChatResult> {
  const attempts: Attempt[] = [];
  const sensitivity = req.sensitivity ?? "normal";
  const now = deps.now();
  const candidates: { p: ProviderCfg; model: string; key: string; tier: number; load: number }[] = [];

  for (const p of providers) {
    const key = deps.env(p.keyEnv);
    if (!key) { attempts.push({ provider: p.id, reason: "not_configured" }); continue; }
    if (sensitivity === "sensitive" && p.trainsOnFreeData) { attempts.push({ provider: p.id, reason: "data_policy" }); continue; }
    const model = resolveModel(p, req.task, deps.env);
    if (p.id === "openrouter" && !model.endsWith(":free")) { attempts.push({ provider: p.id, reason: "paid_model_blocked" }); continue; }
    if ((await deps.store.getCooldownUntil(p.id)) > now) { attempts.push({ provider: p.id, reason: "cooldown" }); continue; }
    const perMin = await deps.store.countSince(p.id, now - 60_000);
    if (perMin >= p.rpm) { attempts.push({ provider: p.id, reason: "quota_minute" }); continue; }
    const perDay = await deps.store.countSince(p.id, utcMidnight(now));
    if (perDay >= p.rpd) { attempts.push({ provider: p.id, reason: "quota_day" }); continue; }
    candidates.push({ p, model, key, tier: p.strengths.includes(req.task) ? 0 : 1, load: perDay / (p.rpd * p.weight) });
  }
  if (candidates.length === 0) {
    const configured = attempts.some((a) => a.reason !== "not_configured");
    return { ok: false, error: configured ? "all_providers_failed" : "no_provider_configured", attempts };
  }
  candidates.sort((a, b) => a.tier - b.tier || a.load - b.load || b.p.weight - a.p.weight || a.p.id.localeCompare(b.p.id));

  for (const c of candidates) {
    const t0 = deps.now();
    const log = (status: "ok" | "error", reason?: string) =>
      deps.store.record({ provider: c.p.id, model: c.model, task: req.task, status, reason, latencyMs: deps.now() - t0, at: t0, userId: req.userId });
    const ctrl = new AbortController();
    let timer: any;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => { ctrl.abort(); const e = new Error("timeout"); e.name = "AbortError"; rej(e); }, deps.timeoutMs ?? 30_000);
    });
    try {
      const res: any = await Promise.race([deps.fetch(`${c.p.baseUrl}/chat/completions`, {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: c.model, messages: req.messages, max_tokens: req.maxTokens ?? 1200, temperature: 0.4 }),
      }), timeout]);
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim()) { await log("ok"); return { ok: true, text: text.trim(), provider: c.p.id, model: c.model, attempts }; }
        await log("error", "empty_response"); attempts.push({ provider: c.p.id, reason: "empty_response" }); continue;
      }
      if (res.status === 429) {
        const ra = Number(res.headers?.get?.("retry-after")); const secs = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 3600) : 60;
        await deps.store.setCooldown(c.p.id, deps.now() + secs * 1000, "rate_limited"); await log("error", "rate_limited"); attempts.push({ provider: c.p.id, reason: "rate_limited" }); continue;
      }
      if (res.status === 401 || res.status === 403) {
        await deps.store.setCooldown(c.p.id, deps.now() + 3_600_000, "auth_error"); await log("error", "auth_error"); attempts.push({ provider: c.p.id, reason: "auth_error" }); continue;
      }
      if (res.status === 404) {
        await deps.store.setCooldown(c.p.id, deps.now() + 600_000, "model_unavailable"); await log("error", "model_unavailable"); attempts.push({ provider: c.p.id, reason: "model_unavailable" }); continue;
      }
      if (res.status >= 500) {
        await deps.store.setCooldown(c.p.id, deps.now() + 30_000, "server_error"); await log("error", "server_error"); attempts.push({ provider: c.p.id, reason: "server_error" }); continue;
      }
      await log("error", "bad_request"); attempts.push({ provider: c.p.id, reason: "bad_request" });
      return { ok: false, error: "bad_request", attempts }; // erreur de notre requête : inutile de basculer
    } catch (e) {
      clearTimeout(timer);
      const reason = (e as any)?.name === "AbortError" ? "timeout" : "network_error";
      await deps.store.setCooldown(c.p.id, deps.now() + 30_000, reason); await log("error", reason); attempts.push({ provider: c.p.id, reason });
    }
  }
  return { ok: false, error: "all_providers_failed", attempts };
}

export class MemoryStore implements Store {
  events: LogEvent[] = []; cool = new Map<string, number>();
  async countSince(p: string, since: number) { return this.events.filter((e) => e.provider === p && e.at >= since && e.status === "ok").length; }
  async record(e: LogEvent) { this.events.push(e); }
  async getCooldownUntil(p: string) { return this.cool.get(p) ?? 0; }
  async setCooldown(p: string, until: number) { this.cool.set(p, until); }
}
