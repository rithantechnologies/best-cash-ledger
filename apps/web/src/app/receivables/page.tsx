"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Customer={id:string;fullName:string;customerCode:string};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean};
type Collection={id:string;collectionDate:string;amount:string;referenceNumber:string|null;destinationAccount:{accountName:string}};
type Receivable={
  id:string;reason:string;reasonCategory:string;description:string|null;originalAmount:string;receivedAmount:string;
  remainingAmount:string;dueAt:string|null;status:string;createdAt:string;
  customer:{id:string;fullName:string};sourceAccount:{accountName:string}|null;
  sourceTransaction:{referenceNumber:string|null};collections:Collection[];
};
type Page={items:Receivable[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
type Summary={customerReceivable:number;receivableBreakdown:{pendingAmount:number;pendingCount:number;partialAmount:number;partialCount:number;dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number}};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const badge=(s:string)=>({
  PENDING:"bg-amber-50 text-amber-700 ring-amber-200",
  PARTIALLY_RECEIVED:"bg-blue-50 text-blue-700 ring-blue-200",
  RECEIVED:"bg-emerald-50 text-emerald-700 ring-emerald-200",
  OVERDUE:"bg-red-50 text-red-700 ring-red-200",
  CANCELLED:"bg-slate-100 text-slate-600 ring-slate-200",
  REVERSED:"bg-slate-100 text-slate-600 ring-slate-200",
}[s]??"bg-slate-100 text-slate-700 ring-slate-200");

export default function ReceivablesPage(){
  const [items,setItems]=useState<Receivable[]>([]);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(1);
  const [q,setQ]=useState(""),[status,setStatus]=useState(""),[sortBy,setSortBy]=useState("dueAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("asc");
  const [customerId,setCustomerId]=useState(""),[amount,setAmount]=useState(""),[sourceAccountId,setSourceAccountId]=useState("");
  const [reason,setReason]=useState(""),[reasonCategory,setReasonCategory]=useState("OTHER"),[description,setDescription]=useState(""),[dueAt,setDueAt]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
  const [selected,setSelected]=useState<Receivable|null>(null),[collectAmount,setCollectAmount]=useState(""),[destination,setDestination]=useState("");
  const [collectReference,setCollectReference]=useState(""),[collectNotes,setCollectNotes]=useState("");
  const [cancelTarget,setCancelTarget]=useState<Receivable|null>(null),[cancelReason,setCancelReason]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[role,setRole]=useState("");

  async function load(targetPage=page){
    const params=new URLSearchParams({page:String(targetPage),pageSize:String(pageSize),sortBy,sortDir});
    if(q.trim())params.set("q",q.trim()); if(status)params.set("status",status);
    const data=await apiFetch<Page>("/receivables?"+params.toString());
    setItems(data.items);setPage(data.pagination.page);setTotal(data.pagination.total);setTotalPages(data.pagination.totalPages);
  }
  async function refreshAll(){
    const [s]=await Promise.all([apiFetch<Summary>("/dashboard/summary"),load()]);
    setSummary(s);
  }

  useEffect(()=>{
    try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}
    Promise.all([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<Summary>("/dashboard/summary"),
    ]).then(([c,a,s])=>{setCustomers(c);setAccounts(a);setSummary(s);return load(1);})
      .catch(e=>setError(e instanceof Error?e.message:"Failed to load receivables"));
  },[]);
  useEffect(()=>{load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to filter receivables"));},[q,status,sortBy,sortDir,pageSize]);

  async function createReceivable(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{
      await apiFetch("/receivables",{method:"POST",body:JSON.stringify({
        customerId,amount:Number(amount),sourceAccountId:sourceAccountId||undefined,reason,reasonCategory,
        description:description||undefined,dueAt:dueAt?new Date(dueAt+"T23:59:59").toISOString():undefined,
        referenceNumber:reference||undefined,notes:notes||undefined,
      })});
      setCustomerId("");setAmount("");setSourceAccountId("");setReason("");setReasonCategory("OTHER");setDescription("");setDueAt("");setReference("");setNotes("");
      await refreshAll();
    }catch(e){setError(e instanceof Error?e.message:"Failed to create receivable");}finally{setBusy(false);}
  }

  async function collect(e:FormEvent){
    e.preventDefault();if(!selected)return;setBusy(true);setError("");
    try{
      await apiFetch("/receivables/"+selected.id+"/collections",{method:"POST",body:JSON.stringify({
        amount:Number(collectAmount),destinationAccountId:destination,
        referenceNumber:collectReference||undefined,notes:collectNotes||undefined,
      })});
      setSelected(null);setCollectAmount("");setDestination("");setCollectReference("");setCollectNotes("");
      await refreshAll();
    }catch(e){setError(e instanceof Error?e.message:"Failed to record collection");}finally{setBusy(false);}
  }

  async function cancel(e:FormEvent){
    e.preventDefault();if(!cancelTarget||cancelReason.trim().length<3)return;
    try{
      await apiFetch("/receivables/"+cancelTarget.id+"/cancel",{method:"POST",body:JSON.stringify({reason:cancelReason.trim()})});
      setCancelTarget(null);setCancelReason("");await refreshAll();
    }catch(e){setError(e instanceof Error?e.message:"Cancellation failed");}
  }

  const liquidAccounts=useMemo(()=>accounts.filter(a=>a.isActive&&a.accountType!=="OWNER_CREDIT_CARD"),[accounts]);

  return <AppShell><div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-indigo-600">Money to receive</p><h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Customer Receivables</h2><p className="mt-1 text-sm text-slate-500">Track what must come back to the business, partial collections, due dates and the account that receives the money.</p></div>
      <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-lg"><p className="text-xs uppercase tracking-wider text-slate-300">Outstanding</p><p className="mt-1 text-2xl font-bold">{money(summary?.customerReceivable??0)}</p></div>
    </div>

    {summary?<section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {[
        ["Pending",summary.receivableBreakdown.pendingAmount,summary.receivableBreakdown.pendingCount,"text-amber-700"],
        ["Partially received",summary.receivableBreakdown.partialAmount,summary.receivableBreakdown.partialCount,"text-blue-700"],
        ["Due today",summary.receivableBreakdown.dueTodayAmount,summary.receivableBreakdown.dueTodayCount,"text-violet-700"],
        ["Overdue",summary.receivableBreakdown.overdueAmount,summary.receivableBreakdown.overdueCount,"text-red-700"],
      ].map(([label,value,count,tone])=><div key={String(label)} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={"mt-2 text-xl font-bold "+tone}>{money(Number(value))}</p><p className="mt-1 text-xs text-slate-500">{count} item(s)</p></div>)}
    </section>:null}

    <form onSubmit={createReceivable} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4"><h3 className="font-semibold">Add receivable</h3><p className="text-xs text-slate-500">Select a source account when money/value is leaving now. Leave it blank for an opening or legacy receivable.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select className="rounded-xl border px-3 py-2.5" value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName} · {c.customerCode}</option>)}</select>
        <input className="rounded-xl border px-3 py-2.5" type="number" step="0.01" min="0.01" placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)} required/>
        <select className="rounded-xl border px-3 py-2.5" value={sourceAccountId} onChange={e=>setSourceAccountId(e.target.value)}><option value="">Opening / adjustment (no source)</option>{liquidAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)}</option>)}</select>
        <input className="rounded-xl border px-3 py-2.5" type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)}/>
        <select className="rounded-xl border px-3 py-2.5" value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}><option value="ADVANCE">Advance</option><option value="SETTLEMENT_DUE">Settlement Due</option><option value="SHORTAGE_RECOVERY">Shortage Recovery</option><option value="LOAN">Loan</option><option value="ADJUSTMENT">Adjustment</option><option value="OTHER">Other</option></select>
        <input className="rounded-xl border px-3 py-2.5" placeholder="Reason / details" value={reason} onChange={e=>setReason(e.target.value)} required/>
        <input className="rounded-xl border px-3 py-2.5" placeholder="Reference" value={reference} onChange={e=>setReference(e.target.value)}/>
        <input className="rounded-xl border px-3 py-2.5 xl:col-span-2" placeholder="Description / notes" value={description} onChange={e=>setDescription(e.target.value)}/>
      </div>
      <div className="mt-4 flex justify-end"><button disabled={busy} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{busy?"Saving...":"Create Receivable"}</button></div>
    </form>

    {cancelTarget?<form onSubmit={cancel} className="rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-red-950">Cancel receivable — {cancelTarget.customer.fullName}</h3><p className="text-sm text-red-800">This reverses the source journal. Collections must be reversed first.</p></div><button type="button" onClick={()=>{setCancelTarget(null);setCancelReason("");}} className="text-sm font-semibold text-red-800">Close</button></div><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input className="flex-1 rounded-xl border bg-white px-3 py-2.5" value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Cancellation reason" minLength={3} required/><button className="rounded-xl bg-red-700 px-5 py-2.5 text-sm font-semibold text-white">Confirm Cancellation</button></div></form>:null}

    {selected?<form onSubmit={collect} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-emerald-950">Record collection — {selected.customer.fullName}</h3><p className="text-sm text-emerald-800">Remaining {money(selected.remainingAmount)}</p></div><button type="button" onClick={()=>setSelected(null)} className="text-sm font-medium text-emerald-800">Close</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <input className="rounded-xl border bg-white px-3 py-2.5" type="number" step="0.01" min="0.01" max={selected.remainingAmount} value={collectAmount} onChange={e=>setCollectAmount(e.target.value)} placeholder="Amount received" required/>
        <select className="rounded-xl border bg-white px-3 py-2.5" value={destination} onChange={e=>setDestination(e.target.value)} required><option value="">Received into...</option>{liquidAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>
        <input className="rounded-xl border bg-white px-3 py-2.5" placeholder="Reference / UTR" value={collectReference} onChange={e=>setCollectReference(e.target.value)}/>
        <input className="rounded-xl border bg-white px-3 py-2.5" placeholder="Collection notes" value={collectNotes} onChange={e=>setCollectNotes(e.target.value)}/>
      </div>
      <div className="mt-4 flex justify-end"><button disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white">Record Collection</button></div>
    </form>:null}

    <section className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input className="rounded-xl border px-3 py-2.5 lg:col-span-2" placeholder="Search customer, reason or reference..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select className="rounded-xl border px-3 py-2.5" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","PARTIALLY_RECEIVED","RECEIVED","OVERDUE","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
      <select className="rounded-xl border px-3 py-2.5" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="dueAt">Due date</option><option value="createdAt">Created</option><option value="remainingAmount">Remaining</option><option value="originalAmount">Original</option><option value="receivedAmount">Received</option><option value="status">Status</option></select>
      <select className="rounded-xl border px-3 py-2.5" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
    </section>

    {error?<p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}
    <div className="space-y-2 md:hidden">
      {items.map(r=><div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="truncate font-bold">{r.customer.fullName}</p><p className="mt-0.5 truncate text-xs text-slate-500">{r.reasonCategory.replaceAll("_"," ")} · {r.reason}</p></div>
          <span className={"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset "+badge(r.status)}>{r.status.replaceAll("_"," ")}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Original</p><p className="mt-1 text-sm font-semibold">{money(r.originalAmount)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Received</p><p className="mt-1 text-sm font-semibold text-emerald-700">{money(r.receivedAmount)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</p><p className="mt-1 text-sm font-bold">{money(r.remainingAmount)}</p></div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span className="truncate">{r.sourceAccount?.accountName??"Opening / adjustment"}</span><span className="shrink-0">{r.dueAt?"Due "+new Date(r.dueAt).toLocaleDateString("en-IN"):"No due date"}</span></div>
        <div className="mt-3 flex gap-2">
          <Link href={"/receivables/"+r.id} className="flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold">View</Link>
          <button onClick={()=>{setSelected(r);setCollectAmount(r.remainingAmount);setDestination("");}} disabled={Number(r.remainingAmount)<=0||["RECEIVED","CANCELLED","REVERSED"].includes(r.status)} className="min-h-10 flex-1 rounded-xl bg-emerald-700 text-sm font-semibold text-white disabled:opacity-40">Collect</button>
        </div>
      </div>)}
      {!items.length?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No matching receivables.</div>:null}
    </div>
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><table className="w-full min-w-[1050px] text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Customer / Reason</th><th>Original</th><th>Received</th><th>Remaining</th><th>Source</th><th>Due</th><th>Status</th><th className="px-4">Actions</th></tr></thead>
      <tbody>{items.map(r=><tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
        <td className="px-4 py-4"><p className="font-semibold">{r.customer.fullName}</p><p className="text-xs text-slate-500">{r.reasonCategory.replaceAll("_"," ")} · {r.reason}{r.description?" · "+r.description:""}</p></td>
        <td className="font-medium">{money(r.originalAmount)}</td><td className="text-emerald-700">{money(r.receivedAmount)}</td><td className="font-bold">{money(r.remainingAmount)}</td>
        <td>{r.sourceAccount?.accountName??"Opening / adjustment"}</td><td>{r.dueAt?new Date(r.dueAt).toLocaleDateString("en-IN"):"—"}</td>
        <td><span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset "+badge(r.status)}>{r.status.replaceAll("_"," ")}</span></td>
        <td className="px-4"><div className="flex gap-2"><Link href={"/receivables/"+r.id} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700">View</Link><button onClick={()=>{setSelected(r);setCollectAmount(r.remainingAmount);setDestination("");}} disabled={Number(r.remainingAmount)<=0||["RECEIVED","CANCELLED","REVERSED"].includes(r.status)} className="rounded-lg border border-emerald-300 px-3 py-1.5 font-medium text-emerald-700 disabled:opacity-40">Collect</button>{(role==="OWNER"||role==="ADMIN")&&Number(r.receivedAmount)===0&&Number(r.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(r.status)?<button onClick={()=>{setCancelTarget(r);setCancelReason("");}} className="rounded-lg border border-red-200 px-3 py-1.5 font-medium text-red-700">Cancel</button>:null}</div></td>
      </tr>)}
      {!items.length?<tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No matching receivables.</td></tr>:null}</tbody>
    </table></div>

    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-slate-500">{total} receivable(s) · Page {page} of {totalPages}</span><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={page<=1} onClick={()=>load(page-1)}>Previous</button><button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={page>=totalPages} onClick={()=>load(page+1)}>Next</button></div></div>
  </div></AppShell>;
}

