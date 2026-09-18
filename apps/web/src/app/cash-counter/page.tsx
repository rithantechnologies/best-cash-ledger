"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type Session={
 id:string;cashAccountId:string;businessDate:string;openedAt:string;openingTotal:string;
 expectedClosingTotal:string|null;actualClosingTotal:string|null;differenceAmount:string|null;
 status:string;closingNotes:string|null;cashAccount:{accountName:string};denominationCounts:Count[];
};
const notes=[2000,500,200,100,50,20,10,5,2,1];
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v));

export default function CashCounterPage(){
 const [accounts,setAccounts]=useState<Account[]>([]),[current,setCurrent]=useState<Session|null>(null),[history,setHistory]=useState<Session[]>([]);
 const [cashAccountId,setCashAccountId]=useState(""),[qty,setQty]=useState<Record<number,string>>({}),[remarks,setRemarks]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);

 const load=()=>Promise.all([apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Session|null>("/cash-counter/current"),apiFetch<Session[]>("/cash-counter/history")]).then(([a,c,h])=>{setAccounts(a);setCurrent(c);setHistory(h);if(c)setCashAccountId(c.cashAccountId);});
 useEffect(()=>{load().catch(()=>setError("Failed to load cash counter")).finally(()=>setLoading(false));},[]);
 const total=useMemo(()=>notes.reduce((s,n)=>s+n*Number(qty[n]||0),0),[qty]);
 function denominations(){return notes.map(denomination=>({denomination,quantity:Number(qty[denomination]||0)}));}

 async function open(e:FormEvent){e.preventDefault();setSaving(true);setError("");try{await apiFetch("/cash-counter/open",{method:"POST",body:JSON.stringify({cashAccountId,denominations:denominations()})});setQty({});await load();}catch(err){setError(err instanceof Error?err.message:"Failed to open cash counter");}finally{setSaving(false);}}
 async function close(e:FormEvent){e.preventDefault();if(!current)return;setSaving(true);setError("");try{await apiFetch("/cash-counter/"+current.id+"/close",{method:"POST",body:JSON.stringify({denominations:denominations(),notes:remarks||undefined})});setQty({});setRemarks("");await load();}catch(err){setError(err instanceof Error?err.message:"Failed to close cash counter");}finally{setSaving(false);}}

 if(loading)return <AppShell><PageLoader label="Preparing cash counter…"/></AppShell>;
 const cashAccounts=accounts.filter(a=>a.accountType==="CASH");
 return <AppShell><div className="page-enter mx-auto max-w-6xl space-y-5">
  <SectionHeading eyebrow="Physical cash" title="Cash counter" description="Count notes quickly, compare physical cash with the ledger, and capture any over/short variance at close."/>

  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <div className="grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
   <Surface className="overflow-hidden">
    <div className="border-b border-slate-100 px-4 py-3.5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">{current?"Close today’s counter":"Open cash counter"}</h3><p className="mt-0.5 text-xs text-slate-500">{current?"Count the physical closing cash.":"Start with the physical opening count."}</p></div>{current?<StatusBadge tone="emerald">Open</StatusBadge>:null}</div></div>
    <form onSubmit={current?close:open} className="p-4">
     {current?<div className="mb-4 rounded-2xl bg-slate-50 p-3"><p className="text-sm font-bold">{current.cashAccount.accountName}</p><p className="mt-0.5 text-xs text-slate-400">Opened {new Date(current.openedAt).toLocaleString("en-IN")} · {money(current.openingTotal)}</p></div>:<select className="mb-4 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Select cash account</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>}
     {!current&&!cashAccounts.length?<div className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Create a CASH account in Accounts before opening the counter.</div>:null}
     <div className="grid grid-cols-3 gap-2">{notes.map(n=><label key={n} className="rounded-2xl bg-slate-50 p-2.5 ring-1 ring-inset ring-slate-100"><span className="text-xs font-bold">₹{n}</span><input className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={qty[n]||""} onChange={e=>setQty(q=>({...q,[n]:e.target.value}))}/><span className="mt-1 block truncate text-center text-[10px] text-slate-400">{money(n*Number(qty[n]||0))}</span></label>)}</div>
     <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-950 p-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Physical total</p><p className="mt-1 text-xs text-slate-300">{Object.values(qty).filter(Boolean).length} denomination(s) entered</p></div><strong className="text-2xl">{money(total)}</strong></div>
     {current?<textarea className="mt-3 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Closing remarks / variance explanation" value={remarks} onChange={e=>setRemarks(e.target.value)}/>:null}
     <button disabled={saving||(!current&&!cashAccountId)} className="mt-3 min-h-12 w-full rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm disabled:opacity-40">{saving?"Saving…":current?"Close counter":"Open counter"}</button>
    </form>
   </Surface>

   <Surface className="p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Recent sessions</h3><p className="text-xs text-slate-500">Opening, expected, actual and variance history.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{history.length} sessions</span></div>
    {!history.length?<EmptyState title="No cash counter sessions yet" description="Your daily opening and closing history will appear here."/>:<>
      <div className="space-y-2 md:hidden">{history.map(s=><div key={s.id} className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{s.cashAccount.accountName}</p><p className="text-[11px] text-slate-400">{new Date(s.businessDate).toLocaleDateString("en-IN")}</p></div><StatusBadge tone={s.status==="OPEN"?"amber":"emerald"}>{s.status}</StatusBadge></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div><p className="text-slate-400">Opening</p><strong>{money(s.openingTotal)}</strong></div><div><p className="text-slate-400">Actual</p><strong>{s.actualClosingTotal?money(s.actualClosingTotal):"—"}</strong></div><div><p className="text-slate-400">Variance</p><strong className={Math.abs(Number(s.differenceAmount||0))>.005?"text-rose-700":""}>{s.differenceAmount!==null?money(s.differenceAmount):"—"}</strong></div></div></div>)}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[650px] text-sm"><thead className="text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="py-2">Date</th><th>Account</th><th>Opening</th><th>Expected</th><th>Actual</th><th>Difference</th><th>Status</th></tr></thead><tbody>{history.map(s=><tr key={s.id} className="border-t border-slate-100"><td className="py-3">{new Date(s.businessDate).toLocaleDateString("en-IN")}</td><td>{s.cashAccount.accountName}</td><td>{money(s.openingTotal)}</td><td>{s.expectedClosingTotal?money(s.expectedClosingTotal):"—"}</td><td>{s.actualClosingTotal?money(s.actualClosingTotal):"—"}</td><td className={Math.abs(Number(s.differenceAmount||0))>.005?"font-semibold text-rose-700":""}>{s.differenceAmount!==null?money(s.differenceAmount):"—"}</td><td><StatusBadge tone={s.status==="OPEN"?"amber":"emerald"}>{s.status}</StatusBadge></td></tr>)}</tbody></table></div>
    </>}
   </Surface>
  </div>
 </div></AppShell>;
}
