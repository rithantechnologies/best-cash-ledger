"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { createPortal } from "react-dom";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={
  id:string;accountName:string;accountType:string;accountNature:string;usageType:string;
  bankName:string|null;accountReference:string|null;lastFourDigits:string|null;
  currentBalance:number;creditLimit:number|null;availableCredit:number|null;isActive:boolean;
};
type RawAccount=Omit<Account,"currentBalance"|"availableCredit"|"creditLimit"> & {
  openingBalance:string;creditLimit:string|null;
};
type BalanceAccount=Pick<Account,
  "id"|"currentBalance"|"availableCredit"|"creditLimit"|"isActive"|"usageType"|
  "bankName"|"accountReference"|"lastFourDigits"
>;
const money=(value:number|string)=>new Intl.NumberFormat("en-IN",{
  style:"currency",currency:"INR",maximumFractionDigits:0,
}).format(Number(value||0));
const typeLabels:Record<string,string>={
  CASH:"Cash",BANK:"Bank",UPI:"UPI",PROVIDER_WALLET:"Wallet",OWNER_CREDIT_CARD:"Credit card",
};
const typeOrder=["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"];

function AccountIcon({type}:{type:string}){
  const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  if(type==="CASH")return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><path d="M4 7h16v11H4z"/><path d="M7 7V5h10v2"/><path d="M16 11h4v4h-4a2 2 0 0 1 0-4Z"/></svg>;
  if(type==="OWNER_CREDIT_CARD")return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>;
  if(type==="UPI")return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><path d="M5 7h14M7 4h10M6 11h12v9H6z"/><path d="M9 14h6M9 17h4"/></svg>;
  if(type==="PROVIDER_WALLET")return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><path d="M4 6h14a2 2 0 0 1 2 2v11H4z"/><path d="M4 6a2 2 0 0 1 2-2h10v2"/><path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></svg>;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><path d="M3 10h18M5 10v9M9 10v9M15 10v9M19 10v9M3 19h18M12 3l9 5H3z"/></svg>;
}
function metaLine(account:Account){
  const parts=[
    account.bankName,
    account.lastFourDigits?"•••• "+account.lastFourDigits:null,
    account.accountReference&&!account.lastFourDigits?account.accountReference:null,
  ].filter(Boolean);
  return parts.join(" · ");
}
function accountTone(type:string){
  if(type==="CASH")return {bar:"bg-emerald-500",glow:"bg-emerald-400/10",icon:"bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",soft:"bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"};
  if(type==="UPI")return {bar:"bg-violet-500",glow:"bg-violet-400/10",icon:"bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",soft:"bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"};
  if(type==="PROVIDER_WALLET")return {bar:"bg-amber-500",glow:"bg-amber-400/10",icon:"bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",soft:"bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"};
  if(type==="OWNER_CREDIT_CARD")return {bar:"bg-rose-500",glow:"bg-rose-400/10",icon:"bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",soft:"bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"};
  return {bar:"bg-indigo-500",glow:"bg-indigo-400/10",icon:"bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",soft:"bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"};
}
function AccountModal({open,onClose,title,description,children}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode}){
  if(!open||typeof document==="undefined")return null;
  return createPortal(<div className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/50 backdrop-blur-[4px] sm:items-center sm:p-5">
    <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close dialog"/>
    <section role="dialog" aria-modal="true" aria-label={title} className="relative z-10 max-h-[92dvh] w-full overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-[26px]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="min-w-0"><h3 className="text-lg font-black tracking-[-.025em]">{title}</h3>{description?<p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>:null}</div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-xl text-[var(--text-muted)]" aria-label="Close">×</button>
      </div>
      <div className="max-h-[72dvh] overflow-y-auto p-5 sm:p-6">{children}</div>
    </section>
  </div>,document.body);
}

export default function AccountsPage(){
  const [items,setItems]=useState<Account[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[role,setRole]=useState("");
  const [listType,setListType]=useState("ALL"),[search,setSearch]=useState("");
  const [adding,setAdding]=useState(false),[editing,setEditing]=useState<Account|null>(null),[toggleTarget,setToggleTarget]=useState<Account|null>(null);
  const [name,setName]=useState(""),[type,setType]=useState("BANK"),[usage,setUsage]=useState("BUSINESS");
  const [opening,setOpening]=useState("0"),[limit,setLimit]=useState(""),[bank,setBank]=useState(""),[reference,setReference]=useState(""),[last4,setLast4]=useState("");
  const [editName,setEditName]=useState(""),[editUsage,setEditUsage]=useState("BUSINESS");
  const [editBank,setEditBank]=useState(""),[editRef,setEditRef]=useState(""),[editLast4,setEditLast4]=useState(""),[editLimit,setEditLimit]=useState("");
  const [saving,setSaving]=useState(false);
  const load=useCallback(async(currentRole=role)=>{
    const admin=currentRole==="OWNER"||currentRole==="ADMIN";
    if(admin){
      const [raw,balances]=await Promise.all([
        apiFetch<RawAccount[]>("/accounts"),
        apiFetch<BalanceAccount[]>("/dashboard/accounts"),
      ]);
      const map=new Map(balances.map((row)=>[row.id,row]));
      setItems(raw.map((account)=>{
        const balance=map.get(account.id);
        return {
          ...account,
          currentBalance:balance?.currentBalance??Number(account.openingBalance||0),
          creditLimit:balance?.creditLimit??(account.creditLimit?Number(account.creditLimit):null),
          availableCredit:balance?.availableCredit??null,
          isActive:balance?.isActive??account.isActive,
        };
      }));
    }else setItems(await apiFetch<Account[]>("/dashboard/accounts"));
  },[role]);

  useEffect(()=>{
    const initialType=new URLSearchParams(window.location.search).get("type");
    if(initialType&&typeOrder.includes(initialType))setListType(initialType);
    let nextRole="";
    try{nextRole=JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"";setRole(nextRole);}catch{}
    if(nextRole)load(nextRole).catch((err)=>setError(err instanceof Error?err.message:"Failed to load accounts")).finally(()=>setLoading(false));
    else setLoading(false);
  },[]);
  const admin=role==="OWNER"||role==="ADMIN";
  const hasCash=items.some((account)=>account.accountType==="CASH");
  const counts=useMemo(()=>Object.fromEntries(["ALL",...typeOrder].map((key)=>[
    key,key==="ALL"?items.length:items.filter((account)=>account.accountType===key).length,
  ])),[items]);
  const filteredItems=useMemo(()=>{
    const query=search.trim().toLowerCase();
    return items.filter((account)=>{
      if(listType!=="ALL"&&account.accountType!==listType)return false;
      if(!query)return true;
      return [account.accountName,account.bankName,account.accountReference,account.lastFourDigits,typeLabels[account.accountType]]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    }).sort((a,b)=>{
      if(a.isActive!==b.isActive)return a.isActive?-1:1;
      const typeDiff=typeOrder.indexOf(a.accountType)-typeOrder.indexOf(b.accountType);
      return typeDiff||a.accountName.localeCompare(b.accountName);
    });
  },[items,listType,search]);
  const totals=useMemo(()=>({
    liquid:items.filter((a)=>["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)).reduce((sum,a)=>sum+a.currentBalance,0),
    cards:items.filter((a)=>a.accountType==="OWNER_CREDIT_CARD").reduce((sum,a)=>sum+a.currentBalance,0),
    active:items.filter((a)=>a.isActive).length,
  }),[items]);
  function resetAdd(){
    setName("");setType("BANK");setUsage("BUSINESS");setOpening("0");setLimit("");
    setBank("");setReference("");setLast4("");
  }
  async function submit(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    try{
      await apiFetch("/accounts",{method:"POST",body:JSON.stringify({
        accountName:name.trim(),accountType:type,
        accountNature:type==="OWNER_CREDIT_CARD"?"LIABILITY":"ASSET",
        usageType:usage,openingBalance:Number(opening||0),
        creditLimit:type==="OWNER_CREDIT_CARD"&&limit?Number(limit):undefined,
        bankName:bank.trim()||undefined,accountReference:reference.trim()||undefined,
        lastFourDigits:last4.trim()||undefined,
      })});
      resetAdd();setAdding(false);await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to create account");}
    finally{setSaving(false);}
  }
  function beginEdit(account:Account){
    setEditing(account);setEditName(account.accountName);setEditUsage(account.usageType);
    setEditBank(account.bankName||"");setEditRef(account.accountReference||"");
    setEditLast4(account.lastFourDigits||"");setEditLimit(account.creditLimit===null?"":String(account.creditLimit));
    setError("");
  }
  async function saveEdit(event:FormEvent){
    event.preventDefault();if(!editing)return;
    setSaving(true);setError("");
    try{
      await apiFetch("/accounts/"+editing.id,{method:"PATCH",body:JSON.stringify({
        accountName:editName.trim(),usageType:editUsage,
        bankName:editBank.trim()||null,accountReference:editRef.trim()||null,
        lastFourDigits:editLast4.trim()||null,
        creditLimit:editing.accountType==="OWNER_CREDIT_CARD"&&editLimit.trim()?Number(editLimit):undefined,
      })});
      setEditing(null);await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to update account");}
    finally{setSaving(false);}
  }
  async function confirmToggle(){
    if(!toggleTarget)return;setSaving(true);setError("");
    try{
      await apiFetch("/accounts/"+toggleTarget.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!toggleTarget.isActive})});
      setToggleTarget(null);setEditing(null);await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to change account status");}
    finally{setSaving(false);}
  }

  if(loading)return <AppShell><PageLoader label="Loading accounts…"/></AppShell>;
  const typeTabs=[["ALL","All"],["BANK","Bank"],["UPI","UPI"],["PROVIDER_WALLET","Wallets"],["CASH","Cash"],["OWNER_CREDIT_CARD","Cards"]];
  return <AppShell><PageFrame width="max-w-7xl">
    <SectionHeading title="Accounts" action={admin?<button type="button" onClick={()=>{resetAdd();setAdding(true);}} className="app-primary-button inline-flex min-h-10 items-center gap-2 px-4 text-xs font-bold"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add account</button>:undefined}/>
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

    <div className="grid grid-cols-3 gap-2.5">
      <Surface className="relative overflow-hidden p-3.5 sm:p-4"><span className="absolute inset-x-0 top-0 h-1 bg-indigo-500"/><div className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-indigo-400/10"/><p className="relative text-[10px] font-bold uppercase tracking-[.08em] text-indigo-600">Funds</p><p className="money relative mt-1 text-lg font-black sm:text-2xl">{money(totals.liquid)}</p></Surface>
      <Surface className="relative overflow-hidden p-3.5 sm:p-4"><span className="absolute inset-x-0 top-0 h-1 bg-rose-500"/><div className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-rose-400/10"/><p className="relative text-[10px] font-bold uppercase tracking-[.08em] text-rose-600">Card due</p><p className="money relative mt-1 text-lg font-black text-rose-600 sm:text-2xl">{money(totals.cards)}</p></Surface>
      <Surface className="relative overflow-hidden p-3.5 sm:p-4"><span className="absolute inset-x-0 top-0 h-1 bg-emerald-500"/><div className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-emerald-400/10"/><p className="relative text-[10px] font-bold uppercase tracking-[.08em] text-emerald-700">Active</p><p className="relative mt-1 text-lg font-black sm:text-2xl">{totals.active}<span className="ml-1 text-xs font-semibold text-[var(--text-muted)]">/ {items.length}</span></p></Surface>
    </div>

    <Surface className="p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          <input className="app-control !pl-10" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search accounts"/>
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {typeTabs.map(([value,label])=><button type="button" key={value} onClick={()=>setListType(value)}
            className={"min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold transition "+(listType===value?"bg-[var(--accent)] text-white":"bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text)]")}>
            {label}<span className={"ml-1.5 "+(listType===value?"text-white/70":"text-[var(--text-muted)]")}>{counts[value]??0}</span>
          </button>)}
        </div>
      </div>
    </Surface>

    {filteredItems.length?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {filteredItems.map((account)=>{
        const meta=metaLine(account);
        const tone=accountTone(account.accountType);
        const cardUsed=account.accountType==="OWNER_CREDIT_CARD"&&account.creditLimit
          ?Math.min(100,Math.max(0,Math.abs(account.currentBalance)/account.creditLimit*100)):0;
        return <Surface key={account.id} className={"group relative flex min-h-[198px] flex-col overflow-hidden p-4 shadow-[0_8px_24px_rgba(15,23,42,.045)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,.08)] "+(!account.isActive?"opacity-60":"")}>
          <span className={"absolute inset-x-0 top-0 h-1 "+tone.bar}/>
          <span className={"pointer-events-none absolute -right-9 -top-9 h-28 w-28 rounded-full blur-2xl "+tone.glow}/>
          <div className="relative flex items-start gap-3 pt-1">
            <span className={"grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-sm "+tone.icon}><AccountIcon type={account.accountType}/></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><p className="truncate text-[15px] font-black tracking-[-.02em]">{account.accountName}</p>{!account.isActive?<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] text-slate-500">Off</span>:null}</div>
              <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[.11em] text-[var(--text-muted)]">{typeLabels[account.accountType]??account.accountType}</p>
            </div>
            <span className={"rounded-full px-2.5 py-1 text-[10px] font-bold capitalize "+tone.soft}>{account.usageType.toLowerCase()}</span>
          </div>
          <div className="relative mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{account.accountType==="OWNER_CREDIT_CARD"?"Outstanding":"Balance"}</p>
            <p className={"money mt-1 text-[1.65rem] font-black tracking-[-.045em] "+(account.accountType==="OWNER_CREDIT_CARD"&&account.currentBalance>0?"text-rose-600":"")}>{money(account.currentBalance)}</p>
            {meta?<p className="mt-1.5 truncate text-xs font-semibold text-[var(--text-muted)]">{meta}</p>:null}
          </div>
          {account.accountType==="OWNER_CREDIT_CARD"&&account.creditLimit!==null?<div className="relative mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-rose-100"><div className="h-full rounded-full bg-rose-500" style={{width:cardUsed+"%"}}/></div>
            <div className="mt-1.5 flex justify-between gap-2 text-[10px] font-semibold text-[var(--text-muted)]"><span>{cardUsed.toFixed(0)}% used</span><span>{money(account.availableCredit??0)} free</span></div>
          </div>:null}
          <div className="relative mt-auto flex items-center gap-2 border-t border-[var(--border)] pt-3">
            <Link href={"/accounts/"+account.id} className={"flex min-h-9 flex-1 items-center justify-center rounded-xl px-3 text-xs font-extrabold transition "+tone.soft}>Ledger <span className="ml-1">→</span></Link>
            {admin&&account.accountType!=="PROVIDER_WALLET"?<button type="button" onClick={()=>account.isActive?beginEdit(account):setToggleTarget(account)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]" aria-label={account.isActive?"Edit "+account.accountName:"Reactivate "+account.accountName}>
              {account.isActive?<><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>Edit</>:<><span className="text-sm">↻</span>Reactivate</>}
            </button>:null}
          </div>
        </Surface>;
      })}
    </div>:<EmptyState title="No accounts found" description={search||listType!=="ALL"?"Try another search or filter.":"No accounts configured."}/>}
    <AccountModal open={adding} onClose={()=>setAdding(false)} title="Add account">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Name</span><input className="app-control" value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. HDFC Current" required/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Type</span><select className="app-control" value={type} onChange={(e)=>setType(e.target.value)}>
            {!hasCash?<option value="CASH">Cash</option>:null}<option value="BANK">Bank</option><option value="UPI">UPI</option><option value="OWNER_CREDIT_CARD">Credit card</option>
          </select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Use</span><select className="app-control" value={usage} onChange={(e)=>setUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Opening balance</span><input className="app-control" type="number" min="0" step="0.01" inputMode="decimal" value={opening} onChange={(e)=>setOpening(e.target.value)}/></label>
        </div>
        {type!=="CASH"?<div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Bank / provider</span><input className="app-control" value={bank} onChange={(e)=>setBank(e.target.value)} placeholder="Optional"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Reference</span><input className="app-control" value={reference} onChange={(e)=>setReference(e.target.value)} placeholder="Account / UPI reference"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Last 4 digits</span><input className="app-control" inputMode="numeric" maxLength={4} value={last4} onChange={(e)=>setLast4(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Optional"/></label>
          {type==="OWNER_CREDIT_CARD"?<label className="block"><span className="mb-1.5 block text-sm font-semibold">Credit limit</span><input className="app-control" type="number" min="0.01" step="0.01" inputMode="decimal" value={limit} onChange={(e)=>setLimit(e.target.value)} required/></label>:null}
        </div>:null}
        <button disabled={saving} className="app-primary-button min-h-11 w-full px-4 text-sm font-bold disabled:opacity-40">{saving?"Saving…":"Add account"}</button>
      </form>
    </AccountModal>
    <AccountModal open={Boolean(editing)} onClose={()=>setEditing(null)} title={editing?.accountName??"Edit account"} description={editing?typeLabels[editing.accountType]:undefined}>
      {editing?<form onSubmit={saveEdit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Name</span><input className="app-control" value={editName} onChange={(e)=>setEditName(e.target.value)} required/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Use</span><select className="app-control" value={editUsage} onChange={(e)=>setEditUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select></label>
          {editing.accountType!=="CASH"?<><label className="block"><span className="mb-1.5 block text-sm font-semibold">Bank / provider</span><input className="app-control" value={editBank} onChange={(e)=>setEditBank(e.target.value)}/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Reference</span><input className="app-control" value={editRef} onChange={(e)=>setEditRef(e.target.value)}/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Last 4 digits</span><input className="app-control" inputMode="numeric" maxLength={4} value={editLast4} onChange={(e)=>setEditLast4(e.target.value.replace(/\D/g,"").slice(0,4))}/></label>
          {editing.accountType==="OWNER_CREDIT_CARD"?<label className="block"><span className="mb-1.5 block text-sm font-semibold">Credit limit</span><input className="app-control" type="number" min="0.01" step="0.01" value={editLimit} onChange={(e)=>setEditLimit(e.target.value)} required/></label>:null}</>:null}
        </div>
        <button disabled={saving} className="app-primary-button min-h-11 w-full px-4 text-sm font-bold disabled:opacity-40">{saving?"Saving…":"Save"}</button>
        <button type="button" onClick={()=>{setToggleTarget(editing);setEditing(null);}} className="min-h-10 w-full rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50">Deactivate account</button>
      </form>:null}
    </AccountModal>
    <AccountModal open={Boolean(toggleTarget)} onClose={()=>setToggleTarget(null)} title={toggleTarget?.isActive?"Deactivate account":"Reactivate account"}>
      <p className="text-sm leading-6 text-[var(--text-muted)]"><strong className="text-[var(--text)]">{toggleTarget?.accountName}</strong>{toggleTarget?.isActive?" must have a zero balance before it can be deactivated.":" will be available for new transactions again."}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={()=>setToggleTarget(null)} className="app-secondary-button min-h-10 px-3 text-xs font-bold">Cancel</button>
        <button type="button" disabled={saving} onClick={confirmToggle} className={"min-h-10 rounded-xl px-3 text-xs font-bold text-white disabled:opacity-40 "+(toggleTarget?.isActive?"bg-rose-600":"bg-[var(--accent)]")}>{saving?"Saving…":toggleTarget?.isActive?"Deactivate":"Reactivate"}</button>
      </div>
    </AccountModal>
  </PageFrame></AppShell>;
}
