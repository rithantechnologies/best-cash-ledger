"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;currentBalance:number;creditLimit:number|null};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function OwnerCcPaymentPage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [cardId,setCardId]=useState("");
 const [sourceId,setSourceId]=useState("");
 const [amount,setAmount]=useState("");
 const [reference,setReference]=useState("");
 const [notes,setNotes]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 useEffect(()=>{apiFetch<Account[]>("/dashboard/accounts").then(setAccounts).catch(()=>setError("Failed to load accounts"));},[]);
 const card=accounts.find(a=>a.id===cardId);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/owner-credit-card-payment",{method:"POST",body:JSON.stringify({
    creditCardAccountId:cardId,sourceAccountId:sourceId,paymentAmount:Number(amount),
    referenceNumber:reference||undefined,notes:notes||undefined,
   })});
   router.push("/transactions");
  }catch(err){setError(err instanceof Error?err.message:"Payment failed");}
  finally{setSaving(false);}
 }
 return <AppShell><div className="mx-auto max-w-3xl space-y-6">
  <div><h2 className="text-2xl font-bold">Owner Credit Card Payment</h2><p className="text-sm text-slate-500">Repay credit-card liability from bank/UPI/cash without double-counting the original expense.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
   <select className="rounded-lg border px-3 py-2.5" value={cardId} onChange={e=>setCardId(e.target.value)} required><option value="">Owner credit card</option>{accounts.filter(a=>a.accountType==="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName} — outstanding {money(a.currentBalance)}</option>)}</select>
   <select className="rounded-lg border px-3 py-2.5" value={sourceId} onChange={e=>setSourceId(e.target.value)} required><option value="">Paid from</option>{accounts.filter(a=>a.accountType!=="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0.01" max={card?.currentBalance||undefined} placeholder="Payment amount" value={amount} onChange={e=>setAmount(e.target.value)} required/>
   <input className="rounded-lg border px-3 py-2.5" placeholder="Reference" value={reference} onChange={e=>setReference(e.target.value)}/>
   <textarea className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)}/>
   {card?<div className="md:col-span-2 rounded-lg bg-slate-50 p-4 text-sm"><span className="text-slate-500">Current outstanding: </span><strong>{money(card.currentBalance)}</strong>{card.creditLimit!==null?<span className="ml-4 text-slate-500">Limit: {money(card.creditLimit)}</span>:null}</div>:null}
   <div className="md:col-span-2 flex justify-end"><button disabled={saving} className="rounded-lg bg-slate-950 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save Payment"}</button></div>
  </form>
 </div></AppShell>;
}
