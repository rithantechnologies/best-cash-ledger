"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Customer={id:string;fullName:string;cards:{id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean}[]};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string};
type Provider={id:string;name:string;gateways:Gateway[]};
type Account={id:string;accountName:string;accountType:string;currentBalance:number};
type Term={id:string;name:string;durationValue:number;durationUnit:string;defaultCommissionRate:string};
type CommissionRule={commissionType:string;commissionRate:string}|null;

const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

function dateTimeLocal(date:Date){
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}

export default function CardSwipePage(){
  const router=useRouter();
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [providers,setProviders]=useState<Provider[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [terms,setTerms]=useState<Term[]>([]);
  const [customerId,setCustomerId]=useState("");
  const [cardId,setCardId]=useState("");
  const [amount,setAmount]=useState("");
  const [providerId,setProviderId]=useState("");
  const [gatewayId,setGatewayId]=useState("");
  const [providerRate,setProviderRate]=useState("0");
  const [commissionRate,setCommissionRate]=useState("0");
  const [termId,setTermId]=useState("");
  const [dueAt,setDueAt]=useState(dateTimeLocal(new Date()));
  const [settlementAccountId,setSettlementAccountId]=useState("");
  const [reference,setReference]=useState("");
  const [notes,setNotes]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    Promise.all([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Provider[]>("/providers"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<Term[]>("/settings/payment-terms"),
    ]).then(([c,p,a,t])=>{setCustomers(c);setProviders(p);setAccounts(a);setTerms(t);})
      .catch(e=>setError(e instanceof Error?e.message:"Failed to load form"));
  },[]);
  const customer=customers.find(c=>c.id===customerId);
  const provider=providers.find(p=>p.id===providerId);
  const gateway=provider?.gateways.find(g=>g.id===gatewayId);
  const swipe=Number(amount||0);
  const pRate=Number(providerRate||0);
  const cRate=Number(commissionRate||0);
  const providerCharge=swipe*pRate/100;
  const commission=swipe*cRate/100;
  const settlement=swipe-providerCharge;
  const payable=swipe-providerCharge-commission;

  useEffect(()=>{
    if(gateway) setProviderRate(String(Number(gateway.defaultChargeRate)));
  },[gatewayId, gateway]);

  useEffect(()=>{
    const term=terms.find(t=>t.id===termId);
    if(!term)return;
    setCommissionRate(String(Number(term.defaultCommissionRate)));
    const multiplier=term.durationUnit==="DAYS"?24*60*60*1000:60*60*1000;
    setDueAt(dateTimeLocal(new Date(Date.now()+term.durationValue*multiplier)));
  },[termId,terms]);

  useEffect(()=>{
    if(!customerId)return;
    const q=new URLSearchParams({transactionType:"CARD_SWIPE",customerId});
    if(providerId)q.set("providerId",providerId);
    if(gatewayId)q.set("gatewayId",gatewayId);
    if(termId)q.set("paymentTermId",termId);
    apiFetch<CommissionRule>("/settings/commission-rules/resolve?"+q.toString())
      .then(rule=>{if(rule)setCommissionRate(String(Number(rule.commissionRate)));})
      .catch(()=>{});
  },[customerId,providerId,gatewayId,termId]);

  async function submit(e:FormEvent){
    e.preventDefault();setError("");setSaving(true);
    try{
      await apiFetch("/transactions/card-swipe",{method:"POST",body:JSON.stringify({
        customerId,customerCardId:cardId,swipeAmount:swipe,providerId,gatewayId,
        providerChargeRate:pRate,commissionRate:cRate,paymentTermId:termId,
        dueAt:new Date(dueAt).toISOString(),settlementAccountId,
        referenceNumber:reference||undefined,
        notes:notes||undefined,
      })});
      router.push("/payables");
    }catch(err){setError(err instanceof Error?err.message:"Failed to save swipe");}
    finally{setSaving(false);}
  }

  return <AppShell><div className="mx-auto max-w-5xl space-y-6">
    <div><h2 className="text-2xl font-bold">Credit Card Swipe</h2><p className="text-sm text-slate-500">Record provider settlement, charges, commission and customer payable.</p></div>
    {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
    <form onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
      <label className="text-sm"><span className="mb-1 block font-medium">Customer</span><select className="w-full rounded-lg border px-3 py-2.5" value={customerId} onChange={e=>{setCustomerId(e.target.value);setCardId("");}} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Card</span><select className="w-full rounded-lg border px-3 py-2.5" value={cardId} onChange={e=>setCardId(e.target.value)} required><option value="">Select card</option>{customer?.cards.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.bankName} ****{c.lastFourDigits}{c.nickname?" — "+c.nickname:""}</option>)}</select></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Swipe Amount</span><input className="w-full rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Provider</span><select className="w-full rounded-lg border px-3 py-2.5" value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Gateway</span><select className="w-full rounded-lg border px-3 py-2.5" value={gatewayId} onChange={e=>setGatewayId(e.target.value)} required><option value="">Select gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Provider Charge %</span><input className="w-full rounded-lg border px-3 py-2.5" type="number" step="0.0001" min="0" value={providerRate} onChange={e=>setProviderRate(e.target.value)} required/></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Payment Term</span><select className="w-full rounded-lg border px-3 py-2.5" value={termId} onChange={e=>setTermId(e.target.value)} required><option value="">Select term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Business Commission %</span><input className="w-full rounded-lg border px-3 py-2.5" type="number" step="0.0001" min="0" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Due Date / Time</span><input className="w-full rounded-lg border px-3 py-2.5" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></label>
      <label className="text-sm"><span className="mb-1 block font-medium">Settlement Account</span><select className="w-full rounded-lg border px-3 py-2.5" value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Wallet / bank receiving settlement</option>{accounts.filter(a=>a.accountType!=="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></label>
      <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium">Provider Reference</span><input className="w-full rounded-lg border px-3 py-2.5" value={reference} onChange={e=>setReference(e.target.value)} placeholder="Optional reference"/></label>
      <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium">Notes</span><textarea className="w-full rounded-lg border px-3 py-2.5" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></label>

      <div className="md:col-span-2 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
        <div><p className="text-xs text-slate-500">Provider Charge</p><p className="font-semibold">{money(providerCharge)}</p></div>
        <div><p className="text-xs text-slate-500">Business Commission</p><p className="font-semibold">{money(commission)}</p></div>
        <div><p className="text-xs text-slate-500">Wallet / Bank Credit</p><p className="font-semibold">{money(settlement)}</p></div>
        <div><p className="text-xs text-slate-500">Customer Payable</p><p className="text-lg font-bold">{money(payable)}</p></div>
      </div>

      <div className="md:col-span-2 flex justify-end">
        <button disabled={saving||payable<0} className="rounded-lg bg-slate-950 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save Swipe"}</button>
      </div>
    </form>
  </div></AppShell>;
}
