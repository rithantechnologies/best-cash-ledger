"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Summary={
  availableFunds:number;pendingProviderSettlements:number;customerReceivable:number;customerPayable:number;
  operatingPosition:number;netFinancialPosition:number;creditCardOutstanding:number;
};
type Position={
  id:string;businessDate:string;availableFunds:string;pendingProviderSettlements:string;customerReceivable:string;
  customerPayable:string;ownerCreditCardOutstanding:string;operatingPosition:string;netFinancialPosition:string;cashVariance:string;createdAt:string;
};
type Status={businessDate:string;snapshot:Position|null;openCashSessions:number;summary:Summary};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));

export default function EndOfDayPage(){
  const [status,setStatus]=useState<Status|null>(null);
  const [history,setHistory]=useState<Position[]>([]);
  const [role,setRole]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(true);

  async function load(){
    const [s,h]=await Promise.all([apiFetch<Status>("/end-of-day/status"),apiFetch<Position[]>("/end-of-day/history")]);
    setStatus(s);setHistory(h);
  }
  useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{};load().catch(e=>setError(e instanceof Error?e.message:"Failed to load end-of-day")).finally(()=>setLoading(false));},[]);

  async function snapshot(){
    setBusy(true);setError("");
    try{await apiFetch("/end-of-day/snapshot",{method:"POST"});await load();}
    catch(e){setError(e instanceof Error?e.message:"Failed to save end-of-day");}
    finally{setBusy(false);}
  }

  if(loading||!status)return <AppShell><PageLoader label="Preparing end-of-day…"/></AppShell>;
  const admin=role==="OWNER"||role==="ADMIN";
  const s=status.summary;

  return <AppShell><div className="page-enter mx-auto max-w-7xl space-y-5">
    <SectionHeading eyebrow="Daily control" title="End of day" description="Close the day with confidence: verify cash sessions, review the financial position, then save an immutable snapshot."/>

    {error?<p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}
    {status.openCashSessions>0?<div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"><strong>{status.openCashSessions} cash counter session(s) still open.</strong><p className="mt-1 text-sm">Close them before saving the EOD snapshot so physical cash and ledger cash agree.</p></div>:null}

    <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {[["Available funds",s.availableFunds],["Provider clearing",s.pendingProviderSettlements],["Customer receivables",s.customerReceivable],["Customer payables",s.customerPayable],["Operating position",s.operatingPosition],["Owner CC outstanding",s.creditCardOutstanding],["Net financial position",s.netFinancialPosition]].map(([label,value])=><Surface key={String(label)} className="p-3.5 sm:p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{money(Number(value))}</p></Surface>)}
    </section>

    <section className="rounded-2xl border bg-slate-950 p-6 text-white shadow-lg">
      {status.snapshot?<><p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-300">Snapshot saved</p><h3 className="mt-2 text-2xl font-bold">{new Date(status.snapshot.businessDate).toLocaleDateString("en-IN")}</h3><p className="mt-1 text-sm text-slate-300">Net position {money(status.snapshot.netFinancialPosition)} · Cash variance {money(status.snapshot.cashVariance)}</p></>:<>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-300">Ready to save</p><h3 className="mt-2 text-2xl font-bold">Capture today’s final position</h3><p className="mt-2 max-w-2xl text-sm text-slate-300">This stores account balances, payable/receivable movement, provider clearing, cash variance, operating position and net financial position for the day.</p>
        {admin?<button onClick={snapshot} disabled={busy||status.openCashSessions>0} className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">{busy?"Saving...":"Save EOD Snapshot"}</button>:<p className="mt-4 text-sm text-slate-400">Owner/Admin access is required to save the snapshot.</p>}
      </>}
    </section>

    <section className="rounded-2xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h3 className="font-semibold">Daily Position History</h3><p className="text-xs text-slate-500">Saved snapshots do not change when accounts are later edited or deactivated.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Date</th><th>Available</th><th>Provider Clearing</th><th>Receivable</th><th>Payable</th><th>Operating</th><th>Owner CC</th><th>Net Position</th><th>Cash Variance</th></tr></thead><tbody>
        {history.map(x=><tr key={x.id} className="border-t"><td className="px-5 py-3 font-medium">{new Date(x.businessDate).toLocaleDateString("en-IN")}</td><td>{money(x.availableFunds)}</td><td>{money(x.pendingProviderSettlements)}</td><td>{money(x.customerReceivable)}</td><td>{money(x.customerPayable)}</td><td className="font-semibold">{money(x.operatingPosition)}</td><td>{money(x.ownerCreditCardOutstanding)}</td><td className="font-bold">{money(x.netFinancialPosition)}</td><td className={Math.abs(Number(x.cashVariance))>0.005?"font-semibold text-red-700":""}>{money(x.cashVariance)}</td></tr>)}
        {!history.length?<tr><td colSpan={9} className="px-5 py-10 text-center text-slate-500">No EOD snapshots saved yet.</td></tr>:null}
      </tbody></table></div>
    </section>
  </div></AppShell>;
}
