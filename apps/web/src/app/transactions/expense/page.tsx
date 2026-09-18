"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string};
type Category={id:string;name:string;expenseUsage:string};

export default function ExpensePage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [categories,setCategories]=useState<Category[]>([]);
 const [expenseType,setExpenseType]=useState("BUSINESS");
 const [categoryId,setCategoryId]=useState("");
 const [amount,setAmount]=useState("");
 const [accountId,setAccountId]=useState("");
 const [description,setDescription]=useState("");
 const [reference,setReference]=useState("");
 const [notes,setNotes]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);

 useEffect(()=>{Promise.all([
  apiFetch<Account[]>("/dashboard/accounts"),
  apiFetch<Category[]>("/settings/expense-categories"),
 ]).then(([a,c])=>{setAccounts(a);setCategories(c);}).catch(()=>setError("Failed to load form"));},[]);

 const visible=categories.filter(c=>c.expenseUsage==="MIXED"||c.expenseUsage===expenseType);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/expense",{method:"POST",body:JSON.stringify({
    expenseType,expenseCategoryId:categoryId,amount:Number(amount),paymentAccountId:accountId,
    description,referenceNumber:reference||undefined,notes:notes||undefined,
   })});
   router.push("/transactions");
  }catch(err){setError(err instanceof Error?err.message:"Expense failed");}
  finally{setSaving(false);}
 }

 return <AppShell><div className="mx-auto max-w-3xl space-y-6">
  <div><h2 className="text-2xl font-bold">Expense</h2><p className="text-sm text-slate-500">Record business and personal spending separately, even when using the same account.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
   <select className="rounded-lg border px-3 py-2.5" value={expenseType} onChange={e=>{setExpenseType(e.target.value);setCategoryId("");}} required><option value="BUSINESS">Business Expense</option><option value="PERSONAL">Personal Expense</option></select>
   <select className="rounded-lg border px-3 py-2.5" value={categoryId} onChange={e=>setCategoryId(e.target.value)} required><option value="">Category</option>{visible.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0.01" placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)} required/>
   <select className="rounded-lg border px-3 py-2.5" value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Paid from</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} — {a.accountType}</option>)}</select>
   <input className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)} required/>
   <input className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Reference (optional)" value={reference} onChange={e=>setReference(e.target.value)}/>
   <textarea className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)}/>
   <div className="md:col-span-2 flex justify-end"><button disabled={saving} className="rounded-lg bg-slate-950 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save Expense"}</button></div>
  </form>
 </div></AppShell>;
}
