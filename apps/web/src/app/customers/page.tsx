"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Customer = {
  id:string;customerCode:string;customerType:string;fullName:string;mobile:string|null;notes:string|null;isActive:boolean;
  cards:{id:string;bankName:string;lastFourDigits:string;isActive:boolean}[];
};
type Paged={items:Customer[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};

export default function CustomersPage(){
  const [items,setItems]=useState<Customer[]>([]);
  const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
  const [q,setQ]=useState("");
  const [sortBy,setSortBy]=useState("createdAt");
  const [sortDir,setSortDir]=useState<"asc"|"desc">("desc");
  const [role,setRole]=useState("");

  const [fullName,setFullName]=useState("");
  const [mobile,setMobile]=useState("");
  const [customerType,setCustomerType]=useState("REGULAR");
  const [cardCustomerId,setCardCustomerId]=useState("");
  const [cardBank,setCardBank]=useState("");
  const [cardType,setCardType]=useState("CREDIT");
  const [cardLast4,setCardLast4]=useState("");
  const [cardNickname,setCardNickname]=useState("");
  const [error,setError]=useState("");

  const admin=role==="OWNER"||role==="ADMIN";

  function load(page=pagination.page){
    const params=new URLSearchParams({
      page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir,
      includeInactive:admin?"true":"false",
    });
    if(q.trim())params.set("q",q.trim());
    return apiFetch<Paged>("/customers?"+params.toString()).then(r=>{setItems(r.items);setPagination(r.pagination);});
  }

  useEffect(()=>{
    try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}
  },[]);
  useEffect(()=>{
    if(!role)return;
    const timer=setTimeout(()=>load(1).catch(()=>setError("Failed to load customers")),200);
    return()=>clearTimeout(timer);
  },[role,q,sortBy,sortDir,pagination.pageSize]);

  async function submit(event:FormEvent){
    event.preventDefault();setError("");
    try{
      await apiFetch("/customers",{method:"POST",body:JSON.stringify({customerType,fullName,mobile:mobile||undefined})});
      setFullName("");setMobile("");await load(1);
    }catch(e){setError(e instanceof Error?e.message:"Failed to create customer");}
  }

  async function addCard(event:FormEvent){
    event.preventDefault();setError("");
    try{
      await apiFetch("/customers/"+cardCustomerId+"/cards",{method:"POST",body:JSON.stringify({
        bankName:cardBank,cardType,lastFourDigits:cardLast4,nickname:cardNickname||undefined,
      })});
      setCardBank("");setCardLast4("");setCardNickname("");await load();
    }catch(e){setError(e instanceof Error?e.message:"Failed to add card");}
  }

  async function editCustomer(c:Customer){
    const name=window.prompt("Customer name",c.fullName);if(name===null||!name.trim())return;
    const nextMobile=window.prompt("Mobile",c.mobile||"");if(nextMobile===null)return;
    const nextType=window.prompt("Type: REGULAR or WALK_IN",c.customerType);if(nextType===null)return;
    const notes=window.prompt("Notes",c.notes||"");if(notes===null)return;
    setError("");
    try{
      await apiFetch("/customers/"+c.id,{method:"PATCH",body:JSON.stringify({
        fullName:name.trim(),mobile:nextMobile.trim()||undefined,customerType:nextType.trim().toUpperCase(),notes:notes.trim()||undefined,
      })});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Failed to update customer");}
  }

  async function toggleCustomer(c:Customer){
    if(!window.confirm((c.isActive?"Retire ":"Reactivate ")+c.fullName+"? Historical transactions remain unchanged."))return;
    setError("");
    try{
      await apiFetch("/customers/"+c.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!c.isActive})});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Failed to change customer status");}
  }

  function sort(column:string){
    if(sortBy===column)setSortDir(d=>d==="asc"?"desc":"asc");
    else{setSortBy(column);setSortDir("asc");}
  }
  const sh=(label:string,col:string)=><button onClick={()=>sort(col)} className="font-semibold">{label}{sortBy===col?(sortDir==="asc"?" ↑":" ↓"):""}</button>;

  return <AppShell><div className="mx-auto max-w-7xl space-y-6">
    <div><h2 className="text-2xl font-bold">Customers</h2><p className="text-sm text-slate-500">Walk-in and repeat customers, saved payment details and beneficiaries.</p></div>

    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Customer name" value={fullName} onChange={e=>setFullName(e.target.value)} required/>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Mobile" value={mobile} onChange={e=>setMobile(e.target.value)}/>
      <select className="rounded-lg border border-slate-300 px-3 py-2" value={customerType} onChange={e=>setCustomerType(e.target.value)}><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option></select>
      <button className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white">Add Customer</button>
    </form>

    <form onSubmit={addCard} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-6">
      <select className="rounded-lg border border-slate-300 px-3 py-2" value={cardCustomerId} onChange={e=>setCardCustomerId(e.target.value)} required><option value="">Customer for card</option>{items.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Card bank" value={cardBank} onChange={e=>setCardBank(e.target.value)} required/>
      <select className="rounded-lg border border-slate-300 px-3 py-2" value={cardType} onChange={e=>setCardType(e.target.value)}><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option><option value="BUSINESS">Business</option><option value="OTHER">Other</option></select>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Last 4 digits" maxLength={4} value={cardLast4} onChange={e=>setCardLast4(e.target.value.replace(/\D/g,"").slice(0,4))} required/>
      <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Nickname (optional)" value={cardNickname} onChange={e=>setCardNickname(e.target.value)}/>
      <button className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">Add Card</button>
    </form>

    <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3">
      <input className="rounded-lg border px-3 py-2" placeholder="Search code, name or mobile..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select className="rounded-lg border px-3 py-2" value={sortBy} onChange={e=>setSortBy(e.target.value)}><option value="createdAt">Created date</option><option value="fullName">Name</option><option value="customerCode">Customer code</option><option value="customerType">Type</option><option value="mobile">Mobile</option></select>
      <select className="rounded-lg border px-3 py-2" value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>{[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}</select>
    </section>

    {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
          <th className="px-4 py-3">{sh("Code","customerCode")}</th><th className="px-4 py-3">{sh("Name","fullName")}</th><th className="px-4 py-3">{sh("Mobile","mobile")}</th><th className="px-4 py-3">{sh("Type","customerType")}</th><th className="px-4 py-3">Cards</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th>
        </tr></thead>
        <tbody>{items.map(c=><tr key={c.id} className={"border-t "+(!c.isActive?"opacity-60":"")}>
          <td className="px-4 py-3">{c.customerCode}</td>
          <td className="px-4 py-3 font-medium"><Link className="hover:underline" href={"/customers/"+c.id}>{c.fullName}</Link></td>
          <td className="px-4 py-3">{c.mobile??"—"}</td><td className="px-4 py-3">{c.customerType}</td><td className="px-4 py-3">{c.cards.filter(x=>x.isActive).length}</td><td className="px-4 py-3">{c.isActive?"Active":"Inactive"}</td>
          <td className="px-4 py-3">{admin?<div className="flex gap-2"><button onClick={()=>editCustomer(c)} className="rounded border px-2 py-1">Edit</button><button onClick={()=>toggleCustomer(c)} className="rounded border px-2 py-1">{c.isActive?"Retire":"Reactivate"}</button></div>:null}</td>
        </tr>)}
        {!items.length?<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No matching customers.</td></tr>:null}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{pagination.total} customer(s) · Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page<=1} onClick={()=>load(pagination.page-1).catch(()=>{})}>Previous</button><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page>=pagination.totalPages} onClick={()=>load(pagination.page+1).catch(()=>{})}>Next</button></div></div>
  </div></AppShell>;
}
