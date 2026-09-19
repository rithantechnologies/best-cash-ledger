"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean;usageType?:string};
type Today={
 cashIn:number;cashOut:number;bankIn:number;bankOut:number;walletIn:number;walletOut:number;upiIn:number;upiOut:number;
 cardSwipe:number;aeps:number;microAtm:number;customerPayout:number;customerReceipt:number;receivableCreated:number;
 commission:number;providerCharges:number;businessExpense:number;personalExpense:number;
};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;reason:string;customer:{fullName:string}};
type Trend={date:string;availableFunds:number;pendingProviderSettlements:number;receivables:number;payables:number;creditCardOutstanding:number;operatingPosition:number;netPosition:number};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type CashSession={id:string;status:string;openingTotal:string;actualClosingTotal:string|null;openedAt:string;closedAt?:string|null;cashAccount:{accountName:string};denominationCounts:Count[];liveExpectedClosingTotal?:number};
type Eod={snapshot:{id:string}|null;openCashSessions:number};
type RecentTx={id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;customer:{fullName:string}|null};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const compact=(v:number)=>new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1,style:"currency",currency:"INR"}).format(v);
const label=(v:string)=>v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

function SummaryCard({
 title,value,detail,href,mark,tone="blue",emphasis=false,
}:{title:string;value:number;detail:string;href:string;mark:string;tone?:"blue"|"green"|"amber"|"rose"|"violet"|"slate";emphasis?:boolean}){
 return <Link href={href} className={"dashboard-summary-card dashboard-summary-"+tone+" group "+(emphasis?"dashboard-summary-emphasis":"")}>
  <div className="flex items-start justify-between gap-3">
   <span className="dashboard-summary-mark">{mark}</span>
   <span className="dashboard-summary-arrow">↗</span>
  </div>
  <p className="mt-4 text-[11px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">{title}</p>
  <p className="dashboard-summary-money money mt-1.5 font-black">{money(value)}</p>
  <p className="mt-2 text-[10px] leading-4 text-[var(--text-muted)]">{detail}</p>
 </Link>;
}

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

type DonutItem={label:string;value:number;color:string};
function DonutBreakdown({items,totalLabel="Total"}:{items:DonutItem[];totalLabel?:string}){
 const total=items.reduce((s,x)=>s+Math.max(0,x.value),0);
 let cursor=0;
 const stops=items.map(x=>{const start=cursor,end=total?cursor+Math.max(0,x.value)/total*100:cursor;cursor=end;return x.color+" "+start+"% "+end+"%";}).join(",");
 return <div className="grid gap-5 sm:grid-cols-[150px_1fr] sm:items-center">
  <div className="dashboard-ring relative mx-auto h-36 w-36 rounded-full" style={{background:total?"conic-gradient("+stops+")":"var(--surface-soft)"}}>
   <div className="absolute inset-[22px] grid place-items-center rounded-full bg-[var(--surface)]"><div className="text-center"><p className="text-[10px] text-[var(--text-muted)]">{totalLabel}</p><strong className="money text-lg">{compact(total)}</strong></div></div>
  </div>
  <div className="space-y-2.5">{items.map(x=><div key={x.label} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:x.color}}/><span className="truncate">{x.label}</span></span><strong className="money shrink-0 text-xs">{money(x.value)}</strong></div>)}</div>
 </div>;
}

type Bucket={label:string;amount:number;count:number;tone:"green"|"blue"|"amber"|"rose"|"slate"};
function BucketBars({items}:{items:Bucket[]}){
 const max=Math.max(1,...items.map(x=>x.amount));
 return <div className="space-y-3">{items.map(x=><div key={x.label}>
  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{x.label}</span><span className="text-[var(--text-muted)]">{x.count} · <strong className="money text-[var(--text)]">{money(x.amount)}</strong></span></div>
  <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className={"dashboard-bucket dashboard-bucket-"+x.tone} style={{width:Math.max(x.amount?6:0,x.amount/max*100)+"%"}}/></div>
 </div>)}</div>;
}

function TodayPulse({today}:{today:Today}){
 const rows=[["Cash",today.cashIn,today.cashOut],["Bank",today.bankIn,today.bankOut],["UPI",today.upiIn,today.upiOut],["Wallet",today.walletIn,today.walletOut]] as [string,number,number][];
 const inflow=rows.reduce((sum,row)=>sum+row[1],0),outflow=rows.reduce((sum,row)=>sum+row[2],0);
 const max=Math.max(1,...rows.flatMap(r=>[Math.abs(r[1]),Math.abs(r[2])]));
 const tiles=[
  {label:"Card swipe",value:today.cardSwipe,mark:"CS",href:"/transactions?type=CARD_SWIPE"},
  {label:"AePS",value:today.aeps,mark:"AP",href:"/transactions?type=AEPS_WITHDRAWAL"},
  {label:"Micro ATM",value:today.microAtm,mark:"MA",href:"/transactions?type=MICRO_ATM"},
  {label:"Commission",value:today.commission,mark:"CM",href:"/reports"},
  {label:"Business expense",value:today.businessExpense,mark:"BE",href:"/expenses?scope=BUSINESS"},
  {label:"Personal expense",value:today.personalExpense,mark:"PE",href:"/expenses?scope=PERSONAL"},
 ];
 return <div className="space-y-5">
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
   <div className="dashboard-flow-total min-w-0 rounded-2xl p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Channel in</p><p className="dashboard-metric-money money mt-1.5 font-black text-[var(--money-in)]">{money(inflow)}</p></div>
   <div className="dashboard-flow-total min-w-0 rounded-2xl p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Channel out</p><p className="dashboard-metric-money money mt-1.5 font-black text-[var(--money-out)]">{money(outflow)}</p></div>
   <div className="dashboard-flow-total col-span-2 min-w-0 rounded-2xl p-3.5 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Difference</p><p className={"dashboard-metric-money money mt-1.5 font-black "+(inflow-outflow<0?"text-[var(--money-out)]":"text-[var(--text)]")}>{money(inflow-outflow)}</p></div>
  </div>
  <div className="grid gap-5 xl:grid-cols-[1.12fr_.88fr]">
   <div><div className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] gap-2 border-b border-[var(--border)] pb-2 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]"><span>Channel</span><span className="text-right text-[var(--money-in)]">In</span><span className="text-right text-[var(--money-out)]">Out</span></div>
    <div className="divide-y divide-[var(--border)]">{rows.map(([rowLabel,inc,out])=><div key={rowLabel} className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] items-center gap-2 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-soft)] text-[9px] font-black text-[var(--text-muted)]">{rowLabel.slice(0,2).toUpperCase()}</span><p className="truncate text-xs font-bold">{rowLabel}</p></div><div className="ml-9 mt-1.5 flex h-1 overflow-hidden rounded-full bg-[var(--surface-soft)]"><span className="bg-emerald-400" style={{width:(Math.abs(inc)/max*50)+"%"}}/><span className="ml-auto bg-rose-400" style={{width:(Math.abs(out)/max*50)+"%"}}/></div></div><strong className="dashboard-pulse-money money min-w-0 text-right font-bold text-[var(--money-in)]">{money(inc)}</strong><strong className="dashboard-pulse-money money min-w-0 text-right font-bold text-[var(--money-out)]">{money(out)}</strong></div>)}</div>
   </div>
   <div className="grid grid-cols-2 gap-2 self-start">{tiles.map(tile=><Link key={tile.label} href={tile.href} className="app-metric-tile dashboard-click-tile min-w-0 rounded-2xl p-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-[var(--text-muted)]">{tile.label}</p><span className="text-[9px] font-black text-[var(--accent)]">{tile.mark}</span></div><p className="dashboard-metric-money money mt-1.5 font-extrabold">{money(tile.value)}</p></Link>)}</div>
  </div>
 </div>;
}

export default function DashboardPage(){
 const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
 const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
 const [counter,setCounter]=useState<CashSession|null>(null),[cashHistory,setCashHistory]=useState<CashSession[]>([]),[eod,setEod]=useState<Eod|null>(null),[recent,setRecent]=useState<RecentTx[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[asOf,setAsOf]=useState(0);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [s,a,t,p,r,tr,c,h,e,rt]=await Promise.all([
    apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
    apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),apiFetch<Trend[]>("/dashboard/position-trend"),
    apiFetch<CashSession|null>("/cash-counter/current"),apiFetch<CashSession[]>("/cash-counter/history"),apiFetch<Eod>("/end-of-day/status"),apiFetch<RecentTx[]>("/dashboard/recent-transactions?limit=8"),
   ]);
   setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);setCounter(c);setCashHistory(h);setEod(e);setRecent(rt);setAsOf(Date.now());
  }catch(err){setError(err instanceof Error?err.message:"Failed to load dashboard");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);

 if(loading)return <AppShell><PageLoader label="Preparing dashboard…"/></AppShell>;
 if(error||!summary||!today)return <AppShell><div className="mx-auto max-w-md py-20"><Surface className="p-6 text-center"><h2 className="font-semibold">Dashboard couldn’t load</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{error||"Please try again."}</p><button onClick={load} className="mt-4 rounded-lg bg-[var(--text)] px-4 py-2 text-sm font-semibold text-[var(--surface)]">Try again</button></Surface></div></AppShell>;

 const bankAccounts=accounts.filter(a=>a.isActive&&a.accountType==="BANK");
 const walletAccounts=accounts.filter(a=>a.isActive&&a.accountType==="PROVIDER_WALLET");
 const upiAccounts=accounts.filter(a=>a.isActive&&a.accountType==="UPI");
 const activeAccounts=accounts.filter(a=>a.isActive&&a.accountType!=="OWNER_CREDIT_CARD").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance)).slice(0,7);
 const trendStart=trend[0]?.netPosition??summary.netFinancialPosition,trendEnd=trend[trend.length-1]?.netPosition??summary.netFinancialPosition,trendMovement=trendEnd-trendStart;
 const overdueTotal=summary.receivableBreakdown.overdueCount+summary.payableBreakdown.overdueCount;
 const cashSnapshot=counter??cashHistory[0]??null;
 const preferredCount=cashSnapshot?.status==="OPEN"?"OPENING":"CLOSING";
 const denominationCounts=(cashSnapshot?.denominationCounts??[]).filter(x=>x.countType===preferredCount).sort((a,b)=>Number(b.denomination)-Number(a.denomination));

 const walletItems=(()=>{
  const colors=["#6366f1","#06b6d4","#10b981","#f59e0b","#8b5cf6","#64748b"];
  const sorted=[...walletAccounts].sort((a,b)=>b.currentBalance-a.currentBalance);
  const top=sorted.slice(0,5).map((x,i)=>({label:x.accountName,value:Math.max(0,x.currentBalance),color:colors[i]}));
  const other=sorted.slice(5).reduce((s,x)=>s+Math.max(0,x.currentBalance),0);
  if(other)top.push({label:"Other wallets",value:other,color:colors[5]});
  return top.length?top:[{label:"No wallet balance",value:0,color:"#cbd5e1"}];
 })();

 const now=asOf,day=86400000;
 const receivableBuckets=(()=>{
  const buckets:Bucket[]=[
   {label:"Current / future",amount:0,count:0,tone:"green"},
   {label:"0–30 days overdue",amount:0,count:0,tone:"blue"},
   {label:"31–60 days overdue",amount:0,count:0,tone:"amber"},
   {label:"60+ days overdue",amount:0,count:0,tone:"rose"},
  ];
  for(const r of receivables){
   const amount=Number(r.remainingAmount||0);
   if(!r.dueAt||new Date(r.dueAt).getTime()>=now){buckets[0].amount+=amount;buckets[0].count++;continue;}
   const age=Math.floor((now-new Date(r.dueAt).getTime())/day);
   const idx=age<=30?1:age<=60?2:3;buckets[idx].amount+=amount;buckets[idx].count++;
  }
  return buckets;
 })();
 const payableBuckets=(()=>{
  const buckets:Bucket[]=[
   {label:"Overdue",amount:0,count:0,tone:"rose"},
   {label:"Due today",amount:0,count:0,tone:"amber"},
   {label:"Next 7 days",amount:0,count:0,tone:"blue"},
   {label:"Later",amount:0,count:0,tone:"slate"},
  ];
  const todayStart=new Date();todayStart.setHours(0,0,0,0);const todayEnd=todayStart.getTime()+day;
  for(const p of payables){
   const due=new Date(p.dueAt).getTime(),amount=Number(p.remainingAmount||0);
   const idx=due<todayStart.getTime()?0:due<todayEnd?1:due<todayEnd+7*day?2:3;buckets[idx].amount+=amount;buckets[idx].count++;
  }
  return buckets;
 })();

 return <AppShell><div className="app-page-frame page-enter mx-auto max-w-[1500px] space-y-4">
  <div className="dashboard-command-header flex flex-wrap items-end justify-between gap-4">
   <div>
    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--accent)]">Financial command center</p>
    <h1 className="text-[1.7rem] font-black tracking-[-.045em] sm:text-[2rem]">Cumulative dashboard</h1>
    <div className="mt-2 flex flex-wrap items-center gap-2">
     <span className="dashboard-status-pill">{new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</span>
     <Link href="/cash-counter" className={"dashboard-status-pill "+(counter?"dashboard-status-good":"dashboard-status-warn")}>{counter?"Counter open · "+counter.cashAccount.accountName:"Counter closed"}</Link>
     <Link href="/end-of-day" className={"dashboard-status-pill "+(eod?.snapshot?"dashboard-status-good":"dashboard-status-warn")}>{eod?.snapshot?"EOD saved":"EOD pending"}</Link>
     {overdueTotal>0?<span className="dashboard-status-pill dashboard-status-risk">{overdueTotal} overdue</span>:null}
    </div>
   </div>
   <div className="flex flex-wrap gap-2"><Link href="/expenses" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Expenses</Link><Link href="/receivables" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Receive</Link><Link href="/payables" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Pay</Link><Link href="/transactions/new" className="app-primary-button px-4 py-2.5 text-xs font-bold">+ New transaction</Link></div>
  </div>

  <div className="dashboard-summary-grid">
   <SummaryCard title="Bank" value={summary.bankBalance} detail={bankAccounts.length+" bank account"+(bankAccounts.length===1?"":"s")+" · UPI "+money(summary.upiBalance)} href="/accounts?type=BANK" mark="BK" tone="blue"/>
   <SummaryCard title="Wallet" value={summary.walletBalance} detail={walletAccounts.length+" provider wallet"+(walletAccounts.length===1?"":"s")} href="/accounts?type=PROVIDER_WALLET" mark="WL" tone="violet"/>
   <SummaryCard title="Receivable" value={summary.customerReceivable} detail={summary.receivableBreakdown.overdueCount+" overdue · "+summary.receivableBreakdown.dueTodayCount+" due today"} href="/receivables" mark="RE" tone="green"/>
   <SummaryCard title="Payable" value={summary.customerPayable} detail={summary.payableBreakdown.overdueCount+" overdue · "+summary.payableBreakdown.dueTodayCount+" due today"} href="/payables" mark="PA" tone="amber"/>
   <SummaryCard title="Cash" value={summary.cashBalance} detail={cashSnapshot?"Last physical count · "+cashSnapshot.cashAccount.accountName:"Open counter to count denominations"} href="/cash-counter" mark="CA" tone="slate"/>
   <SummaryCard title="Net balance" value={summary.netFinancialPosition} detail={"Available "+money(summary.availableFunds)+" · after obligations"} href="/reports" mark="NB" tone={summary.netFinancialPosition<0?"rose":"blue"} emphasis/>
  </div>

  <Surface className="dashboard-command-hero overflow-hidden">
   <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.08fr_.92fr]">
    <div className="dashboard-command-primary min-w-0 rounded-[20px] p-5 sm:p-6">
     <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">Net balance formula</p><p className="mt-1 text-xs text-[var(--text-muted)]">Cumulative money position with obligations included</p></div><span className={"dashboard-movement-pill "+(trendMovement<0?"dashboard-movement-down":"dashboard-movement-up")}>{trendMovement>=0?"+":""}{money(trendMovement)} · 10 day</span></div>
     <p className={"dashboard-command-money money mt-6 font-black "+(summary.netFinancialPosition<0?"text-[var(--money-out)]":"")}>{money(summary.netFinancialPosition)}</p>
     <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <div className="dashboard-command-submetric"><p>Available funds</p><strong>{money(summary.availableFunds)}</strong></div>
      <div className="dashboard-command-submetric"><p>+ Provider clearing</p><strong>{money(summary.pendingProviderSettlements)}</strong></div>
      <div className="dashboard-command-submetric"><p>+ Receivable</p><strong>{money(summary.customerReceivable)}</strong></div>
      <div className="dashboard-command-submetric"><p>− Payable</p><strong>{money(summary.customerPayable)}</strong></div>
      <div className="dashboard-command-submetric col-span-2 sm:col-span-1"><p>− Card outstanding</p><strong>{money(summary.creditCardOutstanding)}</strong></div>
     </div>
     <div className="mt-3 text-[10px] text-[var(--text-muted)]">Available funds already include cash, bank, UPI and provider-wallet balances.</div>
    </div>
    <div className="grid content-start gap-2.5 sm:grid-cols-2">
     <Link href="/expenses" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Expenses today</p><p className="dashboard-metric-money money mt-2 font-black text-[var(--money-out)]">{money(today.businessExpense+today.personalExpense)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Business {money(today.businessExpense)} · Personal {money(today.personalExpense)}</p></Link>
     <Link href="/provider-settlements" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Provider clearing</p><p className="dashboard-metric-money money mt-2 font-black text-cyan-600">{money(summary.pendingProviderSettlements)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{summary.pendingProviderSettlementCount} settlement{summary.pendingProviderSettlementCount===1?"":"s"} pending</p></Link>
     <Link href="/accounts?type=OWNER_CREDIT_CARD" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Credit available</p><p className="dashboard-metric-money money mt-2 font-black">{money(summary.creditCardAvailable)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Outstanding {money(summary.creditCardOutstanding)}</p></Link>
     <Link href="/accounts?type=UPI" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">UPI / GPay</p><p className="dashboard-metric-money money mt-2 font-black">{money(summary.upiBalance)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{upiAccounts.length} linked account{upiAccounts.length===1?"":"s"}</p></Link>
    </div>
   </div>
  </Surface>

  <div className="grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
   <Surface className="dashboard-panel min-w-0 p-4 sm:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="dashboard-kicker">Position analytics</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">10-day financial trend</h2></div><Link href="/reports" className="text-xs font-bold text-[var(--accent)]">Open reports →</Link></div><PositionChart rows={trend}/></Surface>
   <Surface className="dashboard-panel p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><p className="dashboard-kicker">Wallets</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">Wallet distribution</h2></div><Link href="/accounts?type=PROVIDER_WALLET" className="text-xs font-bold text-[var(--accent)]">View all</Link></div><DonutBreakdown items={walletItems} totalLabel="Wallet total"/></Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-3">
   <Surface className="dashboard-panel p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><p className="dashboard-kicker">Receivables</p><h2 className="mt-1 text-base font-bold">Aging</h2></div><Link href="/receivables" className="text-xs font-bold text-[var(--accent)]">View all</Link></div><BucketBars items={receivableBuckets}/><p className="mt-4 text-[10px] text-[var(--text-muted)]">Chart uses the nearest open receivable items loaded on the dashboard.</p></Surface>
   <Surface className="dashboard-panel p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><p className="dashboard-kicker">Payables</p><h2 className="mt-1 text-base font-bold">Due timeline</h2></div><Link href="/payables" className="text-xs font-bold text-[var(--accent)]">View all</Link></div><BucketBars items={payableBuckets}/><p className="mt-4 text-[10px] text-[var(--text-muted)]">Includes delayed swipe/customer obligations by their due date.</p></Surface>
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><div><p className="dashboard-kicker">Cash</p><h2 className="mt-1 text-base font-bold">Denomination snapshot</h2></div><Link href="/cash-counter" className="text-xs font-bold text-[var(--accent)]">Count cash</Link></div>
    {cashSnapshot&&denominationCounts.length?<div><div className="flex items-center justify-between bg-[var(--surface-soft)] px-4 py-2.5 text-[10px] text-[var(--text-muted)]"><span>{preferredCount==="OPENING"?"Opening":"Closing"} physical count · {cashSnapshot.cashAccount.accountName}</span><strong>{cashSnapshot.status}</strong></div><div className="divide-y divide-[var(--border)]">{denominationCounts.slice(0,8).map(row=><div key={row.denomination} className="grid grid-cols-[70px_1fr_100px] items-center px-4 py-2.5 text-xs"><strong className="money">₹{Number(row.denomination)}</strong><span className="text-center text-[var(--text-muted)]">× {row.quantity}</span><strong className="money text-right">{money(row.totalAmount)}</strong></div>)}</div></div>:<div className="p-4"><EmptyState title="No physical count yet" description="Open the cash counter to record denominations."/></div>}
   </Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-[1.18fr_.82fr]">
   <Surface className="dashboard-panel p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="dashboard-kicker">Today</p><h2 className="mt-1 text-base font-bold tracking-[-.02em]">Operating pulse</h2></div><span className="dashboard-live-badge"><i/>Live</span></div><TodayPulse today={today}/></Surface>
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="dashboard-kicker">Attention</p><h2 className="mt-1 text-base font-bold">Needs action</h2></div><span className="text-[10px] font-semibold text-[var(--text-muted)]">{overdueTotal} overdue</span></div>
    <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
     <Link href="/receivables" className="dashboard-action-tile bg-[var(--surface)] p-4"><p className="text-[11px] text-[var(--text-muted)]">Receivable overdue</p><p className="dashboard-action-money money mt-2 font-black text-[var(--money-out)]">{money(summary.receivableBreakdown.overdueAmount)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{summary.receivableBreakdown.overdueCount} items</p></Link>
     <Link href="/payables" className="dashboard-action-tile bg-[var(--surface)] p-4"><p className="text-[11px] text-[var(--text-muted)]">Payable overdue</p><p className="dashboard-action-money money mt-2 font-black text-[var(--money-out)]">{money(summary.payableBreakdown.overdueAmount)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{summary.payableBreakdown.overdueCount} items</p></Link>
     <Link href="/receivables" className="dashboard-action-tile bg-[var(--surface)] p-4"><p className="text-[11px] text-[var(--text-muted)]">Receive today</p><p className="dashboard-action-money money mt-2 font-black text-[var(--money-in)]">{money(summary.receivableBreakdown.dueTodayAmount)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{summary.receivableBreakdown.dueTodayCount} items</p></Link>
     <Link href="/payables" className="dashboard-action-tile bg-[var(--surface)] p-4"><p className="text-[11px] text-[var(--text-muted)]">Pay today</p><p className="dashboard-action-money money mt-2 font-black text-amber-600">{money(summary.payableBreakdown.dueTodayAmount)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{summary.payableBreakdown.dueTodayCount} items</p></Link>
    </div>
   </Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="dashboard-kicker">Accounts</p><h2 className="mt-1 text-base font-bold">Largest balances</h2></div><Link href="/accounts" className="text-xs font-bold text-[var(--accent)]">View all</Link></div>
    {activeAccounts.length?<div className="divide-y divide-[var(--border)]">{activeAccounts.map(a=><Link key={a.id} href={"/accounts/"+a.id} className="dashboard-account-row flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-[9px] font-black text-[var(--text-muted)]">{a.accountType.split("_").map(x=>x[0]).join("").slice(0,3)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{a.accountName}</p><p className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-muted)]">{a.accountType.replaceAll("_"," ")}</p></div></div><strong className={"dashboard-row-money money shrink-0 font-bold "+(a.currentBalance<0?"text-[var(--money-out)]":"")}>{money(a.currentBalance)}</strong></Link>)}</div>:<div className="p-4"><EmptyState title="No account balances yet"/></div>}
   </Surface>
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="dashboard-kicker">Activity</p><h2 className="mt-1 text-base font-bold">Recent transactions</h2></div><Link href="/transactions" className="text-xs font-bold text-[var(--accent)]">View all</Link></div>
    {recent.length?<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead className="bg-[var(--surface-soft)] text-left text-[10px] uppercase tracking-[.06em] text-[var(--text-muted)]"><tr><th className="px-4 py-2.5">Date</th><th>Particulars</th><th>Type</th><th className="pr-4 text-right">Amount</th></tr></thead><tbody>{recent.map(tx=><tr key={tx.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 text-[var(--text-muted)]">{new Date(tx.transactionAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</td><td><Link href={"/transactions/"+tx.id} className="font-bold text-[var(--accent)]">{tx.customer?.fullName??tx.transactionNumber}</Link></td><td className="text-[var(--text-muted)]">{label(tx.transactionType)}</td><td className="money pr-4 text-right font-bold">{money(tx.netAmount??tx.grossAmount)}</td></tr>)}</tbody></table></div>:<div className="p-4"><EmptyState title="No recent transactions"/></div>}
   </Surface>
  </div>
 </div></AppShell>;
}
