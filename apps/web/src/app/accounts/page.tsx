"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Account={
  id:string;accountName:string;accountType:string;accountNature:string;usageType:string;
  bankName:string|null;accountReference:string|null;lastFourDigits:string|null;
  currentBalance:number;creditLimit:number|null;availableCredit:number|null;isActive:boolean;
};
type RawAccount=Omit<Account,"currentBalance"|"availableCredit"> & {openingBalance:string};
type BalanceAccount={id:string;currentBalance:number;availableCredit:number|null;isActive:boolean;usageType:string;bankName:string|null;accountReference:string|null;lastFourDigits:string|null};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v||0));

export default function AccountsPage(){
  const [items,setItems]=useState<Account[]>([]);
  const [name,setName]=useState(""),[type,setType]=useState("BANK"),[nature,setNature]=useState("ASSET"),[usage,setUsage]=useState("MIXED"),[opening,setOpening]=useState("0"),[limit,setLimit]=useState("");
  const [editing,setEditing]=useState<Account|null>(null);
  const [editName,setEditName]=useState(""),[editUsage,setEditUsage]=useState("MIXED"),[editBank,setEditBank]=useState(""),[editRef,setEditRef]=useState(""),[editLimit,setEditLimit]=useState("");
  const [error,setError]=useState(""),[role,setRole]=useState("");

  async function load(){
    const admin=role==="OWNER"||role==="ADMIN";
    if(admin){
      const [raw,balances]=await Promise.all([apiFetch<RawAccount[]>("/accounts"),apiFetch<BalanceAccount[]>("/dashboard/accounts")]);
      const map=new Map(balances.map(x=>[x.id,x]));
      setItems(raw.map(a=>({...a,currentBalance:map.get(a.id)?.currentBalance??Number(a.openingBalance||0),availableCredit:map.get(a.id)?.availableCredit??null})));
    }else{
      const active=await apiFetch<Account[]>("/dashboard/accounts");
      setItems(active);
    }
  }
  useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);
  useEffect(()=>{if(role)load().catch(e=>setError(e instanceof Error?e.message:"Failed to load accounts"));},[role]);

  async function submit(e:FormEvent){
    e.preventDefault();setError("");
    try{
      await apiFetch("/accounts",{method:"POST",body:JSON.stringify({accountName:name,accountType:type,accountNature:nature,usageType:usage,openingBalance:Number(opening||0),creditLimit:limit?Number(limit):undefined})});
      setName("");setOpening("0");setLimit("");await load();
    }catch(e){setError(e instanceof Error?e.message:"Failed to create account");}
  }

  function beginEdit(a:Account){
    setEditing(a);setEditName(a.accountName);setEditUsage(a.usageType);setEditBank(a.bankName||"");setEditRef(a.accountReference||"");setEditLimit(a.creditLimit===null?"":String(a.creditLimit));setError("");
  }
  async function saveEdit(e:FormEvent){
    e.preventDefault();if(!editing)return;setError("");
    try{
      await apiFetch("/accounts/"+editing.id,{method:"PATCH",body:JSON.stringify({
        accountName:editName.trim(),usageType:editUsage,bankName:editBank.trim()||undefined,
        accountReference:editRef.trim()||undefined,creditLimit:editLimit.trim()?Number(editLimit):undefined,
      })});
      setEditing(null);await load();
    }catch(e){setError(e instanceof Error?e.message:"Failed to update account");}
  }
  async function toggleAccount(a:Account){
    if(!window.confirm((a.isActive?"Deactivate ":"Reactivate ")+a.accountName+"? Historical ledger data will be preserved."))return;
    setError("");
    try{await apiFetch("/accounts/"+a.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!a.isActive})});await load();}
    catch(e){setError(e instanceof Error?e.message:"Failed to change account status");}
  }

  const admin=role==="OWNER"||role==="ADMIN";
  return <AppShell><div className="mx-auto max-w-7xl space-y-6">
    <div><h2 className="text-2xl font-bold">Accounts</h2><p className="text-sm text-slate-500">Cash, banks, UPI, wallets and owner credit cards. Non-zero/open accounts cannot be deactivated.</p></div>

    {editing?<form onSubmit={saveEdit} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Edit account</h3><p className="text-xs text-slate-500">{editing.accountType} · Current {money(editing.currentBalance)}</p></div><button type="button" onClick={()=>setEditing(null)} className="text-sm font-semibold">Close</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><input className="rounded-lg border bg-white px-3 py-2.5" value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Account name" required/><select className="rounded-lg border bg-white px-3 py-2.5" value={editUsage} onChange={e=>setEditUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select><input className="rounded-lg border bg-white px-3 py-2.5" value={editBank} onChange={e=>setEditBank(e.target.value)} placeholder="Bank name"/><input className="rounded-lg border bg-white px-3 py-2.5" value={editRef} onChange={e=>setEditRef(e.target.value)} placeholder="Account / reference"/><input className="rounded-lg border bg-white px-3 py-2.5" type="number" step="0.01" value={editLimit} onChange={e=>setEditLimit(e.target.value)} placeholder="Credit limit"/></div>
      <div className="mt-4 flex justify-end"><button className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white">Save Changes</button></div>
    </form>:null}

    {admin?<form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3 xl:grid-cols-6">
      <input className="rounded-lg border px-3 py-2" placeholder="Account name" value={name} onChange={e=>setName(e.target.value)} required/>
      <select className="rounded-lg border px-3 py-2" value={type} onChange={e=>{setType(e.target.value);setNature(e.target.value==="OWNER_CREDIT_CARD"?"LIABILITY":"ASSET");}}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option><option value="PROVIDER_WALLET">Provider Wallet</option><option value="OWNER_CREDIT_CARD">Owner Credit Card</option></select>
      <select className="rounded-lg border px-3 py-2" value={usage} onChange={e=>setUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select>
      <input className="rounded-lg border px-3 py-2" type="number" step="0.01" placeholder="Opening balance" value={opening} onChange={e=>setOpening(e.target.value)}/>
      <input className="rounded-lg border px-3 py-2" type="number" step="0.01" placeholder="Credit limit" value={limit} onChange={e=>setLimit(e.target.value)}/>
      <button className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white">Add Account</button>
    </form>:null}

    {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(a=><div key={a.id} className={"rounded-xl border bg-white p-5 "+(!a.isActive?"opacity-65":"")}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase text-slate-500">{a.accountType}</p><h3 className="mt-1 font-semibold">{a.accountName}</h3></div><span className={"rounded-full px-2 py-1 text-xs "+(a.isActive?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600")}>{a.isActive?"Active":"Inactive"}</span></div>
      <p className="mt-4 text-2xl font-bold">{money(a.currentBalance)}</p><p className="mt-1 text-xs text-slate-500">{a.usageType}{a.bankName?" · "+a.bankName:""}{a.accountReference?" · "+a.accountReference:""}</p>
      {a.creditLimit!==null?<p className="mt-1 text-sm text-slate-500">Limit {money(a.creditLimit)} · Available {money(a.availableCredit??0)}</p>:null}
      {admin?<div className="mt-4 flex gap-2"><button onClick={()=>beginEdit(a)} className="rounded border px-3 py-1.5 text-sm">Edit</button><button onClick={()=>toggleAccount(a)} className="rounded border px-3 py-1.5 text-sm">{a.isActive?"Deactivate":"Reactivate"}</button></div>:null}
    </div>)}</div>
  </div></AppShell>;
}
