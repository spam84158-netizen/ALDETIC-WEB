// Vérifie que le routeur s'exécute aussi sous Deno (CI). Les tests complets sont dans ai-router.test.ts (node:test, compatible Deno).
import { routeChat, DEFAULT_PROVIDERS, MemoryStore } from "./ai-router.ts";
Deno.test("routeur : exécutable sous Deno", async () => {
  const r = await routeChat({ task: "chat", messages: [{ role: "user", content: "x" }] }, DEFAULT_PROVIDERS,
    { env: (k) => k === "GROQ_API_KEY" ? "k" : undefined, now: () => Date.now(), store: new MemoryStore(),
      fetch: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: "ok" } }] }) }) });
  if (!r.ok || r.provider !== "groq") throw new Error("échec");
});
