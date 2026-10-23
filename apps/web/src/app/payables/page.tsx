"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Field, Modal, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface, Toolbar } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { defaultPaidToCustomerBank } from "@/lib/customer-bank-payout-default.mjs";
import { PayablesNetBalanceReport, type NetBalanceReport } from "@/components/payables-net-balance-report";

type BankDestination={id:string;accountHolderName:string;bankName:string;accountReference:string;ifsc:string|null;isActive:boolean};
type UpiDestination={id:string;accountName:string;upiId:string|null;mobileNumber:string|null;providerName:string|null;isActive:boolean};
type PayoutCard={id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean};
type PayoutBeneficiary={id:string;beneficiaryName:string;accounts:{id:string;bankName:string|null;accountReference:string|null;upiId:string|null;mobileNumber:string|null;isActive:boolean}[]};
type Payable={id:string;originalAmount:string;paidAmount:string;offsetAmount:string;remainingAmount:string;dueAt:string;status:string;customer:{id:string;fullName:string;customerCode:string;mobile:string|null;bankAccounts:BankDestination[];upiAccounts:UpiDestination[];cards:PayoutCard[];beneficiaries:PayoutBeneficiary[]};sourceTransaction:{transactionNumber:string;transactionType:string;cardSwipe:{swipeAmount:string;commissionAmount:string;providerChargeAmount:string;customerCard:{id:string;bankName:string;lastFourDigits:string}|null}|null}};
type Account={id:string;accountName:string;accountType:string;currentBalance:number};
type Paged={items:Payable[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
type Reconciliation={inspected:number;issueCount:number;issues:{id:string;customer:string;transactionNumber:string;storedRemainingAmount:number;expectedRemainingAmount:number;reasons:string[]}[]};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v));
const statusTone=(s:string)=>s==="PAID"?"emerald":s==="OVERDUE"?"rose":s==="PARTIALLY_PAID"?"indigo":s==="PENDING"?"amber":"slate";
function payableDisplay(p:Payable){
 if(["PAID","CANCELLED","REVERSED"].includes(p.status))return {label:p.status.replaceAll("_"," "),tone:statusTone(p.status)};
 const due=new Date(p.dueAt),now=new Date();
 const dueDay=new Date(due.getFullYear(),due.getMonth(),due.getDate()).getTime();
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
 if(dueDay<today)return {label:"OVERDUE",tone:"rose"};
 if(dueDay===today)return {label:p.status==="PARTIALLY_PAID"?"PARTIALLY PAID · DUE TODAY":"DUE TODAY",tone:p.status==="PARTIALLY_PAID"?"indigo":"amber"};
 return {label:p.status.replaceAll("_"," "),tone:statusTone(p.status)};
}
const serviceLabel=(v:string)=>({AEPS_WITHDRAWAL:"AEPS",CARD_SWIPE:"Card Swipe",MICRO_ATM:"Micro ATM",ATM_WITHDRAWAL:"ATM Withdrawal",CASH_TRANSFER:"Cash Transfer",CUSTOMER_PAYOUT:"Customer Payout"} as Record<string,string>)[v]??v.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export default function PayablesPage(){
 const [items,setItems]=useState<Payable[]>([]),[accounts,setAccounts]=useState<Account[]>([]);
 const [dueReport,setDueReport]=useState<NetBalanceReport|null>(null),[dueDate,setDueDate]=useState("");
 const [downloading,setDownloading]=useState(false);
 const [reconciliation,setReconciliation]=useState<Reconciliation|null>(null);
 const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[status,setStatus]=useState("OPEN"),[transactionType,setTransactionType]=useState(""),[sortBy,setSortBy]=useState("dueAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("asc");
 const [selected,setSelected]=useState<Payable|null>(null),[amount,setAmount]=useState(""),[charge,setCharge]=useState(""),[source,setSource]=useState(""),[destination,setDestination]=useState(""),[destinationDetails,setDestinationDetails]=useState(""),[reference,setReference]=useState(""),[paymentNotes,setPaymentNotes]=useState(""),[payoutError,setPayoutError]=useState("");
 const paySaveRetryRef=useRef<{fingerprint:string;key:string}|null>(null);
 const [role,setRole]=useState(""),[cancelTarget,setCancelTarget]=useState<Payable|null>(null),[cancelReason,setCancelReason]=useState("");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const control="app-control";
 const sourceAccount=accounts.find(a=>a.id===source);
 const destinationType=destination==="CASH"?"CASH":destination.startsWith("CARD:")?"CUSTOMER_CARD":destination==="OTHER_CARD"?"OTHER_CARD":destination.startsWith("BANK:")?"CUSTOMER_BANK":destination.startsWith("UPI:")?"CUSTOMER_UPI":destination.startsWith("BENEFICIARY_ACCOUNT:")?"BENEFICIARY_ACCOUNT":destination==="OTHER"?"OTHER":"";
 const destinationId=destination.includes(":")?destination.split(":").slice(1).join(":"):undefined;
 const selectedBank=destinationType==="CUSTOMER_BANK"?selected?.customer.bankAccounts.find(a=>a.id===destinationId):undefined;
 const selectedUpi=destinationType==="CUSTOMER_UPI"?selected?.customer.upiAccounts.find(a=>a.id===destinationId):undefined;
 const walletPayoutAccounts=accounts.filter(a=>a.accountType==="PROVIDER_WALLET");
 const bankPayoutAccounts=accounts.filter(a=>["BANK","UPI"].includes(a.accountType));
 const cashPayoutAccounts=accounts.filter(a=>a.accountType==="CASH");
 const sourceIsCash=sourceAccount?.accountType==="CASH";
 const walletSource=sourceAccount?.accountType==="PROVIDER_WALLET";
 const payoutAmount=Number(amount||0);
 const payoutCharge=walletSource?Number(charge||0):0;
 const sourceShort=payoutAmount>0&&sourceAccount?payoutAmount+payoutCharge>sourceAccount.currentBalance+0.001:false;
 const payoutDetailsRequired=["OTHER","OTHER_CARD"].includes(destinationType);
 const invalidPayoutDetails=payoutDetailsRequired&&!destinationDetails.trim();
 const payoutAmountInvalid=!Number.isFinite(payoutAmount)||payoutAmount<=0||payoutAmount>Number(selected?.remainingAmount??0)+0.001;
 function openPayout(payable:Payable){
  paySaveRetryRef.current=null;
  setSelected(payable);setAmount(payable.remainingAmount);setCharge("");setSource("");setDestination(defaultPaidToCustomerBank(payable.customer.bankAccounts));
  setDestinationDetails("");setReference("");setPaymentNotes("");setPayoutError("");
 }
 function closePayout(){if(busy)return;setSelected(null);setPayoutError("");paySaveRetryRef.current=null;}
 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir});
  if(q.trim())params.set("q",q.trim());if(status==="OPEN")params.set("openOnly","true");else if(status)params.set("status",status);
  if(transactionType)params.set("transactionType",transactionType);
  if(dueDate)params.set("dueDate",dueDate);
  const summaryParams=new URLSearchParams();
  if(q.trim())summaryParams.set("q",q.trim());
  if(transactionType)summaryParams.set("transactionType",transactionType);
  setLoading(true);
  return Promise.all([
   apiFetch<Paged>("/payables?"+params.toString()),
   apiFetch<Account[]>("/dashboard/accounts"),
   apiFetch<NetBalanceReport>("/payables/due-report?"+summaryParams.toString()),
  ])
   .then(([p,a,r])=>{setItems(p.items);setPagination(p.pagination);setAccounts(a);setDueReport(r);setError("");})
   .finally(()=>setLoading(false));
 }
 useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);
 useEffect(()=>{if(role==="OWNER"||role==="ADMIN")apiFetch<Reconciliation>("/payables/reconciliation").then(setReconciliation).catch(()=>{});},[role]);
 useEffect(()=>{const timer=setTimeout(()=>load(1).catch(()=>setError("Failed to load payables")),180);return()=>clearTimeout(timer);},[q,status,transactionType,dueDate,sortBy,sortDir,pagination.pageSize]);

 async function pay(e:FormEvent){
  e.preventDefault();if(!selected||busy)return;
  if(payoutAmountInvalid||!destinationType||invalidPayoutDetails||!source||sourceShort){
   setPayoutError("Check the amount, source and recipient.");return;
  }
  const payload={
   amount:payoutAmount,chargeAmount:payoutCharge,sourceAccountId:source,destinationType,
   destinationId,destinationDetails:payoutDetailsRequired?destinationDetails.trim():undefined,
   referenceNumber:reference.trim()||undefined,notes:paymentNotes.trim()||undefined,
  };
  const fingerprint=JSON.stringify({payableId:selected.id,...payload});
  const previous=paySaveRetryRef.current;
  const key=previous?.fingerprint===fingerprint?previous.key:crypto.randomUUID();
  paySaveRetryRef.current={fingerprint,key};
  setBusy(true);setPayoutError("");
  try{
   await apiFetch("/payables/"+selected.id+"/payments",{
    method:"POST",headers:{"idempotency-key":key},body:JSON.stringify(payload),
   });
   setSelected(null);setAmount("");setCharge("");setSource("");setDestination("");
   setDestinationDetails("");setReference("");setPaymentNotes("");paySaveRetryRef.current=null;
   try{await load();}catch{setError("Payment saved. Refresh to see the updated balance. Do not pay again.");}
  }catch(err){
   const message=err instanceof Error?err.message:"Payment failed";
   if(message.startsWith("Duplicate request detected:")){
    try{await load();setSelected(null);paySaveRetryRef.current=null;setError("Payment already recorded. Balances refreshed.");}
    catch{setPayoutError("Payment may already be recorded. Refresh before trying again.");}
   }else setPayoutError(message);
  }finally{setBusy(false);}
 }
 async function cancelPayable(e:FormEvent){
  e.preventDefault();if(!cancelTarget||cancelReason.trim().length<3)return;setBusy(true);setError("");
  try{await apiFetch("/payables/"+cancelTarget.id+"/cancel",{method:"POST",body:JSON.stringify({reason:cancelReason.trim()})});setCancelTarget(null);setCancelReason("");await load();}
  catch(err){setError(err instanceof Error?err.message:"Cancellation failed");}finally{setBusy(false);}
 }
 async function downloadDueExcel(){
  if(downloading)return;
  setDownloading(true);setError("");
  try{
   const query=new URLSearchParams();
   if(q.trim())query.set("q",q.trim());
   if(transactionType)query.set("transactionType",transactionType);
   const headers=new Headers();
   const token=localStorage.getItem("cashledger_token");
   if(token)headers.set("authorization","Bearer "+token);
   const response=await fetch((process.env.NEXT_PUBLIC_BASE_PATH??"")+"/api/payables/due-report/excel?"+query.toString(),{headers,credentials:"include",cache:"no-store"});
   if(!response.ok){
    const body=await response.json().catch(()=>({}));
    throw new Error(Array.isArray(body.message)?body.message.join(", "):body.message??"Excel export failed");
   }
   const url=URL.createObjectURL(await response.blob());
   const link=document.createElement("a");
   link.href=url;link.download="CashLedger_NET_BALANCE_"+(dueReport?.businessDate??"today")+".xlsx";
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(err){setError(err instanceof Error?err.message:"Unable to download Excel");}
  finally{setDownloading(false);}
 }
 function sort(column:string){if(sortBy===column)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortBy(column);setSortDir("asc");}}
 const sh=(label:string,col:string)=><button onClick={()=>sort(col)} className="font-bold">{label}{sortBy===col?(sortDir==="asc"?" ↑":" ↓"):""}</button>;
 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Payments" title="Payables"/>
  {reconciliation?.issueCount?<Surface className="border border-amber-300 bg-amber-50 p-4">
   <p className="text-sm font-bold text-amber-900">Payout reconciliation needs review · {reconciliation.issueCount} issue(s) across {reconciliation.inspected} payable records</p>
   <p className="mt-1 text-xs text-amber-800">No balances have been automatically changed. Open each case and verify the original payout and financial movement before correcting it.</p>
   <div className="mt-3 space-y-2">{reconciliation.issues.slice(0,20).map(issue=><Link key={issue.id} href={"/payables/"+issue.id} className="block rounded-lg border border-amber-200 bg-white p-2 text-xs">
    <span className="font-bold">{issue.customer} · {issue.transactionNumber}</span>
    <span className="ml-2">Stored due {money(issue.storedRemainingAmount)} · Calculated due {money(issue.expectedRemainingAmount)}</span>
    <p className="mt-1 text-amber-800">{issue.reasons.join(" · ")}</p>
   </Link>)}</div>
  </Surface>:null}

  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
    {dueReport?<><span className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">Overdue: {money(dueReport.totals.overdue)}</span>
    <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">Due today: {money(dueReport.totals.today)}</span>
    <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-800">Upcoming: {money(dueReport.totals.upcoming)}</span></>:null}
   </div>
   <button type="button" onClick={()=>void downloadDueExcel()} disabled={downloading} className="app-secondary-button min-h-10 px-4 text-xs font-black disabled:opacity-50">{downloading?"Preparing Excel…":"Download Excel"}</button>
  </div>
  {dueReport?<PayablesNetBalanceReport report={dueReport} selectedDate={dueDate} onSelectDate={date=>{setDueDate(current=>current===date?"":date);setStatus("OPEN");}}/>:null}
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <Toolbar>
   <input name="cashledger_q" autoComplete="on" className={control+" bg-slate-50"} placeholder="Search customer…" value={q} onChange={e=>setQ(e.target.value)}/>
   <SearchableSelect className={control} value={status} onChange={e=>setStatus(e.target.value)}><option value="OPEN">Outstanding only</option><option value="">All statuses / history</option>{["PENDING","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</SearchableSelect>
   <SearchableSelect className={control} value={transactionType} onChange={e=>setTransactionType(e.target.value)}><option value="">All services</option>{["AEPS_WITHDRAWAL","CARD_SWIPE","MICRO_ATM","ATM_WITHDRAWAL","CASH_TRANSFER"].map(x=><option key={x} value={x}>{serviceLabel(x)}</option>)}</SearchableSelect>
   <SearchableSelect className={control} value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="dueAt">Due date</option><option value="createdAt">Created</option><option value="remainingAmount">Remaining</option><option value="originalAmount">Original</option><option value="paidAmount">Paid</option><option value="offsetAmount">Advance applied</option><option value="status">Status</option></SearchableSelect>
   <SearchableSelect className={control} value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</SearchableSelect>
  </Toolbar>

  {dueDate?<div className="flex flex-wrap items-center gap-2 text-xs font-bold"><span>Showing payouts due {new Date(dueDate+"T12:00:00").toLocaleDateString("en-IN")}</span><button type="button" onClick={()=>setDueDate("")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--accent)]">Clear date filter</button></div>:null}
  {loading?<PageLoader label="Loading payables…"/>:<>
   <div className="space-y-2 md:hidden">{items.map(p=><Surface key={p.id} className="p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold">{p.customer.fullName}</p><p className="mt-0.5 text-[11px] text-slate-400">{serviceLabel(p.sourceTransaction.transactionType)} · {p.sourceTransaction.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">Due {new Date(p.dueAt).toLocaleDateString("en-IN")}</p>{p.sourceTransaction.cardSwipe?<p className="mt-1 text-[10px] font-semibold text-slate-500">Gross {money(p.sourceTransaction.cardSwipe.swipeAmount)} − customer charge {money(p.sourceTransaction.cardSwipe.commissionAmount)} = net {money(p.originalAmount)}</p>:null}</div><StatusBadge tone={payableDisplay(p).tone as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{payableDisplay(p).label}</StatusBadge></div>
    <div className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-xl bg-slate-200">
     {[["Original",p.originalAmount,""],["Paid",p.paidAmount,"text-emerald-700"],["Advance",p.offsetAmount||"0","text-indigo-700"],["Still to send",p.remainingAmount,"text-amber-700"]].map(([l,v,c])=><div key={l} className="bg-slate-50 p-2.5 text-center"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className={"mt-1 text-sm font-bold "+c}>{money(v)}</p></div>)}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2"><Link href={"/payables/"+p.id} className="flex min-h-10 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold">View details</Link><button onClick={()=>{openPayout(p);}} disabled={Number(p.remainingAmount)<=0||["CANCELLED","REVERSED","PAID"].includes(p.status)} className="app-primary-button min-h-10 text-xs font-bold disabled:opacity-40">Pay now</button></div>
    {(role==="OWNER"||role==="ADMIN")&&Number(p.paidAmount)===0&&Number(p.offsetAmount||0)===0&&Number(p.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(p.status)?<button onClick={()=>{setCancelTarget(p);setCancelReason("");}} className="mt-2 min-h-9 w-full rounded-xl text-xs font-bold text-rose-600">Cancel payable</button>:null}
   </Surface>)}{!items.length?<EmptyState title={q.trim()||status?"No matching payables":"Nothing to pay"} description={q.trim()||status?"Try another search or status.":"No outstanding customer payables."}/>:null}</div>

   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1030px] text-sm">
    <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Customer</th><th>Service / card</th><th>{sh("Net payable","originalAmount")}</th><th>{sh("Paid","paidAmount")}</th><th>{sh("Advance","offsetAmount")}</th><th>{sh("Still to send","remainingAmount")}</th><th>{sh("Due","dueAt")}</th><th>{sh("Status","status")}</th><th className="pr-5">Actions</th></tr></thead>
    <tbody>{items.map(p=><tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-3 font-semibold">{p.customer.fullName}</td><td><p className="font-semibold">{serviceLabel(p.sourceTransaction.transactionType)}</p><p className="mt-0.5 text-[10px] text-slate-400">{p.sourceTransaction.transactionNumber}</p>{p.sourceTransaction.cardSwipe?.customerCard?<p className="mt-0.5 text-[10px] text-slate-500">{p.sourceTransaction.cardSwipe.customerCard.bankName} ••••{p.sourceTransaction.cardSwipe.customerCard.lastFourDigits}</p>:null}{p.sourceTransaction.cardSwipe?<p className="mt-1 text-[10px] font-medium text-slate-500">Gross {money(p.sourceTransaction.cardSwipe.swipeAmount)} − service charge {money(p.sourceTransaction.cardSwipe.commissionAmount)}</p>:null}</td><td>{money(p.originalAmount)}</td><td className="text-emerald-700">{money(p.paidAmount)}</td><td className="text-indigo-700">{money(p.offsetAmount||0)}</td><td className="font-bold text-amber-700">{money(p.remainingAmount)}</td><td>{new Date(p.dueAt).toLocaleString("en-IN")}</td><td><StatusBadge tone={payableDisplay(p).tone as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{payableDisplay(p).label}</StatusBadge></td><td className="pr-5"><div className="flex gap-2"><Link href={"/payables/"+p.id} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">View</Link><button onClick={()=>{openPayout(p);}} disabled={Number(p.remainingAmount)<=0||["CANCELLED","REVERSED","PAID"].includes(p.status)} className="app-primary-button px-3 py-1.5 text-xs font-bold disabled:opacity-40">Pay</button>{(role==="OWNER"||role==="ADMIN")&&Number(p.paidAmount)===0&&Number(p.offsetAmount||0)===0&&Number(p.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(p.status)?<button onClick={()=>{setCancelTarget(p);setCancelReason("");}} className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-600">Cancel</button>:null}</div></td></tr>)}</tbody>
   </table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="payable" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}

  <Modal open={!!selected} title={selected?"Pay "+selected.customer.fullName:"Record payout"} description={selected?"Remaining "+money(selected.remainingAmount):undefined} onClose={closePayout}
   footer={<button form="pay-form" disabled={busy||sourceShort||payoutAmountInvalid||!source||!destinationType||invalidPayoutDetails} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Saving…":"Record payment"}</button>}>
   {selected?<div className="space-y-3">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
     <p className="text-sm font-black">{selected.customer.fullName}</p>
     <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{serviceLabel(selected.sourceTransaction.transactionType)} · {selected.sourceTransaction.transactionNumber}{selected.sourceTransaction.cardSwipe?.customerCard?" · "+selected.sourceTransaction.cardSwipe.customerCard.bankName+" •••• "+selected.sourceTransaction.cardSwipe.customerCard.lastFourDigits:""}</p>
     <p className="text-xs text-[var(--text-muted)]">Due {new Date(selected.dueAt).toLocaleString("en-IN")} · Remaining {money(selected.remainingAmount)}</p>
    </div>
    <form id="pay-form" onSubmit={pay} className="grid gap-3 sm:grid-cols-2">
     <Field label="Paid from *" className="sm:col-span-2" hint={sourceAccount?"Available "+money(sourceAccount.currentBalance):undefined}>
      <SearchableSelect className={control} value={source} onChange={e=>{const next=accounts.find(x=>x.id===e.target.value);setSource(e.target.value);setDestination(current=>next?.accountType==="CASH"?"CASH":current&&current!=="CASH"?current:defaultPaidToCustomerBank(selected?.customer.bankAccounts));setDestinationDetails("");setPayoutError("");if(next?.accountType!=="PROVIDER_WALLET")setCharge("");}} required searchPlaceholder="Search wallet or bank account…">
       <option value="">Select payout source</option>
       <optgroup label="Wallets">{walletPayoutAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)} available</option>)}</optgroup>
       <optgroup label="Bank / UPI accounts">{bankPayoutAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)} available</option>)}</optgroup>
       <optgroup label="Cash drawers">{cashPayoutAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)} available</option>)}</optgroup>
      </SearchableSelect>
      {sourceShort?<span className="mt-1.5 block text-[11px] font-semibold text-rose-600">Payout plus charge is higher than this account&apos;s available balance.</span>:null}
     </Field>
     <Field label="Paid to *" className="sm:col-span-2">
      <SearchableSelect className={control} value={destination} onChange={e=>{setDestination(e.target.value);setDestinationDetails("");setPayoutError("");}} disabled={!source} required searchPlaceholder="Search recipient or card…">
       <option value="">{source?"Choose recipient…":"Select Paid from first"}</option>
       {sourceIsCash?<option value="CASH">Cash handed to customer</option>:null}
       {!sourceIsCash?<optgroup label="Credit cards">
        {selected.customer.cards.map(card=><option key={card.id} value={"CARD:"+card.id}>{(card.id===selected.sourceTransaction.cardSwipe?.customerCard?.id?"Same swipe card · ":"Other saved card · ")+card.bankName+" ••••"+card.lastFourDigits+(card.nickname?" · "+card.nickname:"")}</option>)}
        <option value="OTHER_CARD">Another person's credit card</option>
       </optgroup>:null}
       {!sourceIsCash?<optgroup label="Bank / UPI / friends">
        {selected.customer.bankAccounts.map(a=><option key={a.id} value={"BANK:"+a.id}>{a.accountHolderName+" · "+a.bankName+" ••••"+a.accountReference.replace(/\D/g,"").slice(-4)}</option>)}
        {selected.customer.upiAccounts.map(a=><option key={a.id} value={"UPI:"+a.id}>{a.accountName+" · "+(a.upiId||a.mobileNumber||"UPI")}</option>)}
        {selected.customer.beneficiaries.flatMap(b=>b.accounts.map(a=><option key={a.id} value={"BENEFICIARY_ACCOUNT:"+a.id}>{"Friend · "+b.beneficiaryName+" · "+(a.bankName||a.upiId||"UPI")}</option>))}
        <option value="OTHER">Other bank / UPI recipient</option>
       </optgroup>:null}
      </SearchableSelect>
      {payoutDetailsRequired?<input aria-label={destinationType==="OTHER_CARD"?"Other card details":"Other recipient details"} className={control+" mt-2"} required value={destinationDetails} onChange={e=>{setDestinationDetails(e.target.value);setPayoutError("");}} maxLength={160} placeholder={destinationType==="OTHER_CARD"?"Cardholder, bank and last 4 digits only":"Recipient name and bank / UPI details"}/>:null}
     </Field>
     <Field label="Amount to pay"><input className={control} type="number" step="0.01" max={selected.remainingAmount} min="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setPayoutError("");}} required/></Field>
     {walletSource?<Field label="Wallet charge"><input className={control} type="number" step="0.01" min="0" value={charge} onChange={e=>setCharge(e.target.value)} placeholder="0.00"/></Field>:<div/>}
     <Field label="Reference / UTR"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder={destinationType==="CASH"?"Optional cash acknowledgement":"UTR / bank reference"}/></Field>
     <Field label="Notes (optional)" className="sm:col-span-2"><input name="cashledger_notes" autoComplete="on" className={control} value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)} placeholder="Notes"/></Field>
     {payoutError?<p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-800 sm:col-span-2">{payoutError}</p>:null}
    </form>
   </div>:null}
  </Modal>
  <Modal open={!!cancelTarget} title="Cancel payable?" description="Only unpaid payables can be cancelled. The source financial movement is reversed, not deleted." onClose={()=>setCancelTarget(null)}
   footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setCancelTarget(null)} className="app-secondary-button min-h-11 font-bold">Keep payable</button><button form="cancel-payable" disabled={busy} className="min-h-11 rounded-xl bg-rose-700 font-bold text-white disabled:opacity-50">{busy?"Cancelling…":"Confirm cancel"}</button></div>}>
   <form id="cancel-payable" onSubmit={cancelPayable}><Field label="Reason"><textarea name="cashledger_reason" autoComplete="on" className="min-h-28 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={cancelReason} onChange={e=>setCancelReason(e.target.value)} minLength={3} placeholder="Why is this payable being cancelled?" required/></Field></form>
  </Modal>
 </PageFrame></AppShell>;
}
