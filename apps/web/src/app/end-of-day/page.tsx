"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Summary={availableFunds:number;pendingProviderSettlements:number;customerReceivable:number;customerPayable:number;operatingPosition:number;netFinancialPosition:number;creditCardOutstanding:number};
type Position={id:string;businessDate:string;availableFunds:string;pendingProviderSettlements:string;customerReceivable:string;customerPayable:string;ownerCreditCardOutstanding:string;operatingPosition:string;netFinancialPosition:string;cashVariance:string;createdAt:string};
type Status={businessDate:string;snapshot:Position|null;openCashSessions:number;summary:Summary};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));

export default function EndOfDayPage(){
 const [status,setStatus]=useState<Status|null>(null),[history,setHistory]=useState<Position[]>([]),[role,setRole]=useState("");
 const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 async function load(){const [s,h]=await Promise.all([apiFetch<Status>("/end-of-day/status"),apiFetch<Position[]>("/end-of-day/history")]);setStatus(s);setHistory(h);}
 useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{};load().catch(e=>setError(e instanceof Error?e.message:"Failed to load end-of-day")).finally(()=>setLoading(false));},[]);
 async function snapshot(){setBusy(true);setError("");try{await apiFetch("/end-of-day/snapshot",{method:"POST"});await load();}catch(e){setError(e instanceof Error?e.message:"Failed to save end-of-day");}finally{setBusy(false);}}
 if(loading||!status)return <AppShell><PageLoader label="Loading end of day…"/></AppShell>;
 const admin=role==="OWNER"||role==="ADMIN",s=status.summary;
 const ready=status.openCashSessions===0&&reviewed;

 return <AppShell><div className="page-enter mx-auto max-w-5xl space-y-4">
  <SectionHeading title="End of day"/>
  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}

  {status.snapshot?<Surface className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--money-in)]">Day saved</p><h2 className="money mt-2 text-2xl font-semibold">{money(status.snapshot.netFinancialPosition)}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{new Date(status.snapshot.businessDate).toLocaleDateString("en-IN")} · Cash variance {money(status.snapshot.cashVariance)}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Complete</span></div></Surface>:<>
   <Surface className="overflow-hidden">
    <div className="border-b border-[var(--border)] px-4 py-3"><strong>Close checklist</strong></div>
    <div className="divide-y divide-[var(--border)]">
     <Link href="/cash-counter" className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-soft)]"><span className={"grid h-7 w-7 place-items-center rounded-full text-sm font-bold "+(status.openCashSessions===0?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700")}>{status.openCashSessions===0?"✓":"!"}</span><div className="flex-1"><p className="text-sm font-semibold">Cash counters closed</p><p className="text-xs text-[var(--text-muted)]">{status.openCashSessions===0?"All counters are closed":status.openCashSessions+" still open"}</p></div><span className="text-xs text-[var(--accent)]">Open →</span></Link>
     <Link href="/dues" className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-soft)]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">₹</span><div className="flex-1"><p className="text-sm font-semibold">Provider clearing reviewed</p><p className="money text-xs text-[var(--text-muted)]">{money(s.pendingProviderSettlements)} pending</p></div><span className="text-xs text-[var(--accent)]">Review →</span></Link>
     <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="h-5 w-5"/><div><p className="text-sm font-semibold">Financial position reviewed</p><p className="text-xs text-[var(--text-muted)]">Payables, receivables and balances look correct.</p></div></label>
    </div>
   </Surface>

   <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
    {[["Available",s.availableFunds],["To receive",s.customerReceivable],["To pay",s.customerPayable],["Net position",s.netFinancialPosition]].map(([l,v])=><Surface key={String(l)} className="p-3.5"><p className="text-xs text-[var(--text-muted)]">{l}</p><p className="money mt-1 text-lg font-semibold">{money(Number(v))}</p></Surface>)}
   </div>

   {admin?<button onClick={snapshot} disabled={busy||!ready} className="min-h-12 w-full rounded-xl bg-[var(--text)] text-sm font-semibold text-[var(--surface)] disabled:opacity-35">{busy?"Saving…":"Save day"}</button>:<p className="text-sm text-[var(--text-muted)]">Owner/Admin access is required to save the day.</p>}
  </>}

  <Surface className="overflow-hidden">
   <div className="border-b border-[var(--border)] px-4 py-3"><strong>History</strong></div>
   {history.length?<div className="divide-y divide-[var(--border)]">{history.slice(0,14).map(x=><div key={x.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium">{new Date(x.businessDate).toLocaleDateString("en-IN")}</p><p className="text-xs text-[var(--text-muted)]">Available {money(x.availableFunds)} · Clearing {money(x.pendingProviderSettlements)}</p></div><div className="text-right"><p className="money text-sm font-semibold">{money(x.netFinancialPosition)}</p><p className={Math.abs(Number(x.cashVariance))>.005?"text-xs text-rose-600":"text-xs text-[var(--text-muted)]"}>Variance {money(x.cashVariance)}</p></div></div>)}</div>:<div className="p-4"><EmptyState title="No saved days yet"/></div>}
  </Surface>
 </div></AppShell>;
}
