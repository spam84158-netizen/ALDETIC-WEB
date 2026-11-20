import test from "node:test";
import assert from "node:assert/strict";
import { routeChat, DEFAULT_PROVIDERS, MemoryStore } from "./ai-router.ts";

const KEYS: Record<string, string> = { GROQ_API_KEY: "gsk_SECRET1", CEREBRAS_API_KEY: "csk_SECRET2", GEMINI_API_KEY: "AIza_SECRET3", MISTRAL_API_KEY: "mis_SECRET4", OPENROUTER_API_KEY: "sk-or_SECRET5" };
const ok = (text = "réponse") => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ choices: [{ message: { content: text } }] }) });
const st = (status: number, headers: Record<string, string> = {}) => ({ ok: false, status, headers: { get: (k: string) => headers[k] ?? null }, json: async () => ({}) });
function mk(handler: (provider: string, url: string, init: any) => any, env: Record<string, string> = KEYS, now = () => 1_700_000_000_000) {
  const calls: string[] = []; const store = new MemoryStore();
  const fetch = async (url: string, init: any) => { const id = DEFAULT_PROVIDERS.find((p) => url.startsWith(p.baseUrl))!.id; calls.push(id); return handler(id, url, init); };
  return { calls, store, deps: { env: (k: string) => env[k], fetch, now, store, timeoutMs: 200 } };
}
const req = { task: "chat" as const, messages: [{ role: "user" as const, content: "salut" }] };

test("succès : un seul appel, le fournisseur le moins chargé de la bonne spécialité", async () => {
  const m = mk(() => ok()); const r = await routeChat(req, DEFAULT_PROVIDERS, m.deps);
  assert.equal(r.ok, true); assert.equal(m.calls.length, 1); assert.equal(m.store.events[0].status, "ok");
});
test("basculement sur 429, 500 et timeout jusqu'à un fournisseur qui répond", async () => {
  const m = mk((p) => p === "groq" ? st(429, { "retry-after": "120" }) : p === "cerebras" ? st(500) : p === "gemini" ? new Promise(() => {}) : ok("de mistral"));
  const r = await routeChat(req, DEFAULT_PROVIDERS, m.deps);
  assert.ok(r.ok && r.provider === "mistral"); assert.deepEqual(r.attempts.map((a) => a.reason), ["rate_limited", "server_error", "timeout"]);
  assert.equal(await m.store.getCooldownUntil("groq"), 1_700_000_000_000 + 120_000);
});
test("cooldown respecté à l'appel suivant (pas de martelage)", async () => {
  const m = mk((p) => p === "groq" ? st(429) : ok()); await routeChat(req, DEFAULT_PROVIDERS, m.deps);
  m.calls.length = 0; await routeChat(req, DEFAULT_PROVIDERS, m.deps); assert.ok(!m.calls.includes("groq"));
});
test("clé refusée (401) : fournisseur écarté 1 h, basculement", async () => {
  const m = mk((p) => p === "groq" ? st(401) : ok()); const r = await routeChat(req, DEFAULT_PROVIDERS, m.deps);
  assert.ok(r.ok && r.provider !== "groq"); assert.ok((await m.store.getCooldownUntil("groq")) - 1_700_000_000_000 >= 3_600_000);
});
test("erreur 400 : pas de basculement, erreur franche", async () => {
  const m = mk(() => st(400)); const r = await routeChat(req, DEFAULT_PROVIDERS, m.deps);
  assert.ok(!r.ok && r.error === "bad_request"); assert.equal(m.calls.length, 1);
});
test("quota journalier épuisé : fournisseur sauté", async () => {
  const m = mk(() => ok()); for (let i = 0; i < 250; i++) await m.store.record({ provider: "gemini", model: "x", task: "chat", status: "ok", latencyMs: 1, at: 1_700_000_000_000 - 3 * 3600_000 });
  const r = await routeChat(req, DEFAULT_PROVIDERS, mk(() => ok(), KEYS).deps); assert.ok(r.ok);
  const p = DEFAULT_PROVIDERS.map((x) => ({ ...x, rpd: x.id === "gemini" ? 250 : x.rpd }));
  const r2 = await routeChat({ ...req, task: "project" }, p, { ...m.deps, env: (k: string) => k === "GEMINI_API_KEY" ? "k" : undefined });
  assert.ok(!r2.ok && r2.attempts.some((a) => a.provider === "gemini" && a.reason === "quota_day"));
});
test("quota par minute respecté", async () => {
  const m = mk(() => ok()); for (let i = 0; i < 30; i++) await m.store.record({ provider: "groq", model: "x", task: "chat", status: "ok", latencyMs: 1, at: 1_700_000_000_000 - 1000 });
  const r = await routeChat({ ...req, task: "diagnostic" }, DEFAULT_PROVIDERS, { ...m.deps, env: (k: string) => k === "GROQ_API_KEY" ? "k" : undefined });
  assert.ok(!r.ok && r.attempts.some((a) => a.reason === "quota_minute"));
});
test("données sensibles : jamais envoyées aux offres gratuites qui exploitent les données", async () => {
  const m = mk(() => ok()); for (let i = 0; i < 20; i++) await routeChat({ ...req, sensitivity: "sensitive" }, DEFAULT_PROVIDERS, m.deps);
  assert.ok(m.calls.every((c) => c === "groq" || c === "cerebras"), m.calls.join());
  const only = mk(() => ok(), { GEMINI_API_KEY: "k", OPENROUTER_API_KEY: "k" });
  const r = await routeChat({ ...req, sensitivity: "sensitive" }, DEFAULT_PROVIDERS, only.deps);
  assert.ok(!r.ok); assert.equal(only.calls.length, 0);
});
test("OpenRouter : modèle payant bloqué", async () => {
  const env = { OPENROUTER_API_KEY: "k", AI_MODEL_OPENROUTER_CHAT: "openai/gpt-4o" }; const m = mk(() => ok(), env);
  const r = await routeChat(req, DEFAULT_PROVIDERS, m.deps); assert.ok(!r.ok); assert.equal(m.calls.length, 0); assert.equal(r.attempts.find((a) => a.provider === "openrouter")!.reason, "paid_model_blocked");
});
test("aucune clé configurée : erreur explicite", async () => {
  const r = await routeChat(req, DEFAULT_PROVIDERS, mk(() => ok(), {}).deps); assert.ok(!r.ok && r.error === "no_provider_configured");
});
test("tâche code : fournisseurs spécialisés code avant les autres", async () => {
  const m = mk(() => ok()); await routeChat({ ...req, task: "code" }, DEFAULT_PROVIDERS, m.deps); assert.ok(["groq", "cerebras", "mistral"].includes(m.calls[0]));
});
test("répartition : sur 300 requêtes, charge répartie selon les poids et aucun fournisseur hors quota", async () => {
  const m = mk(() => ok()); for (let i = 0; i < 300; i++) { m.deps.now = () => 1_700_000_000_000 + i * 61_000 > 1_700_000_000_000 + 80_000_000 ? 1_700_000_000_000 : 1_700_000_000_000 + i * 61_000; await routeChat(req, DEFAULT_PROVIDERS, m.deps); }
  const c = (id: string) => m.calls.filter((x) => x === id).length;
  assert.ok(c("groq") > c("gemini"), `groq=${c("groq")} gemini=${c("gemini")}`); assert.ok(c("gemini") <= 250); assert.ok(c("openrouter") <= 50);
  assert.ok(c("groq") + c("cerebras") + c("gemini") + c("mistral") + c("openrouter") === 300);
});
test("les clés ne fuient ni dans le résultat ni dans le journal", async () => {
  const m = mk(() => st(500)); const r = await routeChat(req, DEFAULT_PROVIDERS, m.deps);
  const dump = JSON.stringify(r) + JSON.stringify(m.store.events); for (const k of Object.values(KEYS)) assert.ok(!dump.includes(k));
});
test("réponse vide : basculement", async () => {
  const m = mk((p) => p === "groq" ? ok("   ") : ok("ok")); const r = await routeChat(req, DEFAULT_PROVIDERS, m.deps); assert.ok(r.ok && r.provider !== "groq"); assert.equal(r.attempts[0].reason, "empty_response");
});
