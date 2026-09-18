"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string};

export default function AtmWithdrawalPage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [bankId,setBankId]=useState("");
 const [cashId,setCashId]=useState("");
 const [cash,setCash]=useState("");
 const [charge,setCharge]=useState("0");
 const [reference,setReference]=useState("");
 const [notes,setNotes]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 useEffect(()=>{apiFetch<Account[]>("/dashboard/accounts").then(setAccounts).catch(()=>setError("Failed to load accounts"));},[]);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/atm-withdrawal",{method:"POST",body:JSON.stringify({
    bankAccountId:bankId,cashAccountId:cashId,cashReceived:Number(cash),atmCharge:Number(charge||0),
    referenceNumber:reference||undefined,notes:notes||undefined,
   })});
   router.push("/transactions");
  }catch(err){setError(err instanceof Error?err.message:"ATM withdrawal failed");}
  finally{setSaving(false);}
 }
 return <AppShell><div className="mx-auto max-w-3xl space-y-6">
  <div><h2 className="text-2xl font-bold">ATM Withdrawal</h2><p className="text-sm text-slate-500">Move bank funds into physical cash and record ATM/bank charge separately.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
   <select className="rounded-lg border px-3 py-2.5" value={bankId} onChange={e=>setBankId(e.target.value)} required><option value="">Bank account</option>{accounts.filter(a=>a.accountType==="BANK").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>
   <select className="rounded-lg border px-3 py-2.5" value={cashId} onChange={e=>setCashId(e.target.value)} required><option value="">Cash account</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0.01" placeholder="Cash received" value={cash} onChange={e=>setCash(e.target.value)} required/>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0" placeholder="ATM charge" value={charge} onChange={e=>setCharge(e.target.value)}/>
   <input className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="ATM / bank reference" value={reference} onChange={e=>setReference(e.target.value)}/>
   <textarea className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)}/>
   <div className="md:col-span-2 flex justify-end"><button disabled={saving} className="rounded-lg bg-slate-950 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save ATM Withdrawal"}</button></div>
  </form>
 </div></AppShell>;
}
