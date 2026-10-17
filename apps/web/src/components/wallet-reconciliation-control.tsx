"use client";

import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui";

type Preview = {
  accountId: string;
  accountName: string;
  accountType: "CASH" | "BANK" | "UPI" | "PROVIDER_WALLET" | "OWNER_CREDIT_CARD";
  accountNature: "ASSET" | "LIABILITY";
  systemBalance: number;
  payoutChargeRulesConfigured: boolean | null;
  hasOpenCashSession: boolean;
  lastReconciledAt: string | null;
};
const money = (n: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(n);

export function WalletReconciliationControl({
  accountId, onSaved,
}: { accountId: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [providerBalance, setProviderBalance] = useState("");
  const [confirmedCharges, setConfirmedCharges] = useState("0");
  const [statementReference, setStatementReference] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const external = Number(providerBalance);
  const fees = Number(confirmedCharges);
  const validTarget = /^\d+(?:\.\d{1,2})?$/.test(providerBalance.trim()) && Number.isFinite(external);
  const validFees = /^\d+(?:\.\d{1,2})?$/.test(confirmedCharges.trim()) && Number.isFinite(fees);
  const gapCents = preview && validTarget ? Math.round((external - preview.systemBalance) * 100) : 0;
  const feesCents = validFees ? Math.round(fees * 100) : 0;
  const residualCents = Math.abs(gapCents) - feesCents;
  const canApplyFee = preview?.accountType !== "CASH";
  const feeDirection = preview?.accountNature === "LIABILITY" ? gapCents > 0 : gapCents < 0;
  const canConfirm = preview && !preview.hasOpenCashSession && validTarget && validFees && gapCents !== 0
    && feesCents >= 0 && (canApplyFee ? feesCents <= (feeDirection ? Math.abs(gapCents) : 0) : feesCents === 0)
    && statementReference.trim().length >= 4 && reason.trim().length >= 10 && confirmed && !busy;

  async function start() {
    setOpen(true);setError("");setBusy(true);setPreview(null);
    setProviderBalance("");setConfirmedCharges("0");
    setStatementReference("");setReason("");setConfirmed(false);
    try {
      setPreview(await apiFetch<Preview>("/accounts/" + accountId + "/reconciliation"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load wallet balance");
    } finally { setBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canConfirm || !preview) return;
    setBusy(true);setError("");
    try {
      await apiFetch("/accounts/" + accountId + "/reconciliation", {
        method: "POST",
        body: JSON.stringify({
          expectedBalance: preview.systemBalance,
          providerBalance: external,
          confirmedCharges: fees,
          statementReference: statementReference.trim(),
          reason: reason.trim(),
          confirmed: true,
        }),
      });
      setOpen(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reconcile wallet");
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={start}
      className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold shadow-sm">
      Reconcile balance
    </button>
    {open ? <Modal open title="Reconcile account balance" description="Owner only · Verified external balance vs Cash Ledger"
      onClose={()=>{if(!busy)setOpen(false);}}>
      {preview ? <form onSubmit={save} className="space-y-4">
        <div className="rounded-xl bg-[var(--surface-soft)] p-3.5">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Current system {preview.accountNature === "LIABILITY" ? "outstanding" : "balance"} · {preview.accountName}</p>
          <p className="money mt-1 text-xl font-black">{money(preview.systemBalance)}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">From all posted account ledger movements, not the selected date filter.</p>
        </div>
        {preview.payoutChargeRulesConfigured === false ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          No current provider payout charge slabs are configured. Verify provider fees in Settings → Payment gateways for future payouts.
        </p> : null}
        {preview.hasOpenCashSession ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
          This cash drawer has an open session. Complete the session and any cash discrepancy process before reconciling.
        </p> : null}
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          First match missing {preview.accountType === "CASH" ? "cash handovers and session entries"
            : preview.accountType === "OWNER_CREDIT_CARD" ? "card payments, purchases and interest or fees"
            : "payouts, deposits, refunds, transfers and charges"} with supporting records.
          Never label an unexplained difference as a fee. A reconciliation posts a new audited entry today, without rewriting original transactions or closed sessions.
        </p>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold">{preview.accountType === "CASH" ? "Counted physical cash"
            : preview.accountType === "OWNER_CREDIT_CARD" ? "Verified outstanding / amount owed"
            : preview.accountType === "PROVIDER_WALLET" ? "Actual provider wallet balance"
            : "Actual bank / UPI balance"} (₹)</span>
          <input className="app-control" type="number" min="0" max="999999999999.99" step="0.01"
            inputMode="decimal" value={providerBalance} onChange={e=>{setProviderBalance(e.target.value);setConfirmed(false);}}
            placeholder={preview.accountType === "CASH" ? "Verified cash count" : "Actual balance from statement"} required/>
        </label>
        {validTarget && preview ? <div className="rounded-xl border border-[var(--border)] p-3 text-sm">
          <div className="flex justify-between gap-2"><span>Verified − system</span>
            <strong className={"money "+(gapCents < 0 ? "text-rose-700":"text-emerald-700")}>{money(gapCents/100)}</strong></div>
          {gapCents === 0 ? <p className="mt-2 text-xs text-emerald-700">Already reconciled. No adjustment needed.</p> : null}
        </div> : null}
        {canApplyFee ? <label className="block space-y-1.5">
          <span className="text-xs font-bold">Verified unrecorded fees or charges (₹)</span>
          <input className="app-control" type="number" min="0" step="0.01" value={confirmedCharges}
            onChange={e=>{setConfirmedCharges(e.target.value);setConfirmed(false);}} required/>
          <span className="block text-[11px] text-[var(--text-muted)]">Only confirmed fees, not estimates. For cards, a fee increases outstanding; for banks/wallets, it reduces funds.</span>
        </label> : null}
        {validTarget && validFees && gapCents !== 0 ? <div className="rounded-xl bg-[var(--surface-soft)] p-3 text-xs">
          <p>Verified fees to expense: <strong>{money(feesCents/100)}</strong></p>
          <p className="mt-1">Other statement difference: <strong>{money(residualCents/100)}</strong></p>
          {(!feeDirection && feesCents > 0) || residualCents < 0 ? <p className="mt-2 font-bold text-rose-700">
            Fees must have the correct direction and cannot exceed the balance difference.
          </p> : null}
        </div> : null}
        <label className="block space-y-1.5"><span className="text-xs font-bold">Statement / count reference and date</span>
          <input className="app-control" maxLength={200} value={statementReference}
            onChange={e=>{setStatementReference(e.target.value);setConfirmed(false);}}
            placeholder="e.g. account statement / physical count on 17-Oct-2026" required/></label>
        <label className="block space-y-1.5"><span className="text-xs font-bold">Explanation of verified difference</span>
          <textarea className="app-control min-h-20" maxLength={500} value={reason}
            onChange={e=>{setReason(e.target.value);setConfirmed(false);}}
            placeholder="Explain matched payouts, charges and any remaining unexplained amount" required/></label>
        <label className="flex items-start gap-2 text-xs font-medium leading-5">
          <input type="checkbox" className="mt-1" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
          I verified the supporting statement or physical count and approve an auditable account adjustment. I understand missing original movements must be entered as transactions first.
        </label>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>setOpen(false)} disabled={busy} className="app-secondary-button min-h-11">Cancel</button>
          <button type="submit" disabled={!canConfirm} className="app-primary-button min-h-11 disabled:opacity-40">
            {busy ? "Posting…" : "Post reconciliation"}
          </button>
        </div>
      </form> : <p className="text-sm">{busy ? "Loading wallet balance…" : error || "Could not load wallet balance"}</p>}
      {!preview && error ? <button type="button" className="app-secondary-button min-h-10 px-4" onClick={start}>Retry</button> : null}
    </Modal> : null}
  </>;
}
