"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Tx={
 id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
 status:string;referenceNumber:string|null;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;
 charges:{amount:string}[];commissions:{amount:string}[];
};
type Paged={items:Tx[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
type Range="today"|"yesterday"|"week"|"all";
const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v??0));
const statusTone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";
const label=(t:string)=>t.replaceAll("_"," ").toLowerCase().replace(/w/g,c=>c.toUpperCase());
const dailyActions=[["CS","Card Swipe","/transactions/card-swipe"],["CT","Cash Transfer","/transactions/cash-transfer"],["AP","AePS","/transactions/aeps"],["MA","Micro ATM","/transactions/micro-atm"],["IT","Move Money","/transactions/internal-transfer"],["ATM","ATM Withdrawal","/transactions/atm-withdrawal"],["CC","Card Payment","/transactions/owner-credit-card-payment"],["EX","Expenses","/transactions/expense"]] as const;
const sum=(rows:{amount:string}[])=>rows.reduce((a,x)=>a+Number(x.amount),0);

export default function TransactionsPage(){
 const [items,setItems]=useState<Tx[]>([]);
 const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState(""),[range,setRange]=useState<Range>("today");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);

 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy:"transactionAt",sortDir:"desc"});
  if(q.trim())params.set("q",q.trim());if(type)params.set("type",type);if(status)params.set("status",status);
  if(range!=="all"){
   const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setHours(23,59,59,999);
   if(range==="yesterday"){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}
   if(range==="week")start.setDate(start.getDate()-6);
   params.set("from",start.toISOString());params.set("to",end.toISOString());
  }
  setLoading(true);
  return apiFetch<Paged>("/transactions?"+params.toString()).then(r=>{setItems(r.items);setPagination(r.pagination);setError("");}).finally(()=>setLoading(false));
 }
 useEffect(()=>{const initial=new URLSearchParams(window.location.search).get("type");if(!initial)return;const timer=window.setTimeout(()=>setType(initial),0);return()=>window.clearTimeout(timer);},[]);
 useEffect(()=>{const timer=setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to load transactions")),160);return()=>clearTimeout(timer);},[q,type,status,range,pagination.pageSize]);

 const totals=useMemo(()=>items.reduce((a,t)=>({
  gross:a.gross+Number(t.grossAmount),net:a.net+Number(t.netAmount??t.grossAmount),
  fees:a.fees+sum(t.charges),earnings:a.earnings+sum(t.commissions)-sum(t.charges),
 }),{gross:0,net:0,fees:0,earnings:0}),[items]);
 const grouped=items.reduce((map,t)=>{const k=new Date(t.transactionAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});const row=map.get(k)??[];row.push(t);map.set(k,row);return map;},new Map<string,Tx[]>());

 return <AppShell><PageFrame className="ui-preview transactions-preview">
  <SectionHeading title="Transactions"/>
  <div id="transaction-actions" className="grid scroll-mt-20 grid-cols-2 gap-2 sm:grid-cols-4">{dailyActions.map(([mark,title,href])=><Link key={href} href={href} className="app-quick-action flex min-h-14 items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 shadow-sm"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[10px] font-black text-[var(--accent)]">{mark}</span><span className="truncate text-sm font-bold">{title}</span></Link>)}</div>

  <Surface className="p-1.5"><div className="grid grid-cols-4 gap-1">{([["today","Today"],["yesterday","Yesterday"],["week","7 days"],["all","All"]] as [Range,string][]).map(([v,l])=><button key={v} onClick={()=>setRange(v)} className={"min-h-11 rounded-xl px-2 text-xs font-semibold transition "+(range===v?"bg-[var(--accent)] text-white":"text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]")}>{l}</button>)}</div></Surface>
  <Surface className="grid gap-2 p-3 sm:grid-cols-4">
   <input className="app-control sm:col-span-2" placeholder="Search name, transaction or reference" value={q} onChange={e=>setQ(e.target.value)}/>
   <select className="app-control" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","CUSTOMER_PAYOUT","CUSTOMER_RECEIPT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}</select>
   <select className="app-control" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All status</option>{["PENDING","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
  </Surface>

  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Processed</p><p className="money mt-1.5 truncate text-xl font-bold">{money(totals.gross)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Business earnings</p><p className="money mt-1.5 truncate text-xl font-bold text-[var(--money-in)]">{money(totals.earnings)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Provider / bank fees</p><p className="money mt-1.5 truncate text-xl font-bold text-[var(--money-out)]">{money(totals.fees)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Transactions</p><p className="money mt-1.5 text-xl font-bold">{pagination.total}</p></Surface>
  </div>

  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
  {loading?<PageLoader label="Loading transactions…"/>:<>
   <div className="space-y-4 md:hidden">
    {[...grouped.entries()].map(([day,rows])=><section key={day}><div className="sticky top-15 z-10 mb-1.5 bg-[var(--bg)] py-1 text-xs font-semibold text-[var(--text-muted)]">{day}</div><Surface className="overflow-hidden"><div className="divide-y divide-[var(--border)]">{rows.map(tx=>{const fees=sum(tx.charges),earn=sum(tx.commissions),profit=earn-fees;return <Link key={tx.id} href={"/transactions/"+tx.id} className="block px-4 py-3.5 hover:bg-[var(--surface-soft)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{label(tx.transactionType)}{tx.customer?" · "+tx.customer.fullName:""}</p><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{tx.transactionNumber} · {new Date(tx.transactionAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p></div><p className="money shrink-0 text-sm font-bold">{money(tx.grossAmount)}</p></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"><span className="text-[var(--text-muted)]">Customer / net <b className="text-[var(--text)]">{money(tx.netAmount??tx.grossAmount)}</b></span>{earn>0?<span className="font-bold text-[var(--money-in)]">Customer fee +{money(earn)}</span>:null}{fees>0?<span className="text-[var(--money-out)]">Provider fee −{money(fees)}</span>:null}{earn>0||fees>0?<span className={"font-bold "+(profit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]")}>Profit {money(profit)}</span>:null}<StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge></div></Link>})}</div></Surface></section>)}
    {!items.length?<EmptyState title="No transactions" description="Try another date or filter."/>:null}
   </div>

   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1240px] text-sm"><thead className="bg-[var(--surface-soft)] text-left text-[11px] text-[var(--text-muted)]"><tr><th className="px-4 py-3">Date</th><th>Service</th><th>Customer</th><th>Transaction</th><th className="text-right">Processed</th><th className="text-right">Customer fee</th><th className="text-right">Provider fee</th><th className="text-right">Profit</th><th className="text-right">Customer gets / net</th><th className="pl-4">Status</th></tr></thead><tbody>{items.map(tx=>{const providerFees=sum(tx.charges),customerFee=sum(tx.commissions),profit=customerFee-providerFees;return <tr key={tx.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-soft)]"><td className="px-4 py-3 text-xs">{new Date(tx.transactionAt).toLocaleString("en-IN")}</td><td className="font-medium">{label(tx.transactionType)}</td><td>{tx.customer?.fullName??"—"}</td><td><Link className="font-semibold text-[var(--accent)]" href={"/transactions/"+tx.id}>{tx.transactionNumber}</Link></td><td className="money text-right">{money(tx.grossAmount)}</td><td className="money text-right font-bold text-[var(--money-in)]">{customerFee?"+"+money(customerFee):"—"}</td><td className="money text-right text-[var(--money-out)]">{providerFees?"−"+money(providerFees):"—"}</td><td className={"money text-right font-bold "+(profit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{customerFee||providerFees?money(profit):"—"}</td><td className="money text-right font-semibold">{money(tx.netAmount??tx.grossAmount)}</td><td className="pl-4"><StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge></td></tr>})}</tbody></table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="transaction" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}
 </PageFrame></AppShell>;
}
