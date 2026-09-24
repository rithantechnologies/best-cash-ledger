"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;bankName?:string|null;accountReference?:string|null;lastFourDigits?:string|null;currentBalance?:string|number;isActive?:boolean};
type Category={id:string;name:string;isActive?:boolean;_count?:{expenses:number}};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function ExpensePage(){
 const router=useRouter();
 const [accounts,setAccounts]=useState<Account[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [categoryId,setCategoryId]=useState(""),[amount,setAmount]=useState(""),[accountId,setAccountId]=useState(""),[notes,setNotes]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);

 useEffect(()=>{Promise.all([apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Category[]>("/settings/expense-categories")])
  .then(([a,c])=>{setAccounts(a);setCategories(c);}).catch(()=>setError("Failed to load expense form")).finally(()=>setLoading(false));},[]);

 const popular=useMemo(()=>categories.slice().sort((a,b)=>Number(b._count?.expenses||0)-Number(a._count?.expenses||0)||a.name.localeCompare(b.name)),[categories]);
 const value=Number(amount||0),category=categories.find(c=>c.id===categoryId),account=accounts.find(a=>a.id===accountId);
 const eligibleAccounts=accounts.filter(a=>a.isActive!==false&&["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(a.accountType)); async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/expense",{method:"POST",body:JSON.stringify({
    expenseType:"BUSINESS",expenseCategoryId:categoryId,amount:value,
    paymentAccountId:accountId||undefined,description:category?.name||"Expense",notes:notes.trim()||undefined,
   })});
   router.push("/expenses");
  }catch(err){setError(err instanceof Error?err.message:"Expense failed");}finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Preparing expense entry…"/></AppShell>;
 const control="app-control";
 return <AppShell><form onSubmit={submit}><TransactionFrame eyebrow="Spending" title="Expense"
  description="Record an expense quickly. Category and amount are required; payment source can be added later."
  summary={<><SummaryRow label="Expense amount" value={money(value)} tone="rose"/>{category?<SummaryRow label="Category" value={category.name}/>:null}<SummaryRow label="Paid from" value={account?.accountName||"Complete later"}/></>}
  footer={<button disabled={saving||value<=0||!categoryId} className="app-primary-button min-h-12 w-full px-5 text-sm font-bold disabled:opacity-40">{saving?"Saving…":accountId?"Save expense":"Save now · choose source later"}</button>}>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <FormSection step="1" title="Expense details" description="Choose a category and enter the amount.">
   <div className="space-y-4">
    <Field label="Category">
     <div className="flex flex-wrap gap-2">
      {popular.slice(0,6).map(c=><button type="button" key={c.id} onClick={()=>setCategoryId(c.id)} className={"min-h-9 rounded-full border px-3 text-xs font-bold "+(categoryId===c.id?"border-[var(--accent)] bg-[var(--accent)] text-white":"border-[var(--border)] bg-[var(--surface)]")}>{c.name}</button>)}
     </div>
     <SearchableSelect mobileSheet className={control+" mt-2"} value={categoryId} onChange={e=>setCategoryId(e.target.value)} required>
      <option value="">Select category</option>{popular.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </SearchableSelect>
    </Field>
    <Field label="Amount"><input className={control} type="number" step="0.01" min="0.01" placeholder="₹ 0.00" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>    <Field label="Paid from (optional)">
     <SearchableSelect mobileSheet className={control} value={accountId} onChange={e=>setAccountId(e.target.value)}>
      <option value="">Not selected yet — complete later</option>
      {eligibleAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}
     </SearchableSelect>
    </Field>
    <Field label="Note (optional)"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add a note"/></Field>
   </div>
  </FormSection>
 </TransactionFrame></form></AppShell>;
}
