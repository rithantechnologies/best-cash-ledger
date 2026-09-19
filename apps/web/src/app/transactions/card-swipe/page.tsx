"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Field, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Card={id:string;bankName:string;cardType?:string|null;lastFourDigits:string;nickname:string|null;isActive:boolean};
type Customer={id:string;fullName:string;mobile:string|null;cards:Card[]};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string};
type Provider={id:string;name:string;gateways:Gateway[]};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;providerId:string|null};
type Term={id:string;name:string;durationValue:number;durationUnit:string;defaultCommissionRate:string};
type CommissionRule={commissionType:string;commissionRate:string}|null;
type PaymentLeg={sourceAccountId:string;amount:string};
type CustomerPreference={providerId:string;gatewayId:string;commissionRate:string;termId:string;cardId?:string};
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

const INDIAN_BANKS=[
  "State Bank of India","HDFC Bank","ICICI Bank","Axis Bank","Kotak Mahindra Bank",
  "IndusInd Bank","Yes Bank","IDFC FIRST Bank","Federal Bank","RBL Bank",
  "AU Small Finance Bank","Bandhan Bank","Bank of Baroda","Bank of India",
  "Bank of Maharashtra","Canara Bank","Central Bank of India","Indian Bank",
  "Indian Overseas Bank","Punjab National Bank","Punjab & Sind Bank","UCO Bank",
  "Union Bank of India","South Indian Bank","Karur Vysya Bank","Karnataka Bank",
  "City Union Bank","Tamilnad Mercantile Bank","DCB Bank","CSB Bank",
];

function mobileDigits(value:string|null|undefined){
  let digits=(value??"").replace(/\D/g,"");
  if(digits.length===12&&digits.startsWith("91"))digits=digits.slice(2);
  return digits;
}
function isIndianMobile(value:string){
  return /^[6-9]\d{9}$/.test(value);
}
function formatIndianMobile(value:string|null|undefined){
  const digits=mobileDigits(value);
  if(digits.length!==10)return value||"";
  return "+91 "+digits.slice(0,5)+" "+digits.slice(5);
}

function amountInWords(value:number){
  if(!Number.isFinite(value)||value<=0)return "";
  const whole=Math.floor(value);
  const paise=Math.round((value-whole)*100);
  const ones=["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const underHundred=(n:number)=>n<20?ones[n]:tens[Math.floor(n/10)]+(n%10?" "+ones[n%10]:"");
  const underThousand=(n:number)=>{
    const hundred=Math.floor(n/100),rest=n%100;
    return (hundred?ones[hundred]+" hundred":"")+(hundred&&rest?" ":"")+(rest?underHundred(rest):"");
  };
  const chunks=[
    [10000000,"crore"],
    [100000,"lakh"],
    [1000,"thousand"],
  ] as const;
  let remaining=whole;
  const parts:string[]=[];
  for(const [size,label] of chunks){
    const count=Math.floor(remaining/size);
    if(count){parts.push((count<1000?underThousand(count):String(count))+" "+label);remaining%=size;}
  }
  if(remaining)parts.push(underThousand(remaining));
  const rupees=(parts.join(" ")||"zero")+" rupees";
  const result=paise?rupees+" and "+underHundred(paise)+" paise":rupees;
  return result.charAt(0).toUpperCase()+result.slice(1);
}

const COMMISSION_RATES=Array.from({length:101},(_,i)=>Math.round(i*5)/100);

function RateControl({
  value,onChange,recent,suggested,
}:{value:number;onChange:(value:number)=>void;recent:number[];suggested:number|null}){
  const stripRef=useRef<HTMLDivElement|null>(null);
  const buttonsRef=useRef<Array<HTMLButtonElement|null>>([]);
  const programmaticScrollRef=useRef(false);
  const userScrollRef=useRef(false);
  const scrollTimerRef=useRef<number|null>(null);
  const [exactOpen,setExactOpen]=useState(false);
  const set=(next:number)=>onChange(Math.min(5,Math.max(0,Math.round(next*100)/100)));

  const scrollToRate=useCallback((rate:number,behavior:ScrollBehavior="smooth")=>{
    const index=Math.max(0,Math.min(COMMISSION_RATES.length-1,Math.round(rate/.05)));
    const strip=stripRef.current,button=buttonsRef.current[index];
    if(!strip||!button)return;
    programmaticScrollRef.current=true;
    strip.scrollTo({left:button.offsetLeft-(strip.clientWidth-button.clientWidth)/2,behavior});
    window.setTimeout(()=>{programmaticScrollRef.current=false;},behavior==="smooth"?280:20);
  },[]);

  useEffect(()=>{
    if(programmaticScrollRef.current||userScrollRef.current)return;
    const id=window.requestAnimationFrame(()=>scrollToRate(value,"auto"));
    return()=>window.cancelAnimationFrame(id);
  },[value,scrollToRate]);

  function handleScroll(){
    if(programmaticScrollRef.current)return;
    const strip=stripRef.current;
    if(!strip)return;
    userScrollRef.current=true;
    if(scrollTimerRef.current)window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current=window.setTimeout(()=>{userScrollRef.current=false;},140);
    const center=strip.scrollLeft+strip.clientWidth/2;
    let best=0,distance=Infinity;
    buttonsRef.current.forEach((button,index)=>{
      if(!button)return;
      const d=Math.abs(button.offsetLeft+button.clientWidth/2-center);
      if(d<distance){distance=d;best=index;}
    });
    const next=COMMISSION_RATES[best];
    if(Math.abs(next-value)>.001)onChange(next);
  }

  const quick=[suggested,...recent]
    .filter((rate):rate is number=>rate!==null&&Number.isFinite(rate)&&rate>=0&&rate<=5)
    .filter((rate,index,list)=>list.findIndex(x=>Math.abs(x-rate)<.001)===index)
    .filter(rate=>Math.abs(rate-value)>.001)
    .slice(0,3);

  return <div className="rate-control">
    <div className="flex items-end justify-between gap-3">
      <button type="button" onClick={()=>setExactOpen(v=>!v)} className="text-left" aria-label="Enter exact commission rate">
        <span className="money text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">{rateText(value)}<span className="ml-1 text-xl font-bold text-[var(--text-muted)]">%</span></span>
        <span className="mt-1 block text-[11px] font-medium text-[var(--text-muted)]">Swipe left or right · tap rate for exact</span>
      </button>
      {quick.length?<div className="flex flex-wrap justify-end gap-1.5">{quick.map(rate=><button key={rate} type="button" onClick={()=>{set(rate);scrollToRate(rate);}} className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">Use {rateText(rate)}%</button>)}</div>:null}
    </div>

    <div className="relative mt-3">
      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 border-x-[7px] border-t-[8px] border-x-transparent border-t-[var(--text)]"/>
      <div ref={stripRef} onScroll={handleScroll} className="rate-strip flex gap-1.5 overflow-x-auto pb-1 pt-3" style={{paddingInline:"calc(50% - 28px)"}}>
        {COMMISSION_RATES.map((rate,index)=><button
          key={rate}
          ref={el=>{buttonsRef.current[index]=el;}}
          type="button"
          onClick={()=>{set(rate);scrollToRate(rate);}}
          data-selected={Math.abs(rate-value)<.001}
          className={"rate-chip money h-12 w-14 shrink-0 snap-center rounded-xl border text-xs font-bold "+(Math.abs(rate-value)<.001?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}
          aria-label={rateText(rate)+" percent commission"}
        >{rateText(rate)}</button>)}
      </div>
    </div>

    {exactOpen?<div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] p-2">
      <span className="text-xs font-semibold text-[var(--text-muted)]">Exact rate</span>
      <div className="relative ml-auto w-28"><input className="app-control pr-7 text-right font-semibold" type="number" inputMode="decimal" min="0" max="5" step="0.01" value={rateText(value)} onChange={e=>set(Number(e.target.value||0))}/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)]">%</span></div>
    </div>:null}
  </div>;
}

function ReceiptSummary({
  customerName,swipe,providerCharge,commission,payable,paid,remaining,showPaid,ready,
}:{
  customerName:string;swipe:number;providerCharge:number;commission:number;payable:number;paid:number;remaining:number;showPaid:boolean;ready:boolean;
}){
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
    <p className="text-xs font-semibold text-[var(--text-muted)]">Calculation</p>
    <div className="mt-3 space-y-2.5 text-sm">
      <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-muted)]">Swipe</span><strong className="money">{money(swipe)}</strong></div>
      <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-muted)]">− Gateway fee</span><strong className="money">{ready?money(providerCharge):"—"}</strong></div>
      <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-muted)]">− Your commission</span><strong className="money">{money(commission)}</strong></div>
      <div className="flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3"><span className="font-semibold">{customerName?customerName+" gets":"Customer gets"}</span><strong className="money text-xl tracking-[-.025em]">{ready?money(payable):"—"}</strong></div>
      {!ready&&swipe>0?<p className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-[11px] font-medium text-[var(--text-muted)]">Choose provider and gateway to complete the calculation.</p>:null}
      {showPaid&&ready?<div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3"><div className="rounded-xl bg-[var(--surface-soft)] p-2.5"><p className="text-[10px] text-[var(--text-muted)]">Paid</p><p className="money mt-1 text-sm font-semibold text-[var(--money-in)]">{money(paid)}</p></div><div className="rounded-xl bg-[var(--surface-soft)] p-2.5"><p className="text-[10px] text-[var(--text-muted)]">Remaining</p><p className={"money mt-1 text-sm font-semibold "+(remaining>.001?"text-amber-600":"text-[var(--money-in)]")}>{money(remaining)}</p></div></div>:null}
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
  const [usualProviderId,setUsualProviderId]=useState("");
  const [usualCardId,setUsualCardId]=useState("");
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
  const [zeroCommissionConfirmed,setZeroCommissionConfirmed]=useState(false);
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
  const quickMobileValid=isIndianMobile(quickMobile);
  const possibleExistingCustomers=quickMobile.length>=6
    ? customers.filter(c=>mobileDigits(c.mobile).includes(quickMobile)).slice(0,3)
    : [];
  const exactMobileCustomer=quickMobileValid
    ? customers.find(c=>mobileDigits(c.mobile).endsWith(quickMobile))
    : undefined;
  const providerWalletPayout=providerWallet
    ? (payoutRequiredByAccount.get(providerWallet.id)??0)
    : 0;
  const providerWalletAfterCredit=providerWallet
    ? providerWallet.currentBalance+settlement
    : 0;
  const providerWalletAfterPayout=providerWalletAfterCredit-providerWalletPayout;

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
    setUsualProviderId("");
    setUsualCardId("");
    if(!customerId)return;
    try{
      const raw=localStorage.getItem("cashledger_card_customer_pref_"+customerId);
      if(!raw)return;
      const pref=JSON.parse(raw) as CustomerPreference;
      setUsualProviderId(pref.providerId||"");
      setUsualCardId(pref.cardId||"");
      if(pref.cardId&&customer?.cards.some(card=>card.id===pref.cardId&&card.isActive))setCardId(pref.cardId);
      if(providers.some(p=>p.id===pref.providerId)){
        setProviderId(pref.providerId);
        const p=providers.find(x=>x.id===pref.providerId);
        if(p?.gateways.some(g=>g.id===pref.gatewayId))setGatewayId(pref.gatewayId);
      }
      if(terms.some(t=>t.id===pref.termId))setTermId(pref.termId);
      if(Number.isFinite(Number(pref.commissionRate)))setCommissionRate(String(Number(pref.commissionRate)));
    }catch{}
  },[customerId,providers,terms,customer]);

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

  useEffect(()=>{
    if(cRate>0)setZeroCommissionConfirmed(false);
  },[cRate]);

  function resetCustomerPayoutState(){
    setRecordCustomerPayment(false);
    setPayoutTouched(false);
    setPaymentLegs([{sourceAccountId:"",amount:""}]);
  }

  function selectCustomer(next:Customer){
    resetCustomerPayoutState();
    setProviderId("");
    setGatewayId("");
    setProviderRate("0");
    setSettlementDueAt("");
    const matchingCard=customerDigits?next.cards.find(card=>card.isActive&&card.lastFourDigits.includes(customerDigits)):undefined;
    const activeCards=next.cards.filter(card=>card.isActive);
    setCustomerId(next.id);
    setCustomerMode("existing");
    setCustomerSearch(next.fullName+(next.mobile?" · "+next.mobile:""));
    setCardId(matchingCard?.id??(activeCards.length===1?activeCards[0].id:""));
    try{
      const hasPreference=!!localStorage.getItem("cashledger_card_customer_pref_"+next.id);
      if(!hasPreference){
        const remembered=localStorage.getItem("cashledger_card_provider");
        if(remembered&&providers.some(p=>p.id===remembered))setProviderId(remembered);
      }
    }catch{}
  }

  function clearCustomer(){
    setCustomerId("");setCardId("");setCustomerSearch("");
    resetCustomerPayoutState();
  }

  function beginExistingCustomer(){
    clearCustomer();
    setCustomerMode("existing");
    setQuickName("");setQuickMobile("");setQuickBank("");setQuickLastFour("");
    setProviderId("");
    setGatewayId("");
    setProviderRate("0");
    setSettlementDueAt("");
    setRoutingOpen(false);
    setSuggestedCommission(null);
    setCommissionRate(String(Number(selectedTerm?.defaultCommissionRate??0)));
    setZeroCommissionConfirmed(false);
  }

  function beginNewCustomer(){
    clearCustomer();
    setCustomerMode("new");
    setQuickName("");
    setQuickMobile("");
    setQuickBank("");
    setQuickLastFour("");
    setProviderId("");
    setGatewayId("");
    setProviderRate("0");
    setSettledNow(true);
    setSettlementDueAt("");
    setRoutingOpen(true);
    setSuggestedCommission(null);
    setCommissionRate(String(Number(selectedTerm?.defaultCommissionRate??0)));
    setZeroCommissionConfirmed(false);
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
    setZeroCommissionConfirmed(false);
    setCommissionRate(rateText(Math.min(5,Math.max(0,next))));
  }

  function savePreferences(targetCustomerId?:string,targetCardId?:string){
    try{
      const nextRates=[cRate,...recentRates].filter((rate,index,list)=>rate>=0&&rate<=5&&list.findIndex(x=>Math.abs(x-rate)<.001)===index).slice(0,3);
      localStorage.setItem("cashledger_card_commission_recent",JSON.stringify(nextRates));
      setRecentRates(nextRates);
      if(targetCustomerId)localStorage.setItem("cashledger_card_customer_pref_"+targetCustomerId,JSON.stringify({providerId,gatewayId,commissionRate:rateText(cRate),termId,cardId:targetCardId||cardId||undefined} satisfies CustomerPreference));
    }catch{}
  }

  async function submit(e:FormEvent){
    e.preventDefault();setError("");
    if(cRate===0&&!zeroCommissionConfirmed){
      setZeroCommissionConfirmed(true);
      return;
    }
    setSaving(true);
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
      savePreferences(preferenceCustomerId,result.createdCustomer?.card.id||cardId);
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
    setZeroCommissionConfirmed(false);
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
    ? !!quickName.trim()&&quickMobileValid&&!!quickBank.trim()&&quickLastFour.length===4&&!exactMobileCustomer
    : !!customerId&&!!cardId;
  const routingReady=!!provider&&!!gateway&&!!providerWallet;
  const payoutReady=swipe>0&&routingReady&&customerReady;
  const calculationReady=swipe>0&&routingReady;
  const canSave=!saving&&rawPayable>=-0.001&&settlement>0&&swipe>0&&customerReady&&!!termId&&!!providerId&&!!gatewayId&&!!providerWallet&&payoutValid;
  const displayCustomerName=customer?.fullName??(customerMode==="new"?quickName.trim():"");
  const normalSaveLabel=swipe<=0?"Save card swipe":recordCustomerPayment
    ? (remainingAmount<=.001?"Save & pay "+money(payable):"Save & record "+money(paidAmount))
    : "Save · pay "+money(payable)+" later";
  const desktopSaveLabel=cRate===0&&zeroCommissionConfirmed?"Confirm · no commission":normalSaveLabel;
  const mobileSaveLabel=cRate===0&&zeroCommissionConfirmed?"Confirm no commission":swipe<=0?"Save swipe":recordCustomerPayment?(remainingAmount<=.001?"Save & pay":"Save payment"):"Save for later";
  const activeCards=customer?.cards.filter(card=>card.isActive)??[];
  const initials=(displayCustomerName||"Customer").split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join("")||"CU";
  const amountWords=amountInWords(swipe);
  const providerInitials=(provider?.name||"Provider").split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join("")||"PR";
  const providerIsUsual=!!customerId&&!!usualProviderId&&usualProviderId===providerId;

  return <AppShell><form onSubmit={submit}>
    <div className="page-enter mx-auto max-w-7xl pb-28 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-5 lg:pb-0">
      <div className="space-y-3.5">
        <div className="hidden items-end justify-between gap-3 px-1 lg:flex">
          <div><h1 className="text-2xl font-semibold tracking-[-.03em]">Credit card swipe</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Fast counter entry with live reconciliation.</p></div>
          <span className="text-xs text-[var(--text-muted)]">Only card last 4 is stored</span>
        </div>

        {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

        <Surface className="counter-surface overflow-visible">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="counter-section-title">Customer</h2>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={()=>{if(customerMode!=="existing")beginExistingCustomer();}} className={"min-h-9 rounded-lg px-3 text-xs font-semibold "+(customerMode==="existing"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Existing</button>
                <button type="button" onClick={beginNewCustomer} className={"min-h-9 rounded-lg px-3 text-xs font-semibold "+(customerMode==="new"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>New</button>
              </div>
            </div>

            {customerMode==="new"?<div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Customer name"><input className={control} value={quickName} onChange={e=>setQuickName(e.target.value)} maxLength={150} autoFocus placeholder="Full name"/></Field>
              <Field label="Mobile number">
                <div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)]">
                  <span className="grid h-12 place-items-center border-r border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-semibold text-[var(--text-muted)]">+91</span>
                  <input className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base font-semibold outline-none" type="tel" inputMode="numeric" value={quickMobile} onChange={e=>setQuickMobile(e.target.value.replace(/\D/g,"").slice(0,10))} maxLength={10} placeholder="10-digit mobile"/>
                </div>
                {quickMobile.length>0&&!quickMobileValid?<p className="mt-1.5 text-[11px] font-medium text-amber-600">Enter a valid Indian mobile number.</p>:null}
              </Field>
              <Field label="Card bank"><select className={control+" h-12"} value={quickBank} onChange={e=>setQuickBank(e.target.value)}><option value="">Select bank</option>{INDIAN_BANKS.map(bank=><option key={bank} value={bank}>{bank}</option>)}</select></Field>
              <Field label="Card last 4"><input className={control+" h-12 font-semibold tracking-[.16em]"} inputMode="numeric" value={quickLastFour} onChange={e=>setQuickLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} placeholder="0000"/></Field>
              {possibleExistingCustomers.length?<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2"><p className="text-xs font-semibold text-amber-900">Possible existing customer</p><div className="mt-2 space-y-1.5">{possibleExistingCustomers.map(match=><button key={match.id} type="button" onClick={()=>selectCustomer(match)} className="flex w-full items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-left"><span><strong className="block text-xs text-slate-900">{match.fullName}</strong><span className="text-[11px] text-slate-500">{formatIndianMobile(match.mobile)}</span></span><span className="text-xs font-semibold text-indigo-700">Use existing →</span></button>)}</div></div>:null}
              <p className="text-[11px] leading-4 text-[var(--text-muted)] sm:col-span-2">Customer and card are created together only when this swipe is saved.</p>
            </div>:customer?<div className="mt-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-sm font-extrabold text-[var(--accent)]">{initials}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-lg font-bold tracking-[-.02em]">{customer.fullName}</p><p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">{formatIndianMobile(customer.mobile)||"No mobile"}</p></div>
                <button type="button" onClick={clearCustomer} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold">Change</button>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--text-muted)]">Card to swipe</p>{activeCards.length>1?<span className="text-[10px] text-[var(--text-muted)]">Tap a card</span>:null}</div>
              {activeCards.length?<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{activeCards.map(card=>{
                const selected=card.id===cardId;
                const usual=card.id===usualCardId;
                return <button key={card.id} type="button" onClick={()=>setCardId(card.id)} className={"counter-card-tile min-h-24 rounded-2xl border p-3 text-left "+(selected?"border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm":"border-[var(--border)] bg-[var(--surface)]")}>
                  <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{card.cardType||"Credit"}</span>{usual?<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700">Usual</span>:null}</div>
                  <p className="mt-2 truncate text-sm font-bold">{card.bankName}</p>
                  <p className="mt-2 font-mono text-sm font-semibold tracking-[.08em] text-[var(--text-muted)]">•••• {card.lastFourDigits}</p>
                </button>;
              })}</div>:<Link href={"/customers/"+customer.id} className="mt-2 flex min-h-16 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-sm font-semibold text-[var(--accent)]">+ Add a card</Link>}
            </div>:<div className="relative mt-4">
              <input className="app-control h-12 text-base font-medium" inputMode="search" value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search name, mobile or card last 4" autoComplete="off" autoFocus/>
              {customerSearch.trim()?<div className="absolute inset-x-0 top-[calc(100%+.4rem)] z-40 max-h-72 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl">
                {customerMatches.length?customerMatches.map(match=>{
                  const matchDigits=customerDigits?match.cards.filter(card=>card.isActive&&card.lastFourDigits.includes(customerDigits)):[];
                  return <button key={match.id} type="button" onClick={()=>selectCustomer(match)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--surface-soft)]">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{match.fullName}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{formatIndianMobile(match.mobile)||"No mobile"}{matchDigits.length?" · "+matchDigits.map(x=>"••••"+x.lastFourDigits).join(", "):""}</p></div>
                    <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">Use</span>
                  </button>;
                }):<button type="button" onClick={beginNewCustomer} className="w-full rounded-xl px-3 py-4 text-left text-xs font-semibold text-[var(--accent)]">No match · Create new customer</button>}
              </div>:null}
            </div>}
          </div>
        </Surface>

        <Surface className="counter-surface overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="counter-section-title">Swipe amount</h2><span className="text-[10px] font-medium text-[var(--text-muted)]">INR</span></div>
            <div className="relative mt-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 focus-within:border-[var(--accent)]">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-[var(--text-muted)]">₹</span>
              <input className="h-20 w-full bg-transparent pl-9 pr-2 text-4xl font-extrabold tracking-[-.045em] outline-none sm:text-5xl" type="text" inputMode="decimal" value={formatAmountInput(amount)} onChange={e=>{setAmount(cleanAmountInput(e.target.value));setZeroCommissionConfirmed(false);}} placeholder="0" aria-label="Swipe amount" required/>
            </div>
            <p className="mt-2 min-h-5 text-sm font-medium leading-5 text-[var(--text-muted)]">{amountWords||"Enter the amount being swiped."}</p>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] px-3.5 py-3">
              <div><p className="text-[10px] font-medium text-[var(--text-muted)]">Payment term</p><p className="mt-0.5 text-sm font-semibold">{selectedTerm?.name??"Select term"}{instantTerm?<span className="ml-2 text-[10px] font-semibold text-[var(--accent)]">Due now</span>:null}</p></div>
              <button type="button" onClick={()=>setTermOpen(v=>!v)} className="text-xs font-semibold text-[var(--accent)]">{termOpen?"Done":"Change"}</button>
            </div>
            {termOpen?<div className="mt-3 flex flex-wrap gap-2">{terms.map(term=><button key={term.id} type="button" onClick={()=>{setTermId(term.id);setTermOpen(false);}} className={"min-h-9 rounded-full border px-3 text-xs font-semibold "+(term.id===termId?"border-[var(--text)] bg-[var(--text)] text-[var(--surface)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{term.name}</button>)}</div>:null}
            {!instantTerm?<div className="mt-3 max-w-sm"><Field label="Customer payable due"><input className={control} type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></Field></div>:null}
          </div>
        </Surface>

        <Surface className="counter-surface overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="counter-section-title">Provider</h2>{providerIsUsual?<span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">Usual</span>:null}</div>{routingReady?<button type="button" onClick={()=>setRoutingOpen(v=>!v)} className="text-xs font-semibold text-[var(--accent)]">{routingOpen?"Done":"Change"}</button>:null}</div>
            {routingReady&&!routingOpen?<div className="mt-3 rounded-2xl bg-[var(--surface-soft)] p-3.5">
              <div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-50 text-xs font-extrabold text-cyan-700">{providerInitials}</div><div className="min-w-0 flex-1"><p className="truncate text-base font-bold">{provider?.name}</p><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{gateway?.gatewayName} · wallet settlement</p></div><div className="text-right"><p className="money text-base font-bold">{rateText(pRate)}%</p><p className="text-[10px] text-[var(--text-muted)]">fee {money(providerCharge)}</p></div></div>
            </div>:<div className="mt-3 grid gap-3 sm:grid-cols-3">
              {customerMode==="new"&&!providerId?<div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800 sm:col-span-3">Choose the provider for this new customer.</div>:null}
              <Field label="Provider"><select className={control+" h-12"} value={providerId} onChange={e=>{resetCustomerPayoutState();setProviderId(e.target.value);setGatewayId("");setProviderRate("0");setSettlementDueAt("");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Gateway"><select className={control+" h-12"} value={gatewayId} onChange={e=>setGatewayId(e.target.value)} disabled={!provider?.gateways.length} required><option value="">{provider&&provider.gateways.length===0?"No gateway set":"Select gateway"}</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
              <Field label="Provider fee %"><input className={control+" h-12"} type="number" inputMode="decimal" step="0.0001" min="0" value={providerRate} onChange={e=>setProviderRate(e.target.value)} required/></Field>
            </div>}

            {providerWallet?<div className="mt-3 space-y-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{providerWallet.accountName}</p>{settledNow?<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Credited</span>:<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Pending</span>}</div><p className="mt-1 text-[11px] text-[var(--text-muted)]">Provider credit <strong className="money font-semibold text-cyan-600">{money(settlement)}</strong></p></div></div>
                <div className={"mt-3 grid gap-px overflow-hidden rounded-xl bg-[var(--border)] "+(providerWalletPayout>0?"grid-cols-3":"grid-cols-2")}><div className="bg-[var(--surface-soft)] p-2.5"><p className="text-[10px] text-[var(--text-muted)]">Now</p><p className="money mt-1 text-xs font-semibold">{money(providerWallet.currentBalance)}</p></div><div className="bg-[var(--surface-soft)] p-2.5"><p className="text-[10px] text-[var(--text-muted)]">After credit</p><p className="money mt-1 text-xs font-semibold">{money(providerWalletAfterCredit)}</p></div>{providerWalletPayout>0?<div className="bg-[var(--surface-soft)] p-2.5"><p className="text-[10px] text-[var(--text-muted)]">After payout</p><p className="money mt-1 text-xs font-semibold text-[var(--money-in)]">{money(providerWalletAfterPayout)}</p></div>:null}</div>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1"><button type="button" onClick={()=>setSettledNow(true)} className={"min-h-10 rounded-lg text-xs font-semibold "+(settledNow?"bg-[var(--surface)] text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>Credited</button><button type="button" onClick={()=>setSettledNow(false)} className={"min-h-10 rounded-lg text-xs font-semibold "+(!settledNow?"bg-[var(--surface)] text-amber-700 shadow-sm":"text-[var(--text-muted)]")}>Not yet</button></div>
            </div>:providerId?<div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">Provider wallet unavailable</div>:null}
          </div>
        </Surface>

        <Surface className="counter-surface overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="counter-section-title">Business commission</h2>{swipe>0?<span className="money text-base font-bold text-[var(--money-in)]">{money(commission)}</span>:null}</div>
            <div className="mt-3"><RateControl value={cRate} onChange={updateCommission} recent={recentRates} suggested={suggestedCommission}/></div>
            {cRate===0?<div className={"mt-3 rounded-xl border px-3 py-2.5 text-xs "+(zeroCommissionConfirmed?"border-amber-300 bg-amber-50 text-amber-900":"border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-muted)]")}>{zeroCommissionConfirmed?"No commission on this swipe. Save again to confirm.":"No business commission on this swipe."}</div>:null}
          </div>
        </Surface>

        <Surface className="counter-surface overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="counter-section-title">Customer payout</h2>
              <div className="flex items-center gap-2">
                {payoutReady&&instantTerm&&!recordCustomerPayment?<span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">Due now</span>:null}
                {payoutReady&&recordCustomerPayment&&remainingAmount<=.001?<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Settled</span>:null}
              </div>
            </div>
            <div className={"mt-3 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1 "+(!payoutReady?"opacity-45":"")}>
              <button type="button" disabled={!payoutReady} onClick={deferCustomerPayment} className={"min-h-11 rounded-lg text-xs font-semibold disabled:cursor-not-allowed "+(!recordCustomerPayment&&payoutReady?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Not paid yet</button>
              <button type="button" disabled={!payoutReady} onClick={startCustomerPayment} className={"min-h-11 rounded-lg text-xs font-semibold disabled:cursor-not-allowed "+(recordCustomerPayment&&payoutReady?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Pay now / already paid</button>
            </div>
            {!payoutReady?<div className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-3.5 py-3 text-xs font-medium text-[var(--text-muted)]">Choose provider and gateway to calculate the customer payout.</div>:!recordCustomerPayment?<div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-[var(--border)] px-3.5 py-3"><span className="text-xs text-[var(--text-muted)]">Remaining payable</span><strong className="money text-base text-amber-600">{money(payable)}</strong></div>:<div className="mt-3 space-y-2">
              {paymentLegs.map((leg,index)=>{const source=liquidAccounts.find(a=>a.id===leg.sourceAccountId);const sourceIncoming=settledNow&&providerWallet?.id===source?.id?settlement:0;const sourceAvailable=(source?.currentBalance??0)+sourceIncoming;return <div key={index} className="grid grid-cols-[minmax(0,1fr)_116px_32px] items-start gap-2 rounded-xl border border-[var(--border)] p-2 sm:grid-cols-[minmax(0,1fr)_150px_36px]"><div className="min-w-0"><select className={control+" min-w-0 text-xs font-semibold"} value={leg.sourceAccountId} onChange={e=>updatePaymentLeg(index,{sourceAccountId:e.target.value})}><option value="">Paid from</option>{liquidAccounts.map(a=>{const usedElsewhere=paymentLegs.some((other,i)=>i!==index&&other.sourceAccountId===a.id);return <option key={a.id} value={a.id} disabled={usedElsewhere}>{a.accountName}</option>;})}</select>{source?<p className="mt-1 truncate px-1 text-[10px] text-[var(--text-muted)]">Available {money(sourceAvailable)}</p>:null}</div><div className="relative"><span className="pointer-events-none absolute left-2.5 top-[22px] -translate-y-1/2 text-sm font-semibold text-[var(--text-muted)]">₹</span><input className={control+" min-w-0 pl-7 pr-2 text-right text-sm font-semibold"} type="text" inputMode="decimal" value={formatAmountInput(leg.amount)} onChange={e=>updatePaymentLeg(index,{amount:cleanAmountInput(e.target.value)})}/></div><button type="button" aria-label="Remove payment source" disabled={paymentLegs.length===1} onClick={()=>removePaymentSource(index)} className="grid h-10 w-8 place-items-center rounded-lg text-base font-semibold text-[var(--text-muted)] disabled:opacity-20 sm:w-9">×</button></div>;})}
              <div className="flex items-center justify-between gap-3 pt-1">{paymentLegs.length<5&&paidAmount<payable-.001?<button type="button" onClick={addPaymentSource} className="min-h-9 text-xs font-semibold text-[var(--accent)]">+ Pay from another account</button>:<span/>}<div className="text-right text-xs"><span className="text-[var(--text-muted)]">Remaining </span><strong className={remainingAmount>.001?"text-amber-600":"text-[var(--money-in)]"}>{money(remainingAmount)}</strong></div></div>
              {paidAmount>payable+.001?<p className="text-xs font-semibold text-rose-600">Paid amount is more than customer payable.</p>:payoutBalanceShort?<p className="text-xs font-semibold text-rose-600">One selected account does not have enough balance.</p>:null}
            </div>}
          </div>
        </Surface>

        <div className="lg:hidden"><ReceiptSummary customerName={displayCustomerName} swipe={swipe} providerCharge={providerCharge} commission={commission} payable={payable} paid={paidAmount} remaining={remainingAmount} showPaid={recordCustomerPayment} ready={calculationReady}/></div>

        <Surface className="counter-surface overflow-hidden">
          <button type="button" onClick={()=>setShowOptional(v=>!v)} className="flex min-h-13 w-full items-center justify-between px-4 text-left sm:px-5"><span className="text-sm font-semibold">More details</span><span className="text-lg text-[var(--text-muted)]">{showOptional?"−":"+"}</span></button>
          {showOptional?<div className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2 sm:p-5">{!settledNow?<Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>:null}<Field label="Reference" className={settledNow?"sm:col-span-2":undefined}><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="UTR / batch / reference"/></Field><Field label="Notes" className="sm:col-span-2"><textarea className={control+" min-h-20 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div>:null}
        </Surface>
      </div>

      <aside className="sticky top-20 hidden space-y-3 lg:block">
        <ReceiptSummary customerName={displayCustomerName} swipe={swipe} providerCharge={providerCharge} commission={commission} payable={payable} paid={paidAmount} remaining={remainingAmount} showPaid={recordCustomerPayment} ready={calculationReady}/>
        <div className="counter-surface rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3"><div className="mb-3 flex items-center justify-between gap-3"><span className="text-xs text-[var(--text-muted)]">You earn</span><strong className="money text-sm text-[var(--money-in)]">{money(commission)}</strong></div><button disabled={!canSave} className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-35">{saving?"Saving…":desktopSaveLabel}</button></div>
      </aside>
    </div>

    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(15,23,42,.08)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="min-w-0 px-1"><p className="truncate text-[11px] font-medium text-[var(--text-muted)]">{displayCustomerName?displayCustomerName+" gets":"Customer gets"}</p><p className="money mt-0.5 truncate text-xl font-extrabold tracking-[-.03em]">{calculationReady?money(payable):"—"}</p><p className="money mt-0.5 text-[11px] font-semibold text-[var(--money-in)]">You earn {money(commission)}</p></div><button disabled={!canSave} className="min-h-14 min-w-[118px] rounded-2xl bg-[var(--accent)] px-5 text-sm font-bold leading-4 text-white shadow-lg disabled:opacity-35">{saving?"Saving…":mobileSaveLabel}</button></div>
    </div>
  </form></AppShell>;
}
