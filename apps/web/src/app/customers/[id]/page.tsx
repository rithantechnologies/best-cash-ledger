"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
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
type EditState={kind:"card";item:Card}|{kind:"bank";item:Bank}|{kind:"upi";item:Upi}|{kind:"beneficiary";item:Beneficiary}|{kind:"beneficiaryAccount";item:BAccount}|null;
type AddKind="bank"|"upi"|"beneficiary"|"beneficiaryAccount"|null;
type ToggleTarget={path:string;isActive:boolean;label:string}|null;
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));

export default function CustomerDetailPage(){
 const {id}=useParams<{id:string}>();
 const [c,setC]=useState<Customer|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [addKind,setAddKind]=useState<AddKind>(null),[toggleTarget,setToggleTarget]=useState<ToggleTarget>(null);
 const [bankName,setBankName]=useState(""),[holder,setHolder]=useState(""),[accountRef,setAccountRef]=useState(""),[ifsc,setIfsc]=useState("");
 const [upiName,setUpiName]=useState(""),[upiId,setUpiId]=useState(""),[upiMobile,setUpiMobile]=useState(""),[upiProvider,setUpiProvider]=useState("");
 const [beneficiaryName,setBeneficiaryName]=useState(""),[relationship,setRelationship]=useState("");
 const [beneficiaryId,setBeneficiaryId]=useState(""),[bType,setBType]=useState("BANK"),[bBank,setBBank]=useState(""),[bRef,setBRef]=useState(""),[bIfsc,setBIfsc]=useState(""),[bUpi,setBUpi]=useState(""),[bMobile,setBMobile]=useState("");
 const [edit,setEdit]=useState<EditState>(null),[e1,setE1]=useState(""),[e2,setE2]=useState(""),[e3,setE3]=useState(""),[e4,setE4]=useState(""),[e5,setE5]=useState("");
 const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";

 const load=()=>apiFetch<Customer>("/customers/"+id).then(setC);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Failed to load customer"));},[id]);

 async function run(action:()=>Promise<unknown>,success?:string){
  setBusy(true);setError("");setMessage("");
  try{await action();await load();if(success){setMessage(success);window.setTimeout(()=>setMessage(""),2500);}}
  catch(err){setError(err instanceof Error?err.message:"Update failed");throw err;}
  finally{setBusy(false);}
 }
 async function addBank(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/"+id+"/banks",{method:"POST",body:JSON.stringify({accountHolderName:holder,bankName,accountReference:accountRef,ifsc:ifsc||undefined})}),"Bank account added.");setHolder("");setBankName("");setAccountRef("");setIfsc("");setAddKind(null);}catch{}}
 async function addUpi(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/"+id+"/upi",{method:"POST",body:JSON.stringify({accountName:upiName,upiId:upiId||undefined,mobileNumber:upiMobile||undefined,providerName:upiProvider||undefined})}),"UPI account added.");setUpiName("");setUpiId("");setUpiMobile("");setUpiProvider("");setAddKind(null);}catch{}}
 async function addBeneficiary(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/"+id+"/beneficiaries",{method:"POST",body:JSON.stringify({beneficiaryName,relationshipNote:relationship||undefined})}),"Beneficiary added.");setBeneficiaryName("");setRelationship("");setAddKind(null);}catch{}}
 async function addBeneficiaryAccount(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/beneficiaries/"+beneficiaryId+"/accounts",{method:"POST",body:JSON.stringify({accountType:bType,bankName:bBank||undefined,accountReference:bRef||undefined,ifsc:bIfsc||undefined,upiId:bUpi||undefined,mobileNumber:bMobile||undefined})}),"Recipient account added.");setBBank("");setBRef("");setBIfsc("");setBUpi("");setBMobile("");setAddKind(null);}catch{}}

 function beginEdit(next:Exclude<EditState,null>){
  setEdit(next);setError("");
  if(next.kind==="card"){setE1(next.item.bankName);setE2(next.item.lastFourDigits);setE3(next.item.cardType||"CREDIT");setE4(next.item.nickname||"");setE5("");}
  if(next.kind==="bank"){setE1(next.item.accountHolderName);setE2(next.item.bankName);setE3(next.item.accountReference);setE4(next.item.ifsc||"");setE5("");}
  if(next.kind==="upi"){setE1(next.item.accountName);setE2(next.item.upiId||"");setE3(next.item.mobileNumber||"");setE4(next.item.providerName||"");setE5("");}
  if(next.kind==="beneficiary"){setE1(next.item.beneficiaryName);setE2(next.item.relationshipNote||"");setE3(next.item.notes||"");setE4("");setE5("");}
  if(next.kind==="beneficiaryAccount"){setE1(next.item.accountType);setE2(next.item.bankName||"");setE3(next.item.accountReference||"");setE4(next.item.upiId||"");setE5(next.item.ifsc||"");}
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!edit)return;
  try{
   if(edit.kind==="card"){if(!/^\d{4}$/.test(e2))throw new Error("Card last four digits must contain exactly 4 digits");await run(()=>apiFetch("/customers/cards/"+edit.item.id,{method:"PATCH",body:JSON.stringify({bankName:e1.trim(),lastFourDigits:e2,cardType:e3,nickname:e4.trim()||undefined})}),"Card updated.");}
   else if(edit.kind==="bank")await run(()=>apiFetch("/customers/banks/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountHolderName:e1.trim(),bankName:e2.trim(),accountReference:e3.trim(),ifsc:e4.trim()||undefined})}),"Bank account updated.");
   else if(edit.kind==="upi")await run(()=>apiFetch("/customers/upi/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountName:e1.trim(),upiId:e2.trim()||undefined,mobileNumber:e3.trim()||undefined,providerName:e4.trim()||undefined})}),"UPI account updated.");
   else if(edit.kind==="beneficiary")await run(()=>apiFetch("/customers/beneficiaries/"+edit.item.id,{method:"PATCH",body:JSON.stringify({beneficiaryName:e1.trim(),relationshipNote:e2.trim()||undefined,notes:e3.trim()||undefined})}),"Beneficiary updated.");
   else await run(()=>apiFetch("/customers/beneficiary-accounts/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountType:e1,bankName:e2.trim()||undefined,accountReference:e3.trim()||undefined,upiId:e4.trim()||undefined,ifsc:e5.trim()||undefined})}),"Recipient account updated.");
   setEdit(null);
  }catch(err){if(err instanceof Error)setError(err.message);}
 }
 async function confirmToggle(){
  if(!toggleTarget)return;try{await run(()=>apiFetch(toggleTarget.path+"/active",{method:"PATCH",body:JSON.stringify({isActive:!toggleTarget.isActive})}),toggleTarget.isActive?"Item retired.":"Item reactivated.");setToggleTarget(null);}catch{}
 }
 if(!c)return <AppShell><PageLoader label="Loading customer profile…"/></AppShell>;
 const openPayable=c.payables.filter(x=>!["PAID","CANCELLED","REVERSED"].includes(x.status)).reduce((s,x)=>s+Number(x.remainingAmount),0);
 const openReceivable=c.receivables.filter(x=>!["RECEIVED","CANCELLED","REVERSED"].includes(x.status)).reduce((s,x)=>s+Number(x.remainingAmount),0);
 return <AppShell><PageFrame>
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href="/customers" className="text-xs font-bold text-indigo-600">← Customers</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{c.customerCode} · {c.customerType.replaceAll("_"," ")}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{c.fullName}</h2><p className="mt-1 text-sm text-slate-500">{c.mobile||"No mobile"}{c.notes?" · "+c.notes:""}</p></div>
   <StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
   <DetailStat label="To receive" value={money(openReceivable)} tone="emerald"/>
   <DetailStat label="To pay" value={money(openPayable)} tone="amber"/>
   <DetailStat label="Saved cards" value={c.cards.filter(x=>x.isActive).length} tone="indigo"/>
   <DetailStat label="Recipients" value={c.beneficiaries.filter(x=>x.isActive).length} tone="cyan"/>
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   <Surface className="overflow-hidden"><PanelHeader title="Money to receive" description="Open and recent receivables." action={<Link href="/receivables" className="text-xs font-bold text-indigo-600">View all →</Link>}/><div className="divide-y divide-slate-100">{c.receivables.slice(0,5).map(x=><Link key={x.id} href={"/receivables/"+x.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{x.reason}</p><p className="text-[11px] text-slate-400">{x.status.replaceAll("_"," ")}{x.dueAt?" · "+new Date(x.dueAt).toLocaleDateString("en-IN"):""}</p></div><strong className="text-sm text-emerald-700">{money(x.remainingAmount)}</strong></Link>)}{!c.receivables.length?<div className="p-4"><EmptyState title="No receivables"/></div>:null}</div></Surface>
   <Surface className="overflow-hidden"><PanelHeader title="Money to pay" description="Open and recent customer payables." action={<Link href="/payables" className="text-xs font-bold text-indigo-600">View all →</Link>}/><div className="divide-y divide-slate-100">{c.payables.slice(0,5).map(x=><Link key={x.id} href={"/payables/"+x.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"><div><p className="text-sm font-semibold">{x.status.replaceAll("_"," ")}</p><p className="text-[11px] text-slate-400">Due {new Date(x.dueAt).toLocaleDateString("en-IN")}</p></div><strong className="text-sm text-amber-700">{money(x.remainingAmount)}</strong></Link>)}{!c.payables.length?<div className="p-4"><EmptyState title="No payables"/></div>:null}</div></Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-3">
   <SavedList title="Saved cards" count={c.cards.length} addLabel={undefined}>{c.cards.length?c.cards.map(x=><SavedItem key={x.id} title={x.bankName+" •••• "+x.lastFourDigits} detail={(x.nickname||x.cardType||"Card")+" · "+(x.isActive?"Active":"Inactive")} active={x.isActive} onEdit={()=>beginEdit({kind:"card",item:x})} onToggle={()=>setToggleTarget({path:"/customers/cards/"+x.id,isActive:x.isActive,label:"card"})}/>):<EmptyState title="No saved cards"/>}</SavedList>
   <SavedList title="Bank accounts" count={c.bankAccounts.length} addLabel="Add bank" onAdd={()=>setAddKind("bank")}>{c.bankAccounts.length?c.bankAccounts.map(x=><SavedItem key={x.id} title={x.bankName+" · "+x.accountReference} detail={x.accountHolderName+(x.ifsc?" · "+x.ifsc:"")} active={x.isActive} onEdit={()=>beginEdit({kind:"bank",item:x})} onToggle={()=>setToggleTarget({path:"/customers/banks/"+x.id,isActive:x.isActive,label:"bank account"})}/>):<EmptyState title="No bank accounts"/>}</SavedList>
   <SavedList title="UPI accounts" count={c.upiAccounts.length} addLabel="Add UPI" onAdd={()=>setAddKind("upi")}>{c.upiAccounts.length?c.upiAccounts.map(x=><SavedItem key={x.id} title={x.accountName} detail={(x.upiId||x.mobileNumber||"—")+(x.providerName?" · "+x.providerName:"")} active={x.isActive} onEdit={()=>beginEdit({kind:"upi",item:x})} onToggle={()=>setToggleTarget({path:"/customers/upi/"+x.id,isActive:x.isActive,label:"UPI account"})}/>):<EmptyState title="No UPI accounts"/>}</SavedList>
  </div>
  <Surface className="overflow-hidden">
   <PanelHeader title="Beneficiaries & family recipients" description="People this customer commonly sends money to." action={<div className="flex gap-2"><button onClick={()=>setAddKind("beneficiary")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">+ Recipient</button><button onClick={()=>setAddKind("beneficiaryAccount")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">+ Account</button></div>}/>
   {c.beneficiaries.length?<div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">{c.beneficiaries.map(b=><div key={b.id} className={!b.isActive?"rounded-2xl border border-slate-200 p-4 opacity-60":"rounded-2xl border border-slate-200 p-4"}>
    <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{b.beneficiaryName}</p><p className="mt-0.5 text-[11px] text-slate-400">{b.relationshipNote||"Recipient"} · {b.isActive?"Active":"Inactive"}</p></div><div className="flex gap-1"><button onClick={()=>beginEdit({kind:"beneficiary",item:b})} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold">Edit</button><button onClick={()=>setToggleTarget({path:"/customers/beneficiaries/"+b.id,isActive:b.isActive,label:"beneficiary"})} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-500">{b.isActive?"Retire":"Reactivate"}</button></div></div>
    <div className="mt-3 space-y-2">{b.accounts.map(a=><div key={a.id} className={!a.isActive?"rounded-xl bg-slate-50 p-3 text-xs opacity-60":"rounded-xl bg-slate-50 p-3 text-xs"}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold">{a.accountType}</p><p className="mt-0.5 truncate text-slate-500">{a.bankName?(a.bankName+" "+(a.accountReference||"")):(a.upiId||a.mobileNumber||"—")}</p></div><div className="flex gap-1"><button onClick={()=>beginEdit({kind:"beneficiaryAccount",item:a})} className="font-bold text-indigo-600">Edit</button><button onClick={()=>setToggleTarget({path:"/customers/beneficiary-accounts/"+a.id,isActive:a.isActive,label:"recipient account"})} className="font-bold text-slate-400">{a.isActive?"Retire":"Reactivate"}</button></div></div></div>)}</div>
   </div>)}</div>:<div className="p-4"><EmptyState title="No beneficiaries saved"/></div>}
  </Surface>
  <Modal open={addKind==="bank"} title="Add bank account" description="Save a beneficiary or customer bank destination for faster future transfers." onClose={()=>setAddKind(null)} footer={<button form="add-bank" disabled={busy} className="min-h-11 w-full rounded-xl bg-slate-950 font-bold text-white">Save bank account</button>}>
   <form id="add-bank" onSubmit={addBank} className="grid gap-3 sm:grid-cols-2"><Field label="Account holder"><input className={control} value={holder} onChange={e=>setHolder(e.target.value)} required/></Field><Field label="Bank name"><input className={control} value={bankName} onChange={e=>setBankName(e.target.value)} required/></Field><Field label="Account number / reference"><input className={control} value={accountRef} onChange={e=>setAccountRef(e.target.value)} required/></Field><Field label="IFSC"><input className={control} value={ifsc} onChange={e=>setIfsc(e.target.value)}/></Field></form>
  </Modal>
  <Modal open={addKind==="upi"} title="Add UPI account" description="Save a UPI destination for quick counter transactions." onClose={()=>setAddKind(null)} footer={<button form="add-upi" disabled={busy} className="min-h-11 w-full rounded-xl bg-slate-950 font-bold text-white">Save UPI account</button>}>
   <form id="add-upi" onSubmit={addUpi} className="grid gap-3 sm:grid-cols-2"><Field label="Account name"><input className={control} value={upiName} onChange={e=>setUpiName(e.target.value)} required/></Field><Field label="UPI ID"><input className={control} value={upiId} onChange={e=>setUpiId(e.target.value)}/></Field><Field label="Mobile"><input className={control} value={upiMobile} onChange={e=>setUpiMobile(e.target.value)}/></Field><Field label="Provider"><input className={control} value={upiProvider} onChange={e=>setUpiProvider(e.target.value)} placeholder="GPay / PhonePe / etc."/></Field></form>
  </Modal>
  <Modal open={addKind==="beneficiary"} title="Add beneficiary" description="Save a regular recipient or family member." onClose={()=>setAddKind(null)} footer={<button form="add-beneficiary" disabled={busy} className="min-h-11 w-full rounded-xl bg-slate-950 font-bold text-white">Save beneficiary</button>}>
   <form id="add-beneficiary" onSubmit={addBeneficiary} className="grid gap-3 sm:grid-cols-2"><Field label="Beneficiary name"><input className={control} value={beneficiaryName} onChange={e=>setBeneficiaryName(e.target.value)} required/></Field><Field label="Relationship"><input className={control} value={relationship} onChange={e=>setRelationship(e.target.value)} placeholder="Optional"/></Field></form>
  </Modal>
  <Modal open={addKind==="beneficiaryAccount"} title="Add recipient account" description="Attach a bank or UPI destination to a saved beneficiary." onClose={()=>setAddKind(null)} footer={<button form="add-beneficiary-account" disabled={busy} className="min-h-11 w-full rounded-xl bg-slate-950 font-bold text-white">Save recipient account</button>}>
   <form id="add-beneficiary-account" onSubmit={addBeneficiaryAccount} className="grid gap-3 sm:grid-cols-2"><Field label="Beneficiary"><select className={control} value={beneficiaryId} onChange={e=>setBeneficiaryId(e.target.value)} required><option value="">Select beneficiary</option>{c.beneficiaries.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.beneficiaryName}</option>)}</select></Field><Field label="Account type"><select className={control} value={bType} onChange={e=>setBType(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></select></Field>{bType==="BANK"?<><Field label="Bank"><input className={control} value={bBank} onChange={e=>setBBank(e.target.value)} required/></Field><Field label="Account reference"><input className={control} value={bRef} onChange={e=>setBRef(e.target.value)} required/></Field><Field label="IFSC" className="sm:col-span-2"><input className={control} value={bIfsc} onChange={e=>setBIfsc(e.target.value)}/></Field></>:<><Field label="UPI ID"><input className={control} value={bUpi} onChange={e=>setBUpi(e.target.value)} required/></Field><Field label="Mobile"><input className={control} value={bMobile} onChange={e=>setBMobile(e.target.value)}/></Field></>}</form>
  </Modal>
  <Modal open={!!edit} title={edit?"Edit "+edit.kind.replace("beneficiaryAccount","recipient account"):"Edit saved detail"} description="Update saved details without changing historical transactions." onClose={()=>setEdit(null)} footer={<button form="edit-saved-detail" disabled={busy} className="min-h-11 w-full rounded-xl bg-indigo-700 font-bold text-white">Save changes</button>}>
   <form id="edit-saved-detail" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
    {edit?.kind==="card"?<><Field label="Bank"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="Last 4"><input className={control} value={e2} onChange={e=>setE2(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} required/></Field><Field label="Type"><select className={control} value={e3} onChange={e=>setE3(e.target.value)}>{["CREDIT","DEBIT","BUSINESS","OTHER"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Nickname"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {edit?.kind==="bank"?<><Field label="Account holder"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="Bank"><input className={control} value={e2} onChange={e=>setE2(e.target.value)} required/></Field><Field label="Account reference"><input className={control} value={e3} onChange={e=>setE3(e.target.value)} required/></Field><Field label="IFSC"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {edit?.kind==="upi"?<><Field label="Account name"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="UPI ID"><input className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Mobile"><input className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field><Field label="Provider"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {edit?.kind==="beneficiary"?<><Field label="Name"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="Relationship"><input className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Notes" className="sm:col-span-2"><input className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field></>:null}
    {edit?.kind==="beneficiaryAccount"?<><Field label="Type"><select className={control} value={e1} onChange={e=>setE1(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></select></Field><Field label="Bank"><input className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Account reference"><input className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field><Field label="UPI ID"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field><Field label="IFSC" className="sm:col-span-2"><input className={control} value={e5} onChange={e=>setE5(e.target.value)}/></Field></>:null}
   </form>
  </Modal>
  <Modal open={!!toggleTarget} title={toggleTarget?.isActive?"Retire saved detail?":"Reactivate saved detail?"} description="Historical transactions are never removed." onClose={()=>setToggleTarget(null)} footer={<div className="grid grid-cols-2 gap-2"><button onClick={()=>setToggleTarget(null)} className="min-h-11 rounded-xl border border-slate-200 font-bold">Cancel</button><button onClick={confirmToggle} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 font-bold text-white">Confirm</button></div>}><p className="text-sm text-slate-600">{toggleTarget?.isActive?"Retire":"Reactivate"} this {toggleTarget?.label}?</p></Modal>
 </PageFrame></AppShell>;
}

function SavedList({title,count,addLabel,onAdd,children}:{title:string;count:number;addLabel?:string;onAdd?:()=>void;children:React.ReactNode}){
 return <Surface className="overflow-hidden"><PanelHeader title={title} description={count+" saved"} action={addLabel&&onAdd?<button onClick={onAdd} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">+ {addLabel}</button>:undefined}/><div className="space-y-2 p-3">{children}</div></Surface>;
}
function SavedItem({title,detail,active,onEdit,onToggle}:{title:string;detail:string;active:boolean;onEdit:()=>void;onToggle:()=>void}){
 return <div className={!active?"rounded-xl bg-slate-50 p-3 opacity-60":"rounded-xl bg-slate-50 p-3"}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{title}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{detail}</p></div><StatusBadge tone={active?"emerald":"slate"}>{active?"Active":"Inactive"}</StatusBadge></div><div className="mt-2 flex gap-2"><button onClick={onEdit} className="text-xs font-bold text-indigo-600">Edit</button><button onClick={onToggle} className="text-xs font-bold text-slate-400">{active?"Retire":"Reactivate"}</button></div></div>;
}
