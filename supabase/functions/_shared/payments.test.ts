import test from "node:test";
import assert from "node:assert/strict";
import { handleCharge, handleTransfer } from "./payments.ts";

const mk = (over: any = {}) => { const calls: any[] = []; const failed: string[] = [];
  const deps = { verifyCharge: async () => ({ ok: true, successful: true, txRef: "DEP-ABCDEF1234567890", id: "99", amount: 5000, currency: "XOF", raw: { status: "successful" } }),
    verifyTransfer: async () => ({ ok: true, status: "SUCCESSFUL", reference: "WD-123e4567-e89b-12d3-a456-426614174000", id: "77" }),
    rpc: async (n: string, a: any) => { calls.push([n, a]); return { data: { ok: true }, error: null }; },
    markDepositFailed: async (r: string) => { failed.push(r); }, ...over };
  return { deps, calls, failed }; };
const hook = { data: { tx_ref: "DEP-ABCDEF1234567890", status: "successful", amount: 1 } };

test("paiement réussi : crédit via deposit_confirm avec les valeurs VÉRIFIÉES (pas celles du webhook)", async () => {
  const m = mk(); const r = await handleCharge(m.deps, hook);
  assert.deepEqual(r, { status: 200, outcome: "confirmed" });
  assert.equal(m.calls[0][0], "deposit_confirm"); assert.equal(m.calls[0][1].p_amount, 5000); assert.equal(m.calls[0][1].p_provider_ref, "99");
});
test("webhook falsifié (montant ou statut) : seule la vérification chez le prestataire compte", async () => {
  const m = mk({ verifyCharge: async () => ({ ok: true, successful: false, txRef: "DEP-ABCDEF1234567890" }) });
  const r = await handleCharge(m.deps, { data: { tx_ref: "DEP-ABCDEF1234567890", status: "successful", amount: 999999 } });
  assert.equal(r.outcome, "not_successful"); assert.equal(m.calls.length, 0); assert.deepEqual(m.failed, ["DEP-ABCDEF1234567890"]);
});
test("vérification impossible : 502 pour que le prestataire réessaie, aucun crédit", async () => {
  const m = mk({ verifyCharge: async () => { throw new Error("réseau"); } }); const r = await handleCharge(m.deps, hook);
  assert.equal(r.status, 502); assert.equal(m.calls.length, 0);
});
test("référence qui ne correspond pas à celle vérifiée : aucun crédit", async () => {
  const m = mk({ verifyCharge: async () => ({ ok: true, successful: true, txRef: "DEP-AUTREREFERENCE12", id: "1", amount: 1, currency: "XOF" }) });
  assert.equal((await handleCharge(m.deps, hook)).outcome, "reference_mismatch"); assert.equal(m.calls.length, 0);
});
test("référence étrangère ou mal formée : ignorée sans appel", async () => {
  const m = mk(); assert.equal((await handleCharge(m.deps, { data: { tx_ref: "AUTRE-123" } })).outcome, "ignored"); assert.equal((await handleCharge(m.deps, {})).outcome, "ignored");
  assert.equal((await handleCharge(m.deps, { data: { tx_ref: "DEP-1'; drop table x;--" } })).outcome, "ignored"); assert.equal(m.calls.length, 0);
});
test("rejeu du même webhook : réponse idempotente", async () => {
  const m = mk({ rpc: async () => ({ data: { ok: true, already: true }, error: null }) }); assert.equal((await handleCharge(m.deps, hook)).outcome, "already_confirmed");
});
test("montant ou devise différents côté base : refus rapporté, pas d'erreur serveur", async () => {
  const m = mk({ rpc: async () => ({ data: { ok: false, reason: "amount_or_currency_mismatch" }, error: null }) }); const r = await handleCharge(m.deps, hook);
  assert.deepEqual(r, { status: 200, outcome: "amount_or_currency_mismatch" });
});
test("erreur base de données : 500 pour nouvel essai", async () => {
  const m = mk({ rpc: async () => ({ data: null, error: { message: "x" } }) }); assert.equal((await handleCharge(m.deps, hook)).status, 500);
});
test("transfert réussi => retrait payé avec la référence du prestataire ; échoué => libération ; en cours => rien", async () => {
  const a = mk(); const r = await handleTransfer(a.deps, { data: { id: 77 } });
  assert.equal(r.outcome, "paid"); assert.deepEqual(a.calls[0], ["withdrawal_transition", { p_id: "123e4567-e89b-12d3-a456-426614174000", p_to: "paid", p_admin: null, p_reason: null, p_provider_ref: "77" }]);
  const f = mk({ verifyTransfer: async () => ({ ok: true, status: "FAILED", reference: "WD-123e4567-e89b-12d3-a456-426614174000", id: "77" }) });
  assert.equal((await handleTransfer(f.deps, { data: { id: 77 } })).outcome, "failed"); assert.equal(f.calls[0][1].p_to, "failed");
  const p = mk({ verifyTransfer: async () => ({ ok: true, status: "NEW", reference: "WD-123e4567-e89b-12d3-a456-426614174000", id: "77" }) });
  assert.equal((await handleTransfer(p.deps, { data: { id: 77 } })).outcome, "pending"); assert.equal(p.calls.length, 0);
});
test("transfert : référence inconnue ignorée ; retrait non approuvé => transition refusée sans erreur", async () => {
  const x = mk({ verifyTransfer: async () => ({ ok: true, status: "SUCCESSFUL", reference: "AUTRE", id: "1" }) }); assert.equal((await handleTransfer(x.deps, { data: { id: 1 } })).outcome, "ignored");
  const y = mk({ rpc: async () => ({ data: { ok: false, reason: "invalid_transition" }, error: null }) }); assert.equal((await handleTransfer(y.deps, { data: { id: 77 } })).outcome, "invalid_transition");
});
