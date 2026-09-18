"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Result={
 customers:{id:string;customerCode:string;fullName:string;mobile:string|null}[];
 transactions:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;referenceNumber:string|null;customer:{fullName:string}|null}[];
 accounts:{id:string;accountCode:string;accountName:string;accountType:string}[];
 providers:{id:string;name:string;providerType:string}[];
};

export default function SearchPage(){
 const router=useRouter();
 const [q,setQ]=useState("");
 const [draft,setDraft]=useState("");
 const [data,setData]=useState<Result|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  const value=new URLSearchParams(window.location.search).get("q")||"";
  setQ(value);setDraft(value);
 },[]);
 useEffect(()=>{
  if(!q){setData({customers:[],transactions:[],accounts:[],providers:[]});return;}
  setData(null);setError("");
  apiFetch<Result>("/search?q="+encodeURIComponent(q)).then(setData).catch(()=>setError("Search failed"));
 },[q]);
 function submit(e:FormEvent){
  e.preventDefault();
  const value=draft.trim();
  if(!value)return;
  setQ(value);router.replace("/search?q="+encodeURIComponent(value));
 }

 const total=data?data.customers.length+data.transactions.length+data.accounts.length+data.providers.length:0;
 return <AppShell><PageFrame width="max-w-6xl">
  <SectionHeading eyebrow="Global lookup" title="Search" description={q?total+" result(s) for “"+q+"”":"Find customers, transactions, accounts and providers."}/>
  <Surface className="p-3 sm:p-4"><form onSubmit={submit} className="flex gap-2">
   <input autoFocus className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Customer, transaction no, account, reference…"/>
   <button className="min-h-12 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white">Search</button>
  </form></Surface>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {!data?<PageLoader label="Searching Cash Ledger…"/>:!q?<EmptyState title="Start typing to search" description="You can search across the main operational records."/>:
  <div className="grid gap-4 lg:grid-cols-2">
   <ResultGroup title="Customers" count={data.customers.length}>
    {data.customers.map(c=><Link key={c.id} href={"/customers/"+c.id} className="surface-hover block rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
     <div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{c.fullName}</strong><span className="text-[10px] font-bold text-indigo-600">CUSTOMER</span></div>
     <p className="mt-1 text-xs text-slate-400">{c.customerCode} · {c.mobile||"No mobile"}</p>
    </Link>)}
   </ResultGroup>
   <ResultGroup title="Transactions" count={data.transactions.length}>
    {data.transactions.map(t=><Link key={t.id} href={"/transactions/"+t.id} className="surface-hover block rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
     <div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{t.transactionNumber}</strong><span className="text-[10px] font-bold text-emerald-600">{t.transactionType.replaceAll("_"," ")}</span></div>
     <p className="mt-1 text-xs text-slate-400">{t.customer?.fullName||"No customer"} · {new Date(t.transactionAt).toLocaleString("en-IN")}</p>
    </Link>)}
   </ResultGroup>
   <ResultGroup title="Accounts" count={data.accounts.length}>
    {data.accounts.map(a=><div key={a.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
     <div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{a.accountName}</strong><span className="text-[10px] font-bold text-cyan-600">{a.accountType.replaceAll("_"," ")}</span></div>
     <p className="mt-1 text-xs text-slate-400">{a.accountCode}</p>
    </div>)}
   </ResultGroup>
   <ResultGroup title="Providers" count={data.providers.length}>
    {data.providers.map(p=><div key={p.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
     <div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{p.name}</strong><span className="text-[10px] font-bold text-amber-600">PROVIDER</span></div>
     <p className="mt-1 text-xs text-slate-400">{p.providerType.replaceAll("_"," ")}</p>
    </div>)}
   </ResultGroup>
  </div>}
 </PageFrame></AppShell>;
}

function ResultGroup({title,count,children}:{title:string;count:number;children:React.ReactNode}){
 return <Surface className="overflow-hidden">
  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5"><h3 className="text-sm font-bold">{title}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{count}</span></div>
  <div className="space-y-2 p-3 sm:p-4">{count?children:<EmptyState title={"No "+title.toLowerCase()+" found"}/>}</div>
 </Surface>;
}
