"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Customer={id:string;fullName:string;cards:{id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean}[]};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string};
type Provider={id:string;name:string;gateways:Gateway[]};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;providerId:string|null};
type Term={id:string;name:string;durationValue:number;durationUnit:string;defaultCommissionRate:string};
type CommissionRule={commissionType:string;commissionRate:string}|null;
type QuickCustomerResult={customer:{id:string;fullName:string};card:{id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean}};

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
  const [customerMode,setCustomerMode]=useState<"existing"|"new">("existing");
  const [quickName,setQuickName]=useState("");
  const [quickMobile,setQuickMobile]=useState("");
  const [quickLastFour,setQuickLastFour]=useState("");
  const [quickSaving,setQuickSaving]=useState(false);
  const [amount,setAmount]=useState("");
  const [providerId,setProviderId]=useState("");
  const [gatewayId,setGatewayId]=useState("");
  const [providerRate,setProviderRate]=useState("0");
  const [commissionRate,setCommissionRate]=useState("0");
  const [termId,setTermId]=useState("");
  const [dueAt,setDueAt]=useState(dateTimeLocal(new Date()));
  const [settledNow,setSettledNow]=useState(false);
  const [settlementDueAt,setSettlementDueAt]=useState("");
  const [reference,setReference]=useState("");
  const [notes,setNotes]=useState("");
  const [showOptional,setShowOptional]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Provider[]>("/providers"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<Term[]>("/settings/payment-terms"),
    ]).then(([c,p,a,t])=>{
      setCustomers(c);setProviders(p);setAccounts(a);setTerms(t);
      const instant=t.find(x=>x.name.toLowerCase().includes("instant"))??t[0];
      if(instant)setTermId(current=>current||instant.id);
      const remembered=localStorage.getItem("cashledger_card_provider");
      const initial=p.find(x=>x.id===remembered)?.id||(p.length===1?p[0].id:"");
      if(initial)setProviderId(initial);
    })
      .catch(e=>setError(e instanceof Error?e.message:"Failed to load form"))
      .finally(()=>setLoading(false));
  },[]);
  const customer=customers.find(c=>c.id===customerId);
  const provider=providers.find(p=>p.id===providerId);
  const gateway=provider?.gateways.find(g=>g.id===gatewayId);
  const providerWallet=accounts.find(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId);
  const selectedTerm=terms.find(t=>t.id===termId);
  const instantTerm=selectedTerm?.name.toLowerCase().includes("instant")??false;
  const swipe=Number(amount||0);
  const pRate=Number(providerRate||0);
  const cRate=Number(commissionRate||0);
  const providerCharge=swipe*pRate/100;
  const commission=swipe*cRate/100;
  const settlement=swipe-providerCharge;
  const payable=swipe-commission;

  useEffect(()=>{
    if(gateway) setProviderRate(String(Number(gateway.defaultChargeRate)));
  },[gatewayId, gateway]);

  useEffect(()=>{
    const active=customer?.cards.filter(c=>c.isActive)??[];
    setCardId(current=>active.some(c=>c.id===current)?current:(active.length===1?active[0].id:""));
  },[customerId,customer]);

  useEffect(()=>{
    if(!providerId)return;
    localStorage.setItem("cashledger_card_provider",providerId);
    const currentProvider=providers.find(p=>p.id===providerId);
    const rememberedGateway=localStorage.getItem("cashledger_card_gateway_"+providerId);
    setGatewayId(current=>{
      if(currentProvider?.gateways.some(g=>g.id===current))return current;
      const remembered=currentProvider?.gateways.find(g=>g.id===rememberedGateway);
      return remembered?.id??currentProvider?.gateways[0]?.id??"";
    });
  },[providerId,providers]);

  useEffect(()=>{
    if(gatewayId&&providerId)localStorage.setItem("cashledger_card_gateway_"+providerId,gatewayId);
  },[gatewayId,providerId]);

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

  async function createQuickCustomer(){
    if(!quickName.trim()||!quickMobile.trim()||quickLastFour.length!==4)return;
    setError("");setQuickSaving(true);
    try{
      const created=await apiFetch<QuickCustomerResult>("/customers/quick-card",{
        method:"POST",
        body:JSON.stringify({fullName:quickName.trim(),mobile:quickMobile.trim(),lastFourDigits:quickLastFour}),
      });
      const next:Customer={id:created.customer.id,fullName:created.customer.fullName,cards:[created.card]};
      setCustomers(current=>[next,...current]);
      setCustomerId(created.customer.id);
      setCardId(created.card.id);
      setQuickName("");setQuickMobile("");setQuickLastFour("");
      setCustomerMode("existing");
    }catch(err){setError(err instanceof Error?err.message:"Failed to create customer");}
    finally{setQuickSaving(false);}
  }

  async function submit(e:FormEvent){
    e.preventDefault();setError("");setSaving(true);
    try{
      await apiFetch("/transactions/card-swipe",{method:"POST",body:JSON.stringify({
        customerId,customerCardId:cardId,swipeAmount:swipe,providerId,gatewayId,
        providerChargeRate:pRate,commissionRate:cRate,paymentTermId:termId,
        dueAt:new Date(dueAt).toISOString(),
        settledNow,
        settlementDueAt:settlementDueAt?new Date(settlementDueAt).toISOString():undefined,
        referenceNumber:reference||undefined,
        notes:notes||undefined,
      })});
      router.push("/payables");
    }catch(err){setError(err instanceof Error?err.message:"Failed to save swipe");}
    finally{setSaving(false);}
  }

  if(loading)return <AppShell><PageLoader label="Preparing card swipe…"/></AppShell>;
  const control="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50";
  const canSave=!saving&&payable>=0&&swipe>0&&!!customerId&&!!cardId&&!!termId&&!!providerId&&!!gatewayId&&!!providerWallet;
  return <AppShell><form onSubmit={submit}>
    <div className="page-enter mx-auto max-w-3xl space-y-3">
      <div className="px-1">
        <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Credit card swipe</h1>
      </div>

      {error?<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

      <Surface className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={()=>setCustomerMode("existing")} className={"min-h-10 rounded-lg text-xs font-bold transition "+(customerMode==="existing"?"bg-white text-slate-950 shadow-sm":"text-slate-500")}>Existing</button>
            <button type="button" onClick={()=>setCustomerMode("new")} className={"min-h-10 rounded-lg text-xs font-bold transition "+(customerMode==="new"?"bg-white text-indigo-700 shadow-sm":"text-slate-500")}>+ New customer</button>
          </div>

          {customerMode==="new"?<div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input className={control} value={quickName} onChange={e=>setQuickName(e.target.value)} maxLength={150}/></Field>
            <Field label="Phone"><input className={control} type="tel" inputMode="tel" value={quickMobile} onChange={e=>setQuickMobile(e.target.value.slice(0,20))} maxLength={20}/></Field>
            <Field label="Card last 4"><input className={control} inputMode="numeric" value={quickLastFour} onChange={e=>setQuickLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4}/></Field>
            <button type="button" onClick={createQuickCustomer} disabled={quickSaving||!quickName.trim()||!quickMobile.trim()||quickLastFour.length!==4} className="min-h-11 rounded-xl bg-indigo-700 px-4 text-sm font-bold text-white disabled:opacity-40 sm:col-span-3">{quickSaving?"Creating…":"Create customer"}</button>
          </div>:<div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Customer"><select className={control} value={customerId} onChange={e=>{setCustomerId(e.target.value);setCardId("");}} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
            <Field label="Card"><select className={control} value={cardId} onChange={e=>setCardId(e.target.value)} required><option value="">Select card</option>{customer?.cards.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.bankName} ••••{c.lastFourDigits}{c.nickname?" · "+c.nickname:""}</option>)}</select></Field>
          </div>}

          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <Field label="Swipe amount"><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">₹</span><input className={control+" pl-8 text-xl font-black tracking-tight"} type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required/></div></Field>
            <Field label="Payment term"><select className={control} value={termId} onChange={e=>setTermId(e.target.value)} required><option value="">Select term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Business commission %"><input className={control} type="number" inputMode="decimal" step="0.0001" min="0" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/></Field>
            {!instantTerm?<Field label="Payable due"><input className={control} type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></Field>:null}
          </div>

          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
            <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Gateway"><select className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)} required><option value="">Select gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
            <Field label="Provider fee %"><input className={control} type="number" inputMode="decimal" step="0.0001" min="0" value={providerRate} onChange={e=>setProviderRate(e.target.value)} required/></Field>
          </div>

          {providerWallet?<div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
            <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{providerWallet.accountName}</p><p className="text-[11px] text-slate-400">Balance {money(providerWallet.currentBalance)}</p></div>
            <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Credit</p><p className="text-sm font-black text-cyan-700">{money(settlement)}</p></div>
          </div>:providerId?<div className="mt-4 rounded-xl bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">Provider wallet unavailable</div>:null}

          <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3">
            <span className="text-sm font-semibold text-slate-700">Wallet credited</span>
            <input type="checkbox" checked={settledNow} onChange={e=>setSettledNow(e.target.checked)} className="h-4 w-4"/>
          </label>

          <button type="button" onClick={()=>setShowOptional(v=>!v)} className="mt-3 flex min-h-10 w-full items-center justify-between text-left text-xs font-bold text-slate-500">
            <span>More details</span><span className="text-base">{showOptional?"−":"+"}</span>
          </button>
          {showOptional?<div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>
            <Field label="Reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)}/></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className={control+" min-h-20 py-3"} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
          </div>:null}
        </div>
      </Surface>

      <div className="rounded-2xl bg-slate-950 p-4 text-white shadow-sm">
        <div className="flex items-end justify-between gap-3 border-b border-white/10 pb-3">
          <span className="text-xs font-semibold text-slate-300">Customer payable</span>
          <strong className="text-2xl font-black tracking-tight">{money(payable)}</strong>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-3 text-center">
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Wallet</p><p className="mt-1 text-xs font-bold text-cyan-300">{money(settlement)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Fee</p><p className="mt-1 text-xs font-bold text-rose-300">{money(providerCharge)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Commission</p><p className="mt-1 text-xs font-bold text-emerald-300">{money(commission)}</p></div>
        </div>
      </div>

      <button disabled={!canSave} className="min-h-13 w-full rounded-2xl bg-[linear-gradient(135deg,#111827,#312e81)] px-5 text-sm font-black text-white shadow-lg disabled:bg-slate-300 disabled:shadow-none">
        {saving?"Saving…":swipe>0?"Save "+money(swipe)+" swipe":"Save card swipe"}
      </button>
    </div>
  </form></AppShell>;
}
