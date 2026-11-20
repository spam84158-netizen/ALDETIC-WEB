// Traitement des notifications du prestataire. Règle : le webhook ne sert que de déclencheur ; tout est revérifié chez le prestataire.
export interface RpcResult { data: any; error: { message: string } | null }
export interface PayDeps {
  verifyCharge: (txRef: string) => Promise<any>;
  verifyTransfer: (id: string) => Promise<any>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  markDepositFailed: (internalRef: string) => Promise<void>;
}
export interface Handled { status: number; outcome: string }

export async function handleCharge(deps: PayDeps, body: any): Promise<Handled> {
  const txRef = String(body?.data?.tx_ref ?? body?.txRef ?? "");
  if (!/^DEP-[A-Z0-9]{8,32}$/.test(txRef)) return { status: 200, outcome: "ignored" };
  const v = await deps.verifyCharge(txRef).catch(() => ({ ok: false }));
  if (!v.ok) return { status: 502, outcome: "verify_failed" };            // le prestataire réessaiera
  if (v.txRef !== txRef) return { status: 200, outcome: "reference_mismatch" };
  if (!v.successful) { await deps.markDepositFailed(txRef).catch(() => {}); return { status: 200, outcome: "not_successful" }; }
  const r = await deps.rpc("deposit_confirm", { p_internal_ref: txRef, p_provider_ref: v.id, p_amount: v.amount, p_currency: v.currency, p_payload: v.raw ?? {} });
  if (r.error) return { status: 500, outcome: "db_error" };
  if (r.data?.ok) return { status: 200, outcome: r.data.already ? "already_confirmed" : "confirmed" };
  return { status: 200, outcome: String(r.data?.reason ?? "rejected") };
}

export async function handleTransfer(deps: PayDeps, body: any): Promise<Handled> {
  const id = String(body?.data?.id ?? body?.transfer?.id ?? "");
  if (!id) return { status: 200, outcome: "ignored" };
  const t = await deps.verifyTransfer(id).catch(() => ({ ok: false }));
  if (!t.ok) return { status: 502, outcome: "verify_failed" };
  const m = /^WD-([0-9a-f-]{36})$/.exec(t.reference);
  if (!m) return { status: 200, outcome: "ignored" };
  const to = t.status === "SUCCESSFUL" ? "paid" : t.status === "FAILED" ? "failed" : null;
  if (!to) return { status: 200, outcome: "pending" };
  const r = await deps.rpc("withdrawal_transition", { p_id: m[1], p_to: to, p_admin: null, p_reason: to === "failed" ? "provider_failed" : null, p_provider_ref: t.id });
  if (r.error) return { status: 500, outcome: "db_error" };
  return { status: 200, outcome: r.data?.ok ? to : String(r.data?.reason ?? "ignored") };
}
