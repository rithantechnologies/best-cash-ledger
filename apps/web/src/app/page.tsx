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
type InsightBucket={label:string;amount:number;count:number};
type ObligationInsights={receivables:InsightBucket[];payables:InsightBucket[]};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const compact=(v:number)=>new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1,style:"currency",currency:"INR"}).format(v);
const label=(v:string)=>v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

type GlyphName="bank"|"wallet"|"receive"|"pay"|"cash"|"position"|"expense"|"settlement"|"card"|"upi";
function Glyph({name}:{name:GlyphName}){
 const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
 const paths:Record<GlyphName,React.ReactNode>={
  bank:<><path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 19h18M12 3 3 8h18z"/></>,
  wallet:<><path d="M4 7h14v12H4z"/><path d="M4 7V5h12"/><path d="M15 11h6v5h-6z"/></>,
  receive:<><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></>,
  pay:<><path d="M12 21V8"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/></>,
  cash:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
  position:<><path d="M4 18 9 13l4 3 7-9"/><path d="M15 7h5v5"/></>,
  expense:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="M16 14v4M14 16h4"/></>,
  settlement:<><path d="M4 7h12"/><path d="m13 4 3 3-3 3"/><path d="M20 17H8"/><path d="m11 14-3 3 3 3"/></>,
  card:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></>,
  upi:<><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M10 17h4"/></>,
 };
 return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

function SectionHead({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:React.ReactNode}){
 return <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
  <div><p className="dashboard-kicker">{eyebrow}</p><h2 className="mt-1 text-base font-bold tracking-[-.02em] sm:text-lg">{title}</h2>{description?<p className="mt-1 max-w-2xl text-[11px] leading-5 text-[var(--text-muted)]">{description}</p>:null}</div>
  {action}
 </div>;
}

function SummaryCard({
 title,plainLabel,value,detail,href,icon,tone="blue",emphasis=false,
}:{title:string;plainLabel:string;value:number;detail:string;href:string;icon:GlyphName;tone?:"blue"|"green"|"amber"|"rose"|"violet"|"slate";emphasis?:boolean}){
 return <Link href={href} className={"dashboard-summary-card dashboard-summary-"+tone+" group "+(emphasis?"dashboard-summary-emphasis":"")}>
  <div className="flex items-start justify-between gap-3"><span className="dashboard-summary-mark"><Glyph name={icon}/></span><span className="dashboard-summary-arrow">↗</span></div>
  <p className="mt-4 text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">{title}</p>
  <p className="dashboard-summary-money money mt-1.5 font-black">{money(value)}</p>
  <p className="mt-1 text-xs font-semibold text-[var(--text)]">{plainLabel}</p>
  <p className="mt-1.5 text-[10px] leading-4 text-[var(--text-muted)]">{detail}</p>
 </Link>;
}

function PositionChart({rows}:{rows:Trend[]}){
 const width=760,height=246,pad=26;
 const values=rows.flatMap(r=>[r.netPosition,r.availableFunds]);
 const min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1;
 const point=(v:number,i:number)=>({x:pad+(rows.length<=1?0:i*(width-pad*2)/(rows.length-1)),y:height-pad-((v-min)/range)*(height-pad*2)});
 const path=(key:"netPosition"|"availableFunds")=>rows.map((r,i)=>{const p=point(r[key],i);return (i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1);}).join(" ");
 const area=rows.length?path("netPosition")+" L "+(width-pad)+" "+(height-pad)+" L "+pad+" "+(height-pad)+" Z":"";
 if(!rows.length)return <EmptyState title="Trend will appear after end-of-day snapshots"/>;
 const movement=rows[rows.length-1].netPosition-rows[0].netPosition;
 return <div>
  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
   <div className="flex gap-4"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--accent)]"/>Overall position</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-500"/>Available now</span></div>
   <span className={movement<0?"text-[var(--money-out)]":"text-[var(--money-in)]"}>{movement>=0?"+":""}{money(movement)} over 10 days</span>
  </div>
  <svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full overflow-visible" role="img" aria-label="Ten day money position trend">
   {[.25,.5,.75].map(n=><line key={n} x1={pad} x2={width-pad} y1={pad+n*(height-pad*2)} y2={pad+n*(height-pad*2)} stroke="var(--border)" strokeDasharray="4 7"/>)}
   {area?<path d={area} fill="var(--accent-soft)" className="dashboard-chart-area"/>:null}
   <path d={path("availableFunds")} pathLength="1" fill="none" stroke="#10b981" strokeWidth="2.3" strokeLinecap="round" className="dashboard-chart-line"/>
   <path d={path("netPosition")} pathLength="1" fill="none" stroke="var(--accent)" strokeWidth="3.3" strokeLinecap="round" className="dashboard-chart-line dashboard-chart-delay"/>
   {rows.map((r,i)=>{const p=point(r.netPosition,i);return <g key={r.date}><circle cx={p.x} cy={p.y} r="3.8" fill="var(--accent)" className="dashboard-chart-dot"><title>{r.date+" · "+money(r.netPosition)}</title></circle><text x={p.x} y={height-3} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{r.date.slice(5)}</text></g>})}
  </svg>
 </div>;
}

type DonutItem={label:string;value:number;color:string};
function DonutBreakdown({items,totalLabel="Total"}:{items:DonutItem[];totalLabel?:string}){
 const total=items.reduce((s,x)=>s+Math.max(0,x.value),0);
 let cursor=0;
 const stops=items.map(x=>{const start=cursor,end=total?cursor+Math.max(0,x.value)/total*100:cursor;cursor=end;return x.color+" "+start+"% "+end+"%";}).join(",");
 if(total<=0)return <EmptyState title="No positive available balance yet"/>;
 return <div className="grid gap-5 sm:grid-cols-[150px_1fr] sm:items-center">
  <div className="dashboard-ring relative mx-auto h-36 w-36 rounded-full" style={{background:"conic-gradient("+stops+")"}}><div className="absolute inset-[22px] grid place-items-center rounded-full bg-[var(--surface)]"><div className="text-center"><p className="text-[10px] text-[var(--text-muted)]">{totalLabel}</p><strong className="money text-lg">{compact(total)}</strong></div></div></div>
  <div className="space-y-2.5">{items.map(x=><div key={x.label} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:x.color}}/><span className="truncate">{x.label}</span></span><strong className="money shrink-0 text-xs">{money(x.value)}</strong></div>)}</div>
 </div>;
}

type Bucket={label:string;amount:number;count:number;tone:"green"|"blue"|"amber"|"rose"|"slate"};
function BucketBars({items}:{items:Bucket[]}){
 const max=Math.max(1,...items.map(x=>x.amount));
 return <div className="space-y-3">{items.map(x=><div key={x.label}>
  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{x.label}</span><span className="text-[var(--text-muted)]">{x.count} item{x.count===1?"":"s"} · <strong className="money text-[var(--text)]">{money(x.amount)}</strong></span></div>
  <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className={"dashboard-bucket dashboard-bucket-"+x.tone} style={{width:Math.max(x.amount?6:0,x.amount/max*100)+"%"}}/></div>
 </div>)}</div>;
}

function TodayMovement({today}:{today:Today}){
 const rows=[["Cash",today.cashIn,today.cashOut],["Bank",today.bankIn,today.bankOut],["UPI",today.upiIn,today.upiOut],["Wallet",today.walletIn,today.walletOut]] as [string,number,number][];
 const inflow=rows.reduce((sum,row)=>sum+row[1],0),outflow=rows.reduce((sum,row)=>sum+row[2],0),difference=inflow-outflow;
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
   <div className="dashboard-flow-total min-w-0 rounded-2xl p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Money in</p><p className="dashboard-metric-money money mt-1.5 font-black text-[var(--money-in)]">{money(inflow)}</p></div>
   <div className="dashboard-flow-total min-w-0 rounded-2xl p-3.5"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Money out</p><p className="dashboard-metric-money money mt-1.5 font-black text-[var(--money-out)]">{money(outflow)}</p></div>
   <div className="dashboard-flow-total col-span-2 min-w-0 rounded-2xl p-3.5 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Net movement</p><p className={"dashboard-metric-money money mt-1.5 font-black "+(difference<0?"text-[var(--money-out)]":"text-[var(--text)]")}>{money(difference)}</p></div>
  </div>
  <div className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
   <div>
    <div className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] gap-2 border-b border-[var(--border)] pb-2 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]"><span>Channel</span><span className="text-right text-[var(--money-in)]">In</span><span className="text-right text-[var(--money-out)]">Out</span></div>
    <div className="divide-y divide-[var(--border)]">{rows.map(([rowLabel,inc,out])=><div key={rowLabel} className="grid grid-cols-[minmax(68px,1fr)_minmax(72px,.8fr)_minmax(72px,.8fr)] items-center gap-2 py-3"><div className="min-w-0"><p className="text-xs font-bold">{rowLabel}</p><div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-[var(--surface-soft)]"><span className="bg-emerald-400" style={{width:(Math.abs(inc)/max*50)+"%"}}/><span className="ml-auto bg-rose-400" style={{width:(Math.abs(out)/max*50)+"%"}}/></div></div><strong className="dashboard-pulse-money money text-right font-bold text-[var(--money-in)]">{money(inc)}</strong><strong className="dashboard-pulse-money money text-right font-bold text-[var(--money-out)]">{money(out)}</strong></div>)}</div>
   </div>
   <div className="grid grid-cols-2 gap-2 self-start">{tiles.map(tile=><Link key={tile.label} href={tile.href} className="app-metric-tile dashboard-click-tile min-w-0 rounded-2xl p-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-[var(--text-muted)]">{tile.label}</p><span className="text-[9px] font-black text-[var(--accent)]">{tile.mark}</span></div><p className="dashboard-metric-money money mt-1.5 font-extrabold">{money(tile.value)}</p></Link>)}</div>
  </div>
  <p className="text-[10px] leading-4 text-[var(--text-muted)]">Money in/out shows today’s ledger movement through cash, bank, UPI and wallets. It is not a profit figure.</p>
 </div>;
}

export default function DashboardPage(){
 const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
 const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
 const [counter,setCounter]=useState<CashSession|null>(null),[cashHistory,setCashHistory]=useState<CashSession[]>([]),[eod,setEod]=useState<Eod|null>(null),[recent,setRecent]=useState<RecentTx[]>([]);
 const [insights,setInsights]=useState<ObligationInsights|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[asOf,setAsOf]=useState(0);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const insightsRequest=apiFetch<ObligationInsights>("/dashboard/obligation-insights").catch(()=>null);
   const [s,a,t,p,r,tr,c,h,e,rt,oi]=await Promise.all([
    apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
    apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),apiFetch<Trend[]>("/dashboard/position-trend"),
    apiFetch<CashSession|null>("/cash-counter/current"),apiFetch<CashSession[]>("/cash-counter/history"),apiFetch<Eod>("/end-of-day/status"),
    apiFetch<RecentTx[]>("/dashboard/recent-transactions?limit=8"),insightsRequest,
   ]);
   setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);setCounter(c);setCashHistory(h);setEod(e);setRecent(rt);setInsights(oi);setAsOf(Date.now());
  }catch(err){setError(err instanceof Error?err.message:"Failed to load dashboard");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);

 if(loading)return <AppShell><PageLoader label="Preparing dashboard…"/></AppShell>;
 if(error||!summary||!today)return <AppShell><div className="mx-auto max-w-md py-20"><Surface className="p-6 text-center"><h2 className="font-semibold">Dashboard couldn’t load</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{error||"Please try again."}</p><button onClick={load} className="mt-4 rounded-lg bg-[var(--text)] px-4 py-2 text-sm font-semibold text-[var(--surface)]">Try again</button></Surface></div></AppShell>;

 const bankAccounts=accounts.filter(a=>a.isActive&&a.accountType==="BANK");
 const walletAccounts=accounts.filter(a=>a.isActive&&a.accountType==="PROVIDER_WALLET");
 const upiAccounts=accounts.filter(a=>a.isActive&&a.accountType==="UPI");
 const activeAccounts=[...accounts].filter(a=>a.isActive&&a.accountType!=="OWNER_CREDIT_CARD").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance)).slice(0,7);
 const overdueTotal=summary.receivableBreakdown.overdueCount+summary.payableBreakdown.overdueCount;
 const cashSnapshot=counter??cashHistory[0]??null;
 const preferredCount=cashSnapshot?.status==="OPEN"?"OPENING":"CLOSING";
 const denominationCounts=(cashSnapshot?.denominationCounts??[]).filter(x=>x.countType===preferredCount).sort((a,b)=>Number(b.denomination)-Number(a.denomination));
 const updatedAt=new Date(asOf);
 const dateLabel=updatedAt.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
 const timeLabel=updatedAt.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});

 const liquidityItems:DonutItem[]=[
  {label:"Bank",value:Math.max(0,summary.bankBalance),color:"#2563eb"},
  {label:"Cash",value:Math.max(0,summary.cashBalance),color:"#475569"},
  {label:"UPI",value:Math.max(0,summary.upiBalance),color:"#06b6d4"},
  {label:"Provider wallets",value:Math.max(0,summary.walletBalance),color:"#7c3aed"},
 ];

 const localReceivableBuckets=(()=>{
  const now=asOf,day=86400000;
  const buckets:Bucket[]=[
   {label:"Current / future",amount:0,count:0,tone:"green"},
   {label:"0–30 days overdue",amount:0,count:0,tone:"blue"},
   {label:"31–60 days overdue",amount:0,count:0,tone:"amber"},
   {label:"60+ days overdue",amount:0,count:0,tone:"rose"},
  ];
  for(const r of receivables){const amount=Number(r.remainingAmount||0);if(!r.dueAt||new Date(r.dueAt).getTime()>=now){buckets[0].amount+=amount;buckets[0].count++;continue;}const age=Math.floor((now-new Date(r.dueAt).getTime())/day);const idx=age<=30?1:age<=60?2:3;buckets[idx].amount+=amount;buckets[idx].count++;}
  return buckets;
 })();
 const localPayableBuckets=(()=>{
  const day=86400000,todayStart=new Date(asOf);todayStart.setHours(0,0,0,0);const todayEnd=todayStart.getTime()+day;
  const buckets:Bucket[]=[{label:"Overdue",amount:0,count:0,tone:"rose"},{label:"Due today",amount:0,count:0,tone:"amber"},{label:"Next 7 days",amount:0,count:0,tone:"blue"},{label:"Later",amount:0,count:0,tone:"slate"}];
  for(const p of payables){const due=new Date(p.dueAt).getTime(),amount=Number(p.remainingAmount||0);const idx=due<todayStart.getTime()?0:due<todayEnd?1:due<todayEnd+7*day?2:3;buckets[idx].amount+=amount;buckets[idx].count++;}
  return buckets;
 })();
 const receivableBuckets:Bucket[]=insights?.receivables.map((x,i)=>({...x,tone:(["green","blue","amber","rose"] as Bucket["tone"][])[i]??"slate"}))??localReceivableBuckets;
 const payableBuckets:Bucket[]=insights?.payables.map((x,i)=>({...x,tone:(["rose","amber","blue","slate"] as Bucket["tone"][])[i]??"slate"}))??localPayableBuckets;

 const actionItems=[
  {label:"Collect overdue",sentence:"Customers are overdue",value:summary.receivableBreakdown.overdueAmount,count:summary.receivableBreakdown.overdueCount,href:"/receivables",tone:"rose"},
  {label:"Pay overdue",sentence:"Customer payments are overdue",value:summary.payableBreakdown.overdueAmount,count:summary.payableBreakdown.overdueCount,href:"/payables",tone:"rose"},
  {label:"Collect today",sentence:"Due to be collected today",value:summary.receivableBreakdown.dueTodayAmount,count:summary.receivableBreakdown.dueTodayCount,href:"/receivables",tone:"green"},
  {label:"Pay today",sentence:"Due to be paid today",value:summary.payableBreakdown.dueTodayAmount,count:summary.payableBreakdown.dueTodayCount,href:"/payables",tone:"amber"},
 ].filter(x=>x.count>0);

 return <AppShell><div className="app-page-frame page-enter mx-auto max-w-[1500px] space-y-5">
  <div className="dashboard-command-header flex flex-wrap items-end justify-between gap-4">
   <div>
    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--accent)]">Business overview</p>
    <h1 className="text-[1.75rem] font-black tracking-[-.045em] sm:text-[2rem]">Dashboard</h1>
    <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">See what you have now, what is coming in, what you owe, and what needs your attention.</p>
    <div className="mt-2 flex flex-wrap items-center gap-2">
     <span className="dashboard-status-pill">{dateLabel} · updated {timeLabel}</span>
     <Link href="/cash-counter" className={"dashboard-status-pill "+(counter?"dashboard-status-good":"dashboard-status-warn")}>{counter?"Cash counter open":"Cash counter closed"}</Link>
     <Link href="/end-of-day" className={"dashboard-status-pill "+(eod?.snapshot?"dashboard-status-good":"dashboard-status-warn")}>{eod?.snapshot?"EOD saved":"EOD pending"}</Link>
     {overdueTotal>0?<span className="dashboard-status-pill dashboard-status-risk">{overdueTotal} overdue item{overdueTotal===1?"":"s"}</span>:<span className="dashboard-status-pill dashboard-status-good">No overdue items</span>}
    </div>
   </div>
   <div className="flex flex-wrap gap-2"><Link href="/expenses" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Expenses</Link><Link href="/receivables" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Collect</Link><Link href="/payables" className="app-secondary-button px-3.5 py-2.5 text-xs font-bold">Pay</Link><Link href="/transactions/new" className="app-primary-button px-4 py-2.5 text-xs font-bold">+ New transaction</Link></div>
  </div>

  <section>
   <SectionHead eyebrow="At a glance" title="The six numbers to check first" description="Each card opens the page behind that number, so you can move from summary to detail in one click."/>
   <div className="dashboard-summary-grid">
    <SummaryCard title="Overall position" plainLabel="What remains after obligations" value={summary.netFinancialPosition} detail="Available funds + provider settlements + receivables − payables − card outstanding." href="/reports" icon="position" tone={summary.netFinancialPosition<0?"rose":"blue"} emphasis/>
    <SummaryCard title="Bank" plainLabel="Money in bank accounts" value={summary.bankBalance} detail={bankAccounts.length+" active bank account"+(bankAccounts.length===1?"":"s")+". UPI is shown separately below."} href="/accounts?type=BANK" icon="bank" tone="blue"/>
    <SummaryCard title="Provider wallets" plainLabel="Money in service wallets" value={summary.walletBalance} detail={walletAccounts.length+" active provider wallet"+(walletAccounts.length===1?"":"s")+"."} href="/accounts?type=PROVIDER_WALLET" icon="wallet" tone="violet"/>
    <SummaryCard title="To receive" plainLabel="Customers owe you" value={summary.customerReceivable} detail={summary.receivableBreakdown.overdueCount+" overdue · "+summary.receivableBreakdown.dueTodayCount+" due today."} href="/receivables" icon="receive" tone="green"/>
    <SummaryCard title="To pay" plainLabel="You owe customers" value={summary.customerPayable} detail={summary.payableBreakdown.overdueCount+" overdue · "+summary.payableBreakdown.dueTodayCount+" due today."} href="/payables" icon="pay" tone="amber"/>
    <SummaryCard title="Cash" plainLabel="Cash ledger balance" value={summary.cashBalance} detail={counter?"Physical cash counter is open.":"Open cash counter when you want to verify notes and coins."} href="/cash-counter" icon="cash" tone="slate"/>
   </div>
  </section>

  <Surface className="dashboard-command-hero overflow-hidden">
   <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.18fr_.82fr]">
    <div className="dashboard-command-primary min-w-0 rounded-[22px] p-5 sm:p-6">
     <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">How the overall position is built</p><p className="mt-1 text-sm font-semibold">A simple money bridge, not a profit calculation.</p></div><Link href="/reports" className="text-xs font-bold text-[var(--accent)]">See reports →</Link></div>
     <p className={"dashboard-command-money money mt-5 font-black "+(summary.netFinancialPosition<0?"text-[var(--money-out)]":"")}>{money(summary.netFinancialPosition)}</p>
     <div className="dashboard-money-bridge mt-5">
      <div className="dashboard-bridge-item dashboard-bridge-positive"><span>Available now</span><strong>{money(summary.availableFunds)}</strong><small>Bank + UPI + cash + wallets</small></div>
      <div className="dashboard-bridge-sign">+</div>
      <div className="dashboard-bridge-item dashboard-bridge-positive"><span>Provider settlements</span><strong>{money(summary.pendingProviderSettlements)}</strong><small>Expected from providers</small></div>
      <div className="dashboard-bridge-sign">+</div>
      <div className="dashboard-bridge-item dashboard-bridge-positive"><span>To receive</span><strong>{money(summary.customerReceivable)}</strong><small>Customer receivables</small></div>
      <div className="dashboard-bridge-sign">−</div>
      <div className="dashboard-bridge-item dashboard-bridge-negative"><span>To pay</span><strong>{money(summary.customerPayable)}</strong><small>Customer payables</small></div>
      <div className="dashboard-bridge-sign">−</div>
      <div className="dashboard-bridge-item dashboard-bridge-negative"><span>Card outstanding</span><strong>{money(summary.creditCardOutstanding)}</strong><small>Owner credit cards</small></div>
     </div>
    </div>
    <div className="grid content-start gap-2.5 sm:grid-cols-2">
     <Link href="/expenses" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><div className="flex items-center gap-2 text-[var(--money-out)]"><Glyph name="expense"/><p className="text-[10px] font-bold uppercase tracking-[.08em]">Expenses today</p></div><p className="dashboard-metric-money money mt-2 font-black">{money(today.businessExpense+today.personalExpense)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Business {money(today.businessExpense)} · Personal {money(today.personalExpense)}</p></Link>
     <Link href="/provider-settlements" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><div className="flex items-center gap-2 text-cyan-600"><Glyph name="settlement"/><p className="text-[10px] font-bold uppercase tracking-[.08em]">Provider settlements</p></div><p className="dashboard-metric-money money mt-2 font-black">{money(summary.pendingProviderSettlements)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{summary.pendingProviderSettlementCount} pending settlement{summary.pendingProviderSettlementCount===1?"":"s"}.</p></Link>
     <Link href="/accounts?type=OWNER_CREDIT_CARD" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><div className="flex items-center gap-2 text-[var(--money-out)]"><Glyph name="card"/><p className="text-[10px] font-bold uppercase tracking-[.08em]">Credit cards</p></div><p className="dashboard-metric-money money mt-2 font-black">{money(summary.creditCardOutstanding)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Outstanding · {money(summary.creditCardAvailable)} still available.</p></Link>
     <Link href="/accounts?type=UPI" className="dashboard-position-metric group min-w-0 rounded-2xl border border-[var(--border)] p-3.5"><div className="flex items-center gap-2 text-cyan-600"><Glyph name="upi"/><p className="text-[10px] font-bold uppercase tracking-[.08em]">UPI</p></div><p className="dashboard-metric-money money mt-2 font-black">{money(summary.upiBalance)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{upiAccounts.length} active UPI account{upiAccounts.length===1?"":"s"}.</p></Link>
    </div>
   </div>
  </Surface>

  <section>
   <SectionHead eyebrow="Do this next" title="What needs attention" description="Only items that need action are shown here. When everything is clear, this section stays calm."/>
   {actionItems.length?<div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">{actionItems.map(item=><Link key={item.label} href={item.href} className={"dashboard-attention-card dashboard-attention-"+item.tone}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold">{item.label}</p><p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{item.sentence}</p></div><span>→</span></div><p className="money mt-3 text-xl font-black">{money(item.value)}</p><p className="mt-1 text-[10px] font-semibold text-[var(--text-muted)]">{item.count} item{item.count===1?"":"s"}</p></Link>)}</div>
   :<Surface className="dashboard-clear-state flex items-center gap-3 p-4"><span className="dashboard-clear-icon">✓</span><div><p className="text-sm font-bold">Nothing urgent right now</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">No overdue or due-today customer obligations.</p></div></Surface>}
  </section>

  <div className="grid gap-4 xl:grid-cols-[1.5fr_.9fr]">
   <Surface className="dashboard-panel min-w-0 p-4 sm:p-5"><SectionHead eyebrow="Trend" title="How your position is moving" description="Overall position compared with money that is immediately available." action={<Link href="/reports" className="text-xs font-bold text-[var(--accent)]">Open reports →</Link>}/><PositionChart rows={trend}/></Surface>
   <Surface className="dashboard-panel p-4 sm:p-5"><SectionHead eyebrow="Available funds" title="Where your money sits" description="Positive balances across the four liquid account groups." action={<Link href="/accounts" className="text-xs font-bold text-[var(--accent)]">Open accounts →</Link>}/><DonutBreakdown items={liquidityItems} totalLabel="Available"/></Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-3">
   <Surface className="dashboard-panel p-4 sm:p-5"><SectionHead eyebrow="Receivables" title="How old is money to receive?" description="Older overdue money deserves attention first." action={<Link href="/receivables" className="text-xs font-bold text-[var(--accent)]">View all</Link>}/><BucketBars items={receivableBuckets}/></Surface>
   <Surface className="dashboard-panel p-4 sm:p-5"><SectionHead eyebrow="Payables" title="When must you pay?" description="A simple due-date view of customer payables." action={<Link href="/payables" className="text-xs font-bold text-[var(--accent)]">View all</Link>}/><BucketBars items={payableBuckets}/></Surface>
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><div><p className="dashboard-kicker">Cash check</p><h2 className="mt-1 text-base font-bold">Notes & coins snapshot</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">Physical count is separate from the ledger balance above.</p></div><Link href="/cash-counter" className="text-xs font-bold text-[var(--accent)]">Open counter</Link></div>
    {cashSnapshot&&denominationCounts.length?<div><div className="flex items-center justify-between bg-[var(--surface-soft)] px-4 py-2.5 text-[10px] text-[var(--text-muted)]"><span>{preferredCount==="OPENING"?"Opening count":"Closing count"} · {cashSnapshot.cashAccount.accountName}</span><strong>{cashSnapshot.status}</strong></div><div className="divide-y divide-[var(--border)]">{denominationCounts.slice(0,6).map(row=><div key={row.denomination} className="grid grid-cols-[70px_1fr_100px] items-center px-4 py-2.5 text-xs"><strong className="money">₹{Number(row.denomination)}</strong><span className="text-center text-[var(--text-muted)]">× {row.quantity}</span><strong className="money text-right">{money(row.totalAmount)}</strong></div>)}</div></div>:<div className="p-4"><EmptyState title="No physical count yet" description="Use Cash Counter to record denominations."/></div>}
   </Surface>
  </div>

  <Surface className="dashboard-panel p-4 sm:p-5"><SectionHead eyebrow="Today" title="Money movement today" description="A simple view of how money moved through your main channels and services." action={<span className="dashboard-live-badge"><i/>Live</span>}/><TodayMovement today={today}/></Surface>

  <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="dashboard-kicker">Accounts</p><h2 className="mt-1 text-base font-bold">Largest available balances</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">Tap an account to open its ledger.</p></div><Link href="/accounts" className="text-xs font-bold text-[var(--accent)]">View all</Link></div>
    {activeAccounts.length?<div className="divide-y divide-[var(--border)]">{activeAccounts.map(a=><Link key={a.id} href={"/accounts/"+a.id} className="dashboard-account-row flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-[9px] font-black text-[var(--text-muted)]">{a.accountType.split("_").map(x=>x[0]).join("").slice(0,3)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{a.accountName}</p><p className="mt-0.5 truncate text-[10px] font-medium text-[var(--text-muted)]">{a.accountType.replaceAll("_"," ")}</p></div></div><strong className={"dashboard-row-money money shrink-0 font-bold "+(a.currentBalance<0?"text-[var(--money-out)]":"")}>{money(a.currentBalance)}</strong></Link>)}</div>:<div className="p-4"><EmptyState title="No account balances yet"/></div>}
   </Surface>
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="dashboard-kicker">Recent activity</p><h2 className="mt-1 text-base font-bold">Latest transactions</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">A quick audit trail of the most recent entries.</p></div><Link href="/transactions" className="text-xs font-bold text-[var(--accent)]">View all</Link></div>
    {recent.length?<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead className="bg-[var(--surface-soft)] text-left text-[10px] uppercase tracking-[.06em] text-[var(--text-muted)]"><tr><th className="px-4 py-2.5">Date</th><th>Particulars</th><th>Type</th><th className="pr-4 text-right">Amount</th></tr></thead><tbody>{recent.map(tx=><tr key={tx.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 text-[var(--text-muted)]">{new Date(tx.transactionAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</td><td><Link href={"/transactions/"+tx.id} className="font-bold text-[var(--accent)]">{tx.customer?.fullName??tx.transactionNumber}</Link></td><td className="text-[var(--text-muted)]">{label(tx.transactionType)}</td><td className="money pr-4 text-right font-bold">{money(tx.netAmount??tx.grossAmount)}</td></tr>)}</tbody></table></div>:<div className="p-4"><EmptyState title="No recent transactions"/></div>}
   </Surface>
  </div>
 </div></AppShell>;
}
