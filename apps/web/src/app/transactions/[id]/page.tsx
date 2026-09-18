"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Entry={id:string;entryType:string;amount:string;description:string|null;ledgerAccount:{ledgerName:string}};
type Tx={
 id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
 status:string;referenceNumber:string|null;notes:string|null;reversalReason:string|null;createdById:string;createdBy:{id:string;fullName:string}|null;
 customer:{fullName:string}|null;charges:{id:string;chargeType:string;rate:string|null;amount:string}[];
 commissions:{id:string;commissionType:string;rate:string;amount:string}[];
 journal:{journalNumber:string;description:string;entries:Entry[]}|null;
 payable:{id:string;originalAmount:string;paidAmount:string;remainingAmount:string;status:string}|null;
};
const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v||0));

export default function TransactionDetailPage(){
 const {id}=useParams<{id:string}>();
 const router=useRouter();
 const [tx,setTx]=useState<Tx|null>(null);
 const [reason,setReason]=useState("");
 const [error,setError]=useState("");
 const [role,setRole]=useState("");
 const [saving,setSaving]=useState(false);

 const load=()=>apiFetch<Tx>("/transactions/"+id).then(setTx);
 useEffect(()=>{
  try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}
  load().catch(e=>setError(e instanceof Error?e.message:"Failed to load transaction"));
 },[id]);

 async function reverse(e:FormEvent){
  e.preventDefault();if(!confirm("Create a reversal for this transaction? The original record will be preserved."))return;
  setSaving(true);setError("");
  try{await apiFetch("/transactions/"+id+"/reverse",{method:"POST",body:JSON.stringify({reason})});setReason("");await load();}
  catch(err){setError(err instanceof Error?err.message:"Reversal failed");}finally{setSaving(false);}
 }

 if(!tx)return <AppShell><div className="rounded-xl border bg-white p-6">{error||"Loading transaction..."}</div></AppShell>;

 return <AppShell><div className="mx-auto max-w-5xl space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-slate-500">{tx.transactionType}</p><h2 className="text-2xl font-bold">{tx.transactionNumber}</h2><p className="text-sm text-slate-500">{new Date(tx.transactionAt).toLocaleString("en-IN")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">{tx.status}</span></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
   {[["Gross",money(tx.grossAmount)],["Net",money(tx.netAmount)],["Customer",tx.customer?.fullName??"—"],["Operator",tx.createdBy?.fullName??tx.createdById],["Reference",tx.referenceNumber??"—"]].map(([l,v])=><div key={l} className="rounded-xl border bg-white p-5"><p className="text-xs uppercase text-slate-500">{l}</p><p className="mt-2 font-semibold">{v}</p></div>)}
  </section>
  {tx.payable?<section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Customer Payable</h3><div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm"><div><p className="text-slate-500">Original</p><strong>{money(tx.payable.originalAmount)}</strong></div><div><p className="text-slate-500">Paid</p><strong>{money(tx.payable.paidAmount)}</strong></div><div><p className="text-slate-500">Remaining</p><strong>{money(tx.payable.remainingAmount)}</strong></div><div><p className="text-slate-500">Status</p><strong>{tx.payable.status}</strong></div></div></section>:null}
  <section className="grid gap-6 lg:grid-cols-2">
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Charges & Commission</h3><div className="mt-4 space-y-3 text-sm">{tx.charges.map(c=><div key={c.id} className="flex justify-between"><span>{c.chargeType}{c.rate?" ("+Number(c.rate)+"%)":""}</span><strong>{money(c.amount)}</strong></div>)}{tx.commissions.map(c=><div key={c.id} className="flex justify-between"><span>{c.commissionType} commission ({Number(c.rate)}%)</span><strong>{money(c.amount)}</strong></div>)}{!tx.charges.length&&!tx.commissions.length?<p className="text-slate-500">No charges or commission.</p>:null}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Notes</h3><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{tx.notes||"—"}</p>{tx.reversalReason?<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><strong>Reversal reason:</strong> {tx.reversalReason}</p>:null}</div>
  </section>
  {tx.journal?<section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Ledger Journal · {tx.journal.journalNumber}</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Ledger</th><th>Entry</th><th>Amount</th><th>Description</th></tr></thead><tbody>{tx.journal.entries.map(e=><tr key={e.id} className="border-t"><td className="py-3">{e.ledgerAccount.ledgerName}</td><td>{e.entryType}</td><td>{money(e.amount)}</td><td>{e.description??"—"}</td></tr>)}</tbody></table></div></section>:null}
  {(role==="OWNER"||role==="ADMIN")&&tx.status!=="REVERSED"&&tx.transactionType!=="REVERSAL"?<form onSubmit={reverse} className="rounded-xl border border-red-200 bg-red-50 p-5"><h3 className="font-semibold text-red-900">Reverse Transaction</h3><p className="mt-1 text-sm text-red-700">This creates an opposite journal. It does not delete the original record.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input className="min-w-0 flex-1 rounded-lg border border-red-300 bg-white px-3 py-2.5" placeholder="Reason for reversal" minLength={3} value={reason} onChange={e=>setReason(e.target.value)} required/><button disabled={saving} className="rounded-lg bg-red-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Reversing...":"Reverse"}</button></div></form>:null}
 </div></AppShell>;
}
