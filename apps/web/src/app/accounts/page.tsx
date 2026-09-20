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
  CASH:"Shop cash",BANK:"Bank",UPI:"Bank",PROVIDER_WALLET:"Wallet",OWNER_CREDIT_CARD:"Credit card",
};
const typeOrder=["BANK","PROVIDER_WALLET","OWNER_CREDIT_CARD"];
function accountGroup(type:string){
  if(type==="BANK"||type==="UPI")return "BANK";
  if(type==="PROVIDER_WALLET")return "PROVIDER_WALLET";
  if(type==="OWNER_CREDIT_CARD")return "OWNER_CREDIT_CARD";
  return "INTERNAL";
}

function AccountIcon({type}:{type:string}){
  const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  if(type==="CASH")return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><path d="M4 7h16v11H4z"/><path d="M7 7V5h10v2"/><path d="M16 11h4v4h-4a2 2 0 0 1 0-4Z"/></svg>;
  if(type==="OWNER_CREDIT_CARD")return <svg viewBox="0 0 24 24" className="h-5 w-5" {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>;
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
  if(type==="CASH")return "bg-emerald-500";
  if(type==="UPI")return "bg-indigo-500";
  if(type==="PROVIDER_WALLET")return "bg-amber-500";
  if(type==="OWNER_CREDIT_CARD")return "bg-rose-500";
  return "bg-indigo-500";
}
function AccountModal({open,onClose,title,description,children}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode}){
  if(!open||typeof document==="undefined")return null;
  return createPortal(<div className="fixed inset-0 z-[500] flex items-end justify-center bg-slate-950/55 backdrop-blur-[5px] sm:items-center sm:p-5">
    <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close dialog"/>
    <section role="dialog" aria-modal="true" aria-label={title} onClick={(event)=>event.stopPropagation()} className="pointer-events-auto relative z-10 max-h-[92dvh] w-full overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-[26px]">
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
    if(initialType==="UPI")setListType("BANK");
    else if(initialType&&typeOrder.includes(initialType))setListType(initialType);
    let nextRole="";
    try{nextRole=JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"";setRole(nextRole);}catch{}
    if(nextRole)load(nextRole).catch((err)=>setError(err instanceof Error?err.message:"Failed to load accounts")).finally(()=>setLoading(false));
    else setLoading(false);
  },[]);
  const admin=role==="OWNER"||role==="ADMIN";
  const visibleItems=useMemo(()=>items.filter((account)=>accountGroup(account.accountType)!=="INTERNAL"),[items]);
  const counts=useMemo(()=>Object.fromEntries(["ALL",...typeOrder].map((key)=>[
    key,key==="ALL"?visibleItems.length:visibleItems.filter((account)=>accountGroup(account.accountType)===key).length,
  ])),[visibleItems]);
  const filteredItems=useMemo(()=>{
    const query=search.trim().toLowerCase();
    return visibleItems.filter((account)=>{
      const group=accountGroup(account.accountType);
      if(listType!=="ALL"&&group!==listType)return false;
      if(!query)return true;
      return [account.accountName,account.bankName,account.accountReference,account.lastFourDigits,typeLabels[account.accountType]]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    }).sort((a,b)=>{
      if(a.isActive!==b.isActive)return a.isActive?-1:1;
      const typeDiff=typeOrder.indexOf(accountGroup(a.accountType))-typeOrder.indexOf(accountGroup(b.accountType));
      return typeDiff||a.accountName.localeCompare(b.accountName);
    });
  },[visibleItems,listType,search]);
  const totals=useMemo(()=>({
    liquid:visibleItems.filter((a)=>["BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)).reduce((sum,a)=>sum+a.currentBalance,0),
    cards:visibleItems.filter((a)=>a.accountType==="OWNER_CREDIT_CARD").reduce((sum,a)=>sum+a.currentBalance,0),
    active:visibleItems.filter((a)=>a.isActive).length,
    bank:visibleItems.filter((a)=>["BANK","UPI"].includes(a.accountType)).reduce((sum,a)=>sum+a.currentBalance,0),
    wallet:visibleItems.filter((a)=>a.accountType==="PROVIDER_WALLET").reduce((sum,a)=>sum+a.currentBalance,0),
  }),[visibleItems]);
  function resetAdd(){
    setName("");setType("BANK");setUsage("BUSINESS");setOpening("0");setLimit("");
    setBank("");setReference("");setLast4("");
  }
  async function submit(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    try{
      if(type==="PROVIDER_WALLET"){
        const providerName=name.trim().replace(/\s+wallet$/i,"");
        await apiFetch("/providers",{method:"POST",body:JSON.stringify({name:providerName,providerType:"WALLET"})});
      }else{
        await apiFetch("/accounts",{method:"POST",body:JSON.stringify({
          accountName:name.trim(),accountType:type,
          accountNature:type==="OWNER_CREDIT_CARD"?"LIABILITY":"ASSET",
          usageType:usage,openingBalance:Number(opening||0),
          creditLimit:type==="OWNER_CREDIT_CARD"&&limit?Number(limit):undefined,
          bankName:bank.trim()||undefined,accountReference:reference.trim()||undefined,
          lastFourDigits:last4.trim()||undefined,
        })});
      }
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
  const typeTabs=[["ALL","All"],["BANK","Banks"],["PROVIDER_WALLET","Wallets"],["OWNER_CREDIT_CARD","Credit cards"]];
  return <AppShell><PageFrame width="max-w-7xl">
    <SectionHeading title="Accounts" action={admin?<button type="button" onClick={()=>{resetAdd();setAdding(true);}} className="app-primary-button inline-flex min-h-10 items-center gap-2 px-4 text-xs font-bold"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add account</button>:undefined}/>
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

    <div className="grid grid-cols-3 gap-2.5">
      <Surface className="relative overflow-hidden p-3.5 sm:p-4"><span className="absolute inset-x-0 top-0 h-1 bg-indigo-500"/><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.08em] text-indigo-600">Funds</p><p className="money mt-1 text-lg font-black sm:text-2xl">{money(totals.liquid)}</p></div><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16v11H4z"/><path d="M16 11h4v4h-4a2 2 0 0 1 0-4Z"/></svg></span></div></Surface>
      <Surface className="relative overflow-hidden p-3.5 sm:p-4"><span className="absolute inset-x-0 top-0 h-1 bg-rose-500"/><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.08em] text-rose-600">Card due</p><p className="money mt-1 text-lg font-black text-rose-600 sm:text-2xl">{money(totals.cards)}</p></div><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg></span></div></Surface>
      <Surface className="relative overflow-hidden p-3.5 sm:p-4"><span className="absolute inset-x-0 top-0 h-1 bg-emerald-500"/><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.08em] text-emerald-700">Active</p><p className="mt-1 text-lg font-black sm:text-2xl">{totals.active}<span className="ml-1 text-xs font-semibold text-[var(--text-muted)]">/ {visibleItems.length}</span></p></div><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 12 3 3 7-7"/><circle cx="12" cy="12" r="9"/></svg></span></div></Surface>
    </div>

    <Surface className="overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
        {[
          ["Banks",totals.bank],["Wallets",totals.wallet],["Credit cards",totals.cards],
        ].map(([label,value])=><div key={String(label)} className="px-3 py-3 sm:px-4">
          <p className="truncate text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)] sm:text-[10px]">{label}</p>
          <p className="money mt-1 truncate text-xs font-extrabold sm:text-sm">{money(Number(value))}</p>
        </div>)}
      </div>
    </Surface>

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

    {filteredItems.length?<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {filteredItems.map((account)=>{
        const meta=metaLine(account);
        const tone=accountTone(account.accountType);
        const cardUsed=account.accountType==="OWNER_CREDIT_CARD"&&account.creditLimit
          ?Math.min(100,Math.max(0,Math.abs(account.currentBalance)/account.creditLimit*100)):0;
        return <Surface key={account.id} className={"group relative flex min-h-[164px] flex-col overflow-hidden border border-[var(--border)] p-3 shadow-[0_6px_20px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_20%,var(--border))] hover:shadow-[0_12px_28px_rgba(15,23,42,.07)] sm:min-h-[176px] sm:p-4 "+(!account.isActive?"opacity-60":"")}>
          <div className="flex items-start gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)] sm:h-10 sm:w-10"><AccountIcon type={account.accountType}/></span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-black leading-[1.25] tracking-[-.015em] sm:text-[14px]">{account.accountName}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={"h-1.5 w-1.5 shrink-0 rounded-full "+tone}/>
                <span className="truncate text-[9px] font-extrabold uppercase tracking-[.09em] text-[var(--text-muted)]">{typeLabels[account.accountType]??account.accountType}</span>
              </div>
            </div>
            {!account.isActive?<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold uppercase text-slate-500">Off</span>:null}
          </div>
          <div className="mt-3">
            <p className="text-[9px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{account.accountType==="OWNER_CREDIT_CARD"?"Outstanding":"Balance"}</p>
            <p className={"money mt-0.5 text-xl font-black tracking-[-.04em] sm:text-[1.45rem] "+(account.accountType==="OWNER_CREDIT_CARD"&&account.currentBalance>0?"text-rose-600":"")}>{money(account.currentBalance)}</p>
            {meta?<p className="mt-1 truncate text-[10px] font-semibold text-[var(--text-muted)]">{meta}</p>:null}
          </div>
          {account.accountType==="OWNER_CREDIT_CARD"&&account.creditLimit!==null?<div className="relative mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-rose-100"><div className="h-full rounded-full bg-rose-500" style={{width:cardUsed+"%"}}/></div>
            <div className="mt-1.5 flex justify-between gap-2 text-[10px] font-semibold text-[var(--text-muted)]"><span>{cardUsed.toFixed(0)}% used</span><span>{money(account.availableCredit??0)} free</span></div>
          </div>:null}
          <div className="relative z-10 mt-auto flex items-center gap-2 border-t border-[var(--border)] pt-2.5">
            <Link href={"/accounts/"+account.id} className="flex min-h-9 flex-1 items-center justify-center rounded-lg bg-[var(--accent-soft)] px-2 text-[10px] font-extrabold text-[var(--accent)] transition hover:brightness-[.98]">Ledger</Link>
            {admin&&account.accountType!=="PROVIDER_WALLET"?<button type="button" onClick={(event)=>{event.preventDefault();event.stopPropagation();setToggleTarget(null);if(account.isActive)beginEdit(account);else setToggleTarget(account);}} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]" aria-label={account.isActive?"Edit "+account.accountName:"Reactivate "+account.accountName}>
              {account.isActive?<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>:<span className="text-sm">↻</span>}
            </button>:null}
          </div>
        </Surface>;
      })}
    </div>:<EmptyState title="No accounts found" description={search||listType!=="ALL"?"Try another search or filter.":"No accounts configured."}/>}
    <AccountModal open={adding} onClose={()=>setAdding(false)} title="Add account">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">{type==="PROVIDER_WALLET"?"Wallet name":"Name"}</span><input className="app-control" value={name} onChange={(e)=>setName(e.target.value)} placeholder={type==="PROVIDER_WALLET"?"e.g. ECPay":"e.g. HDFC Current"} required/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Type</span><select className="app-control" value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="BANK">Bank</option><option value="OWNER_CREDIT_CARD">Credit card</option><option value="PROVIDER_WALLET">Wallet</option>
          </select></label>
          {type!=="PROVIDER_WALLET"?<><label className="block"><span className="mb-1.5 block text-sm font-semibold">Use</span><select className="app-control" value={usage} onChange={(e)=>setUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Opening balance</span><input className="app-control" type="number" min="0" step="0.01" inputMode="decimal" value={opening} onChange={(e)=>setOpening(e.target.value)}/></label></>:null}
        </div>
        {type!=="PROVIDER_WALLET"?<div className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Bank</span><input className="app-control" value={bank} onChange={(e)=>setBank(e.target.value)} placeholder="Optional"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Reference</span><input className="app-control" value={reference} onChange={(e)=>setReference(e.target.value)} placeholder="Optional"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Last 4 digits</span><input className="app-control" inputMode="numeric" maxLength={4} value={last4} onChange={(e)=>setLast4(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Optional"/></label>
          {type==="OWNER_CREDIT_CARD"?<label className="block"><span className="mb-1.5 block text-sm font-semibold">Credit limit</span><input className="app-control" type="number" min="0.01" step="0.01" inputMode="decimal" value={limit} onChange={(e)=>setLimit(e.target.value)} required/></label>:null}
        </div>:<p className="rounded-xl bg-[var(--surface-soft)] px-3 py-2.5 text-xs text-[var(--text-muted)]">A wallet account will be created automatically for this provider.</p>}
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
