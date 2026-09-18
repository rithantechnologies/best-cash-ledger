"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface, Toolbar } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Tx={
 id:string;transactionNumber:string;transactionType:string;transactionAt:string;
 grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;
 customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;
};
type Paged={items:Tx[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v??0));
const statusTone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";

export default function TransactionsPage(){
 const [items,setItems]=useState<Tx[]>([]);
 const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState("");
 const [sortBy,setSortBy]=useState("transactionAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("desc");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);
 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir});
  if(q.trim())params.set("q",q.trim());if(type)params.set("type",type);if(status)params.set("status",status);
  setLoading(true);
  return apiFetch<Paged>("/transactions?"+params.toString())
   .then(r=>{setItems(r.items);setPagination(r.pagination);setError("");})
   .finally(()=>setLoading(false));
 }
 useEffect(()=>{
  const timer=setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to load transactions")),180);
  return()=>clearTimeout(timer);
 },[q,type,status,sortBy,sortDir,pagination.pageSize]);

 function sort(column:string){
  if(sortBy===column)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortBy(column);setSortDir("asc");}
 }
 const sh=(label:string,column:string)=><button onClick={()=>sort(column)} className="font-bold">{label}{sortBy===column?(sortDir==="asc"?" ↑":" ↓"):""}</button>;

 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Daily operations" title="Transactions" description="Review activity, find a reference quickly, or start the next counter transaction."
   action={<Link href="/transactions/new" className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm">+ New transaction</Link>}/>
  <Surface className="p-3 sm:p-4">
   <p className="mb-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Quick entry</p>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <Link href="/transactions/cash-transfer" className="surface-hover rounded-xl bg-emerald-50 px-3 py-3 text-center text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-100">Cash transfer</Link>
    <Link href="/transactions/card-swipe" className="surface-hover rounded-xl bg-indigo-50 px-3 py-3 text-center text-xs font-bold text-indigo-800 ring-1 ring-inset ring-indigo-100">Card swipe</Link>
    <Link href="/transactions/aeps" className="surface-hover rounded-xl bg-cyan-50 px-3 py-3 text-center text-xs font-bold text-cyan-800 ring-1 ring-inset ring-cyan-100">AePS</Link>
    <Link href="/transactions/micro-atm" className="surface-hover rounded-xl bg-sky-50 px-3 py-3 text-center text-xs font-bold text-sky-800 ring-1 ring-inset ring-sky-100">Micro ATM</Link>
   </div>
  </Surface>

  <Toolbar>
   <input className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm lg:col-span-1" placeholder="Search no, customer, reference…" value={q} onChange={e=>setQ(e.target.value)}/>
   <select className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={type} onChange={e=>setType(e.target.value)}><option value="">All transaction types</option>{["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","CUSTOMER_PAYOUT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}</select>
   <select className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
   <select className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
  </Toolbar>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {loading?<PageLoader label="Loading transactions…"/>:<>
   <div className="space-y-2 md:hidden">
    {items.map(tx=><Link key={tx.id} href={"/transactions/"+tx.id} className="surface-hover block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
     <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="truncate text-sm font-bold">{tx.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(tx.transactionAt).toLocaleString("en-IN")}</p></div>
      <StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{tx.status}</StatusBadge>
     </div>
     <div className="mt-3 flex items-end justify-between gap-3">
      <div className="min-w-0"><p className="truncate text-[11px] font-bold uppercase tracking-wide text-indigo-600">{tx.transactionType.replaceAll("_"," ")}</p><p className="mt-1 truncate text-sm text-slate-600">{tx.customer?.fullName??"No customer"}</p></div>
      <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-slate-400">Net</p><p className="font-black">{money(tx.netAmount??tx.grossAmount)}</p></div>
     </div>
     {tx.referenceNumber?<p className="mt-3 truncate border-t border-slate-100 pt-2 text-[11px] text-slate-400">Ref · {tx.referenceNumber}</p>:null}
    </Link>)}
    {!items.length?<EmptyState title="No matching transactions" description="Change the filters or start a new transaction."/>:null}
   </div>
   <Surface className="hidden overflow-hidden md:block">
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm">
     <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-[.12em] text-slate-400"><tr>
      <th className="px-5 py-3">{sh("No","transactionNumber")}</th><th>{sh("Date","transactionAt")}</th><th>{sh("Type","transactionType")}</th><th>Customer</th><th>Operator</th><th>{sh("Gross","grossAmount")}</th><th>{sh("Net","netAmount")}</th><th>{sh("Status","status")}</th><th className="pr-5">Reference</th>
     </tr></thead>
     <tbody>{items.map(tx=><tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50/60">
      <td className="px-5 py-3 font-bold"><Link href={"/transactions/"+tx.id} className="text-indigo-700 hover:underline">{tx.transactionNumber}</Link></td>
      <td className="text-xs text-slate-500">{new Date(tx.transactionAt).toLocaleString("en-IN")}</td>
      <td className="text-xs font-semibold">{tx.transactionType.replaceAll("_"," ")}</td><td>{tx.customer?.fullName??"—"}</td><td>{tx.createdBy?.fullName??"—"}</td>
      <td>{money(tx.grossAmount)}</td><td className="font-bold">{money(tx.netAmount)}</td><td><StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{tx.status}</StatusBadge></td><td className="pr-5 text-xs text-slate-500">{tx.referenceNumber??"—"}</td>
     </tr>)}</tbody>
    </table></div>
   </Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="transaction" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}
 </PageFrame></AppShell>;
}
