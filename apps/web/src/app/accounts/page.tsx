"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import Link from "next/link";
import { createPortal } from "react-dom";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, SectionHeading, Surface } from "@/components/ui";
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
type AvailabilitySummary={
  availableFunds:number;
  currentAvailability:number;
  creditCardAvailable:number;
  creditCardOutstanding:number;
};
type CreatedProvider={id:string};
const money=(value:number|string)=>new Intl.NumberFormat("en-IN",{
  style:"currency",currency:"INR",maximumFractionDigits:0,
}).format(Number(value||0));
function words(value:string){
  return value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase());
}
const typeLabels:Record<string,string>={
  CASH:"Cash drawer / reserve",BANK:"Bank",UPI:"Bank",PROVIDER_WALLET:"Wallet",OWNER_CREDIT_CARD:"Credit card",
};
const typeOrder=["CASH","BANK","PROVIDER_WALLET","OWNER_CREDIT_CARD"];
function accountGroup(type:string){
  if(type==="CASH")return "CASH";
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
function AccountArtwork({account}:{account:Account}){
  const group=accountGroup(account.accountType);
  const bankLike=group==="BANK";
  const wallet=group==="PROVIDER_WALLET";
  const credit=group==="OWNER_CREDIT_CARD";
  const visual=bankLike
    ?{wrap:"from-sky-50 via-blue-50 to-indigo-100 text-sky-950",badge:"bg-white/75 text-sky-700 ring-sky-200/80",icon:"bg-white/85 text-blue-700 ring-blue-200/70",glow:"bg-blue-300/35"}
    :wallet
      ?{wrap:"from-emerald-50 via-teal-50 to-cyan-100 text-emerald-950",badge:"bg-white/75 text-emerald-700 ring-emerald-200/80",icon:"bg-white/85 text-emerald-700 ring-emerald-200/70",glow:"bg-emerald-300/35"}
      :{wrap:"from-violet-600 via-indigo-600 to-blue-700 text-white",badge:"bg-white/15 text-white ring-white/20",icon:"bg-white/15 text-white ring-white/20",glow:"bg-fuchsia-300/20"};
  const name=account.bankName||account.accountName;
  const monogram=(name.trim().charAt(0)||"A").toUpperCase();
  return <div className={"relative overflow-hidden rounded-[18px] bg-gradient-to-br p-3.5 "+visual.wrap}>
    <span className={"absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl "+visual.glow}/>
    <span className="absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"/>
    <div className="relative flex items-start justify-between gap-3">
      <span className={"grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 backdrop-blur "+visual.icon}>
        {bankLike?<AccountIcon type="BANK"/>:wallet?<AccountIcon type="PROVIDER_WALLET"/>:<AccountIcon type="OWNER_CREDIT_CARD"/>}
      </span>
      <span className={"rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[.12em] ring-1 backdrop-blur "+visual.badge}>{credit?"Credit":wallet?"Wallet":"Bank"}</span>
    </div>
    <div className="relative mt-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className={"truncate text-[11px] font-bold "+(credit?"text-white/75":"opacity-65")}>{bankLike?(account.bankName||"Bank account"):wallet?"Provider wallet":"Owner card"}</p>
        <p className="mt-0.5 truncate text-sm font-black tracking-[-.02em]">{account.accountName}</p>
      </div>
      {account.lastFourDigits?<span className={"shrink-0 font-mono text-[11px] font-bold tracking-[.16em] "+(credit?"text-white/85":"opacity-70")}>•••• {account.lastFourDigits}</span>:<span className={"grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ring-1 "+visual.badge}>{monogram}</span>}
    </div>
  </div>;
}
function metaLine(account:Account){
  const parts=[
    account.bankName,
    account.lastFourDigits?"•••• "+account.lastFourDigits:null,
    account.accountReference&&!account.lastFourDigits?account.accountReference:null,
  ].filter(Boolean);
  return parts.join(" · ");
}
function AccountModal({open,onClose,title,description,children}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode}){
  if(!open||typeof document==="undefined")return null;
  return createPortal(<div className="fixed inset-0 z-[500] flex items-end justify-center bg-slate-950/55 backdrop-blur-[5px] sm:items-center sm:p-5">
    <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close dialog"/>
    <section role="dialog" aria-modal="true" aria-label={title} onClick={(event)=>event.stopPropagation()} className="pointer-events-auto relative z-10 max-h-[92dvh] w-full overflow-hidden rounded-t-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-[20px]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="min-w-0"><h3 className="text-lg font-bold tracking-[-.02em]">{title}</h3>{description?<p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>:null}</div>
        <button type="button" onClick={onClose} title="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-xl text-[var(--text-muted)]" aria-label="Close">×</button>
      </div>
      <div className="max-h-[72dvh] overflow-y-auto p-5 sm:p-6">{children}</div>
    </section>
  </div>,document.body);
}


function AccountsSkeleton(){
  return <AppShell><PageFrame width="max-w-7xl" className="ui-preview accounts-preview">
    <div className="flex items-end justify-between gap-3">
      <div className="space-y-2">
        <div className="ui-shimmer h-7 w-32 rounded-lg"/>
        <div className="ui-shimmer h-4 w-64 max-w-[70vw] rounded-md"/>
      </div>
      <div className="ui-shimmer h-10 w-28 rounded-xl"/>
    </div>
    <Surface className="overflow-hidden">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="ui-shimmer h-3 w-24 rounded"/>
        <div className="ui-shimmer h-10 w-48 rounded-lg"/>
        <div className="ui-shimmer h-3 w-56 rounded"/>
      </div>
      <div className="border-t border-[var(--border)] p-3 sm:p-4">
        <div className="ui-shimmer h-11 w-full rounded-xl"/>
        <div className="mt-3 flex gap-2">
          {[0,1,2,3].map((i)=><div key={i} className="ui-shimmer h-10 w-20 rounded-lg"/>)}
        </div>
      </div>
    </Surface>
    <div className="space-y-2">
      <div className="flex items-end justify-between px-1">
        <div className="space-y-2"><div className="ui-shimmer h-4 w-28 rounded"/><div className="ui-shimmer h-3 w-36 rounded"/></div>
        <div className="ui-shimmer h-5 w-20 rounded"/>
      </div>
      <Surface className="overflow-hidden">
        <div className="divide-y divide-[var(--border)]">
          {[0,1,2,3,4,5].map((i)=><div key={i} className="flex items-center gap-3 px-3 py-3 sm:px-4">
            <div className="ui-shimmer h-10 w-10 shrink-0 rounded-xl"/>
            <div className="min-w-0 flex-1 space-y-2"><div className="ui-shimmer h-4 w-36 rounded"/><div className="ui-shimmer h-3 w-20 rounded"/></div>
            <div className="space-y-2 text-right"><div className="ui-shimmer ml-auto h-4 w-20 rounded"/><div className="ui-shimmer ml-auto h-2.5 w-12 rounded"/></div>
            <div className="ui-shimmer h-4 w-4 rounded"/>
          </div>)}
        </div>
      </Surface>
    </div>
  </PageFrame></AppShell>;
}

export default function AccountsPage(){
  const [items,setItems]=useState<Account[]>([]);
  const [availability,setAvailability]=useState<AvailabilitySummary|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[role,setRole]=useState("");
  const [listType,setListType]=useState("ALL"),[search,setSearch]=useState("");
  const [adding,setAdding]=useState(false),[editing,setEditing]=useState<Account|null>(null),[toggleTarget,setToggleTarget]=useState<Account|null>(null);
  const [name,setName]=useState(""),[type,setType]=useState("BANK"),[usage,setUsage]=useState("BUSINESS");
  const [opening,setOpening]=useState("0"),[limit,setLimit]=useState(""),[reference,setReference]=useState(""),[last4,setLast4]=useState("");
  const [gatewayName,setGatewayName]=useState(""),[gatewayChargeType,setGatewayChargeType]=useState("PERCENTAGE"),[gatewayRate,setGatewayRate]=useState("");
  const [editName,setEditName]=useState(""),[editUsage,setEditUsage]=useState("BUSINESS");
  const [editRef,setEditRef]=useState(""),[editLast4,setEditLast4]=useState(""),[editLimit,setEditLimit]=useState("");
  const [saving,setSaving]=useState(false);
  const load=useCallback(async(currentRole=role)=>{
    const admin=currentRole==="OWNER"||currentRole==="ADMIN";
    if(admin){
      const [raw,balances,summary]=await Promise.all([
        apiFetch<RawAccount[]>("/accounts"),
        apiFetch<BalanceAccount[]>("/dashboard/accounts"),
        apiFetch<AvailabilitySummary>("/dashboard/summary"),
      ]);
      setAvailability(summary);
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
    }else{
      const [balances,summary]=await Promise.all([
        apiFetch<Account[]>("/dashboard/accounts"),
        apiFetch<AvailabilitySummary>("/dashboard/summary"),
      ]);
      setItems(balances);
      setAvailability(summary);
    }
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
  useEffect(()=>{
    if(!admin||!items.length||editing)return;
    const params=new URLSearchParams(window.location.search);
    const editId=params.get("edit");
    if(!editId)return;
    const account=items.find((item)=>item.id===editId);
    if(!account)return;
    beginEdit(account);
    params.delete("edit");
    const next=params.toString()?window.location.pathname+"?"+params.toString():window.location.pathname;
    window.history.replaceState(null,"",next);
  },[admin,items]);
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
  const totals=useMemo(()=>{
    const cards=visibleItems.filter((a)=>a.accountType==="OWNER_CREDIT_CARD");
    const liquid=visibleItems.filter((a)=>["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)).reduce((sum,a)=>sum+a.currentBalance,0);
    const creditAvailable=cards.reduce((sum,a)=>sum+Math.max(0,a.availableCredit??0),0);
    const creditLimit=cards.reduce((sum,a)=>sum+Math.max(0,a.creditLimit??0),0);
    return {
      liquid,
      currentAvailability:liquid+creditAvailable,
      creditAvailable,
      creditLimit,
      cards:cards.reduce((sum,a)=>sum+Math.max(0,a.currentBalance),0),
      active:visibleItems.filter((a)=>a.isActive).length,
      bank:visibleItems.filter((a)=>["BANK","UPI"].includes(a.accountType)).reduce((sum,a)=>sum+a.currentBalance,0),
      wallet:visibleItems.filter((a)=>a.accountType==="PROVIDER_WALLET").reduce((sum,a)=>sum+a.currentBalance,0),
    };
  },[visibleItems]);
  function resetAdd(){
    setName("");setType("BANK");setUsage("BUSINESS");setOpening("0");setLimit("");
    setReference("");setLast4("");setGatewayName("");setGatewayChargeType("PERCENTAGE");setGatewayRate("");
  }
  async function submit(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    try{
      if(type==="PROVIDER_WALLET"){
        const providerName=name.trim().replace(/\s+wallet$/i,"");
        const provider=await apiFetch<CreatedProvider>("/providers",{method:"POST",body:JSON.stringify({name:providerName,providerType:"WALLET"})});
        if(gatewayName.trim()){
          await apiFetch("/providers/"+provider.id+"/gateways",{method:"POST",body:JSON.stringify({
            gatewayName:gatewayName.trim(),
            defaultChargeType:gatewayChargeType,
            defaultChargeRate:Number(gatewayRate||0),
          })});
        }
      }else{
        await apiFetch("/accounts",{method:"POST",body:JSON.stringify({
          accountName:name.trim(),accountType:type,
          accountNature:type==="OWNER_CREDIT_CARD"?"LIABILITY":"ASSET",
          usageType:usage,openingBalance:Number(opening||0),
          creditLimit:type==="OWNER_CREDIT_CARD"&&limit?Number(limit):undefined,
          accountReference:reference.trim()||undefined,
          lastFourDigits:last4.trim()||undefined,
        })});
      }
      resetAdd();setAdding(false);await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to create account");}
    finally{setSaving(false);}
  }
  function beginEdit(account:Account){
    setEditing(account);setEditName(account.accountName);setEditUsage(account.usageType);
    setEditRef(account.accountReference||"");
    setEditLast4(account.lastFourDigits||"");setEditLimit(account.creditLimit===null?"":String(account.creditLimit));
    setError("");
  }
  async function saveEdit(event:FormEvent){
    event.preventDefault();if(!editing)return;
    setSaving(true);setError("");
    try{
      await apiFetch("/accounts/"+editing.id,{method:"PATCH",body:JSON.stringify({
        accountName:editName.trim(),usageType:editUsage,
        accountReference:editRef.trim()||null,
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

  if(loading)return <AccountsSkeleton/>;
  const typeTabs=[["ALL","All"],["CASH","Cash"],["BANK","Banks"],["PROVIDER_WALLET","Wallets"],["OWNER_CREDIT_CARD","Cards"]];
  const currentAvailability=availability?.currentAvailability??totals.currentAvailability;
  const liquidFunds=availability?.availableFunds??totals.liquid;
  const availableCredit=availability?.creditCardAvailable??totals.creditAvailable;
  const cardOutstanding=availability?.creditCardOutstanding??totals.cards;
  const cashAvailable=visibleItems.filter((account)=>account.accountType==="CASH").reduce((sum,account)=>sum+account.currentBalance,0);

  return <AppShell><PageFrame width="max-w-7xl" className="ui-preview accounts-preview">
    <SectionHeading
      title="Accounts"
      description="See what you can use now, then drill into any account for its ledger."
      action={admin?<div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/settings" className="app-secondary-button inline-flex min-h-11 items-center px-3 text-xs font-bold">Payment gateways</Link>
        <button type="button" onClick={()=>{resetAdd();setAdding(true);}} className="app-primary-button inline-flex min-h-11 items-center gap-2 px-4 text-xs font-bold">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Add account
        </button>
      </div>:undefined}
    />
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

    <Surface className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text-muted)]">Current availability</p>
            <p className="money mt-1 text-[2rem] font-black leading-none tracking-[-.045em] text-[var(--text)] sm:text-4xl">{money(currentAvailability)}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Usable capacity · liquid funds plus unused card credit</p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-muted)]">{totals.active} active</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-y-4 divide-x-0 border-t border-[var(--border)] pt-4 sm:grid-cols-4 sm:divide-x sm:divide-[var(--border)]">
          <div className="min-w-0 pr-2.5 sm:pr-4">
            <p className="text-[11px] font-semibold text-[var(--text-muted)]">Cash available</p>
            <p className="money mt-1 truncate text-sm font-black text-[var(--text)] sm:text-base">{money(cashAvailable)}</p>
          </div>
          <div className="min-w-0 pl-2.5 sm:px-4">
            <p className="text-[11px] font-semibold text-[var(--text-muted)]">Liquid funds</p>
            <p className="money mt-1 truncate text-sm font-black text-[var(--text)] sm:text-base">{money(liquidFunds)}</p>
          </div>
          <div className="min-w-0 px-2.5 sm:px-4">
            <p className="text-[11px] font-semibold text-emerald-700">Available credit</p>
            <p className="money mt-1 truncate text-sm font-black text-emerald-700 sm:text-base">{money(availableCredit)}</p>
          </div>
          <div className="min-w-0 pl-2.5 sm:pl-4">
            <p className="text-[11px] font-semibold text-rose-600">Card outstanding</p>
            <p className="money mt-1 truncate text-sm font-black text-rose-600 sm:text-base">{money(cardOutstanding)}</p>
          </div>
        </div>
      </div>
    </Surface>

    <Surface className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          <input className="app-control !pl-10" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search account"/>
        </div>
        <div className="ui-scroll-fade min-w-0 lg:flex-none"><div className="flex gap-1.5 overflow-x-auto pb-0.5 pr-5 lg:pr-0">
          {typeTabs.map(([value,label])=><button type="button" key={value} onClick={()=>setListType(value)}
            className={"min-h-10 shrink-0 rounded-full px-3.5 text-xs font-bold transition "+(listType===value?"bg-[var(--text)] text-[var(--surface)]":"bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text)]")}>
            {label}<span className={"ml-1.5 "+(listType===value?"opacity-70":"text-[var(--text-muted)]")}>{counts[value]??0}</span>
          </button>)}
        </div></div>
      </div>
    </Surface>

    {filteredItems.length?([
      {key:"CASH",title:"Cash reserves & drawers",description:"Physical cash custody accounts",icon:"CASH"},
      {key:"BANK",title:"Bank accounts",description:"Bank and UPI balances",icon:"BANK"},
      {key:"OWNER_CREDIT_CARD",title:"Credit cards",description:"Credit capacity and outstanding",icon:"OWNER_CREDIT_CARD"},
      {key:"PROVIDER_WALLET",title:"Wallets",description:"Provider wallet balances",icon:"PROVIDER_WALLET"},
    ] as const).map((section)=>{
      const sectionItems=filteredItems.filter((account)=>accountGroup(account.accountType)===section.key);
      if(!sectionItems.length)return null;
      const sectionTotal=sectionItems.reduce((sum,account)=>sum+account.currentBalance,0);
      const sectionCreditAvailable=section.key==="OWNER_CREDIT_CARD"
        ?sectionItems.reduce((sum,account)=>sum+Math.max(0,account.availableCredit??0),0)
        :0;
      return <section key={section.key} className="space-y-2.5">
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold tracking-[-.01em] text-[var(--text)]">{section.title}</h2>
              <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-muted)]">{sectionItems.length}</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{section.description}</p>
          </div>
          {section.key==="OWNER_CREDIT_CARD"?<div className="shrink-0 text-right">
            <p className="money text-sm font-black text-emerald-700">{money(sectionCreditAvailable)} <span className="font-semibold">available</span></p>
            <p className="mt-0.5 text-[11px] font-semibold text-rose-600">{money(sectionTotal)} outstanding</p>
          </div>:<div className="shrink-0 text-right">
            <p className="money text-sm font-black text-[var(--text)]">{money(sectionTotal)}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Total balance</p>
          </div>}
        </div>

        <Surface className="overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {sectionItems.map((account)=>{
              const meta=metaLine(account);
              const secondary=meta||(account.usageType==="BUSINESS"?"Business":words(account.usageType));
              const isCard=account.accountType==="OWNER_CREDIT_CARD";
              const limit=Math.max(0,account.creditLimit??0);
              const used=Math.max(0,account.currentBalance);
              const utilisation=limit>0?Math.min(100,(used/limit)*100):0;
              return <div key={account.id} className={"flex items-stretch "+(!account.isActive?"opacity-55":"")}>
                <Link href={"/accounts/"+account.id} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:px-4">
                  <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl "+(section.key==="CASH"?"bg-amber-50 text-amber-700":section.key==="BANK"?"bg-blue-50 text-blue-700":section.key==="OWNER_CREDIT_CARD"?"bg-rose-50 text-rose-600":"bg-emerald-50 text-emerald-700")}>
                    <AccountIcon type={section.icon}/>
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-extrabold tracking-[-.01em] text-[var(--text)]">{account.accountName}</p>
                      {!account.isActive?<span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.04em] text-slate-500">Inactive</span>:null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{secondary}</p>
                    {isCard&&limit>0?<div className="mt-2 max-w-[260px]">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-emerald-700">{money(account.availableCredit??0)} available</span>
                        <span className="text-[var(--text-muted)]">{money(limit)} limit</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-rose-400" style={{width:utilisation+"%"}}/></div>
                    </div>:null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={"money text-sm font-black tracking-[-.02em] sm:text-base "+(isCard&&account.currentBalance>0?"text-rose-600":account.currentBalance<0?"text-rose-600":"text-[var(--text)]")}>{money(account.currentBalance)}</p>
                    {isCard?<p className="mt-0.5 text-[11px] font-semibold text-[var(--text-muted)]">Outstanding</p>:null}
                  </div>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                </Link>

                {admin&&!account.isActive&&account.accountType!=="PROVIDER_WALLET"?<button type="button" onClick={()=>setToggleTarget(account)} className="m-2 ml-0 shrink-0 rounded-xl bg-[var(--surface-soft)] px-3 text-[11px] font-bold text-[var(--accent)]" aria-label={"Reactivate "+account.accountName}>Reactivate</button>:null}
              </div>;
            })}
          </div>
        </Surface>
      </section>;
    }):<EmptyState title="No accounts found" description={search||listType!=="ALL"?"Try another search or filter.":"No accounts configured."}/>}

    <AccountModal open={adding} onClose={()=>setAdding(false)} title="Add account">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">{type==="PROVIDER_WALLET"?"Provider / wallet name":"Account name"}</span><input className="app-control" value={name} onChange={(e)=>setName(e.target.value)} placeholder={type==="CASH"?"e.g. Main Cash Reserve":type==="PROVIDER_WALLET"?"e.g. ECPay":"e.g. HDFC Current"} required/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Type</span><SearchableSelect className="app-control" value={type} onChange={(e)=>setType(e.target.value)}>
            <option value="CASH">Cash reserve / drawer</option><option value="BANK">Bank</option><option value="OWNER_CREDIT_CARD">Credit card</option><option value="PROVIDER_WALLET">Payment provider / wallet</option>
          </SearchableSelect></label>
          {type!=="PROVIDER_WALLET"?<><label className="block"><span className="mb-1.5 block text-sm font-semibold">Use</span><SearchableSelect className="app-control" value={usage} onChange={(e)=>setUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></SearchableSelect></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">{type==="OWNER_CREDIT_CARD"?"Opening outstanding":type==="CASH"?"Current physical cash":"Opening balance"}</span><input className="app-control" type="number" min="0" step="0.01" inputMode="decimal" value={opening} onChange={(e)=>setOpening(e.target.value)}/>{type==="CASH"?<span className="mt-1 block text-xs text-[var(--text-muted)]">Enter the cash already held in this reserve/drawer.</span>:null}</label>
          {type==="OWNER_CREDIT_CARD"?<label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold">Credit limit</span><input className="app-control" type="number" min="0.01" step="0.01" inputMode="decimal" value={limit} onChange={(e)=>setLimit(e.target.value)} placeholder="Total card limit" required/></label>:null}</>:null}
        </div>
        {type!=="PROVIDER_WALLET"?<details className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--text)]">Optional account details</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Reference</span><input className="app-control" value={reference} onChange={(e)=>setReference(e.target.value)} placeholder="Account / internal reference"/></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Last 4 digits</span><input className="app-control" inputMode="numeric" maxLength={4} value={last4} onChange={(e)=>setLast4(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Last 4 digits"/></label>
          </div>
        </details>:<div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3.5">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Payment gateway configuration</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">A wallet account is created automatically. Add the provider&apos;s gateway now, or manage additional gateways later in Settings.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold">Gateway name <span className="font-normal text-[var(--text-muted)]">(optional)</span></span><input className="app-control" value={gatewayName} onChange={(e)=>setGatewayName(e.target.value)} placeholder="e.g. Razorpay / Pine Labs / Paytm"/></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Charge type</span><SearchableSelect className="app-control" value={gatewayChargeType} onChange={(e)=>setGatewayChargeType(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></SearchableSelect></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">{gatewayChargeType==="PERCENTAGE"?"Default gateway charge %":"Default gateway charge"}</span><input className="app-control" type="number" min="0" step="0.0001" inputMode="decimal" value={gatewayRate} onChange={(e)=>setGatewayRate(e.target.value)} placeholder={gatewayChargeType==="PERCENTAGE"?"e.g. 1.5":"e.g. 10"} required={Boolean(gatewayName.trim())}/></label>
          </div>
          <Link href="/settings" className="inline-flex text-xs font-bold text-[var(--accent)] hover:underline">Manage existing providers &amp; gateways in Settings →</Link>
        </div>}
        <button disabled={saving} className="app-primary-button min-h-11 w-full px-4 text-sm font-bold disabled:opacity-40">{saving?"Saving…":"Add account"}</button>
      </form>
    </AccountModal>
    <AccountModal open={Boolean(editing)} onClose={()=>setEditing(null)} title={editing?.accountName??"Edit account"} description={editing?typeLabels[editing.accountType]:undefined}>
      {editing?<form onSubmit={saveEdit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Account name</span><input className="app-control" value={editName} onChange={(e)=>setEditName(e.target.value)} required/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Use</span><SearchableSelect className="app-control" value={editUsage} onChange={(e)=>setEditUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></SearchableSelect></label>
          {editing.accountType==="OWNER_CREDIT_CARD"?<label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold">Credit limit</span><input className="app-control" type="number" min="0.01" step="0.01" value={editLimit} onChange={(e)=>setEditLimit(e.target.value)} required/></label>:null}
        </div>
        {editing.accountType!=="CASH"?<details className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--text)]">Optional account details</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Reference</span><input className="app-control" value={editRef} onChange={(e)=>setEditRef(e.target.value)} placeholder="Account / internal reference"/></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Last 4 digits</span><input className="app-control" inputMode="numeric" maxLength={4} value={editLast4} onChange={(e)=>setEditLast4(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Last 4 digits"/></label>
          </div>
        </details>:null}
        <button disabled={saving} className="app-primary-button min-h-11 w-full px-4 text-sm font-bold disabled:opacity-40">{saving?"Saving…":"Save"}</button>
        <div className="border-t border-[var(--border)] pt-3"><button type="button" onClick={()=>{setToggleTarget(editing);setEditing(null);}} className="min-h-10 w-full rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50">Deactivate account</button></div>
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
