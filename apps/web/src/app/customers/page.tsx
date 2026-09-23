"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface, Toolbar } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { SearchSelect } from "@/components/search-select";

type Customer={
 id:string;customerCode:string;customerType:string;fullName:string;mobile:string|null;notes:string|null;isActive:boolean;
 cards:{id:string;bankName:string;lastFourDigits:string;isActive:boolean}[];
};
type Paged={items:Customer[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};

export default function CustomersPage(){
 const [items,setItems]=useState<Customer[]>([]),[pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[sortBy,setSortBy]=useState("createdAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("desc"),[role,setRole]=useState("");
 const [creating,setCreating]=useState(false),[fullName,setFullName]=useState(""),[mobile,setMobile]=useState(""),[customerType,setCustomerType]=useState("REGULAR");
 const [addingCard,setAddingCard]=useState(false),[cardCustomerId,setCardCustomerId]=useState(""),[cardBank,setCardBank]=useState(""),[cardType,setCardType]=useState("CREDIT"),[cardLast4,setCardLast4]=useState(""),[cardNickname,setCardNickname]=useState("");
 const [editing,setEditing]=useState<Customer|null>(null),[editName,setEditName]=useState(""),[editMobile,setEditMobile]=useState(""),[editType,setEditType]=useState("REGULAR"),[editNotes,setEditNotes]=useState("");
 const [toggleTarget,setToggleTarget]=useState<Customer|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const control="app-control";
 const admin=role==="OWNER"||role==="ADMIN";
 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir,includeInactive:admin?"true":"false"});
  if(q.trim())params.set("q",q.trim());
  setLoading(true);
  return apiFetch<Paged>("/customers?"+params.toString()).then(r=>{setItems(r.items);setPagination(r.pagination);setError("");}).finally(()=>setLoading(false));
 }
 useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);
 useEffect(()=>{if(!role)return;const timer=setTimeout(()=>load(1).catch(()=>setError("Failed to load customers")),180);return()=>clearTimeout(timer);},[role,q,sortBy,sortDir,pagination.pageSize]);

 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{await apiFetch("/customers",{method:"POST",body:JSON.stringify({customerType,fullName,mobile:mobile||undefined})});setFullName("");setMobile("");setCreating(false);setMessage("Customer created.");await load(1);}
  catch(e){setError(e instanceof Error?e.message:"Failed to create customer");}finally{setBusy(false);}
 }
 async function addCard(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{await apiFetch("/customers/"+cardCustomerId+"/cards",{method:"POST",body:JSON.stringify({bankName:cardBank,cardType,lastFourDigits:cardLast4,nickname:cardNickname||undefined})});setCardBank("");setCardLast4("");setCardNickname("");setAddingCard(false);setMessage("Card added.");await load();}
  catch(e){setError(e instanceof Error?e.message:"Failed to add card");}finally{setBusy(false);}
 }
 function beginEdit(c:Customer){setEditing(c);setEditName(c.fullName);setEditMobile(c.mobile||"");setEditType(c.customerType);setEditNotes(c.notes||"");setError("");}
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!editing)return;setBusy(true);setError("");
  try{await apiFetch("/customers/"+editing.id,{method:"PATCH",body:JSON.stringify({fullName:editName.trim(),mobile:editMobile.trim()||undefined,customerType:editType,notes:editNotes.trim()||undefined})});setEditing(null);setMessage("Customer updated.");await load();}
  catch(e){setError(e instanceof Error?e.message:"Failed to update customer");}finally{setBusy(false);}
 }
 async function confirmToggle(){
  if(!toggleTarget)return;setBusy(true);setError("");
  try{await apiFetch("/customers/"+toggleTarget.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!toggleTarget.isActive})});setMessage(toggleTarget.isActive?"Customer retired.":"Customer reactivated.");setToggleTarget(null);await load();}
  catch(e){setError(e instanceof Error?e.message:"Failed to change customer status");}finally{setBusy(false);}
 }
 function sort(column:string){if(sortBy===column)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortBy(column);setSortDir("asc");}}
 const sh=(label:string,col:string)=><button onClick={()=>sort(col)} className="font-bold">{label}{sortBy===col?(sortDir==="asc"?" ↑":" ↓"):""}</button>;
 const activeCount=items.filter(x=>x.isActive).length;
 const cardCount=items.reduce((s,c)=>s+c.cards.filter(x=>x.isActive).length,0);

 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Customer directory" title="Customers" description="Profiles, saved cards and recipient details for repeat counter work."
   action={<div className="flex gap-2"><button onClick={()=>setAddingCard(true)} className="app-secondary-button min-h-11 px-3 text-xs font-bold">+ Saved card</button>{admin?<button onClick={()=>setCreating(true)} className="app-primary-button min-h-11 px-4 text-sm font-bold">+ Customer</button>:null}</div>}/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
   <DetailStat label="Customers" value={pagination.total}/>
   <DetailStat label="Active on page" value={activeCount} tone="emerald"/>
   <DetailStat label="Saved cards on page" value={cardCount} tone="indigo"/>
  </div>

  <Toolbar>
   <input inputMode="search" className={control+" bg-slate-50 lg:col-span-2"} placeholder="Search name, mobile or card last 4…" value={q} onChange={e=>setQ(e.target.value)}/>
   <SearchableSelect className={control} value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="createdAt">Created date</option><option value="fullName">Name</option><option value="customerCode">Customer code</option><option value="customerType">Type</option><option value="mobile">Mobile</option></SearchableSelect>
   <SearchableSelect className={control} value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</SearchableSelect>
  </Toolbar>
  {loading?<PageLoader label="Loading customers…"/>:<>
   <div className="space-y-2 md:hidden">{items.map(c=><Surface key={c.id} className={!c.isActive?"p-4 opacity-60":"p-4"}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={"/customers/"+c.id} className="block truncate font-bold">{c.fullName}</Link><p className="mt-0.5 text-[11px] text-slate-400">{c.customerCode}{c.mobile?" · "+c.mobile:""}</p></div><StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge></div>
    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-500">{c.customerType.replaceAll("_"," ")}</span><span className="font-bold">{c.cards.filter(x=>x.isActive).length} saved card(s)</span></div>{c.cards.some(x=>x.isActive)?<div className="mt-2 flex flex-wrap gap-1.5">{c.cards.filter(x=>x.isActive).slice(0,3).map(card=><span key={card.id} className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">••••{card.lastFourDigits}</span>)}</div>:null}</div>
    <div className="mt-3 grid grid-cols-2 gap-2"><Link href={"/customers/"+c.id} className="flex min-h-10 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold">Open profile</Link>{admin?<button onClick={()=>beginEdit(c)} className="min-h-10 rounded-xl border border-slate-200 text-xs font-bold">Edit</button>:null}</div>
    {admin?<button onClick={()=>setToggleTarget(c)} className="mt-2 min-h-9 w-full text-xs font-bold text-slate-500">{c.isActive?"Retire customer":"Reactivate customer"}</button>:null}
   </Surface>)}{!items.length?<EmptyState title="No matching customers" description="Try a different search or create a customer."/>:null}</div>

   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
    <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">{sh("Code","customerCode")}</th><th>{sh("Name","fullName")}</th><th>{sh("Mobile","mobile")}</th><th>{sh("Type","customerType")}</th><th>Cards</th><th>Status</th><th className="pr-5">Actions</th></tr></thead>
    <tbody>{items.map(c=><tr key={c.id} className={"border-t border-slate-100 hover:bg-slate-50/60 "+(!c.isActive?"opacity-60":"")}><td className="px-5 py-3 text-xs text-slate-500">{c.customerCode}</td><td className="font-semibold"><Link href={"/customers/"+c.id} className="hover:text-indigo-700">{c.fullName}</Link></td><td>{c.mobile??"—"}</td><td>{c.customerType.replaceAll("_"," ")}</td><td>{c.cards.filter(x=>x.isActive).length}</td><td><StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge></td><td className="pr-5">{admin?<div className="flex gap-2"><button onClick={()=>beginEdit(c)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">Edit</button><button onClick={()=>setToggleTarget(c)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500">{c.isActive?"Retire":"Reactivate"}</button></div>:null}</td></tr>)}</tbody>
   </table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="customer" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}
  <Modal open={creating} title="Add customer" description="Create a reusable customer profile for faster counter work." onClose={()=>setCreating(false)}
   footer={<button form="create-customer" disabled={busy} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Creating…":"Create customer"}</button>}>
   <form id="create-customer" onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><Field label="Customer name"><input className={control} value={fullName} onChange={e=>setFullName(e.target.value)} required/></Field><Field label="Mobile"><input className={control} inputMode="tel" value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="Optional"/></Field><Field label="Customer type" className="sm:col-span-2"><SearchableSelect className={control} value={customerType} onChange={e=>setCustomerType(e.target.value)}><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option></SearchableSelect></Field></form>
  </Modal>

  <Modal open={addingCard} title="Add saved card" description="Save only the non-sensitive card details used for identifying the card at the counter." onClose={()=>setAddingCard(false)}
   footer={<button form="add-card" disabled={busy} className="min-h-11 w-full rounded-xl bg-indigo-700 text-sm font-bold text-white disabled:opacity-50">{busy?"Saving…":"Save card"}</button>}>
   <form id="add-card" onSubmit={addCard} className="grid gap-3 sm:grid-cols-2">
    <Field label="Customer"><SearchSelect value={cardCustomerId} onChange={setCardCustomerId} options={items.filter(c=>c.isActive).map(c=>({value:c.id,label:c.fullName,searchText:c.fullName+" "+(c.mobile??"")}))} placeholder="Select customer" searchPlaceholder="Search customer…"/></Field>
    <Field label="Bank"><input className={control} value={cardBank} onChange={e=>setCardBank(e.target.value)} required/></Field>
    <Field label="Card type"><SearchableSelect className={control} value={cardType} onChange={e=>setCardType(e.target.value)}>{["CREDIT","DEBIT","BUSINESS","OTHER"].map(x=><option key={x}>{x}</option>)}</SearchableSelect></Field>
    <Field label="Last 4 digits"><input className={control} inputMode="numeric" maxLength={4} value={cardLast4} onChange={e=>setCardLast4(e.target.value.replace(/\D/g,"").slice(0,4))} required/></Field>
    <Field label="Nickname" className="sm:col-span-2"><input className={control} value={cardNickname} onChange={e=>setCardNickname(e.target.value)} placeholder="Optional"/></Field>
   </form>
  </Modal>
  <Modal open={!!editing} title="Edit customer" description={editing?.customerCode} onClose={()=>setEditing(null)}
   footer={<button form="edit-customer" disabled={busy} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Saving…":"Save changes"}</button>}>
   <form id="edit-customer" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className={control} value={editName} onChange={e=>setEditName(e.target.value)} required/></Field><Field label="Mobile"><input className={control} value={editMobile} onChange={e=>setEditMobile(e.target.value)}/></Field><Field label="Type"><SearchableSelect className={control} value={editType} onChange={e=>setEditType(e.target.value)}><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option></SearchableSelect></Field><Field label="Notes"><input className={control} value={editNotes} onChange={e=>setEditNotes(e.target.value)}/></Field></form>
  </Modal>

  <Modal open={!!toggleTarget} title={toggleTarget?.isActive?"Retire customer?":"Reactivate customer?"} description="Historical transactions and ledgers are preserved." onClose={()=>setToggleTarget(null)}
   footer={<div className="grid grid-cols-2 gap-2"><button onClick={()=>setToggleTarget(null)} className="app-secondary-button min-h-11 font-bold">Cancel</button><button onClick={confirmToggle} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 font-bold text-white disabled:opacity-50">{toggleTarget?.isActive?"Retire":"Reactivate"}</button></div>}>
   <p className="text-sm leading-6 text-slate-600">{toggleTarget?.isActive?"Retire":"Reactivate"} <strong>{toggleTarget?.fullName}</strong>?</p>
  </Modal>
 </PageFrame></AppShell>;
}
