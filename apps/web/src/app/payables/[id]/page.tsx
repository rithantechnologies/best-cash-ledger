"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Payment={
 id:string;paymentDate:string;amount:string;referenceNumber:string|null;notes:string|null;status:string;
 sourceAccount:{accountName:string;accountType:string};transaction:{transactionNumber:string;status:string};
 createdBy:{id:string;fullName:string}|null;
};
type Payable={
 id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string;createdAt:string;
 customer:{id:string;fullName:string;customerCode:string};paymentTerm:{name:string}|null;
 sourceTransaction:{id:string;transactionNumber:string;transactionAt:string;referenceNumber:string|null;notes:string|null;status:string;cardSwipe:unknown;providerSettlementSource:{status?:string}|null;charges:{amount:string}[];commissions:{amount:string}[]};
 payments:Payment[];createdBy:{id:string;fullName:string}|null;
};
type Audit={id:string;action:string;reason:string|null;createdAt:string;oldValues:unknown;newValues:unknown;user:{fullName:string}|null};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const statusTone=(s:string)=>s==="PAID"?"emerald":s==="OVERDUE"?"rose":s==="PARTIALLY_PAID"?"indigo":s==="PENDING"?"amber":"slate";

export default function PayableDetailPage(){
 const {id}=useParams<{id:string}>();
 const [item,setItem]=useState<Payable|null>(null),[audit,setAudit]=useState<Audit[]>([]),[error,setError]=useState("");
 useEffect(()=>{
  apiFetch<Payable>("/payables/"+id).then(x=>{setItem(x);return apiFetch<Audit[]>("/audit?entityType=CUSTOMER_PAYABLE&entityId="+id).then(setAudit).catch(()=>{});})
   .catch(e=>setError(e instanceof Error?e.message:"Failed to load payable"));
 },[id]);
 if(!item)return <AppShell><PageLoader label="Loading payable…"/></AppShell>;

 const progress=Math.min(100,Math.max(0,Number(item.paidAmount)/Math.max(1,Number(item.originalAmount))*100));
 const charge=item.sourceTransaction.charges.reduce((s,x)=>s+Number(x.amount),0);
 const commission=item.sourceTransaction.commissions.reduce((s,x)=>s+Number(x.amount),0);

 return <AppShell><PageFrame width="max-w-6xl">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href="/payables" className="text-xs font-bold text-indigo-600">← Payables</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{item.customer.customerCode}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{item.customer.fullName}</h2><p className="mt-1 text-sm text-slate-500">{item.sourceTransaction.transactionNumber} · Due {new Date(item.dueAt).toLocaleString("en-IN")}</p></div>
   <StatusBadge tone={statusTone(item.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{item.status.replaceAll("_"," ")}</StatusBadge>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <div className="grid grid-cols-3 gap-2.5">
   <DetailStat label="Original" value={money(item.originalAmount)}/>
   <DetailStat label="Paid" value={money(item.paidAmount)} tone="emerald"/>
   <DetailStat label="Remaining" value={money(item.remainingAmount)} tone="amber"/>
  </div>

  <Surface className="p-4 sm:p-5">
   <div className="flex items-center justify-between text-xs"><strong>Payout progress</strong><span className="font-bold text-slate-500">{progress.toFixed(0)}%</span></div>
   <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:progress+"%"}}/></div>
   <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm lg:grid-cols-4">
    {[["Payment term",item.paymentTerm?.name||"—"],["Operator",item.createdBy?.fullName||"Unknown"],["Source reference",item.sourceTransaction.referenceNumber||"—"],["Provider settlement",item.sourceTransaction.providerSettlementSource?.status?.replaceAll("_"," ")||"—"],["Provider charge",money(charge)],["Customer commission",money(commission)],["Created",new Date(item.createdAt).toLocaleString("en-IN")],["Source status",item.sourceTransaction.status]].map(([l,v])=><div key={l}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className="mt-1 break-words font-semibold">{v}</p></div>)}
   </div>
  </Surface>
  <Surface className="overflow-hidden">
   <PanelHeader title="Payout history" description="Every payment recorded against this customer obligation."/>
   {item.payments.length?<><div className="space-y-2 p-3 md:hidden">{item.payments.map(p=><div key={p.id} className="rounded-xl bg-slate-50 p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{money(p.amount)}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(p.paymentDate).toLocaleString("en-IN")}</p></div><StatusBadge tone={p.status==="COMPLETED"?"emerald":"slate"}>{p.status}</StatusBadge></div>
    <div className="mt-2 text-xs text-slate-500"><p>{p.sourceAccount.accountName} · {p.transaction.transactionNumber}</p><p className="mt-1">{p.referenceNumber||"No reference"} · {p.createdBy?.fullName||"Unknown operator"}</p></div>
   </div>)}</div>
   <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Paid from</th><th>Amount</th><th>Reference</th><th>Operator</th><th>Status</th></tr></thead><tbody>{item.payments.map(p=><tr key={p.id} className="border-t border-slate-100"><td className="px-5 py-3 text-xs">{new Date(p.paymentDate).toLocaleString("en-IN")}</td><td>{p.transaction.transactionNumber}</td><td>{p.sourceAccount.accountName}</td><td className="font-bold">{money(p.amount)}</td><td>{p.referenceNumber||"—"}</td><td>{p.createdBy?.fullName||"Unknown"}</td><td>{p.status}</td></tr>)}</tbody></table></div></>:<div className="p-4"><EmptyState title="No payouts recorded yet"/></div>}
  </Surface>
  {audit.length?<Surface className="overflow-hidden"><PanelHeader title="Audit history" description="Recorded changes to this payable."/><div className="divide-y divide-slate-100">{audit.map(a=><div key={a.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
   <div><p className="text-sm font-bold">{a.action.replaceAll("_"," ")}</p><p className="mt-0.5 text-[11px] text-slate-400">{a.user?.fullName||"Unknown operator"} · {new Date(a.createdAt).toLocaleString("en-IN")}</p>{a.reason?<p className="mt-1 text-xs text-slate-600">{a.reason}</p>:null}</div>
   <details className="text-xs"><summary className="cursor-pointer font-bold text-indigo-600">View change</summary><pre className="mt-2 max-w-lg overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details>
  </div>)}</div></Surface>:null}
 </PageFrame></AppShell>;
}
