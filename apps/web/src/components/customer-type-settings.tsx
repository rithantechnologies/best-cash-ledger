"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type CustomerTypeChoice = {
 id:string;name:string;legacyType:"REGULAR"|"WALK_IN"|null;isActive:boolean;
};

const button="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-bold";
export function CustomerTypeSettings(){
 const [types,setTypes]=useState<CustomerTypeChoice[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [name,setName]=useState(""),[editing,setEditing]=useState<CustomerTypeChoice|null>(null),[editedName,setEditedName]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 async function load(){setTypes(await apiFetch<CustomerTypeChoice[]>("/settings/customer-types?includeInactive=true"));}
 useEffect(()=>{apiFetch<CustomerTypeChoice[]>("/settings/customer-types?includeInactive=true").then(setTypes).catch(()=>setError("Unable to load customer types.")).finally(()=>setLoading(false));},[]);
 async function apply(action:()=>Promise<unknown>,text:string){
  setBusy(true);setError("");setNotice("");
  try{await action();await load();setNotice(text);}
  catch(e){setError(e instanceof Error?e.message:"Unable to save customer type.");}
  finally{setBusy(false);}
 }
 async function add(e:FormEvent){
  e.preventDefault();const next=name.trim();if(!next)return;
  await apply(async()=>{await apiFetch("/settings/customer-types",{method:"POST",body:JSON.stringify({name:next})});setName("");},"Customer type added.");
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!editing||!editedName.trim())return;
  await apply(async()=>{await apiFetch("/settings/customer-types/"+editing.id,{method:"PATCH",body:JSON.stringify({name:editedName.trim()})});setEditing(null);},"Customer type renamed.");
 }
 return <section id="customer-types" className="app-surface overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
  <div className="space-y-3 border-b border-[var(--border)] p-4 sm:p-5">
   <div><p className="text-[10px] font-black uppercase tracking-wide text-[var(--accent)]">Customer management</p><h2 className="mt-1 text-lg font-black">Customer types</h2>
   <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Create the choices staff use when adding or editing customers. Retired types stay on existing profiles.</p></div>
   <form onSubmit={add} className="flex gap-2">
    <input name="cashledger_customer_type_name" autoComplete="on" className="app-control min-w-0 flex-1" value={name} maxLength={60} minLength={2} onChange={e=>setName(e.target.value)} placeholder="e.g. Business, VIP, Agent" required/>
    <button disabled={busy||name.trim().length<2} className="app-primary-button min-h-11 shrink-0 px-4 text-sm font-bold disabled:opacity-50">+ Add type</button>
   </form>
  </div>
  {error?<p role="alert" className="mx-4 mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>:null}
  {notice?<p role="status" className="mx-4 mt-3 text-xs font-semibold text-emerald-700">{notice}</p>:null}
  <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
   {loading?<p className="p-2 text-sm text-[var(--text-muted)]">Loading customer types…</p>:types.map(type=><div key={type.id} className={"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 "+(!type.isActive?"opacity-60":"")}>
    <div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{type.name}</strong><span className="shrink-0 text-[10px] font-bold text-[var(--text-muted)]">{type.isActive?"Active":"Retired"}</span></div>
    <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={()=>{setEditing(type);setEditedName(type.name);}} className={button}>Rename</button>
     <button type="button" disabled={busy} onClick={()=>void apply(()=>apiFetch("/settings/customer-types/"+type.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!type.isActive})}),type.isActive?"Customer type retired.":"Customer type activated.")} className={button}>{type.isActive?"Retire":"Activate"}</button></div>
   </div>)}
  </div>
  {editing?<div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-3">
    <button type="button" aria-label="Close edit type" className="absolute inset-0" onClick={()=>{if(!busy)setEditing(null);}}/>
    <form role="dialog" aria-modal="true" aria-label="Rename customer type" onSubmit={saveEdit} className="relative w-full max-w-sm space-y-3 rounded-2xl bg-[var(--surface)] p-5 shadow-xl">
     <h3 className="text-lg font-black">Rename customer type</h3>
     <input className="app-control" name="cashledger_edit_customer_type" value={editedName} onChange={e=>setEditedName(e.target.value)} minLength={2} maxLength={60} required autoFocus/>
     <p className="text-xs text-[var(--text-muted)]">Existing customer profiles will show the updated name.</p>
     <div className="flex gap-2"><button type="button" onClick={()=>setEditing(null)} className={button+" flex-1"}>Cancel</button><button disabled={busy} className="app-primary-button min-h-11 flex-1 text-sm font-bold disabled:opacity-50">Save</button></div>
    </form>
   </div>:null}
 </section>;
}
