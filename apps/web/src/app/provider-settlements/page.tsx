"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Modal, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { SearchSelect } from "@/components/search-select";

type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean};
type Settlement={
 id:string;expectedAmount:string;receivedAmount:string;remainingAmount:string;dueAt:string|null;status:string;
 provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:{id:string;accountName:string};
 sourceTransaction:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;referenceNumber:string|null;customer:{fullName:string}|null};
};
type Paged={items:Settlement[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const input="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";

export default function ProviderSettlementsPage(){
 const [items,setItems]=useState<Settlement[]>([]),[accounts,setAccounts]=useState<Account[]>([]);
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(1);
 const [q,setQ]=useState(""),[status,setStatus]=useState(""),[selected,setSelected]=useState<Settlement|null>(null);
 const [amount,setAmount]=useState(""),[destination,setDestination]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(true);

 async function load(target=page){
  const params=new URLSearchParams({page:String(target),pageSize:String(pageSize)});
  if(q.trim())params.set("q",q.trim());if(status)params.set("status",status);
  const [p,a]=await Promise.all([apiFetch<Paged>("/provider-settlements?"+params.toString()),apiFetch<Account[]>("/dashboard/accounts")]);
  setItems(p.items);setPage(p.pagination.page);setTotal(p.pagination.total);setTotalPages(p.pagination.totalPages);
  setAccounts(a.filter(x=>x.isActive&&["BANK","UPI","PROVIDER_WALLET"].includes(x.accountType)));
 }
 useEffect(()=>{
  const t=window.setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to load settlements")).finally(()=>setLoading(false)),180);
  return()=>window.clearTimeout(t);
 },[q,status,pageSize]);

 async function receive(e:FormEvent){
  e.preventDefault();if(!selected)return;setBusy(true);setError("");
  try{await apiFetch("/provider-settlements/"+selected.id+"/receipts",{method:"POST",body:JSON.stringify({amount:Number(amount),destinationAccountId:destination,referenceNumber:reference||undefined,notes:notes||undefined})});setSelected(null);setAmount("");setDestination("");setReference("");setNotes("");await load();}
  catch(e){setError(e instanceof Error?e.message:"Settlement receipt failed");}finally{setBusy(false);}
 }

 const totals=useMemo(()=>items.reduce((a,s)=>({expected:a.expected+Number(s.expectedAmount),received:a.received+Number(s.receivedAmount),remaining:a.remaining+Number(s.remainingAmount)}),{expected:0,received:0,remaining:0}),[items]);
 const tone=(s:string):"emerald"|"indigo"|"amber"|"slate"=>s==="SETTLED"?"emerald":s==="PARTIALLY_SETTLED"?"indigo":s==="PENDING"?"amber":"slate";
 if(loading)return <AppShell><PageLoader label="Loading provider clearing…"/></AppShell>;

 return <AppShell><div className="page-enter mx-auto max-w-7xl space-y-5">
  <SectionHeading eyebrow="Provider clearing" title="Provider settlements" description="Track money expected from card and AePS providers until it actually reaches the target account."
   action={<Link href="/reports" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">Open reports</Link>}/>

  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"><Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Expected</p><p className="mt-1 text-lg font-black sm:text-2xl">{money(totals.expected)}</p></Surface><Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Received</p><p className="mt-1 text-lg font-black text-emerald-700 sm:text-2xl">{money(totals.received)}</p></Surface><Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">In clearing</p><p className="mt-1 text-lg font-black text-amber-700 sm:text-2xl">{money(totals.remaining)}</p></Surface></div>
  <Surface className="grid gap-2.5 p-3 sm:grid-cols-3 sm:p-4">
   <input className={input} placeholder="Search transaction, provider or reference…" value={q} onChange={e=>setQ(e.target.value)}/>
   <SearchableSelect className={input} value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","PARTIALLY_SETTLED","SETTLED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</SearchableSelect>
   <SearchableSelect className={input} value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</SearchableSelect>
  </Surface>

  <div className="space-y-2 md:hidden">{items.map(s=><Surface key={s.id} className="p-4">
   <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold">{s.sourceTransaction.transactionNumber}</p><p className="mt-0.5 truncate text-xs text-slate-400">{s.provider?.name??"Provider"}{s.gateway?" · "+s.gateway.gatewayName:""}{s.sourceTransaction.customer?" · "+s.sourceTransaction.customer.fullName:""}</p></div><StatusBadge tone={tone(s.status)}>{s.status.replaceAll("_"," ")}</StatusBadge></div>
   <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center"><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Expected</p><p className="mt-1 text-sm font-semibold">{money(s.expectedAmount)}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Received</p><p className="mt-1 text-sm font-semibold text-emerald-700">{money(s.receivedAmount)}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Remaining</p><p className="mt-1 text-sm font-bold text-amber-700">{money(s.remainingAmount)}</p></div></div>
   <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span className="truncate">{s.destinationAccount.accountName}</span><span className="shrink-0">{s.dueAt?"Due "+new Date(s.dueAt).toLocaleDateString("en-IN"):"No due date"}</span></div>
   {["PENDING","PARTIALLY_SETTLED"].includes(s.status)&&Number(s.remainingAmount)>0?<button onClick={()=>{setSelected(s);setAmount(s.remainingAmount);setDestination(s.destinationAccount.id);}} className="mt-3 min-h-10 w-full rounded-xl bg-emerald-700 text-sm font-bold text-white">Record receipt</button>:null}
  </Surface>)}{!items.length?<EmptyState title="No provider settlements found"/>:null}</div>

  <div className="hidden overflow-x-auto rounded-[22px] border border-slate-200 bg-white shadow-sm md:block"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Source</th><th>Provider</th><th>Expected</th><th>Received</th><th>Remaining</th><th>Target</th><th>Due</th><th>Status</th><th className="px-4">Action</th></tr></thead><tbody>{items.map(s=><tr key={s.id} className="border-t border-slate-100"><td className="px-4 py-4"><p className="font-semibold">{s.sourceTransaction.transactionNumber}</p><p className="text-xs text-slate-400">{s.sourceTransaction.transactionType.replaceAll("_"," ")}{s.sourceTransaction.customer?" · "+s.sourceTransaction.customer.fullName:""}</p></td><td>{s.provider?.name??"—"}{s.gateway?<span className="block text-xs text-slate-400">{s.gateway.gatewayName}</span>:null}</td><td>{money(s.expectedAmount)}</td><td className="text-emerald-700">{money(s.receivedAmount)}</td><td className="font-bold">{money(s.remainingAmount)}</td><td>{s.destinationAccount.accountName}</td><td>{s.dueAt?new Date(s.dueAt).toLocaleString("en-IN"):"—"}</td><td><StatusBadge tone={tone(s.status)}>{s.status.replaceAll("_"," ")}</StatusBadge></td><td className="px-4">{["PENDING","PARTIALLY_SETTLED"].includes(s.status)&&Number(s.remainingAmount)>0?<button onClick={()=>{setSelected(s);setAmount(s.remainingAmount);setDestination(s.destinationAccount.id);}} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">Receive</button>:<span className="text-xs text-slate-400">Complete</span>}</td></tr>)}{!items.length?<tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No provider settlements found.</td></tr>:null}</tbody></table></div>
  <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-slate-500">{total} settlement(s) · Page {page} of {totalPages}</span><div className="flex gap-2"><button className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40" disabled={page<=1} onClick={()=>load(page-1)}>Previous</button><button className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40" disabled={page>=totalPages} onClick={()=>load(page+1)}>Next</button></div></div>

  <Modal open={!!selected} title="Record provider receipt" description={selected?selected.sourceTransaction.transactionNumber+" · Remaining "+money(selected.remainingAmount):undefined} onClose={()=>setSelected(null)}>
   <form onSubmit={receive} className="space-y-3"><input className={input} type="number" min="0.01" step="0.01" max={selected?.remainingAmount} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount received" required/><SearchableSelect className={input} value={destination} onChange={e=>setDestination(e.target.value)} required><option value="">Received into…</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)}</option>)}</SearchableSelect><input className={input} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Settlement ID / UTR"/><textarea className={input+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes"/><button disabled={busy} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-40">{busy?"Saving receipt…":"Record receipt"}</button></form>
  </Modal>
 </div></AppShell>;
}
