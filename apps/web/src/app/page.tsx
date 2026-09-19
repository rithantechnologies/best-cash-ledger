"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Breakdown={pendingAmount:number;pendingCount:number;partialAmount:number;partialCount:number;dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number};
type Summary={
 cashBalance:number;bankBalance:number;upiBalance:number;walletBalance:number;availableFunds:number;
 customerPayable:number;customerReceivable:number;pendingProviderSettlements:number;pendingProviderSettlementCount:number;
 operatingPosition:number;netFinancialPosition:number;payableBreakdown:Breakdown;receivableBreakdown:Breakdown;
 creditCardOutstanding:number;creditCardAvailable:number;
};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean};
type Today={
 cashIn:number;cashOut:number;bankIn:number;bankOut:number;walletIn:number;walletOut:number;upiIn:number;upiOut:number;
 cardSwipe:number;aeps:number;microAtm:number;customerPayout:number;customerReceipt:number;receivableCreated:number;
 commission:number;providerCharges:number;businessExpense:number;personalExpense:number;
};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;reason:string;customer:{fullName:string}};
type Trend={date:string;availableFunds:number;pendingProviderSettlements:number;receivables:number;payables:number;creditCardOutstanding:number;operatingPosition:number;netPosition:number};
type Counter={id:string;cashAccount:{accountName:string}}|null;
type Eod={snapshot:{id:string}|null;openCashSessions:number};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const compact=(v:number)=>new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1,style:"currency",currency:"INR"}).format(v);

function PositionChart({rows}:{rows:Trend[]}){
 const width=760,height=250,pad=26;
 const values=rows.flatMap(r=>[r.netPosition,r.operatingPosition,r.availableFunds]);
 const min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1;
 const point=(v:number,i:number)=>({x:pad+(rows.length<=1?0:i*(width-pad*2)/(rows.length-1)),y:height-pad-((v-min)/range)*(height-pad*2)});
 const path=(key:"netPosition"|"operatingPosition"|"availableFunds")=>rows.map((r,i)=>{const p=point(r[key],i);return (i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1);}).join(" ");
 const area=rows.length?path("netPosition")+" L "+(width-pad)+" "+(height-pad)+" L "+pad+" "+(height-pad)+" Z":"";
 if(!rows.length)return <EmptyState title="Trend will appear after EOD snapshots"/>;
 return <div>
  <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--accent)]"/>Net position</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-cyan-500"/>Operating</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-500"/>Available</span></div>
  <svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full overflow-visible" role="img" aria-label="Financial position trend">
   {[.25,.5,.75].map(n=><line key={n} x1={pad} x2={width-pad} y1={pad+n*(height-pad*2)} y2={pad+n*(height-pad*2)} stroke="var(--border)" strokeDasharray="4 7"/>)}
   {area?<path d={area} fill="var(--accent-soft)" className="dashboard-chart-area"/>:null}
   <path d={path("availableFunds")} pathLength="1" fill="none" stroke="#10b981" strokeWidth="2.3" strokeLinecap="round" className="dashboard-chart-line"/>
   <path d={path("operatingPosition")} pathLength="1" fill="none" stroke="#06b6d4" strokeWidth="2.3" strokeLinecap="round" className="dashboard-chart-line dashboard-chart-delay"/>
   <path d={path("netPosition")} pathLength="1" fill="none" stroke="var(--accent)" strokeWidth="3.3" strokeLinecap="round" className="dashboard-chart-line dashboard-chart-delay-2"/>
   {rows.map((r,i)=>{const p=point(r.netPosition,i);return <g key={r.date}><circle cx={p.x} cy={p.y} r="3.8" fill="var(--accent)" className="dashboard-chart-dot"><title>{r.date+" · "+money(r.netPosition)}</title></circle><text x={p.x} y={height-3} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{r.date.slice(5)}</text></g>})}
  </svg>
  <div className="mt-1 flex justify-between text-xs text-[var(--text-muted)]"><span>{money(rows[0].netPosition)}</span><span>10-day movement</span><strong className="text-[var(--text)]">{money(rows[rows.length-1].netPosition)}</strong></div>
 </div>;
}

function MoneyMix({summary}:{summary:Summary}){
 const items=[
  {label:"Cash",value:Math.max(0,summary.cashBalance),color:"#475569"},
  {label:"Banks",value:Math.max(0,summary.bankBalance),color:"#6366f1"},
  {label:"UPI",value:Math.max(0,summary.upiBalance),color:"#06b6d4"},
  {label:"Wallets",value:Math.max(0,summary.walletBalance),color:"#10b981"},
 ];
 const total=items.reduce((s,x)=>s+x.value,0);let cursor=0;
 const stops=items.map(x=>{const start=cursor,end=total?cursor+x.value/total*100:cursor;cursor=end;return x.color+" "+start+"% "+end+"%";}).join(",");
 return <div className="grid gap-5 sm:grid-cols-[150px_1fr] sm:items-center">
  <div className="dashboard-ring relative mx-auto h-36 w-36 rounded-full" style={{background:total?"conic-gradient("+stops+")":"var(--surface-soft)"}}><div className="absolute inset-[22px] grid place-items-center rounded-full bg-[var(--surface)]"><div className="text-center"><p className="text-[11px] text-[var(--text-muted)]">Available</p><strong className="money text-xl">{compact(total)}</strong></div></div></div>
  <div className="space-y-3">{items.map(x=><div key={x.label} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><i className="h-2.5 w-2.5 rounded-full" style={{background:x.color}}/>{x.label}</span><strong className="money text-sm">{money(x.value)}</strong></div>)}</div>
 </div>;
}

function TodayPulse({today}:{today:Today}){
 const rows=[
  ["Cash",today.cashIn,today.cashOut],["Bank",today.bankIn,today.bankOut],["UPI",today.upiIn,today.upiOut],["Wallet",today.walletIn,today.walletOut],["Customers",today.customerReceipt,today.customerPayout],["Fees",today.commission,today.providerCharges],
 ] as [string,number,number][];
 const max=Math.max(1,...rows.flatMap(r=>[Math.abs(r[1]),Math.abs(r[2])]));
 return <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
  <div>
   <div className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] gap-2 border-b border-[var(--border)] pb-2 text-[11px] font-semibold text-[var(--text-muted)]"><span>Channel</span><span className="text-right text-[var(--money-in)]">In</span><span className="text-right text-[var(--money-out)]">Out</span></div>
   <div className="divide-y divide-[var(--border)]">{rows.map(([label,inc,out])=><div key={label} className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] items-center gap-2 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-semibold">{label}</p><div className="mt-1 flex h-1 overflow-hidden rounded-full bg-[var(--surface-soft)]"><span className="bg-emerald-400" style={{width:(Math.abs(inc)/max*50)+"%"}}/><span className="ml-auto bg-rose-400" style={{width:(Math.abs(out)/max*50)+"%"}}/></div></div><strong className="dashboard-pulse-money money min-w-0 text-right font-bold text-[var(--money-in)]">{money(inc)}</strong><strong className="dashboard-pulse-money money min-w-0 text-right font-bold text-[var(--money-out)]">{money(out)}</strong></div>)}</div>
  </div>
  <div className="grid grid-cols-2 gap-2 self-start">
   {[["Card swipe",today.cardSwipe],["AePS",today.aeps],["Micro ATM",today.microAtm],["Commission",today.commission],["Business expense",today.businessExpense],["Personal expense",today.personalExpense]].map(([label,value])=><div key={String(label)} className="app-metric-tile min-w-0 rounded-xl p-3"><p className="text-[11px] font-medium text-[var(--text-muted)]">{label}</p><p className="dashboard-metric-money money mt-1 font-extrabold">{money(Number(value))}</p></div>)}
  </div>
 </div>;
}

export default function DashboardPage(){
 const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
 const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
 const [counter,setCounter]=useState<Counter>(null),[eod,setEod]=useState<Eod|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [s,a,t,p,r,tr,c,e]=await Promise.all([
    apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
    apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),apiFetch<Trend[]>("/dashboard/position-trend"),
    apiFetch<Counter>("/cash-counter/current"),apiFetch<Eod>("/end-of-day/status"),
   ]);
   setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);setCounter(c);setEod(e);
  }catch(err){setError(err instanceof Error?err.message:"Failed to load dashboard");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);

 const alerts=useMemo(()=>summary?[
  ["Receivable overdue",summary.receivableBreakdown.overdueAmount,summary.receivableBreakdown.overdueCount,"/receivables","rose"],
  ["Payable overdue",summary.payableBreakdown.overdueAmount,summary.payableBreakdown.overdueCount,"/payables","rose"],
  ["Receive today",summary.receivableBreakdown.dueTodayAmount,summary.receivableBreakdown.dueTodayCount,"/receivables","emerald"],
  ["Pay today",summary.payableBreakdown.dueTodayAmount,summary.payableBreakdown.dueTodayCount,"/payables","amber"],
 ] as const:[],[summary]);
 if(loading)return <AppShell><PageLoader label="Preparing dashboard…"/></AppShell>;
 if(error||!summary||!today)return <AppShell><div className="mx-auto max-w-md py-20"><Surface className="p-6 text-center"><h2 className="font-semibold">Dashboard couldn’t load</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{error||"Please try again."}</p><button onClick={load} className="mt-4 rounded-lg bg-[var(--text)] px-4 py-2 text-sm font-semibold text-[var(--surface)]">Try again</button></Surface></div></AppShell>;

 const activeAccounts=accounts.filter(a=>a.isActive&&a.accountType!=="OWNER_CREDIT_CARD").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance)).slice(0,6);
 return <AppShell><div className="app-page-frame page-enter mx-auto max-w-[1440px] space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--accent)]">Live workspace</p><h1 className="text-[1.55rem] font-black tracking-[-.035em] sm:text-[1.8rem]">Dashboard</h1><div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]"><span>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})}</span><span>·</span><Link href="/cash-counter" className="font-semibold hover:text-[var(--text)]">{counter?"Counter open · "+counter.cashAccount.accountName:"Counter closed"}</Link><span>·</span><Link href="/end-of-day" className="font-semibold hover:text-[var(--text)]">{eod?.snapshot?"EOD saved":"EOD pending"}</Link></div></div><div className="flex flex-wrap gap-2"><Link href="/receivables" className="app-secondary-button px-3 py-2 text-xs font-bold">Receive</Link><Link href="/payables" className="app-secondary-button px-3 py-2 text-xs font-bold">Pay</Link><Link href="/transactions/new" className="app-primary-button px-3 py-2 text-xs font-bold">+ New</Link></div></div>

  <Surface className="dashboard-hero overflow-hidden">
   <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.05fr_1.5fr]">
    <div className="min-w-0"><p className="text-xs font-semibold text-[var(--text-muted)]">Net financial position</p><p className={"dashboard-net-money money mt-2 font-black tracking-[-.05em] "+(summary.netFinancialPosition<0?"text-rose-600":"")}>{money(summary.netFinancialPosition)}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]">Operating {money(summary.operatingPosition)}</span><span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]">Available {money(summary.availableFunds)}</span></div></div>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[var(--border)] sm:grid-cols-3">{[["Available",summary.availableFunds,""],["Provider clearing",summary.pendingProviderSettlements,"text-cyan-600"],["To receive",summary.customerReceivable,"text-[var(--money-in)]"],["To pay",summary.customerPayable,"text-amber-600"],["Card outstanding",summary.creditCardOutstanding,"text-[var(--money-out)]"],["Card available",summary.creditCardAvailable,"text-[var(--accent)]"]].map(([label,value,tone])=><div key={String(label)} className="min-w-0 bg-[var(--surface)] p-3.5"><p className="text-[11px] font-medium text-[var(--text-muted)]">{label}</p><p className={"dashboard-metric-money money mt-1.5 font-extrabold "+tone}>{money(Number(value))}</p></div>)}</div>
   </div>
  </Surface>

  <Surface className="p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Today’s operating pulse</h2><span className="text-xs text-[var(--text-muted)]">Live</span></div><TodayPulse today={today}/></Surface>

  <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
   <Surface className="min-w-0 p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Position trend</h2><Link href="/reports" className="text-xs font-semibold text-[var(--accent)]">Reports →</Link></div><PositionChart rows={trend}/></Surface>
   <Surface className="p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold">Where the money is</h2></div><MoneyMix summary={summary}/></Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-2">
   <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="font-semibold">Needs attention</h2></div><div className="grid grid-cols-2 gap-px bg-[var(--border)]">{alerts.map(([label,value,count,href,tone])=><Link key={label} href={href} className="bg-[var(--surface)] p-4 hover:bg-[var(--surface-soft)]"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className={"money mt-2 text-xl font-semibold "+(tone==="rose"?"text-rose-600":tone==="emerald"?"text-[var(--money-in)]":"text-amber-600")}>{money(value)}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{count} item{count===1?"":"s"} · Open →</p></Link>)}</div></Surface>
   <Surface className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><h2 className="font-semibold">Account balances</h2><Link href="/accounts" className="text-xs font-semibold text-[var(--accent)]">View all</Link></div>{activeAccounts.length?<div className="divide-y divide-[var(--border)]">{activeAccounts.map(a=><Link key={a.id} href={"/accounts/"+a.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-soft)]"><div><p className="text-sm font-medium">{a.accountName}</p><p className="text-[11px] text-[var(--text-muted)]">{a.accountType.replaceAll("_"," ")}</p></div><strong className="money text-sm">{money(a.currentBalance)}</strong></Link>)}</div>:<div className="p-4"><EmptyState title="No account balances yet"/></div>}</Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-2">
   <Surface className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><h2 className="font-semibold">Money to receive</h2><Link href="/receivables" className="text-xs font-semibold text-[var(--accent)]">View all</Link></div>{receivables.length?<div className="divide-y divide-[var(--border)]">{receivables.slice(0,5).map(r=><Link key={r.id} href={"/receivables/"+r.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-medium">{r.customer.fullName}</p><p className="truncate text-[11px] text-[var(--text-muted)]">{r.reason}{r.dueAt?" · "+new Date(r.dueAt).toLocaleDateString("en-IN"):""}</p></div><div className="text-right"><strong className="money text-sm text-[var(--money-in)]">{money(r.remainingAmount)}</strong>{r.bucket==="OVERDUE"?<p className="text-[10px] font-semibold text-rose-600">OVERDUE</p>:null}</div></Link>)}</div>:<div className="p-4"><EmptyState title="Nothing outstanding to receive"/></div>}</Surface>
   <Surface className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><h2 className="font-semibold">Money to pay</h2><Link href="/payables" className="text-xs font-semibold text-[var(--accent)]">View all</Link></div>{payables.length?<div className="divide-y divide-[var(--border)]">{payables.slice(0,5).map(p=><Link key={p.id} href={"/payables/"+p.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-soft)]"><div><p className="text-sm font-medium">{p.customer.fullName}</p><p className="text-[11px] text-[var(--text-muted)]">Due {new Date(p.dueAt).toLocaleDateString("en-IN")}</p></div><div className="text-right"><strong className="money text-sm text-amber-600">{money(p.remainingAmount)}</strong>{p.bucket==="OVERDUE"?<p className="text-[10px] font-semibold text-rose-600">OVERDUE</p>:null}</div></Link>)}</div>:<div className="p-4"><EmptyState title="No open customer payables"/></div>}</Surface>
  </div>
 </div></AppShell>;
}
