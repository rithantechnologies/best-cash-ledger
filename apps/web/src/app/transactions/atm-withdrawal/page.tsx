"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function AtmWithdrawalPage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [bankId,setBankId]=useState(""),[cashId,setCashId]=useState(""),[cash,setCash]=useState(""),[charge,setCharge]=useState("0"),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{apiFetch<Account[]>("/dashboard/accounts").then(setAccounts).catch(()=>setError("Failed to load accounts")).finally(()=>setLoading(false));},[]);
 const cashValue=Number(cash||0),chargeValue=Number(charge||0);
 const bank=accounts.find(a=>a.id===bankId),cashAccount=accounts.find(a=>a.id===cashId);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{await apiFetch("/transactions/atm-withdrawal",{method:"POST",body:JSON.stringify({bankAccountId:bankId,cashAccountId:cashId,cashReceived:cashValue,atmCharge:chargeValue,referenceNumber:reference||undefined,notes:notes||undefined})});router.push("/transactions");}
  catch(err){setError(err instanceof Error?err.message:"ATM withdrawal failed");}finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Preparing ATM withdrawal…"/></AppShell>;
 const control="app-control";
 return <AppShell><form onSubmit={submit}><TransactionFrame eyebrow="Cash movement" title="ATM withdrawal" description="Move bank funds into physical cash while keeping the ATM or bank charge separate."
  summary={<><SummaryRow label="Cash received" value={money(cashValue)} tone="emerald"/><SummaryRow label="ATM charge" value={money(chargeValue)} tone="rose"/><SummaryRow label="Bank outflow" value={money(cashValue+chargeValue)} tone="amber"/>{bank?<SummaryRow label="From bank" value={bank.accountName}/>:null}{cashAccount?<SummaryRow label="To cash" value={cashAccount.accountName}/>:null}</>}
  footer={<button disabled={saving||cashValue<=0} className="app-primary-button min-h-12 w-full px-5 text-sm font-bold disabled:opacity-40">{saving?"Saving transaction…":"Save ATM withdrawal"}</button>}>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <FormSection step="1" title="Withdrawal details" description="Choose the bank and cash accounts, then enter what was physically received.">
   <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Bank account"><select className={control} value={bankId} onChange={e=>setBankId(e.target.value)} required><option value="">Select bank account</option>{accounts.filter(a=>a.accountType==="BANK").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
    <Field label="Cash account"><select className={control} value={cashId} onChange={e=>setCashId(e.target.value)} required><option value="">Select cash account</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
    <Field label="Cash received"><input className={control} type="number" step="0.01" min="0.01" placeholder="₹ 0.00" value={cash} onChange={e=>setCash(e.target.value)} required/></Field>
    <Field label="ATM / bank charge"><input className={control} type="number" step="0.01" min="0" placeholder="0.00" value={charge} onChange={e=>setCharge(e.target.value)}/></Field>
   </div>
  </FormSection>
  <FormSection step="2" title="Reference & notes" description="Optional details for reconciliation."><div className="grid gap-3 sm:grid-cols-2"><Field label="ATM / bank reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reference"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div></FormSection>
 </TransactionFrame></form></AppShell>;
}
