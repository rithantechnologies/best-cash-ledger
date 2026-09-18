"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CompactMetric, EmptyState, MiniStat, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Breakdown={pendingAmount:number;pendingCount:number;partialAmount:number;partialCount:number;dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number};
type Summary={
  cashBalance:number;bankBalance:number;upiBalance:number;walletBalance:number;availableFunds:number;
  customerPayable:number;customerReceivable:number;pendingProviderSettlements:number;pendingProviderSettlementCount:number;
  operatingPosition:number;netFinancialPosition:number;payableBreakdown:Breakdown;receivableBreakdown:Breakdown;
  creditCardOutstanding:number;creditCardAvailable:number;
};
type Account={id:string;accountName:string;accountType:string;accountNature:string;usageType:string;currentBalance:number;creditLimit:number|null;availableCredit:number|null;isActive:boolean};
type Today={
  cashIn:number;cashOut:number;bankIn:number;bankOut:number;walletIn:number;walletOut:number;upiIn:number;upiOut:number;
  cardSwipe:number;aeps:number;customerPayout:number;customerReceipt:number;receivableCreated:number;
  commission:number;providerCharges:number;businessExpense:number;personalExpense:number;
};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;reason:string;customer:{fullName:string}};
type Trend={date:string;availableFunds:number;pendingProviderSettlements:number;receivables:number;payables:number;creditCardOutstanding:number;operatingPosition:number;netPosition:number};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const shortMoney=(v:number)=>new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1,style:"currency",currency:"INR"}).format(v);
function SparkChart({rows}:{rows:Trend[]}) {
  const width=760,height=250,pad=24;
  const values=rows.flatMap(r=>[r.netPosition,r.operatingPosition,r.availableFunds]);
  const min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1;
  const point=(v:number,i:number)=>({
    x:pad+(rows.length<=1?0:i*(width-pad*2)/(rows.length-1)),
    y:height-pad-((v-min)/range)*(height-pad*2),
  });
  const path=(key:"netPosition"|"operatingPosition"|"availableFunds")=>rows.map((r,i)=>{
    const p=point(r[key],i);return (i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1);
  }).join(" ");
  const area=rows.length?path("netPosition")+" L "+(width-pad)+" "+(height-pad)+" L "+pad+" "+(height-pad)+" Z":"";
  return <div>
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-medium text-slate-500">
      {[["Net position","bg-indigo-600"],["Operating","bg-cyan-500"],["Available","bg-emerald-500"]].map(([l,c])=><span key={l} className="flex items-center gap-1.5"><i className={"h-2 w-2 rounded-full "+c}/>{l}</span>)}
    </div>
    <svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full" role="img" aria-label="10 day financial position trend">
      <defs><linearGradient id="net-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity=".17"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
      {[.25,.5,.75].map(n=><line key={n} x1={pad} x2={width-pad} y1={pad+n*(height-pad*2)} y2={pad+n*(height-pad*2)} stroke="#e2e8f0" strokeDasharray="4 7"/>)}
      {area?<path d={area} fill="url(#net-fill)"/>:null}
      <path d={path("availableFunds")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"/>
      <path d={path("operatingPosition")} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round"/>
      <path d={path("netPosition")} fill="none" stroke="#4f46e5" strokeWidth="3.5" strokeLinecap="round"/>
      {rows.map((r,i)=>{const p=point(r.netPosition,i);return <g key={r.date}><circle cx={p.x} cy={p.y} r="4" fill="#4f46e5"><title>{r.date+" · "+money(r.netPosition)}</title></circle><text x={p.x} y={height-3} textAnchor="middle" fontSize="9" fill="#94a3b8">{r.date.slice(5)}</text></g>})}
    </svg>
    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
      <span>{rows[0]?money(rows[0].netPosition):"—"}</span><span>10-day movement</span><strong className="text-slate-700">{rows.length?money(rows[rows.length-1].netPosition):"—"}</strong>
    </div>
  </div>;
}

function MoneyMix({summary}:{summary:Summary}) {
  const items=[
    {label:"Cash",value:summary.cashBalance,color:"#0f172a"},
    {label:"Banks",value:summary.bankBalance,color:"#6366f1"},
    {label:"UPI",value:summary.upiBalance,color:"#06b6d4"},
    {label:"Wallets",value:summary.walletBalance,color:"#10b981"},
  ].map(x=>({...x,value:Math.max(0,x.value)}));
  const total=items.reduce((s,x)=>s+x.value,0);
  let cursor=0;
  const stops=items.map(x=>{const start=cursor,end=total?cursor+x.value/total*100:cursor;cursor=end;return x.color+" "+start+"% "+end+"%";}).join(",");
  return <div className="grid gap-5 sm:grid-cols-[150px_1fr] sm:items-center">
    <div className="relative mx-auto h-36 w-36 rounded-full" style={{background:total?"conic-gradient("+stops+")":"#e2e8f0"}}>
      <div className="absolute inset-5 grid place-items-center rounded-full bg-white shadow-inner"><div className="text-center"><p className="text-[10px] uppercase tracking-wide text-slate-400">Available</p><strong className="text-xl">{shortMoney(total)}</strong></div></div>
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-1">{items.map(x=><div key={x.label} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-xs text-slate-500"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:x.color}}/><span className="truncate">{x.label}</span></span><strong className="text-sm">{money(x.value)}</strong></div>)}</div>
  </div>;
}
function ActivityGroup({title,tone,rows}:{title:string;tone:"emerald"|"rose"|"indigo";rows:{label:string;value:number}[]}) {
  const max=Math.max(1,...rows.map(x=>Math.abs(x.value)));
  const dot={emerald:"bg-emerald-500",rose:"bg-rose-500",indigo:"bg-indigo-500"}[tone];
  return <div className="min-w-0">
    <div className="mb-2 flex items-center gap-2"><i className={"h-2 w-2 rounded-full "+dot}/><h4 className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{title}</h4></div>
    <div className="space-y-1.5">{rows.map(row=><CompactMetric key={row.label} label={row.label} value={money(row.value)} tone={tone} bar={Math.abs(row.value)/max*100}/>)}</div>
  </div>;
}

function AccountList({accounts}:{accounts:Account[]}) {
  const rows=[...accounts].filter(a=>a.accountType!=="OWNER_CREDIT_CARD").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance)).slice(0,6);
  const max=Math.max(1,...rows.map(r=>Math.abs(r.currentBalance)));
  if(!rows.length)return <EmptyState title="No account balances yet" description="Balances will appear as accounts are configured and used."/>;
  return <div className="space-y-3">{rows.map(a=><div key={a.id}>
    <div className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold">{a.accountName}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">{a.accountType.replaceAll("_"," ")}</p></div><strong className={a.currentBalance<0?"text-rose-700":""}>{money(a.currentBalance)}</strong></div>
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full "+(a.currentBalance<0?"bg-rose-400":"bg-indigo-500")} style={{width:Math.max(2,Math.abs(a.currentBalance)/max*100)+"%"}}/></div>
  </div>)}</div>;
}

export default function DashboardPage(){
  const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
  const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [s,a,t,p,r,tr]=await Promise.all([
        apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
        apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),apiFetch<Trend[]>("/dashboard/position-trend"),
      ]);
      setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);
    }catch(e){setError(e instanceof Error?e.message:"Failed to load dashboard");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);

  const alerts=useMemo(()=>summary?[
    {label:"Receivable overdue",value:summary.receivableBreakdown.overdueAmount,count:summary.receivableBreakdown.overdueCount,tone:"rose" as const},
    {label:"Payable overdue",value:summary.payableBreakdown.overdueAmount,count:summary.payableBreakdown.overdueCount,tone:"rose" as const},
    {label:"Due to receive today",value:summary.receivableBreakdown.dueTodayAmount,count:summary.receivableBreakdown.dueTodayCount,tone:"indigo" as const},
    {label:"Due to pay today",value:summary.payableBreakdown.dueTodayAmount,count:summary.payableBreakdown.dueTodayCount,tone:"amber" as const},
  ]:[],[summary]);

  if(loading)return <AppShell><PageLoader label="Preparing your dashboard…"/></AppShell>;
  if(error||!summary||!today)return <AppShell><div className="grid min-h-[58vh] place-items-center"><Surface className="max-w-md p-6 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-700">!</div><h2 className="mt-4 font-bold">Dashboard couldn’t load</h2><p className="mt-1 text-sm text-slate-500">{error||"Please try again."}</p><button onClick={load} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">Try again</button></Surface></div></AppShell>;

  const inbound=[{label:"Cash in",value:today.cashIn},{label:"Receipts",value:today.customerReceipt},{label:"Bank in",value:today.bankIn},{label:"UPI in",value:today.upiIn},{label:"Wallet in",value:today.walletIn},{label:"Commission",value:today.commission}];
  const outbound=[{label:"Cash out",value:today.cashOut},{label:"Payouts",value:today.customerPayout},{label:"Bank out",value:today.bankOut},{label:"UPI out",value:today.upiOut},{label:"Wallet out",value:today.walletOut},{label:"Charges",value:today.providerCharges}];
  const operations=[{label:"Card swipe",value:today.cardSwipe},{label:"AePS",value:today.aeps},{label:"Receivables created",value:today.receivableCreated},{label:"Business expense",value:today.businessExpense},{label:"Personal expense",value:today.personalExpense}];
  return <AppShell><div className="page-enter mx-auto max-w-[1440px] space-y-4 sm:space-y-5">
    <SectionHeading eyebrow="Live business position" title="Dashboard" description="What you have, what is coming in, and what needs attention—without digging through reports."
      action={<div className="grid grid-cols-2 gap-2"><Link href="/receivables" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-center text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-100">Receive money</Link><Link href="/payables" className="rounded-xl bg-white px-3.5 py-2.5 text-center text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-200">Payables</Link></div>}/>

    <Surface className="overflow-hidden border-0 bg-[linear-gradient(135deg,#0f172a_0%,#111827_55%,#1e1b4b_100%)] text-white shadow-[0_20px_60px_rgba(15,23,42,.18)]">
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.1fr_1.6fr] lg:p-7">
        <div className="flex flex-col justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-indigo-300">Net financial position</p><p className={"mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl "+(summary.netFinancialPosition<0?"text-rose-300":"text-white")}>{money(summary.netFinancialPosition)}</p><div className="mt-3 flex items-center gap-2"><span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">Operating {money(summary.operatingPosition)}</span><span className="text-[11px] text-slate-400">after receivables & payables</span></div></div>
          <p className="mt-5 max-w-md text-xs leading-5 text-slate-400">Net position includes liquid funds and clearing, adds customer receivables, then subtracts customer payables and owner card outstanding.</p>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
          {[
            ["Available now",summary.availableFunds,"text-emerald-300"],["Provider clearing",summary.pendingProviderSettlements,"text-cyan-300"],
            ["To receive",summary.customerReceivable,"text-sky-300"],["To pay",summary.customerPayable,"text-amber-300"],
            ["Card outstanding",summary.creditCardOutstanding,"text-rose-300"],["Card available",summary.creditCardAvailable,"text-indigo-300"],
          ].map(([label,value,tone])=><div key={String(label)} className="bg-white/[.055] p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">{label}</p><p className={"mt-1.5 text-lg font-bold tracking-tight sm:text-xl "+tone}>{money(Number(value))}</p></div>)}
        </div>
      </div>
    </Surface>
    <Surface className="p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-bold tracking-tight">Today’s operating pulse</h3><p className="mt-0.5 text-xs text-slate-500">Everything that moved today, grouped for quick scanning.</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">India day</span></div>
      <div className="grid gap-4 md:grid-cols-3">
        <ActivityGroup title="Money in" tone="emerald" rows={inbound}/>
        <ActivityGroup title="Money out" tone="rose" rows={outbound}/>
        <ActivityGroup title="Services & activity" tone="indigo" rows={operations}/>
      </div>
    </Surface>

    <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
      <Surface className="min-w-0 p-4 sm:p-5"><div className="mb-3"><h3 className="font-bold tracking-tight">Position trend</h3><p className="text-xs text-slate-500">10-day running view of net, operating and available funds.</p></div><SparkChart rows={trend}/></Surface>
      <Surface className="p-4 sm:p-5"><div className="mb-4"><h3 className="font-bold tracking-tight">Where the money is</h3><p className="text-xs text-slate-500">Current liquid funds by account family.</p></div><MoneyMix summary={summary}/></Surface>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Surface className="p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-bold tracking-tight">Attention today</h3><p className="text-xs text-slate-500">Due and overdue items that may need action.</p></div></div>
        <div className="grid grid-cols-2 gap-2.5">{alerts.map(a=><div key={a.label} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100"><MiniStat label={a.label} value={money(a.value)} detail={a.count+" item(s)"} tone={a.tone}/></div>)}</div>
      </Surface>
      <Surface className="p-4 sm:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-bold tracking-tight">Account balances</h3><p className="text-xs text-slate-500">Largest current balances across active accounts.</p></div><Link href="/accounts" className="text-xs font-bold text-indigo-600">View all →</Link></div><AccountList accounts={accounts}/></Surface>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Surface className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5"><div><h3 className="text-sm font-bold">Money to receive</h3><p className="text-[11px] text-slate-400">Next customer collections</p></div><Link href="/receivables" className="text-xs font-bold text-indigo-600">View all →</Link></div>
        {receivables.length?<div className="divide-y divide-slate-100">{receivables.slice(0,4).map(r=><div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.customer.fullName}</p><p className="truncate text-[11px] text-slate-400">{r.reason} · {r.dueAt?new Date(r.dueAt).toLocaleDateString("en-IN"):"No due date"}</p></div><div className="text-right"><p className="text-sm font-bold text-emerald-700">{money(r.remainingAmount)}</p><p className={r.bucket==="OVERDUE"?"text-[10px] font-bold text-rose-600":"text-[10px] text-slate-400"}>{r.bucket}</p></div></div>)}</div>:<div className="p-4"><EmptyState title="Nothing outstanding to receive"/></div>}
      </Surface>
      <Surface className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5"><div><h3 className="text-sm font-bold">Money to pay</h3><p className="text-[11px] text-slate-400">Next customer obligations</p></div><Link href="/payables" className="text-xs font-bold text-indigo-600">View all →</Link></div>
        {payables.length?<div className="divide-y divide-slate-100">{payables.slice(0,4).map(p=><div key={p.id} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{p.customer.fullName}</p><p className="text-[11px] text-slate-400">Due {new Date(p.dueAt).toLocaleDateString("en-IN")}</p></div><div className="text-right"><p className="text-sm font-bold text-amber-700">{money(p.remainingAmount)}</p><p className={p.bucket==="OVERDUE"?"text-[10px] font-bold text-rose-600":"text-[10px] text-slate-400"}>{p.bucket}</p></div></div>)}</div>:<div className="p-4"><EmptyState title="No open customer payables"/></div>}
      </Surface>
    </div>
  </div></AppShell>;
}
