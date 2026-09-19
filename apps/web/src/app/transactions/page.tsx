"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Tx={id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null};
type Paged={items:Tx[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
type Range="today"|"yesterday"|"week"|"all";
const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v??0));
const statusTone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";
const label=(t:string)=>t.replaceAll("_"," ").replace(/w/g,c=>c.toUpperCase());

export default function TransactionsPage(){
 const [items,setItems]=useState<Tx[]>([]);
 const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState(""),[range,setRange]=useState<Range>("today");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);
 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy:"transactionAt",sortDir:"desc"});
  if(q.trim())params.set("q",q.trim());if(type)params.set("type",type);if(status)params.set("status",status);
  if(range!=="all"){
   const start=new Date();start.setHours(0,0,0,0);
   const end=new Date(start);end.setHours(23,59,59,999);
   if(range==="yesterday"){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}
   if(range==="week")start.setDate(start.getDate()-6);
   params.set("from",start.toISOString());params.set("to",end.toISOString());
  }
  setLoading(true);
  return apiFetch<Paged>("/transactions?"+params.toString()).then(r=>{setItems(r.items);setPagination(r.pagination);setError("");}).finally(()=>setLoading(false));
 }
 useEffect(()=>{const initial=new URLSearchParams(window.location.search).get("type");if(!initial)return;const timer=window.setTimeout(()=>setType(initial),0);return()=>window.clearTimeout(timer);},[]);
 useEffect(()=>{const timer=setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to load transactions")),160);return()=>clearTimeout(timer);},[q,type,status,range,pagination.pageSize]);

 const totals=items.reduce((a,t)=>({gross:a.gross+Number(t.grossAmount),net:a.net+Number(t.netAmount??t.grossAmount)}),{gross:0,net:0});
 const grouped=items.reduce((map,t)=>{const k=new Date(t.transactionAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});const row=map.get(k)??[];row.push(t);map.set(k,row);return map;},new Map<string,Tx[]>());

 return <AppShell><PageFrame>
  <SectionHeading title="Transactions" action={<Link href="/transactions/new" className="inline-flex min-h-10 items-center rounded-lg bg-[var(--text)] px-4 text-sm font-semibold text-[var(--surface)]">+ New</Link>}/>
  <div className="flex gap-2 overflow-x-auto pb-1">{([["today","Today"],["yesterday","Yesterday"],["week","This week"],["all","All"]] as [Range,string][]).map(([v,l])=><button key={v} onClick={()=>setRange(v)} className={"min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold "+(range===v?"border-[var(--text)] bg-[var(--text)] text-[var(--surface)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{l}</button>)}</div>

  <Surface className="grid gap-2 p-3 sm:grid-cols-4">
   <input className="app-control sm:col-span-2" placeholder="Search customer, number, reference…" value={q} onChange={e=>setQ(e.target.value)}/>
   <select className="app-control" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","CUSTOMER_PAYOUT","CUSTOMER_RECEIPT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}</select>
   <select className="app-control" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All status</option>{["PENDING","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
  </Surface>

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
   <Surface className="p-3"><p className="text-xs text-[var(--text-muted)]">Transactions</p><p className="money mt-1 text-lg font-semibold">{pagination.total}</p></Surface>
   <Surface className="p-3"><p className="text-xs text-[var(--text-muted)]">Gross</p><p className="money mt-1 truncate text-lg font-semibold">{money(totals.gross)}</p></Surface>
   <Surface className="p-3"><p className="text-xs text-[var(--text-muted)]">Net</p><p className="money mt-1 truncate text-lg font-semibold">{money(totals.net)}</p></Surface>
  </div>

  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
  {loading?<PageLoader label="Loading transactions…"/>:<>
   <div className="space-y-4 md:hidden">
    {[...grouped.entries()].map(([day,rows])=><section key={day}><div className="sticky top-15 z-10 mb-1.5 bg-[var(--bg)] py-1 text-xs font-semibold text-[var(--text-muted)]">{day}</div><Surface className="overflow-hidden"><div className="divide-y divide-[var(--border)]">{rows.map(tx=><Link key={tx.id} href={"/transactions/"+tx.id} className="block px-4 py-3.5 hover:bg-[var(--surface-soft)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{label(tx.transactionType)}{tx.customer?" · "+tx.customer.fullName:""}</p><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{tx.transactionNumber} · {new Date(tx.transactionAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p></div><div className="text-right"><p className="money text-sm font-semibold">{money(tx.netAmount??tx.grossAmount)}</p><StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge></div></div></Link>)}</div></Surface></section>)}
    {!items.length?<EmptyState title="No transactions" description="Try another date or filter."/>:null}
   </div>
   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[var(--surface-soft)] text-left text-xs text-[var(--text-muted)]"><tr><th className="px-4 py-3">Date</th><th>Type</th><th>Customer</th><th>Transaction</th><th>Gross</th><th>Net</th><th>Status</th><th className="pr-4">Reference</th></tr></thead><tbody>{items.map(tx=><tr key={tx.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 text-xs">{new Date(tx.transactionAt).toLocaleString("en-IN")}</td><td className="font-medium">{label(tx.transactionType)}</td><td>{tx.customer?.fullName??"—"}</td><td><Link className="font-semibold text-[var(--accent)]" href={"/transactions/"+tx.id}>{tx.transactionNumber}</Link></td><td>{money(tx.grossAmount)}</td><td className="font-semibold">{money(tx.netAmount)}</td><td><StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge></td><td className="pr-4 text-xs text-[var(--text-muted)]">{tx.referenceNumber??"—"}</td></tr>)}</tbody></table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="transaction" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}
 </PageFrame></AppShell>;
}
