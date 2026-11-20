// ALDETIC — OTP téléphonique en mode simulation gratuit.
// Le code est créé côté serveur, stocké sous forme hachée et vérifié par PostgreSQL.
// IMPORTANT : le code est retourné à l'utilisateur pour les tests ; aucun SMS n'est envoyé.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" } });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateCode(): string {
  const a = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1000000) * 1000000;
  do { crypto.getRandomValues(a); } while (a[0] >= limit);
  return String(a[0] % 1000000).padStart(6, "0");
}

export const hashCode = (secret: string, userId: string, code: string) => sha256Hex(`${secret}:${userId}:${code}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json(503, { error: "server_not_configured" });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "auth_required" });
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u?.user) return json(401, { error: "invalid_session" });
    const uid = u.user.id;
    const body = await req.json().catch(() => ({}));

    if (body.action === "send") {
      const phone = String(body.phone || "");
      if (!/^\+[0-9]{7,15}$/.test(phone)) return json(400, { error: "invalid_phone" });
      // Délai demandé : le code n'est créé et révélé qu'après 3 secondes.
      await sleep(3000);
      const code = generateCode();
      const hash = await hashCode(key, uid, code);
      const { data, error } = await admin.rpc("phone_otp_issue", {
        p_user: uid, p_phone: phone, p_hash: hash, p_ttl_seconds: 600,
      });
      if (error) { console.error("issue", error.message); return json(500, { error: "internal" }); }
      if (!data?.ok) return json(data?.reason === "rate_limited" || data?.reason === "too_soon" ? 429 : 409, { error: data?.reason });
      // Le code est volontairement visible uniquement parce que ce flux est une simulation.
      return json(200, { ok: true, mode: "simulation", demo_code: code, expires_in: 600, message: "Aucun SMS réel n'a été envoyé." });
    }

    if (body.action === "verify") {
      const code = String(body.code || "");
      if (!/^[0-9]{6}$/.test(code)) return json(400, { error: "invalid_code_format" });
      const { data, error } = await admin.rpc("phone_otp_verify", { p_user: uid, p_hash: await hashCode(key, uid, code) });
      if (error) { console.error("verify", error.message); return json(500, { error: "internal" }); }
      if (!data?.ok) return json(400, { error: data?.reason, attempts_left: data?.attempts_left });
      return json(200, { ok: true, mode: "simulation" });
    }
    return json(400, { error: "unknown_action" });
  } catch (e) { console.error("phone-otp", String(e)); return json(500, { error: "internal" }); }
});
