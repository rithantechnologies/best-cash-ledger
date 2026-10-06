"use client";
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { moneyStatus, moneyStatusOptions } from "@/lib/money-status";
import { SearchSelect } from "@/components/search-select";

type Card={id:string;bankName:string;cardType:string|null;lastFourDigits:string;nickname:string|null;isActive:boolean};
type Bank={id:string;accountHolderName:string;bankName:string;accountReference:string;ifsc:string|null;isActive:boolean};
type Upi={id:string;accountName:string;upiId:string|null;mobileNumber:string|null;providerName:string|null;isActive:boolean};
type BAccount={id:string;accountType:string;bankName:string|null;accountReference:string|null;ifsc:string|null;upiId:string|null;mobileNumber:string|null;isActive:boolean};
type Beneficiary={id:string;beneficiaryName:string;relationshipNote:string|null;notes:string|null;isActive:boolean;accounts:BAccount[]};
type Customer={
 id:string;customerCode:string;customerType:string;fullName:string;mobile:string|null;notes:string|null;isActive:boolean;
 cards:Card[];bankAccounts:Bank[];upiAccounts:Upi[];beneficiaries:Beneficiary[];
 transactions:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;payable:{status:string;dueAt:string;remainingAmount:string}|null;receivableSource:{status:string;dueAt:string|null;remainingAmount:string}|null}[];
 payables:{id:string;remainingAmount:string;dueAt:string;status:string}[];
 receivables:{id:string;reason:string;remainingAmount:string;receivedAmount:string;originalAmount:string;dueAt:string|null;status:string}[];
};
type CardLedgerCard={id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean;label:string};
type CardLedgerRow={id:string;at:string;kind:"CARD_SWIPE"|"CUSTOMER_PAYOUT"|"CARD_DUE_PAYMENT"|"CARD_DUE_RECOVERY";remarks:string;detail:string;debit:number;credit:number;closingBalance:number;cardId:string;cardLabel:string;transactionId:string;transactionNumber:string;referenceNumber:string|null};
type CardLedger={customer:{id:string;fullName:string;mobile:string|null};cards:CardLedgerCard[];selectedCardId:string|null;totals:{debit:number;credit:number;balance:number;position:"TO_PAY_CUSTOMER"|"TO_RECOVER_FROM_CUSTOMER"|"SETTLED"};rows:CardLedgerRow[]};
type EditState={kind:"card";item:Card}|{kind:"bank";item:Bank}|{kind:"upi";item:Upi}|{kind:"beneficiary";item:Beneficiary}|{kind:"beneficiaryAccount";item:BAccount}|null;
type AddKind="bank"|"upi"|"beneficiary"|"beneficiaryAccount"|null;
type ToggleTarget={path:string;isActive:boolean;label:string}|null;
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]??ch));

export default function CustomerDetailPage(){
 const {id}=useParams<{id:string}>();
 const [c,setC]=useState<Customer|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [txStatusFilter,setTxStatusFilter]=useState(""),[moneyStatusFilter,setMoneyStatusFilter]=useState("");
 const [cardLedger,setCardLedger]=useState<CardLedger|null>(null),[ledgerCardId,setLedgerCardId]=useState(""),[ledgerLoading,setLedgerLoading]=useState(true),[ledgerError,setLedgerError]=useState("");
 const [addKind,setAddKind]=useState<AddKind>(null),[toggleTarget,setToggleTarget]=useState<ToggleTarget>(null);
 const [bankName,setBankName]=useState(""),[holder,setHolder]=useState(""),[accountRef,setAccountRef]=useState(""),[ifsc,setIfsc]=useState("");
 const [upiName,setUpiName]=useState(""),[upiId,setUpiId]=useState(""),[upiMobile,setUpiMobile]=useState(""),[upiProvider,setUpiProvider]=useState("");
 const [beneficiaryName,setBeneficiaryName]=useState(""),[relationship,setRelationship]=useState("");
 const [beneficiaryId,setBeneficiaryId]=useState(""),[bType,setBType]=useState("BANK"),[bBank,setBBank]=useState(""),[bRef,setBRef]=useState(""),[bIfsc,setBIfsc]=useState(""),[bUpi,setBUpi]=useState(""),[bMobile,setBMobile]=useState("");
 const [edit,setEdit]=useState<EditState>(null),[e1,setE1]=useState(""),[e2,setE2]=useState(""),[e3,setE3]=useState(""),[e4,setE4]=useState(""),[e5,setE5]=useState("");
 const control="app-control";

 const load=()=>apiFetch<Customer>("/customers/"+id).then(setC);
 const loadCardLedger=(cardId=ledgerCardId)=>{setLedgerLoading(true);setLedgerError("");return apiFetch<CardLedger>("/customers/"+id+"/card-ledger"+(cardId?"?cardId="+encodeURIComponent(cardId):"")).then(setCardLedger).catch(e=>setLedgerError(e instanceof Error?e.message:"Failed to load card ledger")).finally(()=>setLedgerLoading(false));};
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Failed to load customer"));},[id]);
 useEffect(()=>{loadCardLedger(ledgerCardId);},[id,ledgerCardId]);

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
  if(next.kind==="card"){setE1(next.item.bankName);setE2(next.item.lastFourDigits);setE3("CREDIT");setE4(next.item.nickname||"");setE5("");}
  if(next.kind==="bank"){setE1(next.item.accountHolderName);setE2(next.item.bankName);setE3(next.item.accountReference);setE4(next.item.ifsc||"");setE5("");}
  if(next.kind==="upi"){setE1(next.item.accountName);setE2(next.item.upiId||"");setE3(next.item.mobileNumber||"");setE4(next.item.providerName||"");setE5("");}
  if(next.kind==="beneficiary"){setE1(next.item.beneficiaryName);setE2(next.item.relationshipNote||"");setE3(next.item.notes||"");setE4("");setE5("");}
  if(next.kind==="beneficiaryAccount"){setE1(next.item.accountType);setE2(next.item.bankName||"");setE3(next.item.accountReference||"");setE4(next.item.upiId||"");setE5(next.item.ifsc||"");}
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!edit)return;
  try{
   if(edit.kind==="card"){if(!/^\d{4}$/.test(e2))throw new Error("Card last four digits must contain exactly 4 digits");await run(()=>apiFetch("/customers/cards/"+edit.item.id,{method:"PATCH",body:JSON.stringify({bankName:e1.trim(),lastFourDigits:e2,cardType:"CREDIT",nickname:e4.trim()||undefined})}),"Card updated.");}
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
 const primaryCard=c.cards.find(x=>x.isActive);
 const customerParam="customerId="+encodeURIComponent(c.id);
 const visibleTransactions=c.transactions.filter(t=>(!txStatusFilter||t.status===txStatusFilter)&&(!moneyStatusFilter||moneyStatus(t)?.key===moneyStatusFilter));
 const ledgerPositionLabel=cardLedger?.totals.position==="TO_PAY_CUSTOMER"?"Pay to customer":cardLedger?.totals.position==="TO_RECOVER_FROM_CUSTOMER"?"Customer to pay us":"Settled";
 const ledgerCardLabel=ledgerCardId?(cardLedger?.cards.find(card=>card.id===ledgerCardId)?.label??"Selected card"):"All cards";
 function printCardLedger(){
  if(!cardLedger||!cardLedger.rows.length)return;
  const popup=window.open("","_blank","width=980,height=760");
  if(!popup)return;
  popup.opener=null;
  const rows=cardLedger.rows.map((row,index)=>"<tr><td>"+(index+1)+"</td><td>"+escapeHtml(new Date(row.at).toLocaleString("en-IN"))+"</td><td><b>"+escapeHtml(row.remarks)+"</b><small>"+escapeHtml(row.detail)+"<br>"+escapeHtml(row.transactionNumber)+(row.referenceNumber?" · Ref "+escapeHtml(row.referenceNumber):"")+"</small></td><td class='out'>"+(row.debit?escapeHtml(money(row.debit)):"—")+"</td><td class='in'>"+(row.credit?escapeHtml(money(row.credit)):"—")+"</td><td class='"+(row.closingBalance<0?"out":"in")+"'>"+escapeHtml(money(row.closingBalance))+"</td></tr>").join("");
  popup.document.write("<!doctype html><html><head><title>Card Ledger - "+escapeHtml(cardLedger.customer.fullName)+"</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{color:#087f7f;margin:0;font-size:22px}.sub{font-size:11px;margin-top:5px}.meta{margin:24px 0 12px;font-size:14px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.box{border:1px solid #cbd5e1;padding:9px}.box small{display:block;color:#64748b}.box b{font-size:16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;vertical-align:top}th{background:#ecfeff;color:#075985}td:nth-child(1){text-align:center;width:28px}td:nth-child(2){white-space:nowrap;width:110px}td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:right;white-space:nowrap;font-weight:700}small{display:block;color:#64748b;margin-top:3px;line-height:1.35}.out{color:#dc2626}.in{color:#15803d}.footer{margin-top:14px;border-top:2px solid #111;padding-top:8px;text-align:right;font-size:14px;font-weight:700}</style></head><body><h1>Customer Card Ledger</h1><div class='sub'>Card swipe, partial payout and card-due running statement</div><div class='meta'><b>Name:</b> "+escapeHtml(cardLedger.customer.fullName)+"<br><b>Card:</b> "+escapeHtml(ledgerCardLabel)+"</div><div class='summary'><div class='box'><small>Total Debit (Out)</small><b class='out'>"+escapeHtml(money(cardLedger.totals.debit))+"</b></div><div class='box'><small>Total Credit (In)</small><b class='in'>"+escapeHtml(money(cardLedger.totals.credit))+"</b></div><div class='box'><small>Closing Balance</small><b class='"+(cardLedger.totals.balance<0?"out":cardLedger.totals.balance>0?"in":"")+"'>"+escapeHtml(money(cardLedger.totals.balance))+"</b><small class='"+(cardLedger.totals.balance<0?"out":cardLedger.totals.balance>0?"in":"")+"'>"+escapeHtml(ledgerPositionLabel)+"</small></div></div><table><thead><tr><th>No</th><th>Date</th><th>Remarks</th><th>Debit (Out)</th><th>Credit (In)</th><th>Cls Balance</th></tr></thead><tbody>"+rows+"</tbody></table><div class='footer "+(cardLedger.totals.balance<0?"out":cardLedger.totals.balance>0?"in":"")+"'>"+escapeHtml(ledgerPositionLabel)+" ₹ "+Math.abs(cardLedger.totals.balance).toLocaleString("en-IN",{maximumFractionDigits:2})+"</div></body></html>");
  popup.document.close();
  popup.focus();
  window.setTimeout(()=>popup.print(),250);
 }
 return <AppShell><PageFrame>
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div><Link href="/customers" className="text-xs font-bold text-indigo-600">← Customers</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{c.customerCode} · {c.customerType.replaceAll("_"," ")}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{c.fullName}</h2><p className="mt-1 text-sm text-slate-500">{c.mobile||"No mobile"}{c.notes?" · "+c.notes:""}</p></div>
   <StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}

  {c.isActive?<div className="flex gap-2 overflow-x-auto pb-1">
   <Link href={"/transactions/card-swipe?"+customerParam+(primaryCard?"&cardId="+encodeURIComponent(primaryCard.id):"")} className="min-h-10 shrink-0 rounded-lg bg-[var(--text)] px-4 py-2.5 text-xs font-semibold text-[var(--surface)]">Card swipe</Link>
   <Link href={"/transactions/cash-transfer?"+customerParam} className="min-h-10 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs font-semibold">Cash transfer</Link>
   <Link href={"/transactions/aeps?"+customerParam} className="min-h-10 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs font-semibold">AePS</Link>
   <Link href={"/transactions/micro-atm?"+customerParam+(primaryCard?"&cardLastFour="+encodeURIComponent(primaryCard.lastFourDigits):"")} className="min-h-10 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs font-semibold">Micro ATM</Link>
  </div>:null}

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
   <DetailStat label="To receive" value={money(openReceivable)} tone="emerald"/>
   <DetailStat label="To pay" value={money(openPayable)} tone="amber"/>
   <DetailStat label="Saved cards" value={c.cards.filter(x=>x.isActive).length} tone="indigo"/>
   <DetailStat label="Recipients" value={c.beneficiaries.filter(x=>x.isActive).length} tone="cyan"/>
  </div>

  <Surface className="overflow-hidden">
   <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <div><h3 className="text-sm font-black">Card Ledger</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Card swipes, partial payouts and card-due movements in one running customer balance.</p></div>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
     <SearchableSelect className="app-control min-w-[190px]" value={ledgerCardId} onChange={e=>setLedgerCardId(e.target.value)}><option value="">All cards</option>{c.cards.map(card=><option key={card.id} value={card.id}>{card.bankName+" •••• "+card.lastFourDigits+(card.nickname?" · "+card.nickname:"")}</option>)}</SearchableSelect>
     <button type="button" onClick={printCardLedger} disabled={!cardLedger?.rows.length} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-black disabled:opacity-40">Print statement</button>
    </div>
   </div>
   {ledgerError?<div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{ledgerError}</div>:null}
   {ledgerLoading?<div className="p-5 text-sm font-semibold text-[var(--text-muted)]">Loading card ledger…</div>:cardLedger?.rows.length?<>
    <div className="grid grid-cols-1 gap-2 border-b border-[var(--border)] p-3 sm:grid-cols-3 sm:p-4">
     <div className="rounded-xl bg-rose-50 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Total Debit · Out</p><p className="money mt-1 text-lg font-black text-rose-700">{money(cardLedger.totals.debit)}</p></div>
     <div className="rounded-xl bg-emerald-50 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Total Credit · In</p><p className="money mt-1 text-lg font-black text-emerald-700">{money(cardLedger.totals.credit)}</p></div>
     <div className={"rounded-xl px-3 py-2.5 "+(cardLedger.totals.balance<0?"bg-rose-50":cardLedger.totals.balance>0?"bg-emerald-50":"bg-[var(--surface-soft)]")}><p className={"text-[10px] font-bold uppercase tracking-wide "+(cardLedger.totals.balance<0?"text-rose-600":cardLedger.totals.balance>0?"text-emerald-700":"text-[var(--text-muted)]")}>Closing Balance</p><p className={"money mt-1 text-lg font-black "+(cardLedger.totals.balance<0?"text-rose-700":cardLedger.totals.balance>0?"text-emerald-700":"")}>{money(cardLedger.totals.balance)}</p><p className={"mt-0.5 text-[10px] font-black "+(cardLedger.totals.balance<0?"text-rose-700":cardLedger.totals.balance>0?"text-emerald-700":"text-[var(--text-muted)]")}>{ledgerPositionLabel}</p></div>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-[10px] font-black"><span className="text-[var(--text-muted)]">Closing balance:</span><span className="text-emerald-700">● Green = Pay to customer</span><span className="text-rose-700">● Red = Customer to pay us</span><span className="text-[var(--text-muted)]">● Zero = Settled</span></div>
    <div className="divide-y divide-[var(--border)] md:hidden">{cardLedger.rows.map(row=><Link key={row.id} href={"/transactions/"+row.transactionId} className="block p-3.5 hover:bg-[var(--surface-soft)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black">{row.remarks}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{new Date(row.at).toLocaleString("en-IN")} · {row.transactionNumber}</p><p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{row.detail}</p></div><div className="shrink-0 text-right">{row.debit?<p className="money text-sm font-black text-rose-600">−{money(row.debit)}</p>:null}{row.credit?<p className="money text-sm font-black text-emerald-700">+{money(row.credit)}</p>:null}<p className={"money mt-1 text-[10px] font-bold "+(row.closingBalance<0?"text-rose-600":row.closingBalance>0?"text-emerald-700":"text-[var(--text-muted)]")}>Bal {money(row.closingBalance)}</p></div></div></Link>)}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-xs"><thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="w-12 px-4 py-3 text-center">No</th><th className="w-36">Date</th><th>Remarks</th><th className="w-32 text-right text-rose-600">Debit (Out)</th><th className="w-32 text-right text-emerald-700">Credit (In)</th><th className="w-32 pr-4 text-right">Cls Balance</th></tr></thead><tbody>{cardLedger.rows.map((row,index)=><tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-soft)]"><td className="px-4 py-3 text-center text-[var(--text-muted)]">{index+1}</td><td className="whitespace-nowrap text-[11px] text-[var(--text-muted)]"><p>{new Date(row.at).toLocaleDateString("en-IN")}</p><p>{new Date(row.at).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p></td><td className="py-3"><Link href={"/transactions/"+row.transactionId} className="font-black text-[var(--text)] hover:text-[var(--accent)]">{row.remarks}</Link><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{row.detail}</p><p className="mt-0.5 text-[9px] text-[var(--text-muted)]">{row.transactionNumber}{row.referenceNumber?" · Ref "+row.referenceNumber:""}</p></td><td className="money text-right font-black text-rose-600">{row.debit?money(row.debit):"—"}</td><td className="money text-right font-black text-emerald-700">{row.credit?money(row.credit):"—"}</td><td className={"money pr-4 text-right font-black "+(row.closingBalance<0?"text-rose-600":row.closingBalance>0?"text-emerald-700":"")}>{money(row.closingBalance)}</td></tr>)}</tbody></table></div>
   </>:<div className="p-4"><EmptyState title="No card ledger activity" description="Card swipes, payouts and card-due movements will appear here automatically."/></div>}
  </Surface>

  <Surface className="overflow-hidden">
   <PanelHeader title="Recent transactions" description={visibleTransactions.length+" of "+c.transactions.length+" recent transaction(s)"} action={<Link href={"/search?q="+encodeURIComponent(c.customerCode)} className="text-xs font-bold text-indigo-600">Search all →</Link>}/>
   <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2">
    <SearchableSelect className={control} value={txStatusFilter} onChange={e=>setTxStatusFilter(e.target.value)}><option value="">All transaction status</option>{["COMPLETED","PENDING","FAILED","CANCELLED","REVERSED"].map(x=><option key={x}>{x.replaceAll("_"," ")}</option>)}</SearchableSelect>
    <SearchableSelect className={control} value={moneyStatusFilter} onChange={e=>setMoneyStatusFilter(e.target.value)}><option value="">All payout / pay-in</option>{moneyStatusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</SearchableSelect>
   </div>
   {visibleTransactions.length?<><div className="space-y-2 p-3 md:hidden">{visibleTransactions.map(t=>{const ms=moneyStatus(t);return <Link key={t.id} href={"/transactions/"+t.id} className="block rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{t.transactionType.replaceAll("_"," ")} · {t.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(t.transactionAt).toLocaleString("en-IN")}</p></div><strong className="shrink-0 text-sm">{money(t.grossAmount)}</strong></div><div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge tone={t.status==="COMPLETED"?"emerald":t.status==="REVERSED"?"rose":"amber"}>{t.status.replaceAll("_"," ")}</StatusBadge>{ms?<StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>:null}{ms?.dueAt?<span className="px-2 py-1 text-[10px] text-slate-400">Due {new Date(ms.dueAt).toLocaleDateString("en-IN")}</span>:null}</div></Link>})}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Transaction</th><th>Date</th><th className="text-right">Amount</th><th>Transaction status</th><th>Payout / Pay-in</th><th className="pr-5">Due date</th></tr></thead><tbody>{visibleTransactions.map(t=>{const ms=moneyStatus(t);return <tr key={t.id} className="border-t border-slate-100"><td className="px-5 py-3"><Link href={"/transactions/"+t.id} className="font-semibold text-indigo-600">{t.transactionType.replaceAll("_"," ")} · {t.transactionNumber}</Link></td><td className="text-xs text-slate-500">{new Date(t.transactionAt).toLocaleString("en-IN")}</td><td className="text-right font-semibold">{money(t.grossAmount)}</td><td><StatusBadge tone={t.status==="COMPLETED"?"emerald":t.status==="REVERSED"?"rose":"amber"}>{t.status.replaceAll("_"," ")}</StatusBadge></td><td>{ms?<StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>:<span className="text-slate-400">—</span>}</td><td className="pr-5 text-xs text-slate-500">{ms?.dueAt?new Date(ms.dueAt).toLocaleDateString("en-IN"):"—"}</td></tr>})}</tbody></table></div></>:<div className="p-4"><EmptyState title="No matching transactions"/></div>}
  </Surface>
  <div className="grid gap-4 lg:grid-cols-2">
   <Surface className="overflow-hidden"><PanelHeader title="Money to receive" description="Open and recent receivables." action={<Link href="/receivables" className="text-xs font-bold text-indigo-600">View all →</Link>}/><div className="divide-y divide-slate-100">{c.receivables.slice(0,5).map(x=><Link key={x.id} href={"/receivables/"+x.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{x.reason}</p><p className="text-[11px] text-slate-400">{x.status.replaceAll("_"," ")}{x.dueAt?" · "+new Date(x.dueAt).toLocaleDateString("en-IN"):""}</p></div><strong className="text-sm text-emerald-700">{money(x.remainingAmount)}</strong></Link>)}{!c.receivables.length?<div className="p-4"><EmptyState title="No receivables"/></div>:null}</div></Surface>
   <Surface className="overflow-hidden"><PanelHeader title="Money to pay" description="Open and recent customer payables." action={<Link href="/payables" className="text-xs font-bold text-indigo-600">View all →</Link>}/><div className="divide-y divide-slate-100">{c.payables.slice(0,5).map(x=><Link key={x.id} href={"/payables/"+x.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"><div><p className="text-sm font-semibold">{x.status.replaceAll("_"," ")}</p><p className="text-[11px] text-slate-400">Due {new Date(x.dueAt).toLocaleDateString("en-IN")}</p></div><strong className="text-sm text-amber-700">{money(x.remainingAmount)}</strong></Link>)}{!c.payables.length?<div className="p-4"><EmptyState title="No payables"/></div>:null}</div></Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-3">
   <SavedList title="Saved cards" count={c.cards.length} addLabel={undefined}>{c.cards.length?c.cards.map(x=><SavedItem key={x.id} title={x.bankName+" •••• "+x.lastFourDigits} detail={(x.nickname?x.nickname+" · ":"")+"CREDIT · "+(x.isActive?"Active":"Inactive")} active={x.isActive} onEdit={()=>beginEdit({kind:"card",item:x})} onToggle={()=>setToggleTarget({path:"/customers/cards/"+x.id,isActive:x.isActive,label:"card"})}/>):<EmptyState title="No saved cards"/>}</SavedList>
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
  <Modal open={addKind==="bank"} title="Add bank account" description="Save a beneficiary or customer bank destination for faster future transfers." onClose={()=>setAddKind(null)} footer={<button form="add-bank" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save bank account</button>}>
   <form id="add-bank" onSubmit={addBank} className="grid gap-3 sm:grid-cols-2"><Field label="Account holder"><input className={control} value={holder} onChange={e=>setHolder(e.target.value)} required/></Field><Field label="Bank name"><input className={control} value={bankName} onChange={e=>setBankName(e.target.value)} required/></Field><Field label="Account number / reference"><input className={control} value={accountRef} onChange={e=>setAccountRef(e.target.value)} required/></Field><Field label="IFSC"><input className={control} value={ifsc} onChange={e=>setIfsc(e.target.value)}/></Field></form>
  </Modal>
  <Modal open={addKind==="upi"} title="Add UPI account" description="Save a UPI destination for quick counter transactions." onClose={()=>setAddKind(null)} footer={<button form="add-upi" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save UPI account</button>}>
   <form id="add-upi" onSubmit={addUpi} className="grid gap-3 sm:grid-cols-2"><Field label="Account name"><input className={control} value={upiName} onChange={e=>setUpiName(e.target.value)} required/></Field><Field label="UPI ID"><input className={control} value={upiId} onChange={e=>setUpiId(e.target.value)}/></Field><Field label="Mobile"><input className={control} value={upiMobile} onChange={e=>setUpiMobile(e.target.value)}/></Field><Field label="Provider"><input className={control} value={upiProvider} onChange={e=>setUpiProvider(e.target.value)} placeholder="GPay / PhonePe / etc."/></Field></form>
  </Modal>
  <Modal open={addKind==="beneficiary"} title="Add beneficiary" description="Save a regular recipient or family member." onClose={()=>setAddKind(null)} footer={<button form="add-beneficiary" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save beneficiary</button>}>
   <form id="add-beneficiary" onSubmit={addBeneficiary} className="grid gap-3 sm:grid-cols-2"><Field label="Beneficiary name"><input className={control} value={beneficiaryName} onChange={e=>setBeneficiaryName(e.target.value)} required/></Field><Field label="Relationship"><input className={control} value={relationship} onChange={e=>setRelationship(e.target.value)} placeholder="Optional"/></Field></form>
  </Modal>
  <Modal open={addKind==="beneficiaryAccount"} title="Add recipient account" description="Attach a bank or UPI destination to a saved beneficiary." onClose={()=>setAddKind(null)} footer={<button form="add-beneficiary-account" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save recipient account</button>}>
   <form id="add-beneficiary-account" onSubmit={addBeneficiaryAccount} className="grid gap-3 sm:grid-cols-2"><Field label="Beneficiary"><SearchSelect value={beneficiaryId} onChange={setBeneficiaryId} options={c.beneficiaries.filter(b=>b.isActive).map(b=>({value:b.id,label:b.beneficiaryName,searchText:b.beneficiaryName}))} placeholder="Select beneficiary" searchPlaceholder="Search beneficiary…"/></Field><Field label="Account type"><SearchableSelect className={control} value={bType} onChange={e=>setBType(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></SearchableSelect></Field>{bType==="BANK"?<><Field label="Bank"><input className={control} value={bBank} onChange={e=>setBBank(e.target.value)} required/></Field><Field label="Account reference"><input className={control} value={bRef} onChange={e=>setBRef(e.target.value)} required/></Field><Field label="IFSC" className="sm:col-span-2"><input className={control} value={bIfsc} onChange={e=>setBIfsc(e.target.value)}/></Field></>:<><Field label="UPI ID"><input className={control} value={bUpi} onChange={e=>setBUpi(e.target.value)} required/></Field><Field label="Mobile"><input className={control} value={bMobile} onChange={e=>setBMobile(e.target.value)}/></Field></>}</form>
  </Modal>
  <Modal open={!!edit} title={edit?"Edit "+edit.kind.replace("beneficiaryAccount","recipient account"):"Edit saved detail"} description="Update saved details without changing historical transactions." onClose={()=>setEdit(null)} footer={<button form="edit-saved-detail" disabled={busy} className="min-h-11 w-full rounded-xl bg-indigo-700 font-bold text-white">Save changes</button>}>
   <form id="edit-saved-detail" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
    {edit?.kind==="card"?<><Field label="Bank"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="Last 4"><input className={control} value={e2} onChange={e=>setE2(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} required/></Field><Field label="Type"><div className={control+" flex items-center bg-slate-50 font-bold"}>CREDIT</div></Field><Field label="Nickname"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {edit?.kind==="bank"?<><Field label="Account holder"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="Bank"><input className={control} value={e2} onChange={e=>setE2(e.target.value)} required/></Field><Field label="Account reference"><input className={control} value={e3} onChange={e=>setE3(e.target.value)} required/></Field><Field label="IFSC"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {edit?.kind==="upi"?<><Field label="Account name"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="UPI ID"><input className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Mobile"><input className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field><Field label="Provider"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {edit?.kind==="beneficiary"?<><Field label="Name"><input className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="Relationship"><input className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Notes" className="sm:col-span-2"><input className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field></>:null}
    {edit?.kind==="beneficiaryAccount"?<><Field label="Type"><SearchableSelect className={control} value={e1} onChange={e=>setE1(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></SearchableSelect></Field><Field label="Bank"><input className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Account reference"><input className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field><Field label="UPI ID"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field><Field label="IFSC" className="sm:col-span-2"><input className={control} value={e5} onChange={e=>setE5(e.target.value)}/></Field></>:null}
   </form>
  </Modal>
  <Modal open={!!toggleTarget} title={toggleTarget?.isActive?"Retire saved detail?":"Reactivate saved detail?"} description="Historical transactions are never removed." onClose={()=>setToggleTarget(null)} footer={<div className="grid grid-cols-2 gap-2"><button onClick={()=>setToggleTarget(null)} className="app-secondary-button min-h-11 font-bold">Cancel</button><button onClick={confirmToggle} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 font-bold text-white">Confirm</button></div>}><p className="text-sm text-slate-600">{toggleTarget?.isActive?"Retire":"Reactivate"} this {toggleTarget?.label}?</p></Modal>
 </PageFrame></AppShell>;
}

function SavedList({title,count,addLabel,onAdd,children}:{title:string;count:number;addLabel?:string;onAdd?:()=>void;children:React.ReactNode}){
 return <Surface className="overflow-hidden"><PanelHeader title={title} description={count+" saved"} action={addLabel&&onAdd?<button onClick={onAdd} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">+ {addLabel}</button>:undefined}/><div className="space-y-2 p-3">{children}</div></Surface>;
}
function SavedItem({title,detail,active,onEdit,onToggle}:{title:string;detail:string;active:boolean;onEdit:()=>void;onToggle:()=>void}){
 return <div className={!active?"rounded-xl bg-slate-50 p-3 opacity-60":"rounded-xl bg-slate-50 p-3"}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{title}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{detail}</p></div><StatusBadge tone={active?"emerald":"slate"}>{active?"Active":"Inactive"}</StatusBadge></div><div className="mt-2 flex gap-2"><button onClick={onEdit} className="text-xs font-bold text-indigo-600">Edit</button><button onClick={onToggle} className="text-xs font-bold text-slate-400">{active?"Retire":"Reactivate"}</button></div></div>;
}
