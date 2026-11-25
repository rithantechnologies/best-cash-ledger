"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";
import { amountSuggestion } from "@/lib/follow-up-planned-amount.mjs";

type Customer = {id:string;fullName:string;mobile:string|null;cards:{id:string;bankName:string;lastFourDigits:string;isActive:boolean}[]};
type Provider = {id:string;name:string;gateways:{id:string;gatewayName:string;isActive:boolean}[]};
type Account = {id:string;accountName:string;accountType:string;currentBalance:number;isActive?:boolean};
type FollowUpEvent = {id:string;action:string;note:string|null;createdAt:string;actorId:string};
type Task = {
 id:string;kind:"CARD_RETRY"|"BANK_REFUND";status:"OPEN"|"COMPLETED"|"CANCELLED";
 customer:{id:string;fullName:string;mobile:string|null};
 card:null|{id:string;bankName:string;lastFourDigits:string};provider:null|{name:string};gateway:null|{gatewayName:string};
 account:null|{id:string;accountName:string;accountType:string};
 sourceTransaction:null|{transactionNumber:string};
 receiptTransaction:null|{transactionNumber:string;status:string};
 receiptVerified:boolean;needsReceiptReview:boolean;expectedAmount:string|null;plannedSwipeAmount:string|null;
 swipedAmount:number;remainingPlannedAmount:number|null;
 swipeAllocations?:{id:string;amount:string;linkedAt:string;transaction:{id:string;transactionNumber:string;status:string;transactionAt:string}}[];
 reference:string|null;
 reason:string;notes:string|null;nextReminderAt:string|null;createdAt:string;completedAt:string|null;events?:FollowUpEvent[];
};
type Summary = {open:number;due:number;cardRetries:number;pendingRefunds:number;needsReceiptReview?:number;expectedRefundTotal:string|number;plannedSwipeTotal:string|number;missingPlannedSwipeAmounts:number;swipedAmount:number|string;remainingPlannedAmount:number};
type CustomerSwipeSummary = {customerId:string;customerName:string;customerMobile:string|null;taskCount:number;cardCount:number;amountCount:number;amountMissing:number;plannedSwipeTotal:string|number;swipedAmount:number;remainingPlannedAmount:number;dueCount:number;nextReminderAt:string|null};
const input="app-control min-h-10 w-full rounded-xl";
const money=(n:string|number|null|undefined)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(n??0));
function istTime(value:string|null|undefined){
 if(!value)return "—";
 return new Date(value).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function asIstIso(value:string){
 if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return "";
 return new Date(value+":00+05:30").toISOString();
}
function dateInputIst(value:string|null|undefined){
 if(!value)return "";
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
 const get=(key:string)=>parts.find(x=>x.type===key)?.value??"";
 return get("year")+"-"+get("month")+"-"+get("day")+"T"+get("hour")+":"+get("minute");
}

export default function FollowUpsPage(){
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [providers,setProviders]=useState<Provider[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [rows,setRows]=useState<Task[]>([]);
 const [customerSummaries,setCustomerSummaries]=useState<CustomerSwipeSummary[]>([]);
 const [focusCustomerId,setFocusCustomerId]=useState("");
 const [total,setTotal]=useState(0);
 const [summary,setSummary]=useState<Summary>({open:0,due:0,cardRetries:0,pendingRefunds:0,expectedRefundTotal:0,plannedSwipeTotal:0,missingPlannedSwipeAmounts:0,swipedAmount:0,remainingPlannedAmount:0});
 const [status,setStatus]=useState("OPEN"),[filterKind,setFilterKind]=useState("");
 const [search,setSearch]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [createOpen,setCreateOpen]=useState(false);
 const [kind,setKind]=useState<"CARD_RETRY"|"BANK_REFUND">("CARD_RETRY");
 const [customerId,setCustomerId]=useState(""),[cardId,setCardId]=useState("");
 const [providerId,setProviderId]=useState(""),[gatewayId,setGatewayId]=useState("");
 const [accountId,setAccountId]=useState(""),[expectedAmount,setExpectedAmount]=useState(""),[plannedAmount,setPlannedAmount]=useState("");
 const [reason,setReason]=useState(""),[reference,setReference]=useState("");
 const [sourceTransactionNumber,setSourceTransactionNumber]=useState(""),[notes,setNotes]=useState("");
 const [createReminder,setCreateReminder]=useState("");
 const [editReminders,setEditReminders]=useState<Record<string,string>>({});
 const [expanded,setExpanded]=useState<string|null>(null),[selectedDetail,setSelectedDetail]=useState<Task|null>(null);
 const [clock,setClock]=useState(()=>Date.now());
 const selectedCustomer=customers.find(c=>c.id===customerId);
 const selectedProvider=providers.find(p=>p.id===providerId);
 const refundAccounts=accounts.filter(a=>["BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)&&a.isActive!==false);

 const refresh=useCallback(async()=>{
  const query=new URLSearchParams({status});if(filterKind)query.set("kind",filterKind);if(focusCustomerId)query.set("customerId",focusCustomerId);
  const [result,s,currentAccounts,grouped]=await Promise.all([
   apiFetch<{rows:Task[];total:number}>("/follow-ups?"+query.toString()),
   apiFetch<Summary>("/follow-ups/summary"),
   apiFetch<Account[]>("/dashboard/accounts"),
   apiFetch<CustomerSwipeSummary[]>("/follow-ups/customer-summary"),
  ]);
  setRows(result.rows);setTotal(result.total);setSummary(s);setAccounts(currentAccounts);setCustomerSummaries(grouped);
 },[status,filterKind,focusCustomerId]);
 useEffect(()=>{
  let active=true;
  Promise.all([
    apiFetch<Customer[]>("/customers"),
    apiFetch<Provider[]>("/providers?includeInactive=true"),
    apiFetch<Account[]>("/dashboard/accounts"),
  ]).then(([c,p,a])=>{if(active){setCustomers(c);setProviders(p);setAccounts(a);}})
   .catch(err=>{if(active)setError(err instanceof Error?err.message:"Unable to load follow-up options");});
  const query=new URLSearchParams(window.location.search);
  if(query.get("create")==="card"||query.get("create")==="refund"){
   setCreateOpen(true);setKind(query.get("create")==="refund"?"BANK_REFUND":"CARD_RETRY");
  }
  if(query.get("customerId"))setCustomerId(query.get("customerId")!);
  if(query.get("cardId"))setCardId(query.get("cardId")!);
  if(query.get("providerId"))setProviderId(query.get("providerId")!);
  if(query.get("gatewayId"))setGatewayId(query.get("gatewayId")!);
  const amountFromSwipe=Number(query.get("amount"));
  if(query.get("amount") && Number.isFinite(amountFromSwipe) && amountFromSwipe>0)setPlannedAmount(String(amountFromSwipe));
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  let alive=true;
  const pull=()=>refresh().catch(err=>{if(alive)setError(err instanceof Error?err.message:"Unable to load follow-ups");});
  pull();const timer=window.setInterval(()=>{setClock(Date.now());pull();},60000);
  const focus=()=>pull();window.addEventListener("focus",focus);
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener("focus",focus);};
 },[refresh]);
 useEffect(()=>{
  if(!expanded){setSelectedDetail(null);return;}
  apiFetch<Task>("/follow-ups/"+expanded).then(setSelectedDetail).catch(()=>setSelectedDetail(null));
 },[expanded,rows]);
 const visibleRows=useMemo(()=>rows.filter(row=>{
  if(focusCustomerId && row.customer.id!==focusCustomerId)return false;
  const q=search.trim().toLowerCase();
  return !q||[row.customer.fullName,row.customer.mobile,row.card?.lastFourDigits,row.provider?.name,row.gateway?.gatewayName,row.reason,row.reference,row.sourceTransaction?.transactionNumber].some(x=>x?.toLowerCase().includes(q));
 }),[rows,search,focusCustomerId]);
 const visibleCustomers=useMemo(()=>customerSummaries.filter(group=>{
  const q=search.trim().toLowerCase();
  return !q||group.customerName.toLowerCase().includes(q)||(group.customerMobile??"").includes(q)
    ||rows.some(row=>row.customer.id===group.customerId&&[row.card?.lastFourDigits,row.provider?.name,row.gateway?.gatewayName].some(v=>v?.toLowerCase().includes(q)));
 }),[customerSummaries,search,rows]);

 async function create(e:FormEvent){
  e.preventDefault();if(busy)return;setError("");setNotice("");setBusy(true);
  try{
   const payload={
    kind,customerId,...(kind==="CARD_RETRY"?{cardId,providerId:providerId||undefined,gatewayId:gatewayId||undefined,plannedSwipeAmount:Number(plannedAmount)}:
      {accountId,expectedAmount:Number(expectedAmount)}),
    reason:reason.trim(),reference:reference.trim()||undefined,notes:notes.trim()||undefined,
    sourceTransactionNumber:sourceTransactionNumber.trim()||undefined,
    nextReminderAt:createReminder?asIstIso(createReminder):undefined,
   };
   await apiFetch("/follow-ups",{method:"POST",body:JSON.stringify(payload)});
   setNotice("Follow-up saved. No card swipe, bank credit or ledger balance was posted.");
   setCreateOpen(false);setReason("");setReference("");setNotes("");setSourceTransactionNumber("");setExpectedAmount("");setPlannedAmount("");setCreateReminder("");
   setStatus("OPEN");await refresh();
  }catch(err){setError(err instanceof Error?err.message:"Could not save follow-up");}
  finally{setBusy(false);}
 }
 async function action(row:Task,act:"NOTE"|"SCHEDULE"|"REMIND_LATER"|"COMPLETE"|"CANCEL"|"REOPEN"|"VERIFY_REFUND"|"SET_AMOUNT"){
  if(busy)return;
  let note="";
  if(act==="NOTE"||act==="CANCEL"){
   const provided=window.prompt(act==="NOTE"?"Add an internal follow-up note":"Reason for cancelling this follow-up:");
   if(!provided?.trim())return;note=provided.trim();
  }
  if(act==="COMPLETE"){
   if(!window.confirm("Close this card retry? This will NOT create a Card Swipe transaction."))return;
   note=window.prompt("Optional: what happened during the retry?")?.trim()??"";
  }
  let confirmedPlannedAmount:number|undefined;
  if(act==="SET_AMOUNT"){
   const suggested=row.plannedSwipeAmount??amountSuggestion(row.reason)?.toString()??"";
   const entered=window.prompt("Planned card swipe amount (₹). Confirm or correct the suggested amount; no transaction is posted.",suggested);
   if(entered===null)return;
   confirmedPlannedAmount=Number(entered.trim().replace(/,/g,""));
   if(!entered.trim()||!Number.isFinite(confirmedPlannedAmount)||confirmedPlannedAmount<=0||confirmedPlannedAmount>999999999||Math.round(confirmedPlannedAmount*100)/100!==confirmedPlannedAmount){
    setError("Enter a valid positive planned swipe amount (up to 2 decimal places).");return;
   }
  }
  let receiptTransactionNumber="";
  if(act==="VERIFY_REFUND"){
   const result=window.prompt("Enter the EXISTING posted bank/wallet receipt transaction number. Only a matched ledger credit will count as received.");
   if(!result?.trim())return;receiptTransactionNumber=result.trim();
   if(!window.confirm("Verify this posted credit against the expected refund? No new money movement will be created."))return;
  }
  if(act==="SCHEDULE"&&!editReminders[row.id]){setError("Choose the reminder date and time first.");return;}
  setBusy(true);setError("");setNotice("");
  try{
   await apiFetch("/follow-ups/"+row.id,{method:"PATCH",body:JSON.stringify({
    action:act,note:note||undefined,plannedSwipeAmount:confirmedPlannedAmount,receiptTransactionNumber:receiptTransactionNumber||undefined,
    nextReminderAt:act==="SCHEDULE"?asIstIso(editReminders[row.id]):undefined,
   })});
   setNotice(act==="VERIFY_REFUND"?"Refund matched to a posted account credit. Ledger balances were not changed.":act==="SET_AMOUNT"?"Planned amount confirmed. Customer totals updated; no financial transaction was created.":"Follow-up updated and recorded in its audit history.");
   await refresh();
   if(expanded===row.id)setSelectedDetail(await apiFetch<Task>("/follow-ups/"+row.id));
  }catch(err){setError(err instanceof Error?err.message:"Follow-up update failed");}
  finally{setBusy(false);}
 }

 return <AppShell><div className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-5 lg:px-8">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-2xl font-black tracking-tight">Customer follow-ups</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Card retry reminders and expected bank refunds. No WhatsApp messages or automatic financial postings.</p></div>
   <button type="button" onClick={()=>setCreateOpen(v=>!v)} className="app-primary-button min-h-11 rounded-xl px-4 font-bold">{createOpen?"Close entry":"+ New follow-up"}</button>
  </header>
  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
   {[
    ["Open tasks",summary.open],["Due / overdue",summary.due],["Cards to retry",summary.cardRetries],["Remaining to swipe",money(summary.remainingPlannedAmount)],["Expected refunds",money(summary.expectedRefundTotal)],
   ].map(([label,value])=><div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><p className="text-xs font-bold text-[var(--text-muted)]">{label}</p><p className="money mt-2 text-2xl font-black">{value}</p></div>)}
  </div>
  <p className="text-xs font-medium text-[var(--text-muted)]">Confirmed planned {money(summary.plannedSwipeTotal)} · Completed swipes linked {money(summary.swipedAmount)} · Remaining {money(summary.remainingPlannedAmount)}.</p>
  {summary.missingPlannedSwipeAmounts>0?<p className="text-xs font-bold text-amber-800">{summary.missingPlannedSwipeAmounts} open card retr{summary.missingPlannedSwipeAmounts===1?"y needs":"ies need"} a confirmed planned amount before the full total can be shown.</p>:null}
  <p className="text-xs text-[var(--text-muted)]">Example retry windows: 8–10 AM and 3–4 PM IST. New card retries automatically get the next eligible window; staff can reschedule. Expected refunds are NOT included in available bank/wallet balances. Reversed or invalidated receipt credits return to the open follow-up queue for review.</p>
  {error?<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>:null}
  {notice?<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>:null}
  {createOpen?<form onSubmit={create} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
   <div className="flex flex-wrap items-center gap-2">
    <label className="flex items-center gap-2 text-sm font-bold"><input type="radio" checked={kind==="CARD_RETRY"} onChange={()=>setKind("CARD_RETRY")}/>Card retry</label>
    <label className="ml-3 flex items-center gap-2 text-sm font-bold"><input type="radio" checked={kind==="BANK_REFUND"} onChange={()=>setKind("BANK_REFUND")}/>Pending bank/wallet refund</label>
   </div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-xs font-bold">Customer *<SearchableSelect className={input+" mt-1"} value={customerId} onChange={e=>{setCustomerId(e.target.value);setCardId("");}} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}{c.mobile?" · "+c.mobile:""}</option>)}</SearchableSelect></label>
    {kind==="CARD_RETRY"?<>
     <label className="text-xs font-bold">Saved card *<SearchableSelect className={input+" mt-1"} value={cardId} onChange={e=>setCardId(e.target.value)} required><option value="">Choose card</option>{selectedCustomer?.cards.map(c=><option key={c.id} value={c.id}>{c.bankName+" •••• "+c.lastFourDigits+(c.isActive?"":" (inactive)")}</option>)}</SearchableSelect></label>
     <label className="text-xs font-bold">Planned swipe amount (₹) *<input aria-label="Planned card swipe amount" type="number" min=".01" max="999999999" step=".01" required className={input+" mt-1"} value={plannedAmount} onChange={e=>setPlannedAmount(e.target.value)} placeholder="e.g. 60000"/></label>
     <label className="text-xs font-bold">Provider (optional)<SearchableSelect className={input+" mt-1"} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}}><option value="">Choose provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect></label>
     <label className="text-xs font-bold">Gateway (optional)<SearchableSelect className={input+" mt-1"} value={gatewayId} onChange={e=>setGatewayId(e.target.value)}><option value="">Choose gateway</option>{selectedProvider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName+(g.isActive?"":" (unsupported / inactive)")}</option>)}</SearchableSelect></label>
    </>:<>
     <label className="text-xs font-bold">Refund expected *<input type="number" min="0.01" step=".01" required className={input+" mt-1"} value={expectedAmount} onChange={e=>setExpectedAmount(e.target.value)} placeholder="₹ Amount"/></label>
     <label className="text-xs font-bold">Expected into bank/wallet *<SearchableSelect className={input+" mt-1"} value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Choose destination</option>{refundAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName+" · "+a.accountType}</option>)}</SearchableSelect></label>
    </>}
    <label className="text-xs font-bold">Transaction number (optional)<input className={input+" mt-1"} value={sourceTransactionNumber} onChange={e=>setSourceTransactionNumber(e.target.value)} maxLength={60} placeholder="Related original transaction"/></label>
    <label className="text-xs font-bold">Reference / complaint number<input className={input+" mt-1"} value={reference} onChange={e=>setReference(e.target.value)} maxLength={120} placeholder="Optional"/></label>
    <label className="text-xs font-bold">Override reminder time (IST)<input type="datetime-local" className={input+" mt-1"} value={createReminder} onChange={e=>setCreateReminder(e.target.value)}/></label>
   </div>
   <label className="block text-xs font-bold">Reason / next action *<textarea className={input+" mt-1 min-h-20 p-3"} value={reason} onChange={e=>setReason(e.target.value)} required maxLength={500} placeholder={kind==="CARD_RETRY"?"Card unsupported by gateway; retry in afternoon window":"Refund requested but not credited yet"}/></label>
   <label className="block text-xs font-bold">Internal notes<textarea className={input+" mt-1 min-h-16 p-3"} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} placeholder="Customer contacted, complaint reference, etc."/></label>
   {kind==="BANK_REFUND"?<p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">This only creates a pending refund follow-up. It will NOT increase the selected bank/wallet balance. When credited, first record or locate the actual account ledger credit, then verify it here. <Link href="/accounts" className="font-bold underline">Open Accounts</Link></p>:null}
   <button disabled={busy||!customerId||(kind==="CARD_RETRY"?!cardId||!plannedAmount||Number(plannedAmount)<=0:!accountId||Number(expectedAmount)<=0)} className="app-primary-button min-h-11 rounded-xl px-5 font-bold disabled:opacity-50">{busy?"Saving…":"Save pending follow-up"}</button>
  </form>:null}
  {customerSummaries.length>0&&filterKind!=="BANK_REFUND"&&(status==="OPEN"||status==="ALL")?<section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-black">Open card retries by customer</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Customer-wise pending cards, planned amounts, and missing amounts. Click a customer to focus their tasks.</p></div>{focusCustomerId?<button type="button" onClick={()=>setFocusCustomerId("")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">Show all customers</button>:null}</div>
   <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibleCustomers.map(group=><button key={group.customerId} type="button" aria-pressed={focusCustomerId===group.customerId} onClick={()=>{setFocusCustomerId(current=>current===group.customerId?"":group.customerId);setStatus("OPEN");setFilterKind("CARD_RETRY");}} className={"rounded-xl border p-3 text-left transition "+(focusCustomerId===group.customerId?"border-[var(--accent)] bg-[var(--accent-soft)]":"border-[var(--border)] bg-[var(--surface-soft)] hover:border-[var(--accent)]")}>
    <div className="flex items-start justify-between gap-2"><div><p className="text-base font-black">{group.customerName}</p><p className="text-[11px] text-[var(--text-muted)]">{group.customerMobile||"No mobile"}</p></div>{group.dueCount>0?<span className="text-xs font-bold text-rose-700">{group.dueCount} due</span>:null}</div>
    <p className="mt-2 text-xs font-bold">{group.cardCount} {group.cardCount===1?"card":"cards"} · {group.taskCount} open {group.taskCount===1?"entry":"entries"}</p>
    <p className="money mt-1 text-lg font-black">Remaining {money(group.remainingPlannedAmount)}</p>
    <p className="text-[11px] text-[var(--text-muted)]">Planned {money(group.plannedSwipeTotal)} · Swiped {money(group.swipedAmount)}</p>
    <p className="text-[11px] text-[var(--text-muted)]">{group.amountMissing>0?"Confirmed planned amount only · "+group.amountMissing+" amount"+(group.amountMissing===1?"":"s")+" missing":"Total planned swipe amount confirmed"}</p>
   </button>)}</div>
  </section>:null}
  <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
   <div className="flex flex-wrap items-center gap-2">
    <select aria-label="Follow-up status" className={input+" !w-auto"} value={status} onChange={e=>setStatus(e.target.value)}><option value="OPEN">Open</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option><option value="ALL">All</option></select>
    <select aria-label="Follow-up type" className={input+" !w-auto"} value={filterKind} onChange={e=>setFilterKind(e.target.value)}><option value="">All types</option><option value="CARD_RETRY">Card retry</option><option value="BANK_REFUND">Bank refund</option></select>
    <input aria-label="Search follow-ups" className={input+" min-w-[175px] flex-1"} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Customer, card, reason, reference…"/>
   </div>
   <p className="mt-3 text-xs text-[var(--text-muted)]">{visibleRows.length} shown · {total} matching{focusCustomerId?" · Customer filter active":""}. Due items are based on IST reminders and remain visible until explicitly resolved.</p>
   <div className="mt-3 space-y-3">
    {visibleRows.map(row=>{
     const due=row.status==="OPEN"&&!!row.nextReminderAt&&new Date(row.nextReminderAt).getTime()<=clock;
     const currentBalance=accounts.find(a=>a.id===row.account?.id)?.currentBalance;
     return <article key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
       <div><div className="flex flex-wrap items-center gap-2"><strong>{row.customer.fullName}</strong><span className="text-[11px] font-semibold text-[var(--text-muted)]">{row.kind==="CARD_RETRY"?"Card retry":"Expected refund"}</span>{due?<span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Due now</span>:row.status!=="OPEN"?<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{row.status.toLowerCase()}</span>:null}</div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{row.customer.mobile||"No mobile"}{row.card?" · "+row.card.bankName+" •••• "+row.card.lastFourDigits:""}</p>
        {row.kind==="CARD_RETRY"?<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
         <p className="text-xs">Provider <strong className="ml-1 text-base font-black tracking-tight text-[var(--text)]">{row.provider?.name||"Not selected"}</strong></p>
         <p className="text-xs">Gateway <strong className="ml-1 text-base font-black tracking-tight text-[var(--text)]">{row.gateway?.gatewayName||"Not selected"}</strong></p>
         <p className="text-xs">Planned <strong className="ml-1 text-base font-black tracking-tight">{row.plannedSwipeAmount!==null?money(row.plannedSwipeAmount):"Amount not entered"}</strong></p>
         {row.plannedSwipeAmount!==null?<p className="text-xs">Swiped <strong className="ml-1 text-base font-black">{money(row.swipedAmount)}</strong> · Remaining <strong className="ml-1 text-base font-black text-amber-700">{money(row.remainingPlannedAmount)}</strong></p>:null}
        </div>:null}
       </div>
       <div className="text-right text-xs"><p className={due?"font-bold text-rose-700":"text-[var(--text-muted)]"}>{row.needsReceiptReview?"Receipt reversal — reopen":row.status==="OPEN"?"Reminder "+istTime(row.nextReminderAt):"Updated / closed"}</p>{row.kind==="BANK_REFUND"?<p className="money mt-1 font-bold">Expected {money(row.expectedAmount)}</p>:null}</div>
      </div>
      <p className="mt-2 text-sm">{row.reason}</p>
      {row.kind==="BANK_REFUND"?<div className="mt-2 rounded-lg border border-[var(--border)] p-2 text-xs">
       <strong>{row.account?.accountName||"Destination account unavailable"}</strong><span className="ml-2 text-[var(--text-muted)]">Actual ledger balance: {currentBalance===undefined?"Open Accounts to verify":money(currentBalance)}</span>
       <p className="mt-1 font-semibold">{row.receiptVerified?"Refund matched to posted bank/wallet credit "+row.receiptTransaction?.transactionNumber:row.needsReceiptReview?"Previously linked receipt has been reversed or is no longer valid — REOPEN for review":"Expected refund not yet verified in ledger"}</p>
       <p className="mt-1 text-[var(--text-muted)]">Expected refund is informational; it is never added to the balance by this follow-up.</p>
      </div>:null}
      {row.kind==="CARD_RETRY"&&row.swipeAllocations?.length?<div className="mt-2 rounded-lg border border-[var(--border)] p-2 text-xs">
       <p className="font-bold">Linked partial swipes</p>
       {row.swipeAllocations.map(link=><p key={link.id} className="mt-1">
        <Link href={"/transactions/"+encodeURIComponent(link.transaction.id)} className="font-bold text-[var(--accent)] underline">{link.transaction.transactionNumber}</Link> · {money(link.amount)} · {link.transaction.status}
        {link.transaction.status!=="COMPLETED"?" · Not counted in remaining":""}
       </p>)}
      </div>:null}
      {row.reference?<p className="mt-2 text-xs">Reference: <strong>{row.reference}</strong></p>:null}
      {row.notes?<p className="mt-2 whitespace-pre-line text-xs text-[var(--text-muted)]">{row.notes}</p>:null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
       {row.status==="OPEN"?<>
        <button disabled={busy} type="button" onClick={()=>action(row,"REMIND_LATER")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">Remind next window</button>
        <button disabled={busy} type="button" onClick={()=>action(row,"NOTE")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">Add note</button>
        {row.kind==="CARD_RETRY"?<button disabled={busy} type="button" onClick={()=>action(row,"SET_AMOUNT")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">{row.plannedSwipeAmount===null?"Set planned amount":"Edit planned amount"}{row.plannedSwipeAmount===null&&amountSuggestion(row.reason)!==null?" · suggested "+money(amountSuggestion(row.reason)):""}</button>:null}
        {row.kind==="CARD_RETRY"?<>
         <Link href={"/transactions/card-swipe?customerId="+encodeURIComponent(row.customer.id)+(row.card?"&cardId="+encodeURIComponent(row.card.id):"")+"&followUpId="+encodeURIComponent(row.id)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--accent)]">Open Card Swipe · remaining {row.remainingPlannedAmount===null?"not set":money(row.remainingPlannedAmount)}</Link>
         <button disabled={busy||row.plannedSwipeAmount!==null&&Number(row.remainingPlannedAmount)>0.001} type="button" onClick={()=>action(row,"COMPLETE")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40" title={Number(row.remainingPlannedAmount)>0.001?"Complete remaining planned amount first":"Mark follow-up completed"}>Mark completed</button>
        </>:<button disabled={busy} type="button" onClick={()=>action(row,"VERIFY_REFUND")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Verify posted refund</button>}
        <button disabled={busy} type="button" onClick={()=>action(row,"CANCEL")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">Cancel</button>
        <div className="flex w-full flex-wrap items-center gap-2"><label className="text-xs font-bold">Reschedule (IST)<input aria-label={"Next reminder "+row.customer.fullName} type="datetime-local" className="app-control ml-2 min-h-9" value={editReminders[row.id]??dateInputIst(row.nextReminderAt)} onChange={e=>setEditReminders(prev=>({...prev,[row.id]:e.target.value}))}/></label><button disabled={busy||!editReminders[row.id]} type="button" onClick={()=>action(row,"SCHEDULE")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-40">Set reminder</button></div>
       </>:<button disabled={busy} type="button" onClick={()=>action(row,"REOPEN")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">Reopen</button>}
       <button type="button" onClick={()=>setExpanded(v=>v===row.id?null:row.id)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">Audit history</button>
      </div>
      {expanded===row.id?<div className="mt-3 border-t border-[var(--border)] pt-3"><p className="mb-2 text-xs font-bold">Follow-up history (latest first)</p>{selectedDetail?.id===row.id?selectedDetail.events?.map(ev=><p key={ev.id} className="border-b border-[var(--border)] py-2 text-xs"><strong>{ev.action.replaceAll("_"," ")}</strong> · {istTime(ev.createdAt)}{ev.note?" · "+ev.note:""}</p>):<p className="text-xs text-[var(--text-muted)]">Loading audit trail…</p>}</div>:null}
     </article>;
    })}
    {!visibleRows.length?<p className="py-10 text-center text-sm text-[var(--text-muted)]">No follow-ups match this filter.</p>:null}
   </div>
  </section>
 </div></AppShell>;
}
