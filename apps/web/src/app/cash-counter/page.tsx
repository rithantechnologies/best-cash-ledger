"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
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
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [current,setCurrent]=useState<Session|null>(null);
 const [history,setHistory]=useState<Session[]>([]);
 const [cashAccountId,setCashAccountId]=useState("");
 const [qty,setQty]=useState<Record<number,string>>({});
 const [remarks,setRemarks]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);

 const load=()=>Promise.all([
  apiFetch<Account[]>("/dashboard/accounts"),
  apiFetch<Session|null>("/cash-counter/current"),
  apiFetch<Session[]>("/cash-counter/history"),
 ]).then(([a,c,h])=>{setAccounts(a);setCurrent(c);setHistory(h);if(c)setCashAccountId(c.cashAccountId);});

 useEffect(()=>{load().catch(()=>setError("Failed to load cash counter"));},[]);
 const total=useMemo(()=>notes.reduce((s,n)=>s+n*Number(qty[n]||0),0),[qty]);

 function denominations(){return notes.map(denomination=>({denomination,quantity:Number(qty[denomination]||0)}));}

 async function open(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{await apiFetch("/cash-counter/open",{method:"POST",body:JSON.stringify({cashAccountId,denominations:denominations()})});setQty({});await load();}
  catch(err){setError(err instanceof Error?err.message:"Failed to open cash counter");}finally{setSaving(false);}
 }
 async function close(e:FormEvent){
  e.preventDefault();if(!current)return;setSaving(true);setError("");
  try{await apiFetch("/cash-counter/"+current.id+"/close",{method:"POST",body:JSON.stringify({denominations:denominations(),notes:remarks||undefined})});setQty({});setRemarks("");await load();}
  catch(err){setError(err instanceof Error?err.message:"Failed to close cash counter");}finally{setSaving(false);}
 }

 return <AppShell><div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
  <div><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Cash Counter</h2><p className="mt-1 text-sm text-slate-500">Count physical cash quickly and reconcile the expected closing balance.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr] lg:gap-6">
   <div className="rounded-xl border bg-white p-5">
    <h3 className="font-semibold">{current?"Close Cash Counter":"Open Cash Counter"}</h3>
    {current?<div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm"><p>{current.cashAccount.accountName}</p><p className="text-slate-500">Opened {new Date(current.openedAt).toLocaleString("en-IN")} · Opening {money(current.openingTotal)}</p></div>:null}
    <form onSubmit={current?close:open} className="mt-4 space-y-4">
     {!current?<select className="w-full rounded-lg border px-3 py-2.5" value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Select cash account</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>:null}
     <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">{notes.map(n=><label key={n} className="rounded-lg border p-3 text-sm"><span className="block font-medium">₹{n}</span><input className="mt-2 w-full rounded border px-2 py-1.5" type="number" min="0" step="1" placeholder="Qty" value={qty[n]||""} onChange={e=>setQty(q=>({...q,[n]:e.target.value}))}/><span className="mt-1 block text-xs text-slate-500">{money(n*Number(qty[n]||0))}</span></label>)}</div>
     <div className="flex items-center justify-between rounded-lg bg-slate-950 p-4 text-white"><span>Physical total</span><strong className="text-xl">{money(total)}</strong></div>
     {current?<textarea className="w-full rounded-lg border px-3 py-2.5" placeholder="Closing remarks / difference explanation" value={remarks} onChange={e=>setRemarks(e.target.value)}/>:null}
     <button disabled={saving||(!current&&!cashAccountId)} className="w-full rounded-lg bg-slate-950 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":current?"Close Counter":"Open Counter"}</button>
    </form>
   </div>
   <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Recent Sessions</h3><span className="text-xs text-slate-400">{history.length} session(s)</span></div>
    {!history.length?<div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No cash counter sessions yet.</div>:<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Date</th><th>Account</th><th>Opening</th><th>Expected</th><th>Actual</th><th>Difference</th><th>Status</th></tr></thead><tbody>{history.map(s=><tr key={s.id} className="border-t"><td className="py-3">{new Date(s.businessDate).toLocaleDateString("en-IN")}</td><td>{s.cashAccount.accountName}</td><td>{money(s.openingTotal)}</td><td>{s.expectedClosingTotal?money(s.expectedClosingTotal):"—"}</td><td>{s.actualClosingTotal?money(s.actualClosingTotal):"—"}</td><td className={Number(s.differenceAmount||0)!==0?"font-semibold text-red-700":""}>{s.differenceAmount!==null?money(s.differenceAmount):"—"}</td><td>{s.status}</td></tr>)}</tbody></table></div>}
   </div>
  </section>
 </div></AppShell>;
}
