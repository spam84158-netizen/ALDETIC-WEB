import test from "node:test";
import assert from "node:assert/strict";
import { computeFee, validateDestination, isAmount, cleanDestination } from "./fees.ts";

test("frais : pourcentage arrondi au supérieur, minimum appliqué, net = montant − frais", () => {
  assert.deepEqual(computeFee(10000, { percent: 2, min: 0 }), { fee: 200, net: 9800 });
  assert.deepEqual(computeFee(1001, { percent: 1.5, min: 0 }), { fee: 16, net: 985 });
  assert.deepEqual(computeFee(1000, { percent: 1, min: 100 }), { fee: 100, net: 900 });
  assert.deepEqual(computeFee(5000, { percent: 0, min: 0 }), { fee: 0, net: 5000 });
});
test("frais : configuration invalide ne produit jamais de frais négatifs", () => {
  assert.equal(computeFee(1000, { percent: -5, min: -10 } as any).fee, 0);
  assert.equal(computeFee(1000, undefined as any).fee, 0);
});
test("montants : entiers positifs uniquement", () => {
  assert.ok(isAmount(1000)); assert.ok(!isAmount(10.5)); assert.ok(!isAmount(-1)); assert.ok(!isAmount("1000")); assert.ok(!isAmount(0)); assert.ok(!isAmount(1e12));
});
test("destinations : mobile money, virement, carte non prise en charge", () => {
  assert.equal(validateDestination("wave", { phone: "+2250700000001" }), null);
  assert.equal(validateDestination("orange_money", { phone: "0700000001" }), "invalid_phone");
  assert.equal(validateDestination("bank_transfer", { iban: "FR76 3000 6000 0112 3456 7890 189", holder: "Awa Koné" }), null);
  assert.equal(validateDestination("bank_transfer", { iban: "123", holder: "Awa" }), "invalid_iban");
  assert.equal(validateDestination("bank_transfer", { iban: "FR7630006000011234567890189", holder: "" }), "invalid_holder");
  assert.equal(validateDestination("card", { phone: "+2250700000001" }), "withdraw_not_supported");
  assert.equal(validateDestination("wave", null), "invalid_destination");
});
test("destination nettoyée : IBAN sans espaces en majuscules", () => {
  assert.equal((cleanDestination("bank_transfer", { iban: "fr76 3000", holder: " Awa " }) as any).iban, "FR763000");
});
