"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Surface } from "@/components/ui";
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

export default function AccountLedgerPage(){
  const {id}=useParams<{id:string}>();
  const [data,setData]=useState<Ledger|null>(null);
  const [range,setRange]=useState<Range>("30d");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
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

  const rows=useMemo(()=>{
    const query=search.trim().toLowerCase();
    const source=[...(data?.rows??[])].reverse();
    if(!query)return source;
    return source.filter((row)=>[
      row.journal.transaction.transactionNumber,row.journal.transaction.customer?.fullName,row.description,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  },[data,search]);

  if(loading&&!data)return <AppShell><PageLoader label="Loading account…"/></AppShell>;
  const account=data?.account;
  const closing=data
    ?(data.rows.length?data.rows[data.rows.length-1].runningBalance:data.openingBalance+Number(data.openingBalanceIntroducedInRange||0))
    :0;
  const movement=data?.rows.reduce((totals,row)=>{
    const amount=Number(row.amount);
    if(increases(data.account,row))totals.in+=amount;else totals.out+=amount;
    return totals;
  },{in:0,out:0})??{in:0,out:0};

  return <AppShell><PageFrame width="max-w-6xl">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Link href="/accounts" className="inline-flex min-h-8 items-center text-xs font-bold text-[var(--accent)]">← Accounts</Link>
        <h1 className="mt-1 truncate text-2xl font-black tracking-[-.035em] sm:text-3xl">{account?.accountName??"Account"}</h1>
        {account?<p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{accountMeta(account)}</p>:null}
      </div>
      <div className="flex rounded-xl bg-[var(--surface-soft)] p-1">
        {([["7d","7D"],["30d","30D"],["90d","90D"],["all","All"]] as [Range,string][]).map(([value,label])=><button type="button" key={value} onClick={()=>setRange(value)} className={"min-h-9 rounded-lg px-3 text-[11px] font-bold "+(range===value?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>{label}</button>)}
      </div>
    </div>
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}
    {data?<>
      <div className="grid grid-cols-3 gap-2.5">
        <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Balance</p><p className={"money mt-1 text-lg font-black sm:text-2xl "+(closing<0?"text-rose-600":"")}>{money(closing)}</p></Surface>
        <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">In</p><p className="money mt-1 text-lg font-black text-emerald-700 sm:text-2xl">{money(movement.in)}</p></Surface>
        <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Out</p><p className="money mt-1 text-lg font-black text-rose-600 sm:text-2xl">{money(movement.out)}</p></Surface>
      </div>

      <Surface className="p-3">
        <div className="relative">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          <input className="app-control !pl-10" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search ledger"/>
        </div>
      </Surface>
      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-extrabold">Ledger</h2>
          <span className="text-xs font-semibold text-[var(--text-muted)]">{rows.length}</span>
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
              <div className="flex items-center justify-between gap-2 sm:block sm:text-right"><span className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-muted)] sm:hidden">Balance</span><p className="money text-xs font-bold text-[var(--text-muted)]">{money(row.runningBalance)}</p></div>
            </div>;
          })}
        </div>:<div className="p-5"><EmptyState title={search?"No matching entries":"No ledger activity"}/></div>}
      </Surface>
    </>:null}
  </PageFrame></AppShell>;
}
