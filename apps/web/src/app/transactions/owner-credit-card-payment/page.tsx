"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;currentBalance:number;creditLimit:number|null};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function OwnerCcPaymentPage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [cardId,setCardId]=useState(""),[sourceId,setSourceId]=useState(""),[amount,setAmount]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{apiFetch<Account[]>("/dashboard/accounts").then(setAccounts).catch(()=>setError("Failed to load accounts")).finally(()=>setLoading(false));},[]);
 const card=accounts.find(a=>a.id===cardId),source=accounts.find(a=>a.id===sourceId),payment=Number(amount||0);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{await apiFetch("/transactions/owner-credit-card-payment",{method:"POST",body:JSON.stringify({creditCardAccountId:cardId,sourceAccountId:sourceId,paymentAmount:payment,referenceNumber:reference||undefined,notes:notes||undefined})});router.push("/transactions");}
  catch(err){setError(err instanceof Error?err.message:"Payment failed");}finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Preparing card payment…"/></AppShell>;
 const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
 return <AppShell><form onSubmit={submit}><TransactionFrame eyebrow="Liability payment" title="Owner credit-card payment" description="Repay card liability from cash, bank or UPI without counting the original expense a second time."
  summary={<><SummaryRow label="Payment amount" value={money(payment)} tone="indigo"/>{card?<><SummaryRow label="Current outstanding" value={money(card.currentBalance)} tone="rose"/><SummaryRow label="After payment" value={money(Math.max(0,card.currentBalance-payment))} tone="emerald"/></>:null}{source?<SummaryRow label="Paid from" value={source.accountName}/>:null}</>}
  footer={<button disabled={saving||payment<=0} className="min-h-12 w-full rounded-xl bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-40">{saving?"Saving payment…":"Save card payment"}</button>}>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <FormSection step="1" title="Payment details" description="Select the card liability, the source account and the amount being paid.">
   <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Owner credit card"><select className={control} value={cardId} onChange={e=>setCardId(e.target.value)} required><option value="">Select card account</option>{accounts.filter(a=>a.accountType==="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName} — outstanding {money(a.currentBalance)}</option>)}</select></Field>
    <Field label="Paid from"><select className={control} value={sourceId} onChange={e=>setSourceId(e.target.value)} required><option value="">Select source account</option>{accounts.filter(a=>a.accountType!=="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
    <Field label="Payment amount"><input className={control} type="number" step="0.01" min="0.01" max={card?.currentBalance||undefined} placeholder="₹ 0.00" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
    {card?<div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs"><p className="text-slate-400">Credit limit</p><p className="mt-1 font-bold">{card.creditLimit!==null?money(card.creditLimit):"Not configured"}</p></div>:null}
   </div>
  </FormSection>
  <FormSection step="2" title="Reference & notes" description="Optional payment reference for reconciliation."><div className="grid gap-3 sm:grid-cols-2"><Field label="Reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Payment reference"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div></FormSection>
 </TransactionFrame></form></AppShell>;
}
