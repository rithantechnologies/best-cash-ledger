"use client";

import { SearchableSelect } from "@/components/searchable-select";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { defaultPaidToCustomerBank } from "@/lib/customer-bank-payout-default.mjs";

type Payment={
 id:string;paymentDate:string;amount:string;destinationType:string|null;destinationLabel:string|null;destinationReference:string|null;destinationDetails:Record<string,unknown>|null;referenceNumber:string|null;notes:string|null;status:string;
 sourceAccount:{accountName:string;accountType:string};transaction:{transactionNumber:string;status:string;charges:{amount:string}[]};
 createdBy:{id:string;fullName:string}|null;
};
type PayoutCard={id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean};
type PayoutBeneficiary={id:string;beneficiaryName:string;accounts:{id:string;bankName:string|null;accountReference:string|null;upiId:string|null;mobileNumber:string|null;isActive:boolean}[]};
type BankDestination={id:string;accountHolderName:string;bankName:string;accountReference:string;ifsc:string|null;isActive:boolean};
type UpiDestination={id:string;accountName:string;upiId:string|null;mobileNumber:string|null;providerName:string|null;isActive:boolean};
type Advance={
 id:string;remainingAdvance:number;receivableAmount:string;advanceAppliedAmount:string;
 remarks:string;customerCard:{bankName:string;lastFourDigits:string}|null;
 financialAccount:{accountName:string;accountType:string};
 transaction:{id:string;transactionNumber:string;transactionAt:string};
};
type AdvanceOffset={
 id:string;amount:string;notes:string|null;createdAt:string;reversedAt:string|null;
 advanceEntry:{id:string;remarks:string;financialAccount:{accountName:string};transaction:{id:string;transactionNumber:string;transactionAt:string}};
 transaction:{id:string;transactionNumber:string;status:string};
};
type Payable={
 id:string;originalAmount:string;paidAmount:string;offsetAmount:string;remainingAmount:string;dueAt:string;status:string;createdAt:string;
 customer:{id:string;fullName:string;customerCode:string;mobile:string|null;bankAccounts:BankDestination[];upiAccounts:UpiDestination[];cards:PayoutCard[];beneficiaries:PayoutBeneficiary[]};paymentTerm:{name:string}|null;
 sourceTransaction:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;referenceNumber:string|null;notes:string|null;status:string;cardSwipe:{customerCard:{id:string;bankName:string;lastFourDigits:string}|null}|null;providerSettlementSource:{status?:string}|null;charges:{amount:string}[];commissions:{amount:string}[]};
 payments:Payment[];advanceOffsets:AdvanceOffset[];availableAdvances:Advance[];manualLedgerAllocations:{id:string;amount:string;createdAt:string;customerLedgerEntry:{amount:string;remarks:string;financialAccount:{accountName:string;accountType:string};transaction:{id:string;transactionNumber:string;transactionAt:string;referenceNumber:string|null;charges:{amount:string}[]}}}[];createdBy:{id:string;fullName:string}|null;
};
type Audit={id:string;action:string;reason:string|null;createdAt:string;oldValues:unknown;newValues:unknown;user:{fullName:string}|null};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;providerId:string|null};
type PayoutChargeRule={minAmount:string;maxAmount:string|null;calculationType:"PERCENTAGE"|"FIXED";value:string};
type Provider={id:string;payoutChargeRules:PayoutChargeRule[]};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const allocatedCharge=(allocationAmount:string|number,movementAmount:string|number,charges:{amount:string}[])=>{const movement=Number(movementAmount||0);if(movement<=0)return 0;return charges.reduce((sum,x)=>sum+Number(x.amount||0),0)*Number(allocationAmount||0)/movement;};
const statusTone=(s:string)=>s==="PAID"?"emerald":s==="OVERDUE"?"rose":s==="PARTIALLY_PAID"?"indigo":s==="PENDING"?"amber":"slate";
const serviceLabel=(v:string)=>({AEPS_WITHDRAWAL:"AEPS",CARD_SWIPE:"Card Swipe",MICRO_ATM:"Micro ATM",ATM_WITHDRAWAL:"ATM Withdrawal",CASH_TRANSFER:"Cash Transfer"} as Record<string,string>)[v]??v.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
function configuredPayoutCharge(providers:Provider[],account:Account|undefined,amount:number){if(!account||account.accountType!=="PROVIDER_WALLET"||!account.providerId||amount<=0)return null;const rules=providers.find(p=>p.id===account.providerId)?.payoutChargeRules??[];if(!rules.length)return null;const rule=rules.find(r=>amount+0.001>=Number(r.minAmount)&&(r.maxAmount===null||amount<=Number(r.maxAmount)+0.001));if(!rule)return 0;const value=Number(rule.value||0);return Math.round((rule.calculationType==="PERCENTAGE"?amount*value/100:value)*100)/100;}

export default function PayableDetailPage(){
 const {id}=useParams<{id:string}>();
 const searchParams=useSearchParams();
 const backHref=searchParams.get("from")==="dues"?"/dues":"/payables";
 const backLabel=searchParams.get("from")==="dues"?"Dues":"Payables";
 const [item,setItem]=useState<Payable|null>(null),[audit,setAudit]=useState<Audit[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[providers,setProviders]=useState<Provider[]>([]),[error,setError]=useState("");
 const [payOpen,setPayOpen]=useState(false),[amount,setAmount]=useState(""),[charge,setCharge]=useState(""),[source,setSource]=useState(""),[destination,setDestination]=useState(""),[destinationDetails,setDestinationDetails]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState(""),[busy,setBusy]=useState(false);
 const [advanceOpen,setAdvanceOpen]=useState(false),[advanceId,setAdvanceId]=useState(""),[advanceAmount,setAdvanceAmount]=useState(""),[advanceNotes,setAdvanceNotes]=useState(""),[role,setRole]=useState("");
 const control="app-control";
 function load(){return apiFetch<Payable>("/payables/"+id).then(x=>{setItem(x);return Promise.all([apiFetch<Audit[]>("/audit?entityType=CUSTOMER_PAYABLE&entityId="+id).then(setAudit).catch(()=>{}),apiFetch<Account[]>("/dashboard/accounts").then(setAccounts),apiFetch<Provider[]>("/providers").then(setProviders)]);});}
 useEffect(()=>{
  try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}
  load().catch(e=>setError(e instanceof Error?e.message:"Failed to load payable"));
 },[id]);
 if(!item)return <AppShell><PageLoader label="Loading payable…"/></AppShell>;

 const progress=Math.min(100,Math.max(0,(Number(item.paidAmount)+Number(item.offsetAmount||0))/Math.max(1,Number(item.originalAmount))*100));
 const providerCharge=item.sourceTransaction.charges.reduce((s,x)=>s+Number(x.amount),0);
 const commission=item.sourceTransaction.commissions.reduce((s,x)=>s+Number(x.amount),0);
 const payoutCharges=item.payments.filter(p=>p.status==="COMPLETED").reduce((sum,p)=>sum+p.transaction.charges.reduce((chargeSum,x)=>chargeSum+Number(x.amount),0),0)+item.manualLedgerAllocations.reduce((sum,a)=>sum+allocatedCharge(a.amount,a.customerLedgerEntry.amount,a.customerLedgerEntry.transaction.charges),0);
 const profit=commission-providerCharge-payoutCharges;
 const sourceAccount=accounts.find(a=>a.id===source);
 const destinationType=destination==="CASH"?"CASH":destination.startsWith("CARD:")?"CUSTOMER_CARD":destination==="OTHER_CARD"?"OTHER_CARD":destination.startsWith("BANK:")?"CUSTOMER_BANK":destination.startsWith("UPI:")?"CUSTOMER_UPI":destination.startsWith("BENEFICIARY_ACCOUNT:")?"BENEFICIARY_ACCOUNT":destination==="OTHER"?"OTHER":"";
 const destinationId=destination.includes(":")?destination.split(":").slice(1).join(":"):undefined;
 const selectedBank=destinationType==="CUSTOMER_BANK"?item.customer.bankAccounts.find(a=>a.id===destinationId):undefined;
 const selectedUpi=destinationType==="CUSTOMER_UPI"?item.customer.upiAccounts.find(a=>a.id===destinationId):undefined;
 const payoutDetailsRequired=["OTHER","OTHER_CARD"].includes(destinationType);
 const invalidPayoutDetails=payoutDetailsRequired&&!destinationDetails.trim();
 const payoutSourceAccounts=accounts.filter(a=>["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)).filter(a=>destinationType==="CASH"?a.accountType==="CASH":destinationType?a.accountType!=="CASH":true);
 const walletSource=sourceAccount?.accountType==="PROVIDER_WALLET";
 const payoutAmount=Number(amount||0);
 const autoPayoutCharge=configuredPayoutCharge(providers,sourceAccount,payoutAmount);
 const payoutCharge=walletSource?(autoPayoutCharge===null?Number(charge||0):autoPayoutCharge):0;
 const sourceShort=payoutAmount>0&&sourceAccount?payoutAmount+payoutCharge>sourceAccount.currentBalance+0.001:false;
 const chosenAdvance=item.availableAdvances?.find(a=>a.id===advanceId);
 const requestedAdvance=Number(advanceAmount||0);
 const maxAdvance=Math.min(Number(item.remainingAmount),chosenAdvance?.remainingAdvance||0);
 const canApplyAdvance=!!chosenAdvance&&requestedAdvance>0&&requestedAdvance<=maxAdvance+.001;
 function openAdvance(){
  if(!item)return;
  const first=item.availableAdvances?.[0];setAdvanceId(first?.id||"");
  setAdvanceAmount(first?Math.min(first.remainingAdvance,Number(item.remainingAmount)).toFixed(2):"");
  setAdvanceNotes("");setAdvanceOpen(true);
 }
 async function applyAdvance(e:FormEvent){
  e.preventDefault();if(!item||!canApplyAdvance||busy)return;
  setBusy(true);setError("");
  try{
   await apiFetch("/payables/"+item.id+"/advance-offsets",{method:"POST",body:JSON.stringify({advanceEntryId:advanceId,amount:requestedAdvance,notes:advanceNotes||undefined})});
   setAdvanceOpen(false);await load();
  }catch(err){setError(err instanceof Error?err.message:"Could not apply previous Pay Out");}
  finally{setBusy(false);}
 }
 async function reverseAdvance(offset:AdvanceOffset){
  if(!item||busy)return;
  const reason=window.prompt("Reason to reverse the "+money(offset.amount)+" advance adjustment?");
  if(!reason||reason.trim().length<3)return;
  setBusy(true);setError("");
  try{
   await apiFetch("/payables/"+item.id+"/advance-offsets/"+offset.id+"/reverse",{method:"POST",body:JSON.stringify({reason:reason.trim()})});
   await load();
  }catch(err){setError(err instanceof Error?err.message:"Could not reverse advance adjustment");}
  finally{setBusy(false);}
 }
 const canPay=Number(item.remainingAmount)>0&&!["PAID","CANCELLED","REVERSED"].includes(item.status);
 async function submitPayment(e:FormEvent){e.preventDefault();if(!item||!canPay||!source||!destinationType||invalidPayoutDetails)return;setBusy(true);setError("");try{await apiFetch("/payables/"+item.id+"/payments",{method:"POST",body:JSON.stringify({amount:payoutAmount,chargeAmount:payoutCharge,sourceAccountId:source,destinationType,destinationId,destinationDetails:payoutDetailsRequired?destinationDetails.trim():undefined,referenceNumber:reference||undefined,notes:notes||undefined})});setPayOpen(false);setAmount("");setCharge("");setSource("");setDestination("");setDestinationDetails("");setReference("");setNotes("");await load();}catch(err){setError(err instanceof Error?err.message:"Payment failed");}finally{setBusy(false);}}
 function openPayment(){if(!item)return;setAmount(item.remainingAmount);setCharge("");setSource("");setDestination(defaultPaidToCustomerBank(item.customer.bankAccounts));setDestinationDetails("");setReference("");setNotes("");setPayOpen(true);}

 return <AppShell><PageFrame width="max-w-6xl">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href={backHref} className="text-xs font-bold text-indigo-600">← {backLabel}</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{item.customer.customerCode}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{item.customer.fullName}</h2><p className="mt-1 text-sm text-slate-500">{serviceLabel(item.sourceTransaction.transactionType)} · {item.sourceTransaction.transactionNumber} · Due {new Date(item.dueAt).toLocaleString("en-IN")}</p></div>
   <div className="flex flex-wrap items-center gap-2">{canPay&&item.sourceTransaction.transactionType==="CARD_SWIPE"&&item.availableAdvances?.length?<button type="button" onClick={openAdvance} className="min-h-10 rounded-xl border border-indigo-300 bg-indigo-50 px-3 text-xs font-bold text-indigo-700">Apply earlier Pay Out</button>:null}{canPay?<button type="button" onClick={openPayment} className="app-primary-button min-h-10 px-4 text-xs font-bold">Pay now</button>:null}<StatusBadge tone={statusTone(item.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{item.status.replaceAll("_"," ")}</StatusBadge></div>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
   <DetailStat label="Customer gets" value={money(item.originalAmount)}/>
   <DetailStat label="Actually paid out" value={money(item.paidAmount)} tone="emerald"/>
   <DetailStat label="Earlier advance applied" value={money(item.offsetAmount||0)} tone="indigo"/>
   <DetailStat label="Still to send" value={money(item.remainingAmount)} tone="amber"/>
  </div>
  {item.sourceTransaction.transactionType==="CARD_SWIPE"&&Number(item.remainingAmount)>0?<p className="text-xs text-[var(--text-muted)]">Send now, send later, split payments, or apply a prior Pay Out. No second payment is made when an earlier advance is applied.</p>:null}

  <Surface className="p-4 sm:p-5">
   <div className="flex items-center justify-between text-xs"><strong>Payout progress</strong><span className="font-bold text-slate-500">{progress.toFixed(0)}%</span></div>
   <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:progress+"%"}}/></div>
   <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm lg:grid-cols-4">
    {[["Payment term",item.paymentTerm?.name||"—"],["Operator",item.createdBy?.fullName||"Unknown"],["Source reference",item.sourceTransaction.referenceNumber||"—"],["Provider settlement",item.sourceTransaction.providerSettlementSource?.status?.replaceAll("_"," ")||"—"],["Provider / bank fee",money(providerCharge)],["Customer fee",money(commission)],["Payout charges",money(payoutCharges)],["Business profit",money(profit)],["Created",new Date(item.createdAt).toLocaleString("en-IN")],["Source status",item.sourceTransaction.status]].map(([l,v])=><div key={l}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className="mt-1 break-words font-semibold">{v}</p></div>)}
   </div>
  </Surface>
  <Surface className="overflow-hidden">
   <PanelHeader title="Payout history" description="Every payment recorded against this customer obligation."/>
   {item.payments.length?<><div className="space-y-2 p-3 md:hidden">{item.payments.map(p=><div key={p.id} className="rounded-xl bg-slate-50 p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{money(p.amount)}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(p.paymentDate).toLocaleString("en-IN")}</p></div><StatusBadge tone={p.status==="COMPLETED"?"emerald":"slate"}>{p.status}</StatusBadge></div>
    <div className="mt-2 space-y-1 text-xs text-slate-500"><p><strong className="text-slate-700">Paid to:</strong> {p.destinationLabel||"Destination not recorded"}{p.destinationReference?" · "+p.destinationReference:""}</p><p><strong className="text-slate-700">Paid from:</strong> {p.sourceAccount.accountName} · {p.transaction.transactionNumber}</p><p>Charge {money(p.transaction.charges.reduce((sum,x)=>sum+Number(x.amount),0))} · {p.referenceNumber||"No reference"} · {p.createdBy?.fullName||"Unknown operator"}</p></div>
   </div>)}</div>
   <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Paid to</th><th>Paid from</th><th>Amount</th><th>Charge</th><th>Reference</th><th>Operator</th><th>Status</th></tr></thead><tbody>{item.payments.map(p=><tr key={p.id} className="border-t border-slate-100"><td className="px-5 py-3 text-xs">{new Date(p.paymentDate).toLocaleString("en-IN")}</td><td>{p.transaction.transactionNumber}</td><td><p className="font-semibold">{p.destinationLabel||"Not recorded"}</p>{p.destinationReference?<p className="mt-0.5 text-[10px] text-slate-400">{p.destinationReference}</p>:null}</td><td>{p.sourceAccount.accountName}</td><td className="font-bold">{money(p.amount)}</td><td className="text-rose-600">{money(p.transaction.charges.reduce((sum,x)=>sum+Number(x.amount),0))}</td><td>{p.referenceNumber||"—"}</td><td>{p.createdBy?.fullName||"Unknown"}</td><td>{p.status}</td></tr>)}</tbody></table></div></>:<div className="p-4"><EmptyState title="No payouts recorded yet"/></div>}
  </Surface>
  {item.manualLedgerAllocations.length?<Surface className="overflow-hidden"><PanelHeader title="Matched Pay Out entries" description="Payments entered from the customer Card Ledger and allocated to this payable."/><div className="divide-y divide-slate-100">{item.manualLedgerAllocations.map(a=><Link key={a.id} href={"/transactions/"+a.customerLedgerEntry.transaction.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"><div><p className="text-sm font-bold">{a.customerLedgerEntry.remarks||"Pay Out"}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(a.customerLedgerEntry.transaction.transactionAt).toLocaleString("en-IN")} · {a.customerLedgerEntry.financialAccount.accountName} · {a.customerLedgerEntry.transaction.transactionNumber}</p></div><strong className="money text-sm text-rose-600">{money(a.amount)}</strong></Link>)}</div></Surface>:null}
  {item.sourceTransaction.transactionType==="CARD_SWIPE"?<Surface className="overflow-hidden">
   <PanelHeader title="Earlier Pay Out adjustments" description="Advances previously sent to the customer, adjusted here without moving money again."/>
   {item.advanceOffsets?.length?<div className="divide-y divide-[var(--border)]">{item.advanceOffsets.map(o=><div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
    <div><p className="text-sm font-bold">{money(o.amount)} · {o.reversedAt?"Reversed":"Applied"}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{o.advanceEntry.transaction.transactionNumber} · {o.advanceEntry.financialAccount.accountName} · {new Date(o.createdAt).toLocaleString("en-IN")}</p>{o.notes?<p className="mt-1 text-xs">{o.notes}</p>:null}</div>
    <div className="flex items-center gap-2"><Link href={"/transactions/"+o.transaction.id} className="text-xs font-bold text-[var(--accent)]">Journal →</Link>{!o.reversedAt&&(role==="OWNER"||role==="ADMIN")?<button type="button" disabled={busy} onClick={()=>reverseAdvance(o)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50">Reverse</button>:null}</div>
   </div>)}</div>:<div className="p-4"><EmptyState title="No advance adjustments"/></div>}
  </Surface>:null}
  {audit.length?<Surface className="overflow-hidden"><PanelHeader title="Audit history" description="Recorded changes to this payable."/><div className="divide-y divide-slate-100">{audit.map(a=><div key={a.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
   <div><p className="text-sm font-bold">{a.action.replaceAll("_"," ")}</p><p className="mt-0.5 text-[11px] text-slate-400">{a.user?.fullName||"Unknown operator"} · {new Date(a.createdAt).toLocaleString("en-IN")}</p>{a.reason?<p className="mt-1 text-xs text-slate-600">{a.reason}</p>:null}</div>
   <details className="text-xs"><summary className="cursor-pointer font-bold text-indigo-600">View change</summary><pre className="mt-2 max-w-lg overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details>
  </div>)}</div></Surface>:null}

  <Modal open={advanceOpen} title={"Apply earlier Pay Out · "+item.customer.fullName} description={"Still to send "+money(item.remainingAmount)+" · No new cash or bank transfer"} onClose={()=>setAdvanceOpen(false)}
   footer={<button form="apply-advance-form" disabled={busy||!canApplyAdvance} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-40">{busy?"Applying…":"Apply prior Pay Out"}</button>}>
   <form id="apply-advance-form" onSubmit={applyAdvance} className="space-y-3">
    <Field label="Earlier payment already sent">
     <SearchableSelect className={control} value={advanceId} required onChange={e=>{setAdvanceId(e.target.value);const a=item.availableAdvances?.find(v=>v.id===e.target.value);setAdvanceAmount(a?Math.min(a.remainingAdvance,Number(item.remainingAmount)).toFixed(2):"");}}>
      <option value="">Select earlier Pay Out</option>
      {(item.availableAdvances||[]).map(a=><option key={a.id} value={a.id}>{a.transaction.transactionNumber} · {money(a.remainingAdvance)} available · {a.financialAccount.accountName}{a.customerCard?" · "+a.customerCard.bankName+" •••• "+a.customerCard.lastFourDigits:""}</option>)}
     </SearchableSelect>
    </Field>
    <Field label="Apply amount"><input className={control} type="number" step="0.01" min="0.01" max={maxAdvance.toFixed(2)} value={advanceAmount} required onChange={e=>setAdvanceAmount(e.target.value)}/></Field>
    <p className="text-xs text-[var(--text-muted)]">The selected earlier Pay Out was already paid from its cash drawer/bank/wallet. Applying it reduces this swipe’s pending payout and the unapplied advance only. Money does not leave again.</p>
    <Field label="Notes (optional)"><input name="cashledger_notes_optional" autoComplete="on" className={control} maxLength={500} value={advanceNotes} onChange={e=>setAdvanceNotes(e.target.value)}/></Field>
   </form>
  </Modal>
  <Modal open={payOpen} title={"Pay "+item.customer.fullName} description={serviceLabel(item.sourceTransaction.transactionType)+" · Remaining "+money(item.remainingAmount)} onClose={()=>setPayOpen(false)} footer={<button form="detail-pay-form" disabled={busy||sourceShort||payoutAmount<=0||!source||!destinationType} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Recording payout…":"Record payment"}</button>}>
   <div className="space-y-3">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
     <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Payable for</p>
     <p className="mt-1 text-sm font-black">{item.customer.fullName}</p>
     <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{serviceLabel(item.sourceTransaction.transactionType)} · {item.sourceTransaction.transactionNumber}{item.sourceTransaction.cardSwipe?.customerCard?" · "+item.sourceTransaction.cardSwipe.customerCard.bankName+" •••• "+item.sourceTransaction.cardSwipe.customerCard.lastFourDigits:""}</p>
     <p className="text-xs text-[var(--text-muted)]">Due {new Date(item.dueAt).toLocaleString("en-IN")} · Remaining {money(item.remainingAmount)}</p>
    </div>
    <form id="detail-pay-form" onSubmit={submitPayment} className="grid gap-3 sm:grid-cols-2">
     <Field label="Pay to" className="sm:col-span-2">
      <SearchableSelect className={control} value={destination} onChange={e=>{setDestination(e.target.value);setDestinationDetails("");setSource("");setCharge("");}} required searchPlaceholder="Search customer bank, card or recipient…">
       <option value="">Select payout destination</option>
       <optgroup label="Customer bank accounts">{item.customer.bankAccounts.map(a=><option key={a.id} value={"BANK:"+a.id}>{a.accountHolderName} · {a.bankName} · {a.accountReference}</option>)}</optgroup>
       <optgroup label="Credit cards">{item.customer.cards.map(card=><option key={card.id} value={"CARD:"+card.id}>{(card.id===item.sourceTransaction.cardSwipe?.customerCard?.id?"Same swipe card · ":"Other saved card · ")+card.bankName+" ••••"+card.lastFourDigits}</option>)}
        <option value="OTHER_CARD">Another person&apos;s credit card</option>
       </optgroup>
       <optgroup label="Other payout destinations">
        <option value="CASH">Cash directly to {item.customer.fullName}</option>
        {item.customer.upiAccounts.map(a=><option key={a.id} value={"UPI:"+a.id}>{"Customer UPI · "+a.accountName+" · "+(a.upiId||a.mobileNumber||"UPI")}</option>)}
        {item.customer.beneficiaries.flatMap(b=>b.accounts.map(a=><option key={a.id} value={"BENEFICIARY_ACCOUNT:"+a.id}>{"Friend · "+b.beneficiaryName+" · "+(a.bankName||a.upiId||"UPI")}</option>))}
        <option value="OTHER">Other bank / UPI recipient</option>
       </optgroup>
      </SearchableSelect>
      {payoutDetailsRequired?<input aria-label={destinationType==="OTHER_CARD"?"Other card details":"Other recipient details"} className={control+" mt-2"} required value={destinationDetails} onChange={e=>setDestinationDetails(e.target.value)} maxLength={160} placeholder={destinationType==="OTHER_CARD"?"Cardholder, bank and last four digits only":"Recipient name and bank / UPI details"}/>:null}
      {destinationType==="CUSTOMER_BANK"&&selectedBank?<div className="mt-2 rounded-xl bg-[var(--surface-soft)] p-3 text-xs leading-5"><strong>{selectedBank.accountHolderName}</strong><br/>{selectedBank.bankName} · {selectedBank.accountReference}{selectedBank.ifsc?<><br/>IFSC {selectedBank.ifsc}</>:null}</div>:null}
      {destinationType==="CUSTOMER_UPI"&&selectedUpi?<div className="mt-2 rounded-xl bg-[var(--surface-soft)] p-3 text-xs leading-5"><strong>{selectedUpi.accountName}</strong>{selectedUpi.providerName?" · "+selectedUpi.providerName:""}<br/>{selectedUpi.upiId||selectedUpi.mobileNumber||"UPI account"}</div>:null}
      {!item.customer.bankAccounts.length&&!item.customer.upiAccounts.length?<Link href={"/customers/"+item.customer.id} className="mt-2 inline-block text-xs font-bold text-[var(--accent)]">No saved bank/UPI · Add in customer profile →</Link>:null}
     </Field>
     <Field label="Customer payout"><input className={control} type="number" step="0.01" max={item.remainingAmount} min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
     {walletSource?<Field label="Wallet payout charge" hint={autoPayoutCharge===null?"Deducted from business profit":"Auto from provider payout slab · deducted in addition to payout"}><input className={control} type="number" step="0.01" min="0" value={autoPayoutCharge===null?charge:String(autoPayoutCharge)} readOnly={autoPayoutCharge!==null} onChange={e=>setCharge(e.target.value)} placeholder="0.00"/></Field>:<div/>}
     <Field label="Paid from" hint={sourceAccount?"Available "+money(sourceAccount.currentBalance)+" · Debit "+money(payoutAmount+payoutCharge):destinationType==="CASH"?"Choose the cash drawer handing over the cash":"Choose bank, UPI or wallet sending the payment"}>
      <SearchableSelect className={control} value={source} onChange={e=>{setSource(e.target.value);const a=accounts.find(x=>x.id===e.target.value);if(a?.accountType!=="PROVIDER_WALLET")setCharge("");}} disabled={!destinationType} required searchPlaceholder="Search source account…">
       <option value="">{destinationType?"Select source account":"Select Pay to first"}</option>
       {payoutSourceAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)} available</option>)}
      </SearchableSelect>
      {sourceShort?<span className="mt-1.5 block text-[11px] font-semibold text-rose-600">Not enough available balance.</span>:null}
     </Field>
     <Field label="Reference / UTR"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder={destinationType==="CASH"?"Optional cash acknowledgement":"UTR / bank reference"}/></Field>
     <Field label="Notes" className="sm:col-span-2"><input name="cashledger_notes" autoComplete="on" className={control} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field>
    </form>
   </div>
  </Modal>
 </PageFrame></AppShell>;
}
