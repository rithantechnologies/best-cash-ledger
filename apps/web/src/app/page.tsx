"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Breakdown={dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number};
type Summary={cashBalance:number;customerPayable:number;customerReceivable:number;pendingProviderSettlements:number;payableBreakdown:Breakdown;receivableBreakdown:Breakdown};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean};
type Today={commission:number;providerCharges:number;cardSwipe:number;aeps:number;microAtm:number;cashIn:number;cashOut:number};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;reason:string;customer:{fullName:string}};
type Settlement={id:string;remainingAmount:string;dueAt:string|null;status:string;provider:{name:string}|null;sourceTransaction:{transactionNumber:string;customer:{fullName:string}|null}};
type Tx={id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;status:string;customer:{fullName:string}|null};
type Paged<T>={items:T[]};
type Counter={id:string;status:string;cashAccount:{accountName:string};openingTotal:string}|null;
type Eod={businessDate:string;snapshot:{id:string}|null;openCashSessions:number};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const compact=(v:number)=>new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1,style:"currency",currency:"INR"}).format(v);
function dueWithin(date:string|null,days:number){if(!date)return false;const now=new Date();now.setHours(0,0,0,0);const end=new Date(now);end.setDate(end.getDate()+days);const d=new Date(date);return d>=now&&d<end;}
function rel(date:string|null){if(!date)return "No due date";const d=new Date(date);d.setHours(0,0,0,0);const n=new Date();n.setHours(0,0,0,0);const x=Math.round((d.getTime()-n.getTime())/86400000);if(x===0)return "Today";if(x===1)return "Tomorrow";if(x<0)return Math.abs(x)+"d late";return "in "+x+"d";}

export default function DashboardPage(){
 const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
 const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[settlements,setSettlements]=useState<Settlement[]>([]),[activity,setActivity]=useState<Tx[]>([]);
 const [counter,setCounter]=useState<Counter>(null),[eod,setEod]=useState<Eod|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{Promise.all([
  apiFetch<Summary>("/dashboard/summary"),
  apiFetch<Account[]>("/dashboard/accounts"),
  apiFetch<Today>("/dashboard/today"),
  apiFetch<Payable[]>("/dashboard/payables"),
  apiFetch<Receivable[]>("/dashboard/receivables"),
  apiFetch<Paged<Settlement>>("/provider-settlements?page=1&pageSize=100"),
  apiFetch<Paged<Tx>>("/transactions?page=1&pageSize=10&sortBy=transactionAt&sortDir=desc"),
  apiFetch<Counter>("/cash-counter/current"),
  apiFetch<Eod>("/end-of-day/status"),
 ]).then(([s,a,t,p,r,ps,tx,c,e])=>{setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setSettlements(ps.items);setActivity(tx.items);setCounter(c);setEod(e);}).catch(err=>setError(err instanceof Error?err.message:"Dashboard failed to load")).finally(()=>setLoading(false));},[]);

 const arrivingWeek=useMemo(()=>receivables.filter(x=>dueWithin(x.dueAt,7)).reduce((s,x)=>s+Number(x.remainingAmount),0)+settlements.filter(x=>Number(x.remainingAmount)>0&&dueWithin(x.dueAt,7)).reduce((s,x)=>s+Number(x.remainingAmount),0),[receivables,settlements]);
 const earned=today?.commission??0;
 const liquid=accounts.filter(a=>a.isActive&&a.accountType!=="OWNER_CREDIT_CARD");
 const tasks=useMemo(()=>{
  const rows:{title:string;meta:string;amount?:string;href:string;action:string;tone?:"rose"|"amber"}[]=[];
  payables.filter(x=>Number(x.remainingAmount)>0).slice(0,2).forEach(x=>rows.push({title:"Pay "+x.customer.fullName,meta:rel(x.dueAt),amount:money(x.remainingAmount),href:"/payables/"+x.id,action:"Pay",tone:x.bucket==="OVERDUE"?"rose":"amber"}));
  settlements.filter(x=>Number(x.remainingAmount)>0&&!["SETTLED","CANCELLED","REVERSED"].includes(x.status)).slice(0,2).forEach(x=>rows.push({title:(x.provider?.name??"Provider")+" settlement",meta:rel(x.dueAt),amount:money(x.remainingAmount),href:"/provider-settlements",action:"Receive",tone:rel(x.dueAt).includes("late")?"rose":"amber"}));
  if(counter)rows.push({title:"Cash counter is open",meta:counter.cashAccount.accountName,href:"/cash-counter",action:"Close"});
  if(eod&&!eod.snapshot)rows.push({title:"End of day not saved",meta:eod.openCashSessions?eod.openCashSessions+" counter open":"Ready to review",href:"/end-of-day",action:"Review"});
  return rows.slice(0,6);
 },[payables,settlements,counter,eod]);

 const days=useMemo(()=>Array.from({length:7},(_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+i);const next=new Date(d);next.setDate(next.getDate()+1);const amount=settlements.filter(s=>s.dueAt&&new Date(s.dueAt)>=d&&new Date(s.dueAt)<next&&Number(s.remainingAmount)>0).reduce((sum,s)=>sum+Number(s.remainingAmount),0);return {date:d,amount};}),[settlements]);
 if(loading)return <AppShell><PageLoader label="Loading today…"/></AppShell>;

 return <AppShell><div className="page-enter mx-auto max-w-7xl space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h1 className="text-xl font-bold sm:text-2xl">Today</h1><p className="mt-0.5 text-sm text-[var(--text-muted)]">{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})}</p></div>
   <div className="flex flex-wrap gap-2 text-xs"><Link href="/cash-counter" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-semibold">{counter?"Counter open":"Counter closed"}</Link><Link href="/end-of-day" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-semibold">{eod?.snapshot?"EOD saved":"EOD pending"}</Link></div>
  </div>
  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}

  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
   {[
    ["Cash in hand",summary?.cashBalance??0,"/accounts"],
    ["To pay today",summary?.payableBreakdown.dueTodayAmount??0,"/dues"],
    ["Arriving this week",arrivingWeek,"/dues"],
    ["Commission today",earned,"/reports"],
   ].map(([label,value,href])=><Link key={String(label)} href={String(href)} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 hover:bg-[var(--surface-soft)]"><p className="text-xs font-medium text-[var(--text-muted)]">{label}</p><p className="money mt-2 text-xl font-semibold sm:text-2xl">{compact(Number(value))}</p></Link>)}
  </div>

  <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
   <Surface className="overflow-hidden">
    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><h2 className="font-semibold">Do now</h2><Link href="/dues" className="text-xs font-semibold text-[var(--accent)]">All dues</Link></div>
    {tasks.length?<div className="divide-y divide-[var(--border)]">{tasks.map((t,i)=><div key={i} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t.title}</p><p className={"mt-0.5 text-xs "+(t.tone==="rose"?"text-rose-600":"text-[var(--text-muted)]")}>{t.meta}</p></div>{t.amount?<strong className="money text-sm">{t.amount}</strong>:null}<Link href={t.href} className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">{t.action}</Link></div>)}</div>:<div className="p-4"><EmptyState title="Nothing urgent" description="No open tasks need attention right now."/></div>}
   </Surface>

   <Surface className="overflow-hidden">
    <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="font-semibold">Settlement week</h2></div>
    <div className="grid grid-cols-7 gap-px bg-[var(--border)]">{days.map((x,i)=><div key={i} className="min-w-0 bg-[var(--surface)] px-1.5 py-3 text-center"><p className="text-[10px] text-[var(--text-muted)]">{x.date.toLocaleDateString("en-IN",{weekday:"short"})}</p><p className="mt-1 text-xs font-semibold">{x.amount?compact(x.amount):"—"}</p></div>)}</div>
   </Surface>
  </div>

  <div>
   <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Balances</h2><Link href="/accounts" className="text-xs font-semibold text-[var(--accent)]">Accounts →</Link></div>
   <div className="flex gap-2 overflow-x-auto pb-2">{liquid.map(a=><Link key={a.id} href="/accounts" className="min-w-[150px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3"><p className="truncate text-xs text-[var(--text-muted)]">{a.accountName}</p><p className="money mt-1 text-base font-semibold">{money(a.currentBalance)}</p></Link>)}</div>
  </div>

  <Surface className="overflow-hidden">
   <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><h2 className="font-semibold">Recent activity</h2><Link href="/transactions" className="text-xs font-semibold text-[var(--accent)]">View all</Link></div>
   {activity.length?<div className="divide-y divide-[var(--border)]">{activity.map(t=><Link key={t.id} href={"/transactions/"+t.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-medium">{t.transactionType.replaceAll("_"," ")}{t.customer?" · "+t.customer.fullName:""}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">{new Date(t.transactionAt).toLocaleString("en-IN")}</p></div><div className="text-right"><p className="money text-sm font-semibold">{money(t.grossAmount)}</p><p className="text-[11px] text-[var(--text-muted)]">{t.status.replaceAll("_"," ")}</p></div></Link>)}</div>:<div className="p-4"><EmptyState title="No activity yet" description="New transactions will appear here."/></div>}
  </Surface>
 </div></AppShell>;
}
