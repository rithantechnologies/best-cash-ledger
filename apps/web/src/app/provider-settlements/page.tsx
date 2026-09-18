"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean};
type Settlement={
  id:string;expectedAmount:string;receivedAmount:string;remainingAmount:string;dueAt:string|null;status:string;
  provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:{id:string;accountName:string};
  sourceTransaction:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;referenceNumber:string|null;customer:{fullName:string}|null};
};
type Paged={items:Settlement[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));

export default function ProviderSettlementsPage(){
  const [items,setItems]=useState<Settlement[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(1);
  const [q,setQ]=useState(""),[status,setStatus]=useState("");
  const [selected,setSelected]=useState<Settlement|null>(null);
  const [amount,setAmount]=useState(""),[destination,setDestination]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");

  async function load(target=page){
    const params=new URLSearchParams({page:String(target),pageSize:String(pageSize)});
    if(q.trim())params.set("q",q.trim()); if(status)params.set("status",status);
    const [p,a]=await Promise.all([
      apiFetch<Paged>("/provider-settlements?"+params.toString()),
      apiFetch<Account[]>("/dashboard/accounts"),
    ]);
    setItems(p.items);setPage(p.pagination.page);setTotal(p.pagination.total);setTotalPages(p.pagination.totalPages);
    setAccounts(a.filter(x=>x.isActive&&["BANK","UPI","PROVIDER_WALLET"].includes(x.accountType)));
  }

  useEffect(()=>{const t=setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to load settlements")),180);return()=>clearTimeout(t);},[q,status,pageSize]);

  async function receive(e:FormEvent){
    e.preventDefault();if(!selected)return;setBusy(true);setError("");
    try{
      await apiFetch("/provider-settlements/"+selected.id+"/receipts",{method:"POST",body:JSON.stringify({
        amount:Number(amount),destinationAccountId:destination,referenceNumber:reference||undefined,notes:notes||undefined,
      })});
      setSelected(null);setAmount("");setDestination("");setReference("");setNotes("");await load();
    }catch(e){setError(e instanceof Error?e.message:"Settlement receipt failed");}finally{setBusy(false);}
  }

  const badge=(s:string)=>s==="SETTLED"?"bg-emerald-50 text-emerald-700":s==="PARTIALLY_SETTLED"?"bg-blue-50 text-blue-700":s==="PENDING"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-600";

  return <AppShell><div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Provider clearing</p><h2 className="mt-1 text-3xl font-bold tracking-tight">Provider Settlements</h2><p className="mt-1 text-sm text-slate-500">Money expected from card/AePS providers stays here until it actually reaches the target bank, UPI or wallet.</p></div><Link href="/reports" className="rounded-xl border px-4 py-2 text-sm font-semibold">Reports</Link></div>

    {selected?<form onSubmit={receive} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">Record provider receipt</h3><p className="text-sm text-slate-600">{selected.sourceTransaction.transactionNumber} · Remaining {money(selected.remainingAmount)}</p></div><button type="button" onClick={()=>setSelected(null)} className="text-sm font-semibold">Close</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <input className="rounded-xl border bg-white px-3 py-2.5" type="number" min="0.01" step="0.01" max={selected.remainingAmount} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount received" required/>
        <select className="rounded-xl border bg-white px-3 py-2.5" value={destination} onChange={e=>setDestination(e.target.value)} required><option value="">Received into...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)}</option>)}</select>
        <input className="rounded-xl border bg-white px-3 py-2.5" value={reference} onChange={e=>setReference(e.target.value)} placeholder="Settlement ID / UTR"/>
        <input className="rounded-xl border bg-white px-3 py-2.5" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes"/>
      </div>
      <div className="mt-4 flex justify-end"><button disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?"Saving...":"Record Receipt"}</button></div>
    </form>:null}

    <section className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-3">
      <input className="rounded-xl border px-3 py-2.5" placeholder="Search transaction, provider or reference..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select className="rounded-xl border px-3 py-2.5" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","PARTIALLY_SETTLED","SETTLED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
      <select className="rounded-xl border px-3 py-2.5" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
    </section>

    {error?<p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm"><table className="w-full min-w-[1100px] text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Source</th><th>Provider</th><th>Expected</th><th>Received</th><th>Remaining</th><th>Target</th><th>Due</th><th>Status</th><th className="px-4">Action</th></tr></thead>
      <tbody>{items.map(s=><tr key={s.id} className="border-t">
        <td className="px-4 py-4"><p className="font-semibold">{s.sourceTransaction.transactionNumber}</p><p className="text-xs text-slate-500">{s.sourceTransaction.transactionType}{s.sourceTransaction.customer?" · "+s.sourceTransaction.customer.fullName:""}</p></td>
        <td>{s.provider?.name??"—"}{s.gateway?<span className="block text-xs text-slate-500">{s.gateway.gatewayName}</span>:null}</td>
        <td>{money(s.expectedAmount)}</td><td className="text-emerald-700">{money(s.receivedAmount)}</td><td className="font-bold">{money(s.remainingAmount)}</td>
        <td>{s.destinationAccount.accountName}</td><td>{s.dueAt?new Date(s.dueAt).toLocaleString("en-IN"):"—"}</td>
        <td><span className={"rounded-full px-2.5 py-1 text-xs font-semibold "+badge(s.status)}>{s.status.replaceAll("_"," ")}</span></td>
        <td className="px-4">{["PENDING","PARTIALLY_SETTLED"].includes(s.status)&&Number(s.remainingAmount)>0?<button onClick={()=>{setSelected(s);setAmount(s.remainingAmount);setDestination(s.destinationAccount.id);}} className="rounded-lg border border-emerald-300 px-3 py-1.5 font-semibold text-emerald-700">Receive</button>:<span className="text-xs text-slate-400">Complete</span>}</td>
      </tr>)}
      {!items.length?<tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No provider settlements found.</td></tr>:null}</tbody>
    </table></div>

    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{total} settlement(s) · Page {page} of {totalPages}</span><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={page<=1} onClick={()=>load(page-1)}>Previous</button><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={page>=totalPages} onClick={()=>load(page+1)}>Next</button></div></div>
  </div></AppShell>;
}
