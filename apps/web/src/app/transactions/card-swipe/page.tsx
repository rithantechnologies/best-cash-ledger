"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Card={id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean};
type Customer={id:string;fullName:string;mobile:string|null;cards:Card[]};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string};
type Provider={id:string;name:string;gateways:Gateway[]};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;providerId:string|null};
type Term={id:string;name:string;durationValue:number;durationUnit:string;defaultCommissionRate:string};
type CommissionRule={commissionType:string;commissionRate:string}|null;
type PaymentLeg={sourceAccountId:string;amount:string};
type CustomerPreference={providerId:string;gatewayId:string;commissionRate:string;termId:string};
type SavedSwipe={
  transaction:{id:string;transactionNumber:string;grossAmount:string;netAmount:string};
  payable:{id:string;originalAmount:string;paidAmount:string;remainingAmount:string;status:string};
  providerSettlement:{id:string;expectedAmount:string;receivedAmount:string;remainingAmount:string;status:string};
  payoutTransactions:{id:string}[];
  createdCustomer:{customer:{id:string;fullName:string;mobile:string|null};card:Card}|null;
};

function money(v:number|string){
  const value=Number(v||0);
  return new Intl.NumberFormat("en-IN",{
    style:"currency",currency:"INR",
    minimumFractionDigits:Number.isInteger(value)?0:2,
    maximumFractionDigits:2,
  }).format(value);
}

function dateTimeLocal(date:Date){
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function formatAmountInput(value:string){
  if(!value)return "";
  const [whole="",dec] = value.split(".");
  const digits=whole.replace(/\D/g,"");
  const formatted=digits?Number(digits).toLocaleString("en-IN"):"";
  return dec!==undefined?formatted+"."+dec:formatted;
}
function cleanAmountInput(value:string){
  const cleaned=value.replace(/,/g,"").replace(/[^\d.]/g,"");
  const first=cleaned.indexOf(".");
  if(first<0)return cleaned;
  return cleaned.slice(0,first+1)+cleaned.slice(first+1).replace(/\./g,"").slice(0,2);
}
function rateText(value:number){
  return Number(value.toFixed(2)).toString();
}

function RateControl({
  value,onChange,recent,suggested,
}:{value:number;onChange:(value:number)=>void;recent:number[];suggested:number|null}){
  const [otherOpen,setOtherOpen]=useState(false);
  const set=(next:number)=>onChange(Math.min(5,Math.max(0,Math.round(next*100)/100)));
  const common=[0.2,0.5,1,1.5,2];
  const smart=[suggested,...recent]
    .filter((rate):rate is number=>rate!==null&&Number.isFinite(rate)&&rate>=0&&rate<=5)
    .filter((rate,index,list)=>list.findIndex(x=>Math.abs(x-rate)<.001)===index)
    .filter(rate=>!common.some(x=>Math.abs(x-rate)<.001))
    .slice(0,3);
  const known=[...common,...smart].some(rate=>Math.abs(rate-value)<.001);
  const showExact=otherOpen||!known;
  return <div>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {common.map(rate=><button key={rate} type="button" onClick={()=>{set(rate);setOtherOpen(false);}} className={"min-h-10 rounded-lg border px-2 text-xs font-semibold "+(Math.abs(rate-value)<.001&&!showExact?"border-[var(--text)] bg-[var(--text)] text-[var(--surface)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text)]")}>{rateText(rate)}%</button>)}
      <button type="button" onClick={()=>setOtherOpen(true)} className={"min-h-10 rounded-lg border px-2 text-xs font-semibold "+(showExact?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text)]")}>Other</button>
    </div>
    {smart.length?<div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-[10px] text-[var(--text-muted)]">{suggested!==null&&smart.some(x=>Math.abs(x-suggested)<.001)?"Suggested / recent":"Recent"}</span>{smart.map(rate=><button key={rate} type="button" onClick={()=>{set(rate);setOtherOpen(false);}} className={"min-h-7 rounded-md px-2 text-[11px] font-semibold "+(Math.abs(rate-value)<.001&&!showExact?"bg-[var(--accent-soft)] text-[var(--accent)]":"text-[var(--text-muted)] underline decoration-[var(--border)] underline-offset-4")}>{rateText(rate)}%</button>)}</div>:null}
    {showExact?<div className="mt-3 grid grid-cols-[40px_minmax(0,180px)_40px] items-center gap-2">
      <button type="button" onClick={()=>set(value-.1)} className="grid h-10 place-items-center rounded-lg border border-[var(--border)] text-lg text-[var(--text-muted)]">−</button>
      <div className="relative"><input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-8 text-center text-base font-semibold" type="number" inputMode="decimal" min="0" max="5" step="0.01" value={rateText(value)} onChange={e=>set(Number(e.target.value||0))}/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)]">%</span></div>
      <button type="button" onClick={()=>set(value+.1)} className="grid h-10 place-items-center rounded-lg border border-[var(--border)] text-lg text-[var(--text-muted)]">+</button>
    </div>:null}
  </div>;
}

function ReceiptSummary({
  customerName,swipe,providerCharge,commission,payable,paid,remaining,showPaid,
}:{
  customerName:string;swipe:number;providerCharge:number;commission:number;payable:number;paid:number;remaining:number;showPaid:boolean;
}){
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
    <p className="text-xs font-semibold text-[var(--text-muted)]">Calculation</p>
    <div className="mt-3 space-y-2.5 text-sm">
      <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-muted)]">Swipe</span><strong className="money">{money(swipe)}</strong></div>
      <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-muted)]">− Gateway fee</span><strong className="money">{money(providerCharge)}</strong></div>
      <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-muted)]">− Your commission</span><strong className="money">{money(commission)}</strong></div>
      <div className="flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3"><span className="font-semibold">{customerName?customerName+" gets":"Customer gets"}</span><strong className="money text-xl tracking-[-.025em]">{money(payable)}</strong></div>
      {showPaid?<div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3"><div className="rounded-xl bg-[var(--surface-soft)] p-2.5"><p className="text-[10px] text-[var(--text-muted)]">Paid</p><p className="money mt-1 text-sm font-semibold text-[var(--money-in)]">{money(paid)}</p></div><div className="rounded-xl bg-[var(--surface-soft)] p-2.5"><p className="text-[10px] text-[var(--text-muted)]">Remaining</p><p className={"money mt-1 text-sm font-semibold "+(remaining>.001?"text-amber-600":"text-[var(--money-in)]")}>{money(remaining)}</p></div></div>:null}
    </div>
  </div>;
}

export default function CardSwipePage(){
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [providers,setProviders]=useState<Provider[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [terms,setTerms]=useState<Term[]>([]);
  const [customerId,setCustomerId]=useState("");
  const [cardId,setCardId]=useState("");
  const [customerSearch,setCustomerSearch]=useState("");
  const [customerMode,setCustomerMode]=useState<"existing"|"new">("existing");
  const [quickName,setQuickName]=useState("");
  const [quickMobile,setQuickMobile]=useState("");
  const [quickBank,setQuickBank]=useState("");
  const [quickLastFour,setQuickLastFour]=useState("");
  const [amount,setAmount]=useState("");
  const [providerId,setProviderId]=useState("");
  const [gatewayId,setGatewayId]=useState("");
  const [providerRate,setProviderRate]=useState("0");
  const [commissionRate,setCommissionRate]=useState("0");
  const [suggestedCommission,setSuggestedCommission]=useState<number|null>(null);
  const [recentRates,setRecentRates]=useState<number[]>([]);
  const [termId,setTermId]=useState("");
  const [dueAt,setDueAt]=useState(dateTimeLocal(new Date()));
  const [settledNow,setSettledNow]=useState(true);
  const [recordCustomerPayment,setRecordCustomerPayment]=useState(false);
  const [paymentLegs,setPaymentLegs]=useState<PaymentLeg[]>([{sourceAccountId:"",amount:""}]);
  const [payoutTouched,setPayoutTouched]=useState(false);
  const [settlementDueAt,setSettlementDueAt]=useState("");
  const [reference,setReference]=useState("");
  const [notes,setNotes]=useState("");
  const [routingOpen,setRoutingOpen]=useState(false);
  const [termOpen,setTermOpen]=useState(false);
  const [showOptional,setShowOptional]=useState(false);
  const [mobileSummaryOpen,setMobileSummaryOpen]=useState(false);
  const [saved,setSaved]=useState<SavedSwipe|null>(null);
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
      try{
        const rates=JSON.parse(localStorage.getItem("cashledger_card_commission_recent")||"[]");
        if(Array.isArray(rates))setRecentRates(rates.map(Number).filter(Number.isFinite).slice(0,3));
      }catch{}
      const instant=t.find(x=>x.name.toLowerCase().includes("instant"))??t[0];
      if(instant)setTermId(current=>current||instant.id);
      const remembered=localStorage.getItem("cashledger_card_provider");
      const initial=p.find(x=>x.id===remembered)?.id||(p.length===1?p[0].id:"");
      if(initial)setProviderId(initial);
      const params=new URLSearchParams(window.location.search);
      const presetCustomerId=params.get("customerId");
      const presetCardId=params.get("cardId");
      const presetCustomer=c.find(x=>x.id===presetCustomerId);
      if(presetCustomer){
        setCustomerId(presetCustomer.id);
        setCustomerSearch(presetCustomer.fullName+(presetCustomer.mobile?" · "+presetCustomer.mobile:""));
        if(presetCardId&&presetCustomer.cards.some(card=>card.id===presetCardId&&card.isActive))setCardId(presetCardId);
      }
    }).catch(e=>setError(e instanceof Error?e.message:"Failed to load form"))
      .finally(()=>setLoading(false));
  },[]);

  const customer=customers.find(c=>c.id===customerId);
  const selectedCard=customer?.cards.find(c=>c.id===cardId);
  const customerNeedle=customerSearch.trim().toLowerCase();
  const customerDigits=customerSearch.replace(/\D/g,"");
  const customerMatches=customerNeedle?customers.filter(c=>
    c.fullName.toLowerCase().includes(customerNeedle)||
    (c.mobile??"").includes(customerDigits||customerNeedle)||
    (!!customerDigits&&c.cards.some(card=>card.isActive&&card.lastFourDigits.includes(customerDigits)))
  ).slice(0,8):[];
  const provider=providers.find(p=>p.id===providerId);
  const gateway=provider?.gateways.find(g=>g.id===gatewayId);
  const providerWallet=accounts.find(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId);
  const selectedTerm=terms.find(t=>t.id===termId);
  const instantTerm=selectedTerm?.name.toLowerCase().includes("instant")??false;
  const swipe=Number(amount||0);
  const pRate=Number(providerRate||0);
  const cRate=Number(commissionRate||0);
  const providerCharge=Math.round(swipe*pRate)/100;
  const commission=Math.round(swipe*cRate)/100;
  const settlement=Math.round((swipe-providerCharge)*100)/100;
  const rawPayable=Math.round((swipe-providerCharge-commission)*100)/100;
  const payable=Math.max(0,rawPayable);
  const liquidAccounts=accounts.filter(a=>["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType));
  const paymentTotal=Math.round(paymentLegs.reduce((sum,leg)=>sum+Number(leg.amount||0),0)*100)/100;
  const paidAmount=recordCustomerPayment?paymentTotal:0;
  const remainingAmount=Math.max(0,Math.round((payable-paidAmount)*100)/100);
  const payoutRequiredByAccount=(recordCustomerPayment?paymentLegs:[]).reduce((map,leg)=>{
    if(leg.sourceAccountId)map.set(leg.sourceAccountId,(map.get(leg.sourceAccountId)??0)+Number(leg.amount||0));
    return map;
  },new Map<string,number>());
  const payoutBalanceShort=[...payoutRequiredByAccount.entries()].some(([id,required])=>{
    const account=liquidAccounts.find(a=>a.id===id);
    const incoming=settledNow&&providerWallet?.id===id?settlement:0;
    return !account||required>account.currentBalance+incoming+0.001;
  });

  useEffect(()=>{
    setProviderRate(gateway?String(Number(gateway.defaultChargeRate)):"0");
  },[gatewayId,gateway]);

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
    if(!customerId)return;
    try{
      const raw=localStorage.getItem("cashledger_card_customer_pref_"+customerId);
      if(!raw)return;
      const pref=JSON.parse(raw) as CustomerPreference;
      if(providers.some(p=>p.id===pref.providerId)){
        setProviderId(pref.providerId);
        const p=providers.find(x=>x.id===pref.providerId);
        if(p?.gateways.some(g=>g.id===pref.gatewayId))setGatewayId(pref.gatewayId);
      }
      if(terms.some(t=>t.id===pref.termId))setTermId(pref.termId);
      if(Number.isFinite(Number(pref.commissionRate)))setCommissionRate(String(Number(pref.commissionRate)));
    }catch{}
  },[customerId,providers,terms]);

  useEffect(()=>{
    const term=terms.find(t=>t.id===termId);
    if(!term)return;
    let hasCustomerPreference=false;
    if(customerId){
      try{hasCustomerPreference=!!localStorage.getItem("cashledger_card_customer_pref_"+customerId);}catch{}
    }
    if(!hasCustomerPreference)setCommissionRate(String(Number(term.defaultCommissionRate)));
    const multiplier=term.durationUnit==="DAYS"?24*60*60*1000:60*60*1000;
    setDueAt(dateTimeLocal(new Date(Date.now()+term.durationValue*multiplier)));
  },[termId,terms,customerId]);

  useEffect(()=>{
    if(!customerId)return;
    const q=new URLSearchParams({transactionType:"CARD_SWIPE",customerId});
    if(providerId)q.set("providerId",providerId);
    if(gatewayId)q.set("gatewayId",gatewayId);
    if(termId)q.set("paymentTermId",termId);
    apiFetch<CommissionRule>("/settings/commission-rules/resolve?"+q.toString())
      .then(rule=>{
        if(!rule){setSuggestedCommission(null);return;}
        const resolved=Number(rule.commissionRate);
        setSuggestedCommission(resolved);
        let hasPreference=false;
        try{hasPreference=!!localStorage.getItem("cashledger_card_customer_pref_"+customerId);}catch{}
        if(!hasPreference)setCommissionRate(String(resolved));
      }).catch(()=>{});
  },[customerId,providerId,gatewayId,termId]);

  useEffect(()=>{
    if(!recordCustomerPayment||payoutTouched||paymentLegs.length!==1)return;
    const nextAmount=payable>0?String(payable):"";
    setPaymentLegs(current=>{
      if(!current[0]||current[0].amount===nextAmount)return current;
      return [{...current[0],amount:nextAmount}];
    });
  },[payable,recordCustomerPayment,payoutTouched,paymentLegs.length]);

  function selectCustomer(next:Customer){
    const matchingCard=customerDigits?next.cards.find(card=>card.isActive&&card.lastFourDigits.includes(customerDigits)):undefined;
    const activeCards=next.cards.filter(card=>card.isActive);
    setCustomerId(next.id);
    setCustomerSearch(next.fullName+(next.mobile?" · "+next.mobile:""));
    setCardId(matchingCard?.id??(activeCards.length===1?activeCards[0].id:""));
  }

  function clearCustomer(){
    setCustomerId("");setCardId("");setCustomerSearch("");
  }

  function beginNewCustomer(){
    clearCustomer();
    setCustomerMode("new");
    setSuggestedCommission(null);
    setCommissionRate(String(Number(selectedTerm?.defaultCommissionRate??0)));
  }

  function startCustomerPayment(){
    if(recordCustomerPayment)return;
    let source="";
    try{source=localStorage.getItem("cashledger_card_payout_source")||"";}catch{}
    if(!liquidAccounts.some(a=>a.id===source)){
      source=settledNow&&providerWallet?providerWallet.id:(liquidAccounts.find(a=>a.accountType==="CASH")?.id??liquidAccounts[0]?.id??"");
    }
    setPayoutTouched(false);
    setPaymentLegs([{sourceAccountId:source,amount:payable>0?String(payable):""}]);
    setRecordCustomerPayment(true);
  }

  function deferCustomerPayment(){
    setRecordCustomerPayment(false);
    setPayoutTouched(false);
  }

  function updatePaymentLeg(index:number,patch:Partial<PaymentLeg>){
    if(patch.amount!==undefined)setPayoutTouched(true);
    setPaymentLegs(current=>current.map((leg,i)=>i===index?{...leg,...patch}:leg));
    if(index===0&&patch.sourceAccountId){
      try{localStorage.setItem("cashledger_card_payout_source",patch.sourceAccountId);}catch{}
    }
  }

  function addPaymentSource(){
    setPayoutTouched(true);
    setPaymentLegs(current=>[...current,{sourceAccountId:"",amount:""}]);
  }

  function removePaymentSource(index:number){
    setPayoutTouched(true);
    setPaymentLegs(current=>current.filter((_,i)=>i!==index));
  }

  function updateCommission(next:number){
    setCommissionRate(rateText(Math.min(5,Math.max(0,next))));
  }

  function savePreferences(targetCustomerId?:string){
    try{
      const nextRates=[cRate,...recentRates].filter((rate,index,list)=>rate>=0&&rate<=5&&list.findIndex(x=>Math.abs(x-rate)<.001)===index).slice(0,3);
      localStorage.setItem("cashledger_card_commission_recent",JSON.stringify(nextRates));
      setRecentRates(nextRates);
      if(targetCustomerId)localStorage.setItem("cashledger_card_customer_pref_"+targetCustomerId,JSON.stringify({providerId,gatewayId,commissionRate:rateText(cRate),termId} satisfies CustomerPreference));
    }catch{}
  }

  async function submit(e:FormEvent){
    e.preventDefault();setError("");setSaving(true);
    try{
      const result=await apiFetch<SavedSwipe>("/transactions/card-swipe",{method:"POST",body:JSON.stringify({
        ...(customerMode==="new"?{
          newCustomer:{
            fullName:quickName.trim(),mobile:quickMobile.trim(),
            bankName:quickBank.trim(),lastFourDigits:quickLastFour,
          },
        }:{customerId,customerCardId:cardId}),
        swipeAmount:swipe,providerId,gatewayId,
        providerChargeRate:pRate,commissionRate:cRate,paymentTermId:termId,
        dueAt:new Date(dueAt).toISOString(),
        settledNow,
        customerPayments:recordCustomerPayment?paymentLegs.map(leg=>({
          sourceAccountId:leg.sourceAccountId,amount:Number(leg.amount),
        })):undefined,
        settlementDueAt:settlementDueAt?new Date(settlementDueAt).toISOString():undefined,
        referenceNumber:reference||undefined,
        notes:notes||undefined,
      })});
      let preferenceCustomerId=customerId;
      if(result.createdCustomer){
        const next:Customer={
          id:result.createdCustomer.customer.id,
          fullName:result.createdCustomer.customer.fullName,
          mobile:result.createdCustomer.customer.mobile,
          cards:[result.createdCustomer.card],
        };
        setCustomers(current=>[next,...current]);
        setCustomerId(next.id);
        setCustomerSearch(next.fullName+(next.mobile?" · "+next.mobile:""));
        setCardId(result.createdCustomer.card.id);
        setCustomerMode("existing");
        preferenceCustomerId=next.id;
      }
      savePreferences(preferenceCustomerId);
      setSaved(result);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(err){setError(err instanceof Error?err.message:"Failed to save swipe");}
    finally{setSaving(false);}
  }

  function repeatSwipe(){
    setSaved(null);
    setAmount("");
    setSettledNow(true);
    setRecordCustomerPayment(false);
    setPayoutTouched(false);
    setPaymentLegs([{sourceAccountId:"",amount:""}]);
    setSettlementDueAt("");
    setReference("");
    setNotes("");
    setShowOptional(false);
    setMobileSummaryOpen(false);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function newCustomerSwipe(){
    repeatSwipe();
    clearCustomer();
    setCustomerMode("existing");
    setQuickName("");setQuickMobile("");setQuickBank("");setQuickLastFour("");
  }

  if(loading)return <AppShell><PageLoader label="Preparing card swipe…"/></AppShell>;

  if(saved){
    const savedRemaining=Number(saved.payable.remainingAmount||0);
    const savedPaid=Number(saved.payable.paidAmount||0);
    return <AppShell><div className="page-enter mx-auto max-w-2xl space-y-4 py-2 sm:py-6">
      <Surface className="overflow-hidden">
        <div className="p-5 text-center sm:p-7">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">✓</div>
          <h1 className="mt-4 text-2xl font-semibold tracking-[-.03em]">Swipe saved</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{saved.transaction.transactionNumber}</p>
          <div className="mx-auto mt-5 max-w-sm rounded-2xl bg-[var(--surface-soft)] p-4">
            <p className="text-xs text-[var(--text-muted)]">{customer?.fullName??saved.createdCustomer?.customer.fullName??"Customer"} gets</p>
            <p className="money mt-1 text-3xl font-semibold">{money(saved.payable.originalAmount)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[10px] text-[var(--text-muted)]">Paid</p><p className="money mt-1 text-xs font-semibold text-[var(--money-in)]">{money(savedPaid)}</p></div>
              <div><p className="text-[10px] text-[var(--text-muted)]">Remaining</p><p className="money mt-1 text-xs font-semibold">{money(savedRemaining)}</p></div>
              <div><p className="text-[10px] text-[var(--text-muted)]">Wallet</p><p className="money mt-1 text-xs font-semibold text-cyan-600">{money(saved.providerSettlement.expectedAmount)}</p></div>
            </div>
          </div>
        </div>
        <div className="grid gap-2 border-t border-[var(--border)] p-4 sm:grid-cols-2">
          {savedRemaining>.001?<Link href={"/payables/"+saved.payable.id} className="min-h-11 rounded-xl bg-[var(--text)] px-4 py-3 text-center text-sm font-semibold text-[var(--surface)]">Pay customer</Link>:null}
          <Link href={"/transactions/"+saved.transaction.id} className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold">Open transaction</Link>
          <button type="button" onClick={repeatSwipe} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">Repeat same customer</button>
          <button type="button" onClick={newCustomerSwipe} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold">New swipe</button>
        </div>
      </Surface>
    </div></AppShell>;
  }

  const control="app-control";
  const payoutValid=!recordCustomerPayment||(
    paymentLegs.length>0&&
    paymentLegs.every(leg=>!!leg.sourceAccountId&&Number(leg.amount)>0)&&
    paidAmount>0&&paidAmount<=payable+0.001&&!payoutBalanceShort
  );
  const customerReady=customerMode==="new"
    ? !!quickName.trim()&&!!quickMobile.trim()&&!!quickBank.trim()&&quickLastFour.length===4
    : !!customerId&&!!cardId;
  const canSave=!saving&&rawPayable>=-0.001&&settlement>0&&swipe>0&&customerReady&&!!termId&&!!providerId&&!!gatewayId&&!!providerWallet&&payoutValid;
  const routingReady=!!provider&&!!gateway&&!!providerWallet;
  const displayCustomerName=customer?.fullName??(customerMode==="new"?quickName.trim():"");
  const saveLabel=swipe<=0?"Save card swipe":recordCustomerPayment
    ? (remainingAmount<=.001?"Save & pay "+money(payable):"Save & record "+money(paidAmount))
    : "Save · pay "+money(payable)+" later";

  return <AppShell><form onSubmit={submit}>
    <div className="page-enter mx-auto max-w-7xl pb-28 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5 lg:pb-0">
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <div><h1 className="text-xl font-semibold tracking-[-.025em] sm:text-2xl">Credit card swipe</h1><p className="mt-1 hidden text-sm text-[var(--text-muted)] sm:block">Customer, swipe amount and payout in one flow.</p></div>
          <span className="hidden text-xs text-[var(--text-muted)] sm:block">Card details stored as last 4 only</span>
        </div>

        {error?<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

        <Surface className="overflow-visible">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Customer</h2>
              {customerMode==="existing"?<button type="button" onClick={beginNewCustomer} className="text-xs font-semibold text-[var(--accent)]">+ New customer</button>:<button type="button" onClick={()=>setCustomerMode("existing")} className="text-xs font-semibold text-[var(--accent)]">Use existing</button>}
            </div>

            {customerMode==="new"?<div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Name"><input className={control} value={quickName} onChange={e=>setQuickName(e.target.value)} maxLength={150} autoFocus/></Field>
              <Field label="Phone"><input className={control} type="tel" inputMode="tel" value={quickMobile} onChange={e=>setQuickMobile(e.target.value.slice(0,20))} maxLength={20}/></Field>
              <Field label="Card bank"><input className={control} value={quickBank} onChange={e=>setQuickBank(e.target.value)} maxLength={100} placeholder="HDFC, ICICI, SBI…"/></Field>
              <Field label="Card last 4"><input className={control} inputMode="numeric" value={quickLastFour} onChange={e=>setQuickLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4}/></Field>
              <p className="text-[11px] text-[var(--text-muted)] sm:col-span-2">Customer and card will be created together when this swipe is saved.</p>
            </div>:customer?<div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{customer.fullName}</p><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{customer.mobile||"No mobile"}{selectedCard?" · "+selectedCard.bankName+" ••••"+selectedCard.lastFourDigits:""}</p></div>
                <button type="button" onClick={clearCustomer} className="shrink-0 text-xs font-semibold text-[var(--accent)]">Change</button>
              </div>
              {customer.cards.filter(c=>c.isActive).length>1?<select className="app-control mt-3" value={cardId} onChange={e=>setCardId(e.target.value)} required><option value="">Select card</option>{customer.cards.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.bankName} ••••{c.lastFourDigits}{c.nickname?" · "+c.nickname:""}</option>)}</select>:null}
            </div>:<div className="relative mt-3">
              <input className="app-control h-13 text-base" inputMode="search" value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search name, mobile or card last 4" autoComplete="off" autoFocus/>
              {customerSearch.trim()?<div className="absolute inset-x-0 top-[calc(100%+.4rem)] z-40 max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl">
                {customerMatches.length?customerMatches.map(match=>{
                  const matchDigits=customerDigits?match.cards.filter(card=>card.isActive&&card.lastFourDigits.includes(customerDigits)):[];
                  return <button key={match.id} type="button" onClick={()=>selectCustomer(match)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--surface-soft)]">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{match.fullName}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{match.mobile||"No mobile"}{matchDigits.length?" · "+matchDigits.map(x=>"••••"+x.lastFourDigits).join(", "):""}</p></div>
                    <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">Use</span>
                  </button>;
                }):<button type="button" onClick={beginNewCustomer} className="w-full rounded-lg px-3 py-4 text-left text-xs font-semibold text-[var(--accent)]">No match · Create new customer</button>}
              </div>:null}
            </div>}
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1.35fr)_minmax(220px,.65fr)] sm:items-start">
              <Field label="Swipe amount">
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-[var(--text-muted)]">₹</span>
                  <input
                    className="h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-4 text-3xl font-semibold tracking-[-.04em] outline-none"
                    type="text" inputMode="decimal" value={formatAmountInput(amount)}
                    onChange={e=>setAmount(cleanAmountInput(e.target.value))}
                    placeholder="0.00" aria-label="Swipe amount" required
                  />
                </div>
              </Field>

              <div className="rounded-xl bg-[var(--surface-soft)] p-3.5">
                <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--text-muted)]">Payment term</span><button type="button" onClick={()=>setTermOpen(v=>!v)} className="text-xs font-semibold text-[var(--accent)]">{termOpen?"Done":"Change"}</button></div>
                <p className="mt-1 text-base font-semibold">{selectedTerm?.name??"Select term"}</p>
              </div>
            </div>

            {termOpen?<div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">{terms.map(term=><button key={term.id} type="button" onClick={()=>{setTermId(term.id);setTermOpen(false);}} className={"min-h-9 rounded-full border px-3 text-xs font-semibold "+(term.id===termId?"border-[var(--text)] bg-[var(--text)] text-[var(--surface)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{term.name}</button>)}</div>:null}
            {!instantTerm?<div className="mt-4 max-w-sm"><Field label="Customer payable due"><input className={control} type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></Field></div>:null}

            <div className="mt-5 border-t border-[var(--border)] pt-5">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Business commission</h2>{swipe>0?<span className="money text-sm font-semibold text-[var(--money-in)]">{money(commission)}</span>:null}</div>
              <RateControl value={cRate} onChange={updateCommission} recent={recentRates} suggested={suggestedCommission}/>
            </div>
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Provider settlement</h2>{routingReady?<button type="button" onClick={()=>setRoutingOpen(v=>!v)} className="text-xs font-semibold text-[var(--accent)]">{routingOpen?"Done":"Change"}</button>:null}</div>

            {routingReady&&!routingOpen?<div className="mt-3">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] p-3.5">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{provider?.name} · {gateway?.gatewayName}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">Provider fee {rateText(pRate)}%</p></div>
                <div className="text-right"><p className="text-[10px] text-[var(--text-muted)]">Fee</p><p className="money text-sm font-semibold text-[var(--money-out)]">−{money(providerCharge)}</p></div>
              </div>
            </div>:<div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");setProviderRate("0");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Gateway"><select className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)} disabled={!provider?.gateways.length} required><option value="">{provider&&provider.gateways.length===0?"No gateway set":"Select gateway"}</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
              <Field label="Provider fee %"><input className={control} type="number" inputMode="decimal" step="0.0001" min="0" value={providerRate} onChange={e=>setProviderRate(e.target.value)} required/></Field>
            </div>}

            {providerWallet?<div className="mt-4 space-y-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{providerWallet.accountName}</p>{settledNow?<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Credited</span>:<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Pending</span>}</div><p className="mt-1 text-xs text-[var(--text-muted)]">{money(providerWallet.currentBalance)} now → <strong className="font-semibold text-[var(--text)]">{money(providerWallet.currentBalance+settlement)}</strong> after credit</p></div>
                  <div className="text-right"><p className="text-[10px] text-[var(--text-muted)]">Credit</p><p className="money text-sm font-semibold text-cyan-600">{money(settlement)}</p></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={()=>setSettledNow(true)} className={"min-h-10 rounded-lg text-xs font-semibold "+(settledNow?"bg-[var(--surface)] text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>Credited</button>
                <button type="button" onClick={()=>setSettledNow(false)} className={"min-h-10 rounded-lg text-xs font-semibold "+(!settledNow?"bg-[var(--surface)] text-amber-700 shadow-sm":"text-[var(--text-muted)]")}>Not yet</button>
              </div>
            </div>:providerId?<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">Provider wallet unavailable</div>:null}
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Customer payout</h2>
              <div className="flex items-center gap-2">{instantTerm&&!recordCustomerPayment?<span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">Due now</span>:null}{recordCustomerPayment&&remainingAmount<=.001?<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Settled</span>:null}</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
              <button type="button" onClick={deferCustomerPayment} className={"min-h-10 rounded-lg text-xs font-semibold "+(!recordCustomerPayment?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Not paid yet</button>
              <button type="button" onClick={startCustomerPayment} className={"min-h-10 rounded-lg text-xs font-semibold "+(recordCustomerPayment?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Pay now / already paid</button>
            </div>

            {!recordCustomerPayment?<div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-[var(--border)] px-3.5 py-3"><span className="text-xs text-[var(--text-muted)]">Remaining payable</span><strong className="money text-sm text-amber-600">{money(payable)}</strong></div>:<div className="mt-3 space-y-2">
              {paymentLegs.map((leg,index)=><div key={index} className="grid grid-cols-[minmax(0,1fr)_116px_32px] items-center gap-2 rounded-xl border border-[var(--border)] p-2 sm:grid-cols-[minmax(0,1fr)_150px_36px]">
                <select className={control+" min-w-0 text-xs"} value={leg.sourceAccountId} onChange={e=>updatePaymentLeg(index,{sourceAccountId:e.target.value})}>
                  <option value="">Paid from</option>
                  {liquidAccounts.map(a=>{
                    const incoming=settledNow&&providerWallet?.id===a.id?settlement:0;
                    const usedElsewhere=paymentLegs.some((other,i)=>i!==index&&other.sourceAccountId===a.id);
                    return <option key={a.id} value={a.id} disabled={usedElsewhere}>{a.accountName} · {money(a.currentBalance+incoming)}</option>;
                  })}
                </select>
                <div className="relative"><span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--text-muted)]">₹</span><input className={control+" min-w-0 pl-7 pr-2 text-right text-sm font-semibold"} type="text" inputMode="decimal" value={formatAmountInput(leg.amount)} onChange={e=>updatePaymentLeg(index,{amount:cleanAmountInput(e.target.value)})}/></div>
                <button type="button" aria-label="Remove payment source" disabled={paymentLegs.length===1} onClick={()=>removePaymentSource(index)} className="grid h-10 w-8 place-items-center rounded-lg text-base font-semibold text-[var(--text-muted)] disabled:opacity-20 sm:w-9">×</button>
              </div>)}
              <div className="flex items-center justify-between gap-3 pt-1">
                {paymentLegs.length<5&&paidAmount<payable-.001?<button type="button" onClick={addPaymentSource} className="min-h-9 text-xs font-semibold text-[var(--accent)]">+ Pay from another account</button>:<span/>}
                <div className="text-right text-xs"><span className="text-[var(--text-muted)]">Remaining </span><strong className={remainingAmount>.001?"text-amber-600":"text-[var(--money-in)]"}>{money(remainingAmount)}</strong></div>
              </div>
              {paidAmount>payable+.001?<p className="text-xs font-semibold text-rose-600">Paid amount is more than customer payable.</p>:payoutBalanceShort?<p className="text-xs font-semibold text-rose-600">One selected account does not have enough balance.</p>:null}
            </div>}
          </div>
        </Surface>

        <Surface className="overflow-hidden">
          <button type="button" onClick={()=>setShowOptional(v=>!v)} className="flex min-h-12 w-full items-center justify-between px-4 text-left sm:px-5">
            <span className="text-sm font-semibold">More details</span><span className="text-lg text-[var(--text-muted)]">{showOptional?"−":"+"}</span>
          </button>
          {showOptional?<div className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2 sm:p-5">
            {!settledNow?<Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>:null}
            <Field label="Reference" className={settledNow?"sm:col-span-2":undefined}><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="UTR / batch / reference"/></Field>
            <Field label="Notes" className="sm:col-span-2"><textarea className={control+" min-h-20 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field>
          </div>:null}
        </Surface>
      </div>

      <aside className="sticky top-20 hidden space-y-3 lg:block">
        <ReceiptSummary customerName={displayCustomerName} swipe={swipe} providerCharge={providerCharge} commission={commission} payable={payable} paid={paidAmount} remaining={remainingAmount} showPaid={recordCustomerPayment}/>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-3 flex items-center justify-between gap-3"><span className="text-xs text-[var(--text-muted)]">You earn</span><strong className="money text-sm text-[var(--money-in)]">{money(commission)}</strong></div>
          <button disabled={!canSave} className="min-h-12 w-full rounded-xl bg-[var(--text)] px-4 text-sm font-semibold text-[var(--surface)] shadow-sm disabled:opacity-35">{saving?"Saving…":saveLabel}</button>
        </div>
      </aside>
    </div>

    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(15,23,42,.08)] backdrop-blur-xl lg:hidden">
      {mobileSummaryOpen?<div className="mx-auto mb-2 max-w-3xl"><ReceiptSummary customerName={displayCustomerName} swipe={swipe} providerCharge={providerCharge} commission={commission} payable={payable} paid={paidAmount} remaining={remainingAmount} showPaid={recordCustomerPayment}/></div>:null}
      <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <button type="button" onClick={()=>setMobileSummaryOpen(v=>!v)} className="min-w-0 rounded-xl px-2 py-1 text-left">
          <div className="flex items-center justify-between gap-3"><p className="truncate text-[10px] text-[var(--text-muted)]">{displayCustomerName?displayCustomerName+" gets":"Customer gets"}</p><p className="shrink-0 text-[10px] font-semibold text-[var(--money-in)]">Earn {money(commission)}</p></div>
          <p className="money mt-0.5 truncate text-lg font-semibold">{money(payable)}</p>
        </button>
        <button disabled={!canSave} className="min-h-12 max-w-[180px] rounded-xl bg-[var(--text)] px-4 text-xs font-semibold leading-4 text-[var(--surface)] shadow-sm disabled:opacity-35">{saving?"Saving…":saveLabel}</button>
      </div>
    </div>
  </form></AppShell>;
}
