"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;currentBalance:number};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function InternalTransferPage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [source,setSource]=useState(""),[destination,setDestination]=useState(""),[amount,setAmount]=useState(""),[charge,setCharge]=useState("0"),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{apiFetch<Account[]>("/dashboard/accounts").then(setAccounts).catch(()=>setError("Failed to load accounts")).finally(()=>setLoading(false));},[]);

 const transfer=Number(amount||0),fee=Number(charge||0);
 const sourceAccount=accounts.find(a=>a.id===source),destinationAccount=accounts.find(a=>a.id===destination);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{await apiFetch("/transactions/internal-transfer",{method:"POST",body:JSON.stringify({sourceAccountId:source,destinationAccountId:destination,transferAmount:transfer,chargeAmount:fee,referenceNumber:reference||undefined,notes:notes||undefined})});router.push("/transactions");}
  catch(err){setError(err instanceof Error?err.message:"Transfer failed");}finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Preparing internal transfer…"/></AppShell>;
 const control="app-control";
 return <AppShell><form onSubmit={submit}><TransactionFrame eyebrow="Own accounts" title="Internal transfer" description="Move funds between accounts you control. The transfer itself is not treated as income."
  summary={<><SummaryRow label="Transfer amount" value={money(transfer)} tone="indigo"/><SummaryRow label="Transfer charge" value={money(fee)} tone="rose"/><SummaryRow label="Total source outflow" value={money(transfer+fee)} tone="amber"/>{sourceAccount?<SummaryRow label="From" value={sourceAccount.accountName}/>:null}{destinationAccount?<SummaryRow label="To" value={destinationAccount.accountName}/>:null}</>}
  footer={<button disabled={saving||source===destination||transfer<=0} className="app-primary-button min-h-12 w-full px-5 text-sm font-bold disabled:opacity-40">{saving?"Saving transaction…":"Save internal transfer"}</button>}>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <FormSection step="1" title="Move the funds" description="Choose the source, destination and amount.">
   <div className="grid gap-3 sm:grid-cols-2">
    <Field label="From account"><select className={control} value={source} onChange={e=>setSource(e.target.value)} required><option value="">Select source account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} — {money(a.currentBalance)}</option>)}</select></Field>
    <Field label="To account"><select className={control} value={destination} onChange={e=>setDestination(e.target.value)} required><option value="">Select destination account</option>{accounts.filter(a=>a.id!==source).map(a=><option key={a.id} value={a.id}>{a.accountName} — {money(a.currentBalance)}</option>)}</select></Field>
    <Field label="Transfer amount"><input className={control} type="number" step="0.01" min="0.01" placeholder="₹ 0.00" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
    <Field label="Bank / transfer charge"><input className={control} type="number" step="0.01" min="0" placeholder="0.00" value={charge} onChange={e=>setCharge(e.target.value)}/></Field>
   </div>
  </FormSection>
  <FormSection step="2" title="Reference & notes" description="Optional reconciliation details."><div className="grid gap-3 sm:grid-cols-2"><Field label="Reference / UTR"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reference"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div></FormSection>
 </TransactionFrame></form></AppShell>;
}
