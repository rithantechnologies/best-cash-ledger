"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;currentBalance:number};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function InternalTransferPage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [source,setSource]=useState("");
 const [destination,setDestination]=useState("");
 const [amount,setAmount]=useState("");
 const [charge,setCharge]=useState("0");
 const [reference,setReference]=useState("");
 const [notes,setNotes]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);

 useEffect(()=>{apiFetch<Account[]>("/dashboard/accounts").then(setAccounts).catch(()=>setError("Failed to load accounts"));},[]);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/internal-transfer",{method:"POST",body:JSON.stringify({
    sourceAccountId:source,destinationAccountId:destination,transferAmount:Number(amount),
    chargeAmount:Number(charge||0),referenceNumber:reference||undefined,notes:notes||undefined,
   })});
   router.push("/transactions");
  }catch(err){setError(err instanceof Error?err.message:"Transfer failed");}
  finally{setSaving(false);}
 }

 return <AppShell><div className="mx-auto max-w-3xl space-y-6">
  <div><h2 className="text-2xl font-bold">Internal Transfer</h2><p className="text-sm text-slate-500">Move funds between business accounts. The transfer itself is not income.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
   <label className="text-sm"><span className="mb-1 block font-medium">From</span><select className="w-full rounded-lg border px-3 py-2.5" value={source} onChange={e=>setSource(e.target.value)} required><option value="">Source account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} — {money(a.currentBalance)}</option>)}</select></label>
   <label className="text-sm"><span className="mb-1 block font-medium">To</span><select className="w-full rounded-lg border px-3 py-2.5" value={destination} onChange={e=>setDestination(e.target.value)} required><option value="">Destination account</option>{accounts.filter(a=>a.id!==source).map(a=><option key={a.id} value={a.id}>{a.accountName} — {money(a.currentBalance)}</option>)}</select></label>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0.01" placeholder="Transfer amount" value={amount} onChange={e=>setAmount(e.target.value)} required/>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0" placeholder="Transfer / bank charge" value={charge} onChange={e=>setCharge(e.target.value)}/>
   <input className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Reference / UTR" value={reference} onChange={e=>setReference(e.target.value)}/>
   <textarea className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)}/>
   <div className="md:col-span-2 flex justify-end"><button disabled={saving||source===destination} className="rounded-lg bg-slate-950 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save Transfer"}</button></div>
  </form>
 </div></AppShell>;
}
