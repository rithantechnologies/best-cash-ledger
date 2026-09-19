"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Breakdown={dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number};
type Summary={
 cashBalance:number;bankBalance:number;upiBalance:number;walletBalance:number;availableFunds:number;
 customerPayable:number;customerReceivable:number;pendingProviderSettlements:number;pendingProviderSettlementCount:number;
 netFinancialPosition:number;creditCardOutstanding:number;creditCardAvailable:number;
 payableBreakdown:Breakdown;receivableBreakdown:Breakdown;
};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean};
type Today={cashIn:number;cashOut:number;bankIn:number;bankOut:number;walletIn:number;walletOut:number;upiIn:number;upiOut:number;commission:number;businessExpense:number;personalExpense:number};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;customer:{fullName:string}};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type CashSession={id:string;status:string;cashAccount:{accountName:string};denominationCounts:Count[]};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const smallDate=(v:string)=>new Date(v).toLocaleDateString("en-IN",{day:"2-digit",month:"short"});

function Icon({name}:{name:"bank"|"wallet"|"receive"|"pay"|"cash"|"net"|"expense"|"card"|"upi"}){
 const paths={
  bank:<><path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 19h18M12 3 3 8h18z"/></>,
  wallet:<><path d="M4 7h14v12H4z"/><path d="M4 7V5h12"/><path d="M15 11h6v5h-6z"/></>,
  receive:<><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></>,
  pay:<><path d="M12 21V8"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/></>,
  cash:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
  net:<><path d="M4 18 9 13l4 3 7-9"/><path d="M15 7h5v5"/></>,
  expense:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/></>,
  card:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></>,
  upi:<><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M10 17h4"/></>,
 };
 return <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function SummaryCard({label,value,href,icon,tone="blue",sub}:{label:string;value:number;href:string;icon:"bank"|"wallet"|"receive"|"pay"|"cash"|"net";tone?:"blue"|"violet"|"green"|"amber"|"slate"|"dark";sub?:string}){
 return <Link href={href} className={"glance-card glance-"+tone}>
  <span className="glance-icon"><Icon name={icon}/></span>
  <div className="min-w-0"><p className="glance-label">{label}</p><p className="glance-money money">{money(value)}</p>{sub?<p className="glance-sub">{sub}</p>:null}</div>
  <span className="glance-arrow">›</span>
 </Link>;
}

function BoardPanel({title,total,href,children,tone="blue",className=""}:{title:string;total?:number;href:string;children:ReactNode;tone?:"blue"|"violet"|"green"|"amber"|"slate";className?:string}){
 return <Surface className={"ledger-board-panel ledger-board-"+tone+" "+className}>
  <div className="ledger-board-head">
   <div className="min-w-0"><h2>{title}</h2>{total!==undefined?<strong className="money">{money(total)}</strong>:null}</div>
   <Link href={href}>View all</Link>
  </div>
  {children}
 </Surface>;
}

function DenseRow({href,name,meta,value,valueTone}:{href:string;name:string;meta?:string;value:number|string;valueTone?:"green"|"amber"|"red"}){
 return <Link href={href} className="ledger-dense-row">
  <div className="min-w-0"><p>{name}</p>{meta?<small>{meta}</small>:null}</div>
  <strong className={"money "+(valueTone==="green"?"text-[var(--money-in)]":valueTone==="amber"?"text-amber-600":valueTone==="red"?"text-[var(--money-out)]":"")}>{money(value)}</strong>
 </Link>;
}

export default function DashboardPage(){
 const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
 const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]);
 const [counter,setCounter]=useState<CashSession|null>(null),[cashHistory,setCashHistory]=useState<CashSession[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[updatedAt,setUpdatedAt]=useState(0);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [s,a,t,p,r,c,h]=await Promise.all([
    apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
    apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),
    apiFetch<CashSession|null>("/cash-counter/current"),apiFetch<CashSession[]>("/cash-counter/history"),
   ]);
   setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setCounter(c);setCashHistory(h);setUpdatedAt(Date.now());
  }catch(e){setError(e instanceof Error?e.message:"Failed to load dashboard");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);

 if(loading)return <AppShell><PageLoader label="Loading dashboard…"/></AppShell>;
 if(error||!summary||!today)return <AppShell><div className="mx-auto max-w-md py-20"><Surface className="p-6 text-center"><p className="font-semibold">Dashboard could not load</p><p className="mt-1 text-xs text-[var(--text-muted)]">{error}</p><button onClick={load} className="app-primary-button mt-4 px-4 py-2 text-xs font-bold">Retry</button></Surface></div></AppShell>;

 const banks=[...accounts].filter(a=>a.isActive&&a.accountType==="BANK").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
 const upi=[...accounts].filter(a=>a.isActive&&a.accountType==="UPI").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
 const cards=[...accounts].filter(a=>a.isActive&&a.accountType==="OWNER_CREDIT_CARD").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
 const wallets=[...accounts].filter(a=>a.isActive&&a.accountType==="PROVIDER_WALLET").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
 const cashSnapshot=counter??cashHistory[0]??null;
 const countType=cashSnapshot?.status==="OPEN"?"OPENING":"CLOSING";
 const denominations=(cashSnapshot?.denominationCounts??[]).filter(x=>x.countType===countType&&x.quantity>0).sort((a,b)=>Number(b.denomination)-Number(a.denomination));
 const totalIn=today.cashIn+today.bankIn+today.upiIn+today.walletIn;
 const totalOut=today.cashOut+today.bankOut+today.upiOut+today.walletOut;
 const expense=today.businessExpense+today.personalExpense;
 const time=updatedAt?new Date(updatedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"";

 return <AppShell><div className="one-glance-dashboard page-enter mx-auto max-w-[1580px]">
  <div className="one-glance-head">
   <div><h1>Dashboard</h1><span>Updated {time}</span></div>
   <Link href="/transactions/new" className="app-primary-button px-4 py-2.5 text-xs font-bold">+ New entry</Link>
  </div>

  <div className="glance-grid">
   <SummaryCard label="Bank" value={summary.bankBalance} href="/accounts?type=BANK" icon="bank" tone="blue" sub={banks.length+" accounts"}/>
   <SummaryCard label="Wallet" value={summary.walletBalance} href="/accounts?type=PROVIDER_WALLET" icon="wallet" tone="violet" sub={wallets.length+" wallets"}/>
   <SummaryCard label="Receivable" value={summary.customerReceivable} href="/receivables" icon="receive" tone="green" sub={summary.receivableBreakdown.overdueCount+" overdue"}/>
   <SummaryCard label="Payable" value={summary.customerPayable} href="/payables" icon="pay" tone="amber" sub={summary.payableBreakdown.dueTodayCount+" due today"}/>
   <SummaryCard label="Cash" value={summary.cashBalance} href="/cash-counter" icon="cash" tone="slate" sub={counter?"Counter open":"Ledger"}/>
   <SummaryCard label="Net balance" value={summary.netFinancialPosition} href="/reports" icon="net" tone="dark" sub="Overall"/>
  </div>

  <div className="ledger-board">
   <BoardPanel title="Bank / UPI / Cards" href="/accounts" tone="blue">
    <div className="ledger-account-groups">
     {banks.length?<div><div className="ledger-mini-head"><span><Icon name="bank"/> Banks</span><b className="money">{money(summary.bankBalance)}</b></div>{banks.map(a=><DenseRow key={a.id} href={"/accounts/"+a.id} name={a.accountName} value={a.currentBalance}/>)}</div>:null}
     {upi.length?<div><div className="ledger-mini-head"><span><Icon name="upi"/> UPI</span><b className="money">{money(summary.upiBalance)}</b></div>{upi.map(a=><DenseRow key={a.id} href={"/accounts/"+a.id} name={a.accountName} value={a.currentBalance}/>)}</div>:null}
     {cards.length?<div><div className="ledger-mini-head"><span><Icon name="card"/> Credit cards</span><b className="money">{money(summary.creditCardOutstanding)}</b></div>{cards.map(a=><DenseRow key={a.id} href={"/accounts/"+a.id} name={a.accountName} meta="Outstanding" value={a.currentBalance} valueTone={a.currentBalance>0?"red":undefined}/>)}</div>:null}
     {!banks.length&&!upi.length&&!cards.length?<div className="p-3"><EmptyState title="No accounts"/></div>:null}
    </div>
   </BoardPanel>

   <BoardPanel title="Wallet" total={summary.walletBalance} href="/accounts?type=PROVIDER_WALLET" tone="violet">
    <div className="ledger-dense-list">{wallets.length?wallets.map(a=><DenseRow key={a.id} href={"/accounts/"+a.id} name={a.accountName} value={a.currentBalance}/>):<div className="p-3"><EmptyState title="No wallets"/></div>}</div>
   </BoardPanel>

   <div className="ledger-board-stack">
    <BoardPanel title="Receivable" total={summary.customerReceivable} href="/receivables" tone="green">
     <div className="ledger-alert-strip"><span>Overdue <b className="money">{money(summary.receivableBreakdown.overdueAmount)}</b></span><span>Today <b className="money">{money(summary.receivableBreakdown.dueTodayAmount)}</b></span></div>
     <div className="ledger-dense-list">{receivables.length?receivables.slice(0,7).map(r=><DenseRow key={r.id} href={"/receivables/"+r.id} name={r.customer.fullName} meta={r.dueAt?"Due "+smallDate(r.dueAt):"No due date"} value={r.remainingAmount} valueTone={r.bucket==="OVERDUE"?"red":"green"}/>):<div className="p-3"><EmptyState title="Nothing to receive"/></div>}</div>
    </BoardPanel>
    <BoardPanel title="Payable" total={summary.customerPayable} href="/payables" tone="amber">
     <div className="ledger-alert-strip"><span>Overdue <b className="money">{money(summary.payableBreakdown.overdueAmount)}</b></span><span>Today <b className="money">{money(summary.payableBreakdown.dueTodayAmount)}</b></span></div>
     <div className="ledger-dense-list">{payables.length?payables.slice(0,7).map(p=><DenseRow key={p.id} href={"/payables/"+p.id} name={p.customer.fullName} meta={"Due "+smallDate(p.dueAt)} value={p.remainingAmount} valueTone={p.bucket==="OVERDUE"?"red":"amber"}/>):<div className="p-3"><EmptyState title="Nothing to pay"/></div>}</div>
    </BoardPanel>
   </div>

   <div className="ledger-board-stack">
    <BoardPanel title="Cash" total={summary.cashBalance} href="/cash-counter" tone="slate">
     {denominations.length?<div className="ledger-denom-grid">{denominations.slice(0,10).map(x=><div key={x.denomination}><b>₹{Number(x.denomination)}</b><span>× {x.quantity}</span><strong className="money">{money(x.totalAmount)}</strong></div>)}</div>:<div className="p-3"><EmptyState title="No physical count"/></div>}
    </BoardPanel>
    <BoardPanel title="Today" href="/transactions" tone="slate">
     <div className="ledger-today-grid">
      <Link href="/transactions" className="ledger-today-tile"><span>In</span><strong className="money text-[var(--money-in)]">{money(totalIn)}</strong></Link>
      <Link href="/transactions" className="ledger-today-tile"><span>Out</span><strong className="money text-[var(--money-out)]">{money(totalOut)}</strong></Link>
      <Link href="/expenses" className="ledger-today-tile"><span>Expense</span><strong className="money">{money(expense)}</strong></Link>
      <Link href="/reports" className="ledger-today-tile"><span>Commission</span><strong className="money">{money(today.commission)}</strong></Link>
     </div>
    </BoardPanel>
   </div>
  </div>
 </div></AppShell>;
}
