"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type Movement={id:string;direction:"IN"|"OUT";amount:number;description:string|null;transactionNumber:string;transactionType:string;transactionAt:string};
type UserRef={id:string;fullName:string}|null;
type Session={
  id:string;cashAccountId:string;businessDate:string;openedAt:string;openingTotal:string;
  expectedClosingTotal:string|null;liveExpectedClosingTotal?:number;liveCashIn?:number;liveCashOut?:number;
  actualClosingTotal:string|null;differenceAmount:string|null;status:string;closingNotes:string|null;
  cashAccount:{accountName:string};denominationCounts:Count[];movements?:Movement[];
  openedBy?:UserRef;closedBy?:UserRef;closedAt?:string|null;
};

const denominations=[2000,500,200,100,50,20,10,5,2,1];
const money=(value:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value||0));
const words=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase());

function CountGrid({qty,setQty}:{qty:Record<number,string>;setQty:(updater:(current:Record<number,string>)=>Record<number,string>)=>void}){
  function step(note:number,delta:number){
    setQty((current)=>({...current,[note]:String(Math.max(0,Number(current[note]||0)+delta))}));
  }
  return <div className="space-y-2">
    {denominations.map((note)=><div key={note} className="grid grid-cols-[64px_minmax(0,1fr)_92px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <strong className="money text-sm">₹{note}</strong>
      <div className="grid grid-cols-[38px_minmax(0,1fr)_38px] items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-soft)]">
        <button type="button" onClick={()=>step(note,-1)} className="h-10 text-lg text-[var(--text-muted)]">−</button>
        <input className="h-10 min-w-0 border-x border-[var(--border)] bg-[var(--surface)] text-center text-base font-bold" type="number" min="0" step="1" inputMode="numeric" value={qty[note]||""} placeholder="0" onChange={(event)=>setQty((current)=>({...current,[note]:event.target.value}))}/>
        <button type="button" onClick={()=>step(note,1)} className="h-10 text-lg text-[var(--text-muted)]">+</button>
      </div>
      <span className="money text-right text-xs font-semibold text-[var(--text-muted)]">{money(note*Number(qty[note]||0))}</span>
    </div>)}
  </div>;
}

function CountBreakdown({counts,type}:{counts:Count[];type:"OPENING"|"CLOSING"}){
  const rows=counts.filter((count)=>count.countType===type&&count.quantity>0).sort((a,b)=>Number(b.denomination)-Number(a.denomination));
  if(!rows.length)return <p className="text-xs text-[var(--text-muted)]">No denomination details recorded.</p>;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {rows.map((count)=><div key={type+"-"+count.denomination} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-xs font-bold">₹{Number(count.denomination)} × {count.quantity}</p>
      <p className="money mt-0.5 text-[11px] text-[var(--text-muted)]">{money(count.totalAmount)}</p>
    </div>)}
  </div>;
}

export default function CashCounterPage(){
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [current,setCurrent]=useState<Session|null>(null);
  const [history,setHistory]=useState<Session[]>([]);
  const [cashAccountId,setCashAccountId]=useState("");
  const [qty,setQty]=useState<Record<number,string>>({});
  const [remarks,setRemarks]=useState("");
  const [closing,setClosing]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  const load=()=>Promise.all([
    apiFetch<Account[]>("/dashboard/accounts"),
    apiFetch<Session|null>("/cash-counter/current"),
    apiFetch<Session[]>("/cash-counter/history"),
  ]).then(([accountRows,session,historyRows])=>{
    setAccounts(accountRows);setCurrent(session);setHistory(historyRows);
    const drawer=accountRows.find((account)=>account.accountType==="CASH");
    if(session)setCashAccountId(session.cashAccountId);
    else if(drawer)setCashAccountId(drawer.id);
  });

  useEffect(()=>{load().catch(()=>setError("Failed to load cash counter")).finally(()=>setLoading(false));},[]);
  const countedTotal=useMemo(()=>denominations.reduce((sum,note)=>sum+note*Number(qty[note]||0),0),[qty]);
  const expected=Number(current?.liveExpectedClosingTotal??current?.expectedClosingTotal??current?.openingTotal??0);
  const cashIn=Number(current?.liveCashIn??0),cashOut=Number(current?.liveCashOut??0);
  const difference=countedTotal-expected;
  const cashDrawer=accounts.find((account)=>account.accountType==="CASH");
  function denominationPayload(){return denominations.map((denomination)=>({denomination,quantity:Number(qty[denomination]||0)}));}

  async function openCounter(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    try{
      await apiFetch("/cash-counter/open",{method:"POST",body:JSON.stringify({cashAccountId,denominations:denominationPayload()})});
      setQty({});await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to start today's cash counter");}
    finally{setSaving(false);}
  }

  async function closeCounter(event:FormEvent){
    event.preventDefault();if(!current)return;
    if(Math.abs(difference)>.005&&!remarks.trim()){
      setError("Please add a short note explaining the cash difference before closing.");return;
    }
    setSaving(true);setError("");
    try{
      await apiFetch("/cash-counter/"+current.id+"/close",{method:"POST",body:JSON.stringify({denominations:denominationPayload(),notes:remarks.trim()||undefined})});
      setQty({});setRemarks("");setClosing(false);await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to close today's cash counter");}
    finally{setSaving(false);}
  }

  if(loading)return <AppShell><PageLoader label="Loading today's cash…"/></AppShell>;

  return <AppShell><div className="page-enter mx-auto max-w-6xl space-y-5">
    <SectionHeading
      eyebrow="Daily cash control"
      title={current?"Today's cash":"Start today's cash counter"}
      description={current
        ?"Opening cash plus today's cash in, minus today's cash out. Count the drawer before closing."
        :"Count the physical cash in the shop before business starts. This becomes today's opening cash."}
    />
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

    {!current?<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <h3 className="text-sm font-extrabold">1. Count opening cash</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Include the cash already in the drawer or cash handed to staff before opening.</p>
        </div>
        <form onSubmit={openCounter} className="p-4 sm:p-5">
          <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16v11H4z"/><path d="M7 7V5h10v2"/><path d="M16 11h4v4h-4a2 2 0 0 1 0-4Z"/></svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold">Shop cash drawer</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">The physical cash kept at the shop counter.</p>
              </div>
            </div>
            {!cashDrawer?<p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Shop cash drawer is not configured.</p>:null}
          </div>
          <CountGrid qty={qty} setQty={setQty}/>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-[var(--accent-soft)] px-4 py-3">
            <div><p className="text-xs font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Opening cash</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Physical cash counted now</p></div>
            <strong className="money text-2xl font-black tracking-[-.04em] text-[var(--accent)]">{money(countedTotal)}</strong>
          </div>
          <button disabled={saving||!cashAccountId} className="mt-4 min-h-12 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm disabled:opacity-40">{saving?"Saving…":"Start today's counter"}</button>
        </form>
      </Surface>

      <Surface className="p-4 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--accent)]">How it works</p>
        <div className="mt-4 space-y-4">
          {[
            ["1","Start","Count the notes and coins in the shop. Save that as opening cash."],
            ["2","During the day","Cash transactions automatically increase or reduce the expected drawer cash."],
            ["3","Close","Count the physical cash again. The system compares counted cash with expected cash."],
          ].map(([step,title,detail])=><div key={step} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-xs font-black text-[var(--accent)]">{step}</span>
            <div><p className="text-sm font-bold">{title}</p><p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{detail}</p></div>
          </div>)}
        </div>
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
          <p className="text-xs font-bold">Owner → staff cash</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">If cash is handed over before opening, include it in the opening denomination count. Cash added later should be recorded through the normal cash transfer flow so today&apos;s expected cash updates automatically.</p>
        </div>
      </Surface>
    </div>:null}

    {current?<>
      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">Shop cash drawer</p>
            <h3 className="mt-1 text-lg font-black tracking-[-.025em]">Counter is open</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Opened {new Date(current.openedAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}{current.openedBy?.fullName?" by "+current.openedBy.fullName:""}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Live</span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
          <div className="bg-[var(--surface)] p-4"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Opening cash</p><p className="money mt-1.5 text-xl font-black">{money(current.openingTotal)}</p></div>
          <div className="bg-[var(--surface)] p-4"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Cash in</p><p className="money mt-1.5 text-xl font-black text-emerald-700">+{money(cashIn)}</p></div>
          <div className="bg-[var(--surface)] p-4"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Cash out</p><p className="money mt-1.5 text-xl font-black text-rose-600">−{money(cashOut)}</p></div>
          <div className="bg-[var(--accent-soft)] p-4"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--accent)]">Expected now</p><p className="money mt-1.5 text-xl font-black text-[var(--accent)]">{money(expected)}</p></div>
        </div>
        <div className="border-t border-[var(--border)] px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Opening {money(current.openingTotal)} + cash in {money(cashIn)} − cash out {money(cashOut)} = <strong className="text-[var(--text)]">{money(expected)} expected in drawer</strong></p>
        </div>
      </Surface>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
            <div><h3 className="text-sm font-extrabold">Today&apos;s cash movements</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">What increased or reduced the physical cash.</p></div>
            <span className="text-xs font-semibold text-[var(--text-muted)]">{current.movements?.length??0} shown</span>
          </div>
          {current.movements?.length?<div className="divide-y divide-[var(--border)]">
            {current.movements.slice(0,10).map((movement)=><div key={movement.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black "+(movement.direction==="IN"?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-600")}>{movement.direction==="IN"?"↓":"↑"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{movement.description||words(movement.transactionType)}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{movement.transactionNumber} · {new Date(movement.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
              </div>
              <strong className={"money shrink-0 text-sm "+(movement.direction==="IN"?"text-emerald-700":"text-rose-600")}>{movement.direction==="IN"?"+":"−"}{money(movement.amount)}</strong>
            </div>)}
          </div>:<div className="p-5"><EmptyState title="No cash movement yet" description="Cash in and out will appear here as transactions are recorded."/></div>}
        </Surface>

        <div className="space-y-4">
          <Surface className="p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--accent)]">End of day</p>
            <h3 className="mt-1 text-base font-black">Count and close</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">When business is finished, count every denomination again. We will compare it with {money(expected)} expected cash.</p>
            {!closing?<button type="button" onClick={()=>{setClosing(true);setQty({});setError("");}} className="mt-4 min-h-11 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white">Count closing cash</button>:null}
            <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
              <summary className="cursor-pointer text-xs font-bold text-[var(--text-muted)]">Opening denomination count</summary>
              <div className="mt-3"><CountBreakdown counts={current.denominationCounts} type="OPENING"/></div>
            </details>
          </Surface>
        </div>
      </div>

      {closing?<Surface className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div><h3 className="text-sm font-extrabold">Closing cash count</h3><p className="mt-0.5 text-xs text-[var(--text-muted)]">Enter the physical notes and coins remaining in the drawer.</p></div>
          <button type="button" onClick={()=>{setClosing(false);setQty({});setRemarks("");setError("");}} className="text-xs font-bold text-[var(--text-muted)]">Cancel</button>
        </div>
        <form onSubmit={closeCounter} className="p-4 sm:p-5">
          <CountGrid qty={qty} setQty={setQty}/>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Expected</p><p className="money mt-1 text-sm font-black">{money(expected)}</p></div>
            <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Counted</p><p className="money mt-1 text-sm font-black">{money(countedTotal)}</p></div>
            <div className={"rounded-xl p-3 "+(Math.abs(difference)>.005?"bg-rose-50":"bg-emerald-50")}><p className={"text-[10px] font-bold uppercase tracking-[.08em] "+(Math.abs(difference)>.005?"text-rose-600":"text-emerald-700")}>Difference</p><p className={"money mt-1 text-sm font-black "+(Math.abs(difference)>.005?"text-rose-700":"text-emerald-700")}>{money(difference)}</p></div>
          </div>
          {Math.abs(difference)>.005?<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">The physical cash does not match the expected cash. Add a short explanation before closing.</div>:null}
          <label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold">Closing note {Math.abs(difference)>.005?"(required)":""}</span><textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-base sm:text-sm" placeholder={Math.abs(difference)>.005?"Example: ₹500 short - used for shop purchase not yet entered":"Optional note"} value={remarks} onChange={(event)=>setRemarks(event.target.value)}/></label>
          <button disabled={saving} className="mt-4 min-h-12 w-full rounded-xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--surface)] disabled:opacity-40">{saving?"Closing…":"Close today's counter"}</button>
        </form>
      </Surface>:null}
    </>:null}

    <Surface className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
        <h3 className="text-sm font-extrabold">Previous days</h3>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Opening count, closing count and any difference.</p>
      </div>
      {history.filter((session)=>session.status==="CLOSED").length?<div className="divide-y divide-[var(--border)]">
        {history.filter((session)=>session.status==="CLOSED").slice(0,14).map((session)=>{
          const variance=Number(session.differenceAmount||0);
          return <details key={session.id} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{new Date(session.businessDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">Shop cash drawer{session.openedBy?.fullName?" · opened by "+session.openedBy.fullName:""}</p>
              </div>
              <div className="text-right">
                <p className="money text-sm font-black">{money(session.actualClosingTotal||0)}</p>
                <p className={"text-[11px] font-semibold "+(Math.abs(variance)>.005?"text-rose-600":"text-emerald-700")}>{Math.abs(variance)>.005?"Difference "+money(variance):"Matched"}</p>
              </div>
              <span className="text-lg text-[var(--text-muted)]">›</span>
            </summary>
            <div className="border-t border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4 sm:px-5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[var(--surface)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Opening</p><p className="money mt-1 text-sm font-black">{money(session.openingTotal)}</p></div>
                <div className="rounded-xl bg-[var(--surface)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Expected</p><p className="money mt-1 text-sm font-black">{money(session.expectedClosingTotal||0)}</p></div>
                <div className="rounded-xl bg-[var(--surface)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Counted</p><p className="money mt-1 text-sm font-black">{money(session.actualClosingTotal||0)}</p></div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div><p className="mb-2 text-xs font-bold">Opening denominations</p><CountBreakdown counts={session.denominationCounts} type="OPENING"/></div>
                <div><p className="mb-2 text-xs font-bold">Closing denominations</p><CountBreakdown counts={session.denominationCounts} type="CLOSING"/></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
                {session.closedBy?.fullName?<span>Closed by <strong className="text-[var(--text)]">{session.closedBy.fullName}</strong></span>:null}
                {session.closedAt?<span>{new Date(session.closedAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>:null}
                {session.closingNotes?<span>Note: {session.closingNotes}</span>:null}
              </div>
            </div>
          </details>;
        })}
      </div>:<div className="p-5"><EmptyState title="No closed counter days yet" description="Closed days will appear here for the owner to review."/></div>}
    </Surface>
  </div></AppShell>;
}
