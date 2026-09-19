"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type Session={id:string;cashAccountId:string;businessDate:string;openedAt:string;openingTotal:string;expectedClosingTotal:string|null;liveExpectedClosingTotal?:number;actualClosingTotal:string|null;differenceAmount:string|null;status:string;closingNotes:string|null;cashAccount:{accountName:string};denominationCounts:Count[]};
const notes=[500,200,100,50,20,10,5,2,1,2000];
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));

export default function CashCounterPage(){
 const [accounts,setAccounts]=useState<Account[]>([]),[current,setCurrent]=useState<Session|null>(null),[history,setHistory]=useState<Session[]>([]);
 const [cashAccountId,setCashAccountId]=useState(""),[qty,setQty]=useState<Record<number,string>>({}),[remarks,setRemarks]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);
 const load=()=>Promise.all([apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Session|null>("/cash-counter/current"),apiFetch<Session[]>("/cash-counter/history")]).then(([a,c,h])=>{setAccounts(a);setCurrent(c);setHistory(h);if(c)setCashAccountId(c.cashAccountId);});
 useEffect(()=>{load().catch(()=>setError("Failed to load cash counter")).finally(()=>setLoading(false));},[]);
 const total=useMemo(()=>notes.reduce((s,n)=>s+n*Number(qty[n]||0),0),[qty]);
 const expected=Number(current?.liveExpectedClosingTotal??current?.expectedClosingTotal??current?.openingTotal??0);
 const difference=total-expected;
 function denominations(){return notes.map(denomination=>({denomination,quantity:Number(qty[denomination]||0)}));}
 function step(n:number,delta:number){setQty(q=>({...q,[n]:String(Math.max(0,Number(q[n]||0)+delta))}));}
 async function open(e:FormEvent){e.preventDefault();setSaving(true);setError("");try{await apiFetch("/cash-counter/open",{method:"POST",body:JSON.stringify({cashAccountId,denominations:denominations()})});setQty({});await load();}catch(err){setError(err instanceof Error?err.message:"Failed to open cash counter");}finally{setSaving(false);}}
 async function close(e:FormEvent){e.preventDefault();if(!current)return;setSaving(true);setError("");try{await apiFetch("/cash-counter/"+current.id+"/close",{method:"POST",body:JSON.stringify({denominations:denominations(),notes:remarks||undefined})});setQty({});setRemarks("");await load();}catch(err){setError(err instanceof Error?err.message:"Failed to close cash counter");}finally{setSaving(false);}}

 if(loading)return <AppShell><PageLoader label="Loading cash counter…"/></AppShell>;
 const cashAccounts=accounts.filter(a=>a.accountType==="CASH");
 return <AppShell><div className="page-enter mx-auto max-w-5xl space-y-4">
  <SectionHeading title="Cash counter"/>
  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
  <div className="grid items-start gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
   <Surface className="overflow-hidden">
    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><strong>{current?"Close counter":"Open counter"}</strong>{current?<StatusBadge tone="emerald">Open</StatusBadge>:null}</div>
    <form onSubmit={current?close:open} className="p-4">
     {current?<div className="mb-4 flex items-center justify-between rounded-xl bg-[var(--surface-soft)] px-3 py-2.5"><div><p className="text-sm font-semibold">{current.cashAccount.accountName}</p><p className="text-xs text-[var(--text-muted)]">Opened {new Date(current.openedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p></div><strong className="money">{money(current.openingTotal)}</strong></div>:<select className="app-control mb-4" value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Cash account</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>}
     <div className="space-y-2">{notes.map(n=><div key={n} className="grid grid-cols-[64px_1fr_90px] items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2"><strong className="money text-sm">₹{n}</strong><div className="grid grid-cols-[38px_1fr_38px] items-center overflow-hidden rounded-lg border border-[var(--border)]"><button type="button" onClick={()=>step(n,-1)} className="h-9 text-lg text-[var(--text-muted)]">−</button><input className="h-9 min-w-0 border-x border-[var(--border)] bg-[var(--surface)] text-center text-sm font-semibold" type="number" min="0" step="1" inputMode="numeric" value={qty[n]||""} placeholder="0" onChange={e=>setQty(q=>({...q,[n]:e.target.value}))}/><button type="button" onClick={()=>step(n,1)} className="h-9 text-lg text-[var(--text-muted)]">+</button></div><span className="money text-right text-xs text-[var(--text-muted)]">{money(n*Number(qty[n]||0))}</span></div>)}</div>
     <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-soft)] p-3 text-center"><div><p className="text-[11px] text-[var(--text-muted)]">{current?"Expected":"Notes"}</p><strong className="money mt-1 block text-sm">{current?money(expected):Object.values(qty).filter(Boolean).length}</strong></div><div><p className="text-[11px] text-[var(--text-muted)]">Counted</p><strong className="money mt-1 block text-sm">{money(total)}</strong></div><div><p className="text-[11px] text-[var(--text-muted)]">Difference</p><strong className={"money mt-1 block text-sm "+(current&&Math.abs(difference)>.005?"text-rose-600":"")}>{current?money(difference):"—"}</strong></div></div>
     {current?<textarea className="mt-3 min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" placeholder="Variance note, if needed" value={remarks} onChange={e=>setRemarks(e.target.value)}/>:null}
     <button disabled={saving||(!current&&!cashAccountId)} className="mt-3 min-h-12 w-full rounded-xl bg-[var(--text)] px-4 text-sm font-semibold text-[var(--surface)] disabled:opacity-40">{saving?"Saving…":current?"Close counter":"Open counter"}</button>
    </form>
   </Surface>

   <Surface className="overflow-hidden">
    <div className="border-b border-[var(--border)] px-4 py-3"><strong>Recent sessions</strong></div>
    {history.length?<div className="divide-y divide-[var(--border)]">{history.slice(0,10).map(s=><div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium">{s.cashAccount.accountName}</p><p className="text-xs text-[var(--text-muted)]">{new Date(s.businessDate).toLocaleDateString("en-IN")} · {s.status}</p></div><div className="text-right"><p className="money text-sm font-semibold">{s.actualClosingTotal?money(s.actualClosingTotal):money(s.openingTotal)}</p><p className={"text-xs "+(Math.abs(Number(s.differenceAmount||0))>.005?"text-rose-600":"text-[var(--text-muted)]")}>{s.differenceAmount!==null?"Variance "+money(s.differenceAmount):"Open"}</p></div></div>)}</div>:<div className="p-4"><EmptyState title="No counter sessions yet"/></div>}
   </Surface>
  </div>
 </div></AppShell>;
}
