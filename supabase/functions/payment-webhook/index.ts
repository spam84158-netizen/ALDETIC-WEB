// Edge Function payment-webhook — reçoit les notifications de Flutterwave.
// Secrets : FLW_SECRET_KEY, FLW_WEBHOOK_HASH (le même texte que « Secret hash » du tableau de bord Flutterwave).
// Sécurité : signature obligatoire, puis revérification de la transaction chez le prestataire avant tout crédit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyByReference, verifyTransfer, verifyWebhookHash } from "../_shared/flutterwave.ts";
import { handleCharge, handleTransfer } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const secret = Deno.env.get("FLW_SECRET_KEY"), hash = Deno.env.get("FLW_WEBHOOK_HASH"), url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !hash || !url || !key) return new Response("server_not_configured", { status: 503 });
  if (!verifyWebhookHash(req.headers.get("verif-hash"), hash)) return new Response("invalid_signature", { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return new Response("bad_request", { status: 400 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const flw = { secretKey: secret, fetch: (u: string, i: any) => fetch(u, i) };
  const deps = {
    verifyCharge: (ref: string) => verifyByReference(flw, ref),
    verifyTransfer: (id: string) => verifyTransfer(flw, id),
    rpc: async (name: string, args: Record<string, unknown>) => { const { data, error } = await admin.rpc(name, args); return { data, error: error ? { message: error.message } : null }; },
    markDepositFailed: async (ref: string) => { await admin.from("deposits").update({ status: "failed", reject_reason: "provider_not_successful" }).eq("internal_ref", ref).eq("status", "pending"); },
  };
  const event = String(body.event ?? body["event.type"] ?? "");
  const r = event.startsWith("transfer") ? await handleTransfer(deps, body) : await handleCharge(deps, body);
  console.log("payment-webhook", event, r.outcome);
  return new Response(JSON.stringify({ outcome: r.outcome }), { status: r.status, headers: { "Content-Type": "application/json" } });
});
