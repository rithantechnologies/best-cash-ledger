"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface, Toolbar } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { SearchSelect } from "@/components/search-select";

type Customer={
 id:string;customerCode:string;customerType:string;fullName:string;mobile:string|null;ebNumber:string|null;notes:string|null;isActive:boolean;customerTypeId:string|null;customerTypeConfig:{id:string;name:string;isActive:boolean}|null;
 cards:{id:string;bankName:string;lastFourDigits:string;isActive:boolean}[];
};
type CustomerTypeChoice={id:string;name:string;legacyType:"REGULAR"|"WALK_IN"|null;isActive:boolean};
type Paged={items:Customer[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
// Development-only UI validation. Encryption, authentication and access controls are server-side.
const isSafeDemoNumber=(value:string)=>/^\d{16}$/.test(value);


export default function CustomersPage(){
 const router=useRouter();
 const [items,setItems]=useState<Customer[]>([]),[pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[sortBy,setSortBy]=useState("createdAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("desc"),[role,setRole]=useState("");
 const [demoEnabled,setDemoEnabled]=useState(false),[newDemoNumber,setNewDemoNumber]=useState(""),[newDemoBank,setNewDemoBank]=useState("");
 const [creating,setCreating]=useState(false),[createError,setCreateError]=useState(""),[customerTypeId,setCustomerTypeId]=useState(""),[showMobileFilters,setShowMobileFilters]=useState(false);
 const [typeChoices,setTypeChoices]=useState<CustomerTypeChoice[]>([]),[typesError,setTypesError]=useState("");
 const [cardDemoNumber,setCardDemoNumber]=useState("");
 const [addingCard,setAddingCard]=useState(false),[cardCustomerId,setCardCustomerId]=useState(""),[cardBank,setCardBank]=useState(""),[cardLast4,setCardLast4]=useState(""),[cardNickname,setCardNickname]=useState("");
 const [editing,setEditing]=useState<Customer|null>(null),[editName,setEditName]=useState(""),[editMobile,setEditMobile]=useState(""),[editEbNumber,setEditEbNumber]=useState(""),[editTypeId,setEditTypeId]=useState(""),[editNotes,setEditNotes]=useState("");
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
 useEffect(()=>{apiFetch<{enabled:boolean}>("/customers/demo-card-availability").then(r=>setDemoEnabled(r.enabled)).catch(()=>setDemoEnabled(false));},[]);
 useEffect(()=>{if(!role)return;const timer=setTimeout(()=>load(1).catch(()=>setError("Failed to load customers")),180);return()=>clearTimeout(timer);},[role,q,sortBy,sortDir,pagination.pageSize]);
 useEffect(()=>{
  apiFetch<CustomerTypeChoice[]>("/settings/customer-types?includeInactive=true")
   .then(rows=>{setTypeChoices(rows);setTypesError("");})
   .catch(()=>setTypesError("Customer types unavailable. Refresh and try again."));
 },[]);
 const activeTypes=typeChoices.filter(t=>t.isActive);
 function defaultTypeId(){return (activeTypes.find(t=>t.legacyType==="REGULAR")??activeTypes[0])?.id??"";}
 function typeName(customer:Customer){return customer.customerTypeConfig?.name??customer.customerType.replaceAll("_"," ");}

 useEffect(()=>{
  if(!creating)return;
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setCreating(false);};
  document.addEventListener("keydown",onKeyDown);
  return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",onKeyDown);};
 },[creating,busy]);

 async function submit(e:FormEvent){
  e.preventDefault();
  const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
  const openDetails=submitter?.value!=="stay";
  // Read the actual input values; native browser autofill can populate fields without React change events.
  const formValues=new FormData(e.currentTarget as HTMLFormElement);
  const fullName=String(formValues.get("customer_name")||"").trim();
  const mobile=String(formValues.get("customer_mobile")||"").trim();
  const ebNumber=String(formValues.get("customer_eb_number")||"").trim();
  if(!fullName){setCreateError("Enter the customer's name.");return;}
  if(!customerTypeId){setCreateError("Select a customer type.");return;}
  if(demoEnabled&&newDemoNumber&&!isSafeDemoNumber(newDemoNumber)){setCreateError("Enter exactly 16 digits for the demo card.");return;}
  setBusy(true);setCreateError("");
  try{
   const customer=await apiFetch<{id:string}>("/customers",{method:"POST",body:JSON.stringify({customerTypeId,fullName,mobile:mobile||undefined,ebNumber:ebNumber||undefined,...(demoEnabled&&newDemoNumber?{demoCardNumber:newDemoNumber,demoCardBank:newDemoBank.trim()||"Card"}:{})})});
   setCreating(false);setNewDemoNumber("");setNewDemoBank("");
   if(openDetails){router.push("/customers/"+customer.id+"?setup=1");}
   else{setMessage("Customer created.");await load(1);}
  }
  catch(err){setCreateError(err instanceof Error?err.message:"Couldn't save customer. Try again.");}
  finally{setBusy(false);}
 }
 async function addCard(e:FormEvent){
  e.preventDefault();
  if(!cardCustomerId){setError("Select a customer first.");return;}
  if(!/^\d{4}$/.test(cardLast4)){setError("Enter the last four digits.");return;}
  if(demoEnabled&&cardDemoNumber&&!isSafeDemoNumber(cardDemoNumber)){setError("Enter exactly 16 digits for the demo card.");return;}
  setBusy(true);setError("");setMessage("");
  try{await apiFetch("/customers/"+cardCustomerId+"/cards",{method:"POST",body:JSON.stringify({bankName:cardBank.trim(),cardType:"CREDIT",lastFourDigits:cardLast4,nickname:cardNickname||undefined,...(demoEnabled&&cardDemoNumber?{demoCardNumber:cardDemoNumber}:{})})});setCardBank("");setCardLast4("");setCardDemoNumber("");setCardNickname("");setAddingCard(false);setMessage("Card added.");await load();}
  catch(e){setError(e instanceof Error?e.message:"Failed to add card");}finally{setBusy(false);}
 }
 function beginEdit(c:Customer){setEditing(c);setEditName(c.fullName);setEditMobile(c.mobile||"");setEditEbNumber(c.ebNumber||"");setEditTypeId(c.customerTypeId??typeChoices.find(t=>t.legacyType===c.customerType)?.id??"");setEditNotes(c.notes||"");setError("");}
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!editing)return;setBusy(true);setError("");
  try{await apiFetch("/customers/"+editing.id,{method:"PATCH",body:JSON.stringify({fullName:editName.trim(),mobile:editMobile.trim()||undefined,ebNumber:editEbNumber.trim()||null,customerTypeId:editTypeId||undefined,notes:editNotes.trim()||undefined})});setEditing(null);setMessage("Customer updated.");await load();}
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
   action={<div className="flex gap-2"><button onClick={()=>{setError("");setCardDemoNumber("");setAddingCard(true);}} className="app-secondary-button min-h-11 px-3 text-xs font-bold">+ Saved card</button>{admin?<button onClick={()=>{setCreateError("");setCustomerTypeId(defaultTypeId());setNewDemoNumber("");setNewDemoBank("");setCreating(true);}} className="app-primary-button min-h-11 px-4 text-sm font-bold">+ Customer</button>:null}</div>}/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}

  <p className="text-xs font-semibold text-[var(--text-muted)] sm:hidden">{pagination.total} customer{pagination.total===1?"":"s"}</p>
  <div className="hidden grid-cols-3 gap-2.5 sm:grid">
   <DetailStat label="Customers" value={pagination.total}/>
   <DetailStat label="Active on page" value={activeCount} tone="emerald"/>
   <DetailStat label="Saved cards on page" value={cardCount} tone="indigo"/>
  </div>

  <Toolbar>
   <input inputMode="search" className={control+" bg-slate-50 lg:col-span-2"} placeholder="Search name, bank/card last 4, UPI ID, recipient…" value={q} onChange={e=>setQ(e.target.value)}/>
   <button type="button" onClick={()=>setShowMobileFilters(v=>!v)} aria-expanded={showMobileFilters} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-bold text-[var(--text-muted)] sm:hidden">{showMobileFilters?"Hide options":"Sort & page size"}</button>
   <div className={(showMobileFilters?"grid":"hidden")+" grid-cols-2 gap-2 sm:contents"}>
    <SearchableSelect className={control} value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="createdAt">Created date</option><option value="fullName">Name</option><option value="customerCode">Customer code</option><option value="customerType">Type</option><option value="mobile">Mobile</option></SearchableSelect>
    <SearchableSelect className={control} value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</SearchableSelect>
   </div>
  </Toolbar>
  {loading?<PageLoader label="Loading customers…"/>:<>
   <div className="space-y-2 md:hidden">{items.map(c=><Surface key={c.id} className={!c.isActive?"p-3.5 opacity-60":"p-3.5"}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={"/customers/"+c.id} className="block truncate text-sm font-black">{c.fullName}</Link><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{c.mobile||"No mobile"} · {c.customerCode}</p></div><StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge></div>
    <p className="mt-2 text-[11px] font-semibold text-[var(--text-muted)]">{typeName(c)} · {c.cards.filter(x=>x.isActive).length} saved card(s)</p>
    <div className="mt-3 flex gap-2"><Link href={"/customers/"+c.id} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[var(--accent-soft)] px-3 text-xs font-black text-[var(--accent)]">Open details →</Link>{admin?<button type="button" onClick={()=>beginEdit(c)} className="min-h-11 rounded-xl border border-[var(--border)] px-4 text-xs font-bold">Edit</button>:null}</div>
    {admin?<details className="mt-2"><summary className="cursor-pointer py-1 text-right text-[11px] font-semibold text-[var(--text-muted)]">More actions</summary><button type="button" onClick={()=>setToggleTarget(c)} className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-muted)]">{c.isActive?"Retire customer":"Reactivate customer"}</button></details>:null}
   </Surface>)}{!items.length?<EmptyState title="No matching customers" description="Try a different search or create a customer."/>:null}</div>

   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
    <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">{sh("Code","customerCode")}</th><th>{sh("Name","fullName")}</th><th>{sh("Mobile","mobile")}</th><th>{sh("Type","customerType")}</th><th>Cards</th><th>Status</th><th className="pr-5">Actions</th></tr></thead>
    <tbody>{items.map(c=><tr key={c.id} className={"border-t border-slate-100 hover:bg-slate-50/60 "+(!c.isActive?"opacity-60":"")}><td className="px-5 py-3 text-xs text-slate-500">{c.customerCode}</td><td className="font-semibold"><Link href={"/customers/"+c.id} className="hover:text-indigo-700">{c.fullName}</Link></td><td>{c.mobile??"—"}</td><td>{typeName(c)}</td><td>{c.cards.filter(x=>x.isActive).length}</td><td><StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge></td><td className="pr-5">{admin?<div className="flex gap-2"><button onClick={()=>beginEdit(c)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">Edit</button><button onClick={()=>setToggleTarget(c)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500">{c.isActive?"Retire":"Reactivate"}</button></div>:null}</td></tr>)}</tbody>
   </table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="customer" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}
  {creating?createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/50 px-3 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-[3px] sm:px-5 sm:pb-5 sm:pt-6">
   <button type="button" className="absolute inset-0 cursor-default" aria-label="Close add customer" onClick={()=>{if(!busy)setCreating(false);}}/>
   <section role="dialog" aria-modal="true" aria-labelledby="create-customer-title" className="relative flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:max-w-md">
    <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--border)] sm:hidden"/>
    <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
     <div><h3 id="create-customer-title" className="text-xl font-black tracking-tight">New customer</h3><p className="mt-0.5 text-xs text-[var(--text-muted)]">Just the basics. Add other details after saving.</p></div>
     <button type="button" disabled={busy} aria-label="Close" onClick={()=>setCreating(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] text-xl text-[var(--text-muted)]">×</button>
    </div>
    <form id="create-customer" autoComplete="on" onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
     <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-3 sm:px-6">
      <Field label="Customer name *"><input className={control+" min-h-12 text-base"} type="text" name="customer_name" autoComplete="name" autoFocus maxLength={150} placeholder="Enter name" required onChange={()=>{if(createError)setCreateError("");}}/></Field>
      <Field label="Mobile (optional)"><input className={control+" min-h-12 text-base"} type="tel" inputMode="tel" name="customer_mobile" autoComplete="tel" maxLength={20} placeholder="Mobile number"/></Field>
      <Field label="EB number (optional)"><input className={control+" min-h-12 text-base"} type="text" name="customer_eb_number" autoComplete="off" maxLength={50} placeholder="Electricity consumer number"/></Field>
      {demoEnabled?<div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3"><p className="text-xs font-bold text-amber-800">Optional demo-only card</p><Field label="Card bank"><input className={control+" min-h-11"} value={newDemoBank} onChange={e=>setNewDemoBank(e.target.value)} maxLength={100} placeholder="Bank name (optional)" autoComplete="off"/></Field><Field label="16-digit card number (demo)"><input className={control+" min-h-11 font-mono"} type="text" name="new_demo_number" value={newDemoNumber} onChange={e=>setNewDemoNumber(e.target.value.replace(/\D/g,"").slice(0,16))} inputMode="numeric" maxLength={16} autoComplete="off" spellCheck={false} placeholder="16 digits"/></Field><p className="text-[11px] text-amber-700">Demo instance only. The last four digits are saved automatically.</p></div>:null}
      <Field label="Customer type"><SearchableSelect className={control+" min-h-11"} value={customerTypeId} onChange={e=>setCustomerTypeId(e.target.value)} required><option value="">Select type</option>{activeTypes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</SearchableSelect></Field>
      {typesError?<p role="alert" className="text-xs font-semibold text-rose-700">{typesError}</p>:null}
      {createError?<p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">{createError}</p>:null}
     </div>
     <div className="shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--surface)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
      <button type="submit" name="after_create" value="details" disabled={busy||!customerTypeId} className="app-primary-button min-h-12 w-full text-sm font-black disabled:opacity-50">{busy?"Saving…":"Save & add details →"}</button>
      <button type="submit" name="after_create" value="stay" disabled={busy} className="min-h-10 w-full rounded-xl text-xs font-bold text-[var(--text-muted)] disabled:opacity-50">Save only</button>
     </div>
    </form>
   </section>
  </div>,document.body):null}

  <Modal open={addingCard} title="Add saved card" description="Save only the non-sensitive card details used for identifying the card at the counter." onClose={()=>setAddingCard(false)}
   footer={<button form="add-card" disabled={busy} className="min-h-11 w-full rounded-xl bg-indigo-700 text-sm font-bold text-white disabled:opacity-50">{busy?"Saving…":"Save card"}</button>}>
   <form id="add-card" onSubmit={addCard} className="grid gap-3 sm:grid-cols-2">
    <Field label="Customer"><SearchSelect value={cardCustomerId} onChange={setCardCustomerId} options={items.filter(c=>c.isActive).map(c=>({value:c.id,label:c.fullName,searchText:c.fullName+" "+(c.mobile??"")}))} placeholder="Select customer" searchPlaceholder="Search customer…"/></Field>
    <Field label="Bank"><input name="cashledger_bank" autoComplete="on" className={control} value={cardBank} onChange={e=>setCardBank(e.target.value)} required/></Field>
    <Field label="Card type"><div className={control+" flex items-center bg-slate-50 font-bold"}>CREDIT</div></Field>
    <Field label="Last 4 digits"><input autoComplete="on" name="cashledger_card_last_four" className={control} inputMode="numeric" maxLength={4} value={cardLast4} onChange={e=>setCardLast4(e.target.value.replace(/\D/g,"").slice(0,4))} required/></Field>
    <Field label="Nickname" className="sm:col-span-2"><input name="cashledger_nickname" autoComplete="on" className={control} value={cardNickname} onChange={e=>setCardNickname(e.target.value)} placeholder="Optional"/></Field>
    {demoEnabled?<Field label="16-digit card number (optional)" className="sm:col-span-2"><input className={control} type="text" inputMode="numeric" maxLength={16} autoComplete="off" spellCheck={false} value={cardDemoNumber} onChange={e=>{const digits=e.target.value.replace(/\D/g,"").slice(0,16);setCardDemoNumber(digits);if(digits.length===16)setCardLast4(digits.slice(-4));}} placeholder="Enter 16 digits"/><p className="mt-1 text-[11px] text-amber-700">Available only while the demo feature is enabled.</p></Field>:null}
    {error?<p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700 sm:col-span-2">{error}</p>:null}
   </form>
  </Modal>
  <Modal open={!!editing} title="Edit customer" description={editing?.customerCode} onClose={()=>setEditing(null)}
   footer={<button form="edit-customer" disabled={busy} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Saving…":"Save changes"}</button>}>
   <form id="edit-customer" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input name="cashledger_name" autoComplete="on" className={control} value={editName} onChange={e=>setEditName(e.target.value)} required/></Field><Field label="Mobile"><input name="cashledger_mobile" autoComplete="on" className={control} value={editMobile} onChange={e=>setEditMobile(e.target.value)}/></Field><Field label="EB number"><input name="cashledger_eb_number" autoComplete="off" className={control} value={editEbNumber} maxLength={50} onChange={e=>setEditEbNumber(e.target.value)} placeholder="Optional"/></Field><Field label="Customer type"><SearchableSelect className={control} value={editTypeId} onChange={e=>setEditTypeId(e.target.value)} required><option value="">Choose type</option>{typeChoices.filter(t=>t.isActive||t.id===editTypeId).map(t=><option key={t.id} value={t.id}>{t.name}{t.isActive?"":" (Retired)"}</option>)}</SearchableSelect></Field><Field label="Notes"><input name="cashledger_notes" autoComplete="on" className={control} value={editNotes} onChange={e=>setEditNotes(e.target.value)}/></Field></form>
  </Modal>

  <Modal open={!!toggleTarget} title={toggleTarget?.isActive?"Retire customer?":"Reactivate customer?"} description="Historical transactions and ledgers are preserved." onClose={()=>setToggleTarget(null)}
   footer={<div className="grid grid-cols-2 gap-2"><button onClick={()=>setToggleTarget(null)} className="app-secondary-button min-h-11 font-bold">Cancel</button><button onClick={confirmToggle} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 font-bold text-white disabled:opacity-50">{toggleTarget?.isActive?"Retire":"Reactivate"}</button></div>}>
   <p className="text-sm leading-6 text-slate-600">{toggleTarget?.isActive?"Retire":"Reactivate"} <strong>{toggleTarget?.fullName}</strong>?</p>
  </Modal>
 </PageFrame></AppShell>;
}
