"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string};
type Category={id:string;name:string;expenseUsage:string};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function ExpensePage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [expenseType,setExpenseType]=useState("BUSINESS"),[categoryId,setCategoryId]=useState(""),[amount,setAmount]=useState(""),[accountId,setAccountId]=useState(""),[description,setDescription]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);

 useEffect(()=>{Promise.all([apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Category[]>("/settings/expense-categories")]).then(([a,c])=>{setAccounts(a);setCategories(c);}).catch(()=>setError("Failed to load form")).finally(()=>setLoading(false));},[]);
 const visible=categories.filter(c=>c.expenseUsage==="MIXED"||c.expenseUsage===expenseType);
 const value=Number(amount||0),category=categories.find(c=>c.id===categoryId),account=accounts.find(a=>a.id===accountId);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{await apiFetch("/transactions/expense",{method:"POST",body:JSON.stringify({expenseType,expenseCategoryId:categoryId,amount:value,paymentAccountId:accountId,description,referenceNumber:reference||undefined,notes:notes||undefined})});router.push("/transactions");}
  catch(err){setError(err instanceof Error?err.message:"Expense failed");}finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Preparing expense entry…"/></AppShell>;
 const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
 return <AppShell><form onSubmit={submit}><TransactionFrame eyebrow="Spending" title="Expense" description="Record business and personal spending cleanly, even when the same account is used for both."
  summary={<><SummaryRow label="Expense amount" value={money(value)} tone="rose"/><SummaryRow label="Usage" value={expenseType==="BUSINESS"?"Business":"Personal"}/>{category?<SummaryRow label="Category" value={category.name}/>:null}{account?<SummaryRow label="Paid from" value={account.accountName}/>:null}</>}
  footer={<button disabled={saving||value<=0} className="min-h-12 w-full rounded-xl bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-40">{saving?"Saving transaction…":"Save expense"}</button>}>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <FormSection step="1" title="Expense details" description="Choose the usage, category and source account.">
   <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Expense type"><select className={control} value={expenseType} onChange={e=>{setExpenseType(e.target.value);setCategoryId("");}} required><option value="BUSINESS">Business expense</option><option value="PERSONAL">Personal expense</option></select></Field>
    <Field label="Category"><select className={control} value={categoryId} onChange={e=>setCategoryId(e.target.value)} required><option value="">Select category</option>{visible.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <Field label="Amount"><input className={control} type="number" step="0.01" min="0.01" placeholder="₹ 0.00" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
    <Field label="Paid from"><select className={control} value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Select account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} — {a.accountType.replaceAll("_"," ")}</option>)}</select></Field>
    <Field label="Description" className="sm:col-span-2"><input className={control} placeholder="What was this expense for?" value={description} onChange={e=>setDescription(e.target.value)} required/></Field>
   </div>
  </FormSection>
  <FormSection step="2" title="Reference & notes" description="Optional details that make later reconciliation easier."><div className="grid gap-3 sm:grid-cols-2"><Field label="Reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Receipt / invoice / reference"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div></FormSection>
 </TransactionFrame></form></AppShell>;
}
