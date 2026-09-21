"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={
  accountName:string;accountType:string;accountNature:"ASSET"|"LIABILITY";usageType:string;
  bankName:string|null;accountReference:string|null;lastFourDigits:string|null;creditLimit:string|null;
};
type Row={
  id:string;entryType:"DEBIT"|"CREDIT";amount:string;runningBalance:number;description:string|null;
  journal:{postingDate:string;transaction:{id?:string;transactionNumber:string;customer:{fullName:string}|null}};
};
type Ledger={account:Account;openingBalance:number;openingBalanceIntroducedInRange:number;rows:Row[]};
type Range="7d"|"30d"|"90d"|"all";
const money=(value:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(value||0));
const typeLabels:Record<string,string>={CASH:"Shop cash",BANK:"Bank",UPI:"Bank",PROVIDER_WALLET:"Wallet",OWNER_CREDIT_CARD:"Credit card"};
function rangeStart(range:Range){
  if(range==="all")return "";
  const days=range==="7d"?7:range==="30d"?30:90;
  const date=new Date();
  date.setHours(0,0,0,0);
  date.setDate(date.getDate()-(days-1));
  return date.toISOString();
}
function accountMeta(account:Account){
  return [typeLabels[account.accountType]??account.accountType,account.bankName,account.lastFourDigits?"•••• "+account.lastFourDigits:null]
    .filter(Boolean).join(" · ");
}
function increases(account:Account,row:Row){
  return account.accountNature==="ASSET"?row.entryType==="DEBIT":row.entryType==="CREDIT";
}


function AccountLedgerSkeleton(){
  return <AppShell><PageFrame width="max-w-6xl">
    <div className="space-y-2">
      <div className="ui-shimmer h-4 w-20 rounded"/>
      <div className="ui-shimmer h-9 w-44 rounded-lg"/>
      <div className="ui-shimmer h-4 w-28 rounded"/>
    </div>
    <div className="ui-shimmer h-12 w-full rounded-xl"/>
    <div className="grid grid-cols-3 gap-2.5">
      {[0,1,2].map((i)=><Surface key={i} className="space-y-3 p-3.5 sm:p-4"><div className="ui-shimmer h-3 w-14 rounded"/><div className="ui-shimmer h-7 w-24 max-w-full rounded-md"/></Surface>)}
    </div>
    <Surface className="p-3"><div className="ui-shimmer h-12 w-full rounded-xl"/></Surface>
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4"><div className="ui-shimmer h-4 w-16 rounded"/><div className="ui-shimmer h-4 w-5 rounded"/></div>
      <div className="divide-y divide-[var(--border)]">
        {[0,1,2,3].map((i)=><div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="space-y-2"><div className="ui-shimmer h-3 w-12 rounded"/><div className="ui-shimmer h-3 w-14 rounded"/></div>
          <div className="min-w-0 flex-1 space-y-2"><div className="ui-shimmer h-4 w-32 rounded"/><div className="ui-shimmer h-3 w-24 rounded"/></div>
          <div className="ui-shimmer h-4 w-20 rounded"/>
        </div>)}
      </div>
    </Surface>
  </PageFrame></AppShell>;
}

export default function AccountLedgerPage(){
  const {id}=useParams<{id:string}>();
  const [data,setData]=useState<Ledger|null>(null);
  const [range,setRange]=useState<Range>("30d");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[role,setRole]=useState("");
  const load=useCallback(async(nextRange:Range)=>{
    setLoading(true);setError("");
    try{
      const from=rangeStart(nextRange);
      const query=from?"?from="+encodeURIComponent(from):"";
      setData(await apiFetch<Ledger>("/reports/accounts/"+id+query));
    }catch(err){setError(err instanceof Error?err.message:"Failed to load ledger");}
    finally{setLoading(false);}
  },[id]);

  useEffect(()=>{load(range);},[load,range]);
  useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);

  const rows=useMemo(()=>{
    const query=search.trim().toLowerCase();
    const source=[...(data?.rows??[])].reverse();
    if(!query)return source;
    return source.filter((row)=>[
      row.journal.transaction.transactionNumber,row.journal.transaction.customer?.fullName,row.description,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  },[data,search]);

  if(loading&&!data)return <AccountLedgerSkeleton/>;
  const account=data?.account;
  const closing=data
    ?(data.rows.length?data.rows[data.rows.length-1].runningBalance:data.openingBalance+Number(data.openingBalanceIntroducedInRange||0))
    :0;
  const movement=data?.rows.reduce((totals,row)=>{
    const amount=Number(row.amount);
    if(increases(data.account,row))totals.in+=amount;else totals.out+=amount;
    return totals;
  },{in:0,out:0})??{in:0,out:0};
  const isCard=account?.accountType==="OWNER_CREDIT_CARD";
  const creditLimit=isCard?Math.max(0,Number(account?.creditLimit||0)):0;
  const availableCredit=isCard&&creditLimit>0?Math.max(0,creditLimit-closing):0;
  const utilisation=isCard&&creditLimit>0?Math.min(100,(Math.max(0,closing)/creditLimit)*100):0;
  const periodOpening=data?data.openingBalance+Number(data.openingBalanceIntroducedInRange||0):0;
  const admin=role==="OWNER"||role==="ADMIN";

  return <AppShell><PageFrame width="max-w-6xl">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href="/accounts" className="inline-flex min-h-8 items-center text-xs font-bold text-[var(--accent)]">← Accounts</Link>
        <h1 className="mt-1 truncate text-2xl font-black tracking-[-.035em] sm:text-3xl">{account?.accountName??"Account"}</h1>
        {account?<p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{accountMeta(account)}</p>:null}
      </div>
      {admin?<Link href={"/accounts?edit="+id} className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-bold text-[var(--text)] shadow-sm">Edit</Link>:null}
    </div>
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}
    {data?<>
      <Surface className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-muted)]">{isCard?"Outstanding":"Current balance"}</p>
              <p className={"money mt-1 text-[2rem] font-black leading-none tracking-[-.045em] sm:text-4xl "+(isCard&&closing>0?"text-rose-600":closing<0?"text-rose-600":"text-[var(--text)]")}>{money(closing)}</p>
            </div>
            {isCard&&creditLimit>0?<div className="shrink-0 text-right">
              <p className="text-xs font-semibold text-emerald-700">Available credit</p>
              <p className="money mt-1 text-xl font-black text-emerald-700">{money(availableCredit)}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">of {money(creditLimit)} limit</p>
            </div>:null}
          </div>

          {isCard&&creditLimit>0?<div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]"><span>{Math.round(utilisation)}% utilised</span><span>{Math.round(100-utilisation)}% available</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-rose-400" style={{width:utilisation+"%"}}/></div>
          </div>:null}

          <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border)] border-t border-[var(--border)] pt-4">
            <div className="min-w-0 pr-2.5 sm:pr-4"><p className="text-[11px] font-semibold text-[var(--text-muted)]">Period opening</p><p className="money mt-1 truncate text-sm font-black">{money(periodOpening)}</p></div>
            <div className="min-w-0 px-2.5 sm:px-4"><p className="text-[11px] font-semibold text-emerald-700">{isCard?"Added":"Money in"}</p><p className="money mt-1 truncate text-sm font-black text-emerald-700">{money(movement.in)}</p></div>
            <div className="min-w-0 pl-2.5 sm:pl-4"><p className="text-[11px] font-semibold text-rose-600">{isCard?"Paid / reduced":"Money out"}</p><p className="money mt-1 truncate text-sm font-black text-rose-600">{money(movement.out)}</p></div>
          </div>
        </div>
      </Surface>

      <div className="ui-scroll-fade"><div className="flex gap-1.5 overflow-x-auto pb-0.5 pr-5">
        {([["7d","7 days"],["30d","30 days"],["90d","90 days"],["all","All time"]] as [Range,string][]).map(([value,label])=><button type="button" key={value} onClick={()=>setRange(value)} className={"min-h-10 shrink-0 rounded-full px-3.5 text-xs font-bold transition "+(range===value?"bg-[var(--text)] text-[var(--surface)]":"bg-[var(--surface-soft)] text-[var(--text-muted)]")}>{label}</button>)}
      </div></div>

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div><h2 className="text-sm font-extrabold">Activity</h2><p className="mt-0.5 text-xs text-[var(--text-muted)]">{rows.length} transaction entr{rows.length===1?"y":"ies"}</p></div>
        </div>
        <div className="border-b border-[var(--border)] p-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
            <input className="app-control !pl-10" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search activity"/>
          </div>
        </div>
        {rows.length?<div className="divide-y divide-[var(--border)]">
          {rows.map((row)=>{
            const isIn=increases(data.account,row);
            const tx=row.journal.transaction;
            return <div key={row.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[110px_minmax(0,1fr)_130px_130px] sm:items-center sm:px-5">
              <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                <p>{new Date(row.journal.postingDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p>
                <p className="mt-0.5">{new Date(row.journal.postingDate).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
              </div>
              <div className="min-w-0">
                {tx.id?<Link href={"/transactions/"+tx.id} className="truncate text-sm font-bold hover:text-[var(--accent)]">{tx.transactionNumber}</Link>:<p className="truncate text-sm font-bold">{tx.transactionNumber}</p>}
                <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{tx.customer?.fullName??row.description??"—"}</p>
              </div>
              <p className={"money text-sm font-extrabold sm:text-right "+(isIn?"text-emerald-700":"text-rose-600")}>{isIn?"+":"−"}{money(row.amount)}</p>
              <div className="flex items-center justify-between gap-2 sm:block sm:text-right"><span className="text-[11px] font-semibold text-[var(--text-muted)] sm:hidden">Balance</span><p className="money text-xs font-bold text-[var(--text-muted)]">{money(row.runningBalance)}</p></div>
            </div>;
          })}
        </div>:search?<div className="p-5"><EmptyState title="No matching activity" description="Try a different search."/></div>:Math.abs(periodOpening)>0.005?<div className="p-4 sm:p-5"><div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3.5"><div><p className="text-sm font-bold">Opening balance</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">No transactions in this period yet.</p></div><strong className="money shrink-0 text-sm">{money(periodOpening)}</strong></div></div>:<div className="p-5"><EmptyState title="No transactions yet" description="Activity will appear here when money moves through this account."/></div>}
      </Surface>
    </>:null}
  </PageFrame></AppShell>;
}
