"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Modal, Field } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";

type Account={id:string;accountName:string;accountType?:string;isActive?:boolean};
type Card={id:string;bankName:string;lastFourDigits:string;isActive:boolean};
type Customer={id:string;fullName:string;mobile:string|null;cards?:Card[]};
type Paged={items:Customer[]};
export type EditableCustomerLedger={
  direction:"PAY_IN"|"PAY_OUT";amount:string;receivableAmount:string;payableAmount:string;
  remarks:string;financialAccount:Account;customerCard:{id:string;bankName:string;lastFourDigits:string}|null;
  payoutDestination:{type:string;label:string;destinationId?:string}|null;
  allocations:{targetType:string;amount:string}[];
};
export type EditableCustomerTransaction={
  id:string;transactionNumber:string;transactionAt:string;referenceNumber:string|null;notes:string|null;
  customer:Customer|null;customerLedgerEntry:EditableCustomerLedger|null;
};

const asMoney=(n:number)=>Math.round(n*100)/100;
const localDate=(value:string)=>{
  const date=new Date(value);
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
};

export function CustomerLedgerEditor({open,onClose,onSaved,transaction}:{
  open:boolean;onClose:()=>void;onSaved:()=>void;transaction:EditableCustomerTransaction;
}){
 const detail=transaction.customerLedgerEntry!;
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [cards,setCards]=useState<Card[]>([]);
 const [customerSearch,setCustomerSearch]=useState(transaction.customer?.fullName||"");
 const [customerId,setCustomerId]=useState(transaction.customer?.id||"");
 const [matches,setMatches]=useState<Customer[]>([]);
 const [direction,setDirection]=useState<"PAY_IN"|"PAY_OUT">(detail.direction);
 const [amount,setAmount]=useState(detail.amount);
 const [receivable,setReceivable]=useState(detail.receivableAmount);
 const [payable,setPayable]=useState(detail.payableAmount);
 const [accountId,setAccountId]=useState(detail.financialAccount.id);
 const [cardId,setCardId]=useState(detail.customerCard?.id||"");
 const [at,setAt]=useState(localDate(transaction.transactionAt));
 const [remarks,setRemarks]=useState(detail.remarks);
 const [reference,setReference]=useState(transaction.referenceNumber||"");
 const [notes,setNotes]=useState(transaction.notes||"");
 const [recipient,setRecipient]=useState(detail.payoutDestination?.type==="OTHER"?detail.payoutDestination.label:"");
 const [confirmedCash,setConfirmedCash]=useState(false);
 const [reason,setReason]=useState("");
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const allocated=detail.allocations.reduce((sum,x)=>sum+Number(x.amount),0);
 const locked=detail.allocations.length>0;
 useEffect(()=>{
   if(!open)return;
   let active=true;
   apiFetch<Account[]>("/dashboard/accounts").then(rows=>{if(active)setAccounts(rows.filter(a=>
    a.isActive!==false&&["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType||"")));
   }).catch(()=>{if(active)setError("Unable to load accounts")});
   if(customerId)apiFetch<Customer>("/customers/"+customerId).then(c=>{if(active)setCards(c.cards||[])})
    .catch(()=>{if(active)setCards([])});
   return ()=>{active=false};
 },[open]);
 useEffect(()=>{
   if(!open||customerSearch.trim().length<2||customerSearch.trim()===transaction.customer?.fullName)return;
   let active=true;
   const timer=setTimeout(()=>{
    apiFetch<Paged>("/customers?q="+encodeURIComponent(customerSearch.trim())+"&pageSize=12")
      .then(r=>{if(active)setMatches(r.items||[])})
      .catch(()=>{if(active)setMatches([])});
   },200);
   return ()=>{active=false;clearTimeout(timer)};
 },[open,customerSearch,transaction.customer?.fullName]);
 function chooseCustomer(customer:Customer){
   setCustomerId(customer.id);setCustomerSearch(customer.fullName);setMatches([]);setCardId("");
   apiFetch<Customer>("/customers/"+customer.id).then(c=>setCards(c.cards||[])).catch(()=>setCards([]));
 }
 function changeAmount(next:string){
   setAmount(next);
   const value=Number(next);
   if(!Number.isFinite(value)||value<0)return;
   const oldAmount=Number(detail.amount);
   const previousReceivable=Number(detail.receivableAmount);
   const newReceivable=oldAmount>0?asMoney(value*previousReceivable/oldAmount):0;
   setReceivable(String(newReceivable));
   setPayable(String(asMoney(value-newReceivable)));
 }
 function changeReceivable(next:string){
   setReceivable(next);
   if(Number.isFinite(Number(next)))setPayable(String(asMoney(Number(amount||0)-Number(next))));
 }
 function changePayable(next:string){
   setPayable(next);
   if(Number.isFinite(Number(next)))setReceivable(String(asMoney(Number(amount||0)-Number(next))));
 }
 async function save(event:FormEvent){
   event.preventDefault();setError("");
   if(!customerId){setError("Choose a customer from the search results");return;}
   if(!Number.isFinite(Number(amount))||Number(amount)<=0||
      Number(receivable)<0||Number(payable)<0||
      Math.abs(asMoney(Number(receivable)+Number(payable))-Number(amount))>.001){
      setError("Receivable and payable portions must add up to the full amount");return;
   }
   if(locked&&(Number(amount)!==Number(detail.amount)||direction!==detail.direction||
     customerId!==transaction.customer?.id||cardId!==(detail.customerCard?.id||"")||
     accountId!==detail.financialAccount.id||
     Number(receivable)!==Number(detail.receivableAmount)||
     Number(payable)!==Number(detail.payableAmount))){
      setError("This entry has matched dues. Reverse those matches before changing the amount, account, customer, direction, card or balance split.");return;
   }
   if(!accountId||reason.trim().length<3){setError("Choose an account and enter an editing reason");return;}
   setLoading(true);
   try{
      await apiFetch("/transactions/"+transaction.id+"/customer-ledger",{method:"PATCH",body:JSON.stringify({
        customerId,customerCardId:cardId||null,direction,amount:Number(amount),
        receivableAmount:Number(receivable),payableAmount:Number(payable),
        financialAccountId:accountId,physicalCashConfirmed:confirmedCash,
        transactionAt:new Date(at).toISOString(),remarks:remarks.trim(),
        referenceNumber:reference.trim()||null,notes:notes.trim()||null,
        payoutDestinationDetails:recipient.trim()||null,reason:reason.trim(),
      })});
      onSaved();
   }catch(err){setError(err instanceof Error?err.message:"Could not save transaction corrections")}
   finally{setLoading(false)}
 }
 const control="app-control w-full min-h-11";
 const hasCash=[accounts.find(a=>a.id===accountId)?.accountType,detail.financialAccount.accountType].includes("CASH");
 return <Modal open={open} title={"Edit all Pay In / Pay Out fields"}
  description={"Changes to "+transaction.transactionNumber+" update its account and customer ledgers together. The original creation timestamp and before/after audit remain saved."}
  onClose={()=>{if(!loading)onClose()}}
  footer={<div className="grid grid-cols-2 gap-2"><button type="button" disabled={loading} className="app-secondary-button min-h-11" onClick={onClose}>Cancel</button>
   <button type="submit" form="customer-ledger-full-edit" disabled={loading||reason.trim().length<3} className="app-primary-button min-h-11 disabled:opacity-40">{loading?"Saving…":"Save all changes"}</button></div>}>
  <form id="customer-ledger-full-edit" className="space-y-4" onSubmit={save}>
   {locked?<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
    This payment has ₹{allocated.toLocaleString("en-IN")} matched to dues. You can correct descriptions, reference, recipient and date, but must reverse the matched entries before changing financial amounts or the card/customer.
   </div>:null}
   {error?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
   <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Transaction type"><SearchableSelect className={control} value={direction} disabled={locked} onChange={e=>setDirection(e.target.value as "PAY_IN"|"PAY_OUT")}>
     <option value="PAY_IN">PAY IN — RECEIVED</option><option value="PAY_OUT">PAY OUT — PAID</option></SearchableSelect></Field>
    <Field label="Amount (₹)"><input className={control} inputMode="decimal" type="number" min=".01" step=".01" value={amount} disabled={locked} onChange={e=>changeAmount(e.target.value)} required/></Field>
    <Field label={direction==="PAY_IN"?"Received in account":"Paid from account"}>
     <SearchableSelect className={control} value={accountId} disabled={locked} onChange={e=>{setAccountId(e.target.value);setConfirmedCash(false)}}>
       <option value="">Choose account</option>
       {accounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {(a.accountType||"").replaceAll("_"," ")}</option>)}
     </SearchableSelect>
    </Field>
    <Field label="Transaction date & time"><input type="datetime-local" className={control} value={at} onChange={e=>setAt(e.target.value)} required/></Field>
   </div>
   <Field label="Customer (search name/mobile)"><input className={control} value={customerSearch}
    disabled={locked} onChange={e=>{setCustomerSearch(e.target.value);setCustomerId("");setMatches([])}} placeholder="Find saved customer" required/>
    {matches.length?<div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
     {matches.map(c=><button key={c.id} type="button" onClick={()=>chooseCustomer(c)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-soft)]">
      <strong>{c.fullName}</strong><span className="ml-2 text-xs text-[var(--text-muted)]">{c.mobile||""}</span></button>)}
    </div>:null}
   </Field>
   <Field label="Customer card"><SearchableSelect className={control} value={cardId} disabled={locked} onChange={e=>setCardId(e.target.value)}>
    <option value="">Customer-level / all cards</option>{cards.map(c=><option key={c.id} value={c.id}>{c.bankName} •••• {c.lastFourDigits}{!c.isActive?" (inactive)":""}</option>)}
   </SearchableSelect></Field>
   <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
    <p className="mb-2 text-xs font-black">Customer ledger classification</p>
    <div className="grid grid-cols-2 gap-3">
     <Field label={direction==="PAY_IN"?"Reduces customer due":"Creates customer due"}>
      <input type="number" min="0" step=".01" className={control} value={receivable} disabled={locked} onChange={e=>changeReceivable(e.target.value)}/></Field>
     <Field label={direction==="PAY_IN"?"Creates customer credit":"Reduces customer credit"}>
      <input type="number" min="0" step=".01" className={control} value={payable} disabled={locked} onChange={e=>changePayable(e.target.value)}/></Field>
    </div>
    <p className="mt-2 text-[11px] text-[var(--text-muted)]">Both portions must total the payment amount. Changing an existing allocation requires reversing that allocation first.</p>
   </div>
   {direction==="PAY_OUT"?<Field label="Paid-to recipient / destination (optional override)">
    <input className={control} value={recipient} maxLength={160} onChange={e=>setRecipient(e.target.value)}
     placeholder={detail.payoutDestination?.label||"Enter recipient or destination"}/>
   </Field>:null}
   {hasCash?<label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
    <input type="checkbox" className="mt-1" checked={confirmedCash} onChange={e=>setConfirmedCash(e.target.checked)}/>
    <span>I confirm the actual cash has been received or handed over. Closed cash sessions cannot be edited.</span>
   </label>:null}
   <Field label="Remarks"><input className={control} value={remarks} maxLength={250} onChange={e=>setRemarks(e.target.value)} required/></Field>
   <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Reference / UTR"><input className={control} value={reference} maxLength={150} onChange={e=>setReference(e.target.value)}/></Field>
    <Field label="Reason for edit *"><input className={control} value={reason} minLength={3} maxLength={1000} onChange={e=>setReason(e.target.value)} required placeholder="Why is this being corrected?"/></Field>
   </div>
   <Field label="Notes"><textarea className="app-control min-h-20 w-full" value={notes} maxLength={4000} onChange={e=>setNotes(e.target.value)}/></Field>
  </form>
 </Modal>;
}
