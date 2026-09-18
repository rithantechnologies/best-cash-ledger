"use client";

import { FormEvent, useEffect, useState } from "react";
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
};

export default function CustomerDetailPage(){
 const {id}=useParams<{id:string}>();
 const [c,setC]=useState<Customer|null>(null);
 const [error,setError]=useState("");
 const [bankName,setBankName]=useState("");const [holder,setHolder]=useState("");const [accountRef,setAccountRef]=useState("");const [ifsc,setIfsc]=useState("");
 const [upiName,setUpiName]=useState("");const [upiId,setUpiId]=useState("");const [upiMobile,setUpiMobile]=useState("");const [upiProvider,setUpiProvider]=useState("");
 const [beneficiaryName,setBeneficiaryName]=useState("");const [relationship,setRelationship]=useState("");
 const [beneficiaryId,setBeneficiaryId]=useState("");const [bType,setBType]=useState("BANK");const [bBank,setBBank]=useState("");const [bRef,setBRef]=useState("");const [bIfsc,setBIfsc]=useState("");const [bUpi,setBUpi]=useState("");const [bMobile,setBMobile]=useState("");

 const load=()=>apiFetch<Customer>("/customers/"+id).then(setC);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Failed to load customer"));},[id]);

 async function run(action:()=>Promise<unknown>){setError("");try{await action();await load();}catch(err){setError(err instanceof Error?err.message:"Update failed");}}
 async function addBank(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/customers/"+id+"/banks",{method:"POST",body:JSON.stringify({accountHolderName:holder,bankName,accountReference:accountRef,ifsc:ifsc||undefined})}));setHolder("");setBankName("");setAccountRef("");setIfsc("");}
 async function addUpi(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/customers/"+id+"/upi",{method:"POST",body:JSON.stringify({accountName:upiName,upiId:upiId||undefined,mobileNumber:upiMobile||undefined,providerName:upiProvider||undefined})}));setUpiName("");setUpiId("");setUpiMobile("");setUpiProvider("");}
 async function addBeneficiary(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/customers/"+id+"/beneficiaries",{method:"POST",body:JSON.stringify({beneficiaryName,relationshipNote:relationship||undefined})}));setBeneficiaryName("");setRelationship("");}
 async function addBeneficiaryAccount(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/customers/beneficiaries/"+beneficiaryId+"/accounts",{method:"POST",body:JSON.stringify({accountType:bType,bankName:bBank||undefined,accountReference:bRef||undefined,ifsc:bIfsc||undefined,upiId:bUpi||undefined,mobileNumber:bMobile||undefined})}));setBBank("");setBRef("");setBIfsc("");setBUpi("");setBMobile("");}

 async function editCard(x:Card){
  const bank=window.prompt("Card bank",x.bankName);if(bank===null||!bank.trim())return;
  const last4=window.prompt("Last four digits",x.lastFourDigits);if(last4===null||!/^[0-9]{4}$/.test(last4))return;
  const type=window.prompt("Card type",x.cardType||"CREDIT");if(type===null)return;
  const nick=window.prompt("Nickname",x.nickname||"");if(nick===null)return;
  await run(()=>apiFetch("/customers/cards/"+x.id,{method:"PATCH",body:JSON.stringify({bankName:bank.trim(),cardType:type.trim().toUpperCase(),lastFourDigits:last4,nickname:nick.trim()||undefined})}));
 }
 async function editBank(x:Bank){
  const holderName=window.prompt("Account holder",x.accountHolderName);if(holderName===null||!holderName.trim())return;
  const bank=window.prompt("Bank name",x.bankName);if(bank===null||!bank.trim())return;
  const ref=window.prompt("Account reference",x.accountReference);if(ref===null||!ref.trim())return;
  const code=window.prompt("IFSC",x.ifsc||"");if(code===null)return;
  await run(()=>apiFetch("/customers/banks/"+x.id,{method:"PATCH",body:JSON.stringify({accountHolderName:holderName.trim(),bankName:bank.trim(),accountReference:ref.trim(),ifsc:code.trim()||undefined})}));
 }
 async function editUpi(x:Upi){
  const name=window.prompt("Account name",x.accountName);if(name===null||!name.trim())return;
  const upi=window.prompt("UPI ID",x.upiId||"");if(upi===null)return;
  const mobile=window.prompt("Mobile",x.mobileNumber||"");if(mobile===null)return;
  const provider=window.prompt("Provider",x.providerName||"");if(provider===null)return;
  await run(()=>apiFetch("/customers/upi/"+x.id,{method:"PATCH",body:JSON.stringify({accountName:name.trim(),upiId:upi.trim()||undefined,mobileNumber:mobile.trim()||undefined,providerName:provider.trim()||undefined})}));
 }
 async function editBeneficiary(x:Beneficiary){
  const name=window.prompt("Beneficiary name",x.beneficiaryName);if(name===null||!name.trim())return;
  const relation=window.prompt("Relationship",x.relationshipNote||"");if(relation===null)return;
  await run(()=>apiFetch("/customers/beneficiaries/"+x.id,{method:"PATCH",body:JSON.stringify({beneficiaryName:name.trim(),relationshipNote:relation.trim()||undefined})}));
 }
 async function editBeneficiaryAccount(x:BAccount){
  const type=window.prompt("Type: BANK or UPI",x.accountType);if(type===null)return;
  const bank=window.prompt("Bank name",x.bankName||"");if(bank===null)return;
  const ref=window.prompt("Account reference",x.accountReference||"");if(ref===null)return;
  const upi=window.prompt("UPI ID",x.upiId||"");if(upi===null)return;
  await run(()=>apiFetch("/customers/beneficiary-accounts/"+x.id,{method:"PATCH",body:JSON.stringify({accountType:type.trim().toUpperCase(),bankName:bank.trim()||undefined,accountReference:ref.trim()||undefined,upiId:upi.trim()||undefined})}));
 }
 async function toggle(path:string,isActive:boolean,label:string){if(!window.confirm((isActive?"Retire ":"Reactivate ")+label+"?"))return;await run(()=>apiFetch(path+"/active",{method:"PATCH",body:JSON.stringify({isActive:!isActive})}));}

 if(!c)return <AppShell><div className="rounded-xl border bg-white p-6">{error||"Loading customer..."}</div></AppShell>;
 return <AppShell><div className="mx-auto max-w-7xl space-y-6">
  <div><p className="text-xs uppercase text-slate-500">{c.customerCode} · {c.customerType} · {c.isActive?"Active":"Inactive"}</p><h2 className="text-2xl font-bold">{c.fullName}</h2><p className="text-sm text-slate-500">{c.mobile||"No mobile"}{c.notes?" · "+c.notes:""}</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}

  <section className="grid gap-5 lg:grid-cols-3">
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Cards</h3><div className="mt-3 space-y-2">{c.cards.map(x=><div key={x.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!x.isActive?"opacity-60":"")}><strong>{x.bankName}</strong> ****{x.lastFourDigits}<br/><span className="text-slate-500">{x.nickname||x.cardType||"Card"} · {x.isActive?"Active":"Inactive"}</span><div className="mt-2 flex gap-1"><button onClick={()=>editCard(x)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/cards/"+x.id,x.isActive,"card")} className="rounded border px-2 py-1 text-xs">{x.isActive?"Retire":"Reactivate"}</button></div></div>)}{!c.cards.length?<p className="text-sm text-slate-500">No cards saved.</p>:null}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Bank Accounts</h3><div className="mt-3 space-y-2">{c.bankAccounts.map(x=><div key={x.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!x.isActive?"opacity-60":"")}><strong>{x.bankName}</strong> · {x.accountReference}<br/><span className="text-slate-500">{x.accountHolderName}{x.ifsc?" · "+x.ifsc:""} · {x.isActive?"Active":"Inactive"}</span><div className="mt-2 flex gap-1"><button onClick={()=>editBank(x)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/banks/"+x.id,x.isActive,"bank account")} className="rounded border px-2 py-1 text-xs">{x.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">UPI</h3><div className="mt-3 space-y-2">{c.upiAccounts.map(x=><div key={x.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!x.isActive?"opacity-60":"")}><strong>{x.accountName}</strong><br/><span className="text-slate-500">{x.upiId||x.mobileNumber||"—"}{x.providerName?" · "+x.providerName:""} · {x.isActive?"Active":"Inactive"}</span><div className="mt-2 flex gap-1"><button onClick={()=>editUpi(x)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/upi/"+x.id,x.isActive,"UPI account")} className="rounded border px-2 py-1 text-xs">{x.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>
  </section>

  <section className="grid gap-5 lg:grid-cols-2">
   <form onSubmit={addBank} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Add Bank Account</h3><input className="rounded-lg border px-3 py-2" placeholder="Account holder" value={holder} onChange={e=>setHolder(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Bank name" value={bankName} onChange={e=>setBankName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Account number / masked reference" value={accountRef} onChange={e=>setAccountRef(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="IFSC" value={ifsc} onChange={e=>setIfsc(e.target.value)}/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white sm:col-span-2">Add Bank</button></form>
   <form onSubmit={addUpi} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Add UPI</h3><input className="rounded-lg border px-3 py-2" placeholder="Account name" value={upiName} onChange={e=>setUpiName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="UPI ID" value={upiId} onChange={e=>setUpiId(e.target.value)}/><input className="rounded-lg border px-3 py-2" placeholder="Mobile" value={upiMobile} onChange={e=>setUpiMobile(e.target.value)}/><input className="rounded-lg border px-3 py-2" placeholder="GPay / PhonePe / etc." value={upiProvider} onChange={e=>setUpiProvider(e.target.value)}/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white sm:col-span-2">Add UPI</button></form>
  </section>

  <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Beneficiaries / Family Recipients</h3><div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]"><div className="space-y-3">{c.beneficiaries.map(b=><div key={b.id} className={"rounded-lg border p-3 text-sm "+(!b.isActive?"opacity-60":"")}><div className="flex justify-between gap-2"><div><strong>{b.beneficiaryName}</strong>{b.relationshipNote?<span className="text-slate-500"> · {b.relationshipNote}</span>:null}<span className="text-slate-500"> · {b.isActive?"Active":"Inactive"}</span></div><div className="flex gap-1"><button onClick={()=>editBeneficiary(b)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/beneficiaries/"+b.id,b.isActive,"beneficiary")} className="rounded border px-2 py-1 text-xs">{b.isActive?"Retire":"Reactivate"}</button></div></div><div className="mt-2 space-y-2">{b.accounts.map(a=><div key={a.id} className={"rounded bg-slate-50 p-2 text-slate-600 "+(!a.isActive?"opacity-60":"")}><div>{a.accountType}: {a.bankName?(a.bankName+" "+(a.accountReference||"")):(a.upiId||a.mobileNumber||"—")} · {a.isActive?"Active":"Inactive"}</div><div className="mt-1 flex gap-1"><button onClick={()=>editBeneficiaryAccount(a)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/customers/beneficiary-accounts/"+a.id,a.isActive,"recipient account")} className="rounded border px-2 py-1 text-xs">{a.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>)}</div><div className="space-y-4">
    <form onSubmit={addBeneficiary} className="grid gap-2 sm:grid-cols-3"><input className="rounded-lg border px-3 py-2" placeholder="Beneficiary name" value={beneficiaryName} onChange={e=>setBeneficiaryName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Relationship" value={relationship} onChange={e=>setRelationship(e.target.value)}/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Beneficiary</button></form>
    <form onSubmit={addBeneficiaryAccount} className="grid gap-2 sm:grid-cols-3"><select className="rounded-lg border px-3 py-2" value={beneficiaryId} onChange={e=>setBeneficiaryId(e.target.value)} required><option value="">Beneficiary</option>{c.beneficiaries.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.beneficiaryName}</option>)}</select><select className="rounded-lg border px-3 py-2" value={bType} onChange={e=>setBType(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></select>{bType==="BANK"?<><input className="rounded-lg border px-3 py-2" placeholder="Bank" value={bBank} onChange={e=>setBBank(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="Account reference" value={bRef} onChange={e=>setBRef(e.target.value)} required/><input className="rounded-lg border px-3 py-2" placeholder="IFSC" value={bIfsc} onChange={e=>setBIfsc(e.target.value)}/></>:<><input className="rounded-lg border px-3 py-2" placeholder="UPI ID" value={bUpi} onChange={e=>setBUpi(e.target.value)}/><input className="rounded-lg border px-3 py-2" placeholder="Mobile" value={bMobile} onChange={e=>setBMobile(e.target.value)}/></>}<button className="rounded-lg border px-4 py-2 font-semibold">Add Recipient Account</button></form>
   </div></div></section>
 </div></AppShell>;
}
