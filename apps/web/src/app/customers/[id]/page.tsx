"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Card={id:string;bankName:string;cardType:string|null;lastFourDigits:string;nickname:string|null;isActive:boolean};
type Bank={id:string;accountHolderName:string;bankName:string;accountReference:string;ifsc:string|null;isActive:boolean};
type Upi={id:string;accountName:string;upiId:string|null;mobileNumber:string|null;providerName:string|null;isActive:boolean};
type BAccount={id:string;accountType:string;bankName:string|null;accountReference:string|null;ifsc:string|null;upiId:string|null;mobileNumber:string|null;isActive:boolean};
type Beneficiary={id:string;beneficiaryName:string;relationshipNote:string|null;notes:string|null;isActive:boolean;accounts:BAccount[]};
type Customer={
 id:string;customerCode:string;customerType:string;fullName:string;mobile:string|null;notes:string|null;isActive:boolean;
 cards:Card[];bankAccounts:Bank[];upiAccounts:Upi[];beneficiaries:Beneficiary[];
 payables:{id:string;remainingAmount:string;dueAt:string;status:string}[];
 receivables:{id:string;reason:string;remainingAmount:string;receivedAmount:string;originalAmount:string;dueAt:string|null;status:string}[];
};
type EditState =
 | {kind:"card";item:Card}
 | {kind:"bank";item:Bank}
 | {kind:"upi";item:Upi}
 | {kind:"beneficiary";item:Beneficiary}
 | {kind:"beneficiaryAccount";item:BAccount}
 | null;

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));

export default function CustomerDetailPage(){
 const {id}=useParams<{id:string}>();
 const [c,setC]=useState<Customer|null>(null),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [bankName,setBankName]=useState(""),[holder,setHolder]=useState(""),[accountRef,setAccountRef]=useState(""),[ifsc,setIfsc]=useState("");
 const [upiName,setUpiName]=useState(""),[upiId,setUpiId]=useState(""),[upiMobile,setUpiMobile]=useState(""),[upiProvider,setUpiProvider]=useState("");
 const [beneficiaryName,setBeneficiaryName]=useState(""),[relationship,setRelationship]=useState("");
 const [beneficiaryId,setBeneficiaryId]=useState(""),[bType,setBType]=useState("BANK"),[bBank,setBBank]=useState(""),[bRef,setBRef]=useState(""),[bIfsc,setBIfsc]=useState(""),[bUpi,setBUpi]=useState(""),[bMobile,setBMobile]=useState("");
 const [edit,setEdit]=useState<EditState>(null);
 const [e1,setE1]=useState(""),[e2,setE2]=useState(""),[e3,setE3]=useState(""),[e4,setE4]=useState(""),[e5,setE5]=useState("");

 const load=()=>apiFetch<Customer>("/customers/"+id).then(setC);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Failed to load customer"));},[id]);

 async function run(action:()=>Promise<unknown>, success?:string){
  setError("");setMessage("");
  try{await action();await load();if(success)setMessage(success);}
  catch(err){setError(err instanceof Error?err.message:"Update failed");throw err;}
 }
 async function addBank(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/"+id+"/banks",{method:"POST",body:JSON.stringify({accountHolderName:holder,bankName,accountReference:accountRef,ifsc:ifsc||undefined})}),"Bank account added.");setHolder("");setBankName("");setAccountRef("");setIfsc("");}catch{}}
 async function addUpi(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/"+id+"/upi",{method:"POST",body:JSON.stringify({accountName:upiName,upiId:upiId||undefined,mobileNumber:upiMobile||undefined,providerName:upiProvider||undefined})}),"UPI account added.");setUpiName("");setUpiId("");setUpiMobile("");setUpiProvider("");}catch{}}
 async function addBeneficiary(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/"+id+"/beneficiaries",{method:"POST",body:JSON.stringify({beneficiaryName,relationshipNote:relationship||undefined})}),"Beneficiary added.");setBeneficiaryName("");setRelationship("");}catch{}}
 async function addBeneficiaryAccount(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/beneficiaries/"+beneficiaryId+"/accounts",{method:"POST",body:JSON.stringify({accountType:bType,bankName:bBank||undefined,accountReference:bRef||undefined,ifsc:bIfsc||undefined,upiId:bUpi||undefined,mobileNumber:bMobile||undefined})}),"Recipient account added.");setBBank("");setBRef("");setBIfsc("");setBUpi("");setBMobile("");}catch{}}

 function beginEdit(next:Exclude<EditState,null>){
  setEdit(next);setError("");setMessage("");
  if(next.kind==="card"){setE1(next.item.bankName);setE2(next.item.lastFourDigits);setE3(next.item.cardType||"CREDIT");setE4(next.item.nickname||"");setE5("");}
  if(next.kind==="bank"){setE1(next.item.accountHolderName);setE2(next.item.bankName);setE3(next.item.accountReference);setE4(next.item.ifsc||"");setE5("");}
  if(next.kind==="upi"){setE1(next.item.accountName);setE2(next.item.upiId||"");setE3(next.item.mobileNumber||"");setE4(next.item.providerName||"");setE5("");}
  if(next.kind==="beneficiary"){setE1(next.item.beneficiaryName);setE2(next.item.relationshipNote||"");setE3(next.item.notes||"");setE4("");setE5("");}
  if(next.kind==="beneficiaryAccount"){setE1(next.item.accountType);setE2(next.item.bankName||"");setE3(next.item.accountReference||"");setE4(next.item.upiId||"");setE5(next.item.ifsc||"");}
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!edit)return;
  try{
   if(edit.kind==="card"){
    if(!/^\d{4}$/.test(e2))throw new Error("Card last four digits must contain exactly 4 digits");
    await run(()=>apiFetch("/customers/cards/"+edit.item.id,{method:"PATCH",body:JSON.stringify({bankName:e1.trim(),lastFourDigits:e2,cardType:e3,nickname:e4.trim()||undefined})}),"Card updated.");
   }else if(edit.kind==="bank"){
    await run(()=>apiFetch("/customers/banks/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountHolderName:e1.trim(),bankName:e2.trim(),accountReference:e3.trim(),ifsc:e4.trim()||undefined})}),"Bank account updated.");
   }else if(edit.kind==="upi"){
    await run(()=>apiFetch("/customers/upi/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountName:e1.trim(),upiId:e2.trim()||undefined,mobileNumber:e3.trim()||undefined,providerName:e4.trim()||undefined})}),"UPI account updated.");
   }else if(edit.kind==="beneficiary"){
    await run(()=>apiFetch("/customers/beneficiaries/"+edit.item.id,{method:"PATCH",body:JSON.stringify({beneficiaryName:e1.trim(),relationshipNote:e2.trim()||undefined,notes:e3.trim()||undefined})}),"Beneficiary updated.");
   }else{
    await run(()=>apiFetch("/customers/beneficiary-accounts/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountType:e1,bankName:e2.trim()||undefined,accountReference:e3.trim()||undefined,upiId:e4.trim()||undefined,ifsc:e5.trim()||undefined})}),"Recipient account updated.");
   }
   setEdit(null);
  }catch(err){if(err instanceof Error&&err.message.includes("Card last"))setError(err.message);}
 }
 async function toggle(path:string,isActive:boolean,label:string){
  if(!window.confirm((isActive?"Retire ":"Reactivate ")+label+"?"))return;
  try{await run(()=>apiFetch(path+"/active",{method:"PATCH",body:JSON.stringify({isActive:!isActive})}),isActive?"Item retired.":"Item reactivated.");}catch{}
 }

 if(!c)return <AppShell><div className="rounded-xl border bg-white p-6">{error||"Loading customer..."}</div></AppShell>;
 const openPayable=c.payables.filter(x=>!["PAID","CANCELLED","REVERSED"].includes(x.status)).reduce((s,x)=>s+Number(x.remainingAmount),0);
 const openReceivable=c.receivables.filter(x=>!["RECEIVED","CANCELLED","REVERSED"].includes(x.status)).reduce((s,x)=>s+Number(x.remainingAmount),0);

 return <AppShell><div className="mx-auto max-w-7xl space-y-6">
  <div><Link href="/customers" className="text-sm font-semibold text-indigo-600">← Customers</Link><p className="mt-3 text-xs uppercase text-slate-500">{c.customerCode} · {c.customerType} · {c.isActive?"Active":"Inactive"}</p><h2 className="text-2xl font-bold">{c.fullName}</h2><p className="text-sm text-slate-500">{c.mobile||"No mobile"}{c.notes?" · "+c.notes:""}</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  {message?<p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{message}</p>:null}

  {edit?<form onSubmit={saveEdit} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Edit {edit.kind.replace("beneficiaryAccount","recipient account")}</h3><p className="text-xs text-slate-500">Update saved customer details without losing transaction history.</p></div><button type="button" onClick={()=>setEdit(null)} className="text-sm font-semibold">Close</button></div>
    {edit.kind==="card"?<div className="mt-4 grid gap-3 sm:grid-cols-4"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Card bank" required/><input className="rounded-lg border bg-white px-3 py-2.5" maxLength={4} value={e2} onChange={e=>setE2(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="Last 4" required/><select className="rounded-lg border bg-white px-3 py-2.5" value={e3} onChange={e=>setE3(e.target.value)}><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option><option value="BUSINESS">Business</option><option value="OTHER">Other</option></select><input className="rounded-lg border bg-white px-3 py-2.5" value={e4} onChange={e=>setE4(e.target.value)} placeholder="Nickname"/></div>:null}
    {edit.kind==="bank"?<div className="mt-4 grid gap-3 sm:grid-cols-4"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Account holder" required/><input className="rounded-lg border bg-white px-3 py-2.5" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Bank" required/><input className="rounded-lg border bg-white px-3 py-2.5" value={e3} onChange={e=>setE3(e.target.value)} placeholder="Account reference" required/><input className="rounded-lg border bg-white px-3 py-2.5" value={e4} onChange={e=>setE4(e.target.value)} placeholder="IFSC"/></div>:null}
    {edit.kind==="upi"?<div className="mt-4 grid gap-3 sm:grid-cols-4"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Account name" required/><input className="rounded-lg border bg-white px-3 py-2.5" value={e2} onChange={e=>setE2(e.target.value)} placeholder="UPI ID"/><input className="rounded-lg border bg-white px-3 py-2.5" value={e3} onChange={e=>setE3(e.target.value)} placeholder="Mobile"/><input className="rounded-lg border bg-white px-3 py-2.5" value={e4} onChange={e=>setE4(e.target.value)} placeholder="Provider"/></div>:null}
    {edit.kind==="beneficiary"?<div className="mt-4 grid gap-3 sm:grid-cols-3"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Beneficiary name" required/><input className="rounded-lg border bg-white px-3 py-2.5" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Relationship"/><input className="rounded-lg border bg-white px-3 py-2.5" value={e3} onChange={e=>setE3(e.target.value)} placeholder="Notes"/></div>:null}
    {edit.kind==="beneficiaryAccount"?<div className="mt-4 grid gap-3 sm:grid-cols-5"><select className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></select><input className="rounded-lg border bg-white px-3 py-2.5" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Bank"/><input className="rounded-lg border bg-white px-3 py-2.5" value={e3} onChange={e=>setE3(e.target.value)} placeholder="Account reference"/><input className="rounded-lg border bg-white px-3 py-2.5" value={e4} onChange={e=>setE4(e.target.value)} placeholder="UPI ID"/><input className="rounded-lg border bg-white px-3 py-2.5" value={e5} onChange={e=>setE5(e.target.value)} placeholder="IFSC"/></div>:null}
    <div className="mt-4 flex justify-end"><button className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white">Save Changes</button></div>
  </form>:null}

  <section className="grid gap-4 md:grid-cols-2">
   <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">To Receive</p><p className="mt-2 text-3xl font-bold text-emerald-950">{money(openReceivable)}</p><div className="mt-4 space-y-2">{c.receivables.slice(0,5).map(x=><Link key={x.id} href={"/receivables/"+x.id} className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-sm"><span><strong>{x.reason}</strong><span className="block text-xs text-slate-500">{x.status.replaceAll("_"," ")}{x.dueAt?" · "+new Date(x.dueAt).toLocaleDateString("en-IN"):""}</span></span><strong className="text-emerald-700">{money(x.remainingAmount)}</strong></Link>)}{!c.receivables.length?<p className="text-sm text-slate-500">No receivables.</p>:null}</div></div>
   <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">To Pay</p><p className="mt-2 text-3xl font-bold text-amber-950">{money(openPayable)}</p><div className="mt-4 space-y-2">{c.payables.slice(0,5).map(x=><Link key={x.id} href={"/payables/"+x.id} className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-sm"><span><strong>{x.status.replaceAll("_"," ")}</strong><span className="block text-xs text-slate-500">Due {new Date(x.dueAt).toLocaleDateString("en-IN")}</span></span><strong className="text-amber-700">{money(x.remainingAmount)}</strong></Link>)}{!c.payables.length?<p className="text-sm text-slate-500">No payables.</p>:null}</div></div>
  </section>

  <section className="grid gap-5 lg:grid-cols-3">
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Cards</h3><div className="mt-3 space-y-2">{c.cards.map(x=><div key={x.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!x.isActive?"opacity-60":"")}><strong>{x.bankName}</strong> ****{x.lastFourDigits}<br/><span className="text-slate-500">{x.nickname||x.cardType||"Card"} · {x.isActive?"Active":"Inactive"}</span><div className="mt-2 flex gap-1"><button onClick={()=>beginEdit({kind:"card",item:x})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/cards/"+x.id,x.isActive,"card")} className="rounded border px-2 py-1 text-xs">{x.isActive?"Retire":"Reactivate"}</button></div></div>)}{!c.cards.length?<p className="text-sm text-slate-500">No cards saved.</p>:null}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Bank Accounts</h3><div className="mt-3 space-y-2">{c.bankAccounts.map(x=><div key={x.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!x.isActive?"opacity-60":"")}><strong>{x.bankName}</strong> · {x.accountReference}<br/><span className="text-slate-500">{x.accountHolderName}{x.ifsc?" · "+x.ifsc:""} · {x.isActive?"Active":"Inactive"}</span><div className="mt-2 flex gap-1"><button onClick={()=>beginEdit({kind:"bank",item:x})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/banks/"+x.id,x.isActive,"bank account")} className="rounded border px-2 py-1 text-xs">{x.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">UPI</h3><div className="mt-3 space-y-2">{c.upiAccounts.map(x=><div key={x.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!x.isActive?"opacity-60":"")}><strong>{x.accountName}</strong><br/><span className="text-slate-500">{x.upiId||x.mobileNumber||"—"}{x.providerName?" · "+x.providerName:""} · {x.isActive?"Active":"Inactive"}</span><div className="mt-2 flex gap-1"><button onClick={()=>beginEdit({kind:"upi",item:x})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/upi/"+x.id,x.isActive,"UPI account")} className="rounded border px-2 py-1 text-xs">{x.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>
  </section>

  <section className="grid gap-5 lg:grid-cols-2">
   <form onSubmit={addBank} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Add Bank Account</h3><input className="rounded-lg border px-3 py-2" placeholder="Account holder" value={holder} onChange={e=>setHolder(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Bank name" value={bankName} onChange={e=>setBankName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Account number / masked reference" value={accountRef} onChange={e=>setAccountRef(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="IFSC" value={ifsc} onChange={e=>setIfsc(e.target.value)}/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white sm:col-span-2">Add Bank</button></form>
   <form onSubmit={addUpi} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Add UPI</h3><input className="rounded-lg border px-3 py-2" placeholder="Account name" value={upiName} onChange={e=>setUpiName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="UPI ID" value={upiId} onChange={e=>setUpiId(e.target.value)}/><input className="rounded-lg border px-3 py-2" placeholder="Mobile" value={upiMobile} onChange={e=>setUpiMobile(e.target.value)}/><input className="rounded-lg border px-3 py-2" placeholder="GPay / PhonePe / etc." value={upiProvider} onChange={e=>setUpiProvider(e.target.value)}/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white sm:col-span-2">Add UPI</button></form>
  </section>

  <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Beneficiaries / Family Recipients</h3><div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]"><div className="space-y-3">{c.beneficiaries.map(b=><div key={b.id} className={"rounded-lg border p-3 text-sm "+(!b.isActive?"opacity-60":"")}><div className="flex justify-between gap-2"><div><strong>{b.beneficiaryName}</strong>{b.relationshipNote?<span className="text-slate-500"> · {b.relationshipNote}</span>:null}<span className="text-slate-500"> · {b.isActive?"Active":"Inactive"}</span></div><div className="flex gap-1"><button onClick={()=>beginEdit({kind:"beneficiary",item:b})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/beneficiaries/"+b.id,b.isActive,"beneficiary")} className="rounded border px-2 py-1 text-xs">{b.isActive?"Retire":"Reactivate"}</button></div></div><div className="mt-2 space-y-2">{b.accounts.map(a=><div key={a.id} className={"rounded bg-slate-50 p-2 text-slate-600 "+(!a.isActive?"opacity-60":"")}><div>{a.accountType}: {a.bankName?(a.bankName+" "+(a.accountReference||"")):(a.upiId||a.mobileNumber||"—")} · {a.isActive?"Active":"Inactive"}</div><div className="mt-1 flex gap-1"><button onClick={()=>beginEdit({kind:"beneficiaryAccount",item:a})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/beneficiary-accounts/"+a.id,a.isActive,"recipient account")} className="rounded border px-2 py-1 text-xs">{a.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>)}</div><div className="space-y-4">
    <form onSubmit={addBeneficiary} className="grid gap-2 sm:grid-cols-3"><input className="rounded-lg border px-3 py-2" placeholder="Beneficiary name" value={beneficiaryName} onChange={e=>setBeneficiaryName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Relationship" value={relationship} onChange={e=>setRelationship(e.target.value)}/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Beneficiary</button></form>
    <form onSubmit={addBeneficiaryAccount} className="grid gap-2 sm:grid-cols-3"><select className="rounded-lg border px-3 py-2" value={beneficiaryId} onChange={e=>setBeneficiaryId(e.target.value)} required><option value="">Beneficiary</option>{c.beneficiaries.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.beneficiaryName}</option>)}</select><select className="rounded-lg border px-3 py-2" value={bType} onChange={e=>setBType(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></select>{bType==="BANK"?<><input className="rounded-lg border px-3 py-2" placeholder="Bank" value={bBank} onChange={e=>setBBank(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Account reference" value={bRef} onChange={e=>setBRef(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="IFSC" value={bIfsc} onChange={e=>setBIfsc(e.target.value)}/></>:<><input className="rounded-lg border px-3 py-2" placeholder="UPI ID" value={bUpi} onChange={e=>setBUpi(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Mobile" value={bMobile} onChange={e=>setBMobile(e.target.value)}/></>}<button className="rounded-lg border px-4 py-2 font-semibold">Add Recipient Account</button></form>
   </div></div></section>
 </div></AppShell>;
}
