// Publication sur Cloudflare Pages par « Direct Upload » (même protocole que wrangler) :
// upload-token → check-missing → upload (par lots) → upsert-hashes → création du déploiement avec un manifeste {chemin: hash}.
// Hash d'un fichier : blake3( base64(contenu) + extension sans point ) , 32 premiers caractères hexadécimaux.
// Aucun accès réseau direct : fetch et blake3 sont injectés (tests, Edge Functions).
export interface PagesCfg { token: string; accountId: string; fetch: (url: string, init?: any) => Promise<any>; blake3hex: (text: string) => string; baseUrl?: string }
export interface SiteFile { path: string; content: string }   // content : texte UTF-8
export const LIMITS = { maxFiles: 200, maxFileBytes: 500_000, maxTotalBytes: 5_000_000 };
const API = (c: PagesCfg) => (c.baseUrl || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
const enc = new TextEncoder();

export function b64(text: string): string { const bytes = enc.encode(text); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
export function extOf(path: string): string { const f = path.split("/").pop() || ""; const i = f.lastIndexOf("."); return i <= 0 ? "" : f.slice(i + 1); }
export function fileHash(c: Pick<PagesCfg, "blake3hex">, f: SiteFile): string { return c.blake3hex(b64(f.content) + extOf(f.path)).slice(0, 32); }
const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json", svg: "image/svg+xml", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", xml: "application/xml", map: "application/json" };
export const contentTypeOf = (path: string) => TYPES[extOf(path).toLowerCase()] || "application/octet-stream";

export function projectName(slug: string, id: string): string {
  const s = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 38) || "projet";
  return `ald-${s}-${id.replace(/-/g, "").slice(0, 8)}`;   // ≤ 58 caractères, lettres minuscules, chiffres, tirets
}

// Validation avant tout envoi. Renvoie un code d'erreur ou null.
export function validateSite(files: SiteFile[]): string | null {
  if (!files.length) return "no_files";
  if (files.length > LIMITS.maxFiles) return "too_many_files";
  if (!files.some((f) => f.path === "index.html")) return "index_html_required";
  let total = 0;
  for (const f of files) {
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(f.path) || f.path.includes("..") || f.path.startsWith("/") || f.path.includes("//")) return "invalid_path";
    const n = enc.encode(f.content).length; total += n;
    if (n > LIMITS.maxFileBytes) return "file_too_large";
  }
  return total > LIMITS.maxTotalBytes ? "site_too_large" : null;
}

export interface DeployResult { deploymentId: string; url: string; projectUrl: string; uploaded: number; reused: number }
export type Log = (level: "info" | "error", message: string) => void | Promise<void>;

async function call(c: PagesCfg, path: string, init: any, bearer?: string) {
  const res = await c.fetch(API(c) + path, { ...init, headers: { Authorization: `Bearer ${bearer ?? c.token}`, ...(init?.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok && j?.success !== false, status: res.status, j };
}

export async function ensureProject(c: PagesCfg, name: string): Promise<void> {
  const g = await call(c, `/accounts/${c.accountId}/pages/projects/${name}`, { method: "GET" });
  if (g.ok) return;
  if (g.status !== 404) throw new Error("cloudflare_project_lookup_failed");
  const p = await call(c, `/accounts/${c.accountId}/pages/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, production_branch: "main" }) });
  if (!p.ok) throw new Error("cloudflare_project_create_failed");
}

export async function deploy(c: PagesCfg, name: string, files: SiteFile[], log: Log = () => {}): Promise<DeployResult> {
  const bad = validateSite(files); if (bad) throw new Error(bad);
  await log("info", `Vérification : ${files.length} fichier(s) valides.`);
  await ensureProject(c, name); await log("info", "Projet Cloudflare Pages prêt.");
  let t = await call(c, `/accounts/${c.accountId}/pages/projects/${name}/upload-token`, { method: "GET" });
  if (!t.ok && t.status === 405) t = await call(c, `/accounts/${c.accountId}/pages/projects/${name}/upload-token`, { method: "POST" });
  const jwt = t.j?.result?.jwt; if (!t.ok || !jwt) throw new Error("cloudflare_upload_token_failed");
  const manifest: Record<string, string> = {}, byHash = new Map<string, SiteFile>();
  for (const f of files) { const h = fileHash(c, f); manifest["/" + f.path] = h; byHash.set(h, f); }
  const hashes = [...byHash.keys()];
  const cm = await call(c, "/pages/assets/check-missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) }, jwt);
  if (!cm.ok || !Array.isArray(cm.j?.result)) throw new Error("cloudflare_check_missing_failed");
  const missing: string[] = cm.j.result;
  for (let i = 0; i < missing.length; i += 20) {
    const batch = missing.slice(i, i + 20).map((h) => { const f = byHash.get(h)!; return { key: h, value: b64(f.content), metadata: { contentType: contentTypeOf(f.path) }, base64: true }; });
    const up = await call(c, "/pages/assets/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch) }, jwt);
    if (!up.ok) throw new Error("cloudflare_upload_failed");
  }
  await log("info", `Fichiers envoyés : ${missing.length} ; déjà présents : ${hashes.length - missing.length}.`);
  const us = await call(c, "/pages/assets/upsert-hashes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) }, jwt);
  if (!us.ok) throw new Error("cloudflare_upsert_failed");
  const form = new FormData(); form.append("branch", "main"); form.append("manifest", JSON.stringify(manifest));
  const d = await call(c, `/accounts/${c.accountId}/pages/projects/${name}/deployments`, { method: "POST", body: form });
  if (!d.ok || !d.j?.result?.id) throw new Error("cloudflare_deployment_failed");
  await log("info", "Déploiement créé chez Cloudflare.");
  return { deploymentId: String(d.j.result.id), url: String(d.j.result.url || `https://${name}.pages.dev`), projectUrl: `https://${name}.pages.dev`, uploaded: missing.length, reused: hashes.length - missing.length };
}

export async function setEnvVars(c: PagesCfg, name: string, vars: Record<string, string | null>): Promise<void> {
  const env: Record<string, unknown> = {}; for (const [k, v] of Object.entries(vars)) env[k] = v === null ? null : { type: "secret_text", value: v };
  const r = await call(c, `/accounts/${c.accountId}/pages/projects/${name}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deployment_configs: { production: { env_vars: env }, preview: { env_vars: env } } }) });
  if (!r.ok) throw new Error("cloudflare_env_failed");
}
export async function addDomain(c: PagesCfg, name: string, domain: string): Promise<void> {
  const r = await call(c, `/accounts/${c.accountId}/pages/projects/${name}/domains`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: domain }) });
  if (!r.ok) throw new Error("cloudflare_domain_failed");
}
export async function rollback(c: PagesCfg, name: string, deploymentId: string): Promise<void> {
  const r = await call(c, `/accounts/${c.accountId}/pages/projects/${name}/deployments/${deploymentId}/rollback`, { method: "POST" });
  if (!r.ok) throw new Error("cloudflare_rollback_failed");
}
export const isDomain = (d: string) => /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d) && !d.endsWith(".pages.dev");
export const isEnvKey = (k: string) => /^[A-Z][A-Z0-9_]{1,63}$/.test(k);
