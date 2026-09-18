"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface, Toolbar } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Customer={id:string;fullName:string;customerCode:string};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean};
type Collection={id:string;collectionDate:string;amount:string;referenceNumber:string|null;destinationAccount:{accountName:string}};
type Receivable={
 id:string;reason:string;reasonCategory:string;description:string|null;originalAmount:string;receivedAmount:string;remainingAmount:string;
 dueAt:string|null;status:string;createdAt:string;customer:{id:string;fullName:string};sourceAccount:{accountName:string}|null;
 sourceTransaction:{referenceNumber:string|null};collections:Collection[];
};
type Page={items:Receivable[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
type Summary={customerReceivable:number;receivableBreakdown:{pendingAmount:number;pendingCount:number;partialAmount:number;partialCount:number;dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number}};
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const tone=(s:string)=>s==="RECEIVED"?"emerald":s==="OVERDUE"?"rose":s==="PARTIALLY_RECEIVED"?"indigo":s==="PENDING"?"amber":"slate";

export default function ReceivablesPage(){
 const [items,setItems]=useState<Receivable[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[summary,setSummary]=useState<Summary|null>(null);
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(1);
 const [q,setQ]=useState(""),[status,setStatus]=useState(""),[sortBy,setSortBy]=useState("dueAt"),[sortDir]=useState<"asc"|"desc">("asc");
 const [createOpen,setCreateOpen]=useState(false),[customerId,setCustomerId]=useState(""),[amount,setAmount]=useState(""),[sourceAccountId,setSourceAccountId]=useState("");
 const [reason,setReason]=useState(""),[reasonCategory,setReasonCategory]=useState("OTHER"),[description,setDescription]=useState(""),[dueAt,setDueAt]=useState(""),[reference,setReference]=useState("");
 const [selected,setSelected]=useState<Receivable|null>(null),[collectAmount,setCollectAmount]=useState(""),[destination,setDestination]=useState(""),[collectReference,setCollectReference]=useState(""),[collectNotes,setCollectNotes]=useState("");
 const [cancelTarget,setCancelTarget]=useState<Receivable|null>(null),[cancelReason,setCancelReason]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[role,setRole]=useState(""),[loading,setLoading]=useState(true);
 const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";

 async function load(targetPage=page){
  const params=new URLSearchParams({page:String(targetPage),pageSize:String(pageSize),sortBy,sortDir});
  if(q.trim())params.set("q",q.trim());if(status)params.set("status",status);
  setLoading(true);
  try{
   const data=await apiFetch<Page>("/receivables?"+params.toString());
   setItems(data.items);setPage(data.pagination.page);setTotal(data.pagination.total);setTotalPages(data.pagination.totalPages);setError("");
  }finally{setLoading(false);}
 }
 async function refreshAll(){const [s]=await Promise.all([apiFetch<Summary>("/dashboard/summary"),load()]);setSummary(s);}
 useEffect(()=>{
  try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}
  Promise.all([apiFetch<Customer[]>("/customers"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Summary>("/dashboard/summary")])
   .then(([c,a,s])=>{setCustomers(c);setAccounts(a);setSummary(s);return load(1);})
   .catch(e=>setError(e instanceof Error?e.message:"Failed to load receivables"));
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to filter receivables")),180);return()=>clearTimeout(timer);},[q,status,sortBy,sortDir,pageSize]);

 async function createReceivable(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");
  try{await apiFetch("/receivables",{method:"POST",body:JSON.stringify({customerId,amount:Number(amount),sourceAccountId:sourceAccountId||undefined,reason,reasonCategory,description:description||undefined,dueAt:dueAt?new Date(dueAt+"T23:59:59").toISOString():undefined,referenceNumber:reference||undefined})});setCreateOpen(false);setCustomerId("");setAmount("");setSourceAccountId("");setReason("");setDescription("");setDueAt("");setReference("");await refreshAll();}
  catch(e){setError(e instanceof Error?e.message:"Failed to create receivable");}finally{setBusy(false);}
 }
 async function collect(e:FormEvent){
  e.preventDefault();if(!selected)return;setBusy(true);setError("");
  try{await apiFetch("/receivables/"+selected.id+"/collections",{method:"POST",body:JSON.stringify({amount:Number(collectAmount),destinationAccountId:destination,referenceNumber:collectReference||undefined,notes:collectNotes||undefined})});setSelected(null);setCollectAmount("");setDestination("");setCollectReference("");setCollectNotes("");await refreshAll();}
  catch(e){setError(e instanceof Error?e.message:"Failed to record collection");}finally{setBusy(false);}
 }
 async function cancel(e:FormEvent){
  e.preventDefault();if(!cancelTarget||cancelReason.trim().length<3)return;setBusy(true);
  try{await apiFetch("/receivables/"+cancelTarget.id+"/cancel",{method:"POST",body:JSON.stringify({reason:cancelReason.trim()})});setCancelTarget(null);setCancelReason("");await refreshAll();}
  catch(e){setError(e instanceof Error?e.message:"Cancellation failed");}finally{setBusy(false);}
 }
 const liquidAccounts=useMemo(()=>accounts.filter(a=>a.isActive&&a.accountType!=="OWNER_CREDIT_CARD"),[accounts]);
 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Money to receive" title="Customer receivables" description="Track money coming back to the business and collect it into the right account."
   action={<button onClick={()=>setCreateOpen(true)} className="min-h-11 rounded-xl bg-[linear-gradient(135deg,#047857,#059669)] px-4 text-sm font-bold text-white shadow-sm">+ Add receivable</button>}/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  {summary?<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
   <DetailStat label="Pending" value={money(summary.receivableBreakdown.pendingAmount)} detail={summary.receivableBreakdown.pendingCount+" item(s)"} tone="amber"/>
   <DetailStat label="Partially received" value={money(summary.receivableBreakdown.partialAmount)} detail={summary.receivableBreakdown.partialCount+" item(s)"} tone="indigo"/>
   <DetailStat label="Due today" value={money(summary.receivableBreakdown.dueTodayAmount)} detail={summary.receivableBreakdown.dueTodayCount+" item(s)"} tone="cyan"/>
   <DetailStat label="Overdue" value={money(summary.receivableBreakdown.overdueAmount)} detail={summary.receivableBreakdown.overdueCount+" item(s)"} tone="rose"/>
  </div>:null}

  <Toolbar>
   <input className={control+" bg-slate-50 lg:col-span-1"} placeholder="Search customer, reason or reference…" value={q} onChange={e=>setQ(e.target.value)}/>
   <select className={control} value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","PARTIALLY_RECEIVED","RECEIVED","OVERDUE","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
   <select className={control} value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="dueAt">Due date</option><option value="createdAt">Created</option><option value="remainingAmount">Remaining</option><option value="originalAmount">Original</option><option value="receivedAmount">Received</option><option value="status">Status</option></select>
   <select className={control} value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
  </Toolbar>
  {loading?<PageLoader label="Loading receivables…"/>:<>
   <div className="space-y-2 md:hidden">{items.map(r=><Surface key={r.id} className="p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold">{r.customer.fullName}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{r.reasonCategory.replaceAll("_"," ")} · {r.reason}</p></div><StatusBadge tone={tone(r.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{r.status.replaceAll("_"," ")}</StatusBadge></div>
    <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
     {[["Original",r.originalAmount,""],["Received",r.receivedAmount,"text-emerald-700"],["Remaining",r.remainingAmount,"text-indigo-700"]].map(([l,v,c])=><div key={l} className="bg-slate-50 p-2.5 text-center"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className={"mt-1 text-sm font-bold "+c}>{money(v)}</p></div>)}
    </div>
    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400"><span className="truncate">{r.sourceAccount?.accountName??"Opening / adjustment"}</span><span className="shrink-0">{r.dueAt?"Due "+new Date(r.dueAt).toLocaleDateString("en-IN"):"No due date"}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2"><Link href={"/receivables/"+r.id} className="flex min-h-10 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold">View details</Link><button onClick={()=>{setSelected(r);setCollectAmount(r.remainingAmount);setDestination("");}} disabled={Number(r.remainingAmount)<=0||["RECEIVED","CANCELLED","REVERSED"].includes(r.status)} className="min-h-10 rounded-xl bg-emerald-700 text-xs font-bold text-white disabled:opacity-40">Collect</button></div>
    {(role==="OWNER"||role==="ADMIN")&&Number(r.receivedAmount)===0&&Number(r.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(r.status)?<button onClick={()=>{setCancelTarget(r);setCancelReason("");}} className="mt-2 min-h-9 w-full text-xs font-bold text-rose-600">Cancel receivable</button>:null}
   </Surface>)}{!items.length?<EmptyState title="No matching receivables" description="There is nothing to collect for the selected filters."/>:null}</div>
   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm">
    <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Customer / reason</th><th>Original</th><th>Received</th><th>Remaining</th><th>Source</th><th>Due</th><th>Status</th><th className="pr-5">Actions</th></tr></thead>
    <tbody>{items.map(r=><tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-3"><p className="font-semibold">{r.customer.fullName}</p><p className="text-[11px] text-slate-400">{r.reasonCategory.replaceAll("_"," ")} · {r.reason}</p></td><td>{money(r.originalAmount)}</td><td className="text-emerald-700">{money(r.receivedAmount)}</td><td className="font-bold text-indigo-700">{money(r.remainingAmount)}</td><td className="text-xs">{r.sourceAccount?.accountName??"Opening / adjustment"}</td><td>{r.dueAt?new Date(r.dueAt).toLocaleDateString("en-IN"):"—"}</td><td><StatusBadge tone={tone(r.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{r.status.replaceAll("_"," ")}</StatusBadge></td><td className="pr-5"><div className="flex gap-2"><Link href={"/receivables/"+r.id} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">View</Link><button onClick={()=>{setSelected(r);setCollectAmount(r.remainingAmount);setDestination("");}} disabled={Number(r.remainingAmount)<=0||["RECEIVED","CANCELLED","REVERSED"].includes(r.status)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Collect</button>{(role==="OWNER"||role==="ADMIN")&&Number(r.receivedAmount)===0&&Number(r.remainingAmount)>0&&!["CANCELLED","REVERSED"].includes(r.status)?<button onClick={()=>{setCancelTarget(r);setCancelReason("");}} className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-600">Cancel</button>:null}</div></td></tr>)}</tbody>
   </table></div></Surface>
   <Pager total={total} page={page} totalPages={totalPages} label="receivable" onPrevious={()=>load(page-1)} onNext={()=>load(page+1)}/>
  </>}
  <Modal open={createOpen} title="Add receivable" description="Record money the business expects to receive. Choose a source only when value leaves now." onClose={()=>setCreateOpen(false)}
   footer={<button form="create-receivable" disabled={busy} className="min-h-11 w-full rounded-xl bg-emerald-700 text-sm font-bold text-white disabled:opacity-50">{busy?"Saving…":"Create receivable"}</button>}>
   <form id="create-receivable" onSubmit={createReceivable} className="grid gap-3 sm:grid-cols-2">
    <Field label="Customer"><select className={control} value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName} · {c.customerCode}</option>)}</select></Field>
    <Field label="Amount"><input className={control} type="number" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="₹ 0.00" required/></Field>
    <Field label="Source account" hint="Leave blank for opening / legacy receivable."><select className={control} value={sourceAccountId} onChange={e=>setSourceAccountId(e.target.value)}><option value="">No source account</option>{liquidAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)}</option>)}</select></Field>
    <Field label="Due date"><input className={control} type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></Field>
    <Field label="Reason category"><select className={control} value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}>{["ADVANCE","SETTLEMENT_DUE","SHORTAGE_RECOVERY","LOAN","ADJUSTMENT","OTHER"].map(x=><option key={x}>{x}</option>)}</select></Field>
    <Field label="Reason"><input className={control} value={reason} onChange={e=>setReason(e.target.value)} required/></Field>
    <Field label="Reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Optional reference"/></Field>
    <Field label="Description"><input className={control} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional detail"/></Field>
   </form>
  </Modal>
  <Modal open={!!selected} title={selected?"Collect from "+selected.customer.fullName:"Record collection"} description={selected?"Remaining "+money(selected.remainingAmount):undefined} onClose={()=>setSelected(null)}
   footer={<button form="collect-receivable" disabled={busy} className="min-h-11 w-full rounded-xl bg-emerald-700 text-sm font-bold text-white disabled:opacity-50">{busy?"Recording…":"Record collection"}</button>}>
   <form id="collect-receivable" onSubmit={collect} className="grid gap-3 sm:grid-cols-2">
    <Field label="Amount received"><input className={control} type="number" step="0.01" min="0.01" max={selected?.remainingAmount} value={collectAmount} onChange={e=>setCollectAmount(e.target.value)} required/></Field>
    <Field label="Received into"><select className={control} value={destination} onChange={e=>setDestination(e.target.value)} required><option value="">Select account</option>{liquidAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
    <Field label="Reference / UTR"><input className={control} value={collectReference} onChange={e=>setCollectReference(e.target.value)} placeholder="Optional"/></Field>
    <Field label="Notes"><input className={control} value={collectNotes} onChange={e=>setCollectNotes(e.target.value)} placeholder="Optional"/></Field>
   </form>
  </Modal>

  <Modal open={!!cancelTarget} title="Cancel receivable?" description="Only uncollected receivables can be cancelled. Financial history is preserved." onClose={()=>setCancelTarget(null)}
   footer={<div className="grid grid-cols-2 gap-2"><button onClick={()=>setCancelTarget(null)} className="min-h-11 rounded-xl border border-slate-200 font-bold">Keep</button><button form="cancel-receivable" disabled={busy} className="min-h-11 rounded-xl bg-rose-700 font-bold text-white disabled:opacity-50">Confirm cancel</button></div>}>
   <form id="cancel-receivable" onSubmit={cancel}><Field label="Reason"><textarea className="min-h-28 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={cancelReason} onChange={e=>setCancelReason(e.target.value)} minLength={3} required/></Field></form>
  </Modal>
 </PageFrame></AppShell>;
}
