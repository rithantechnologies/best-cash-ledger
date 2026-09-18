"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Breakdown={pendingAmount:number;pendingCount:number;partialAmount:number;partialCount:number;dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number};
type Summary={
  cashBalance:number;bankBalance:number;upiBalance:number;walletBalance:number;availableFunds:number;
  customerPayable:number;customerReceivable:number;pendingProviderSettlements:number;pendingProviderSettlementCount:number;
  operatingPosition:number;netFinancialPosition:number;
  payableBreakdown:Breakdown;receivableBreakdown:Breakdown;
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

function Metric({label,value,hint,tone="slate"}:{label:string;value:number;hint?:string;tone?:string}){
  const tones:Record<string,string>={slate:"text-slate-950",emerald:"text-emerald-700",red:"text-red-700",indigo:"text-indigo-700",amber:"text-amber-700"};
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-500">{label}</p>
    <p className={"mt-2 text-2xl font-bold tracking-tight "+(tones[tone]||tones.slate)}>{money(value)}</p>
    {hint?<p className="mt-1 text-xs text-slate-500">{hint}</p>:null}
  </div>;
}

function Donut({segments}:{segments:{label:string;value:number;color:string}[]}){
  const positive=segments.map(s=>({...s,value:Math.max(0,s.value)}));
  const total=positive.reduce((sum,s)=>sum+s.value,0);
  let cursor=0;
  const stops=positive.map(s=>{
    const start=cursor; const end=total?cursor+s.value/total*100:cursor; cursor=end;
    return s.color+" "+start+"% "+end+"%";
  }).join(",");
  return <div className="flex flex-col items-center gap-5 sm:flex-row">
    <div className="relative h-44 w-44 shrink-0 rounded-full" style={{background:total?"conic-gradient("+stops+")":"#e2e8f0"}}>
      <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
        <span className="text-xs text-slate-500">Available</span><strong className="text-lg">{shortMoney(total)}</strong>
      </div>
    </div>
    <div className="w-full space-y-3">{positive.map(s=><div key={s.label} className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{background:s.color}}/>{s.label}</span>
      <strong>{money(s.value)}</strong>
    </div>)}</div>
  </div>;
}

function PositionChart({rows}:{rows:Trend[]}){
  const width=720,height=260,pad=30;
  const values=rows.flatMap(r=>[r.netPosition,r.operatingPosition,r.availableFunds]);
  const min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1;
  const pts=(key:"netPosition"|"operatingPosition"|"availableFunds")=>rows.map((r,i)=>{
    const x=pad+(rows.length<=1?0:i*(width-pad*2)/(rows.length-1));
    const y=height-pad-((r[key]-min)/range)*(height-pad*2);
    return x.toFixed(1)+","+y.toFixed(1);
  }).join(" ");
  const zeroY=height-pad-((0-min)/range)*(height-pad*2);
  return <div>
    <div className="flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-indigo-600"/>Net position</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-cyan-500"/>Operating position</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500"/>Available funds</span></div>
    <div className="mt-4 overflow-x-auto"><svg viewBox={"0 0 "+width+" "+height} className="min-w-[640px] w-full">
      {[0.25,0.5,0.75].map(n=><line key={n} x1={pad} x2={width-pad} y1={pad+n*(height-pad*2)} y2={pad+n*(height-pad*2)} stroke="#e2e8f0" strokeDasharray="4 6"/>)}
      {min<0?<line x1={pad} x2={width-pad} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeDasharray="5 5"/>:null}
      <polyline fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={pts("availableFunds")}/>
      <polyline fill="none" stroke="#06b6d4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={pts("operatingPosition")}/>
      <polyline fill="none" stroke="#4f46e5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={pts("netPosition")}/>
      {rows.map((r,i)=>{const x=pad+(rows.length<=1?0:i*(width-pad*2)/(rows.length-1));const y=height-pad-((r.netPosition-min)/range)*(height-pad*2);return <g key={r.date}><circle cx={x} cy={y} r="5" fill="#4f46e5"><title>{r.date+" · Net "+money(r.netPosition)+" · Operating "+money(r.operatingPosition)+" · Available "+money(r.availableFunds)+" · Clearing "+money(r.pendingProviderSettlements)}</title></circle><text x={x} y={height-6} textAnchor="middle" fontSize="10" fill="#64748b">{r.date.slice(5)}</text></g>})}
    </svg></div>
    <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{rows[0]?money(rows[0].netPosition):"—"}</span><span>10-day movement</span><strong className="text-slate-800">{rows.at(-1)?money(rows.at(-1)!.netPosition):"—"}</strong></div>
  </div>;
}

function AccountBars({accounts}:{accounts:Account[]}){
  const rows=[...accounts].filter(a=>a.accountType!=="OWNER_CREDIT_CARD").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance)).slice(0,8);
  const max=Math.max(1,...rows.map(r=>Math.abs(r.currentBalance)));
  return <div className="space-y-4">{rows.map(a=><div key={a.id}>
    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{a.accountName}<small className="ml-2 text-[10px] font-normal text-slate-400">{a.accountType}</small></span><strong className={a.currentBalance<0?"text-red-700":""}>{money(a.currentBalance)}</strong></div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full "+(a.currentBalance<0?"bg-red-400":"bg-indigo-500")} style={{width:Math.max(2,Math.abs(a.currentBalance)/max*100)+"%"}}/></div>
  </div>)}</div>;
}

function SideBar({label,value,max,tone}:{label:string;value:number;max:number;tone:string}){
  return <div><div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">{label}</span><strong>{money(value)}</strong></div><div className="h-3 rounded-full bg-slate-100"><div className={"h-3 rounded-full "+tone} style={{width:Math.max(value?3:0,value/max*100)+"%"}}/></div></div>;
}

export default function DashboardPage(){
  const router=useRouter();
  const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
  const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
  const [accountScope,setAccountScope]=useState("ALL");
  const [error,setError]=useState("");

  useEffect(()=>{
    Promise.all([
      apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
      apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),apiFetch<Trend[]>("/dashboard/position-trend"),
    ]).then(([s,a,t,p,r,tr])=>{setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);})
      .catch(e=>setError(e instanceof Error?e.message:"Failed to load dashboard"));
  },[router]);

  const fundSegments=useMemo(()=>summary?[
    {label:"Cash",value:summary.cashBalance,color:"#0f172a"},
    {label:"Banks",value:summary.bankBalance,color:"#4f46e5"},
    {label:"UPI",value:summary.upiBalance,color:"#06b6d4"},
    {label:"Provider wallets",value:summary.walletBalance,color:"#10b981"},
  ]:[],[summary]);

  if(!summary||!today)return <AppShell><div className="rounded-2xl border bg-white p-6">{error||"Loading financial position..."}</div></AppShell>;
  const compareMax=Math.max(1,summary.customerReceivable,summary.customerPayable,summary.creditCardOutstanding,summary.pendingProviderSettlements);
  const scopedAccounts=accounts.filter(a=>accountScope==="ALL"||a.usageType===accountScope);

  return <AppShell><div className="mx-auto max-w-[1500px] space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-600">Live financial position</p><h2 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h2><p className="mt-1 text-sm text-slate-500">Everything the business has, has to receive, and has to pay — in one place.</p></div>
      <div className="flex gap-2"><Link href="/receivables" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700">Receivables</Link><Link href="/payables" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold">Payables</Link></div>
    </div>

    <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
      <div className="grid gap-6 p-6 lg:grid-cols-[1.25fr_2fr] lg:p-8">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-indigo-300">Net financial position</p><p className={"mt-3 text-4xl font-black tracking-tight sm:text-5xl "+(summary.netFinancialPosition<0?"text-rose-300":"text-white")}>{money(summary.netFinancialPosition)}</p><p className="mt-3 text-sm font-semibold text-cyan-300">Operating position {money(summary.operatingPosition)}</p><p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">Operating position includes liquid funds, provider clearing and customer receivables less customer payables. Net position also subtracts owner credit-card outstanding.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Available now",summary.availableFunds,"text-emerald-300"],["Provider clearing",summary.pendingProviderSettlements,"text-cyan-300"],["Customer receive",summary.customerReceivable,"text-sky-300"],["To pay",summary.customerPayable,"text-amber-300"],["Card outstanding",summary.creditCardOutstanding,"text-rose-300"]].map(([l,v,c])=><div key={String(l)} className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">{l}</p><p className={"mt-2 text-xl font-bold "+c}>{money(Number(v))}</p></div>)}
        </div>
      </div>
      <div className="border-t border-white/10 bg-white/[.03] px-6 py-3 text-xs text-slate-400">Net formula: {money(summary.availableFunds)} + {money(summary.pendingProviderSettlements)} clearing + {money(summary.customerReceivable)} receivables − {money(summary.customerPayable)} payables − {money(summary.creditCardOutstanding)} owner CC</div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Cash in hand" value={summary.cashBalance}/><Metric label="Bank balance" value={summary.bankBalance}/><Metric label="UPI balance" value={summary.upiBalance}/><Metric label="Provider wallets" value={summary.walletBalance}/><Metric label="Pending provider settlement" value={summary.pendingProviderSettlements} hint={summary.pendingProviderSettlementCount+" item(s)"} tone="indigo"/>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5"><h3 className="font-semibold">Financial Position Trend</h3><p className="text-xs text-slate-500">10-day running net position from posted ledger entries.</p></div><PositionChart rows={trend}/></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5"><h3 className="font-semibold">Where the Money Is</h3><p className="text-xs text-slate-500">Current liquid funds by account category.</p></div><Donut segments={fundSegments}/></div>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5"><h3 className="font-semibold">Receive vs Pay</h3><p className="text-xs text-slate-500">Outstanding obligations and collections.</p></div><div className="space-y-5">
        <SideBar label="Customer receivables" value={summary.customerReceivable} max={compareMax} tone="bg-emerald-500"/>
        <SideBar label="Provider clearing" value={summary.pendingProviderSettlements} max={compareMax} tone="bg-cyan-500"/>
        <SideBar label="Customer payables" value={summary.customerPayable} max={compareMax} tone="bg-amber-500"/>
        <SideBar label="Owner credit-card outstanding" value={summary.creditCardOutstanding} max={compareMax} tone="bg-rose-500"/>
      </div><div className="mt-6 grid grid-cols-2 gap-3"><Metric label="Receivable overdue" value={summary.receivableBreakdown.overdueAmount} hint={summary.receivableBreakdown.overdueCount+" item(s)"} tone="red"/><Metric label="Payable overdue" value={summary.payableBreakdown.overdueAmount} hint={summary.payableBreakdown.overdueCount+" item(s)"} tone="red"/></div></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Account Balances</h3><p className="text-xs text-slate-500">Filter by the account's configured usage without changing the all-business net-position formula.</p></div><select className="rounded-lg border px-2 py-1.5 text-xs" value={accountScope} onChange={e=>setAccountScope(e.target.value)}><option value="ALL">All</option><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select></div><AccountBars accounts={scopedAccounts}/></div>
    </section>

    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Today’s Activity</h3><p className="text-xs text-slate-500">Posted movements and operating activity.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">India day</span></div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6">{[
        ["Cash in",today.cashIn,"emerald"],["Cash out",today.cashOut,"red"],["Receipts collected",today.customerReceipt,"emerald"],["Receivables created",today.receivableCreated,"indigo"],
        ["Customer payouts",today.customerPayout,"amber"],["Card swipe",today.cardSwipe,"slate"],["AePS",today.aeps,"slate"],["Commission",today.commission,"emerald"],
        ["Charges",today.providerCharges,"red"],["Business expense",today.businessExpense,"red"],["Bank in",today.bankIn,"slate"],["Wallet in",today.walletIn,"slate"],
      ].map(([l,v,t])=><Metric key={String(l)} label={String(l)} value={Number(v)} tone={String(t)}/>)}</div>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="font-semibold">Money to Receive</h3><p className="text-xs text-slate-500">Due and upcoming receivables</p></div><Link href="/receivables" className="text-sm font-semibold text-indigo-600">View all →</Link></div><div className="divide-y">
        {receivables.slice(0,6).map(r=><div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.customer.fullName}</p><p className="truncate text-xs text-slate-500">{r.reason} · {r.dueAt?new Date(r.dueAt).toLocaleDateString("en-IN"):"No due date"}</p></div><div className="text-right"><p className="font-bold text-emerald-700">{money(r.remainingAmount)}</p><p className={"text-[10px] font-semibold "+(r.bucket==="OVERDUE"?"text-red-600":"text-slate-400")}>{r.bucket}</p></div></div>)}
        {!receivables.length?<p className="px-5 py-8 text-center text-sm text-slate-500">Nothing outstanding to receive.</p>:null}
      </div></div>
      <div className="rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="font-semibold">Money to Pay</h3><p className="text-xs text-slate-500">Due and upcoming customer payables</p></div><Link href="/payables" className="text-sm font-semibold text-indigo-600">View all →</Link></div><div className="divide-y">
        {payables.slice(0,6).map(p=><div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{p.customer.fullName}</p><p className="text-xs text-slate-500">Due {new Date(p.dueAt).toLocaleDateString("en-IN")}</p></div><div className="text-right"><p className="font-bold text-amber-700">{money(p.remainingAmount)}</p><p className={"text-[10px] font-semibold "+(p.bucket==="OVERDUE"?"text-red-600":"text-slate-400")}>{p.bucket}</p></div></div>)}
        {!payables.length?<p className="px-5 py-8 text-center text-sm text-slate-500">No open customer payables.</p>:null}
      </div></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Receivable due today" value={summary.receivableBreakdown.dueTodayAmount} hint={summary.receivableBreakdown.dueTodayCount+" item(s)"} tone="indigo"/>
      <Metric label="Receivable partial" value={summary.receivableBreakdown.partialAmount} hint={summary.receivableBreakdown.partialCount+" item(s)"} tone="emerald"/>
      <Metric label="Payable due today" value={summary.payableBreakdown.dueTodayAmount} hint={summary.payableBreakdown.dueTodayCount+" item(s)"} tone="amber"/>
      <Metric label="CC available" value={summary.creditCardAvailable} tone="indigo"/>
    </section>

    {error?<p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}
  </div></AppShell>;
}

