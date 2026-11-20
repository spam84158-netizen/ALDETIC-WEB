// Actions financières réservées aux administrateurs. Chaque action passe par une fonction SQL atomique ; rien n'est « marqué payé » sans référence réelle.
export interface AdminDeps {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
  getWithdrawal: (id: string) => Promise<{ id: string; user_id: string; status: string; method: string; amount_minor: number; fee_minor: number; currency: string; destination: any } | null>;
  setWithdrawalProviderRef: (id: string, ref: string) => Promise<void>;
  transfer: ((a: { reference: string; amount: number; currency: string; method: string; phone: string; name: string }) => Promise<{ providerRef: string }>) | null;
}
export type Result = { status: number; body: Record<string, unknown> };
const UUID = /^[0-9a-f-]{36}$/;
const ok = (b: Record<string, unknown> = {}): Result => ({ status: 200, body: { ok: true, ...b } });
const bad = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({ status, body: { error, ...extra } });

export async function adminAction(deps: AdminDeps, adminId: string, b: any): Promise<Result> {
  const a = String(b?.action ?? "");
  if (a === "confirm_bank_deposit") {
    const ref = String(b.internal_ref ?? ""), bank = String(b.bank_reference ?? "").trim();
    if (!/^DEP-[A-Z0-9]{8,32}$/.test(ref)) return bad(400, "invalid_reference");
    if (bank.length < 4) return bad(400, "bank_reference_required");
    if (!Number.isInteger(b.amount) || b.amount <= 0 || !/^[A-Z]{3}$/.test(String(b.currency))) return bad(400, "invalid_amount");
    const r = await deps.rpc("deposit_confirm", { p_internal_ref: ref, p_provider_ref: "bank:" + bank.slice(0, 80), p_amount: b.amount, p_currency: b.currency, p_payload: { confirmed_by: adminId, source: "manual_bank_check" } });
    if (r.error) return bad(500, "internal");
    return r.data?.ok ? ok({ already: !!r.data.already }) : bad(409, String(r.data?.reason ?? "rejected"));
  }
  const id = String(b?.id ?? "");
  if (!UUID.test(id)) return bad(400, "invalid_id");
  const transition = async (to: string, reason: string | null, providerRef: string | null) => {
    const r = await deps.rpc("withdrawal_transition", { p_id: id, p_to: to, p_admin: adminId, p_reason: reason, p_provider_ref: providerRef });
    if (r.error) return bad(500, "internal");
    return r.data?.ok ? ok() : bad(409, String(r.data?.reason ?? "rejected"));
  };
  if (a === "approve_withdrawal") return transition("approved", null, null);
  if (a === "reject_withdrawal") { const reason = String(b.reason ?? "").trim(); return reason.length < 3 ? bad(400, "reason_required") : transition("rejected", reason.slice(0, 300), null); }
  if (a === "pay_withdrawal") {
    const w = await deps.getWithdrawal(id);
    if (!w) return bad(404, "unknown_withdrawal");
    if (w.status !== "approved") return bad(409, "invalid_transition", { from: w.status });
    if (b.mode === "manual") {
      const ref = String(b.provider_ref ?? "").trim();
      return ref.length < 4 ? bad(400, "provider_ref_required") : transition("paid", null, ref.slice(0, 120));
    }
    if (b.mode === "auto") {
      if (!deps.transfer) return bad(503, "provider_not_configured");
      const phone = String(w.destination?.phone ?? "");
      if (!phone) return bad(400, "auto_payout_needs_mobile_destination");
      const net = w.amount_minor - w.fee_minor;
      try {
        const t = await deps.transfer({ reference: "WD-" + w.id, amount: net, currency: w.currency, method: w.method, phone, name: String(w.destination?.name ?? "") });
        await deps.setWithdrawalProviderRef(w.id, t.providerRef);
        return ok({ pending_confirmation: true });   // « payé » uniquement quand le prestataire le confirme (webhook revérifié)
      } catch (_) { return bad(502, "provider_error"); }
    }
    return bad(400, "invalid_mode");
  }
  return bad(400, "unknown_action");
}
