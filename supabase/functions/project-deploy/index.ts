// Edge Function project-deploy — publication d'un projet sur Cloudflare Pages, variables, domaines, restauration.
// Secrets : CLOUDFLARE_API_TOKEN (permission Account · Cloudflare Pages · Edit), CLOUDFLARE_ACCOUNT_ID.
import { createClient } from "npm:@supabase/supabase-js@2";
import { blake3 } from "npm:@noble/hashes@1/blake3";
import { bytesToHex, utf8ToBytes } from "npm:@noble/hashes@1/utils";
import { deploy, projectName, setEnvVars, addDomain, rollback, isDomain, isEnvKey } from "../_shared/pages.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (s: number, b: Record<string, unknown>) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const CODES: Record<string, number> = { index_html_required: 400, no_files: 400, too_many_files: 400, invalid_path: 400, file_too_large: 400, site_too_large: 400 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), cf = Deno.env.get("CLOUDFLARE_API_TOKEN"), acc = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    if (!url || !key) return json(503, { error: "server_not_configured" });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!token) return json(401, { error: "auth_required" });
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u?.user) return json(401, { error: "invalid_session" });
    const uid = u.user.id;
    const { data: prof } = await admin.from("profiles").select("phone_verified").eq("id", uid).maybeSingle();
    if (!prof?.phone_verified) return json(403, { error: "phone_not_verified" });
    if (!cf || !acc) return json(503, { error: "cloudflare_not_configured" });
    const c = { token: cf, accountId: acc, fetch: (a: string, b?: any) => fetch(a, b), blake3hex: (t: string) => bytesToHex(blake3(utf8ToBytes(t))) };

    const body = await req.json().catch(() => ({}));
    const { data: project } = await admin.from("projects").select("id, owner_id, slug, status").eq("id", String(body.project_id || "")).maybeSingle();
    if (!project || project.owner_id !== uid) return json(404, { error: "project_not_found" });
    const name = projectName(project.slug, project.id);

    if (body.action === "deploy") {
      if (project.status !== "active") return json(409, { error: "archived" });
      const { data: files } = await admin.from("project_files").select("path, content").eq("project_id", project.id);
      const { data: dep, error: de } = await admin.from("deployments").insert({ project_id: project.id, owner_id: uid, pages_project: name, files_count: (files ?? []).length }).select("id").single();
      if (de) return json(String(de.message).includes("rate_limited") ? 429 : 500, { error: String(de.message).includes("rate_limited") ? "rate_limited" : "internal" });
      const log = async (level: "info" | "error", message: string) => { await admin.from("deployment_logs").insert({ deployment_id: dep.id, level, message }); };
      try {
        const r = await deploy(c, name, files ?? [], log);
        await admin.from("deployments").update({ status: "ready", url: r.projectUrl, provider_ref: r.deploymentId, finished_at: new Date().toISOString() }).eq("id", dep.id);
        await admin.from("notifications").insert({ user_id: uid, type: "deployments", title: "Déploiement terminé", body: r.projectUrl, action_url: "cloud.html" });
        return json(200, { ok: true, id: dep.id, url: r.projectUrl });
      } catch (e) {
        const code = String((e as Error).message || "internal");
        await log("error", "Échec : " + code);
        await admin.from("deployments").update({ status: "failed", error: code, finished_at: new Date().toISOString() }).eq("id", dep.id);
        await admin.from("notifications").insert({ user_id: uid, type: "deployments", title: "Échec du déploiement", body: code, action_url: "cloud.html" });
        return json(CODES[code] ?? 502, { error: code, id: dep.id });
      }
    }
    if (body.action === "env_set") {
      const k = String(body.key || ""), v = String(body.value ?? "");
      if (!isEnvKey(k)) return json(400, { error: "invalid_key" }); if (v.length < 1 || v.length > 4000) return json(400, { error: "invalid_value" });
      try { await setEnvVars(c, name, { [k]: v }); } catch (_) { return json(502, { error: "cloudflare_env_failed" }); }
      await admin.from("project_env_keys").upsert({ project_id: project.id, key: k, updated_at: new Date().toISOString() });
      return json(200, { ok: true });
    }
    if (body.action === "env_delete") {
      const k = String(body.key || ""); if (!isEnvKey(k)) return json(400, { error: "invalid_key" });
      try { await setEnvVars(c, name, { [k]: null }); } catch (_) { return json(502, { error: "cloudflare_env_failed" }); }
      await admin.from("project_env_keys").delete().eq("project_id", project.id).eq("key", k);
      return json(200, { ok: true });
    }
    if (body.action === "domain_add") {
      const d = String(body.domain || "").toLowerCase().trim(); if (!isDomain(d)) return json(400, { error: "invalid_domain" });
      const { error: ie } = await admin.from("project_domains").insert({ project_id: project.id, domain: d }); if (ie) return json(409, { error: "domain_taken" });
      try { await addDomain(c, name, d); } catch (_) { await admin.from("project_domains").update({ status: "failed" }).eq("domain", d); return json(502, { error: "cloudflare_domain_failed" }); }
      return json(200, { ok: true, cname: `${name}.pages.dev` });
    }
    if (body.action === "rollback") {
      const { data: dep } = await admin.from("deployments").select("id, provider_ref, status").eq("id", String(body.deployment_id || "")).eq("project_id", project.id).maybeSingle();
      if (!dep || dep.status !== "ready" || !dep.provider_ref) return json(404, { error: "deployment_not_found" });
      try { await rollback(c, name, dep.provider_ref); } catch (_) { return json(502, { error: "cloudflare_rollback_failed" }); }
      return json(200, { ok: true });
    }
    return json(400, { error: "unknown_action" });
  } catch (e) { console.error("project-deploy", String(e)); return json(500, { error: "internal" }); }
});
