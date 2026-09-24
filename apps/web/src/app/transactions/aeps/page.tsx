"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type BankAccount={id:string;bankName:string;accountReference:string;isActive:boolean};
type Customer={id:string;fullName:string;mobile?:string|null;bankAccounts:BankAccount[]};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;providerId:string|null;isActive?:boolean};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string};
type Provider={id:string;name:string;supportsAeps:boolean;aepsCommissionRate:string;gateways:Gateway[]};
type Rule={commissionRate:string}|null;
type SavedAeps={transaction:{id:string};createdCustomer?:{id:string;fullName:string;mobile:string|null}|null};

const INDIAN_BANKS=[
  "State Bank of India","HDFC Bank","ICICI Bank","Axis Bank","Kotak Mahindra Bank",
  "IndusInd Bank","Yes Bank","IDFC FIRST Bank","Federal Bank","RBL Bank",
  "Bank of Baroda","Bank of India","Canara Bank","Central Bank of India","Indian Bank",
  "Indian Overseas Bank","Punjab National Bank","UCO Bank","Union Bank of India",
  "South Indian Bank","Karur Vysya Bank","Karnataka Bank","City Union Bank",
  "Tamilnad Mercantile Bank","DCB Bank","CSB Bank",
];

function money(v:number|string){
  const value=Number(v||0);
  return new Intl.NumberFormat("en-IN",{
    style:"currency",currency:"INR",
    minimumFractionDigits:Number.isInteger(value)?0:2,
    maximumFractionDigits:2,
  }).format(value);
}
function formatAmountInput(value:string){
  if(!value)return "";
  const [whole="",dec]=value.split(".");
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
function mobileDigits(value:string|null|undefined){
  let digits=(value??"").replace(/\D/g,"");
  if(digits.length===12&&digits.startsWith("91"))digits=digits.slice(2);
  return digits.slice(-10);
}
function formatMobile(value:string|null|undefined){
  const digits=mobileDigits(value);
  return digits.length===10?"+91 "+digits.slice(0,5)+" "+digits.slice(5):(value||"");
}
function rateText(value:number){return Number(value.toFixed(4)).toString();}
function localDatePlus(days:number){
  const d=new Date();
  d.setDate(d.getDate()+days);
  const yyyy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return yyyy+"-"+mm+"-"+dd;
}

function RateControl({value,defaultValue,onChange}:{value:number;defaultValue:number;onChange:(value:number)=>void}){
  const set=(next:number)=>onChange(Math.min(100,Math.max(0,Math.round(next*10000)/10000)));
  const sliderMax=Math.max(5,Math.ceil(value));
  return <div className="flex flex-wrap items-center gap-3">
    <div className="relative w-[118px]">
      <input className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-3 pr-8 text-right text-base font-extrabold outline-none focus:border-[var(--accent)]"
        type="number" inputMode="decimal" min="0" max="100" step="0.0001"
        value={rateText(value)} onChange={e=>set(Number(e.target.value||0))}/>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)]">%</span>
    </div>
    <input className="h-5 min-w-[120px] flex-1 cursor-pointer accent-[var(--accent)]" type="range" min="0" max={sliderMax} step="0.01"
      value={Math.min(value,sliderMax)} onChange={e=>set(Number(e.target.value))}/>
    <button type="button" onClick={()=>set(defaultValue)} className="status-chip status-chip-blue">Default {rateText(defaultValue)}%</button>
  </div>;
}

function AepsSummary({
  customerName,withdrawal,cashGiven,commission,charge,settlement,cashName,providerName,gatewayName,hasGateway,settledNow,successful,cashPayoutNow,ready,
}:{
  customerName:string;withdrawal:number;cashGiven:number;commission:number;charge:number;settlement:number;
  cashName:string;providerName:string;gatewayName:string;hasGateway:boolean;settledNow:boolean;successful:boolean;cashPayoutNow:boolean;ready:boolean;
}){
  if(!successful){
    const attempted=withdrawal>0?money(withdrawal):"—";
    return <div className="swipe-result-card rounded-2xl border border-[var(--border)] p-4 sm:p-5">
      <div>
        <p className="text-[13px] font-semibold text-[var(--text-muted)]">{customerName?customerName+" · Aadhaar attempt":"Aadhaar attempt"}</p>
        <p className="money result-total mt-1 font-black leading-none tracking-[-.045em]">{attempted}</p>
      </div>
      <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2.5">
        <p className="text-xs font-extrabold text-rose-200">Failed · no money moved</p>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px]">
        <div className="flex items-start justify-between gap-3"><span className="text-[var(--text-muted)]">Provider</span><strong className="max-w-[190px] text-right">{providerName?(providerName+(gatewayName?" · "+gatewayName:"")):"—"}</strong></div>
        <div className="flex items-start justify-between gap-3"><span className="text-[var(--text-muted)]">Customer cash</span><strong>Not paid</strong></div>
        <div className="flex items-start justify-between gap-3"><span className="text-[var(--text-muted)]">Provider settlement</span><strong>None</strong></div>
      </div>
    </div>;
  }

  const total=ready?money(cashGiven):"—";
  const totalSize=total.length>13?"result-total-compact":total.length>10?"result-total-medium":"";
  return <div className="swipe-result-card rounded-2xl border border-[var(--border)] p-4 sm:p-5">
    <div className="swipe-result-head grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-muted)]">{customerName?(cashPayoutNow?customerName+" gets cash":customerName+" cash due"):(cashPayoutNow?"Customer gets cash":"Cash due to customer")}</p>
        <p className={"money result-total mt-1 font-black leading-none tracking-[-.045em] "+totalSize}>{total}</p>
      </div>
      <div className="swipe-result-earn max-w-[122px] rounded-xl bg-[color-mix(in_srgb,var(--money-in)_10%,transparent)] px-3 py-2 text-right">
        <p className="text-[10px] font-semibold text-[var(--text-muted)]">You earn</p>
        <p className="money result-earn mt-0.5 font-extrabold text-[var(--money-in)]">{money(commission)}</p>
      </div>
    </div>
    <div className={"mt-4 grid gap-2 border-t border-[var(--border)] pt-3 "+(hasGateway?"grid-cols-3":"grid-cols-2")}>
      <div className="min-w-0"><p className="text-[10px] text-[var(--text-muted)]">Bank debit</p><p className="money result-metric mt-1 font-bold">{money(withdrawal)}</p></div>
      {hasGateway?<div className="min-w-0"><p className="text-[10px] text-[var(--text-muted)]">Provider fee</p><p className="money result-metric mt-1 font-bold text-[var(--money-out)]">{ready?"−"+money(charge):"—"}</p></div>:null}
      <div className="min-w-0"><p className="text-[10px] text-[var(--text-muted)]">Settlement</p><p className="money result-metric mt-1 font-bold">{ready?money(settlement):"—"}</p></div>
    </div>
    <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3 text-[11px]">
      <div className="flex items-start justify-between gap-3"><span className="text-[var(--text-muted)]">Customer cash</span><strong className={cashPayoutNow?"text-[var(--money-in)]":"text-amber-400"}>{cashPayoutNow?(cashName?"Paid · "+cashName:"Paid"):"Due"}</strong></div>
      <div className="flex items-start justify-between gap-3"><span className="text-[var(--text-muted)]">Provider</span><strong className="max-w-[190px] text-right">{providerName?(providerName+(gatewayName?" · "+gatewayName:"")):"—"}</strong></div>
      {ready?<div className="flex items-start justify-between gap-3"><span className="text-[var(--text-muted)]">Provider wallet</span><strong className={settledNow?"text-[var(--money-in)]":"text-amber-400"}>{settledNow?"Received":"Pending"}</strong></div>:null}
    </div>
  </div>;
}

export default function AepsPage(){
  const router=useRouter();
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [providers,setProviders]=useState<Provider[]>([]);

  const [customerMode,setCustomerMode]=useState<"SEARCH"|"NEW">("SEARCH");
  const [customerId,setCustomerId]=useState("");
  const [customerSearch,setCustomerSearch]=useState("");
  const [newName,setNewName]=useState("");
  const [newMobile,setNewMobile]=useState("");

  const [aadhaar,setAadhaar]=useState("");
  const [bank,setBank]=useState("");
  const [amount,setAmount]=useState("");

  const [platformId,setPlatformId]=useState("");
  const [providerId,setProviderId]=useState("");
  const [gatewayId,setGatewayId]=useState("");
  const [chargeRate,setChargeRate]=useState("0");
  const [commissionRate,setCommissionRate]=useState("0");
  const [defaultCommissionRate,setDefaultCommissionRate]=useState("0");
  const [commissionMethod,setCommissionMethod]=useState<"DEDUCT"|"ADD_ON">("DEDUCT");

  const [cashAccountId,setCashAccountId]=useState("");
  const [openCashSessions,setOpenCashSessions]=useState<Record<string,{openingTotal?:number|string;liveExpectedClosingTotal?:number|string}>>({});
  const [settlementAccountId,setSettlementAccountId]=useState("");
  const [commissionSettlementMode,setCommissionSettlementMode]=useState<"INCLUDED"|"SEPARATE">("INCLUDED");
  const [commissionReceiptAccountId,setCommissionReceiptAccountId]=useState("");
  const [successful,setSuccessful]=useState(true);
  const [cashPayoutNow,setCashPayoutNow]=useState(true);
  const [cashPayoutDueAt,setCashPayoutDueAt]=useState(()=>localDatePlus(1));
  const [settledNow,setSettledNow]=useState(false);
  const [settlementDueAt,setSettlementDueAt]=useState("");
  const [reference,setReference]=useState("");
  const [transactionAt,setTransactionAt]=useState("");
  const [notes,setNotes]=useState("");
  const [showOptional,setShowOptional]=useState(false);

  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  async function refreshCashSessions(rows:Account[]){
    const cashRows=rows.filter(account=>account.accountType==="CASH"&&account.isActive!==false);
    const results=await Promise.all(cashRows.map(async account=>{
      try{
        const session=await apiFetch<{id:string;openingTotal?:number|string;liveExpectedClosingTotal?:number|string}|null>("/cash-counter/current?cashAccountId="+encodeURIComponent(account.id));
        return session?{accountId:account.id,session}:null;
      }catch{return null;}
    }));
    const open=results.filter((row):row is {accountId:string;session:{id:string;openingTotal?:number|string;liveExpectedClosingTotal?:number|string}}=>Boolean(row));
    setOpenCashSessions(Object.fromEntries(open.map(row=>[row.accountId,row.session])));
  }

  useEffect(()=>{
    document.body.classList.add("cashledger-modern-task");
    Promise.all([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<Provider[]>("/providers"),
      apiFetch<Rule>("/settings/commission-rules/resolve?transactionType=AEPS_WITHDRAWAL"),
    ]).then(([c,a,p,rule])=>{
      setCustomers(c);setAccounts(a);setProviders(p);
      refreshCashSessions(a).catch(()=>{});
      const base=String(Number(rule?.commissionRate||0));
      setCommissionRate(base);setDefaultCommissionRate(base);

      const cash=a.filter(x=>x.accountType==="CASH"&&x.isActive!==false);
      const params=new URLSearchParams(window.location.search);
      const presetCash=params.get("cashAccountId");
      const preferredCash=cash.find(x=>x.id===presetCash)??cash.find(x=>/staff cash drawer/i.test(x.accountName))??cash.find(x=>/shop cash drawer/i.test(x.accountName))??cash[0];
      if(preferredCash)setCashAccountId(preferredCash.id);

      const supported=p.filter(x=>x.supportsAeps);
      const remembered=localStorage.getItem("cashledger_aeps_provider");
      const first=supported.find(x=>x.id===remembered)?.id??supported[0]?.id??"";
      if(first)setProviderId(first);

      const preset=params.get("customerId");
      const presetCustomer=c.find(x=>x.id===preset);
      if(presetCustomer)selectCustomerState(presetCustomer);
    }).catch(err=>setError(err instanceof Error?err.message:"Failed to load Aadhaar withdrawal form"))
      .finally(()=>setLoading(false));
    return()=>document.body.classList.remove("cashledger-modern-task");
  },[]);

  const customer=customers.find(c=>c.id===customerId);
  const provider=providers.find(p=>p.id===providerId);
  const gateway=provider?.gateways.find(g=>g.id===gatewayId);
  const providerWallet=accounts.find(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId&&a.isActive!==false);
  const cashAccount=accounts.find(a=>a.id===cashAccountId);
  const commissionReceiptOptions=accounts.filter(a=>a.isActive!==false&&(
    a.accountType==="BANK"||a.accountType==="UPI"||(a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId)
  ));

  const searchNeedle=customerSearch.trim().toLowerCase();
  const searchDigits=mobileDigits(customerSearch);
  const customerMatches=searchNeedle?customers.filter(c=>
    c.fullName.toLowerCase().includes(searchNeedle)||
    (!!searchDigits&&mobileDigits(c.mobile).includes(searchDigits))
  ).slice(0,8):[];

  const possibleExisting=useMemo(()=>{
    const name=newName.trim().toLowerCase();
    const mobile=mobileDigits(newMobile);
    if(!name&&!mobile)return [];
    return customers.filter(c=>
      (!!name&&c.fullName.toLowerCase().includes(name))||
      (!!mobile&&mobileDigits(c.mobile).includes(mobile))
    ).slice(0,4);
  },[customers,newName,newMobile]);

  const bankOptions=useMemo(()=>{
    const saved=customer?.bankAccounts.filter(x=>x.isActive).map(x=>x.bankName)??[];
    return [...new Set([...saved,...INDIAN_BANKS])];
  },[customer]);

  useEffect(()=>{
    if(!providerId)return;
    localStorage.setItem("cashledger_aeps_provider",providerId);
    const currentProvider=providers.find(p=>p.id===providerId);
    const remembered=localStorage.getItem("cashledger_aeps_gateway_"+providerId);
    const next=currentProvider?.gateways.find(g=>g.id===remembered)??currentProvider?.gateways[0];
    setGatewayId(next?.id??"");
    setChargeRate(next?String(Number(next.defaultChargeRate)):"0");
    const wallet=accounts.find(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId&&a.isActive!==false);
    setSettlementAccountId(wallet?.id??"");
  },[providerId,providers,accounts]);

  useEffect(()=>{
    if(commissionReceiptAccountId){
      const valid=accounts.some(a=>a.id===commissionReceiptAccountId&&a.isActive!==false&&(a.accountType==="BANK"||a.accountType==="UPI"||(a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId)))&&commissionReceiptAccountId!==settlementAccountId;
      if(!valid)setCommissionReceiptAccountId("");
    }
  },[commissionReceiptAccountId,settlementAccountId,providerId,accounts]);

  useEffect(()=>{
    if(gatewayId&&providerId)localStorage.setItem("cashledger_aeps_gateway_"+providerId,gatewayId);
    const g=providers.find(p=>p.id===providerId)?.gateways.find(x=>x.id===gatewayId);
    if(g)setChargeRate(String(Number(g.defaultChargeRate)));
  },[gatewayId,providerId,providers]);

  useEffect(()=>{
    let cancelled=false;
    const q=new URLSearchParams({transactionType:"AEPS_WITHDRAWAL"});
    if(customerId)q.set("customerId",customerId);
    if(providerId)q.set("providerId",providerId);
    if(gatewayId)q.set("gatewayId",gatewayId);
    apiFetch<Rule>("/settings/commission-rules/resolve?"+q.toString()).then(rule=>{
      if(cancelled)return;
      if(rule){
        const value=String(Number(rule.commissionRate));
        setCommissionRate(value);setDefaultCommissionRate(value);
      }
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[customerId,providerId,gatewayId]);

  useEffect(()=>{
    const refreshCash=()=>{if(accounts.length)refreshCashSessions(accounts).catch(()=>{});};
    window.addEventListener("focus",refreshCash);
    return()=>window.removeEventListener("focus",refreshCash);
  },[accounts]);

  useEffect(()=>{
    const refresh=()=>apiFetch<Rule>("/settings/commission-rules/resolve?transactionType=AEPS_WITHDRAWAL").then(rule=>{
      if(rule){
        const value=String(Number(rule.commissionRate));
        setDefaultCommissionRate(value);
        if(!customerId)setCommissionRate(value);
      }
    }).catch(()=>{});
    const onStorage=(event:StorageEvent)=>{if(event.key==="cashledger_settings_updated_at")refresh();};
    window.addEventListener("focus",refresh);
    window.addEventListener("storage",onStorage);
    return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("storage",onStorage);};
  },[customerId]);

  const baseAmount=Number(amount||0);
  const commission=Math.round(baseAmount*Number(commissionRate||0))/100;
  const withdrawal=Math.round((commissionMethod==="ADD_ON"?baseAmount+commission:baseAmount)*100)/100;
  const cashGiven=Math.round((commissionMethod==="ADD_ON"?baseAmount:baseAmount-commission)*100)/100;
  const charge=Math.round(withdrawal*Number(chargeRate||0))/100;
  const settlement=Math.round((withdrawal-charge)*100)/100;
  const commissionSeparate=settledNow&&commissionSettlementMode==="SEPARATE"&&commission>0;
  const mainSettlementReceipt=Math.max(0,Math.round((settlement-(commissionSeparate?commission:0))*100)/100);
  const commissionReceiptReady=!commissionSeparate||Boolean(commissionReceiptAccountId&&commissionReceiptAccountId!==settlementAccountId);
  const cashSession=cashAccount?openCashSessions[cashAccount.id]:undefined;
  const cashCurrent=cashAccount?Number(cashSession?.liveExpectedClosingTotal??cashSession?.openingTotal??cashAccount.currentBalance):0;
  const cashAfter=cashAccount?cashCurrent-cashGiven:0;
  const cashOpen=!cashAccount||Boolean(cashSession);
  const cashSufficient=!cashAccount||(cashOpen&&cashCurrent+0.001>=cashGiven);
  const mobileValid=!newMobile||/^[6-9]\d{9}$/.test(newMobile);
  const customerReady=customerMode==="SEARCH"?!!customerId:!!newName.trim()&&mobileValid;
  const providerHasGateways=Boolean(provider?.gateways.length);
  const providerAttemptReady=!!providerId&&provider?.supportsAeps===true&&(!providerHasGateways||!!gatewayId);
  const providerReady=providerAttemptReady&&!!settlementAccountId;
  const commissionSplitValid=!commissionSeparate||settlement+0.001>=commission;
  const calculationReady=successful&&baseAmount>0&&withdrawal>0&&cashGiven>0&&settlement>0&&providerReady&&commissionReceiptReady&&commissionSplitValid;
  const successfulReady=successful&&withdrawal>0&&cashGiven>0&&settlement>0&&providerReady&&commissionReceiptReady&&commissionSplitValid&&(!cashPayoutNow||Boolean(cashAccountId)&&cashSufficient)&&Boolean(cashPayoutNow||cashPayoutDueAt);
  const failedReady=!successful&&providerAttemptReady;
  const canSave=!saving&&customerReady&&aadhaar.length===4&&!!bank.trim()&&baseAmount>0&&(successfulReady||failedReady);
  const displayCustomerName=customer?.fullName??(customerMode==="NEW"?newName.trim():"");
  const control="app-control";

  function selectCustomerState(next:Customer){
    setCustomerMode("SEARCH");
    setCustomerId(next.id);
    setCustomerSearch(next.fullName+(next.mobile?" · "+formatMobile(next.mobile):""));
    setNewName("");setNewMobile("");
    const activeBanks=next.bankAccounts.filter(x=>x.isActive);
    setBank(activeBanks.length===1?activeBanks[0].bankName:"");
  }
  function beginSearch(){
    setCustomerMode("SEARCH");setCustomerId("");setCustomerSearch("");
    setNewName("");setNewMobile("");setBank("");
  }
  function beginNew(){
    const digits=mobileDigits(customerSearch);
    setCustomerMode("NEW");setCustomerId("");
    setNewMobile(digits.length===10?digits:"");
    setNewName(digits.length===10?"":customerSearch.trim());
    setBank("");
  }

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!canSave)return;
    setSaving(true);setError("");
    try{
      const result=await apiFetch<SavedAeps>("/transactions/aeps",{method:"POST",body:JSON.stringify({
        ...(customerMode==="NEW"
          ? {newCustomer:{fullName:newName.trim(),mobile:newMobile.trim()||undefined}}
          : {customerId}),
        aadhaarLastFour:aadhaar,
        customerBankName:bank.trim(),
        withdrawalAmount:baseAmount,
        commissionMethod,
        successful,
        cashPayoutNow,
        cashPayoutDueAt:successful&&!cashPayoutNow&&cashPayoutDueAt?new Date(cashPayoutDueAt+"T12:00:00").toISOString():undefined,
        platformId:platformId.trim()||undefined,
        providerId,
        gatewayId:gatewayId||undefined,
        platformChargeRate:providerHasGateways?Number(chargeRate||0):0,
        commissionRate:Number(commissionRate||0),
        cashAccountId:successful&&cashPayoutNow?cashAccountId||undefined:undefined,
        settlementAccountId,
        commissionReceiptAccountId:successful&&commissionSeparate?commissionReceiptAccountId||undefined:undefined,
        settledNow:successful?settledNow:false,
        settlementDueAt:successful&&!settledNow&&settlementDueAt?new Date(settlementDueAt).toISOString():undefined,
        providerReference:reference.trim()||undefined,
        transactionAt:transactionAt?new Date(transactionAt).toISOString():undefined,
        notes:notes.trim()||undefined,
      })});
      router.push("/transactions/"+result.transaction.id);
    }catch(err){
      setError(err instanceof Error?err.message:"Failed to save Aadhaar withdrawal");
      window.scrollTo({top:0,behavior:"smooth"});
    }finally{setSaving(false);}
  }

  if(loading)return <AppShell><PageLoader label="Preparing Aadhaar withdrawal…"/></AppShell>;

  return <AppShell><form onSubmit={submit} className="swipe-commerce-page">
    <div className="mx-auto max-w-6xl pb-28 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5 lg:pb-24">
      <div className="space-y-3">
        {error?<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

        <Surface className="entry-sheet overflow-visible">
          <section className="entry-section">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="entry-title">Aadhaar withdrawal</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Only Aadhaar last 4 digits are stored.</p></div>
              <div className="customer-mode-switch grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={beginSearch} className={"min-h-9 rounded-lg px-3 text-xs font-bold "+(customerMode==="SEARCH"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Existing</button>
                <button type="button" onClick={beginNew} className={"min-h-9 rounded-lg px-3 text-xs font-bold "+(customerMode==="NEW"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>New</button>
              </div>
            </div>

            {customerMode==="NEW"?<div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Customer name"><input className={control} value={newName} onChange={e=>setNewName(e.target.value)} autoFocus placeholder="Full name"/></Field>
              <Field label="Mobile (optional)"><div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)]"><span className="grid h-11 place-items-center border-r border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-semibold text-[var(--text-muted)]">+91</span><input className="h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none" inputMode="numeric" maxLength={10} value={newMobile} onChange={e=>setNewMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile"/></div>{newMobile&&!mobileValid?<p className="mt-1 text-[11px] text-amber-600">Enter a valid Indian mobile number.</p>:null}</Field>
              {possibleExisting.length?<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2"><p className="text-xs font-semibold text-amber-900">Possible existing customer</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{possibleExisting.map(match=><button key={match.id} type="button" onClick={()=>selectCustomerState(match)} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-left"><span><strong className="block text-xs text-slate-900">{match.fullName}</strong><span className="text-[11px] text-slate-500">{formatMobile(match.mobile)||"No mobile"}</span></span><span className="text-xs font-semibold text-indigo-700">Use existing →</span></button>)}</div></div>:null}
            </div>:customer?<div className="mt-3 flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-xs font-extrabold text-[var(--accent)]">{customer.fullName.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-base font-bold">{customer.fullName}</p><p className="truncate text-xs text-[var(--text-muted)]">{formatMobile(customer.mobile)||"No mobile"}</p></div>
              <button type="button" onClick={beginSearch} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold">Change</button>
            </div>:<div className="relative mt-3">
              <input className={control+" text-base"} inputMode="search" value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search name or mobile" autoComplete="off" autoFocus/>
              {customerSearch.trim()?<div className="absolute inset-x-0 top-[calc(100%+.4rem)] z-40 max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl">{customerMatches.length?customerMatches.map(match=><button key={match.id} type="button" onClick={()=>selectCustomerState(match)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{match.fullName}</p><p className="truncate text-[11px] text-[var(--text-muted)]">{formatMobile(match.mobile)||"No mobile"}</p></div><span className="text-xs font-semibold text-[var(--accent)]">Use</span></button>):<button type="button" onClick={beginNew} className="w-full rounded-lg px-3 py-4 text-left text-xs font-semibold text-[var(--accent)]">No match · Create new customer</button>}</div>:null}
            </div>}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Aadhaar last 4"><input className={control+" font-mono text-base font-bold tracking-[.18em]"} inputMode="numeric" placeholder="0000" maxLength={4} value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,"").slice(0,4))} required/></Field>
              <Field label="Aadhaar-linked bank"><div><input list="aeps-bank-list" className={control} placeholder="Select or type bank" value={bank} onChange={e=>setBank(e.target.value)} required/><datalist id="aeps-bank-list">{bankOptions.map(name=><option key={name} value={name}/>)}</datalist></div></Field>
            </div>
          </section>

          <section className="entry-section entry-section-amount">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-3"><h2 className="entry-title">{commissionMethod==="ADD_ON"?"Customer gets cash":"Aadhaar withdrawal"}</h2><span className="currency-badge">₹ INR</span></div>
                <div className="relative mt-2"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-[var(--text-muted)]">₹</span><input className="entry-amount-input" type="text" inputMode="decimal" value={formatAmountInput(amount)} onChange={e=>setAmount(cleanAmountInput(e.target.value))} placeholder="0" required/></div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3"><h3 className="operational-label">Commission</h3>{commission>0?<strong className="money text-sm text-[var(--money-in)]">{money(commission)}</strong>:null}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                  <button type="button" onClick={()=>setCommissionMethod("DEDUCT")} className={"min-h-9 rounded-lg px-3 text-xs font-bold transition "+(commissionMethod==="DEDUCT"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Included</button>
                  <button type="button" onClick={()=>setCommissionMethod("ADD_ON")} className={"min-h-9 rounded-lg px-3 text-xs font-bold transition "+(commissionMethod==="ADD_ON"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Add on</button>
                </div>
                <div className="mt-2"><RateControl value={Number(commissionRate||0)} defaultValue={Number(defaultCommissionRate||0)} onChange={value=>setCommissionRate(rateText(value))}/></div>
                {baseAmount>0?<div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs"><span className="text-[var(--text-muted)]">{commissionMethod==="ADD_ON"?"Aadhaar bank debit":"Cash to customer"}</span><strong className="money">{money(commissionMethod==="ADD_ON"?withdrawal:Math.max(0,cashGiven))}</strong></div>:null}
              </div>
            </div>
          </section>

          <section className="entry-section entry-section-provider">
            <div className="flex items-center justify-between gap-3">
              <h2 className="entry-title">Aadhaar result & provider</h2>
              <span className={"status-chip "+(successful?(settledNow?"status-chip-green":"status-chip-blue"):"bg-rose-50 text-rose-700")}>{successful?(settledNow?"Wallet received":"Wallet pending"):"Failed"}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
              <button type="button" onClick={()=>setSuccessful(true)} className={"min-h-10 rounded-lg px-3 text-xs font-bold transition "+(successful?"bg-[var(--surface)] text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>Successful</button>
              <button type="button" onClick={()=>{setSuccessful(false);setSettledNow(false);setCommissionSettlementMode("INCLUDED");setCommissionReceiptAccountId("");setCashPayoutNow(false);}} className={"min-h-10 rounded-lg px-3 text-xs font-bold transition "+(!successful?"bg-[var(--surface)] text-rose-700 shadow-sm":"text-[var(--text-muted)]")}>Failed attempt</button>
            </div>

            {!successful?<div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800"><strong>Record attempt only.</strong> No provider settlement, commission income or customer cash payout will be posted.</div>:null}

            {!providers.some(p=>p.supportsAeps)?<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900">No Aadhaar-enabled provider is configured. Enable Aadhaar withdrawal under Settings → Payment Providers.</div>:null}
            <div className={"mt-3 grid gap-3 "+(providerHasGateways?"sm:grid-cols-3":"sm:grid-cols-1")}>
              <Field label="Provider"><SearchableSelect className={control} value={providerId} onChange={e=>setProviderId(e.target.value)} required><option value="">Select provider</option>{providers.filter(p=>p.supportsAeps).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect></Field>
              {providerHasGateways?<Field label="Gateway"><SearchableSelect className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)} required><option value="">Select gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</SearchableSelect></Field>:null}
              {successful&&providerHasGateways?<Field label="Provider fee %"><input className={control+" bg-[var(--surface-soft)] text-[var(--text-muted)]"} type="number" value={chargeRate} readOnly/></Field>:null}
            </div>
            {providerId&&!providerHasGateways?<p className="mt-2 text-[11px] font-semibold text-[var(--text-muted)]">This provider does not use a separate gateway.</p>:null}

            {successful&&providerWallet?<div className="wallet-summary-card mt-2 rounded-xl border border-[var(--border)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{providerWallet.accountName}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">Expected <strong className="money text-[var(--text)]">{money(settlement)}</strong>{settledNow&&settlement>0?<><span className="mx-1.5">·</span>{commissionSeparate?<><span>Wallet receives </span><strong className="money text-[var(--text)]">{money(mainSettlementReceipt)}</strong><span className="mx-1.5">·</span></>:null}After <strong className="money text-[var(--money-in)]">{money(providerWallet.currentBalance+mainSettlementReceipt)}</strong></>:null}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-[var(--surface-soft)] p-1">
                  <button type="button" onClick={()=>setSettledNow(true)} className={"min-h-8 rounded-md px-3 text-[11px] font-bold "+(settledNow?"bg-[var(--surface)] text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>Received</button>
                  <button type="button" onClick={()=>{setSettledNow(false);setCommissionSettlementMode("INCLUDED");setCommissionReceiptAccountId("");}} className={"min-h-8 rounded-md px-3 text-[11px] font-bold "+(!settledNow?"bg-[var(--surface)] text-amber-700 shadow-sm":"text-[var(--text-muted)]")}>Pending</button>
                </div>
              </div>
            </div>:successful&&providerId?<div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><Field label="Settlement account"><SearchableSelect className={control} value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Select receiving account</option>{accounts.filter(a=>a.isActive!==false&&["BANK","UPI"].includes(a.accountType)).map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</SearchableSelect></Field><div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-soft)] p-1"><button type="button" onClick={()=>setSettledNow(true)} className={"min-h-10 rounded-md px-3 text-xs font-bold "+(settledNow?"bg-[var(--surface)] text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>Received</button><button type="button" onClick={()=>{setSettledNow(false);setCommissionSettlementMode("INCLUDED");setCommissionReceiptAccountId("");}} className={"min-h-10 rounded-md px-3 text-xs font-bold "+(!settledNow?"bg-[var(--surface)] text-amber-700 shadow-sm":"text-[var(--text-muted)]")}>Pending</button></div></div>:null}

            {successful&&commission>0?<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-emerald-900">Commission settlement</span><strong className="money text-sm text-emerald-700">{money(commission)}</strong></div>
              {settledNow?<>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-white/70 p-1">
                  <button type="button" onClick={()=>{setCommissionSettlementMode("INCLUDED");setCommissionReceiptAccountId("");}} className={"min-h-9 rounded-md px-3 text-xs font-bold "+(commissionSettlementMode==="INCLUDED"?"bg-white text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Included</button>
                  <button type="button" onClick={()=>setCommissionSettlementMode("SEPARATE")} className={"min-h-9 rounded-md px-3 text-xs font-bold "+(commissionSettlementMode==="SEPARATE"?"bg-white text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Receive separately</button>
                </div>
                {commissionSettlementMode==="SEPARATE"?<div className="mt-2">
                  <Field label="Commission received into"><SearchableSelect className={control+" bg-white"} value={commissionReceiptAccountId} onChange={e=>setCommissionReceiptAccountId(e.target.value)} required><option value="">Select account</option>{commissionReceiptOptions.map(a=><option key={a.id} value={a.id} disabled={a.id===settlementAccountId}>{a.accountName} · {money(a.currentBalance)} available{a.id===settlementAccountId?" · settlement account":""}</option>)}</SearchableSelect></Field>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-white/70 px-3 py-2"><span className="block text-[var(--text-muted)]">Main settlement</span><strong className="money">{money(mainSettlementReceipt)}</strong></div><div className="rounded-lg bg-white/70 px-3 py-2"><span className="block text-[var(--text-muted)]">Commission</span><strong className="money text-emerald-700">{money(commission)}</strong></div></div>
                  {!commissionReceiptReady?<p className="mt-2 text-[11px] font-semibold text-rose-600">Choose a different account for the commission.</p>:null}
                  {!commissionSplitValid?<p className="mt-2 text-[11px] font-semibold text-rose-600">Commission cannot exceed the provider settlement.</p>:null}
                </div>:<p className="mt-2 text-xs text-emerald-900">Included in the provider settlement to {accounts.find(a=>a.id===settlementAccountId)?.accountName??"the settlement account"}.</p>}
              </>:<p className="mt-2 text-xs text-emerald-900">Commission stays inside the pending provider settlement. You can split it when the settlement is received.</p>}
            </div>:null}
          </section>

          {successful?<section className="entry-section entry-section-payout">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="entry-title">Customer cash</h2>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={()=>setCashPayoutNow(true)} className={"min-h-9 rounded-lg px-3 text-xs font-bold "+(cashPayoutNow?"bg-[var(--surface)] text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>Paid now</button>
                <button type="button" onClick={()=>{setCashPayoutNow(false);if(!cashPayoutDueAt)setCashPayoutDueAt(localDatePlus(1));}} className={"min-h-9 rounded-lg px-3 text-xs font-bold "+(!cashPayoutNow?"bg-[var(--surface)] text-amber-700 shadow-sm":"text-[var(--text-muted)]")}>Pay later</button>
              </div>
            </div>

            {cashPayoutNow?<>
              {cashAccount&&cashGiven>0?<div className="mt-2 flex justify-end"><span className={"status-chip "+(cashSufficient?"status-chip-green":"bg-rose-50 text-rose-700")}>{cashSufficient?"Cash ready":"Low cash"}</span></div>:null}
              {Object.keys(openCashSessions).length?<div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label={"Give "+money(Math.max(0,cashGiven))+" from"}><SearchableSelect className={control} value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Select cash account</option>{accounts.filter(a=>a.accountType==="CASH"&&a.isActive!==false).map(a=>{const session=openCashSessions[a.id];const live=Number(session?.liveExpectedClosingTotal??session?.openingTotal??a.currentBalance);return <option key={a.id} value={a.id} disabled={!session}>{a.accountName} · {session?money(live)+" available":"Closed"}</option>;})}</SearchableSelect></Field>
                {cashAccount?<div className={"rounded-xl border px-3 py-2.5 text-xs "+(cashSufficient?"border-[var(--border)] bg-[var(--surface)]":"border-rose-200 bg-rose-50")}><div><span className="text-[var(--text-muted)]">Available </span><strong>{money(cashCurrent)}</strong></div><div className="mt-1"><span className="text-[var(--text-muted)]">After payout </span><strong className={cashSufficient?"text-[var(--text)]":"text-rose-700"}>{money(cashAfter)}</strong></div></div>:null}
              </div>:<div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs"><span className="font-semibold text-amber-900">Open a cash drawer before paying the customer now.</span><Link href="/cash-counter" className="shrink-0 font-bold text-[var(--accent)]">Open Cash →</Link></div>}
              {!cashSufficient&&cashAccount?<p className="mt-2 text-xs font-semibold text-rose-600">{cashOpen?cashAccount.accountName+" does not have enough cash for this payout.":cashAccount.accountName+" is closed."}</p>:null}
            </>:<div className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
              <div><p className="text-xs font-bold text-amber-900">Due to customer</p><p className="money mt-1 text-xl font-black text-amber-900">{money(Math.max(0,cashGiven))}</p><p className="mt-1 text-[11px] text-amber-800">This will appear in Dues. Pay it when the customer returns.</p></div>
              <Field label="Expected pickup"><input className={control} type="date" value={cashPayoutDueAt} min={localDatePlus(0)} onChange={e=>setCashPayoutDueAt(e.target.value)} required/></Field>
            </div>}
          </section>:null}

          <section className="entry-section lg:hidden"><AepsSummary customerName={displayCustomerName} withdrawal={withdrawal} cashGiven={Math.max(0,cashGiven)} commission={commission} charge={charge} settlement={settlement} cashName={cashAccount?.accountName??""} providerName={provider?.name??""} gatewayName={gateway?.gatewayName??""} hasGateway={providerHasGateways} settledNow={settledNow} successful={successful} cashPayoutNow={cashPayoutNow} ready={calculationReady}/></section>

          <section className="entry-section p-0">
            <button type="button" onClick={()=>setShowOptional(v=>!v)} className="flex min-h-12 w-full items-center justify-between px-4 text-left"><span className="text-sm font-semibold">More details</span><span className="text-lg text-[var(--text-muted)]">{showOptional?"−":"+"}</span></button>
            {showOptional?<div className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2">
              <Field label="Terminal / platform ID"><input className={control} value={platformId} onChange={e=>setPlatformId(e.target.value)} placeholder="Optional"/></Field>
              {successful&&!settledNow?<Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>:null}
              <Field label="Provider reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="RRN / transaction ID"/></Field>
              <Field label="Transaction date & time (optional)"><input className={control} type="datetime-local" value={transactionAt} onChange={e=>setTransactionAt(e.target.value)}/><span className="mt-1 block text-[10px] text-[var(--text-muted)]">Leave blank to use the current date and time.</span></Field>
              <Field label="Notes" className={!settledNow?"":"sm:col-span-1"}><input className={control} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional"/></Field>
            </div>:null}
          </section>
        </Surface>
      </div>

      <aside className="fixed right-6 top-[92px] z-20 hidden w-[340px] space-y-3 lg:block"><AepsSummary customerName={displayCustomerName} withdrawal={withdrawal} cashGiven={Math.max(0,cashGiven)} commission={commission} charge={charge} settlement={settlement} cashName={cashAccount?.accountName??""} providerName={provider?.name??""} gatewayName={gateway?.gatewayName??""} hasGateway={providerHasGateways} settledNow={settledNow} successful={successful} cashPayoutNow={cashPayoutNow} ready={calculationReady}/></aside>
    </div>

    <div className="fixed bottom-6 right-6 z-40 hidden w-[340px] lg:block"><button disabled={!canSave} className="swipe-primary-action min-h-12 w-full rounded-xl px-4 text-sm font-bold text-white shadow-[0_14px_36px_rgba(37,99,235,.28)] disabled:opacity-35">{saving?"Saving…":!successful?"Record failed attempt":calculationReady?(cashPayoutNow?"Record withdrawal · "+money(cashGiven):"Record & create due · "+money(cashGiven)):"Record Aadhaar withdrawal"}</button></div>

    <div className="swipe-sticky-bar fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"><div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--text-muted)]">{!successful?"Failed attempt":displayCustomerName?(cashPayoutNow?displayCustomerName+" gets":displayCustomerName+" due"):(cashPayoutNow?"Customer gets":"Cash due")}</p><p className="sticky-money money truncate font-extrabold tracking-[-.035em]">{!successful?(baseAmount>0?money(baseAmount):"—"):calculationReady?money(cashGiven):"—"}</p><p className={"text-xs font-bold "+(successful?"money text-[var(--money-in)]":"text-rose-600")}>{successful?"Earn "+money(commission):"No money moved"}</p></div><button disabled={!canSave} className="swipe-primary-action min-h-12 min-w-[118px] rounded-xl px-4 text-sm font-bold text-white disabled:opacity-35">{saving?"Saving…":!successful?"Save failed":"Record"}</button></div></div>
  </form></AppShell>;
}
