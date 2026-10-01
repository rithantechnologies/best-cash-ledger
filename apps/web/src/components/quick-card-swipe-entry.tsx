"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";
import { useRememberedValues } from "@/lib/remembered-values";

type Card={id:string;bankName:string;cardType?:string|null;cardNetworkId?:string|null;cardNetwork?:{id:string;name:string}|null;lastFourDigits:string;nickname?:string|null;isActive:boolean};
type Customer={id:string;fullName:string;mobile:string|null;cards:Card[];match?:{cardLastFour:string|null}};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string;isActive?:boolean};
type Provider={id:string;name:string;isActive?:boolean;gateways:Gateway[]};
type Term={id:string;name:string;durationValue:number;durationUnit:string;defaultCommissionRate:string;isActive?:boolean};
type Network={id:string;name:string;isActive?:boolean};
type CommissionRule={commissionRate:string}|null;
type SwipeHistory={
  transactionAt:string;
  commissions:{rate:string|null}[];
  cardSwipe:{
    providerId:string;gatewayId:string;providerChargeRate:string;commissionRate:string;paymentTermId:string|null;
    customerCard:{id:string;bankName:string;lastFourDigits:string;cardNetworkId?:string|null}|null;
  }|null;
};
type SavedSwipe={transaction:{id:string;transactionNumber:string};createdCustomer:{customer:{id:string};card:Card}|null};

const INDIAN_BANKS=[
  "State Bank of India","HDFC Bank","ICICI Bank","Axis Bank","Kotak Mahindra Bank","IndusInd Bank","Yes Bank","IDFC FIRST Bank","Federal Bank","RBL Bank","AU Small Finance Bank","Bandhan Bank","Bank of Baroda","Bank of India","Bank of Maharashtra","Canara Bank","Central Bank of India","Indian Bank","Indian Overseas Bank","Punjab National Bank","Punjab & Sind Bank","UCO Bank","Union Bank of India","South Indian Bank","Karur Vysya Bank","Karnataka Bank","City Union Bank","Tamilnad Mercantile Bank","DCB Bank","CSB Bank",
];
const money=(value:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(value||0));
const cleanAmount=(value:string)=>{const v=value.replace(/,/g,"").replace(/[^\d.]/g,"");const i=v.indexOf(".");return i<0?v:v.slice(0,i+1)+v.slice(i+1).replace(/\./g,"").slice(0,2);};
const mobileDigits=(value:string|null|undefined)=>{let d=(value??"").replace(/\D/g,"");if(d.length===12&&d.startsWith("91"))d=d.slice(2);return d;};
const validMobile=(value:string)=>/^[6-9]\d{9}$/.test(value);
const rateText=(value:number)=>Number(value.toFixed(4)).toString();
const canSearch=(value:string)=>/[a-z]/i.test(value.trim())?value.trim().length>=2:value.replace(/\D/g,"").length>=3;
const CUSTOM_PAYMENT_DATE="__CUSTOM_DATE__";
function dateInputValue(date:Date){return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);}
function tomorrowDateInput(){const date=new Date();date.setDate(date.getDate()+1);return dateInputValue(date);}
function customDueDate(value:string){return new Date(value+"T23:59:59.999").toISOString();}
function dueDate(term:Term){const unit=term.durationUnit==="DAYS"?24*60*60*1000:60*60*1000;return new Date(Date.now()+term.durationValue*unit).toISOString();}

export function QuickCardSwipeEntry({onSaved,showTrigger=true,buttonClassName=""}:{onSaved?:()=>void;showTrigger?:boolean;buttonClassName?:string}){
  const [ready,setReady]=useState(false),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const [providers,setProviders]=useState<Provider[]>([]),[terms,setTerms]=useState<Term[]>([]),[networks,setNetworks]=useState<Network[]>([]);
  const [mode,setMode]=useState<"existing"|"new">("existing"),[query,setQuery]=useState(""),[matches,setMatches]=useState<Customer[]>([]),[searching,setSearching]=useState(false),[customer,setCustomer]=useState<Customer|null>(null),[cardId,setCardId]=useState("");
  const [newName,setNewName]=useState(""),[newMobile,setNewMobile]=useState(""),[newBank,setNewBank]=useState(""),[newLastFour,setNewLastFour]=useState("");
  const [network,setNetwork]=useState(""),[amount,setAmount]=useState(""),[providerId,setProviderId]=useState(""),[gatewayId,setGatewayId]=useState(""),[termId,setTermId]=useState(""),[customPaymentDate,setCustomPaymentDate]=useState(""),[commissionRate,setCommissionRate]=useState("2.3"),[previousRate,setPreviousRate]=useState<number|null>(null),[commissionTouched,setCommissionTouched]=useState(false);
  const [swipeHistory,setSwipeHistory]=useState<SwipeHistory[]>([]),[historyLoading,setHistoryLoading]=useState(false);
  const {values:rememberedCustomerNames,remember:rememberCustomerName}=useRememberedValues("cashledger_recent_customer_names",8);

  useEffect(()=>setReady(true),[]);
  useEffect(()=>{const fn=()=>setOpen(true);window.addEventListener("cashledger:open-quick-card-swipe",fn);return()=>window.removeEventListener("cashledger:open-quick-card-swipe",fn);},[]);
  useEffect(()=>{if(!open)return;const prev=document.body.style.overflow;document.body.style.overflow="hidden";const key=(e:KeyboardEvent)=>{if(e.key==="Escape")close();};window.addEventListener("keydown",key);return()=>{document.body.style.overflow=prev;window.removeEventListener("keydown",key);};},[open]);
  useEffect(()=>{
    if(!open||providers.length)return;
    setLoading(true);setError("");
    Promise.all([apiFetch<Provider[]>("/providers"),apiFetch<Term[]>("/settings/payment-terms"),apiFetch<Network[]>("/settings/card-networks")])
      .then(([p,t,n])=>{
        setProviders(p);setTerms(t);setNetworks(n);
        const instant=t.find(x=>x.name.toLowerCase().includes("instant"))??t[0];if(instant)setTermId(instant.id);
        let remembered="";try{remembered=localStorage.getItem("cashledger_card_provider")||"";}catch{}
        const first=p.find(x=>x.id===remembered)??p[0];if(first)setProviderId(first.id);
      }).catch(e=>setError(e instanceof Error?e.message:"Could not load card swipe form")).finally(()=>setLoading(false));
  },[open,providers.length]);
  useEffect(()=>{
    if(!open||mode!=="existing"||!canSearch(query)||customer)return void setMatches([]);
    let cancelled=false;setSearching(true);const timer=window.setTimeout(()=>apiFetch<Customer[]>("/search/customers?q="+encodeURIComponent(query.trim())).then(rows=>{if(!cancelled)setMatches(rows.slice(0,8));}).catch(()=>{if(!cancelled)setMatches([]);}).finally(()=>{if(!cancelled)setSearching(false);}),180);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[open,mode,query,customer]);

  const provider=providers.find(p=>p.id===providerId),gateway=provider?.gateways.find(g=>g.id===gatewayId),term=terms.find(t=>t.id===termId),selectedCard=customer?.cards.find(c=>c.id===cardId);
  const customPayment=termId===CUSTOM_PAYMENT_DATE,minCustomPaymentDate=tomorrowDateInput();
  const visaNetworkId=networks.find(item=>item.isActive!==false&&item.name.trim().toLowerCase()==="visa")?.id??"";
  const selectedCardHistory=cardId?swipeHistory.find(row=>row.cardSwipe?.customerCard?.id===cardId):undefined;
  const historySetup=selectedCardHistory?.cardSwipe;
  const historyProvider=historySetup?providers.find(p=>p.id===historySetup.providerId):undefined;
  const historyGateway=historyProvider?.gateways.find(g=>g.id===historySetup?.gatewayId);
  const historyTerm=historySetup?terms.find(t=>t.id===historySetup.paymentTermId):undefined;
  const providerRate=historySetup&&historySetup.providerId===providerId&&historySetup.gatewayId===gatewayId?Number(historySetup.providerChargeRate):Number(gateway?.defaultChargeRate||0);
  const swipe=Number(amount||0),commission=swipe*Number(commissionRate||0)/100,providerFee=swipe*providerRate/100,payable=Math.max(0,swipe-commission),profit=commission-providerFee;
  const activeCards=customer?.cards.filter(c=>c.isActive)??[];

  useEffect(()=>{
    if(!provider)return;
    let remembered="";try{remembered=localStorage.getItem("cashledger_card_gateway_"+provider.id)||"";}catch{}
    setGatewayId(current=>{
      if(provider.gateways.some(g=>g.id===current&&g.isActive!==false))return current;
      const next=provider.gateways.find(g=>g.id===remembered&&g.isActive!==false)??provider.gateways.find(g=>g.isActive!==false);
      return next?.id??"";
    });
    try{localStorage.setItem("cashledger_card_provider",provider.id);}catch{}
    setCommissionTouched(false);
  },[providerId,provider]);
  useEffect(()=>{if(providerId&&gatewayId)try{localStorage.setItem("cashledger_card_gateway_"+providerId,gatewayId);}catch{}setCommissionTouched(false);},[providerId,gatewayId]);
  useEffect(()=>{setCommissionTouched(false);},[termId]);
  useEffect(()=>{
    if(!selectedCard)return;
    setNetwork(selectedCard.cardNetworkId&&networks.some(item=>item.id===selectedCard.cardNetworkId&&item.isActive!==false)?selectedCard.cardNetworkId:visaNetworkId);
  },[cardId,selectedCard,networks,visaNetworkId]);
  useEffect(()=>{
    if(!customer?.id){setSwipeHistory([]);setPreviousRate(null);setHistoryLoading(false);return;}
    let cancelled=false;setSwipeHistory([]);setPreviousRate(null);setHistoryLoading(true);
    apiFetch<SwipeHistory[]>("/transactions/customer/"+customer.id+"/card-swipes")
      .then(rows=>{if(!cancelled)setSwipeHistory(rows);})
      .catch(()=>{if(!cancelled)setSwipeHistory([]);})
      .finally(()=>{if(!cancelled)setHistoryLoading(false);});
    return()=>{cancelled=true;};
  },[customer?.id]);
  useEffect(()=>{
    if(!selectedCard||!historySetup)return;
    const priorProvider=providers.find(p=>p.id===historySetup.providerId&&p.isActive!==false);
    if(priorProvider?.gateways.some(g=>g.id===historySetup.gatewayId&&g.isActive!==false)){
      setProviderId(historySetup.providerId);
      setGatewayId(historySetup.gatewayId);
    }
    if(historySetup.paymentTermId&&terms.some(t=>t.id===historySetup.paymentTermId&&t.isActive!==false))setTermId(historySetup.paymentTermId);
    const priorNetworkId=selectedCard.cardNetworkId??historySetup.customerCard?.cardNetworkId??"";
    if(priorNetworkId&&networks.some(n=>n.id===priorNetworkId&&n.isActive!==false))setNetwork(priorNetworkId);
    const priorCommission=Number(historySetup.commissionRate||selectedCardHistory?.commissions.find(c=>c.rate!==null)?.rate||NaN);
    if(Number.isFinite(priorCommission)){
      setPreviousRate(priorCommission);
      if(!commissionTouched)setCommissionRate(rateText(priorCommission));
    }
  },[selectedCard,historySetup,selectedCardHistory,providers,terms,networks,commissionTouched]);
  useEffect(()=>{
    if(commissionTouched||!termId)return;
    const historicalRate=historySetup&&historySetup.providerId===providerId&&historySetup.gatewayId===gatewayId&&historySetup.paymentTermId===termId
      ?Number(historySetup.commissionRate||selectedCardHistory?.commissions.find(c=>c.rate!==null)?.rate||NaN):NaN;
    if(Number.isFinite(historicalRate)){
      setPreviousRate(historicalRate);
      setCommissionRate(rateText(historicalRate));
      return;
    }
    setPreviousRate(null);
    let cancelled=false;const q=new URLSearchParams({transactionType:"CARD_SWIPE"});if(!customPayment)q.set("paymentTermId",termId);
    if(customer?.id)q.set("customerId",customer.id);if(providerId)q.set("providerId",providerId);if(gatewayId)q.set("gatewayId",gatewayId);
    apiFetch<CommissionRule>("/settings/commission-rules/resolve?"+q.toString()).then(rule=>{
      if(cancelled)return;const termDefault=Number(term?.defaultCommissionRate||0);const next=rule?Number(rule.commissionRate):termDefault>0?termDefault:2.3;setCommissionRate(rateText(next));
    }).catch(()=>{if(!cancelled){const termDefault=Number(term?.defaultCommissionRate||0);setCommissionRate(rateText(termDefault>0?termDefault:2.3));}});
    return()=>{cancelled=true;};
  },[customer?.id,providerId,gatewayId,termId,term,historySetup,selectedCardHistory,commissionTouched,customPayment]);

  function reset(){setMode("existing");setQuery("");setMatches([]);setCustomer(null);setCardId("");setNewName("");setNewMobile("");setNewBank("");setNewLastFour("");setNetwork("");setAmount("");setCustomPaymentDate("");setCommissionRate("2.3");setPreviousRate(null);setCommissionTouched(false);setSwipeHistory([]);setHistoryLoading(false);setError("");}
  function close(){setOpen(false);reset();}
  function chooseCustomer(next:Customer){
    rememberCustomerName(next.fullName);
    setSwipeHistory([]);setCustomer(next);setQuery(next.fullName+(next.mobile?" · "+next.mobile:""));setMatches([]);setPreviousRate(null);setCommissionTouched(false);
    const digits=query.replace(/\D/g,"");const cards=next.cards.filter(c=>c.isActive);const matched=next.match?.cardLastFour?cards.find(c=>c.lastFourDigits===next.match?.cardLastFour):digits?cards.find(c=>c.lastFourDigits.includes(digits.slice(-4))):undefined;setCardId(matched?.id??(cards.length===1?cards[0].id:""));
  }
  function changeMode(next:"existing"|"new"){setMode(next);setCustomer(null);setCardId("");setQuery("");setMatches([]);setNetwork(next==="new"?visaNetworkId:"");setSwipeHistory([]);setPreviousRate(null);setError("");setCommissionTouched(false);}

  const existingReady=!!customer&&!!cardId&&!!network,newReady=!!newName.trim()&&validMobile(newMobile)&&!!newBank&&newLastFour.length===4&&!!network;
  const commissionValue=Number(commissionRate),commissionReady=commissionRate.trim()!==""&&Number.isFinite(commissionValue)&&commissionValue>=0&&commissionValue<=100;
  const paymentDateReady=customPayment?!!customPaymentDate&&customPaymentDate>=minCustomPaymentDate:!!termId;
  const canSave=!saving&&swipe>0&&commissionReady&&!!providerId&&!!gatewayId&&paymentDateReady&&(mode==="existing"?existingReady:newReady);

  async function submit(e:FormEvent){
    e.preventDefault();if(!canSave)return;setSaving(true);setError("");
    try{
      if(mode==="existing"&&selectedCard&&(selectedCard.cardNetworkId!==network||(selectedCard.cardType?.trim().toUpperCase()||"CREDIT")!=="CREDIT")){await apiFetch("/customers/cards/"+selectedCard.id,{method:"PATCH",body:JSON.stringify({cardNetworkId:network,cardType:"CREDIT"})});}
      const result=await apiFetch<SavedSwipe>("/transactions/card-swipe",{method:"POST",body:JSON.stringify({
        ...(mode==="new"?{newCustomer:{fullName:newName.trim(),mobile:newMobile,bankName:newBank,cardType:"CREDIT",cardNetworkId:network,lastFourDigits:newLastFour}}:{customerId:customer!.id,customerCardId:cardId}),
        swipeAmount:swipe,providerId,gatewayId,providerChargeRate:providerRate,commissionRate:Number(commissionRate),paymentTermId:customPayment?undefined:termId,dueAt:customPayment?customDueDate(customPaymentDate):dueDate(term!),settledNow:true,
      })});
      rememberCustomerName(mode==="existing"?customer?.fullName??"":newName);
      try{const customerId=mode==="existing"?customer!.id:result.createdCustomer?.customer.id;if(customerId)localStorage.setItem("cashledger_card_customer_pref_"+customerId,JSON.stringify({providerId,gatewayId,termId:customPayment?"":termId,cardId:mode==="existing"?cardId:result.createdCustomer?.card.id}));}catch{}
      close();onSaved?.();window.dispatchEvent(new CustomEvent("cashledger:card-swipe-saved",{detail:{transactionId:result.transaction.id}}));
    }catch(err){setError(err instanceof Error?err.message:"Card swipe could not be saved");}finally{setSaving(false);}
  }

  return <>
    {showTrigger?<button type="button" onClick={()=>setOpen(true)} className={"flex min-h-10 items-center gap-2 rounded-full bg-indigo-600 px-3.5 text-[13px] font-black text-white shadow-[0_8px_22px_rgba(79,70,229,.26)] transition hover:-translate-y-0.5 active:translate-y-0 "+buttonClassName}><span className="text-base">▣</span><span>Card Swipe</span></button>:null}
    {ready&&open?createPortal(<div className="fixed inset-0 z-[115] grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Quick card swipe">
      <form onSubmit={submit} className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--surface)] shadow-2xl sm:max-w-[640px] sm:rounded-[26px]">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><div><h3 className="text-[22px] font-black tracking-[-.04em]">Card Swipe</h3><p className="mt-0.5 text-[12px] font-bold text-[var(--text-muted)]">Customer, card, network, term and commission are required</p></div><button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-soft)] text-xl font-bold text-[var(--text-muted)]">×</button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="rounded-[18px] bg-[var(--surface-soft)] p-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface)] p-1"><button type="button" onClick={()=>changeMode("existing")} className={"min-h-9 rounded-lg text-xs font-black "+(mode==="existing"?"bg-indigo-600 text-white":"text-[var(--text-muted)]")}>Existing customer</button><button type="button" onClick={()=>changeMode("new")} className={"min-h-9 rounded-lg text-xs font-black "+(mode==="new"?"bg-indigo-600 text-white":"text-[var(--text-muted)]")}>New customer</button></div>
            {mode==="existing"?<div className="relative mt-3"><label className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Name, mobile or card last 4 *</label><input className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none" name="cashledger_quick_card_customer_search" autoComplete="off" list="cashledger-quick-card-remembered-names" value={query} onChange={e=>{setQuery(e.target.value);setCustomer(null);setCardId("");setNetwork("");}} placeholder="Search customer"/>{!customer&&canSearch(query)?<div className="absolute inset-x-0 top-[68px] z-30 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">{searching?<p className="p-3 text-xs text-[var(--text-muted)]">Searching…</p>:matches.length?matches.map(c=><button type="button" key={c.id} onClick={()=>chooseCustomer(c)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-[var(--surface-soft)]"><strong className="block text-sm">{c.fullName}</strong><span className="text-[11px] text-[var(--text-muted)]">{c.mobile||"No mobile"}{c.match?.cardLastFour?" · Card •••• "+c.match.cardLastFour:""}</span></button>):<p className="p-3 text-xs text-[var(--text-muted)]">No match. Choose New customer above.</p>}</div>:null}
            {customer?<div className="mt-3"><label className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Customer card *</label><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{activeCards.map(card=>{const selected=card.id===cardId;const last=swipeHistory.find(row=>row.cardSwipe?.customerCard?.id===card.id);return <button key={card.id} type="button" onClick={()=>{setCardId(card.id);setCommissionTouched(false);}} className={"min-w-[168px] rounded-2xl border px-3 py-3 text-left transition "+(selected?"border-indigo-500 bg-indigo-50 shadow-[0_8px_20px_rgba(79,70,229,.10)]":"border-[var(--border)] bg-[var(--surface)] hover:border-indigo-200")}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black">{card.bankName}</span>{selected?<span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-black text-white">Selected</span>:null}</div><p className="mt-2 font-mono text-sm font-black tracking-[.12em]">•••• {card.lastFourDigits}</p><div className="mt-2 flex items-center justify-between gap-2 text-[9px] font-bold text-[var(--text-muted)]"><span className="truncate">{[card.cardNetwork?.name,"CREDIT"].filter(Boolean).join(" · ")}</span><span className="shrink-0">{last?"Used "+new Date(last.transactionAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"No prior swipe"}</span></div></button>;})}</div>{historyLoading&&cardId?<p className="mt-2 text-[10px] font-bold text-[var(--text-muted)]">Loading this card&apos;s last setup…</p>:selectedCardHistory&&historySetup?<p className="mt-2 rounded-lg bg-indigo-50 px-2.5 py-2 text-[10px] font-bold text-indigo-700">Last setup loaded: {historyProvider?.name||"Provider"} · {historyGateway?.gatewayName||"Gateway"} · {historyTerm?.name||"Term"} · gateway {rateText(Number(historySetup.providerChargeRate))}% · commission {rateText(Number(historySetup.commissionRate))}%</p>:cardId?<p className="mt-2 text-[10px] font-semibold text-[var(--text-muted)]">No previous swipe for this card. Configured defaults will be used.</p>:<p className="mt-2 text-[10px] font-semibold text-[var(--text-muted)]">Tap a card to continue.</p>}</div>:null}</div>:
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><input className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" name="cashledger_quick_card_new_customer_name" autoComplete="section-quickcardcustomer name" list="cashledger-quick-card-remembered-names" value={newName} onChange={e=>setNewName(e.target.value.toUpperCase())} placeholder="Customer name *"/><input className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" type="tel" inputMode="numeric" name="cashledger_customer_mobile" autoComplete="section-quickcardcustomer tel" value={newMobile} onChange={e=>setNewMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile *"/><SearchableSelect mobileSheet className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={newBank} onChange={e=>setNewBank(e.target.value)}><option value="">Card bank *</option>{INDIAN_BANKS.map(bank=><option key={bank}>{bank}</option>)}</SearchableSelect><input className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold tracking-[.12em]" inputMode="numeric" autoComplete="off" value={newLastFour} onChange={e=>setNewLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Card last 4 *"/></div>}
          </div>
          <datalist id="cashledger-quick-card-remembered-names">{rememberedCustomerNames.map(name=><option key={name} value={name}/>)}</datalist>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Card type</span><div className="mt-1 flex min-h-11 w-full items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-black text-[var(--text)]">CREDIT</div></label>
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Card network *</span><SearchableSelect mobileSheet searchPlaceholder="Search card network" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={network} onChange={e=>setNetwork(e.target.value)}><option value="">Choose network</option>{networks.filter(item=>item.isActive!==false).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</SearchableSelect></label>
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Swipe amount *</span><div className="mt-1 flex min-h-11 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"><span className="mr-2 font-black">₹</span><input className="min-w-0 flex-1 bg-transparent text-lg font-black outline-none" inputMode="decimal" value={amount} onChange={e=>setAmount(cleanAmount(e.target.value))} placeholder="0"/></div></label>
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Provider / wallet *</span><SearchableSelect mobileSheet className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={providerId} onChange={e=>setProviderId(e.target.value)}><option value="">Choose provider</option>{providers.filter(p=>p.isActive!==false).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect></label>
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Gateway *</span><SearchableSelect mobileSheet className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={gatewayId} onChange={e=>setGatewayId(e.target.value)}><option value="">Choose gateway</option>{provider?.gateways.filter(g=>g.isActive!==false).map(g=><option key={g.id} value={g.id}>{g.gatewayName} · {rateText(g.id===gatewayId?providerRate:Number(g.defaultChargeRate))}%</option>)}</SearchableSelect></label>
            <div className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Payment term *</span><SearchableSelect mobileSheet searchPlaceholder="Search payment term" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={termId} onChange={e=>setTermId(e.target.value)}><option value="">Choose term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}<option value={CUSTOM_PAYMENT_DATE}>Choose future date…</option></SearchableSelect>{customPayment?<div className="mt-2"><input aria-label="Custom payment date" className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none" type="date" min={minCustomPaymentDate} value={customPaymentDate} onChange={e=>setCustomPaymentDate(e.target.value)} required/><p className="mt-1 text-[10px] font-semibold text-[var(--text-muted)]">Choose any future payment date.</p></div>:null}</div>
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Customer fee / commission % *</span><div className="relative mt-1"><input className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 pr-9 text-right text-lg font-black outline-none" type="number" inputMode="decimal" min="0" max="100" step="0.0001" value={commissionRate} onChange={e=>{setCommissionRate(e.target.value);setCommissionTouched(true);}}/><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)]">%</span></div><p className="mt-1 text-[10px] text-[var(--text-muted)]">{previousRate!==null&&!commissionTouched?"Using this card's last swipe rate":"Defaults to configured rate, otherwise 2.3%"}</p></label>
          </div>

          {swipe>0?<div className="mt-3 rounded-[18px] border border-[var(--border)] bg-[var(--surface-soft)] p-3"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Customer gets</p><p className="money mt-1 text-xl font-black">{money(payable)}</p></div><div className="text-right"><p className="text-[10px] text-[var(--text-muted)]">Business profit before payout charges</p><p className={"money mt-1 font-black "+(profit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{money(profit)}</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 text-xs"><div><span className="text-[var(--text-muted)]">Swipe</span><strong className="money mt-1 block">{money(swipe)}</strong></div><div><span className="text-[var(--text-muted)]">Customer fee</span><strong className="money mt-1 block text-[var(--money-in)]">{money(commission)}</strong></div><div><span className="text-[var(--text-muted)]">Gateway fee</span><strong className="money mt-1 block text-[var(--money-out)]">{money(providerFee)}</strong></div></div></div>:null}
          {loading?<p className="mt-3 text-xs font-bold text-[var(--text-muted)]">Loading swipe settings…</p>:null}{error?<div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700">{error}</div>:null}
        </div>
        <footer className="border-t border-[var(--border)] bg-[var(--surface)] p-3 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))]"><button disabled={!canSave||loading} className="min-h-[52px] w-full rounded-[16px] bg-indigo-600 px-5 text-base font-black text-white disabled:opacity-40">{saving?"Saving swipe…":"Save card swipe"}</button></footer>
      </form>
    </div>,document.body):null}
  </>;
}
