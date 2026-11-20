import test from "node:test";
import assert from "node:assert/strict";
import { deploy, validateSite, fileHash, extOf, projectName, b64, contentTypeOf, setEnvVars, isDomain, isEnvKey, rollback } from "./pages.ts";

const fakeHash = (t: string) => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h.toString(16).padStart(8, "0").repeat(8); };
const res = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mk(over: Record<string, (u: string, i: any) => any> = {}) {
  const calls: { u: string; i: any }[] = [];
  const fetch = async (u: string, i: any) => { calls.push({ u, i }); const key = Object.keys(over).find((k) => u.includes(k)); if (key) return over[key](u, i);
    if (u.endsWith("/upload-token")) return res(200, { success: true, result: { jwt: "JWT-123" } });
    if (u.includes("/check-missing")) return res(200, { success: true, result: JSON.parse(i.body).hashes });
    if (u.includes("/pages/assets/upload")) return res(200, { success: true });
    if (u.includes("/upsert-hashes")) return res(200, { success: true });
    if (u.endsWith("/deployments")) return res(200, { success: true, result: { id: "dep-1", url: "https://abc.ald-x.pages.dev" } });
    if (/\/pages\/projects\/[^/]+$/.test(u) && (!i || i.method === "GET")) return res(200, { success: true });
    return res(200, { success: true }); };
  return { calls, cfg: { token: "CF-TOKEN", accountId: "ACC1", fetch, blake3hex: fakeHash } };
}
const SITE = [{ path: "index.html", content: "<h1>Salut é</h1>" }, { path: "css/app.css", content: "a{color:red}" }];

test("hash : base64 du contenu + extension sans point, 32 caractères", () => {
  assert.equal(extOf("index.html"), "html"); assert.equal(extOf("Makefile"), ""); assert.equal(extOf("a.min.js"), "js"); assert.equal(extOf(".env"), "");
  assert.equal(b64("é"), "w6k="); let seen = ""; const spy = { blake3hex: (t: string) => { seen = t; return "a".repeat(64); } };
  assert.equal(fileHash(spy, { path: "x/index.html", content: "é" }), "a".repeat(32)); assert.equal(seen, "w6k=html");
});
test("validation : index.html requis, chemins sûrs, limites de taille et de nombre", () => {
  assert.equal(validateSite(SITE), null); assert.equal(validateSite([]), "no_files");
  assert.equal(validateSite([{ path: "a.html", content: "x" }]), "index_html_required");
  assert.equal(validateSite([...SITE, { path: "../x.js", content: "" }]), "invalid_path"); assert.equal(validateSite([...SITE, { path: "/abs.js", content: "" }]), "invalid_path");
  assert.equal(validateSite([...SITE, { path: "big.js", content: "x".repeat(500_001) }]), "file_too_large");
  assert.equal(validateSite(Array.from({ length: 201 }, (_, i) => ({ path: i ? `f${i}.txt` : "index.html", content: "" }))), "too_many_files");
});
test("nom de projet Pages : minuscules, tirets, ≤ 58 caractères, suffixe d'identifiant", () => {
  const n = projectName("Mon Site_ÉTÉ!!", "123e4567-e89b-12d3-a456-426614174000"); assert.match(n, /^ald-[a-z0-9-]+-123e4567$/); assert.ok(n.length <= 58);
  assert.ok(projectName("x".repeat(100), "123e4567-e89b-12d3-a456-426614174000").length <= 58);
});
test("déploiement : ordre des appels, jeton de compte vs JWT, manifeste, envoi des seuls fichiers manquants", async () => {
  const m = mk({ "/check-missing": (u, i) => res(200, { success: true, result: [JSON.parse(i.body).hashes[0]] }) });
  const logs: string[] = []; const r = await deploy(m.cfg, "ald-test-12345678", SITE, (l, msg) => { logs.push(l + ":" + msg); });
  assert.deepEqual(r, { deploymentId: "dep-1", url: "https://abc.ald-x.pages.dev", projectUrl: "https://ald-test-12345678.pages.dev", uploaded: 1, reused: 1 });
  const order = m.calls.map((c) => c.u.replace("https://api.cloudflare.com/client/v4", ""));
  assert.deepEqual(order, ["/accounts/ACC1/pages/projects/ald-test-12345678", "/accounts/ACC1/pages/projects/ald-test-12345678/upload-token", "/pages/assets/check-missing", "/pages/assets/upload", "/pages/assets/upsert-hashes", "/accounts/ACC1/pages/projects/ald-test-12345678/deployments"]);
  const auth = m.calls.map((c) => c.i.headers.Authorization); assert.deepEqual(auth, ["Bearer CF-TOKEN", "Bearer CF-TOKEN", "Bearer JWT-123", "Bearer JWT-123", "Bearer JWT-123", "Bearer CF-TOKEN"]);
  const up = JSON.parse(m.calls[3].i.body); assert.equal(up.length, 1); assert.equal(up[0].base64, true); assert.ok(up[0].metadata.contentType);
  const form: FormData = m.calls[5].i.body; const man = JSON.parse(String(form.get("manifest"))); assert.deepEqual(Object.keys(man).sort(), ["/css/app.css", "/index.html"]); assert.match(man["/index.html"], /^[0-9a-f]{32}$/); assert.equal(form.get("branch"), "main");
  assert.ok(logs.length >= 3);
});
test("déploiement : crée le projet (main) s'il n'existe pas, sans le recréer s'il existe", async () => {
  const base = mk(); const posts: any[] = []; const calls: string[] = [];
  const cfg = { ...base.cfg, fetch: async (u: string, i: any) => { calls.push((i?.method || "GET") + " " + u.replace("https://api.cloudflare.com/client/v4", ""));
    if ((i?.method || "GET") === "GET" && u.endsWith("/pages/projects/ald-new-1")) return res(404, { success: false });
    if (i?.method === "POST" && u.endsWith("/accounts/ACC1/pages/projects")) { posts.push(JSON.parse(i.body)); return res(200, { success: true }); }
    return base.cfg.fetch(u, i); } };
  await deploy(cfg, "ald-new-1", SITE);
  assert.deepEqual(posts, [{ name: "ald-new-1", production_branch: "main" }]); assert.equal(calls[0], "GET /accounts/ACC1/pages/projects/ald-new-1"); assert.equal(calls[1], "POST /accounts/ACC1/pages/projects");
  const existing = mk(); await deploy(existing.cfg, "ald-old-1", SITE); assert.ok(!existing.calls.some((c) => c.i?.method === "POST" && c.u.endsWith("/accounts/ACC1/pages/projects")));
  await assert.rejects(() => deploy({ ...base.cfg, fetch: async () => res(500, {}) }, "ald-x-1", SITE), /project_lookup_failed/);
});
test("déploiement : erreurs de l'API traduites en codes explicites, rien n'est envoyé si le site est invalide", async () => {
  const bad = mk(); await assert.rejects(() => deploy(bad.cfg, "ald-x-1", [{ path: "a.html", content: "" }]), /index_html_required/); assert.equal(bad.calls.length, 0);
  await assert.rejects(() => deploy(mk({ "/upload-token": () => res(403, { success: false }) }).cfg, "ald-x-1", SITE), /upload_token_failed/);
  await assert.rejects(() => deploy(mk({ "/pages/assets/upload": () => res(500, { success: false }) }).cfg, "ald-x-1", SITE), /upload_failed/);
  await assert.rejects(() => deploy(mk({ "/deployments": () => res(400, { success: false }) }).cfg, "ald-x-1", SITE), /deployment_failed/);
});
test("envoi par lots de 20 fichiers", async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ path: i ? `f${i}.txt` : "index.html", content: "c" + i })); const m = mk(); await deploy(m.cfg, "ald-big-1", many);
  assert.equal(m.calls.filter((c) => c.u.endsWith("/pages/assets/upload")).length, 3);
});
test("variables d'environnement : secrets, suppression par null ; domaines et clés validés", async () => {
  const m = mk(); await setEnvVars(m.cfg, "ald-x-1", { API_KEY: "s3cr3t", OLD: null }); const b = JSON.parse(m.calls[0].i.body);
  assert.deepEqual(b.deployment_configs.production.env_vars.API_KEY, { type: "secret_text", value: "s3cr3t" }); assert.equal(b.deployment_configs.production.env_vars.OLD, null);
  assert.ok(isDomain("mon-site.exemple.ci") && isDomain("www.aldetic.com")); assert.ok(!isDomain("localhost") && !isDomain("a.pages.dev") && !isDomain("http://x.com") && !isDomain("x y.com"));
  assert.ok(isEnvKey("API_KEY") && !isEnvKey("api key") && !isEnvKey("1ABC") && !isEnvKey("A"));
});
test("restauration d'un déploiement", async () => { const m = mk(); await rollback(m.cfg, "ald-x-1", "dep-0"); assert.ok(m.calls[0].u.endsWith("/deployments/dep-0/rollback")); assert.equal(m.calls[0].i.method, "POST"); assert.equal(contentTypeOf("a.css").startsWith("text/css"), true); });
