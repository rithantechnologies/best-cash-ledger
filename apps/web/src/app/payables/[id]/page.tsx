"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Payment={
  id:string;paymentDate:string;amount:string;referenceNumber:string|null;notes:string|null;status:string;
  sourceAccount:{accountName:string;accountType:string};
  transaction:{transactionNumber:string;status:string};
  createdBy:{id:string;fullName:string}|null;
};
type Payable={
  id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string;createdAt:string;
  customer:{id:string;fullName:string;customerCode:string};paymentTerm:{name:string}|null;
  sourceTransaction:{id:string;transactionNumber:string;transactionAt:string;referenceNumber:string|null;notes:string|null;status:string;cardSwipe:any;providerSettlementSource:any;charges:{amount:string}[];commissions:{amount:string}[]};
  payments:Payment[];createdBy:{id:string;fullName:string}|null;
};
type Audit={id:string;action:string;reason:string|null;createdAt:string;oldValues:unknown;newValues:unknown;user:{fullName:string}|null};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));

export default function PayableDetailPage(){
  const {id}=useParams<{id:string}>();
  const [item,setItem]=useState<Payable|null>(null),[audit,setAudit]=useState<Audit[]>([]),[error,setError]=useState("");
  useEffect(()=>{
    apiFetch<Payable>("/payables/"+id).then(x=>{setItem(x);return apiFetch<Audit[]>("/audit?entityType=CUSTOMER_PAYABLE&entityId="+id).then(setAudit).catch(()=>{});})
      .catch(e=>setError(e instanceof Error?e.message:"Failed to load payable"));
  },[id]);
  if(!item)return <AppShell><div className="rounded-2xl border bg-white p-6">{error||"Loading payable..."}</div></AppShell>;
  const progress=Math.min(100,Math.max(0,Number(item.paidAmount)/Math.max(1,Number(item.originalAmount))*100));
  const charge=item.sourceTransaction.charges.reduce((s,x)=>s+Number(x.amount),0);
  const commission=item.sourceTransaction.commissions.reduce((s,x)=>s+Number(x.amount),0);

  return <AppShell><div className="mx-auto max-w-6xl space-y-6">
    <div><Link href="/payables" className="text-sm font-semibold text-indigo-600">← Payables</Link><p className="mt-3 text-xs font-semibold uppercase tracking-[.16em] text-slate-500">{item.customer.customerCode}</p><h2 className="mt-1 text-3xl font-bold">{item.customer.fullName}</h2><p className="mt-1 text-sm text-slate-500">{item.sourceTransaction.transactionNumber} · Due {new Date(item.dueAt).toLocaleString("en-IN")}</p></div>
    <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase text-slate-500">Original</p><p className="mt-2 text-2xl font-bold">{money(item.originalAmount)}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase text-slate-500">Paid</p><p className="mt-2 text-2xl font-bold text-emerald-700">{money(item.paidAmount)}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase text-slate-500">Remaining</p><p className="mt-2 text-2xl font-bold text-amber-700">{money(item.remainingAmount)}</p></div></section>

    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex justify-between text-sm"><strong>Payout progress</strong><span>{progress.toFixed(0)}%</span></div><div className="mt-3 h-3 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:progress+"%"}}/></div>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-slate-500">Status</dt><dd className="mt-1 font-semibold">{item.status.replaceAll("_"," ")}</dd></div><div><dt className="text-slate-500">Payment term</dt><dd className="mt-1 font-semibold">{item.paymentTerm?.name||"—"}</dd></div><div><dt className="text-slate-500">Operator</dt><dd className="mt-1 font-semibold">{item.createdBy?.fullName||"Unknown"}</dd></div><div><dt className="text-slate-500">Source reference</dt><dd className="mt-1 font-semibold">{item.sourceTransaction.referenceNumber||"—"}</dd></div><div><dt className="text-slate-500">Provider charge</dt><dd className="mt-1 font-semibold">{money(charge)}</dd></div><div><dt className="text-slate-500">Customer commission</dt><dd className="mt-1 font-semibold">{money(commission)}</dd></div><div><dt className="text-slate-500">Provider settlement</dt><dd className="mt-1 font-semibold">{item.sourceTransaction.providerSettlementSource?.status?.replaceAll("_"," ")||"—"}</dd></div><div><dt className="text-slate-500">Created</dt><dd className="mt-1 font-semibold">{new Date(item.createdAt).toLocaleString("en-IN")}</dd></div></dl>
    </section>

    <section className="rounded-2xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h3 className="font-semibold">Payout History</h3><p className="text-xs text-slate-500">Every payment made against this customer payable.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Paid From</th><th>Amount</th><th>Reference</th><th>Operator</th><th>Status</th></tr></thead><tbody>{item.payments.map(p=><tr key={p.id} className="border-t"><td className="px-5 py-3">{new Date(p.paymentDate).toLocaleString("en-IN")}</td><td>{p.transaction.transactionNumber}</td><td>{p.sourceAccount.accountName}</td><td className="font-semibold">{money(p.amount)}</td><td>{p.referenceNumber||"—"}</td><td>{p.createdBy?.fullName||"Unknown"}</td><td>{p.status}</td></tr>)}{!item.payments.length?<tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No payouts recorded yet.</td></tr>:null}</tbody></table></div></section>

    {audit.length?<section className="rounded-2xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h3 className="font-semibold">Audit History</h3></div><div className="divide-y">{audit.map(a=><div key={a.id} className="flex flex-wrap justify-between gap-3 px-5 py-4 text-sm"><div><p className="font-semibold">{a.action}</p><p className="text-xs text-slate-500">{a.user?.fullName||"Unknown operator"} · {new Date(a.createdAt).toLocaleString("en-IN")}</p>{a.reason?<p className="mt-1 text-xs text-slate-600">{a.reason}</p>:null}</div><details className="text-xs"><summary className="cursor-pointer font-semibold text-indigo-600">View change</summary><pre className="mt-2 max-w-lg overflow-auto rounded bg-slate-50 p-2">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details></div>)}</div></section>:null}
  </div></AppShell>;
}
