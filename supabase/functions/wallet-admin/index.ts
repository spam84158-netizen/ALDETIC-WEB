// Edge Function wallet-admin — actions financières des administrateurs (owner/admin). Vérification du rôle côté serveur.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminAction } from "../_shared/walletAdmin.ts";
import { createTransfer } from "../_shared/flutterwave.ts";
import type { Method } from "../_shared/fees.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (s: number, b: Record<string, unknown>) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

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
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!(roles ?? []).some((r: any) => ["owner", "admin"].includes(r.role))) return json(403, { error: "forbidden" });
    const body = await req.json().catch(() => ({}));
    const flwKey = Deno.env.get("FLW_SECRET_KEY");
    const deps = {
      rpc: async (name: string, args: Record<string, unknown>) => { const { data, error } = await admin.rpc(name, args); return { data, error: error ? { message: error.message } : null }; },
      getWithdrawal: async (id: string) => (await admin.from("withdrawals").select("id, user_id, status, method, amount_minor, fee_minor, currency, destination").eq("id", id).maybeSingle()).data,
      setWithdrawalProviderRef: async (id: string, ref: string) => { await admin.from("withdrawals").update({ provider_ref: ref }).eq("id", id); },
      transfer: flwKey ? async (a: { reference: string; amount: number; currency: string; method: string; phone: string; name: string }) => createTransfer({ secretKey: flwKey, fetch: (x: string, i: any) => fetch(x, i) }, { ...a, method: a.method as Method }) : null,
    };
    const r = await adminAction(deps, u.user.id, body);
    return json(r.status, r.body);
  } catch (e) { console.error("wallet-admin", String(e)); return json(500, { error: "internal" }); }
});
