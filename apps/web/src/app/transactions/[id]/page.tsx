"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Modal, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Entry={id:string;entryType:string;amount:string;description:string|null;ledgerAccount:{ledgerName:string}};
type Tx={
 id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
 status:string;referenceNumber:string|null;notes:string|null;reversalReason:string|null;createdById:string;createdBy:{id:string;fullName:string}|null;
 customer:{fullName:string}|null;charges:{id:string;chargeType:string;rate:string|null;amount:string}[];
 commissions:{id:string;commissionType:string;rate:string;amount:string}[];
 journal:{journalNumber:string;description:string;entries:Entry[]}|null;
 payable:{id:string;originalAmount:string;paidAmount:string;remainingAmount:string;status:string}|null;
 microAtm:{cardLastFour:string;customerBankName:string|null;withdrawalAmount:string;providerCommissionRate:string;providerCommissionAmount:string;cashGiven:string;settlementAmount:string;providerReference:string|null}|null;
};
const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v||0));
const tone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";

export default function TransactionDetailPage(){
 const {id}=useParams<{id:string}>();
 const [tx,setTx]=useState<Tx|null>(null),[reason,setReason]=useState(""),[error,setError]=useState(""),[role,setRole]=useState("");
 const [saving,setSaving]=useState(false),[reverseOpen,setReverseOpen]=useState(false);
 const load=()=>apiFetch<Tx>("/transactions/"+id).then(setTx);
 useEffect(()=>{
  try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}
  load().catch(e=>setError(e instanceof Error?e.message:"Failed to load transaction"));
 },[id]);

 async function reverse(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/"+id+"/reverse",{method:"POST",body:JSON.stringify({reason})});
   setReason("");setReverseOpen(false);await load();
  }catch(err){setError(err instanceof Error?err.message:"Reversal failed");}
  finally{setSaving(false);}
 }
 if(!tx)return <AppShell><PageLoader label="Loading transaction…"/></AppShell>;

 const canReverse=(role==="OWNER"||role==="ADMIN")&&tx.status!=="REVERSED"&&tx.transactionType!=="REVERSAL";
 return <AppShell><PageFrame width="max-w-6xl">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href="/transactions" className="text-xs font-bold text-indigo-600">← Transactions</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{tx.transactionType.replaceAll("_"," ")}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{tx.transactionNumber}</h2><p className="mt-1 text-sm text-slate-500">{new Date(tx.transactionAt).toLocaleString("en-IN")}</p></div>
   <div className="flex items-center gap-2"><StatusBadge tone={tone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{tx.status}</StatusBadge>{canReverse?<button onClick={()=>setReverseOpen(true)} className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700">Reverse</button>:null}</div>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
   <DetailStat label="Gross" value={money(tx.grossAmount)}/>
   <DetailStat label="Net" value={money(tx.netAmount)} tone="indigo"/>
   <DetailStat label="Customer" value={tx.customer?.fullName??"—"}/>
   <DetailStat label="Operator" value={tx.createdBy?.fullName??tx.createdById}/>
   <DetailStat label="Reference" value={tx.referenceNumber??"—"}/>
  </div>

  {tx.microAtm?<Surface className="p-4 sm:p-5">
   <div className="mb-4"><h3 className="text-sm font-bold">Micro ATM details</h3><p className="text-[11px] text-slate-400">Customer cash withdrawal and provider settlement values.</p></div>
   <div className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm lg:grid-cols-4">
    {[["Card","•••• "+tx.microAtm.cardLastFour],["Customer bank",tx.microAtm.customerBankName||"—"],["Withdrawal",money(tx.microAtm.withdrawalAmount)],["Cash given",money(tx.microAtm.cashGiven)],["Provider commission",money(tx.microAtm.providerCommissionAmount)+" · "+Number(tx.microAtm.providerCommissionRate)+"%"],["Provider settlement",money(tx.microAtm.settlementAmount)],["Provider reference",tx.microAtm.providerReference||tx.referenceNumber||"—"]].map(([l,v])=><div key={l}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className="mt-1 break-words font-semibold">{v}</p></div>)}
   </div>
  </Surface>:null}
  {tx.payable?<Surface className="p-4 sm:p-5">
   <div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-bold">Customer payable</h3><p className="text-[11px] text-slate-400">Obligation created by this transaction.</p></div><StatusBadge tone={tx.payable.status==="PAID"?"emerald":"amber"}>{tx.payable.status.replaceAll("_"," ")}</StatusBadge></div>
   <div className="grid grid-cols-3 gap-2.5"><div><p className="text-[10px] uppercase text-slate-400">Original</p><p className="mt-1 font-bold">{money(tx.payable.originalAmount)}</p></div><div><p className="text-[10px] uppercase text-slate-400">Paid</p><p className="mt-1 font-bold text-emerald-700">{money(tx.payable.paidAmount)}</p></div><div><p className="text-[10px] uppercase text-slate-400">Remaining</p><p className="mt-1 font-bold text-amber-700">{money(tx.payable.remainingAmount)}</p></div></div>
  </Surface>:null}
  <div className="grid gap-4 lg:grid-cols-2">
   <Surface className="overflow-hidden"><PanelHeader title="Charges & commission" description="Pricing components recorded with the transaction."/><div className="divide-y divide-slate-100 px-4 sm:px-5">
    {tx.charges.map(c=><div key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-slate-600">{c.chargeType.replaceAll("_"," ")}{c.rate?" · "+Number(c.rate)+"%":""}</span><strong className="text-rose-700">{money(c.amount)}</strong></div>)}
    {tx.commissions.map(c=><div key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-slate-600">{c.commissionType.replaceAll("_"," ")} · {Number(c.rate)}%</span><strong className="text-emerald-700">{money(c.amount)}</strong></div>)}
    {!tx.charges.length&&!tx.commissions.length?<div className="py-4"><EmptyState title="No charges or commission"/></div>:null}
   </div></Surface>
   <Surface className="overflow-hidden"><PanelHeader title="Notes & exceptions" description="Operational notes and reversal context."/><div className="p-4 text-sm leading-6 text-slate-600 sm:p-5"><p className="whitespace-pre-wrap">{tx.notes||"No notes recorded."}</p>{tx.reversalReason?<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800"><strong className="block text-xs">Reversal reason</strong><p className="mt-1">{tx.reversalReason}</p></div>:null}</div></Surface>
  </div>
  {tx.journal?<Surface className="overflow-hidden">
   <PanelHeader title={"Ledger journal · "+tx.journal.journalNumber} description={tx.journal.description}/>
   <div className="space-y-2 p-3 md:hidden">{tx.journal.entries.map(e=><div key={e.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{e.ledgerAccount.ledgerName}</strong><StatusBadge tone={e.entryType==="CREDIT"?"emerald":"indigo"}>{e.entryType}</StatusBadge></div><div className="mt-2 flex items-end justify-between"><p className="text-[11px] text-slate-400">{e.description??"No description"}</p><strong>{money(e.amount)}</strong></div></div>)}</div>
   <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Ledger</th><th>Entry</th><th>Amount</th><th>Description</th></tr></thead><tbody>{tx.journal.entries.map(e=><tr key={e.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold">{e.ledgerAccount.ledgerName}</td><td>{e.entryType}</td><td className="font-bold">{money(e.amount)}</td><td className="text-slate-500">{e.description??"—"}</td></tr>)}</tbody></table></div>
  </Surface>:null}

  <Modal open={reverseOpen} title="Reverse transaction?" description="The original transaction remains in the audit trail. A balancing reversal journal will be created." onClose={()=>setReverseOpen(false)}
   footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setReverseOpen(false)} className="min-h-11 rounded-xl border border-slate-200 bg-white text-sm font-bold">Keep transaction</button><button form="reverse-tx" disabled={saving} className="min-h-11 rounded-xl bg-rose-700 text-sm font-bold text-white disabled:opacity-50">{saving?"Reversing…":"Confirm reversal"}</button></div>}>
   <form id="reverse-tx" onSubmit={reverse}><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Reason</span><textarea className="min-h-28 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" minLength={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this being reversed?" required/></label></form>
  </Modal>
 </PageFrame></AppShell>;
}
