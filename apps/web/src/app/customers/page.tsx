"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Customer={
  id:string;customerCode:string;customerType:string;fullName:string;mobile:string|null;notes:string|null;isActive:boolean;
  cards:{id:string;bankName:string;lastFourDigits:string;isActive:boolean}[];
};
type Paged={items:Customer[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};

export default function CustomersPage(){
  const [items,setItems]=useState<Customer[]>([]);
  const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
  const [q,setQ]=useState(""),[sortBy,setSortBy]=useState("createdAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("desc"),[role,setRole]=useState("");
  const [fullName,setFullName]=useState(""),[mobile,setMobile]=useState(""),[customerType,setCustomerType]=useState("REGULAR");
  const [cardCustomerId,setCardCustomerId]=useState(""),[cardBank,setCardBank]=useState(""),[cardType,setCardType]=useState("CREDIT"),[cardLast4,setCardLast4]=useState(""),[cardNickname,setCardNickname]=useState("");
  const [editing,setEditing]=useState<Customer|null>(null),[editName,setEditName]=useState(""),[editMobile,setEditMobile]=useState(""),[editType,setEditType]=useState("REGULAR"),[editNotes,setEditNotes]=useState("");
  const [error,setError]=useState(""),[message,setMessage]=useState("");

  const admin=role==="OWNER"||role==="ADMIN";
  function load(page=pagination.page){
    const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir,includeInactive:admin?"true":"false"});
    if(q.trim())params.set("q",q.trim());
    return apiFetch<Paged>("/customers?"+params.toString()).then(r=>{setItems(r.items);setPagination(r.pagination);});
  }

  useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);
  useEffect(()=>{if(!role)return;const timer=setTimeout(()=>load(1).catch(()=>setError("Failed to load customers")),200);return()=>clearTimeout(timer);},[role,q,sortBy,sortDir,pagination.pageSize]);

  async function submit(e:FormEvent){
    e.preventDefault();setError("");setMessage("");
    try{await apiFetch("/customers",{method:"POST",body:JSON.stringify({customerType,fullName,mobile:mobile||undefined})});setFullName("");setMobile("");setMessage("Customer created.");await load(1);}
    catch(e){setError(e instanceof Error?e.message:"Failed to create customer");}
  }
  async function addCard(e:FormEvent){
    e.preventDefault();setError("");setMessage("");
    try{await apiFetch("/customers/"+cardCustomerId+"/cards",{method:"POST",body:JSON.stringify({bankName:cardBank,cardType,lastFourDigits:cardLast4,nickname:cardNickname||undefined})});setCardBank("");setCardLast4("");setCardNickname("");setMessage("Card added.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Failed to add card");}
  }

  function beginEdit(c:Customer){
    setEditing(c);setEditName(c.fullName);setEditMobile(c.mobile||"");setEditType(c.customerType);setEditNotes(c.notes||"");setError("");setMessage("");
  }
  async function saveEdit(e:FormEvent){
    e.preventDefault();if(!editing)return;setError("");setMessage("");
    try{
      await apiFetch("/customers/"+editing.id,{method:"PATCH",body:JSON.stringify({fullName:editName.trim(),mobile:editMobile.trim()||undefined,customerType:editType,notes:editNotes.trim()||undefined})});
      setEditing(null);setMessage("Customer updated.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Failed to update customer");}
  }
  async function toggleCustomer(c:Customer){
    if(!window.confirm((c.isActive?"Retire ":"Reactivate ")+c.fullName+"? Historical transactions remain unchanged."))return;
    setError("");setMessage("");
    try{await apiFetch("/customers/"+c.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!c.isActive})});setMessage(c.isActive?"Customer retired.":"Customer reactivated.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Failed to change customer status");}
  }

  function sort(column:string){if(sortBy===column)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortBy(column);setSortDir("asc");}}
  const sh=(label:string,col:string)=><button onClick={()=>sort(col)} className="font-semibold">{label}{sortBy===col?(sortDir==="asc"?" ↑":" ↓"):""}</button>;

  return <AppShell><div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
    <div><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Customers</h2><p className="mt-1 text-sm text-slate-500">Customer profiles, saved payment details and beneficiaries.</p></div>

    {editing?<form onSubmit={saveEdit} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Edit customer</h3><p className="text-xs text-slate-500">{editing.customerCode}</p></div><button type="button" className="text-sm font-semibold" onClick={()=>setEditing(null)}>Close</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className="rounded-lg border bg-white px-3 py-2.5" value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Customer name" required/><input className="rounded-lg border bg-white px-3 py-2.5" value={editMobile} onChange={e=>setEditMobile(e.target.value)} placeholder="Mobile"/><select className="rounded-lg border bg-white px-3 py-2.5" value={editType} onChange={e=>setEditType(e.target.value)}><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option></select><input className="rounded-lg border bg-white px-3 py-2.5" value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="Notes"/></div>
      <div className="mt-4 flex justify-end"><button className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white">Save Changes</button></div>
    </form>:null}

    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Customer name" value={fullName} onChange={e=>setFullName(e.target.value)} required/>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Mobile" value={mobile} onChange={e=>setMobile(e.target.value)}/>
      <select className="rounded-lg border border-slate-300 px-3 py-2" value={customerType} onChange={e=>setCustomerType(e.target.value)}><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option></select>
      <button className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white">Add Customer</button>
    </form>

    <form onSubmit={addCard} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 xl:grid-cols-6">
      <select className="rounded-lg border border-slate-300 px-3 py-2" value={cardCustomerId} onChange={e=>setCardCustomerId(e.target.value)} required><option value="">Customer for card</option>{items.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Card bank" value={cardBank} onChange={e=>setCardBank(e.target.value)} required/>
      <select className="rounded-lg border border-slate-300 px-3 py-2" value={cardType} onChange={e=>setCardType(e.target.value)}><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option><option value="BUSINESS">Business</option><option value="OTHER">Other</option></select>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Last 4 digits" maxLength={4} value={cardLast4} onChange={e=>setCardLast4(e.target.value.replace(/\D/g,"").slice(0,4))} required/>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Nickname (optional)" value={cardNickname} onChange={e=>setCardNickname(e.target.value)}/>
      <button className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">Add Card</button>
    </form>

    <section className="grid gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 sm:p-4">
      <input className="rounded-lg border px-3 py-2" placeholder="Search code, name or mobile..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select className="rounded-lg border px-3 py-2" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="createdAt">Created date</option><option value="fullName">Name</option><option value="customerCode">Customer code</option><option value="customerType">Type</option><option value="mobile">Mobile</option></select>
      <select className="rounded-lg border px-3 py-2" value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
    </section>

    {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
    {message?<p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{message}</p>:null}
    <div className="space-y-2 md:hidden">
      {items.map(c=><div key={c.id} className={"rounded-2xl border border-slate-200 bg-white p-4 shadow-sm "+(!c.isActive?"opacity-60":"")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><Link href={"/customers/"+c.id} className="block truncate font-bold text-slate-950">{c.fullName}</Link><p className="mt-0.5 text-xs text-slate-500">{c.customerCode}{c.mobile?" · "+c.mobile:""}</p></div>
          <span className={"shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold "+(c.isActive?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>{c.isActive?"ACTIVE":"INACTIVE"}</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">{c.customerType.replaceAll("_"," ")}</span><span className="font-medium">{c.cards.filter(x=>x.isActive).length} saved card(s)</span>
        </div>
        {admin?<div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <button onClick={()=>beginEdit(c)} className="min-h-10 rounded-xl border border-slate-200 text-sm font-semibold">Edit</button>
          <button onClick={()=>toggleCustomer(c)} className="min-h-10 rounded-xl border border-slate-200 text-sm font-semibold">{c.isActive?"Retire":"Reactivate"}</button>
        </div>:null}
      </div>)}
      {!items.length?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No matching customers.</div>:null}
    </div>
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><table className="w-full min-w-[900px] text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{sh("Code","customerCode")}</th><th className="px-4 py-3">{sh("Name","fullName")}</th><th className="px-4 py-3">{sh("Mobile","mobile")}</th><th className="px-4 py-3">{sh("Type","customerType")}</th><th className="px-4 py-3">Cards</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
      <tbody>{items.map(c=><tr key={c.id} className={"border-t "+(!c.isActive?"opacity-60":"")}><td className="px-4 py-3">{c.customerCode}</td><td className="px-4 py-3 font-medium"><Link className="hover:underline" href={"/customers/"+c.id}>{c.fullName}</Link></td><td className="px-4 py-3">{c.mobile??"—"}</td><td className="px-4 py-3">{c.customerType}</td><td className="px-4 py-3">{c.cards.filter(x=>x.isActive).length}</td><td className="px-4 py-3">{c.isActive?"Active":"Inactive"}</td><td className="px-4 py-3">{admin?<div className="flex gap-2"><button onClick={()=>beginEdit(c)} className="rounded border px-2 py-1">Edit</button><button onClick={()=>toggleCustomer(c)} className="rounded border px-2 py-1">{c.isActive?"Retire":"Reactivate"}</button></div>:null}</td></tr>)}
      {!items.length?<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No matching customers.</td></tr>:null}</tbody>
    </table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-slate-500">{pagination.total} customer(s) · Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page<=1} onClick={()=>load(pagination.page-1).catch(()=>{})}>Previous</button><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page>=pagination.totalPages} onClick={()=>load(pagination.page+1).catch(()=>{})}>Next</button></div></div>
  </div></AppShell>;
}
