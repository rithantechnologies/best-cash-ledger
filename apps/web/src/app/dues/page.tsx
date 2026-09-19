"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, SegmentedTabs, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Tab="payables"|"receivables"|"settlements";
type Filter="all"|"overdue"|"today"|"week";
type Payable={id:string;remainingAmount:string;dueAt:string;status:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;status:string;reason:string;customer:{fullName:string}};
type Settlement={id:string;remainingAmount:string;dueAt:string|null;status:string;provider:{name:string}|null;sourceTransaction:{transactionNumber:string;customer:{fullName:string}|null}};
type Page<T>={items:T[];pagination:{total:number}};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const dayStart=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
function bucket(date:string|null){
  if(!date)return "week";
  const d=new Date(date),start=dayStart(),tomorrow=new Date(start);tomorrow.setDate(tomorrow.getDate()+1);
  const week=new Date(start);week.setDate(week.getDate()+7);
  if(d<start)return "overdue"; if(d<tomorrow)return "today"; if(d<week)return "week"; return "all";
}
function relative(date:string|null){
  if(!date)return "No due date";
  const target=new Date(date);target.setHours(0,0,0,0);
  const diff=Math.round((target.getTime()-dayStart().getTime())/86400000);
  if(diff===0)return "Today"; if(diff===1)return "Tomorrow"; if(diff===-1)return "1 day late";
  if(diff<0)return Math.abs(diff)+" days late"; if(diff<7)return "in "+diff+" days";
  return target.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
}

export default function DuesPage(){
 const [tab,setTab]=useState<Tab>("payables"),[filter,setFilter]=useState<Filter>("all");
 const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[settlements,setSettlements]=useState<Settlement[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{Promise.all([
  apiFetch<Page<Payable>>("/payables?page=1&pageSize=100&sortBy=dueAt&sortDir=asc"),
  apiFetch<Page<Receivable>>("/receivables?page=1&pageSize=100&sortBy=dueAt&sortDir=asc"),
  apiFetch<Page<Settlement>>("/provider-settlements?page=1&pageSize=100"),
 ]).then(([p,r,s])=>{setPayables(p.items);setReceivables(r.items);setSettlements(s.items);}).catch(e=>setError(e instanceof Error?e.message:"Failed to load dues")).finally(()=>setLoading(false));},[]);

 const openPayables=useMemo(()=>payables.filter(x=>Number(x.remainingAmount)>0&&!["PAID","CANCELLED","REVERSED"].includes(x.status)),[payables]);
 const openReceivables=useMemo(()=>receivables.filter(x=>Number(x.remainingAmount)>0&&!["RECEIVED","CANCELLED","REVERSED"].includes(x.status)),[receivables]);
 const openSettlements=useMemo(()=>settlements.filter(x=>Number(x.remainingAmount)>0&&!["SETTLED","CANCELLED","REVERSED"].includes(x.status)),[settlements]);
 const current=tab==="payables"?openPayables:tab==="receivables"?openReceivables:openSettlements;
 const filtered=current.filter(x=>filter==="all"||bucket(x.dueAt)===filter||(filter==="week"&&["today","week"].includes(bucket(x.dueAt))));
 const total=current.reduce((s,x)=>s+Number(x.remainingAmount),0);
 if(loading)return <AppShell><PageLoader label="Loading dues…"/></AppShell>;

 return <AppShell><PageFrame width="max-w-5xl">
  <div className="flex items-end justify-between gap-3"><div><h1 className="text-xl font-bold sm:text-2xl">Dues</h1><p className="mt-1 text-sm text-[var(--text-muted)]">{money(total)} open in {tab==="payables"?"customer payables":tab==="receivables"?"receivables":"provider clearing"}</p></div></div>
  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
  <SegmentedTabs<Tab> value={tab} onChange={v=>{setTab(v);setFilter("all");}} items={[
    {value:"payables",label:"To pay",count:openPayables.length},
    {value:"receivables",label:"To receive",count:openReceivables.length},
    {value:"settlements",label:"Settlements",count:openSettlements.length},
  ]}/>
  <div className="flex gap-2 overflow-x-auto pb-1">{(["all","overdue","today","week"] as Filter[]).map(v=><button key={v} onClick={()=>setFilter(v)} className={"min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold "+(filter===v?"border-[var(--text)] bg-[var(--text)] text-[var(--surface)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{v==="all"?"All":v==="week"?"This week":v[0].toUpperCase()+v.slice(1)}</button>)}</div>
  <Surface className="overflow-hidden">
   {filtered.length?<div className="divide-y divide-[var(--border)]">{filtered.map(item=>{
    const late=bucket(item.dueAt)==="overdue";
    if(tab==="payables"){const p=item as Payable;return <Link key={p.id} href={"/payables/"+p.id} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{p.customer.fullName}</p><p className={"mt-0.5 text-xs "+(late?"text-rose-600":"text-[var(--text-muted)]")}>{relative(p.dueAt)}</p></div><div className="text-right"><p className="money font-semibold">{money(p.remainingAmount)}</p><span className="text-xs font-semibold text-[var(--accent)]">Pay →</span></div></Link>}
    if(tab==="receivables"){const r=item as Receivable;return <Link key={r.id} href={"/receivables/"+r.id} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.customer.fullName}</p><p className={"mt-0.5 truncate text-xs "+(late?"text-rose-600":"text-[var(--text-muted)]")}>{r.reason} · {relative(r.dueAt)}</p></div><div className="text-right"><p className="money font-semibold">{money(r.remainingAmount)}</p><span className="text-xs font-semibold text-[var(--money-in)]">Receive →</span></div></Link>}
    const s=item as Settlement;return <Link key={s.id} href="/provider-settlements" className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{s.provider?.name??"Provider"} · {s.sourceTransaction.transactionNumber}</p><p className={"mt-0.5 truncate text-xs "+(late?"text-rose-600":"text-[var(--text-muted)]")}>{s.sourceTransaction.customer?.fullName??"Provider settlement"} · {relative(s.dueAt)}</p></div><div className="text-right"><p className="money font-semibold">{money(s.remainingAmount)}</p><span className="text-xs font-semibold text-[var(--accent)]">Open →</span></div></Link>
   })}</div>:<div className="p-4"><EmptyState title={filter==="all"?"Nothing open":"Nothing due here"} description="You are clear for this filter."/></div>}
  </Surface>
 </PageFrame></AppShell>;
}
