// Frais et validation des coordonnées de retrait (calculés TOUJOURS côté serveur ; l'écran n'en fait qu'un aperçu).
export interface FeeCfg { percent: number; min: number }
export type Method = "orange_money" | "mtn_momo" | "moov_money" | "wave" | "card" | "bank_transfer";
export const METHODS: Method[] = ["orange_money", "mtn_momo", "moov_money", "wave", "card", "bank_transfer"];

export function computeFee(amount: number, cfg: FeeCfg): { fee: number; net: number } {
  const pct = Math.max(0, Number(cfg?.percent) || 0), min = Math.max(0, Math.floor(Number(cfg?.min) || 0));
  const fee = Math.max(Math.ceil((amount * pct) / 100), min);
  return { fee, net: amount - fee };
}
export function isAmount(n: unknown): n is number { return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 100_000_000; }

// Renvoie null si valide, sinon un code d'erreur.
export function validateDestination(method: Method, d: any): string | null {
  if (!d || typeof d !== "object") return "invalid_destination";
  if (method === "card") return "withdraw_not_supported";
  if (method === "bank_transfer") {
    const iban = String(d.iban || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return "invalid_iban";
    if (String(d.holder || "").trim().length < 2) return "invalid_holder";
    return null;
  }
  return /^\+[0-9]{7,15}$/.test(String(d.phone || "")) ? null : "invalid_phone";
}
export function cleanDestination(method: Method, d: any) {
  if (method === "bank_transfer") return { iban: String(d.iban).replace(/\s+/g, "").toUpperCase(), holder: String(d.holder).trim().slice(0, 120), bic: String(d.bic || "").trim().toUpperCase().slice(0, 11) };
  return { phone: String(d.phone) };
}
