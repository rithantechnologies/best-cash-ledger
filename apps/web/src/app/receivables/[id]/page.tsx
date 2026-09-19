"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Collection={
 id:string;collectionDate:string;amount:string;referenceNumber:string|null;notes:string|null;status:string;
 destinationAccount:{accountName:string;accountType:string};transaction:{id:string;transactionNumber:string;status:string};
 createdBy:{id:string;fullName:string}|null;
};
type Receivable={
 id:string;reason:string;description:string|null;originalAmount:string;receivedAmount:string;remainingAmount:string;
 dueAt:string|null;status:string;createdAt:string;createdBy:{id:string;fullName:string}|null;
 customer:{id:string;fullName:string;customerCode:string};sourceAccount:{accountName:string;accountType:string}|null;
 sourceTransaction:{id:string;transactionNumber:string;referenceNumber:string|null;notes:string|null;status:string;transactionAt:string};
 collections:Collection[];
};
type Audit={id:string;action:string;reason:string|null;createdAt:string;oldValues:unknown;newValues:unknown;user:{fullName:string}|null};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const statusTone=(s:string)=>s==="RECEIVED"?"emerald":s==="OVERDUE"?"rose":s==="PARTIALLY_RECEIVED"?"indigo":s==="PENDING"?"amber":"slate";

export default function ReceivableDetailPage(){
 const {id}=useParams<{id:string}>();
 const [item,setItem]=useState<Receivable|null>(null),[audit,setAudit]=useState<Audit[]>([]),[error,setError]=useState("");
 useEffect(()=>{
  apiFetch<Receivable>("/receivables/"+id).then(data=>{setItem(data);return apiFetch<Audit[]>("/audit?entityType=CUSTOMER_RECEIVABLE&entityId="+id).then(setAudit).catch(()=>{});})
   .catch(e=>setError(e instanceof Error?e.message:"Failed to load receivable"));
 },[id]);
 if(!item)return <AppShell><PageLoader label="Loading receivable…"/></AppShell>;
 const progress=Math.min(100,Math.max(0,Number(item.receivedAmount)/Math.max(1,Number(item.originalAmount))*100));

 return <AppShell><PageFrame width="max-w-6xl">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href="/receivables" className="text-xs font-bold text-indigo-600">← Receivables</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{item.customer.customerCode}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{item.customer.fullName}</h2><p className="mt-1 text-sm text-slate-500">{item.reason}{item.description?" · "+item.description:""}</p></div>
   <StatusBadge tone={statusTone(item.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{item.status.replaceAll("_"," ")}</StatusBadge>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
   <DetailStat label="Original" value={money(item.originalAmount)}/>
   <DetailStat label="Received" value={money(item.receivedAmount)} tone="emerald"/>
   <DetailStat label="Remaining" value={money(item.remainingAmount)} tone="indigo"/>
  </div>

  <Surface className="p-4 sm:p-5">
   <div className="flex items-center justify-between text-xs"><strong>Collection progress</strong><span className="font-bold text-slate-500">{progress.toFixed(0)}%</span></div>
   <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:progress+"%"}}/></div>
   <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm lg:grid-cols-4">
    {[["Source",item.sourceAccount?item.sourceAccount.accountName+" · "+item.sourceAccount.accountType:"Opening / adjustment"],["Due date",item.dueAt?new Date(item.dueAt).toLocaleString("en-IN"):"No due date"],["Source transaction",item.sourceTransaction.transactionNumber],["Reference",item.sourceTransaction.referenceNumber||"—"],["Created",new Date(item.createdAt).toLocaleString("en-IN")],["Created by",item.createdBy?.fullName||"Unknown operator"],["Source status",item.sourceTransaction.status],["Notes",item.sourceTransaction.notes||"—"]].map(([l,v])=><div key={l}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className="mt-1 break-words font-semibold">{v}</p></div>)}
   </div>
  </Surface>
  <Surface className="overflow-hidden">
   <PanelHeader title="Collection history" description="Every receipt recorded against this receivable."/>
   {item.collections.length?<><div className="space-y-2 p-3 md:hidden">{item.collections.map(c=><div key={c.id} className="rounded-xl bg-slate-50 p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-emerald-700">{money(c.amount)}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(c.collectionDate).toLocaleString("en-IN")}</p></div><StatusBadge tone={c.status==="COMPLETED"?"emerald":"slate"}>{c.status}</StatusBadge></div>
    <div className="mt-2 text-xs text-slate-500"><p>{c.destinationAccount.accountName} · {c.transaction.transactionNumber}</p><p className="mt-1">{c.referenceNumber||"No reference"} · {c.createdBy?.fullName||"Unknown operator"}</p></div>
   </div>)}</div>
   <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Received into</th><th>Amount</th><th>Reference</th><th>Operator</th><th>Status</th></tr></thead><tbody>{item.collections.map(c=><tr key={c.id} className="border-t border-slate-100"><td className="px-5 py-3 text-xs">{new Date(c.collectionDate).toLocaleString("en-IN")}</td><td>{c.transaction.transactionNumber}</td><td>{c.destinationAccount.accountName}</td><td className="font-bold text-emerald-700">{money(c.amount)}</td><td>{c.referenceNumber||"—"}</td><td>{c.createdBy?.fullName||"Unknown"}</td><td>{c.status}</td></tr>)}</tbody></table></div></>:<div className="p-4"><EmptyState title="No collections recorded yet"/></div>}
  </Surface>
  {audit.length?<Surface className="overflow-hidden"><PanelHeader title="Audit history" description="Creation, collection and status changes for this receivable."/><div className="divide-y divide-slate-100">{audit.map(a=><div key={a.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
   <div><p className="text-sm font-bold">{a.action.replaceAll("_"," ")}</p><p className="mt-0.5 text-[11px] text-slate-400">{a.user?.fullName||"Unknown operator"} · {new Date(a.createdAt).toLocaleString("en-IN")}</p>{a.reason?<p className="mt-1 text-xs text-slate-600">{a.reason}</p>:null}</div>
   <details className="text-xs"><summary className="cursor-pointer font-bold text-indigo-600">View change</summary><pre className="mt-2 max-w-lg overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details>
  </div>)}</div></Surface>:null}
 </PageFrame></AppShell>;
}
