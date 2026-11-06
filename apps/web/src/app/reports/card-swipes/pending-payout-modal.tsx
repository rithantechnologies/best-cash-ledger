"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Field, Modal } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";
import { defaultPaidToCustomerBank } from "@/lib/customer-bank-payout-default.mjs";
import { indianDate } from "./indian-date";

type Account = { id: string; accountName: string; accountType: string; currentBalance: number; providerId: string | null };
type Rule = { minAmount: string; maxAmount: string | null; calculationType: "FIXED" | "PERCENTAGE"; value: string };
type Provider = { id: string; payoutChargeRules: Rule[] };
type ExistingPayOut = {
 id: string; remainingUnallocated: number; financialAccount: { accountName: string };
 transaction: { transactionNumber: string; transactionAt: string };
};
type PriorCredit = {
 id: string; remainingAdvance: number; financialAccount: { accountName: string };
 transaction: { transactionNumber: string; transactionAt: string };
};
type Payable = {
 id: string; remainingAmount: string; paidAmount: string; originalAmount: string; dueAt: string; status: string;
 customer: {
  fullName: string;
  bankAccounts: { id: string; isActive: boolean; isDefault?: boolean; accountHolderName: string; bankName: string; accountReference: string }[];
  upiAccounts: { id: string; isActive: boolean; accountName: string; upiId: string | null; mobileNumber: string | null }[];
  cards: { id: string; isActive: boolean; bankName: string; lastFourDigits: string }[];
  beneficiaries: { id: string; beneficiaryName: string; accounts: { id: string; isActive: boolean; bankName: string | null; upiId: string | null }[] }[];
 };
 sourceTransaction: { id: string; transactionNumber: string; cardSwipe: { customerCard: { id: string } | null } | null };
 payments: { id: string; amount: string; status: string; sourceAccount: { accountName: string } }[];
 availableUnallocatedPayOuts: ExistingPayOut[];
 availableAdvances: PriorCredit[];
};
type Mode = "pay" | "match" | "credit";
const money = (v: number | string) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(v || 0));
function walletFee(providers: Provider[], account: Account | undefined, amount: number): number | null {
 if (!account || account.accountType !== "PROVIDER_WALLET" || !account.providerId || amount <= 0) return null;
 const rules = providers.find(p => p.id === account.providerId)?.payoutChargeRules ?? [];
 if (!rules.length) return null;
 const rule = rules.find(r => amount + 0.001 >= Number(r.minAmount) && (r.maxAmount === null || amount <= Number(r.maxAmount) + 0.001));
 if (!rule) return 0;
 return Math.round((rule.calculationType === "PERCENTAGE" ? amount * Number(rule.value) / 100 : Number(rule.value)) * 100) / 100;
}

// Uses the same payable payment and reconciliation APIs as the full Pay Out page.
// Never changes a payable status without recording or matching the underlying movement.
export function PendingPayoutModal({ payableId, onClose, onSaved }: { payableId: string | null; onClose: () => void; onSaved: () => void }) {
 const [item, setItem] = useState<Payable | null>(null);
 const [accounts, setAccounts] = useState<Account[]>([]);
 const [providers, setProviders] = useState<Provider[]>([]);
 const [mode, setMode] = useState<Mode>("pay");
 const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const [role, setRole] = useState("");
 const [amount, setAmount] = useState("");
 const [source, setSource] = useState(""), [destination, setDestination] = useState("");
 const [details, setDetails] = useState(""), [charge, setCharge] = useState("");
 const [reference, setReference] = useState(""), [notes, setNotes] = useState("");
 const [confirmedNew, setConfirmedNew] = useState(false);
 const paymentRetryRef = useRef<{ fingerprint: string; key: string } | null>(null);
 const [existingId, setExistingId] = useState(""), [existingAmount, setExistingAmount] = useState("");

 useEffect(() => {
  if (!payableId) { setItem(null); return; }
  paymentRetryRef.current = null;
  let active = true;
  setLoading(true); setItem(null); setError(""); setMode("pay"); setConfirmedNew(false);
  setSource(""); setDetails(""); setCharge(""); setReference(""); setNotes(""); setExistingId("");
  try { setRole(JSON.parse(localStorage.getItem("cashledger_user") || "{}").role || ""); } catch { setRole(""); }
  Promise.all([
   apiFetch<Payable>("/payables/" + payableId),
   apiFetch<Account[]>("/dashboard/accounts"),
   apiFetch<Provider[]>("/providers"),
  ]).then(([p, a, rules]) => {
   if (!active) return;
   setItem(p); setAccounts(a); setProviders(rules);
   setAmount(p.remainingAmount); setDestination(defaultPaidToCustomerBank(p.customer.bankAccounts));
   const previous = p.availableUnallocatedPayOuts?.[0];
   const advance = p.availableAdvances?.[0];
   if (previous) {
    setMode("match"); setExistingId(previous.id); setExistingAmount(Math.min(previous.remainingUnallocated, Number(p.remainingAmount)).toFixed(2));
   } else if (advance) {
    setMode("credit"); setExistingId(advance.id); setExistingAmount(Math.min(advance.remainingAdvance, Number(p.remainingAmount)).toFixed(2));
   }
  }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load this payout."); })
   .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [payableId]);

 const remaining = Number(item?.remainingAmount ?? 0);
 const destinationType = destination === "CASH" ? "CASH" : destination.startsWith("BANK:") ? "CUSTOMER_BANK" :
  destination.startsWith("CARD:") ? "CUSTOMER_CARD" : destination.startsWith("UPI:") ? "CUSTOMER_UPI" :
  destination.startsWith("BENEFICIARY_ACCOUNT:") ? "BENEFICIARY_ACCOUNT" :
  destination === "OTHER_CARD" ? "OTHER_CARD" : destination === "OTHER" ? "OTHER" : "";
 const destinationId = destination.includes(":") ? destination.slice(destination.indexOf(":") + 1) : undefined;
 const needsDetails = destination === "OTHER" || destination === "OTHER_CARD";
 const allowedAccounts = accounts.filter(a =>
  ["CASH", "BANK", "UPI", "PROVIDER_WALLET"].includes(a.accountType) &&
  (destinationType === "CASH" ? a.accountType === "CASH" : destinationType ? a.accountType !== "CASH" : true) &&
  !(role === "STAFF" && a.accountName === "Main Cash Reserve"));
 const selectedAccount = allowedAccounts.find(a => a.id === source);
 const amountNumber = Number(amount);
 const configuredFee = walletFee(providers, selectedAccount, amountNumber);
 const feeAmount = selectedAccount?.accountType === "PROVIDER_WALLET" ? configuredFee ?? Number(charge || 0) : 0;
 const sourceShort = selectedAccount ? amountNumber + feeAmount > selectedAccount.currentBalance + 0.001 : false;
 const maxCash = Math.ceil(remaining);
 const maxPay = destinationType === "CASH" ? maxCash : remaining;
 const validPay = !!item && remaining > 0 && !!destinationType && !!selectedAccount &&
  amountNumber > 0 && Math.round(amountNumber * 100) === amountNumber * 100 &&
  amountNumber <= maxPay + 0.001 && !sourceShort && (!needsDetails || !!details.trim()) &&
  (!(item.availableUnallocatedPayOuts?.length) || confirmedNew);
 const existingRecords = mode === "match" ? item?.availableUnallocatedPayOuts ?? [] : item?.availableAdvances ?? [];
 const selectedExisting = existingRecords.find(e => e.id === existingId);
 const existingMaximum = selectedExisting ? Math.min(remaining, "remainingUnallocated" in selectedExisting ? selectedExisting.remainingUnallocated : selectedExisting.remainingAdvance) : 0;
 const existingValue = Number(existingAmount);
 const validExisting = !!item && !!selectedExisting && existingValue > 0 && Math.round(existingValue * 100) === existingValue * 100 && existingValue <= existingMaximum + 0.001;
 const canComplete = item && remaining > 0 && !["PAID", "CANCELLED", "REVERSED"].includes(item.status);

 function pickMode(next: Mode) {
  setError(""); setMode(next);
  if (next === "pay") return;
  const record = (next === "match" ? item?.availableUnallocatedPayOuts : item?.availableAdvances)?.[0];
  setExistingId(record?.id ?? "");
  setExistingAmount(record ? Math.min(next === "match" ? (record as ExistingPayOut).remainingUnallocated : (record as PriorCredit).remainingAdvance, remaining).toFixed(2) : "");
 }
 function pickDestination(next: string) {
  setDestination(next); setDetails(""); setSource(""); setCharge("");
  setAmount(next === "CASH" ? String(Math.round(remaining)) : String(remaining));
 }
 async function save(e: FormEvent) {
  e.preventDefault();
  if (!item || !canComplete || busy || (mode === "pay" ? !validPay : !validExisting)) return;
  setBusy(true); setError("");
  try {
   if (mode === "pay") {
    const payload = {
     amount: amountNumber, chargeAmount: feeAmount, sourceAccountId: source,
     destinationType, destinationId, destinationDetails: needsDetails ? details.trim() : undefined,
     referenceNumber: reference || undefined, notes: notes || undefined,
    };
    const fingerprint = JSON.stringify({ payableId: item.id, ...payload });
    const previous = paymentRetryRef.current;
    const key = previous?.fingerprint === fingerprint ? previous.key : crypto.randomUUID();
    paymentRetryRef.current = { fingerprint, key };
    await apiFetch("/payables/" + item.id + "/payments", {
     method: "POST", headers: { "idempotency-key": key },
     body: JSON.stringify(payload),
    });
   } else if (mode === "match") {
    await apiFetch("/payables/" + item.id + "/existing-payout-matches", {
     method: "POST", body: JSON.stringify({ advanceEntryId: existingId, amount: existingValue }),
    });
   } else {
    await apiFetch("/payables/" + item.id + "/advance-offsets", {
     method: "POST", body: JSON.stringify({ advanceEntryId: existingId, amount: existingValue, notes: notes || undefined }),
    });
   }
   paymentRetryRef.current = null;
   onSaved(); onClose();
  } catch (err) {
   // A failed response is not proof that the bank/wallet movement failed.
   // Always re-open the payable before trying again.
   const message = err instanceof Error ? err.message : "Could not complete payout.";
   if (mode === "pay" && message.startsWith("Duplicate request detected:")) {
    try {
     const current = await apiFetch<Payable>("/payables/" + item.id);
     if (Number(current.remainingAmount) < remaining - 0.001) {
      paymentRetryRef.current = null; onSaved(); onClose(); return;
     }
    } catch { /* An uncertain result must be reviewed before another payout. */ }
   }
   setError(message + " Check the payout history before retrying, to prevent a duplicate payment.");
  } finally { setBusy(false); }
 }
 return <Modal open={!!payableId} title="Complete customer Pay Out" description="Record or match the actual payout without leaving this report" onClose={() => { if (!busy) onClose(); }}
  footer={canComplete ? <button type="submit" form="report-payout-form" disabled={busy || loading || (mode === "pay" ? !validPay : !validExisting)} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">
   {busy ? "Saving…" : mode === "pay" ? "Record Pay Out" : mode === "match" ? "Match recorded Pay Out" : "Apply earlier Pay Out credit"}
  </button> : null}>
  {loading ? <p className="py-5 text-sm">Loading payout and available accounts…</p> : item ? <form id="report-payout-form" onSubmit={save} className="space-y-4">
   <div className="rounded-xl bg-[var(--surface-soft)] p-3">
    <p className="font-black">{item.customer.fullName} · {item.sourceTransaction.transactionNumber}</p>
    <p className="mt-1 text-xs">Original {money(item.originalAmount)} · Paid {money(item.paidAmount)} · <strong>Still due {money(remaining)}</strong></p>
    <p className="mt-1 text-xs text-[var(--text-muted)]">Expected payout: {indianDate(item.dueAt)} (IST)</p>
   </div>
   {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p> : null}
   {!canComplete ? <p className="text-sm">This payable is no longer outstanding. <Link className="font-bold text-[var(--accent)]" href={"/payables/" + item.id}>View payout history</Link>.</p> : <>
    <div className="flex flex-wrap gap-2">
     {item.availableUnallocatedPayOuts?.length ? <button type="button" onClick={() => pickMode("match")} className={"rounded-lg px-3 py-2 text-xs font-bold " + (mode === "match" ? "bg-amber-600 text-white" : "border border-amber-300")}>Already recorded · Match</button> : null}
     {item.availableAdvances?.length ? <button type="button" onClick={() => pickMode("credit")} className={"rounded-lg px-3 py-2 text-xs font-bold " + (mode === "credit" ? "bg-indigo-700 text-white" : "border border-indigo-300")}>Apply earlier credit</button> : null}
     <button type="button" onClick={() => pickMode("pay")} className={"rounded-lg px-3 py-2 text-xs font-bold " + (mode === "pay" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]")}>Record new payout</button>
    </div>
    {mode !== "pay" ? <>
     <p className="text-xs text-[var(--text-muted)]">{mode === "match" ? "This payment was already entered in the customer ledger. Matching it does not debit cash, bank or wallet again." : "Use money previously advanced to the customer. This does not send money again."}</p>
     <Field label="Previously recorded Pay Out">
      <SearchableSelect className="app-control" value={existingId} onChange={e => {
       setExistingId(e.target.value);
       const found = existingRecords.find(r => r.id === e.target.value);
       const available = found ? "remainingUnallocated" in found ? found.remainingUnallocated : found.remainingAdvance : 0;
       setExistingAmount(found ? Math.min(available, remaining).toFixed(2) : "");
      }} required>
       <option value="">Choose an existing payout</option>
       {existingRecords.map(r => <option key={r.id} value={r.id}>{r.transaction.transactionNumber} · {r.financialAccount.accountName} · {money("remainingUnallocated" in r ? r.remainingUnallocated : r.remainingAdvance)} available</option>)}
      </SearchableSelect>
     </Field>
     <Field label="Amount to settle"><input className="app-control" type="number" inputMode="decimal" min="0.01" step="0.01" max={existingMaximum.toFixed(2)} value={existingAmount} onChange={e => setExistingAmount(e.target.value)} required/></Field>
    </> : <>
     {item.availableUnallocatedPayOuts?.length ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      A Pay Out already exists for this customer. Match it above if this is the same transfer.
      <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={confirmedNew} onChange={e => setConfirmedNew(e.target.checked)} className="mt-0.5"/> This is a different, new payment — not the recorded one.</label>
     </div> : null}
     <Field label="Paid to">
      <SearchableSelect className="app-control" value={destination} onChange={e => pickDestination(e.target.value)} required>
       <option value="">Choose payout recipient</option>
       <optgroup label="Customer bank accounts">{item.customer.bankAccounts.filter(a => a.isActive).map(a => <option value={"BANK:" + a.id} key={a.id}>{a.accountHolderName} · {a.bankName} · {a.accountReference}</option>)}</optgroup>
       <optgroup label="Customer cards">{item.customer.cards.filter(a => a.isActive).map(a => <option value={"CARD:" + a.id} key={a.id}>{a.bankName} ••••{a.lastFourDigits}{a.id === item.sourceTransaction.cardSwipe?.customerCard?.id ? " (swiped card)" : ""}</option>)}<option value="OTHER_CARD">Another person&apos;s card</option></optgroup>
       <optgroup label="Other destinations">
        <option value="CASH">Cash directly to customer</option>
        {item.customer.upiAccounts.filter(a => a.isActive).map(a => <option value={"UPI:" + a.id} key={a.id}>{a.accountName} · {a.upiId || a.mobileNumber || "UPI"}</option>)}
        {item.customer.beneficiaries.flatMap(b => b.accounts.filter(a => a.isActive).map(a => <option key={a.id} value={"BENEFICIARY_ACCOUNT:" + a.id}>{b.beneficiaryName} · {a.bankName || a.upiId || "Beneficiary"}</option>))}
        <option value="OTHER">Other bank / UPI recipient</option>
       </optgroup>
      </SearchableSelect>
     </Field>
     {needsDetails ? <Field label="Recipient details"><input className="app-control" value={details} onChange={e => setDetails(e.target.value)} maxLength={160} required placeholder={destination === "OTHER_CARD" ? "Cardholder, bank, last four digits only" : "Recipient and bank / UPI details"}/></Field> : null}
     <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Payout amount"><input className="app-control" type="number" min="0.01" step="0.01" max={maxPay} value={amount} onChange={e => setAmount(e.target.value)} required/></Field>
      <Field label="Paid from">
       <SearchableSelect className="app-control" value={source} onChange={e => { setSource(e.target.value); setCharge(""); }} disabled={!destinationType} required>
        <option value="">{destinationType ? "Select cash / bank / wallet" : "Select recipient first"}</option>
        {allowedAccounts.map(a => <option value={a.id} key={a.id}>{a.accountName} · {money(a.currentBalance)} available</option>)}
       </SearchableSelect>
      </Field>
     </div>
     {selectedAccount?.accountType === "PROVIDER_WALLET" && configuredFee === null ? <Field label="Provider payout charge (if applicable)"><input className="app-control" type="number" min="0" step="0.01" value={charge} onChange={e => setCharge(e.target.value)} placeholder="0.00"/></Field> : null}
     {selectedAccount ? <p className={"text-xs " + (sourceShort ? "font-bold text-rose-600" : "text-[var(--text-muted)]")}>Source debit {money(amountNumber + feeAmount)} {feeAmount ? "(including provider charge " + money(feeAmount) + ")" : ""}{sourceShort ? " — insufficient available balance" : ""}</p> : null}
     {destinationType === "CASH" ? <p className="text-xs text-[var(--text-muted)]">Cash is rounded to whole rupees; any eligible small paise difference is audited as a non-cash rounding adjustment.</p> : null}
     <Field label="Reference / UTR (optional)"><input className="app-control" value={reference} onChange={e => setReference(e.target.value)} maxLength={160} placeholder="Reference or cash acknowledgement"/></Field>
     <Field label="Notes (optional)"><input className="app-control" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}/></Field>
     <p className="text-xs text-[var(--text-muted)]">Recording this payout posts its account/cash movement and audit history. If cash/bank/wallet was already debited in the ledger, use Match instead.</p>
    </>}
    <Link href={"/payables/" + item.id} className="inline-block text-xs font-bold text-[var(--accent)]">Open full payout history and advanced options</Link>
   </>}
  </form> : <p className="py-5 text-sm text-[var(--text-muted)]">{error || "Unable to load this payable."}</p>}
 </Modal>;
}
