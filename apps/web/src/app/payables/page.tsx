"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Field, Modal, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface, Toolbar } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { SearchSelect } from "@/components/search-select";

type BankDestination={id:string;accountHolderName:string;bankName:string;accountReference:string;ifsc:string|null;isActive:boolean};
type UpiDestination={id:string;accountName:string;upiId:string|null;mobileNumber:string|null;providerName:string|null;isActive:boolean};
type Payable={id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string;customer:{id:string;fullName:string;customerCode:string;mobile:string|null;bankAccounts:BankDestination[];upiAccounts:UpiDestination[]};sourceTransaction:{transactionNumber:string;transactionType:string;cardSwipe:{customerCard:{bankName:string;lastFourDigits:string}|null}|null}};
type Account={id:string;accountName:string;accountType:string;currentBalance:number};
type Paged={items:Payable[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
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
 const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[status,setStatus]=useState(""),[transactionType,setTransactionType]=useState(""),[sortBy,setSortBy]=useState("dueAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("asc");
 const [selected,setSelected]=useState<Payable|null>(null),[amount,setAmount]=useState(""),[charge,setCharge]=useState(""),[source,setSource]=useState(""),[destination,setDestination]=useState(""),[reference,setReference]=useState(""),[paymentNotes,setPaymentNotes]=useState("");
 const [role,setRole]=useState(""),[cancelTarget,setCancelTarget]=useState<Payable|null>(null),[cancelReason,setCancelReason]=useState("");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const control="app-control";
 const sourceAccount=accounts.find(a=>a.id===source);
 const destinationType=destination==="CASH"?"CASH":destination.startsWith("BANK:")?"CUSTOMER_BANK":destination.startsWith("UPI:")?"CUSTOMER_UPI":"";
 const destinationId=destination.includes(":")?destination.split(":").slice(1).join(":"):undefined;
 const selectedBank=destinationType==="CUSTOMER_BANK"?selected?.customer.bankAccounts.find(a=>a.id===destinationId):undefined;
 const selectedUpi=destinationType==="CUSTOMER_UPI"?selected?.customer.upiAccounts.find(a=>a.id===destinationId):undefined;
 const payoutSourceAccounts=accounts.filter(a=>["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)).filter(a=>destinationType==="CASH"?a.accountType==="CASH":destinationType?a.accountType!=="CASH":true);
 const walletSource=sourceAccount?.accountType==="PROVIDER_WALLET";
 const payoutAmount=Number(amount||0);
 const payoutCharge=walletSource?Number(charge||0):0;
 const sourceShort=payoutAmount>0&&sourceAccount?payoutAmount+payoutCharge>sourceAccount.currentBalance+0.001:false;
 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir});
  if(q.trim())params.set("q",q.trim());if(status)params.set("status",status);if(transactionType)params.set("transactionType",transactionType);
  setLoading(true);
  return Promise.all([apiFetch<Paged>("/payables?"+params.toString()),apiFetch<Account[]>("/dashboard/accounts")])
   .then(([p,a])=>{setItems(p.items);setPagination(p.pagination);setAccounts(a);setError("");})
   .finally(()=>setLoading(false));
 }
 useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);
 useEffect(()=>{const timer=setTimeout(()=>load(1).catch(()=>setError("Failed to load payables")),180);return()=>clearTimeout(timer);},[q,status,transactionType,sortBy,sortDir,pagination.pageSize]);

 async function pay(e:FormEvent){
  e.preventDefault();if(!selected)return;setBusy(true);setError("");
  try{await apiFetch("/payables/"+selected.id+"/payments",{method:"POST",body:JSON.stringify({amount:Number(amount),chargeAmount:payoutCharge,sourceAccountId:source,destinationType,destinationId,referenceNumber:reference||undefined,notes:paymentNotes||undefined})});setSelected(null);setAmount("");setCharge("");setSource("");setDestination("");setReference("");setPaymentNotes("");await load();}
  catch(err){setError(err instanceof Error?err.message:"Payment failed");}finally{setBusy(false);}
 }
 async function cancelPayable(e:FormEvent){
  e.preventDefault();if(!cancelTarget||cancelReason.trim().length<3)return;setBusy(true);setError("");
  try{await apiFetch("/payables/"+cancelTarget.id+"/cancel",{method:"POST",body:JSON.stringify({reason:cancelReason.trim()})});setCancelTarget(null);setCancelReason("");await load();}
  catch(err){setError(err instanceof Error?err.message:"Cancellation failed");}finally{setBusy(false);}
 }
 function sort(column:string){if(sortBy===column)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortBy(column);setSortDir("asc");}}
 const sh=(label:string,col:string)=><button onClick={()=>sort(col)} className="font-bold">{label}{sortBy===col?(sortDir==="asc"?" ↑":" ↓"):""}</button>;
 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Money to pay" title="Customer payables" description="See what is due, pay customers quickly, and keep every payout traceable."/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <Toolbar>
   <input className={control+" bg-slate-50"} placeholder="Search customer…" value={q} onChange={e=>setQ(e.target.value)}/>
   <SearchableSelect className={control} value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</SearchableSelect>
   <SearchableSelect className={control} value={transactionType} onChange={e=>setTransactionType(e.target.value)}><option value="">All services</option>{["AEPS_WITHDRAWAL","CARD_SWIPE","MICRO_ATM","ATM_WITHDRAWAL","CASH_TRANSFER"].map(x=><option key={x} value={x}>{serviceLabel(x)}</option>)}</SearchableSelect>
   <SearchableSelect className={control} value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="dueAt">Due date</option><option value="createdAt">Created</option><option value="remainingAmount">Remaining</option><option value="originalAmount">Original</option><option value="paidAmount">Paid</option><option value="status">Status</option></SearchableSelect>
   <SearchableSelect className={control} value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</SearchableSelect>
  </Toolbar>

  {loading?<PageLoader label="Loading payables…"/>:<>
   <div className="space-y-2 md:hidden">{items.map(p=><Surface key={p.id} className="p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold">{p.customer.fullName}</p><p className="mt-0.5 text-[11px] text-slate-400">{serviceLabel(p.sourceTransaction.transactionType)} · {p.sourceTransaction.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">Due {new Date(p.dueAt).toLocaleDateString("en-IN")}</p></div><StatusBadge tone={payableDisplay(p).tone as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{payableDisplay(p).label}</StatusBadge></div>
    <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
     {[["Original",p.originalAmount,""],["Paid",p.paidAmount,"text-emerald-700"],["Remaining",p.remainingAmount,"text-amber-700"]].map(([l,v,c])=><div key={l} className="bg-slate-50 p-2.5 text-center"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className={"mt-1 text-sm font-bold "+c}>{money(v)}</p></div>)}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2"><Link href={"/payables/"+p.id} className="flex min-h-10 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold">View details</Link><button onClick={()=>{setSelected(p);setAmount(p.remainingAmount);setCharge("");setSource("");setDestination("");}} disabled={Number(p.remainingAmount)<=0||["CANCELLED","REVERSED","PAID"].includes(p.status)} className="app-primary-button min-h-10 text-xs font-bold disabled:opacity-40">Pay now</button></div>
    {(role==="OWNER"||role==="ADMIN")&&Number(p.paidAmount)===0&&Number(p.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(p.status)?<button onClick={()=>{setCancelTarget(p);setCancelReason("");}} className="mt-2 min-h-9 w-full rounded-xl text-xs font-bold text-rose-600">Cancel payable</button>:null}
   </Surface>)}{!items.length?<EmptyState title={q.trim()||status?"No matching payables":"Nothing to pay"} description={q.trim()||status?"Try another search or status.":"No outstanding customer payables."}/>:null}</div>

   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
    <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Customer</th><th>Service</th><th>{sh("Original","originalAmount")}</th><th>{sh("Paid","paidAmount")}</th><th>{sh("Remaining","remainingAmount")}</th><th>{sh("Due","dueAt")}</th><th>{sh("Status","status")}</th><th className="pr-5">Actions</th></tr></thead>
    <tbody>{items.map(p=><tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-3 font-semibold">{p.customer.fullName}</td><td><p className="font-semibold">{serviceLabel(p.sourceTransaction.transactionType)}</p><p className="mt-0.5 text-[10px] text-slate-400">{p.sourceTransaction.transactionNumber}</p></td><td>{money(p.originalAmount)}</td><td className="text-emerald-700">{money(p.paidAmount)}</td><td className="font-bold text-amber-700">{money(p.remainingAmount)}</td><td>{new Date(p.dueAt).toLocaleString("en-IN")}</td><td><StatusBadge tone={payableDisplay(p).tone as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{payableDisplay(p).label}</StatusBadge></td><td className="pr-5"><div className="flex gap-2"><Link href={"/payables/"+p.id} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">View</Link><button onClick={()=>{setSelected(p);setAmount(p.remainingAmount);setCharge("");setSource("");setDestination("");}} disabled={Number(p.remainingAmount)<=0||["CANCELLED","REVERSED","PAID"].includes(p.status)} className="app-primary-button px-3 py-1.5 text-xs font-bold disabled:opacity-40">Pay</button>{(role==="OWNER"||role==="ADMIN")&&Number(p.paidAmount)===0&&Number(p.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(p.status)?<button onClick={()=>{setCancelTarget(p);setCancelReason("");}} className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-600">Cancel</button>:null}</div></td></tr>)}</tbody>
   </table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="payable" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}

  <Modal open={!!selected} title={selected?"Pay "+selected.customer.fullName:"Record payout"} description={selected?"Remaining "+money(selected.remainingAmount):undefined} onClose={()=>setSelected(null)}
   footer={<button form="pay-form" disabled={busy||sourceShort||payoutAmount<=0||!source||!destinationType} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Recording payout…":"Record payment"}</button>}>
   {selected?<div className="space-y-3">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
     <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Payable for</p>
     <p className="mt-1 text-sm font-black">{selected.customer.fullName}</p>
     <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{serviceLabel(selected.sourceTransaction.transactionType)} · {selected.sourceTransaction.transactionNumber}{selected.sourceTransaction.cardSwipe?.customerCard?" · "+selected.sourceTransaction.cardSwipe.customerCard.bankName+" •••• "+selected.sourceTransaction.cardSwipe.customerCard.lastFourDigits:""}</p>
     <p className="text-xs text-[var(--text-muted)]">Due {new Date(selected.dueAt).toLocaleString("en-IN")} · Remaining {money(selected.remainingAmount)}</p>
    </div>
    <form id="pay-form" onSubmit={pay} className="grid gap-3 sm:grid-cols-2">
     <Field label="Pay to" className="sm:col-span-2">
      <SearchableSelect className={control} value={destination} onChange={e=>{setDestination(e.target.value);setSource("");setCharge("");}} required searchPlaceholder="Search customer bank or UPI…">
       <option value="">Select payout destination</option>
       <option value="CASH">Cash directly to {selected.customer.fullName}</option>
       <optgroup label="Customer bank accounts">{selected.customer.bankAccounts.map(a=><option key={a.id} value={"BANK:"+a.id}>{a.accountHolderName} · {a.bankName} · {a.accountReference}</option>)}</optgroup>
       <optgroup label="Customer UPI accounts">{selected.customer.upiAccounts.map(a=><option key={a.id} value={"UPI:"+a.id}>{a.accountName} · {a.upiId||a.mobileNumber||"UPI"}</option>)}</optgroup>
      </SearchableSelect>
      {destinationType==="CUSTOMER_BANK"&&selectedBank?<div className="mt-2 rounded-xl bg-[var(--surface-soft)] p-3 text-xs leading-5"><strong>{selectedBank.accountHolderName}</strong><br/>{selectedBank.bankName} · {selectedBank.accountReference}{selectedBank.ifsc?<><br/>IFSC {selectedBank.ifsc}</>:null}</div>:null}
      {destinationType==="CUSTOMER_UPI"&&selectedUpi?<div className="mt-2 rounded-xl bg-[var(--surface-soft)] p-3 text-xs leading-5"><strong>{selectedUpi.accountName}</strong>{selectedUpi.providerName?" · "+selectedUpi.providerName:""}<br/>{selectedUpi.upiId||selectedUpi.mobileNumber||"UPI account"}</div>:null}
      {!selected.customer.bankAccounts.length&&!selected.customer.upiAccounts.length?<Link href={"/customers/"+selected.customer.id} className="mt-2 inline-block text-xs font-bold text-[var(--accent)]">No saved bank/UPI · Add in customer profile →</Link>:null}
     </Field>
     <Field label="Customer payout"><input className={control} type="number" step="0.01" max={selected.remainingAmount} min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
     {walletSource?<Field label="Wallet payout charge" hint="Deducted from business profit"><input className={control} type="number" step="0.01" min="0" value={charge} onChange={e=>setCharge(e.target.value)} placeholder="0.00"/></Field>:<div/>}
     <Field label="Paid from" hint={sourceAccount?"Available "+money(sourceAccount.currentBalance)+" · Debit "+money(payoutAmount+payoutCharge):destinationType==="CASH"?"Choose the cash drawer handing over the cash":"Choose bank, UPI or wallet sending the payment"}>
      <SearchableSelect className={control} value={source} onChange={e=>{setSource(e.target.value);const a=accounts.find(x=>x.id===e.target.value);if(a?.accountType!=="PROVIDER_WALLET")setCharge("");}} disabled={!destinationType} required searchPlaceholder="Search source account…">
       <option value="">{destinationType?"Select source account":"Select Pay to first"}</option>
       {payoutSourceAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)} available</option>)}
      </SearchableSelect>
      {sourceShort?<span className="mt-1.5 block text-[11px] font-semibold text-rose-600">Payout plus charge is higher than this account&apos;s available balance.</span>:null}
     </Field>
     <Field label="Reference / UTR"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder={destinationType==="CASH"?"Optional cash acknowledgement":"UTR / bank reference"}/></Field>
     <Field label="Notes" className="sm:col-span-2"><input className={control} value={paymentNotes} onChange={e=>setPaymentNotes(e.target.value)} placeholder="Optional notes"/></Field>
    </form>
   </div>:null}
  </Modal>
  <Modal open={!!cancelTarget} title="Cancel payable?" description="Only unpaid payables can be cancelled. The source financial movement is reversed, not deleted." onClose={()=>setCancelTarget(null)}
   footer={<div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setCancelTarget(null)} className="app-secondary-button min-h-11 font-bold">Keep payable</button><button form="cancel-payable" disabled={busy} className="min-h-11 rounded-xl bg-rose-700 font-bold text-white disabled:opacity-50">{busy?"Cancelling…":"Confirm cancel"}</button></div>}>
   <form id="cancel-payable" onSubmit={cancelPayable}><Field label="Reason"><textarea className="min-h-28 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={cancelReason} onChange={e=>setCancelReason(e.target.value)} minLength={3} placeholder="Why is this payable being cancelled?" required/></Field></form>
  </Modal>
 </PageFrame></AppShell>;
}
