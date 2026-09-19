"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Ledger={account:{accountName:string};openingBalance:number;rows:{id:string;entryType:string;amount:string;runningBalance:number;description:string|null;journal:{postingDate:string;transaction:{id?:string;transactionNumber:string;customer:{fullName:string}|null}}}[]};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));

export default function AccountLedgerPage(){
 const {id}=useParams<{id:string}>(),[data,setData]=useState<Ledger|null>(null),[error,setError]=useState("");
 useEffect(()=>{apiFetch<Ledger>("/reports/accounts/"+id).then(setData).catch(e=>setError(e instanceof Error?e.message:"Failed to load ledger"));},[id]);
 if(!data&&!error)return <AppShell><PageLoader label="Loading ledger…"/></AppShell>;
 const closing=data?.rows.length?data.rows[data.rows.length-1].runningBalance:data?.openingBalance??0;
 return <AppShell><PageFrame width="max-w-5xl">
  <div><Link href="/accounts" className="text-xs font-semibold text-[var(--accent)]">← Accounts</Link><h1 className="mt-2 text-xl font-bold sm:text-2xl">{data?.account.accountName??"Account ledger"}</h1></div>
  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
  {data?<>
   <div className="grid grid-cols-2 gap-2.5"><Surface className="p-4"><p className="text-xs text-[var(--text-muted)]">Opening</p><p className="money mt-1 text-xl font-semibold">{money(data.openingBalance)}</p></Surface><Surface className="p-4"><p className="text-xs text-[var(--text-muted)]">Current</p><p className="money mt-1 text-xl font-semibold">{money(closing)}</p></Surface></div>
   <Surface className="overflow-hidden">{data.rows.length?<div className="divide-y divide-[var(--border)]">{[...data.rows].reverse().map(r=><div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{r.journal.transaction.transactionNumber}{r.journal.transaction.customer?" · "+r.journal.transaction.customer.fullName:""}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">{new Date(r.journal.postingDate).toLocaleString("en-IN")}{r.description?" · "+r.description:""}</p></div><div className="text-right"><p className={"money text-sm font-semibold "+(r.entryType==="DEBIT"?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{r.entryType==="DEBIT"?"Dr ":"Cr "}{money(r.amount)}</p><p className="money text-xs text-[var(--text-muted)]">{money(r.runningBalance)}</p></div></div>)}</div>:<div className="p-4"><EmptyState title="No ledger activity yet"/></div>}</Surface>
  </>:null}
 </PageFrame></AppShell>;
}
