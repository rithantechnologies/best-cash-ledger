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
  const [settlementMode,setSettlementMode]=useState<"wallet"|"other">("wallet");
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
  const providerWallets=accounts.filter(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId);
  const otherSettlementAccounts=accounts.filter(a=>a.accountType==="BANK"||a.accountType==="UPI");
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
      if(currentProvider?.gateways.some(g=>g.id===rememberedGateway))return rememberedGateway||"";
      return currentProvider?.gateways.length===1?currentProvider.gateways[0].id:"";
    });
    const allowed=settlementMode==="wallet"
      ? accounts.filter(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId)
      : accounts.filter(a=>a.accountType==="BANK"||a.accountType==="UPI");
    setSettlementAccountId(current=>allowed.some(a=>a.id===current)?current:(settlementMode==="wallet"?(allowed[0]?.id??""):""));
  },[providerId,providers,accounts,settlementMode]);

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
        <SummaryRow label="Provider fee" value={money(providerCharge)} tone="rose"/>
        <SummaryRow label="Your commission" value={money(commission)} tone="emerald"/>
        <SummaryRow label={settledNow?"Provider credited":"Provider will credit"} value={money(settlement)} tone="cyan"/>
        <SummaryRow label="Customer payable" value={money(payable)} tone="amber"/>
      </>}
      footer={<button disabled={saving||payable<0||swipe<=0||!customerId||!cardId||!termId||!providerId||!gatewayId||!settlementAccountId} className="min-h-12 w-full rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-40">{saving?"Saving transaction…":swipe>0?"Save "+money(swipe)+" swipe":"Save card swipe"}</button>}>

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
          <Field label="Swipe amount" hint={swipe>0?"Customer payable "+money(payable):undefined}><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">₹</span><input className={control+" pl-8 text-lg font-black tracking-tight"} type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required/></div></Field>
          <Field label="Payment term"><select className={control} value={termId} onChange={e=>setTermId(e.target.value)} required><option value="">Select term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Customer payable due"><input className={control} type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></Field>
          <Field label="Business commission %"><input className={control} type="number" step="0.0001" min="0" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/></Field>
        </div>
      </FormSection>

      <FormSection step="2" title="Provider settlement" description="Normally the provider credits its own wallet. Change this only when the provider sends this swipe directly to your bank or UPI.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");setSettlementMode("wallet");setSettlementAccountId("");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Gateway"><select className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)} required><option value="">Select gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
          <Field label="Provider fee %"><input className={control} type="number" inputMode="decimal" step="0.0001" min="0" value={providerRate} onChange={e=>setProviderRate(e.target.value)} required/></Field>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3 sm:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-700">Settlement destination</p><p className="mt-1 text-sm font-bold text-slate-900">{settlementMode==="wallet"?"Provider wallet":"Direct bank / UPI"}</p></div>
              {settlementMode==="wallet"?<span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-cyan-700 shadow-sm ring-1 ring-cyan-100">Normal route</span>:<span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">Exception</span>}
            </div>
            {settlementMode==="wallet"?<>
              {providerWallets.length?<div className="mt-3">
                {providerWallets.length===1?<div className="rounded-xl bg-white px-3 py-3 ring-1 ring-cyan-100"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">{providerWallets[0].accountName}</p><p className="mt-0.5 text-[11px] text-slate-500">Current balance {money(providerWallets[0].currentBalance)}</p></div>{swipe>0?<strong className="text-xs text-cyan-700">+{money(settlement)}</strong>:null}</div></div>:<Field label="Settlement wallet"><select className={control+" mt-1"} value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required>{providerWallets.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)}</option>)}</select></Field>}
                <p className="mt-2 text-[11px] leading-4 text-cyan-800">{provider?.name??"Provider"} will normally credit {money(settlement)} here. Money can be moved later as a separate wallet transfer or customer payout.</p>
              </div>:<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">No wallet is linked to this provider. Use direct bank / UPI below or add the provider wallet in Accounts.</div>}
              <button type="button" onClick={()=>setSettlementMode("other")} className="mt-3 text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4">Provider sends this swipe directly to bank / UPI instead</button>
            </>:<>
              <div className="mt-3"><Field label="Money will be received in"><select className={control} value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Select bank / UPI</option>{otherSettlementAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field></div>
              <button type="button" onClick={()=>setSettlementMode("wallet")} className="mt-3 text-xs font-bold text-cyan-700 underline decoration-cyan-300 underline-offset-4">Use provider wallet instead</button>
            </>}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-bold text-slate-600">Settlement status</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={()=>setSettledNow(false)} className={"min-h-10 rounded-lg text-xs font-bold "+(!settledNow?"bg-white text-slate-950 shadow-sm":"text-slate-500")}>Pending</button>
              <button type="button" onClick={()=>setSettledNow(true)} className={"min-h-10 rounded-lg text-xs font-bold "+(settledNow?"bg-emerald-600 text-white shadow-sm":"text-slate-500")}>Already received</button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">{settledNow?"Use only when the money is already visible in the selected account.":"Cash Ledger will keep this amount in provider clearing until you record the receipt."}</p>
          </div>
        </div>
      </FormSection>

      <FormSection step="3" title="Optional details" description="Most counter swipes can be saved without filling anything here.">
        <button type="button" onClick={()=>setShowOptional(v=>!v)} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm font-bold text-slate-700"><span>{showOptional?"Hide optional details":"Add reference, expected settlement or notes"}</span><span className="text-lg text-slate-400">{showOptional?"−":"+"}</span></button>
        {showOptional?<div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>
          <Field label="Provider reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reference / batch ID"/></Field>
          <Field label="Notes" className="sm:col-span-2"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field>
        </div>:null}
      </FormSection>
    </TransactionFrame>
  </form></AppShell>;
}
