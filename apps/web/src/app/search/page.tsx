"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Result={
 customers:{id:string;customerCode:string;fullName:string;mobile:string|null;isActive:boolean;cards:{id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean}[]}[];
 transactions:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;customer:{id:string;fullName:string;mobile:string|null}|null;cardSwipe:{customerCard:{lastFourDigits:string;bankName:string}}|null}[];
 accounts:{id:string;accountCode:string;accountName:string;accountType:string}[];
 providers:{id:string;name:string;providerType:string}[];
};
const money=(value:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(value||0));

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
  <SectionHeading title="Search" description={q?total+" result(s) for “"+q+"”":"Search by customer name, mobile, card last 4 or Aadhaar last 4."}/>
  <Surface className="p-3 sm:p-4"><form onSubmit={submit} className="flex gap-2">
   <input autoFocus inputMode="search" className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Name, mobile, card/Aadhaar last 4, transaction…"/>
   <button className="app-primary-button min-h-12 px-5 text-sm font-bold">Search</button>
  </form></Surface>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {!data?<PageLoader label="Searching Cash Ledger…"/>:!q?<EmptyState title="Find a customer quickly" description="Type a name, mobile number or the last 4 digits of a saved card."/>:
  <div className="grid gap-4 lg:grid-cols-2">
   <ResultGroup title="Customer matches" count={data.customers.length}>
    {data.customers.map(c=>{
     const digits=q.replace(/\D/g,"");
     const matchingCards=c.cards.filter(card=>card.isActive&&digits&&card.lastFourDigits.includes(digits));
     const shownCards=matchingCards.length?matchingCards:c.cards.filter(card=>card.isActive).slice(0,3);
     const activeCards=c.cards.filter(card=>card.isActive);
     const selectedCard=matchingCards[0]??(activeCards.length===1?activeCards[0]:undefined);
     const swipeHref="/transactions/card-swipe?customerId="+encodeURIComponent(c.id)+(selectedCard?"&cardId="+encodeURIComponent(selectedCard.id):"");
     const microHref="/transactions/micro-atm?customerId="+encodeURIComponent(c.id)+(selectedCard?"&cardLastFour="+encodeURIComponent(selectedCard.lastFourDigits):"");
     return <div key={c.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <Link href={"/customers/"+c.id} className="block">
       <div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{c.fullName}</strong><span className={"text-[10px] font-semibold "+(c.isActive?"text-[var(--accent)]":"text-[var(--text-muted)]")}>{c.isActive?"Customer":"Inactive"}</span></div>
       <p className="mt-1 text-xs text-[var(--text-muted)]">{c.mobile||"No mobile"} <span className="opacity-40">·</span> {c.customerCode}</p>
       {shownCards.length?<div className="mt-2 flex flex-wrap gap-1.5">{shownCards.map(card=><span key={card.id} className={"rounded-lg px-2 py-1 text-[10px] font-semibold "+(matchingCards.some(x=>x.id===card.id)?"bg-[var(--accent-soft)] text-[var(--accent)]":"bg-[var(--surface-soft)] text-[var(--text-muted)]")}>{card.bankName} ••••{card.lastFourDigits}</span>)}</div>:null}
      </Link>
      {c.isActive?<div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-[var(--border)] pt-3">
       <Link href={swipeHref} className="rounded-lg bg-[var(--text)] px-2 py-2 text-center text-[11px] font-semibold text-[var(--surface)]">Swipe</Link>
       <Link href={"/transactions/cash-transfer?customerId="+encodeURIComponent(c.id)} className="rounded-lg bg-[var(--surface-soft)] px-2 py-2 text-center text-[11px] font-semibold">Transfer</Link>
       <Link href={"/transactions/aeps?customerId="+encodeURIComponent(c.id)} className="rounded-lg bg-[var(--surface-soft)] px-2 py-2 text-center text-[11px] font-semibold">AePS</Link>
       <Link href={microHref} className="rounded-lg bg-[var(--surface-soft)] px-2 py-2 text-center text-[11px] font-semibold">Micro ATM</Link>
      </div>:null}
     </div>;
    })}
   </ResultGroup>
   <ResultGroup title="Related transactions" count={data.transactions.length}>
    {data.transactions.map(t=><Link key={t.id} href={"/transactions/"+t.id} className="surface-hover block rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
     <div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm">{t.customer?.fullName||t.transactionNumber}</strong><p className="mt-0.5 text-[11px] font-semibold text-slate-400">{t.transactionType.replaceAll("_"," ")} · {t.transactionNumber}</p></div><strong className="shrink-0 text-sm text-slate-900">{money(t.grossAmount)}</strong></div>
     <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400"><span>{new Date(t.transactionAt).toLocaleString("en-IN")}</span><span>·</span><span>{t.status.replaceAll("_"," ")}</span>{t.cardSwipe?<><span>·</span><span>{t.cardSwipe.customerCard.bankName} ••••{t.cardSwipe.customerCard.lastFourDigits}</span></>:null}</div>
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
