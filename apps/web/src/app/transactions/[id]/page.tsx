"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Modal, PageFrame, PageLoader, StatusBadge, Surface } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType?:string;isActive?:boolean;currentBalance?:string|number};
type Entry={id:string;entryType:string;amount:string;description:string|null;ledgerAccount:{ledgerName:string}};
type Charge={id:string;chargeType:string;rate:string|null;amount:string};
type Commission={id:string;commissionType:string;rate:string;amount:string};
type Settlement={
 id:string;expectedAmount:string;receivedAmount:string;remainingAmount:string;status:string;dueAt:string|null;
 provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:Account;
 receipts:{id:string;amount:string;receivedAt:string;destinationAccount:Account}[];
};
type Payable={
 id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string;
 payments:{id:string;amount:string;status:string;sourceAccount:Account;transaction:{charges:Charge[]}}[];
};
type CardSwipe={swipeAmount:string;providerChargeRate:string;providerChargeAmount:string;commissionRate:string;commissionAmount:string;customerPayableAmount:string;settlementAmount:string;dueAt:string;paymentTerm:{name:string}|null;settlementAccount:Account;customerCard:{bankName:string;lastFourDigits:string}|null};
type CashTransfer={requestedAmount:string;commissionMethod:string;commissionRate:string;commissionAmount:string;cashReceived:string;actualTransferAmount:string;transferChargeAmount:string;sourceAccount:Account;cashAccount:Account};
type Aeps={withdrawalAmount:string;platformChargeRate:string|null;platformChargeAmount:string;commissionRate:string|null;commissionMethod:string;commissionAmount:string;cashGiven:string;settlementAmount:string;cashAccount:Account|null;settlementAccount:Account;customerBankName:string;aadhaarLastFour:string};
type MicroAtm={withdrawalAmount:string;providerCommissionRate:string;providerCommissionAmount:string;cashGiven:string;settlementAmount:string;cashAccount:Account;settlementAccount:Account;customerBankName:string|null;cardLastFour:string};
type Expense={expenseCategoryId:string;amount:string;description:string|null;paymentAccountId:string|null;expenseCategory:{name:string};paymentAccount:Account|null};
type QuickCash={direction:"IN"|"OUT";purpose:string;serviceName:string|null;servicePaymentMode:string;amount:string;commissionAmount:string;commissionCashAmount:string|null;commissionMode:"CASH"|"UPI"|"SPLIT"|null;cashAccount:Account;sourceAccount:Account|null;commissionAccount:Account|null;servicePaymentAccount:Account|null};
type Tx={
 id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
 status:string;referenceNumber:string|null;notes:string|null;reversalReason:string|null;createdById:string;createdBy:{id:string;fullName:string}|null;
 customer:{fullName:string}|null;charges:Charge[];commissions:Commission[];journal:{journalNumber:string;description:string;entries:Entry[]}|null;
 payable:Payable|null;providerSettlementSource:Settlement|null;cardSwipe:CardSwipe|null;cashTransfer:CashTransfer|null;quickCashTransfer:QuickCash|null;aeps:Aeps|null;microAtm:MicroAtm|null;expense:Expense|null;
};

const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const tone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/w/g,c=>c.toUpperCase());
const sum=(rows:{amount:string}[])=>rows.reduce((a,x)=>a+Number(x.amount),0);
const displayService=(tx:Tx)=>tx.transactionType==="SERVICE_INCOME"&&tx.quickCashTransfer?.serviceName?tx.quickCashTransfer.serviceName:label(tx.transactionType);
function payoutDisplay(payable:Payable|null){
 if(!payable)return null;
 if(payable.status==="PAID")return {label:"Payout Paid",tone:"emerald" as const};
 if(payable.status==="PARTIALLY_PAID")return {label:"Payout Partially Paid",tone:"amber" as const};
 if(["CANCELLED","REVERSED"].includes(payable.status))return {label:"Payout "+label(payable.status),tone:"rose" as const};
 const due=new Date(payable.dueAt),now=new Date();
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const dueDay=new Date(due.getFullYear(),due.getMonth(),due.getDate());
 if(dueDay<today)return {label:"Payout Overdue",tone:"rose" as const};
 if(dueDay.getTime()===today.getTime())return {label:"Payout Due Today",tone:"amber" as const};
 return {label:"Payout Pending",tone:"amber" as const};
}

function FlowCard({label:heading,value,meta,tone="neutral",children}:{label:string;value:number|string;meta?:string;tone?:"neutral"|"positive"|"negative"|"accent";children?:ReactNode}){
 const cls=tone==="positive"?"text-[var(--money-in)]":tone==="negative"?"text-[var(--money-out)]":tone==="accent"?"text-[var(--accent)]":"text-[var(--text)]";
 return <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
  <p className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[var(--text-muted)]">{heading}</p>
  <p className={"money mt-1.5 text-xl font-black tracking-[-.03em] "+cls}>{typeof value==="number"?money(value):value}</p>
  {meta?<p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">{meta}</p>:null}{children}
 </div>;
}

function MoneyFlow({tx}:{tx:Tx}){
 const gross=Number(tx.grossAmount),fees=sum(tx.charges),earnings=sum(tx.commissions),net=Number(tx.netAmount??tx.grossAmount);
 const payoutFees=tx.payable?.payments.filter(p=>p.status==="COMPLETED").reduce((total,p)=>total+sum(p.transaction.charges),0)??0;
 const settlement=tx.providerSettlementSource;
 if(tx.transactionType==="SERVICE_INCOME"){
  const d=tx.quickCashTransfer;
  const receivedIn=d?.servicePaymentMode==="UPI"
   ?d.servicePaymentAccount?.accountName??"Bank / UPI"
   :d?.cashAccount?.accountName??"Cash drawer";
  return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><h3 className="text-sm font-black">Service income</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Direct service revenue. No customer principal is included in this income.</p></div></div><div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 sm:p-4"><FlowCard label="Service" value={d?.serviceName??"Service"}/><FlowCard label="Service income" value={"+"+money(gross)} tone="positive" meta="Business revenue"/><FlowCard label="Received in" value={receivedIn} tone="accent" meta={d?.servicePaymentMode==="UPI"?"Bank / UPI":"Physical cash"}/></div></Surface>;
 }
 if(tx.transactionType==="CASH_TRANSFER"&&tx.quickCashTransfer){
  const d=tx.quickCashTransfer;
  const principal=Number(d.amount);
  const commission=Number(d.commissionAmount||0);
  const cashCommission=d.commissionCashAmount!==null&&d.commissionCashAmount!==undefined
    ?Number(d.commissionCashAmount)
    :d.commissionMode==="CASH"?commission:0;
  const digitalCommission=Math.max(0,commission-cashCommission);
  if(d.direction==="IN"){
   const cashReceived=principal+cashCommission;
   const commissionMeta=cashCommission>0&&digitalCommission>0
    ?money(cashCommission)+" cash + "+money(digitalCommission)+" bank / UPI"
    :cashCommission>0?"Cash":digitalCommission>0?"Bank / UPI":"No commission";
   return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Money movement</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Transfer principal and commission are tracked separately.</p></div><div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 sm:p-4"><FlowCard label="Transfer amount" value={principal} meta="Beneficiary principal"/><FlowCard label="Cash received" value={cashReceived} meta={d.cashAccount.accountName}/><FlowCard label="Business earns" value={"+"+money(commission)} tone="positive" meta={commissionMeta}/><FlowCard label="Transfer source" value={d.sourceAccount?.accountName??(tx.status==="PENDING"?"Pending":"—")} tone="accent" meta={tx.status==="PENDING"?"Complete source later":"Principal sent from this account"}/></div></Surface>;
  }
  const cashPaid=Math.max(0,principal-cashCommission);
  const commissionMeta=cashCommission>0&&digitalCommission>0
   ?money(cashCommission)+" cash + "+money(digitalCommission)+" bank / UPI"
   :cashCommission>0?"Cash":digitalCommission>0?"Bank / UPI":"No commission";
  return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Money movement</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Cash-out principal and commission are tracked separately.</p></div><div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 sm:p-4"><FlowCard label="Cash-out amount" value={principal}/><FlowCard label="Net drawer out" value={cashPaid} meta={d.cashAccount.accountName}/><FlowCard label="Business earns" value={"+"+money(commission)} tone="positive" meta={commissionMeta}/><FlowCard label="Incoming source" value={d.sourceAccount?.accountName??(tx.status==="PENDING"?"Pending":"—")} tone="accent"/></div></Surface>;
 }
 if(tx.transactionType==="CARD_SWIPE"){
  const customer=Number(tx.payable?.originalAmount??tx.cardSwipe?.customerPayableAmount??net);
  const settle=Number(settlement?.expectedAmount??tx.cardSwipe?.settlementAmount??gross-fees);
  const profit=earnings-fees-payoutFees;
  return <Surface className="overflow-hidden">
   <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><h3 className="text-sm font-black">Money movement</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">How this card swipe was split.</p></div>{settlement?<StatusBadge tone={settlement.status==="SETTLED"?"emerald":"amber"}>{label(settlement.status)}</StatusBadge>:null}</div>
   <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5 sm:p-4">
    <FlowCard label="Card processed" value={gross} meta="Customer card"/>
    <FlowCard label="Provider fee" value={"−"+money(fees)} tone="negative" meta={tx.charges[0]?.rate?Number(tx.charges[0].rate)+"%":"External processing cost"}/>
    <FlowCard label="Provider settlement" value={settle} tone="accent" meta={settlement?[settlement.provider?.name,settlement.gateway?.gatewayName].filter(Boolean).join(" · "):"Amount due from provider"}/>
    <FlowCard label="Customer gets" value={customer} meta={tx.payable?.status?label(tx.payable.status):"Customer payable"}/>
    <FlowCard label="Business profit" value={money(profit)} tone={profit>=0?"positive":"negative"} meta={"Customer fee "+money(earnings)+" − gateway "+money(fees)+" − payout "+money(payoutFees)}/>
   </div>
   <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2.5 text-[11px] text-[var(--text-muted)] sm:px-5">
    {settlement?<span>Provider: <b className="text-[var(--text)]">{settlement.provider?.name??"—"}</b></span>:null}
    {settlement?<span>Gateway: <b className="text-[var(--text)]">{settlement.gateway?.gatewayName??"—"}</b></span>:null}
    {settlement?<span>Received: <b className="money text-[var(--text)]">{money(settlement.receivedAmount)}</b></span>:null}
    {settlement&&Number(settlement.remainingAmount)>0?<span>Still clearing: <b className="money text-amber-700">{money(settlement.remainingAmount)}</b></span>:null}
    {payoutFees>0?<span>Payout charges: <b className="money text-[var(--money-out)]">{money(payoutFees)}</b></span>:null}
   </div>
  </Surface>;
 }
 if(tx.transactionType==="CASH_TRANSFER"&&tx.cashTransfer){
  const d=tx.cashTransfer;
  const received=tx.journal?.entries.filter(e=>e.entryType==="DEBIT"&&e.description?.startsWith("Customer payment received"))??[];
  const receivedMeta=received.length?received.map(e=>(e.description?.replace("Customer payment received · ","")||e.ledgerAccount.ledgerName)+" "+money(e.amount)).join(" + "):d.cashAccount.accountName;
  return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Money movement</h3></div><div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 sm:p-4"><FlowCard label="Customer paid" value={Number(d.cashReceived)} meta={receivedMeta}/><FlowCard label="Transfer sent" value={Number(d.actualTransferAmount)} tone="accent" meta={d.sourceAccount.accountName}/><FlowCard label="Business earns" value={"+"+money(d.commissionAmount)} tone="positive" meta={Number(d.commissionRate)+"% commission"}/>{Number(d.transferChargeAmount)>0?<FlowCard label="Transfer charge" value={"−"+money(d.transferChargeAmount)} tone="negative" meta="Bank / wallet cost"/>:null}</div></Surface>;
 }
 if(tx.transactionType==="AEPS_WITHDRAWAL"&&tx.aeps){
  const d=tx.aeps;
  if(tx.status==="FAILED"){
   return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Aadhaar attempt</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">The attempt was recorded, but no financial movement was posted.</p></div><div className="grid gap-2 p-3 sm:grid-cols-3 sm:p-4"><FlowCard label="Attempt amount" value={Number(d.withdrawalAmount)}/><FlowCard label="Result" value="Failed" tone="negative" meta={"Aadhaar •••• "+d.aadhaarLastFour}/><FlowCard label="Money moved" value={0} meta="No customer payout · no provider settlement"/></div></Surface>;
  }
  const cashDue=Boolean(tx.payable&&Number(tx.payable.remainingAmount)>0);
  return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black">Money movement</h3>{cashDue?<StatusBadge tone="amber">Cash due {money(tx.payable!.remainingAmount)}</StatusBadge>:null}</div></div><div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5 sm:p-4"><FlowCard label="Bank debit" value={Number(d.withdrawalAmount)}/>{Number(d.platformChargeAmount)>0?<FlowCard label="Provider fee" value={"−"+money(d.platformChargeAmount)} tone="negative"/>:null}<FlowCard label="Provider settlement" value={Number(d.settlementAmount)} tone="accent" meta={settlement?.provider?.name??d.settlementAccount.accountName}/><FlowCard label={cashDue?"Cash due":"Cash given"} value={Number(d.cashGiven)} meta={cashDue?(tx.payable?.status?label(tx.payable.status):"Customer payable"):(d.cashAccount?.accountName??"Paid to customer")}/><FlowCard label="Business earns" value={"+"+money(d.commissionAmount)} tone="positive" meta={(d.commissionMethod==="ADD_ON"?"Add on":"Included")+(d.commissionRate?" · "+Number(d.commissionRate)+"%":"")}/></div></Surface>;
 }
 if(tx.transactionType==="MICRO_ATM"&&tx.microAtm){
  const d=tx.microAtm;
  return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Money movement</h3></div><div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 sm:p-4"><FlowCard label="Customer withdrawal" value={Number(d.withdrawalAmount)}/><FlowCard label="Cash given" value={Number(d.cashGiven)} meta={d.cashAccount.accountName}/><FlowCard label="Provider settlement" value={Number(d.settlementAmount)} tone="accent" meta={settlement?.provider?.name??d.settlementAccount.accountName}/><FlowCard label="Business earns" value={"+"+money(d.providerCommissionAmount)} tone="positive" meta={Number(d.providerCommissionRate)+"% provider commission"}/></div></Surface>;
 }
 return <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Money movement</h3></div><div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 sm:p-4"><FlowCard label="Processed" value={gross}/>{fees>0?<FlowCard label="External fees" value={"−"+money(fees)} tone="negative"/>:null}{earnings>0?<FlowCard label="Business earns" value={"+"+money(earnings)} tone="positive"/>:null}<FlowCard label="Net value" value={net} tone="accent"/></div></Surface>;
}

export default function TransactionDetailPage(){
 const {id}=useParams<{id:string}>();const router=useRouter();const [tx,setTx]=useState<Tx|null>(null),[reason,setReason]=useState(""),[error,setError]=useState(""),[role,setRole]=useState(""),[saving,setSaving]=useState(false),[reverseOpen,setReverseOpen]=useState(false),[deleteOpen,setDeleteOpen]=useState(false),[dateTimeOpen,setDateTimeOpen]=useState(false),[editDateTime,setEditDateTime]=useState(""),[dateTimeReason,setDateTimeReason]=useState("");
 const [expenseSourceOpen,setExpenseSourceOpen]=useState(false),[expenseSourceId,setExpenseSourceId]=useState(""),[expenseSourceNote,setExpenseSourceNote]=useState(""),[expenseAccounts,setExpenseAccounts]=useState<Account[]>([]);
 const load=()=>apiFetch<Tx>("/transactions/"+id).then(setTx);
 useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}load().catch(e=>setError(e instanceof Error?e.message:"Failed to load transaction"));},[id]);
 async function reverse(e:FormEvent){e.preventDefault();setSaving(true);setError("");try{await apiFetch("/transactions/"+id+"/reverse",{method:"POST",body:JSON.stringify({reason})});setReason("");setReverseOpen(false);await load();}catch(err){setError(err instanceof Error?err.message:"Reversal failed");}finally{setSaving(false);}}
 async function deleteTransaction(e:FormEvent){e.preventDefault();setSaving(true);setError("");try{await apiFetch("/transactions/"+id+"/delete",{method:"POST",body:JSON.stringify({reason})});setReason("");setDeleteOpen(false);router.replace("/transactions");}catch(err){setError(err instanceof Error?err.message:"Delete failed");}finally{setSaving(false);}}
 function openDateTimeEditor(){
   if(!tx)return;
   const d=new Date(tx.transactionAt);
   const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
   setEditDateTime(local);setDateTimeReason("");setDateTimeOpen(true);
 }
 async function updateDateTime(e:FormEvent){
   e.preventDefault();if(!editDateTime)return;setSaving(true);setError("");
   try{
     await apiFetch("/transactions/"+id+"/date-time",{method:"POST",body:JSON.stringify({transactionAt:new Date(editDateTime).toISOString(),reason:dateTimeReason.trim()})});
     setDateTimeOpen(false);setDateTimeReason("");await load();
   }catch(err){setError(err instanceof Error?err.message:"Date/time update failed");}finally{setSaving(false);}
 }
 async function openExpenseSource(){
   setExpenseSourceId("");setExpenseSourceNote(tx?.notes||"");setError("");
   try{
     const rows=await apiFetch<Account[]>("/dashboard/accounts");
     setExpenseAccounts(rows.filter(a=>a.isActive!==false&&["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(a.accountType||"")));
     setExpenseSourceOpen(true);
   }catch(err){setError(err instanceof Error?err.message:"Could not load payment accounts");}
 }
 async function completeExpense(e:FormEvent){
   e.preventDefault();if(!expenseSourceId)return;setSaving(true);setError("");
   try{
     await apiFetch("/transactions/expense/"+id+"/complete",{method:"POST",body:JSON.stringify({paymentAccountId:expenseSourceId,notes:expenseSourceNote.trim()||undefined})});
     setExpenseSourceOpen(false);setExpenseSourceId("");await load();
   }catch(err){setError(err instanceof Error?err.message:"Could not complete expense");}finally{setSaving(false);}
 }
 if(!tx)return <AppShell><PageLoader label="Loading transaction…"/></AppShell>;

 const cardDueType=["CARD_DUE_CLEARING","CARD_DUE_RECOVERY","CARD_DUE_COMMISSION_COLLECTION"].includes(tx.transactionType);
 const canEditDateTime=role==="OWNER"||role==="ADMIN";
 const canDelete=role==="OWNER"&&!cardDueType&&tx.status!=="REVERSED"&&tx.transactionType!=="REVERSAL";
 const canReverse=role==="ADMIN"&&!cardDueType&&tx.status!=="REVERSED"&&tx.transactionType!=="REVERSAL";
 const payoutState=tx.transactionType==="CARD_SWIPE"?payoutDisplay(tx.payable):null;
 const fees=sum(tx.charges),commissionIncome=sum(tx.commissions),serviceIncome=tx.transactionType==="SERVICE_INCOME"?Number(tx.grossAmount):0,totalIncome=commissionIncome+serviceIncome,gross=Number(tx.grossAmount),net=Number(tx.netAmount??tx.grossAmount);
 const payoutFees=tx.payable?.payments.filter(p=>p.status==="COMPLETED").reduce((total,p)=>total+sum(p.transaction.charges),0)??0;
 const cardProfit=commissionIncome-fees-payoutFees;
 const businessResult=tx.transactionType==="CARD_SWIPE"?cardProfit:totalIncome-fees;
 const netLabel=tx.transactionType==="CARD_SWIPE"?"Customer gets":tx.transactionType==="AEPS_WITHDRAWAL"?(tx.status==="FAILED"?"Money moved":tx.payable&&Number(tx.payable.remainingAmount)>0?"Cash due":"Cash given"):tx.transactionType==="CASH_TRANSFER"?"Transferred":tx.transactionType==="SERVICE_INCOME"?"Amount received":"Net value";

 return <AppShell><PageFrame width="max-w-6xl">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href="/transactions" className="text-xs font-bold text-[var(--accent)]">← Transactions</Link><p className="mt-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-[var(--text-muted)]">{["BUSINESS_EXPENSE","PERSONAL_EXPENSE"].includes(tx.transactionType)?"Expense":displayService(tx)}</p><h1 className="mt-1 text-2xl font-black tracking-[-.035em] sm:text-3xl">{tx.transactionNumber}</h1><p className="mt-1 text-xs text-[var(--text-muted)]">{new Date(tx.transactionAt).toLocaleString("en-IN")} · {tx.createdBy?.fullName??tx.createdById}</p></div>
   <div className="flex flex-wrap items-center gap-2">{payoutState?<StatusBadge tone={payoutState.tone}>{payoutState.label}</StatusBadge>:null}<StatusBadge tone={tone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{tx.transactionType==="CARD_SWIPE"?"Swipe "+label(tx.status):label(tx.status)}</StatusBadge>{tx.expense&&tx.status==="PENDING"?<button onClick={()=>void openExpenseSource()} className="min-h-10 rounded-xl bg-amber-100 px-3 text-xs font-black text-amber-800">Add payment source</button>:null}{canEditDateTime?<button onClick={openDateTimeEditor} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--accent)]">Edit date & time</button>:null}{canDelete?<button onClick={()=>{setReason("");setDeleteOpen(true)}} className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700">Delete</button>:null}{canReverse?<button onClick={()=>setReverseOpen(true)} className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700">Reverse</button>:null}</div>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
   <FlowCard label="Processed" value={gross}/>
   <FlowCard label={netLabel} value={net} tone="accent"/>
   <FlowCard label={tx.transactionType==="CARD_SWIPE"?"Business profit":"Total income"} value={businessResult} tone={businessResult<0?"negative":"positive"} meta={tx.transactionType==="SERVICE_INCOME"?"Service income "+money(serviceIncome):commissionIncome>0?"Commission income "+money(commissionIncome):undefined}/>
   <FlowCard label="External fees" value={fees+payoutFees} tone="negative"/>
   <FlowCard label="Customer" value={tx.customer?.fullName??"—"} meta={tx.referenceNumber?"Ref "+tx.referenceNumber:undefined}/>
  </div>

  <MoneyFlow tx={tx}/>

  {tx.payable?<Surface className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><h3 className="text-sm font-black">Customer payout</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{tx.payable.payments.length?tx.payable.payments.map(p=>p.sourceAccount.accountName).join(", "):"Not paid yet"}</p></div><StatusBadge tone={(payoutDisplay(tx.payable)?.tone??"amber")}>{payoutDisplay(tx.payable)?.label??label(tx.payable.status)}</StatusBadge></div><div className="border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2.5 text-[11px] text-[var(--text-muted)] sm:px-5">Due <b className="text-[var(--text)]">{new Date(tx.payable.dueAt).toLocaleDateString("en-IN")}</b></div><div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4"><div className="bg-[var(--surface)] p-3.5"><p className="text-[10px] text-[var(--text-muted)]">Customer gets</p><p className="money mt-1 font-black">{money(tx.payable.originalAmount)}</p></div><div className="bg-[var(--surface)] p-3.5"><p className="text-[10px] text-[var(--text-muted)]">Paid</p><p className="money mt-1 font-black text-[var(--money-in)]">{money(tx.payable.paidAmount)}</p></div><div className="bg-[var(--surface)] p-3.5"><p className="text-[10px] text-[var(--text-muted)]">Payout charges</p><p className="money mt-1 font-black text-[var(--money-out)]">{money(payoutFees)}</p></div><div className="bg-[var(--surface)] p-3.5"><p className="text-[10px] text-[var(--text-muted)]">Remaining</p><p className="money mt-1 font-black">{money(tx.payable.remainingAmount)}</p></div></div></Surface>:null}

  <div className="grid gap-4 lg:grid-cols-2">
   <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Income & pricing</h3></div><div className="divide-y divide-[var(--border)] px-4 sm:px-5">{tx.transactionType==="SERVICE_INCOME"?<div className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-[var(--text-muted)]">Service income · {tx.quickCashTransfer?.serviceName??"Service"}</span><strong className="money text-[var(--money-in)]">+{money(serviceIncome)}</strong></div>:null}{tx.charges.map(c=><div key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-[var(--text-muted)]">Provider / bank fee{c.rate?" · "+Number(c.rate)+"%":""}</span><strong className="money text-[var(--money-out)]">−{money(c.amount)}</strong></div>)}{tx.commissions.map(c=><div key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-[var(--text-muted)]">{c.commissionType==="MICRO_ATM_PROVIDER"?"Provider commission":"Commission income"} · {Number(c.rate)}%</span><strong className="money text-[var(--money-in)]">+{money(c.amount)}</strong></div>)}{tx.transactionType==="CARD_SWIPE"&&payoutFees>0?<div className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-[var(--text-muted)]">Payout / wallet charges</span><strong className="money text-[var(--money-out)]">−{money(payoutFees)}</strong></div>:null}{tx.transactionType==="CARD_SWIPE"?<div className="flex items-center justify-between gap-4 py-3 text-sm font-bold"><span>Business profit</span><strong className={"money "+(cardProfit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{money(cardProfit)}</strong></div>:null}{!tx.charges.length&&!tx.commissions.length&&tx.transactionType!=="CARD_SWIPE"&&tx.transactionType!=="SERVICE_INCOME"?<div className="py-4 text-sm text-[var(--text-muted)]">No fees or income components.</div>:null}</div></Surface>
   <Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h3 className="text-sm font-black">Reference & notes</h3></div><div className="space-y-3 p-4 text-sm sm:p-5"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Reference</p><p className="mt-1 font-semibold">{tx.referenceNumber??"—"}</p></div>{tx.notes?<div><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Notes</p><p className="mt-1 whitespace-pre-wrap text-[var(--text-muted)]">{tx.notes}</p></div>:null}{tx.reversalReason?<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800"><strong className="block text-xs">Reversal reason</strong><p className="mt-1">{tx.reversalReason}</p></div>:null}</div></Surface>
  </div>

  {tx.journal?<details className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"><summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold sm:px-5">Accounting details <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{tx.journal.journalNumber}</span><span className="float-right text-[var(--text-muted)]">+</span></summary><div className="border-t border-[var(--border)]">
   <div className="space-y-2 p-3 md:hidden">{tx.journal.entries.map(e=><div key={e.id} className="rounded-xl bg-[var(--surface-soft)] p-3"><div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{e.ledgerAccount.ledgerName}</strong><StatusBadge tone={e.entryType==="CREDIT"?"emerald":"indigo"}>{e.entryType}</StatusBadge></div><div className="mt-2 flex items-end justify-between gap-3"><p className="text-[11px] text-[var(--text-muted)]">{e.description??"—"}</p><strong className="money">{money(e.amount)}</strong></div></div>)}</div>
   <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[620px] text-sm"><thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Ledger</th><th>Entry</th><th>Amount</th><th>Description</th></tr></thead><tbody>{tx.journal.entries.map(e=><tr key={e.id} className="border-t border-[var(--border)]"><td className="px-5 py-3 font-semibold">{e.ledgerAccount.ledgerName}</td><td>{e.entryType}</td><td className="money font-bold">{money(e.amount)}</td><td className="text-[var(--text-muted)]">{e.description??"—"}</td></tr>)}</tbody></table></div>
  </div></details>:null}

  <Modal open={expenseSourceOpen} title="Add payment source" description="Finish this pending expense by selecting where it was paid from." onClose={()=>setExpenseSourceOpen(false)} footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setExpenseSourceOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-bold">Later</button><button form="complete-expense" disabled={saving||!expenseSourceId} className="app-primary-button min-h-11 text-sm font-bold disabled:opacity-50">{saving?"Completing…":"Complete expense"}</button></div>}>
   <form id="complete-expense" onSubmit={completeExpense} className="space-y-3">
    <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Expense</p><p className="mt-1 font-black">{tx.expense?.expenseCategory.name??"Expense"} · {money(tx.expense?.amount??tx.grossAmount)}</p></div>
    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Paid from</span><SearchableSelect mobileSheet className="app-control w-full" value={expenseSourceId} onChange={e=>setExpenseSourceId(e.target.value)} required><option value="">Select cash / bank / UPI / wallet</option>{expenseAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}{a.currentBalance!==undefined?" · "+money(a.currentBalance):""}</option>)}</SearchableSelect></label>
    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Note <span className="font-normal">(optional)</span></span><textarea className="app-control min-h-24 w-full p-3" value={expenseSourceNote} onChange={e=>setExpenseSourceNote(e.target.value)} placeholder="Add a note"/></label>
   </form>
  </Modal>

  <Modal open={dateTimeOpen} title="Correct transaction date & time" description="Owner/Admin correction. Related transaction dates move with this correction and every old value stays in the audit trail." onClose={()=>setDateTimeOpen(false)} footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setDateTimeOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-bold">Cancel</button><button form="edit-date-time" disabled={saving||!editDateTime||dateTimeReason.trim().length<3} className="app-primary-button min-h-11 text-sm font-bold disabled:opacity-50">{saving?"Saving…":"Save correction"}</button></div>}>
   <form id="edit-date-time" onSubmit={updateDateTime} className="space-y-3">
    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Transaction date & time</span><input type="datetime-local" className="app-control w-full" value={editDateTime} onChange={e=>setEditDateTime(e.target.value)} required/></label>
    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Reason for correction</span><textarea className="app-control min-h-24 w-full p-3" minLength={3} value={dateTimeReason} onChange={e=>setDateTimeReason(e.target.value)} placeholder="Example: Transaction entered with wrong time" required/></label>
    <p className="text-[11px] leading-5 text-[var(--text-muted)]">This updates the linked business dates too: ledger posting, applicable due dates, payout/collection dates and provider settlement dates. System creation and audit timestamps are never rewritten.</p>
   </form>
  </Modal>

  <Modal open={deleteOpen} title="Delete transaction?" description="It will disappear from normal transaction lists. The financial effect is safely reversed and a permanent audit record is retained." onClose={()=>setDeleteOpen(false)} footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setDeleteOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-bold">Keep</button><button form="delete-tx" disabled={saving||reason.trim().length<3} className="min-h-11 rounded-xl bg-rose-700 text-sm font-black text-white disabled:opacity-50">{saving?"Deleting…":"Delete transaction"}</button></div>}>
   <form id="delete-tx" onSubmit={deleteTransaction} className="space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This is an accounting-safe delete: balances are reversed, linked open dues are updated, and the transaction is removed from normal operating views. Audit history is not erased.</div><label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Reason for deletion</span><textarea className="app-control min-h-28 w-full p-3" minLength={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Example: Duplicate transaction entered by mistake" required/></label></form>
  </Modal>

  <Modal open={reverseOpen} title="Reverse transaction?" description="The original stays in the audit trail and a balancing reversal is created." onClose={()=>setReverseOpen(false)} footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setReverseOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-bold">Keep</button><button form="reverse-tx" disabled={saving} className="min-h-11 rounded-xl bg-rose-700 text-sm font-bold text-white disabled:opacity-50">{saving?"Reversing…":"Confirm reversal"}</button></div>}>
   <form id="reverse-tx" onSubmit={reverse}><label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Reason</span><textarea className="app-control min-h-28 w-full p-3" minLength={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this being reversed?" required/></label></form>
  </Modal>
 </PageFrame></AppShell>;
}
