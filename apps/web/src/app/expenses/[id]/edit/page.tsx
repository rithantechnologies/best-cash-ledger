"use client";
import {FormEvent,useEffect,useState} from "react";
import Link from "next/link";
import {useParams,useRouter} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {SearchableSelect} from "@/components/searchable-select";
import {Field,FormSection,PageLoader,TransactionFrame,SummaryRow,Modal} from "@/components/ui";
import {apiFetch} from "@/lib/api";
type Expense={expenseCategoryId:string;expenseType:string;paymentAccountId:string|null;amount:string;description:string|null;payee:string|null};
type Tx={id:string;transactionNumber:string;transactionAt:string;createdAt:string;status:string;referenceNumber:string|null;notes:string|null;expense:Expense|null};
type Account={id:string;accountName:string;accountType:string;isActive?:boolean};
type Category={id:string;name:string;expenseUsage:string;isActive?:boolean};
type History={id:string;action:string;editorName:string;reason:string|null;createdAt:string;oldValues?:{amount?:number;categoryName?:string;expenseCategoryId?:string}|null;newValues?:{amount?:number;categoryName?:string;expenseCategoryId?:string}|null};
const ctl="app-control w-full";
const local=(iso:string)=>{const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);
export default function EditExpense(){
 const {id}=useParams<{id:string}>(),router=useRouter();
 const [tx,setTx]=useState<Tx|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[categories,setCategories]=useState<Category[]>([]),[history,setHistory]=useState<History[]>([]);
 const [categoryId,setCategoryId]=useState(""),[amount,setAmount]=useState(""),[accountId,setAccountId]=useState("");
 const [date,setDate]=useState(""),[description,setDescription]=useState(""),[payee,setPayee]=useState("");
 const [reference,setReference]=useState(""),[notes,setNotes]=useState(""),[reason,setReason]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [role,setRole]=useState(""),[deleteOpen,setDeleteOpen]=useState(false),[deleteReason,setDeleteReason]=useState("");
 useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"")}catch{}},[]);
 useEffect(()=>{let active=true;Promise.all([
  apiFetch<Tx>("/transactions/"+id),apiFetch<Account[]>("/dashboard/accounts"),
  apiFetch<Category[]>("/settings/expense-categories?includeInactive=true"),
  apiFetch<History[]>("/transactions/expense/"+id+"/history")
 ]).then(([t,a,c,h])=>{if(!active)return;if(!t.expense||!["PENDING","COMPLETED"].includes(t.status))throw new Error("Expense is not editable");
  setTx(t);setAccounts(a);setCategories(c);setHistory(h);setCategoryId(t.expense.expenseCategoryId);
  setAmount(String(t.expense.amount));setAccountId(t.expense.paymentAccountId||"");setDate(local(t.transactionAt));
  setDescription(t.expense.description||"");setPayee(t.expense.payee||"");setReference(t.referenceNumber||"");setNotes(t.notes||"");
 }).catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load expense")}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false}},[id]);
 const categoriesForExpense=categories.filter(c=>c.expenseUsage===tx?.expense?.expenseType);
 const accountsForExpense=accounts.filter(a=>(a.isActive!==false||a.id===accountId)&&["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(a.accountType));
 async function save(e:FormEvent){e.preventDefault();setSaving(true);setError("");
  try{await apiFetch("/transactions/expense/"+id,{method:"PATCH",body:JSON.stringify({
   expenseCategoryId:categoryId,amount:Number(amount),transactionAt:new Date(date).toISOString(),paymentAccountId:accountId||null,
   description:description.trim()||null,payee:payee.trim()||null,referenceNumber:reference.trim()||null,notes:notes.trim()||null,reason:reason.trim()
  })});router.push("/transactions/"+id);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Expense update failed")}finally{setSaving(false)}
 }
 async function deleteExpense(){setSaving(true);setError("");
  try{await apiFetch("/transactions/expense/"+id+"/delete",{method:"POST",body:JSON.stringify({reason:deleteReason.trim()})});router.replace("/expenses");router.refresh();}
  catch(e){setError(e instanceof Error?e.message:"Delete failed");setDeleteOpen(false)}finally{setSaving(false)}
 }
 if(loading)return <AppShell><PageLoader label="Loading expense…"/></AppShell>;
 if(!tx?.expense)return <AppShell><div className="mx-auto max-w-3xl p-6"><p className="text-sm text-rose-700">{error||"Expense not found"}</p><Link href="/expenses">Back to expenses</Link></div></AppShell>;
 return <AppShell><form onSubmit={save}><TransactionFrame eyebrow="Expense correction" title={"Edit "+tx.transactionNumber}
  description="Update this same expense. Its original business date stays unless you change it; edits appear in the audit history."
  summary={<><SummaryRow label="Amount" value={money(Number(amount)||0)} tone="rose"/><SummaryRow label="Paid from" value={accounts.find(a=>a.id===accountId)?.accountName||"Pending · choose later"}/><SummaryRow label="Originally entered" value={new Date(tx.createdAt).toLocaleString("en-IN")}/></>}
  footer={<div className="grid gap-2 sm:grid-cols-2"><Link href={"/transactions/"+id} className="flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] text-sm font-bold">Cancel</Link><button disabled={saving||!categoryId||Number(amount)<=0||reason.trim().length<3} className="app-primary-button min-h-12 px-4 text-sm font-bold disabled:opacity-40">{saving?"Saving…":"Save all changes"}</button></div>}>
  {error?<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>:null}
  <FormSection step="1" title="Expense fields" description="Amount, category, date, payment account and all other details can be corrected.">
   <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Category"><SearchableSelect mobileSheet className={ctl} required value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Choose category</option>{categoriesForExpense.map(c=><option key={c.id} value={c.id}>{c.name}{c.isActive===false?" (archived)":""}</option>)}</SearchableSelect></Field>
    <Field label="Amount"><input className={ctl} type="number" step="0.01" min="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></Field>
    <Field label="Expense date & time"><input className={ctl} type="datetime-local" required value={date} onChange={e=>setDate(e.target.value)}/></Field>
    <Field label="Bank / cash / wallet / payment method"><SearchableSelect mobileSheet className={ctl} value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Not selected · pending</option>{accountsForExpense.map(a=><option key={a.id} value={a.id}>{a.accountName} · {a.accountType.replaceAll("_"," ")}</option>)}</SearchableSelect></Field>
    <Field label="Description"><input className={ctl} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
    <Field label="Payee / paid to"><input className={ctl} value={payee} onChange={e=>setPayee(e.target.value)} placeholder="Vendor, person or company"/></Field>
    <Field label="Reference / UTR"><input className={ctl} value={reference} onChange={e=>setReference(e.target.value)}/></Field>
    <Field label="Notes"><textarea className={ctl+" min-h-20 py-3"} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
   </div>
  </FormSection>
  <FormSection step="2" title="Correction reason" description="Every change keeps the before/after values, editor and timestamp.">
   <Field label="Reason"><textarea className={ctl+" min-h-20 py-3"} required minLength={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Entered rough details; now correcting from the receipt."/></Field>
   <p className="text-xs leading-5 text-[var(--text-muted)]">The same expense and original posting are updated in place. Audit history records what changed and when. Financial edits affecting a closed cash drawer require reconciliation first.</p>
  </FormSection>
  {role==="OWNER"?<div className="flex justify-end"><button type="button" onClick={()=>{setDeleteReason("");setDeleteOpen(true)}} className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm font-bold text-rose-700">Delete this expense</button></div>:null}
  {history.length>0?<section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><h2 className="text-sm font-black">Edit history</h2><div className="mt-3 space-y-2">{history.slice(0,20).map(h=><div key={h.id} className="rounded-xl bg-[var(--surface-soft)] p-3 text-xs"><b>{h.action.replaceAll("_"," ")} · {h.editorName}</b><p className="mt-1 text-[var(--text-muted)]">{new Date(h.createdAt).toLocaleString("en-IN")}{h.reason?" · "+h.reason:""}</p>{h.action==="UPDATE_EXPENSE"&&h.oldValues?.amount!==h.newValues?.amount?<p className="mt-1">Amount: {money(Number(h.oldValues?.amount||0))} → {money(Number(h.newValues?.amount||0))}</p>:null}{h.action==="UPDATE_EXPENSE_CATEGORY"?<p className="mt-1">Category: {h.oldValues?.categoryName||"Previous"} → {h.newValues?.categoryName||"Updated"}</p>:null}</div>)}</div></section>:null}
 </TransactionFrame></form>
  <Modal open={deleteOpen} title="Delete this expense?" description="The expense stays in the audit trail but disappears from active expenses and totals." onClose={()=>!saving&&setDeleteOpen(false)}
   footer={<div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={()=>setDeleteOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] text-sm font-bold">Keep expense</button><button onClick={()=>void deleteExpense()} disabled={saving||deleteReason.trim().length<3} className="min-h-11 rounded-xl bg-rose-700 text-sm font-bold text-white disabled:opacity-50">{saving?"Deleting…":"Delete expense"}</button></div>}>
    <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">The original transaction ID and edit history remain. Closed cash sessions cannot be silently altered.</p>
    <label className="block text-sm font-bold">Reason<textarea className="app-control mt-1 min-h-20 w-full p-3" minLength={3} required value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} placeholder="Duplicate or incorrect expense"/></label>
  </Modal>
 </AppShell>;
}
