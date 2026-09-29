"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Direction="IN"|"OUT";
type RowStatus="READY"|"SAVING"|"SAVED"|"ERROR";
type RushRow={
  key:string;
  direction:Direction;
  amount:string;
  customerName:string;
  mobileNumber:string;
  commission:string;
  status:RowStatus;
  message?:string;
  transactionId?:string;
  transactionNumber?:string;
};
type SavedTransaction={id:string;transactionNumber:string;status:string};

function newKey(){
  if(typeof crypto!=="undefined"&&"randomUUID" in crypto)return crypto.randomUUID();
  return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
}
function emptyRow(direction:Direction="IN"):RushRow{
  return {key:newKey(),direction,amount:"",customerName:"",mobileNumber:"",commission:"",status:"READY"};
}
function hasDraft(row:RushRow){
  return Boolean(row.amount.trim()||row.customerName.trim()||row.mobileNumber.trim()||row.commission.trim());
}
function rowError(row:RushRow){
  const amount=Number(row.amount),commission=Number(row.commission||0);
  if(!row.amount.trim()||!Number.isFinite(amount)||amount<=0)return "Enter an amount greater than 0.";
  if(!Number.isFinite(commission)||commission<0)return "Fee / commission cannot be negative.";
  if(row.direction==="IN"&&commission>=amount&&commission>0)return "For Cash In, fee must be less than the amount.";
  return "";
}
function money(value:number){
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(value||0);
}

export function QuickCashRushEntry({
  cashAccountId,disabled=false,onSaved,
}:{
  cashAccountId:string;disabled?:boolean;onSaved?:()=>void|Promise<void>;
}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<RushRow[]>([]);
  const [savingAll,setSavingAll]=useState(false);
  const [savedSinceRefresh,setSavedSinceRefresh]=useState(false);
  const amountRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const lastDirection=useRef<Direction>("IN");

  function openRush(){
    if(disabled||!cashAccountId)return;
    const initialRows=Array.from({length:8},()=>emptyRow(lastDirection.current));
    amountRefs.current={};
    setRows(initialRows);
    setSavedSinceRefresh(false);
    setSavingAll(false);
    setOpen(true);
    window.setTimeout(()=>amountRefs.current[initialRows[0].key]?.focus(),50);
  }
  async function refreshParent(){
    if(savedSinceRefresh)await onSaved?.();
  }
  async function closeRush(){
    const unsaved=rows.some((row)=>row.status!=="SAVED"&&hasDraft(row));
    if(unsaved&&!window.confirm("Discard unsaved rush-entry rows? Saved rows are already recorded."))return;
    setOpen(false);
    if(savedSinceRefresh)await onSaved?.();
  }
  function patchRow(key:string,patch:Partial<RushRow>){
    setRows((current)=>current.map((row)=>row.key===key?{...row,...patch,status:row.status==="SAVED"?"SAVED":"READY",message:undefined}:row));
  }
  function addRow(direction:Direction=lastDirection.current){
    const row=emptyRow(direction);
    setRows((current)=>[...current,row]);
    requestAnimationFrame(()=>amountRefs.current[row.key]?.focus());
  }
  function removeRow(key:string){
    setRows((current)=>current.length<=1?current:current.filter((row)=>row.key!==key));
  }
  function focusRelative(key:string,delta:number){
    const index=rows.findIndex((row)=>row.key===key);
    const target=rows[index+delta];
    if(target)amountRefs.current[target.key]?.focus();
  }
  function markRow(key:string,patch:Partial<RushRow>){
    setRows((current)=>current.map((row)=>row.key===key?{...row,...patch}:row));
  }
  async function saveSnapshot(row:RushRow,focusNext:boolean){
    if(row.status==="SAVED"||row.status==="SAVING")return true;
    const validation=rowError(row);
    if(validation){markRow(row.key,{status:"ERROR",message:validation});amountRefs.current[row.key]?.focus();return false;}
    markRow(row.key,{status:"SAVING",message:undefined});
    const amount=Number(row.amount),commission=Number(row.commission||0);
    try{
      const transaction=await apiFetch<SavedTransaction>("/transactions/quick-cash",{
        method:"POST",
        headers:{"idempotency-key":"cash-rush-"+row.key},
        body:JSON.stringify({
          direction:row.direction,
          cashAccountId,
          amount,
          purpose:"TRANSFER",
          cashOutType:row.direction==="OUT"?"UPI_QR":undefined,
          commissionAmount:commission,
          commissionCashAmount:commission>0?commission:undefined,
          commissionMode:commission>0?"CASH":undefined,
          beneficiaryMode:row.direction==="IN"?"UPI":undefined,
          customerName:row.customerName.trim()||undefined,
          mobileNumber:row.mobileNumber.trim()||undefined,
        }),
      });
      lastDirection.current=row.direction;
      setSavedSinceRefresh(true);
      let nextKey="";
      setRows((current)=>{
        const index=current.findIndex((item)=>item.key===row.key);
        if(index<0)return current;
        const next=[...current];
        next[index]={...next[index],status:"SAVED",message:undefined,transactionId:transaction.id,transactionNumber:transaction.transactionNumber};
        if(focusNext){
          if(!next[index+1])next.push(emptyRow(row.direction));
          nextKey=next[index+1].key;
        }
        return next;
      });
      if(focusNext)window.setTimeout(()=>amountRefs.current[nextKey]?.focus(),30);
      return true;
    }catch(error){
      markRow(row.key,{status:"ERROR",message:error instanceof Error?error.message:"Could not save this row"});
      return false;
    }
  }
  async function saveRow(key:string){
    const row=rows.find((item)=>item.key===key);
    if(row)await saveSnapshot(row,true);
  }
  async function saveAll(){
    if(savingAll)return;
    setSavingAll(true);
    try{
      const snapshots=rows.filter((row)=>row.status!=="SAVED"&&hasDraft(row));
      for(const row of snapshots)await saveSnapshot(row,false);
      if(snapshots.length)await onSaved?.();
      if(snapshots.length)setSavedSinceRefresh(false);
    }finally{setSavingAll(false);}
  }
  async function openTransaction(row:RushRow){
    if(!row.transactionId)return;
    setOpen(false);
    await refreshParent();
    router.push("/transactions/"+row.transactionId);
  }
  const savedRows=rows.filter((row)=>row.status==="SAVED");
  const enteredRows=rows.filter(hasDraft);
  const savedPrincipal=savedRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const unsavedCount=rows.filter((row)=>row.status!=="SAVED"&&hasDraft(row)).length;

  return <>
    <button type="button" onClick={openRush} disabled={disabled||!cashAccountId}
      className="flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900 px-3 text-[12px] font-black text-white shadow-[0_6px_18px_rgba(15,23,42,.22)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40">
      <span className="text-sm">▦</span><span>Rush / Bulk</span>
    </button>
    {open&&typeof document!=="undefined"?createPortal(
      <div className="fixed inset-0 z-[105] flex flex-col bg-black/45 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Rush cash entry">
        <div className="m-auto flex max-h-[96dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-none bg-[var(--surface)] shadow-2xl sm:rounded-[26px]">
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-[-.035em]">Rush Cash Entry</h2>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">Counter mode</span>
              </div>
              <p className="mt-1 text-[12px] font-semibold text-[var(--text-muted)]">Many customers, one screen. Every saved row becomes a normal pending Cash In / Cash Out transaction.</p>
            </div>
            <button type="button" onClick={()=>void closeRush()} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-soft)] text-xl font-bold text-[var(--text-muted)]" aria-label="Close rush entry">×</button>
          </header>
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-[var(--text-muted)]">
              <span><strong className="text-[var(--text)]">Enter</strong> saves that row</span>
              <span><strong className="text-[var(--text)]">Tab</strong> moves across</span>
              <span><strong className="text-[var(--text)]">↑ / ↓</strong> moves between amount cells</span>
              <span><strong className="text-[var(--text)]">Ctrl/⌘ + Enter</strong> saves all filled rows</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto" onKeyDown={(event)=>{
            if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();void saveAll();}
          }}>
            <div className="min-w-[920px]">
              <div className="sticky top-0 z-10 grid grid-cols-[128px_135px_minmax(170px,1fr)_165px_125px_150px_86px] gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">
                <span>Type</span><span>Amount</span><span>Customer</span><span>Mobile</span><span>Fee</span><span>Status</span><span/>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {rows.map((row,index)=><div key={row.key} className={"grid grid-cols-[128px_135px_minmax(170px,1fr)_165px_125px_150px_86px] items-center gap-2 px-3 py-2 "+(row.status==="SAVED"?"bg-emerald-50/40":"")}>
                  <select value={row.direction} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>patchRow(row.key,{direction:event.target.value as Direction})}
                    className={"h-10 rounded-xl border px-2 text-sm font-black outline-none "+(row.direction==="IN"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-rose-200 bg-rose-50 text-rose-700")}>
                    <option value="IN">↓ Cash In</option><option value="OUT">↑ Cash Out</option>
                  </select>
                  <div className="flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 focus-within:border-[var(--accent)]">
                    <span className="mr-1 font-black">₹</span>
                    <input ref={(element)=>{amountRefs.current[row.key]=element;}} inputMode="decimal" value={row.amount} disabled={row.status==="SAVED"||row.status==="SAVING"}
                      onChange={(event)=>patchRow(row.key,{amount:event.target.value.replace(/[^0-9.]/g,"")})}
                      onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}else if(event.key==="ArrowDown"){event.preventDefault();focusRelative(row.key,1);}else if(event.key==="ArrowUp"){event.preventDefault();focusRelative(row.key,-1);}}}
                      className="min-w-0 flex-1 bg-transparent text-right text-[16px] font-black tabular-nums outline-none disabled:opacity-60" placeholder="0"/>
                  </div>
                  <input value={row.customerName} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>patchRow(row.key,{customerName:event.target.value.toUpperCase()})}
                    onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}}
                    className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold uppercase outline-none focus:border-[var(--accent)] disabled:opacity-60" placeholder="Optional name"/>
                  <input type="tel" inputMode="tel" value={row.mobileNumber} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>patchRow(row.key,{mobileNumber:event.target.value})}
                    onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}}
                    className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)] disabled:opacity-60" placeholder="Optional mobile"/>
                  <div className="flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 focus-within:border-[var(--accent)]">
                    <span className="mr-1 text-xs font-black text-[var(--text-muted)]">₹</span>
                    <input inputMode="decimal" value={row.commission} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>patchRow(row.key,{commission:event.target.value.replace(/[^0-9.]/g,"")})}
                      onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}}
                      className="min-w-0 flex-1 bg-transparent text-right text-sm font-black tabular-nums outline-none disabled:opacity-60" placeholder="0"/>
                  </div>
                  <div className="min-w-0">
                    {row.status==="SAVED"?<><p className="truncate text-[11px] font-black text-emerald-700">Saved · Pending details</p><p className="truncate text-[9px] font-semibold text-[var(--text-muted)]">{row.transactionNumber}</p></>:
                     row.status==="SAVING"?<p className="text-[11px] font-black text-[var(--accent)]">Saving…</p>:
                     row.status==="ERROR"?<p className="line-clamp-2 text-[10px] font-bold leading-3 text-rose-600">{row.message}</p>:
                     <p className="text-[11px] font-bold text-[var(--text-muted)]">{hasDraft(row)?"Ready to save":"Ready"}</p>}
                  </div>
                  <div className="flex justify-end gap-1">
                    {row.status==="SAVED"?<button type="button" onClick={()=>void openTransaction(row)} className="min-h-8 rounded-lg bg-emerald-600 px-2 text-[10px] font-black text-white">Open</button>:
                    <><button type="button" disabled={row.status==="SAVING"||!hasDraft(row)} onClick={()=>void saveRow(row.key)} className="min-h-8 rounded-lg bg-[var(--accent)] px-2 text-[10px] font-black text-white disabled:opacity-30">Save</button>
                    <button type="button" disabled={row.status==="SAVING"} onClick={()=>removeRow(row.key)} className="grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600" aria-label={"Remove row "+(index+1)}>×</button></>}
                  </div>
                </div>)}
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={()=>addRow()} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-xs font-black">+ Add row</button>
                <button type="button" onClick={()=>addRow("IN")} className="min-h-10 rounded-xl bg-emerald-50 px-3 text-xs font-black text-emerald-700">+ Cash In row</button>
                <button type="button" onClick={()=>addRow("OUT")} className="min-h-10 rounded-xl bg-rose-50 px-3 text-xs font-black text-rose-700">+ Cash Out row</button>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[var(--text-muted)]">{savedRows.length} saved · {unsavedCount} unsaved</p>
                  <p className="money mt-0.5 text-sm font-black">{money(savedPrincipal)} recorded</p>
                </div>
                <button type="button" onClick={()=>void saveAll()} disabled={savingAll||enteredRows.every((row)=>row.status==="SAVED")}
                  className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-black text-white shadow-sm disabled:opacity-35">
                  {savingAll?"Saving rows…":"Save all filled rows"}
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>,document.body):null}
  </>;
}
