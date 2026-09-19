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
  ["Cash",today.cashIn,today.cashOut],["Bank",today.bankIn,today.bankOut],["UPI",today.upiIn,today.upiOut],["Wallet",today.walletIn,today.walletOut],
 ] as [string,number,number][];
 const inflow=rows.reduce((sum,row)=>sum+row[1],0);
 const outflow=rows.reduce((sum,row)=>sum+row[2],0);
 const max=Math.max(1,...rows.flatMap(r=>[Math.abs(r[1]),Math.abs(r[2])]));
 return <div className="space-y-5">
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
   <div className="dashboard-flow-total min-w-0 rounded-2xl p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Channel in</p><p className="dashboard-metric-money money mt-1.5 font-black text-[var(--money-in)]">{money(inflow)}</p></div>
   <div className="dashboard-flow-total min-w-0 rounded-2xl p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Channel out</p><p className="dashboard-metric-money money mt-1.5 font-black text-[var(--money-out)]">{money(outflow)}</p></div>
   <div className="dashboard-flow-total col-span-2 min-w-0 rounded-2xl p-3.5 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Difference</p><p className={"dashboard-metric-money money mt-1.5 font-black "+(inflow-outflow<0?"text-[var(--money-out)]":"text-[var(--text)]")}>{money(inflow-outflow)}</p></div>
  </div>
  <div className="grid gap-5 xl:grid-cols-[1.12fr_.88fr]">
   <div>
    <div className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] gap-2 border-b border-[var(--border)] pb-2 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]"><span>Channel</span><span className="text-right text-[var(--money-in)]">In</span><span className="text-right text-[var(--money-out)]">Out</span></div>
    <div className="divide-y divide-[var(--border)]">{rows.map(([label,inc,out])=><div key={label} className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] items-center gap-2 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-soft)] text-[9px] font-black text-[var(--text-muted)]">{label.slice(0,2).toUpperCase()}</span><p className="truncate text-xs font-bold">{label}</p></div><div className="ml-9 mt-1.5 flex h-1 overflow-hidden rounded-full bg-[var(--surface-soft)]"><span className="bg-emerald-400" style={{width:(Math.abs(inc)/max*50)+"%"}}/><span className="ml-auto bg-rose-400" style={{width:(Math.abs(out)/max*50)+"%"}}/></div></div><strong className="dashboard-pulse-money money min-w-0 text-right font-bold text-[var(--money-in)]">{money(inc)}</strong><strong className="dashboard-pulse-money money min-w-0 text-right font-bold text-[var(--money-out)]">{money(out)}</strong></div>)}</div>
   </div>
   <div className="grid grid-cols-2 gap-2 self-start">
    {[["Card swipe",today.cardSwipe,"CS"],["AePS",today.aeps,"AP"],["Micro ATM",today.microAtm,"MA"],["Commission",today.commission,"CM"],["Business expense",today.businessExpense,"BE"],["Personal expense",today.personalExpense,"PE"]].map(([label,value,mark])=><div key={String(label)} className="app-metric-tile min-w-0 rounded-2xl p-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</p><span className="text-[9px] font-black text-[var(--accent)]">{mark}</span></div><p className="dashboard-metric-money money mt-1.5 font-extrabold">{money(Number(value))}</p></div>)}
   </div>
  </div>
 </div>;
}

function PositionMetric({
 label,value,detail,tone="slate",href,
}:{label:string;value:number;detail:string;tone?:"slate"|"emerald"|"amber"|"rose"|"cyan";href:string}){
 const toneClass=tone==="emerald"?"text-[var(--money-in)]":tone==="amber"?"text-amber-600":tone==="rose"?"text-[var(--money-out)]":tone==="cyan"?"text-cyan-600":"text-[var(--text)]";
 return <Link href={href} className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5">
  <div className="flex items-start justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</p><span className="text-xs text-[var(--text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]">→</span></div>
  <p className={"dashboard-metric-money money mt-2 font-black "+toneClass}>{money(value)}</p>
  <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{detail}</p>
 </Link>;
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
 const trendStart=trend[0]?.netPosition??summary.netFinancialPosition;
 const trendEnd=trend[trend.length-1]?.netPosition??summary.netFinancialPosition;
 const trendMovement=trendEnd-trendStart;
 const overdueTotal=summary.receivableBreakdown.overdueCount+summary.payableBreakdown.overdueCount;

 return <AppShell><div className="app-page-frame page-enter mx-auto max-w-[1480px] space-y-4">
  <div className="dashboard-command-header flex flex-wrap items-end justify-between gap-4">
   <div>
    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--accent)]">Financial command center</p>
    <h1 className="text-[1.7rem] font-black tracking-[-.045em] sm:text-[2rem]">Dashboard</h1>
    <div className="mt-2 flex flex-wrap items-center gap-2">
     <span className="dashboard-status-pill">{new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</span>
     <Link href="/cash-counter" className={"dashboard-status-pill "+(counter?"dashboard-status-good":"dashboard-status-warn")}>{counter?"Counter open · "+counter.cashAccount.accountName:"Counter closed"}</Link>
     <Link href="/end-of-day" className={"dashboard-status-pill "+(eod?.snapshot?"dashboard-status-good":"dashboard-status-warn")}>{eod?.snapshot?"EOD saved":"EOD pending"}</Link>
     {overdueTotal>0?<span className="dashboard-status-pill dashboard-status-risk">{overdueTotal} overdue</span>:null}
    </div>
   </div>
   <div className="flex flex-wrap gap-2">
    <Link href="/receivables" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Receive</Link>
    <Link href="/payables" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Pay</Link>
    <Link href="/transactions/new" className="app-primary-button px-4 py-2.5 text-xs font-bold">+ New transaction</Link>
   </div>
  </div>

  <Surface className="dashboard-command-hero overflow-hidden">
   <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.08fr_.92fr]">
    <div className="dashboard-command-primary min-w-0 rounded-[20px] p-5 sm:p-6">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">Net financial position</p><p className="mt-1 text-xs text-[var(--text-muted)]">Business position after obligations</p></div>
      <span className={"dashboard-movement-pill "+(trendMovement<0?"dashboard-movement-down":"dashboard-movement-up")}>{trendMovement>=0?"+":""}{money(trendMovement)} · 10 day</span>
     </div>
     <p className={"dashboard-command-money money mt-6 font-black "+(summary.netFinancialPosition<0?"text-[var(--money-out)]":"")}>{money(summary.netFinancialPosition)}</p>
     <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="dashboard-command-submetric"><p>Available funds</p><strong>{money(summary.availableFunds)}</strong></div>
      <div className="dashboard-command-submetric"><p>Operating position</p><strong>{money(summary.operatingPosition)}</strong></div>
      <div className="dashboard-command-submetric col-span-2 sm:col-span-1"><p>Card available</p><strong>{money(summary.creditCardAvailable)}</strong></div>
     </div>
     <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold text-[var(--text-muted)]">
      <span className="rounded-full border border-[var(--border)] px-2.5 py-1">Card outstanding {money(summary.creditCardOutstanding)}</span>
      <span className="rounded-full border border-[var(--border)] px-2.5 py-1">Provider clearing {summary.pendingProviderSettlementCount} item{summary.pendingProviderSettlementCount===1?"":"s"}</span>
     </div>
    </div>

    <div className="grid grid-cols-2 gap-2.5">
     <PositionMetric label="To receive" value={summary.customerReceivable} detail={summary.receivableBreakdown.overdueCount+" overdue · "+summary.receivableBreakdown.dueTodayCount+" due today"} tone="emerald" href="/receivables"/>
     <PositionMetric label="To pay" value={summary.customerPayable} detail={summary.payableBreakdown.overdueCount+" overdue · "+summary.payableBreakdown.dueTodayCount+" due today"} tone="amber" href="/payables"/>
     <PositionMetric label="Provider clearing" value={summary.pendingProviderSettlements} detail={summary.pendingProviderSettlementCount+" settlement"+(summary.pendingProviderSettlementCount===1?"":"s")+" pending"} tone="cyan" href="/provider-settlements"/>
     <PositionMetric label="Card outstanding" value={summary.creditCardOutstanding} detail={"Available "+money(summary.creditCardAvailable)} tone="rose" href="/accounts"/>
    </div>
   </div>
  </Surface>

  <div className="grid gap-4 xl:grid-cols-[1.62fr_.78fr]">
   <Surface className="dashboard-panel min-w-0 p-4 sm:p-5">
    <div className="mb-4 flex items-start justify-between gap-3"><div><p className="dashboard-kicker">Position analytics</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">10-day financial trend</h2></div><Link href="/reports" className="text-xs font-bold text-[var(--accent)]">Open reports →</Link></div>
    <PositionChart rows={trend}/>
   </Surface>
   <Surface className="dashboard-panel p-4 sm:p-5">
    <div className="mb-4"><p className="dashboard-kicker">Liquidity</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">Where the money is</h2></div>
    <MoneyMix summary={summary}/>
    <div className="mt-5 border-t border-[var(--border)] pt-4"><div className="flex items-center justify-between text-xs"><span className="text-[var(--text-muted)]">Total available</span><strong className="money text-sm">{money(summary.availableFunds)}</strong></div></div>
   </Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
   <Surface className="dashboard-panel p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><div><p className="dashboard-kicker">Today</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">Operating pulse</h2></div><span className="dashboard-live-badge"><i/>Live</span></div>
    <TodayPulse today={today}/>
   </Surface>

   <Surface className="dashboard-panel overflow-hidden">
    <div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="dashboard-kicker">Priority</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">Action queue</h2></div><span className="text-[10px] font-semibold text-[var(--text-muted)]">{alerts.reduce((sum,item)=>sum+item[2],0)} items</span></div>
    <div className="grid grid-cols-2 gap-px bg-[var(--border)]">{alerts.map(([label,value,count,href,tone])=><Link key={label} href={href} className="dashboard-action-tile min-w-0 bg-[var(--surface)] p-4"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</p><span className="text-xs text-[var(--text-muted)]">→</span></div><p className={"dashboard-action-money money mt-2 font-black "+(tone==="rose"?"text-[var(--money-out)]":tone==="emerald"?"text-[var(--money-in)]":"text-amber-600")}>{money(value)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{count} item{count===1?"":"s"}</p></Link>)}</div>
   </Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
   <Surface className="dashboard-panel overflow-hidden">
    <div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="dashboard-kicker">Liquidity accounts</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">Account balances</h2></div><Link href="/accounts" className="text-xs font-bold text-[var(--accent)]">View all</Link></div>
    {activeAccounts.length?<div className="divide-y divide-[var(--border)]">{activeAccounts.map(a=><Link key={a.id} href={"/accounts/"+a.id} className="dashboard-account-row flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-[9px] font-black text-[var(--text-muted)]">{a.accountType.split("_").map(x=>x[0]).join("").slice(0,3)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{a.accountName}</p><p className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-muted)]">{a.accountType.replaceAll("_"," ")}</p></div></div><strong className={"dashboard-row-money money shrink-0 font-bold "+(a.currentBalance<0?"text-[var(--money-out)]":"")}>{money(a.currentBalance)}</strong></Link>)}</div>:<div className="p-4"><EmptyState title="No account balances yet"/></div>}
   </Surface>

   <div className="grid gap-4 lg:grid-cols-2">
    <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><div><p className="dashboard-kicker">Customer money</p><h2 className="mt-1 text-sm font-bold">To receive</h2></div><Link href="/receivables" className="text-xs font-bold text-[var(--accent)]">View all</Link></div>{receivables.length?<div className="divide-y divide-[var(--border)]">{receivables.slice(0,5).map(r=><Link key={r.id} href={"/receivables/"+r.id} className="dashboard-obligation-row flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-bold">{r.customer.fullName}</p><p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{r.reason}{r.dueAt?" · "+new Date(r.dueAt).toLocaleDateString("en-IN"):""}</p></div><div className="shrink-0 text-right"><strong className="dashboard-row-money money text-[var(--money-in)]">{money(r.remainingAmount)}</strong>{r.bucket==="OVERDUE"?<p className="mt-0.5 text-[9px] font-bold text-[var(--money-out)]">OVERDUE</p>:null}</div></Link>)}</div>:<div className="p-4"><EmptyState title="Nothing outstanding to receive"/></div>}</Surface>
    <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><div><p className="dashboard-kicker">Customer money</p><h2 className="mt-1 text-sm font-bold">To pay</h2></div><Link href="/payables" className="text-xs font-bold text-[var(--accent)]">View all</Link></div>{payables.length?<div className="divide-y divide-[var(--border)]">{payables.slice(0,5).map(p=><Link key={p.id} href={"/payables/"+p.id} className="dashboard-obligation-row flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-bold">{p.customer.fullName}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Due {new Date(p.dueAt).toLocaleDateString("en-IN")}</p></div><div className="shrink-0 text-right"><strong className="dashboard-row-money money text-amber-600">{money(p.remainingAmount)}</strong>{p.bucket==="OVERDUE"?<p className="mt-0.5 text-[9px] font-bold text-[var(--money-out)]">OVERDUE</p>:null}</div></Link>)}</div>:<div className="p-4"><EmptyState title="No open customer payables"/></div>}</Surface>
   </div>
  </div>
 </div></AppShell>;
}
