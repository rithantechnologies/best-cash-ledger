"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
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
  const [settlementAccountId,setSettlementAccountId]=useState("");
  const [settledNow,setSettledNow]=useState(false);
  const [settlementDueAt,setSettlementDueAt]=useState("");
  const [reference,setReference]=useState("");
  const [notes,setNotes]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Provider[]>("/providers"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<Term[]>("/settings/payment-terms"),
    ]).then(([c,p,a,t])=>{setCustomers(c);setProviders(p);setAccounts(a);setTerms(t);})
      .catch(e=>setError(e instanceof Error?e.message:"Failed to load form"))
      .finally(()=>setLoading(false));
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
  const payable=swipe-commission;

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
        dueAt:new Date(dueAt).toISOString(),settlementAccountId,
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
  const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
  return <AppShell><form onSubmit={submit}>
    <TransactionFrame eyebrow="Customer service" title="Credit card swipe" description="Capture the swipe, customer payable and provider clearing in one guided flow."
      summary={<>
        <SummaryRow label="Swipe amount" value={money(swipe)}/>
        <SummaryRow label="Provider charge" value={money(providerCharge)} tone="rose"/>
        <SummaryRow label="Business commission" value={money(commission)} tone="emerald"/>
        <SummaryRow label={settledNow?"Settlement received":"Provider clearing"} value={money(settlement)} tone="cyan"/>
        <SummaryRow label="Customer payable" value={money(payable)} tone="amber"/>
      </>}
      footer={<button disabled={saving||payable<0} className="min-h-12 w-full rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-40">{saving?"Saving transaction…":"Save card swipe"}</button>}>

      {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

      <FormSection step="1" title="Customer & amount" description="Use an existing customer or create a new customer here without leaving the swipe.">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={()=>setCustomerMode("existing")} className={"min-h-10 rounded-lg text-xs font-bold transition "+(customerMode==="existing"?"bg-white text-slate-950 shadow-sm":"text-slate-500")}>Existing customer</button>
          <button type="button" onClick={()=>setCustomerMode("new")} className={"min-h-10 rounded-lg text-xs font-bold transition "+(customerMode==="new"?"bg-white text-indigo-700 shadow-sm":"text-slate-500")}>+ New customer</button>
        </div>
        {customerMode==="new"?<div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Customer name"><input className={control} value={quickName} onChange={e=>setQuickName(e.target.value)} maxLength={150} placeholder="Full name"/></Field>
            <Field label="Phone number"><input className={control} type="tel" inputMode="tel" value={quickMobile} onChange={e=>setQuickMobile(e.target.value.slice(0,20))} maxLength={20} placeholder="Mobile number"/></Field>
            <Field label="Card last 4"><input className={control} inputMode="numeric" value={quickLastFour} onChange={e=>setQuickLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} placeholder="1234"/></Field>
          </div>
          <button type="button" onClick={createQuickCustomer} disabled={quickSaving||!quickName.trim()||!quickMobile.trim()||quickLastFour.length!==4} className="mt-3 min-h-11 w-full rounded-xl bg-indigo-700 px-4 text-sm font-bold text-white shadow-sm disabled:opacity-40">{quickSaving?"Creating customer…":"Create & use customer"}</button>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">The customer and card will be saved for future transactions too.</p>
        </div>:null}
        <div className="grid gap-3 sm:grid-cols-2">
          {customerMode==="existing"?<>
            <Field label="Customer"><select className={control} value={customerId} onChange={e=>{setCustomerId(e.target.value);setCardId("");}} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
            <Field label="Saved card"><select className={control} value={cardId} onChange={e=>setCardId(e.target.value)} required><option value="">Select card</option>{customer?.cards.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.bankName} ****{c.lastFourDigits}{c.nickname?" — "+c.nickname:""}</option>)}</select></Field>
          </>:null}
          <Field label="Swipe amount"><input className={control} type="number" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="₹ 0.00" required/></Field>
          <Field label="Payment term"><select className={control} value={termId} onChange={e=>setTermId(e.target.value)} required><option value="">Select term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Customer payable due"><input className={control} type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></Field>
          <Field label="Business commission %"><input className={control} type="number" step="0.0001" min="0" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/></Field>
        </div>
      </FormSection>

      <FormSection step="2" title="Provider settlement" description="Where the processor sends the money and whether it has actually arrived yet.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");setSettlementAccountId("");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Gateway"><select className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)} required><option value="">Select gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
          <Field label="Provider charge %"><input className={control} type="number" step="0.0001" min="0" value={providerRate} onChange={e=>setProviderRate(e.target.value)} required/></Field>
          <Field label="Settlement target account"><select className={control} value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Wallet / bank receiving settlement</option>{accounts.filter(a=>a.accountType==="BANK"||a.accountType==="UPI"||(a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId)).map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
          <Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"><input type="checkbox" checked={settledNow} onChange={e=>setSettledNow(e.target.checked)} className="h-4 w-4"/><span><strong className="block text-emerald-900">Already settled</strong><span className="text-[11px] text-emerald-700">Use only when funds are visible in the target account.</span></span></label>
        </div>
      </FormSection>

      <FormSection step="3" title="Reference & notes" description="Optional reconciliation details for audit and search.">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Provider reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reference / batch ID"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div>
      </FormSection>
    </TransactionFrame>
  </form></AppShell>;
}
