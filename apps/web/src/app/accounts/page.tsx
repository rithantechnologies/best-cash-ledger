"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Modal, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={
  id:string;accountName:string;accountType:string;accountNature:string;usageType:string;
  bankName:string|null;accountReference:string|null;lastFourDigits:string|null;
  currentBalance:number;creditLimit:number|null;availableCredit:number|null;isActive:boolean;
};
type RawAccount=Omit<Account,"currentBalance"|"availableCredit"> & {openingBalance:string};
type BalanceAccount={id:string;currentBalance:number;availableCredit:number|null;isActive:boolean;usageType:string;bankName:string|null;accountReference:string|null;lastFourDigits:string|null};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const input="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
const primary="app-primary-button min-h-11 px-4 text-sm font-bold";
const secondary="app-secondary-button min-h-10 px-3 text-xs font-bold";

export default function AccountsPage(){
 const [items,setItems]=useState<Account[]>([]),[loading,setLoading]=useState(true);
 const [listType,setListType]=useState("ALL");
 const [name,setName]=useState(""),[type,setType]=useState("BANK"),[nature,setNature]=useState("ASSET"),[usage,setUsage]=useState("MIXED"),[opening,setOpening]=useState("0"),[limit,setLimit]=useState("");
 const [adding,setAdding]=useState(false),[editing,setEditing]=useState<Account|null>(null),[toggleTarget,setToggleTarget]=useState<Account|null>(null);
 const [editName,setEditName]=useState(""),[editUsage,setEditUsage]=useState("MIXED"),[editBank,setEditBank]=useState(""),[editRef,setEditRef]=useState(""),[editLimit,setEditLimit]=useState("");
 const [error,setError]=useState(""),[role,setRole]=useState("");
 const load=useCallback(async(currentRole=role)=>{
  const admin=currentRole==="OWNER"||currentRole==="ADMIN";
  if(admin){
   const [raw,balances]=await Promise.all([apiFetch<RawAccount[]>("/accounts"),apiFetch<BalanceAccount[]>("/dashboard/accounts")]);
   const map=new Map(balances.map(x=>[x.id,x]));
   setItems(raw.map(a=>({...a,currentBalance:map.get(a.id)?.currentBalance??Number(a.openingBalance||0),availableCredit:map.get(a.id)?.availableCredit??null})));
  }else setItems(await apiFetch<Account[]>("/dashboard/accounts"));
 },[role]);
 useEffect(()=>{
  const initialType=new URLSearchParams(window.location.search).get("type");
  if(initialType&&["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(initialType))setListType(initialType);
  let nextRole="";
  try{nextRole=JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"";setRole(nextRole);}catch{}
  if(nextRole)load(nextRole).catch(e=>setError(e instanceof Error?e.message:"Failed to load accounts")).finally(()=>setLoading(false));
  else setLoading(false);
 },[]);

 async function submit(e:FormEvent){
  e.preventDefault();setError("");
  try{
   await apiFetch("/accounts",{method:"POST",body:JSON.stringify({accountName:name,accountType:type,accountNature:nature,usageType:usage,openingBalance:Number(opening||0),creditLimit:limit?Number(limit):undefined})});
   setName("");setOpening("0");setLimit("");setAdding(false);await load();
  }catch(e){setError(e instanceof Error?e.message:"Failed to create account");}
 }
 function beginEdit(a:Account){
  setEditing(a);setEditName(a.accountName);setEditUsage(a.usageType);setEditBank(a.bankName||"");setEditRef(a.accountReference||"");setEditLimit(a.creditLimit===null?"":String(a.creditLimit));setError("");
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!editing)return;setError("");
  try{
   await apiFetch("/accounts/"+editing.id,{method:"PATCH",body:JSON.stringify({accountName:editName.trim(),usageType:editUsage,bankName:editBank.trim()||undefined,accountReference:editRef.trim()||undefined,creditLimit:editLimit.trim()?Number(editLimit):undefined})});
   setEditing(null);await load();
  }catch(e){setError(e instanceof Error?e.message:"Failed to update account");}
 }
 async function confirmToggle(){
  if(!toggleTarget)return;setError("");
  try{await apiFetch("/accounts/"+toggleTarget.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!toggleTarget.isActive})});setToggleTarget(null);await load();}
  catch(e){setError(e instanceof Error?e.message:"Failed to change account status");}
 }
 const admin=role==="OWNER"||role==="ADMIN";
 const filteredItems=useMemo(()=>listType==="ALL"?items:items.filter(a=>a.accountType===listType),[items,listType]);
 const totals=useMemo(()=>({
  liquid:items.filter(a=>["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)).reduce((s,a)=>s+a.currentBalance,0),
  cards:items.filter(a=>a.accountType==="OWNER_CREDIT_CARD").reduce((s,a)=>s+a.currentBalance,0),
  active:items.filter(a=>a.isActive).length,
 }),[items]);

 if(loading)return <AppShell><PageLoader label="Loading accounts…"/></AppShell>;
 return <AppShell><div className="page-enter mx-auto max-w-7xl space-y-5">
  <SectionHeading title="Accounts" action={admin?<button onClick={()=>setAdding(true)} className={primary}>+ Add account</button>:undefined}/>

  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <div className="flex gap-2 overflow-x-auto pb-1">
   {[["ALL","All"],["BANK","Bank"],["UPI","UPI"],["PROVIDER_WALLET","Wallets"],["CASH","Cash"],["OWNER_CREDIT_CARD","Credit cards"]].map(([value,label])=><button key={value} onClick={()=>setListType(value)} className={"min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold "+(listType===value?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{label}</button>)}
  </div>

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
   <Surface className="p-3.5"><p className="text-xs text-[var(--text-muted)]">Liquid funds</p><p className="money mt-1 text-lg font-semibold sm:text-2xl">{money(totals.liquid)}</p></Surface>
   <Surface className="p-3.5"><p className="text-xs text-[var(--text-muted)]">Card outstanding</p><p className="money mt-1 text-lg font-semibold text-rose-600 sm:text-2xl">{money(totals.cards)}</p></Surface>
   <Surface className="p-3.5"><p className="text-xs text-[var(--text-muted)]">Active</p><p className="money mt-1 text-lg font-semibold sm:text-2xl">{totals.active}</p></Surface>
  </div>

  {filteredItems.length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredItems.map(a=><Surface key={a.id} className={!a.isActive?"p-4 opacity-60":"p-4"}>
   <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold">{a.accountName}</h3><StatusBadge tone={a.isActive?"emerald":"slate"}>{a.isActive?"Active":"Inactive"}</StatusBadge></div><p className="mt-1 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">{a.accountType.replaceAll("_"," ")}</p></div><div className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-black "+(a.accountType==="CASH"?"bg-emerald-50 text-emerald-700":a.accountType==="OWNER_CREDIT_CARD"?"bg-rose-50 text-rose-700":"bg-indigo-50 text-indigo-700")}>{a.accountType==="OWNER_CREDIT_CARD"?"CC":a.accountType.slice(0,2)}</div></div>
   <div className="mt-4 flex items-end justify-between gap-3"><p className={"money text-2xl font-semibold "+(a.currentBalance<0?"text-rose-600":"")}>{money(a.currentBalance)}</p><Link href={"/accounts/"+a.id} className="text-xs font-semibold text-[var(--accent)]">Ledger →</Link></div>
   <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500"><span className="rounded-lg bg-slate-50 px-2 py-1">{a.usageType.toLowerCase()}</span>{a.bankName?<span className="rounded-lg bg-slate-50 px-2 py-1">{a.bankName}</span>:null}{a.accountReference?<span className="rounded-lg bg-slate-50 px-2 py-1">{a.accountReference}</span>:null}</div>
   {a.creditLimit!==null?<div className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-xs"><div className="flex justify-between gap-3"><span className="text-[var(--text-muted)]">Used {money(a.currentBalance)}</span><strong>{Math.min(100,Math.max(0,a.creditLimit?Math.abs(a.currentBalance)/a.creditLimit*100:0)).toFixed(0)}%</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--money-out)]" style={{width:Math.min(100,Math.max(0,a.creditLimit?Math.abs(a.currentBalance)/a.creditLimit*100:0))+"%"}}/></div><div className="mt-2 flex justify-between text-[var(--text-muted)]"><span>Limit {money(a.creditLimit)}</span><span>Available {money(a.availableCredit??0)}</span></div></div>:null}
   {admin&&a.accountType!=="PROVIDER_WALLET"?<div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3"><button onClick={()=>beginEdit(a)} className={secondary}>Edit</button><button onClick={()=>setToggleTarget(a)} className={secondary}>{a.isActive?"Deactivate":"Reactivate"}</button></div>:null}
  </Surface>)}</div>:<EmptyState title="No accounts configured" description="Create a cash, bank or UPI account to get started."/>}
  <Modal open={adding} title="Add account" description="Opening balance is posted to the ledger once when the account is created." onClose={()=>setAdding(false)}>
   <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
    <input className={input} placeholder="Account name" value={name} onChange={e=>setName(e.target.value)} required/>
    <select className={input} value={type} onChange={e=>{setType(e.target.value);setNature(e.target.value==="OWNER_CREDIT_CARD"?"LIABILITY":"ASSET");}}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option><option value="OWNER_CREDIT_CARD">Owner Credit Card</option></select>
    <select className={input} value={usage} onChange={e=>setUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select>
    <input className={input} type="number" step="0.01" placeholder="Opening balance" value={opening} onChange={e=>setOpening(e.target.value)}/>
    <input className={input+" sm:col-span-2"} type="number" step="0.01" placeholder="Credit limit (credit cards only)" value={limit} onChange={e=>setLimit(e.target.value)}/>
    <button className={primary+" sm:col-span-2"}>Create account</button>
   </form>
  </Modal>

  <Modal open={!!editing} title="Edit account" description={editing?editing.accountType.replaceAll("_"," ")+" · Current "+money(editing.currentBalance):undefined} onClose={()=>setEditing(null)}>
   <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2"><input className={input} value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Account name" required/><select className={input} value={editUsage} onChange={e=>setEditUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select><input className={input} value={editBank} onChange={e=>setEditBank(e.target.value)} placeholder="Bank name"/><input className={input} value={editRef} onChange={e=>setEditRef(e.target.value)} placeholder="Account / reference"/><input className={input+" sm:col-span-2"} type="number" step="0.01" value={editLimit} onChange={e=>setEditLimit(e.target.value)} placeholder="Credit limit"/><button className={primary+" sm:col-span-2"}>Save changes</button></form>
  </Modal>

  <Modal open={!!toggleTarget} title={toggleTarget?.isActive?"Deactivate account?":"Reactivate account?"} description="Historical ledger data is never removed." onClose={()=>setToggleTarget(null)}>
   <p className="text-sm leading-6 text-slate-600">{toggleTarget?.isActive?"Deactivate":"Reactivate"} <strong>{toggleTarget?.accountName}</strong>? Accounts with non-zero/open balances may be protected from deactivation.</p>
   <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setToggleTarget(null)} className={secondary}>Cancel</button><button onClick={confirmToggle} className={primary}>{toggleTarget?.isActive?"Deactivate":"Reactivate"}</button></div>
  </Modal>
 </div></AppShell>;
}
