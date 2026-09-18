"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Account = {
  id:string; accountName:string; accountType:string; accountNature:string; usageType:string;
  bankName:string|null; accountReference:string|null; lastFourDigits:string|null;
  currentBalance:number; creditLimit:number|null; availableCredit:number|null; isActive:boolean;
};

type RawAccount = Omit<Account,"currentBalance"|"availableCredit">;
type BalanceAccount = {id:string;currentBalance:number;availableCredit:number|null};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v));

export default function AccountsPage(){
  const [items,setItems]=useState<Account[]>([]);
  const [name,setName]=useState("");
  const [type,setType]=useState("BANK");
  const [nature,setNature]=useState("ASSET");
  const [usage,setUsage]=useState("MIXED");
  const [opening,setOpening]=useState("0");
  const [limit,setLimit]=useState("");
  const [error,setError]=useState("");
  const [role,setRole]=useState("");

  async function load(){
    const admin=role==="OWNER"||role==="ADMIN";
    if(admin){
      const [raw,balances]=await Promise.all([
        apiFetch<RawAccount[]>("/accounts"),
        apiFetch<BalanceAccount[]>("/dashboard/accounts"),
      ]);
      const map=new Map(balances.map(x=>[x.id,x]));
      setItems(raw.map(a=>({...a,currentBalance:map.get(a.id)?.currentBalance??Number((a as any).openingBalance??0),availableCredit:map.get(a.id)?.availableCredit??null})));
    }else{
      const active=await apiFetch<Account[]>("/dashboard/accounts");
      setItems(active.map(a=>({...a,isActive:true,usageType:(a as any).usageType??"MIXED",bankName:(a as any).bankName??null,accountReference:(a as any).accountReference??null,lastFourDigits:(a as any).lastFourDigits??null})));
    }
  }

  useEffect(()=>{
    let next="";
    try{next=JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"";}catch{}
    setRole(next);
  },[]);
  useEffect(()=>{if(role)load().catch(()=>setError("Failed to load accounts"));},[role]);

  async function submit(e:FormEvent){
    e.preventDefault();setError("");
    try{
      await apiFetch("/accounts",{method:"POST",body:JSON.stringify({
        accountName:name,accountType:type,accountNature:nature,usageType:usage,
        openingBalance:Number(opening||0),creditLimit:limit?Number(limit):undefined,
      })});
      setName("");setOpening("0");setLimit("");await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to create account");}
  }

  async function editAccount(a:Account){
    const nextName=window.prompt("Account name",a.accountName); if(nextName===null||!nextName.trim())return;
    const nextUsage=window.prompt("Usage: BUSINESS, PERSONAL or MIXED",a.usageType); if(nextUsage===null)return;
    const nextBank=window.prompt("Bank name (optional)",a.bankName||""); if(nextBank===null)return;
    const nextRef=window.prompt("Account/reference (optional)",a.accountReference||""); if(nextRef===null)return;
    const nextLimit=window.prompt("Credit limit (blank for unchanged)",a.creditLimit===null?"":String(a.creditLimit)); if(nextLimit===null)return;
    setError("");
    try{
      await apiFetch("/accounts/"+a.id,{method:"PATCH",body:JSON.stringify({
        accountName:nextName.trim(),
        usageType:nextUsage.trim().toUpperCase(),
        bankName:nextBank.trim()||undefined,
        accountReference:nextRef.trim()||undefined,
        creditLimit:nextLimit.trim()?Number(nextLimit):undefined,
      })});
      await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to update account");}
  }

  async function toggleAccount(a:Account){
    if(!window.confirm((a.isActive?"Deactivate ":"Reactivate ")+a.accountName+"? Historical ledger data will be preserved."))return;
    setError("");
    try{
      await apiFetch("/accounts/"+a.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!a.isActive})});
      await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to change account status");}
  }

  const admin=role==="OWNER"||role==="ADMIN";

  return <AppShell><div className="mx-auto max-w-7xl space-y-6">
    <div><h2 className="text-2xl font-bold">Accounts</h2><p className="text-sm text-slate-500">Cash, banks, UPI, wallets and owner credit cards. Deactivation preserves all historical ledger entries.</p></div>
    {admin?<form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3 xl:grid-cols-6">
      <input className="rounded-lg border px-3 py-2" placeholder="Account name" value={name} onChange={e=>setName(e.target.value)} required/>
      <select className="rounded-lg border px-3 py-2" value={type} onChange={e=>{setType(e.target.value);setNature(e.target.value==="OWNER_CREDIT_CARD"?"LIABILITY":"ASSET");}}>
        <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option><option value="PROVIDER_WALLET">Provider Wallet</option><option value="OWNER_CREDIT_CARD">Owner Credit Card</option>
      </select>
      <select className="rounded-lg border px-3 py-2" value={usage} onChange={e=>setUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Mixed</option></select>
      <input className="rounded-lg border px-3 py-2" type="number" step="0.01" placeholder="Opening balance" value={opening} onChange={e=>setOpening(e.target.value)}/>
      <input className="rounded-lg border px-3 py-2" type="number" step="0.01" placeholder="Credit limit" value={limit} onChange={e=>setLimit(e.target.value)}/>
      <button className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white">Add Account</button>
    </form>:null}
    {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(a=><div key={a.id} className={"rounded-xl border bg-white p-5 "+(!a.isActive?"opacity-60":"")}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase text-slate-500">{a.accountType}</p><h3 className="mt-1 font-semibold">{a.accountName}</h3></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{a.isActive?"Active":"Inactive"}</span></div>
      <p className="mt-4 text-2xl font-bold">{money(a.currentBalance)}</p>
      <p className="mt-1 text-xs text-slate-500">{a.usageType}{a.bankName?" · "+a.bankName:""}{a.accountReference?" · "+a.accountReference:""}</p>
      {a.creditLimit!==null?<p className="mt-1 text-sm text-slate-500">Limit {money(a.creditLimit)} · Available {money(a.availableCredit??0)}</p>:null}
      {admin?<div className="mt-4 flex gap-2"><button onClick={()=>editAccount(a)} className="rounded border px-3 py-1.5 text-sm">Edit</button><button onClick={()=>toggleAccount(a)} className="rounded border px-3 py-1.5 text-sm">{a.isActive?"Deactivate":"Reactivate"}</button></div>:null}
    </div>)}</div>
  </div></AppShell>;
}
