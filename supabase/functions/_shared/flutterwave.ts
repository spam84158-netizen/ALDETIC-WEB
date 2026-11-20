// Adaptateur Flutterwave (API v3). Aucun appel réseau direct : fetch est injecté (tests et Edge Functions).
// Valeurs à confirmer avec les clés de TEST au premier branchement : mapPayoutBank (MTN), forme exacte des réponses.
import type { Method } from "./fees.ts";

export interface FlwCfg { secretKey: string; baseUrl?: string; fetch: (url: string, init: any) => Promise<any> }
const base = (c: FlwCfg) => (c.baseUrl || "https://api.flutterwave.com/v3").replace(/\/$/, "");
const headers = (c: FlwCfg) => ({ Authorization: `Bearer ${c.secretKey}`, "Content-Type": "application/json" });

// Encaissement : page de paiement hébergée par Flutterwave (mobile money francophone et cartes).
export function paymentOptions(method: Method): string {
  if (method === "card") return "card";
  if (method === "bank_transfer") return "banktransfer";
  return "mobilemoneyfrancophone";
}
export async function createCheckout(c: FlwCfg, a: { txRef: string; amount: number; currency: string; method: Method; email: string; name: string; redirectUrl: string }) {
  const res = await c.fetch(`${base(c)}/payments`, { method: "POST", headers: headers(c), body: JSON.stringify({
    tx_ref: a.txRef, amount: a.amount, currency: a.currency, redirect_url: a.redirectUrl, payment_options: paymentOptions(a.method),
    customer: { email: a.email, name: a.name || "Membre ALDETIC" }, customizations: { title: "ALDETIC FRONTIERS LTD" } }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.status !== "success" || !j?.data?.link) throw new Error("flutterwave_checkout_failed");
  return { link: String(j.data.link) };
}

// Vérification serveur à serveur : on ne fait JAMAIS confiance au contenu du webhook.
export async function verifyByReference(c: FlwCfg, txRef: string) {
  const res = await c.fetch(`${base(c)}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, { method: "GET", headers: headers(c) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.status !== "success" || !j?.data) return { ok: false as const, reason: "verify_failed" };
  const d = j.data;
  return { ok: true as const, successful: d.status === "successful", id: String(d.id), txRef: String(d.tx_ref), amount: Number(d.amount), currency: String(d.currency), raw: { id: d.id, status: d.status, payment_type: d.payment_type, processor_response: d.processor_response } };
}

// Signature du webhook : en-tête « verif-hash » égal au secret défini dans le tableau de bord (comparaison à temps constant).
export function verifyWebhookHash(received: string | null | undefined, secret: string | undefined): boolean {
  if (!received || !secret || received.length !== secret.length) return false;
  let diff = 0; for (let i = 0; i < secret.length; i++) diff |= received.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// Retrait mobile money (transfert) : codes opérateur de la documentation Flutterwave pour la Côte d'Ivoire.
export function mapPayoutBank(method: Method): string | null {
  return ({ orange_money: "orangemoney", moov_money: "Moov", wave: "WAVE", mtn_momo: "FMM" } as Record<string, string>)[method] ?? null;
}
export async function createTransfer(c: FlwCfg, a: { reference: string; amount: number; currency: string; method: Method; phone: string; name: string }) {
  const bank = mapPayoutBank(a.method);
  if (!bank) throw new Error("payout_method_not_supported");
  const res = await c.fetch(`${base(c)}/transfers`, { method: "POST", headers: headers(c), body: JSON.stringify({
    account_bank: bank, account_number: a.phone.replace(/^\+/, ""), amount: a.amount, currency: a.currency, reference: a.reference,
    narration: "Retrait ALDETIC", beneficiary_name: a.name || "Membre ALDETIC" }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.status !== "success") throw new Error("flutterwave_transfer_failed");
  return { providerRef: String(j.data?.id ?? ""), status: String(j.data?.status ?? "NEW") };
}

// Statut d'un transfert, relu chez le prestataire (jamais déduit du contenu d'un webhook).
export async function verifyTransfer(c: FlwCfg, id: string) {
  const res = await c.fetch(`${base(c)}/transfers/${encodeURIComponent(id)}`, { method: "GET", headers: headers(c) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.status !== "success" || !j?.data) return { ok: false as const };
  return { ok: true as const, status: String(j.data.status).toUpperCase(), reference: String(j.data.reference ?? ""), id: String(j.data.id) };
}
