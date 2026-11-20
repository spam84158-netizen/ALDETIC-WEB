// Edge Function wallet-api — dépôts et retraits d'un membre. Les montants, frais et activations sont décidés ICI, jamais par le navigateur.
// Secrets : FLW_SECRET_KEY (et PAYMENT_PROVIDER=flutterwave) pour les paiements mobile money et cartes ; APP_URL (adresse du site, pour le retour de paiement).
// Le virement bancaire fonctionne sans prestataire : consignes configurées par l'administration, crédit après vérification réelle.
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeFee, isAmount, validateDestination, cleanDestination, METHODS } from "../_shared/fees.ts";
import type { Method } from "../_shared/fees.ts";
import { createCheckout } from "../_shared/flutterwave.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (s: number, b: Record<string, unknown>) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const CURRENCY = "XOF";

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
    const uid = u.user.id;
    const { data: prof } = await admin.from("profiles").select("phone_verified, display_name").eq("id", uid).maybeSingle();
    if (!prof?.phone_verified) return json(403, { error: "phone_not_verified" });

    const { data: rows } = await admin.from("platform_settings").select("key, value");
    const S: Record<string, any> = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value]));
    const enabled = S.payment_methods ?? {};
    const body = await req.json().catch(() => ({}));
    const method = String(body.method || "") as Method;
    if (!METHODS.includes(method)) return json(400, { error: "invalid_method" });
    if (enabled[method] !== true) return json(503, { error: "method_not_enabled" });
    const amount = body.amount;
    if (!isAmount(amount)) return json(400, { error: "invalid_amount" });

    if (body.action === "deposit") {
      if (amount < Number(S.deposit_min ?? 0)) return json(400, { error: "below_minimum", minimum: S.deposit_min });
      const flwKey = Deno.env.get("FLW_SECRET_KEY");
      const viaFlutterwave = method !== "bank_transfer";
      if (viaFlutterwave && (!flwKey || (Deno.env.get("PAYMENT_PROVIDER") || "flutterwave") !== "flutterwave")) return json(503, { error: "provider_not_configured" }); // avant toute création
      const { data: d, error } = await admin.rpc("deposit_create", { p_user: uid, p_provider: viaFlutterwave ? "flutterwave" : "bank", p_method: method, p_amount: amount, p_currency: CURRENCY, p_payer: {} });
      if (error || !d?.ok) { console.error("deposit_create", error?.message); return json(500, { error: "internal" }); }
      if (!viaFlutterwave) return json(200, { ok: true, internal_ref: d.internal_ref, instructions: S.bank_instructions ?? {} });
      try {
        const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
        const r = await createCheckout({ secretKey: flwKey!, fetch: (a: string, b: any) => fetch(a, b) }, { txRef: d.internal_ref, amount, currency: CURRENCY, method, email: u.user.email || "", name: prof.display_name || "", redirectUrl: `${appUrl}/portefeuille.html` });
        return json(200, { ok: true, internal_ref: d.internal_ref, checkout_url: r.link });
      } catch (e) {
        console.error("checkout", String(e));
        await admin.from("deposits").update({ status: "failed", reject_reason: "provider_error" }).eq("id", d.id);
        return json(502, { error: "provider_error" });
      }
    }

    if (body.action === "withdraw") {
      if (amount < Number(S.withdraw_min ?? 0)) return json(400, { error: "below_minimum", minimum: S.withdraw_min });
      const bad = validateDestination(method, body.destination);
      if (bad) return json(400, { error: bad });
      const { fee, net } = computeFee(amount, S.withdraw_fee ?? { percent: 0, min: 0 });
      if (net <= 0) return json(400, { error: "amount_too_low_for_fees" });
      const { data: w, error } = await admin.rpc("withdrawal_request", { p_user: uid, p_method: method, p_destination: cleanDestination(method, body.destination), p_amount: amount, p_fee: fee, p_currency: CURRENCY });
      if (error) { if (String(error.message).includes("insufficient_funds")) return json(409, { error: "insufficient_funds" }); console.error("withdrawal_request", error.message); return json(500, { error: "internal" }); }
      return json(200, { ok: true, id: w.id, fee, net });
    }
    return json(400, { error: "unknown_action" });
  } catch (e) { console.error("wallet-api", String(e)); return json(500, { error: "internal" }); }
});
