"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Payable = {
  id:string;originalAmount:string;paidAmount:string;remainingAmount:string;
  dueAt:string;status:string;customer:{fullName:string};
};
type Account={id:string;accountName:string;accountType:string;currentBalance:number};
type Paged={items:Payable[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v));

export default function PayablesPage(){
  const [items,setItems]=useState<Payable[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
  const [q,setQ]=useState("");
  const [status,setStatus]=useState("");
  const [sortBy,setSortBy]=useState("dueAt");
  const [sortDir,setSortDir]=useState<"asc"|"desc">("asc");
  const [selected,setSelected]=useState<Payable|null>(null);
  const [amount,setAmount]=useState("");
  const [source,setSource]=useState("");
  const [reference,setReference]=useState("");
  const [paymentNotes,setPaymentNotes]=useState("");
  const [role,setRole]=useState("");
  const [cancelTarget,setCancelTarget]=useState<Payable|null>(null);
  const [cancelReason,setCancelReason]=useState("");
  const [error,setError]=useState("");

  function load(page=pagination.page){
    const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir});
    if(q.trim())params.set("q",q.trim());
    if(status)params.set("status",status);
    return Promise.all([
      apiFetch<Paged>("/payables?"+params.toString()),
      apiFetch<Account[]>("/dashboard/accounts"),
    ]).then(([p,a])=>{setItems(p.items);setPagination(p.pagination);setAccounts(a);});
  }

  useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);
  useEffect(()=>{
    const timer=setTimeout(()=>load(1).catch(()=>setError("Failed to load payables")),200);
    return()=>clearTimeout(timer);
  },[q,status,sortBy,sortDir,pagination.pageSize]);

  async function pay(e:FormEvent){
    e.preventDefault();if(!selected)return;setError("");
    try{
      await apiFetch("/payables/"+selected.id+"/payments",{method:"POST",body:JSON.stringify({
        amount:Number(amount),sourceAccountId:source,referenceNumber:reference||undefined,notes:paymentNotes||undefined,
      })});
      setSelected(null);setAmount("");setReference("");setPaymentNotes("");await load();
    }catch(err){setError(err instanceof Error?err.message:"Payment failed");}
  }

  async function cancelPayable(e:FormEvent){
    e.preventDefault();if(!cancelTarget||cancelReason.trim().length<3)return;
    setError("");
    try{
      await apiFetch("/payables/"+cancelTarget.id+"/cancel",{method:"POST",body:JSON.stringify({reason:cancelReason.trim()})});
      if(selected?.id===cancelTarget.id)setSelected(null);
      setCancelTarget(null);setCancelReason("");
      await load();
    }catch(err){setError(err instanceof Error?err.message:"Cancellation failed");}
  }

  function sort(column:string){
    if(sortBy===column)setSortDir(d=>d==="asc"?"desc":"asc");
    else{setSortBy(column);setSortDir("asc");}
  }
  const sh=(label:string,col:string)=><button onClick={()=>sort(col)} className="font-semibold">{label}{sortBy===col?(sortDir==="asc"?" ↑":" ↓"):""}</button>;

  return <AppShell><div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
    <div><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Customer Payables</h2><p className="mt-1 text-sm text-slate-500">Track what the business still owes customers and record payouts.</p></div>

    {cancelTarget?<form onSubmit={cancelPayable} className="rounded-xl border border-red-200 bg-red-50 p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-red-950">Cancel payable for {cancelTarget.customer.fullName}</p><p className="text-sm text-red-800">This reverses the source transaction. Existing payouts must be reversed first.</p></div><button type="button" onClick={()=>{setCancelTarget(null);setCancelReason("");}} className="text-sm font-semibold text-red-800">Close</button></div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input className="flex-1 rounded-lg border bg-white px-3 py-2.5" value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Cancellation reason" minLength={3} required/><button className="rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white">Confirm Cancellation</button></div>
    </form>:null}

    {selected?<form onSubmit={pay} className="grid gap-3 rounded-xl border border-slate-300 bg-white p-5 md:grid-cols-5">
      <div className="md:col-span-5"><p className="font-semibold">Pay {selected.customer.fullName}</p><p className="text-sm text-slate-500">Remaining {money(selected.remainingAmount)}</p></div>
      <input className="rounded-lg border px-3 py-2" type="number" step="0.01" max={selected.remainingAmount} min="0.01" placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)} required/>
      <select className="rounded-lg border px-3 py-2 md:col-span-2" value={source} onChange={e=>setSource(e.target.value)} required><option value="">Source account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} — {money(a.currentBalance)}</option>)}</select>
      <input className="rounded-lg border px-3 py-2" placeholder="Reference / UTR" value={reference} onChange={e=>setReference(e.target.value)}/>
      <input className="rounded-lg border px-3 py-2" placeholder="Payment notes (optional)" value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)}/>
      <button className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white">Record Payment</button>
    </form>:null}

    <section className="grid gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
      <input className="rounded-lg border px-3 py-2" placeholder="Search customer..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select className="rounded-lg border px-3 py-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
      <select className="rounded-lg border px-3 py-2" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="dueAt">Due date</option><option value="createdAt">Created</option><option value="remainingAmount">Remaining</option><option value="originalAmount">Original</option><option value="paidAmount">Paid</option><option value="status">Status</option></select>
      <select className="rounded-lg border px-3 py-2" value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
    </section>

    {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
    <div className="space-y-2 md:hidden">
      {items.map(p=><div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="truncate font-bold">{p.customer.fullName}</p><p className="mt-0.5 text-xs text-slate-500">Due {new Date(p.dueAt).toLocaleDateString("en-IN")}</p></div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{p.status.replaceAll("_"," ")}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Original</p><p className="mt-1 text-sm font-semibold">{money(p.originalAmount)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Paid</p><p className="mt-1 text-sm font-semibold text-emerald-700">{money(p.paidAmount)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</p><p className="mt-1 text-sm font-bold">{money(p.remainingAmount)}</p></div>
        </div>
        <div className="mt-3 flex gap-2">
          <Link href={"/payables/"+p.id} className="flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold">View</Link>
          <button onClick={()=>{setSelected(p);setAmount(p.remainingAmount);setSource("");}} disabled={Number(p.remainingAmount)<=0||["CANCELLED","REVERSED","PAID"].includes(p.status)} className="min-h-10 flex-1 rounded-xl bg-slate-950 text-sm font-semibold text-white disabled:opacity-40">Pay</button>
        </div>
      </div>)}
      {!items.length?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No matching payables.</div>:null}
    </div>
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><table className="w-full min-w-[900px] text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">{sh("Original","originalAmount")}</th><th className="px-4 py-3">{sh("Paid","paidAmount")}</th><th className="px-4 py-3">{sh("Remaining","remainingAmount")}</th><th className="px-4 py-3">{sh("Due","dueAt")}</th><th className="px-4 py-3">{sh("Status","status")}</th><th className="px-4 py-3">Actions</th></tr></thead>
      <tbody>{items.map(p=><tr key={p.id} className="border-t"><td className="px-4 py-3 font-medium">{p.customer.fullName}</td><td className="px-4 py-3">{money(p.originalAmount)}</td><td className="px-4 py-3">{money(p.paidAmount)}</td><td className="px-4 py-3 font-semibold">{money(p.remainingAmount)}</td><td className="px-4 py-3">{new Date(p.dueAt).toLocaleString("en-IN")}</td><td className="px-4 py-3">{p.status}</td><td className="px-4 py-3"><div className="flex gap-2"><Link href={"/payables/"+p.id} className="rounded-lg border px-3 py-1.5 font-medium">View</Link><button onClick={()=>{setSelected(p);setAmount(p.remainingAmount);setSource("");}} disabled={Number(p.remainingAmount)<=0||["CANCELLED","REVERSED","PAID"].includes(p.status)} className="rounded-lg border px-3 py-1.5 font-medium disabled:opacity-40">Pay</button>{(role==="OWNER"||role==="ADMIN")&&Number(p.paidAmount)===0&&Number(p.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(p.status)?<button onClick={()=>{setCancelTarget(p);setCancelReason("");}} className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700">Cancel</button>:null}</div></td></tr>)}
      {!items.length?<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No matching payables.</td></tr>:null}</tbody>
    </table></div>

    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-slate-500">{pagination.total} payable(s) · Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page<=1} onClick={()=>load(pagination.page-1).catch(()=>{})}>Previous</button><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page>=pagination.totalPages} onClick={()=>load(pagination.page+1).catch(()=>{})}>Next</button></div></div>
  </div></AppShell>;
}
