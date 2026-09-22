"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Payment={
 id:string;paymentDate:string;amount:string;referenceNumber:string|null;notes:string|null;status:string;
 sourceAccount:{accountName:string;accountType:string};transaction:{transactionNumber:string;status:string;charges:{amount:string}[]};
 createdBy:{id:string;fullName:string}|null;
};
type Payable={
 id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string;createdAt:string;
 customer:{id:string;fullName:string;customerCode:string};paymentTerm:{name:string}|null;
 sourceTransaction:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;referenceNumber:string|null;notes:string|null;status:string;cardSwipe:unknown;providerSettlementSource:{status?:string}|null;charges:{amount:string}[];commissions:{amount:string}[]};
 payments:Payment[];createdBy:{id:string;fullName:string}|null;
};
type Audit={id:string;action:string;reason:string|null;createdAt:string;oldValues:unknown;newValues:unknown;user:{fullName:string}|null};
type Account={id:string;accountName:string;accountType:string;currentBalance:number};
const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const statusTone=(s:string)=>s==="PAID"?"emerald":s==="OVERDUE"?"rose":s==="PARTIALLY_PAID"?"indigo":s==="PENDING"?"amber":"slate";
const serviceLabel=(v:string)=>({AEPS_WITHDRAWAL:"AEPS",CARD_SWIPE:"Card Swipe",MICRO_ATM:"Micro ATM",ATM_WITHDRAWAL:"ATM Withdrawal",CASH_TRANSFER:"Cash Transfer"} as Record<string,string>)[v]??v.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export default function PayableDetailPage(){
 const {id}=useParams<{id:string}>();
 const searchParams=useSearchParams();
 const backHref=searchParams.get("from")==="dues"?"/dues":"/payables";
 const backLabel=searchParams.get("from")==="dues"?"Dues":"Payables";
 const [item,setItem]=useState<Payable|null>(null),[audit,setAudit]=useState<Audit[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[error,setError]=useState("");
 const [payOpen,setPayOpen]=useState(false),[amount,setAmount]=useState(""),[charge,setCharge]=useState(""),[source,setSource]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState(""),[busy,setBusy]=useState(false);
 const control="app-control";
 function load(){return apiFetch<Payable>("/payables/"+id).then(x=>{setItem(x);return Promise.all([apiFetch<Audit[]>("/audit?entityType=CUSTOMER_PAYABLE&entityId="+id).then(setAudit).catch(()=>{}),apiFetch<Account[]>("/dashboard/accounts").then(setAccounts)]);});}
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Failed to load payable"));},[id]);
 if(!item)return <AppShell><PageLoader label="Loading payable…"/></AppShell>;

 const progress=Math.min(100,Math.max(0,Number(item.paidAmount)/Math.max(1,Number(item.originalAmount))*100));
 const providerCharge=item.sourceTransaction.charges.reduce((s,x)=>s+Number(x.amount),0);
 const commission=item.sourceTransaction.commissions.reduce((s,x)=>s+Number(x.amount),0);
 const payoutCharges=item.payments.filter(p=>p.status==="COMPLETED").reduce((sum,p)=>sum+p.transaction.charges.reduce((chargeSum,x)=>chargeSum+Number(x.amount),0),0);
 const profit=commission-providerCharge-payoutCharges;
 const sourceAccount=accounts.find(a=>a.id===source);
 const walletSource=sourceAccount?.accountType==="PROVIDER_WALLET";
 const payoutAmount=Number(amount||0);
 const payoutCharge=walletSource?Number(charge||0):0;
 const sourceShort=payoutAmount>0&&sourceAccount?payoutAmount+payoutCharge>sourceAccount.currentBalance+0.001:false;
 const canPay=Number(item.remainingAmount)>0&&!["PAID","CANCELLED","REVERSED"].includes(item.status);
 async function submitPayment(e:FormEvent){e.preventDefault();if(!item||!canPay||!source)return;setBusy(true);setError("");try{await apiFetch("/payables/"+item.id+"/payments",{method:"POST",body:JSON.stringify({amount:payoutAmount,chargeAmount:payoutCharge,sourceAccountId:source,referenceNumber:reference||undefined,notes:notes||undefined})});setPayOpen(false);setAmount("");setCharge("");setSource("");setReference("");setNotes("");await load();}catch(err){setError(err instanceof Error?err.message:"Payment failed");}finally{setBusy(false);}}
 function openPayment(){if(!item)return;setAmount(item.remainingAmount);setCharge("");setSource("");setReference("");setNotes("");setPayOpen(true);}

 return <AppShell><PageFrame width="max-w-6xl">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href={backHref} className="text-xs font-bold text-indigo-600">← {backLabel}</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{item.customer.customerCode}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{item.customer.fullName}</h2><p className="mt-1 text-sm text-slate-500">{serviceLabel(item.sourceTransaction.transactionType)} · {item.sourceTransaction.transactionNumber} · Due {new Date(item.dueAt).toLocaleString("en-IN")}</p></div>
   <div className="flex items-center gap-2">{canPay?<button type="button" onClick={openPayment} className="app-primary-button min-h-10 px-4 text-xs font-bold">Pay now</button>:null}<StatusBadge tone={statusTone(item.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{item.status.replaceAll("_"," ")}</StatusBadge></div>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
   <DetailStat label="Original" value={money(item.originalAmount)}/>
   <DetailStat label="Paid" value={money(item.paidAmount)} tone="emerald"/>
   <DetailStat label="Remaining" value={money(item.remainingAmount)} tone="amber"/>
  </div>

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
    <div className="mt-2 text-xs text-slate-500"><p>{p.sourceAccount.accountName} · {p.transaction.transactionNumber}</p><p className="mt-1">Charge {money(p.transaction.charges.reduce((sum,x)=>sum+Number(x.amount),0))} · {p.referenceNumber||"No reference"} · {p.createdBy?.fullName||"Unknown operator"}</p></div>
   </div>)}</div>
   <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Paid from</th><th>Amount</th><th>Charge</th><th>Reference</th><th>Operator</th><th>Status</th></tr></thead><tbody>{item.payments.map(p=><tr key={p.id} className="border-t border-slate-100"><td className="px-5 py-3 text-xs">{new Date(p.paymentDate).toLocaleString("en-IN")}</td><td>{p.transaction.transactionNumber}</td><td>{p.sourceAccount.accountName}</td><td className="font-bold">{money(p.amount)}</td><td className="text-rose-600">{money(p.transaction.charges.reduce((sum,x)=>sum+Number(x.amount),0))}</td><td>{p.referenceNumber||"—"}</td><td>{p.createdBy?.fullName||"Unknown"}</td><td>{p.status}</td></tr>)}</tbody></table></div></>:<div className="p-4"><EmptyState title="No payouts recorded yet"/></div>}
  </Surface>
  {audit.length?<Surface className="overflow-hidden"><PanelHeader title="Audit history" description="Recorded changes to this payable."/><div className="divide-y divide-slate-100">{audit.map(a=><div key={a.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
   <div><p className="text-sm font-bold">{a.action.replaceAll("_"," ")}</p><p className="mt-0.5 text-[11px] text-slate-400">{a.user?.fullName||"Unknown operator"} · {new Date(a.createdAt).toLocaleString("en-IN")}</p>{a.reason?<p className="mt-1 text-xs text-slate-600">{a.reason}</p>:null}</div>
   <details className="text-xs"><summary className="cursor-pointer font-bold text-indigo-600">View change</summary><pre className="mt-2 max-w-lg overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details>
  </div>)}</div></Surface>:null}

  <Modal open={payOpen} title={"Pay "+item.customer.fullName} description={serviceLabel(item.sourceTransaction.transactionType)+" · Remaining "+money(item.remainingAmount)} onClose={()=>setPayOpen(false)} footer={<button form="detail-pay-form" disabled={busy||sourceShort||payoutAmount<=0||!source} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Recording payout…":"Record payment"}</button>}>
   <form id="detail-pay-form" onSubmit={submitPayment} className="grid gap-3 sm:grid-cols-2">
    <Field label="Customer payout"><input className={control} type="number" step="0.01" max={item.remainingAmount} min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
    {walletSource?<Field label="Wallet payout charge" hint="Deducted from business profit"><input className={control} type="number" step="0.01" min="0" value={charge} onChange={e=>setCharge(e.target.value)} placeholder="0.00"/></Field>:<div/>}
    <Field label="Paid from" hint={sourceAccount?"Available "+money(sourceAccount.currentBalance)+" · Debit "+money(payoutAmount+payoutCharge):undefined}><select className={control} value={source} onChange={e=>{setSource(e.target.value);const a=accounts.find(x=>x.id===e.target.value);if(a?.accountType!=="PROVIDER_WALLET")setCharge("");}} required><option value="">Select account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)} available</option>)}</select>{sourceShort?<span className="mt-1.5 block text-[11px] font-semibold text-rose-600">Not enough available balance.</span>:null}</Field>
    <Field label="Reference / UTR"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Optional reference"/></Field>
    <Field label="Notes"><input className={control} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field>
   </form>
  </Modal>
 </PageFrame></AppShell>;
}
