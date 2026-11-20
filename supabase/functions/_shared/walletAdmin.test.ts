import test from "node:test";
import assert from "node:assert/strict";
import { adminAction } from "./walletAdmin.ts";

const W = "123e4567-e89b-12d3-a456-426614174000";
const mk = (over: any = {}, w: any = { id: W, user_id: "u", status: "approved", method: "wave", amount_minor: 5000, fee_minor: 100, currency: "XOF", destination: { phone: "+2250700000001" } }) => {
  const calls: any[] = []; const refs: string[] = [];
  return { calls, refs, deps: { rpc: async (n: string, a: any) => { calls.push([n, a]); return { data: { ok: true }, error: null }; }, getWithdrawal: async () => w,
    setWithdrawalProviderRef: async (_: string, r: string) => { refs.push(r); }, transfer: async (a: any) => { calls.push(["transfer", a]); return { providerRef: "T1" }; }, ...over } };
};
test("dépôt par virement : confirmation seulement avec référence bancaire réelle et montant exact", async () => {
  const m = mk(); const r = await adminAction(m.deps, "adm", { action: "confirm_bank_deposit", internal_ref: "DEP-ABCDEF1234567890", bank_reference: "VIR-2026-1188", amount: 10000, currency: "XOF" });
  assert.equal(r.status, 200); assert.equal(m.calls[0][0], "deposit_confirm"); assert.equal(m.calls[0][1].p_provider_ref, "bank:VIR-2026-1188");
  for (const bad of [{ bank_reference: "" }, { bank_reference: "abc" }]) assert.equal((await adminAction(mk().deps, "adm", { action: "confirm_bank_deposit", internal_ref: "DEP-ABCDEF1234567890", amount: 1, currency: "XOF", ...bad })).status, 400);
  assert.equal((await adminAction(mk().deps, "adm", { action: "confirm_bank_deposit", internal_ref: "x", bank_reference: "VIR-1234", amount: 1, currency: "XOF" })).status, 400);
  assert.equal((await adminAction(mk().deps, "adm", { action: "confirm_bank_deposit", internal_ref: "DEP-ABCDEF1234567890", bank_reference: "VIR-1234", amount: 10.5, currency: "XOF" })).status, 400);
});
test("refus d'un retrait : motif obligatoire ; approbation transmise avec l'identité de l'admin", async () => {
  assert.equal((await adminAction(mk().deps, "adm", { action: "reject_withdrawal", id: W, reason: " " })).status, 400);
  const m = mk(); assert.equal((await adminAction(m.deps, "adm", { action: "reject_withdrawal", id: W, reason: "Coordonnées invalides" })).status, 200); assert.equal(m.calls[0][1].p_to, "rejected");
  const n = mk(); await adminAction(n.deps, "adm-42", { action: "approve_withdrawal", id: W }); assert.equal(n.calls[0][1].p_admin, "adm-42");
});
test("paiement manuel : référence réelle obligatoire ; pas de paiement si non approuvé", async () => {
  assert.equal((await adminAction(mk().deps, "adm", { action: "pay_withdrawal", id: W, mode: "manual", provider_ref: "" })).status, 400);
  const m = mk(); assert.equal((await adminAction(m.deps, "adm", { action: "pay_withdrawal", id: W, mode: "manual", provider_ref: "WAVE-TX-998" })).status, 200); assert.equal(m.calls[0][1].p_to, "paid");
  const x = mk({}, { id: W, status: "requested", method: "wave", amount_minor: 1, fee_minor: 0, currency: "XOF", destination: {} }); const r = await adminAction(x.deps, "adm", { action: "pay_withdrawal", id: W, mode: "manual", provider_ref: "WAVE-TX-998" });
  assert.equal(r.status, 409); assert.equal(x.calls.length, 0);
});
test("paiement automatique : montant NET transféré, référence WD-<id>, statut payé seulement après confirmation du prestataire", async () => {
  const m = mk(); const r = await adminAction(m.deps, "adm", { action: "pay_withdrawal", id: W, mode: "auto" });
  assert.deepEqual(r.body, { ok: true, pending_confirmation: true });
  const t = m.calls.find((c: any) => c[0] === "transfer")[1]; assert.equal(t.amount, 4900); assert.equal(t.reference, "WD-" + W);
  assert.ok(!m.calls.some((c: any) => c[0] === "withdrawal_transition"), "aucune transition « payé » avant le webhook"); assert.deepEqual(m.refs, ["T1"]);
});
test("paiement automatique : prestataire absent, erreur prestataire, destination bancaire", async () => {
  assert.equal((await adminAction(mk({ transfer: null }).deps, "adm", { action: "pay_withdrawal", id: W, mode: "auto" })).body.error, "provider_not_configured");
  const e = mk({ transfer: async () => { throw new Error("x"); } }); const r = await adminAction(e.deps, "adm", { action: "pay_withdrawal", id: W, mode: "auto" });
  assert.equal(r.status, 502); assert.ok(!e.calls.some((c: any) => c[0] === "withdrawal_transition"));
  const b = mk({}, { id: W, status: "approved", method: "bank_transfer", amount_minor: 5000, fee_minor: 0, currency: "XOF", destination: { iban: "FR76" } }); assert.equal((await adminAction(b.deps, "adm", { action: "pay_withdrawal", id: W, mode: "auto" })).status, 400);
});
test("entrées invalides : identifiant, action, mode", async () => {
  assert.equal((await adminAction(mk().deps, "adm", { action: "approve_withdrawal", id: "x" })).status, 400);
  assert.equal((await adminAction(mk().deps, "adm", { action: "drop_all", id: W })).status, 400);
  assert.equal((await adminAction(mk().deps, "adm", { action: "pay_withdrawal", id: W, mode: "autre" })).status, 400);
});
