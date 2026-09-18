"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Collection={
  id:string;collectionDate:string;amount:string;referenceNumber:string|null;notes:string|null;status:string;
  destinationAccount:{accountName:string;accountType:string};
  transaction:{id:string;transactionNumber:string;status:string};
  createdBy:{id:string;fullName:string}|null;
};
type Receivable={
  id:string;reason:string;description:string|null;originalAmount:string;receivedAmount:string;remainingAmount:string;
  dueAt:string|null;status:string;createdAt:string;createdBy:{id:string;fullName:string}|null;
  customer:{id:string;fullName:string;customerCode:string};
  sourceAccount:{accountName:string;accountType:string}|null;
  sourceTransaction:{id:string;transactionNumber:string;referenceNumber:string|null;notes:string|null;status:string;transactionAt:string};
  collections:Collection[];
};
type Audit={id:string;action:string;reason:string|null;createdAt:string;oldValues:unknown;newValues:unknown;user:{fullName:string}|null};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const statusClass=(s:string)=>s==="OVERDUE"?"bg-red-50 text-red-700 ring-red-200":s==="RECEIVED"?"bg-emerald-50 text-emerald-700 ring-emerald-200":s==="PARTIALLY_RECEIVED"?"bg-blue-50 text-blue-700 ring-blue-200":s==="PENDING"?"bg-amber-50 text-amber-700 ring-amber-200":"bg-slate-100 text-slate-700 ring-slate-200";

export default function ReceivableDetailPage(){
  const {id}=useParams<{id:string}>();
  const [item,setItem]=useState<Receivable|null>(null);
  const [audit,setAudit]=useState<Audit[]>([]);
  const [error,setError]=useState("");

  useEffect(()=>{
    apiFetch<Receivable>("/receivables/"+id)
      .then(data=>{
        setItem(data);
        return apiFetch<Audit[]>("/audit?entityType=CUSTOMER_RECEIVABLE&entityId="+id).then(setAudit).catch(()=>{});
      })
      .catch(e=>setError(e instanceof Error?e.message:"Failed to load receivable"));
  },[id]);

  if(!item)return <AppShell><div className="rounded-2xl border bg-white p-6">{error||"Loading receivable..."}</div></AppShell>;
  const progress=Math.min(100,Math.max(0,Number(item.receivedAmount)/Math.max(1,Number(item.originalAmount))*100));

  return <AppShell><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link href="/receivables" className="text-sm font-medium text-indigo-600">← Receivables</Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[.16em] text-slate-500">{item.customer.customerCode}</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight">{item.customer.fullName}</h2>
        <p className="mt-1 text-sm text-slate-500">{item.reason}{item.description?" · "+item.description:""}</p>
      </div>
      <span className={"inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset "+statusClass(item.status)}>{item.status.replaceAll("_"," ")}</span>
    </div>

    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Original</p><p className="mt-2 text-2xl font-bold">{money(item.originalAmount)}</p></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received</p><p className="mt-2 text-2xl font-bold text-emerald-700">{money(item.receivedAmount)}</p></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remaining</p><p className="mt-2 text-2xl font-bold text-indigo-700">{money(item.remainingAmount)}</p></div>
    </section>

    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold">Collection progress</span><span>{progress.toFixed(0)}%</span></div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:progress+"%"}}/></div>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-500">Source</dt><dd className="mt-1 font-medium">{item.sourceAccount?item.sourceAccount.accountName+" · "+item.sourceAccount.accountType:"Opening / adjustment"}</dd></div>
        <div><dt className="text-slate-500">Due date</dt><dd className="mt-1 font-medium">{item.dueAt?new Date(item.dueAt).toLocaleString("en-IN"):"No due date"}</dd></div>
        <div><dt className="text-slate-500">Source transaction</dt><dd className="mt-1 font-medium">{item.sourceTransaction.transactionNumber}</dd></div>
        <div><dt className="text-slate-500">Reference</dt><dd className="mt-1 font-medium">{item.sourceTransaction.referenceNumber||"—"}</dd></div>
        <div><dt className="text-slate-500">Created</dt><dd className="mt-1 font-medium">{new Date(item.createdAt).toLocaleString("en-IN")}</dd></div>
        <div><dt className="text-slate-500">Created by</dt><dd className="mt-1 font-medium">{item.createdBy?.fullName||"Unknown operator"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">Notes</dt><dd className="mt-1 font-medium">{item.sourceTransaction.notes||"—"}</dd></div>
      </dl>
    </section>

    <section className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4"><h3 className="font-semibold">Collection History</h3><p className="text-xs text-slate-500">Every receipt recorded against this receivable.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Received Into</th><th>Amount</th><th>Reference</th><th>Operator</th><th>Status</th></tr></thead>
        <tbody>{item.collections.map(c=><tr key={c.id} className="border-t"><td className="px-5 py-3">{new Date(c.collectionDate).toLocaleString("en-IN")}</td><td>{c.transaction.transactionNumber}</td><td>{c.destinationAccount.accountName}</td><td className="font-semibold">{money(c.amount)}</td><td>{c.referenceNumber||"—"}</td><td>{c.createdBy?.fullName||"Unknown"}</td><td>{c.status}</td></tr>)}
        {!item.collections.length?<tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No collections recorded yet.</td></tr>:null}</tbody>
      </table></div>
    </section>

    {audit.length?<section className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4"><h3 className="font-semibold">Audit History</h3><p className="text-xs text-slate-500">Creation, collections, cancellation and other recorded changes.</p></div>
      <div className="divide-y">{audit.map(a=><div key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm"><div><p className="font-semibold">{a.action}</p><p className="text-xs text-slate-500">{a.user?.fullName||"Unknown operator"} · {new Date(a.createdAt).toLocaleString("en-IN")}</p>{a.reason?<p className="mt-1 text-xs text-slate-600">{a.reason}</p>:null}</div><details className="text-xs"><summary className="cursor-pointer font-medium text-indigo-600">View change</summary><pre className="mt-2 max-w-lg overflow-auto rounded bg-slate-50 p-2">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details></div>)}</div>
    </section>:null}
  </div></AppShell>;
}
