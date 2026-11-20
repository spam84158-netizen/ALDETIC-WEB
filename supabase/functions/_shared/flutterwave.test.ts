import test from "node:test";
import assert from "node:assert/strict";
import { createCheckout, verifyByReference, verifyWebhookHash, createTransfer, mapPayoutBank, paymentOptions } from "./flutterwave.ts";

const res = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const mk = (handler: (url: string, init: any) => any) => { const calls: any[] = []; return { calls, cfg: { secretKey: "FLWSECK_TEST-SECRET", fetch: async (u: string, i: any) => { calls.push({ u, i }); return handler(u, i); } } }; };

test("checkout : requête correcte (référence, montant entier XOF, options mobile money) et lien renvoyé", async () => {
  const m = mk(() => res(200, { status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/abc" } }));
  const r = await createCheckout(m.cfg, { txRef: "DEP-1", amount: 5000, currency: "XOF", method: "wave", email: "a@b.co", name: "Awa", redirectUrl: "https://x/retour" });
  assert.equal(r.link, "https://checkout.flutterwave.com/v3/hosted/pay/abc");
  const body = JSON.parse(m.calls[0].i.body);
  assert.equal(body.tx_ref, "DEP-1"); assert.equal(body.amount, 5000); assert.equal(body.currency, "XOF"); assert.equal(body.payment_options, "mobilemoneyfrancophone");
  assert.equal(m.calls[0].i.headers.Authorization, "Bearer FLWSECK_TEST-SECRET");
  assert.ok(m.calls[0].u.endsWith("/payments"));
});
test("checkout : carte => option card ; refus du prestataire => erreur", async () => {
  assert.equal(paymentOptions("card"), "card"); assert.equal(paymentOptions("orange_money"), "mobilemoneyfrancophone");
  const m = mk(() => res(400, { status: "error" }));
  await assert.rejects(() => createCheckout(m.cfg, { txRef: "D", amount: 1, currency: "XOF", method: "card", email: "a@b.co", name: "", redirectUrl: "https://x" }), /checkout_failed/);
});
test("vérification : transaction réussie renvoie montant, devise, identifiant", async () => {
  const m = mk(() => res(200, { status: "success", data: { id: 998877, tx_ref: "DEP-1", status: "successful", amount: 5000, currency: "XOF", payment_type: "mobilemoneyfranco", secret_hash: "NE-DOIT-PAS-FUIR" } }));
  const v: any = await verifyByReference(m.cfg, "DEP-1");
  assert.ok(v.ok && v.successful); assert.equal(v.id, "998877"); assert.equal(v.amount, 5000); assert.equal(v.currency, "XOF");
  assert.ok(!JSON.stringify(v).includes("NE-DOIT-PAS-FUIR"), "seuls des champs choisis sont conservés");
  assert.ok(m.calls[0].u.includes("tx_ref=DEP-1"));
});
test("vérification : transaction échouée ou introuvable n'est jamais « réussie »", async () => {
  const a: any = await verifyByReference(mk(() => res(200, { status: "success", data: { id: 1, tx_ref: "D", status: "failed", amount: 5, currency: "XOF" } })).cfg, "D");
  assert.ok(a.ok && !a.successful);
  const b: any = await verifyByReference(mk(() => res(404, { status: "error" })).cfg, "D"); assert.ok(!b.ok);
  const c: any = await verifyByReference(mk(() => { throw new Error("x"); }).cfg, "D").catch(() => ({ ok: false })); assert.ok(!c.ok);
});
test("signature du webhook : exacte uniquement", () => {
  assert.ok(verifyWebhookHash("secret123", "secret123"));
  assert.ok(!verifyWebhookHash("secret124", "secret123")); assert.ok(!verifyWebhookHash("", "secret123")); assert.ok(!verifyWebhookHash(null, "secret123")); assert.ok(!verifyWebhookHash("secret123", undefined)); assert.ok(!verifyWebhookHash("secret1234", "secret123"));
});
test("transfert : codes opérateur, numéro sans +, montant entier, carte non supportée", async () => {
  assert.equal(mapPayoutBank("orange_money"), "orangemoney"); assert.equal(mapPayoutBank("wave"), "WAVE"); assert.equal(mapPayoutBank("moov_money"), "Moov"); assert.equal(mapPayoutBank("card"), null);
  const m = mk(() => res(200, { status: "success", data: { id: 55, status: "NEW" } }));
  const r = await createTransfer(m.cfg, { reference: "WD-1", amount: 4900, currency: "XOF", method: "wave", phone: "+33xxxxxx", name: "Awa" });
  assert.equal(r.providerRef, "55"); const b = JSON.parse(m.calls[0].i.body);
  assert.equal(b.account_number, "33xxxxxxx"); assert.equal(b.account_bank, "WAVE"); assert.equal(b.reference, "WD-1"); assert.equal(b.amount, 4900);
  await assert.rejects(() => createTransfer(m.cfg, { reference: "x", amount: 1, currency: "XOF", method: "card", phone: "+33xxxxxx", name: "" }), /not_supported/);
});
