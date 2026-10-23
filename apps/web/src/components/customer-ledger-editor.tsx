"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Modal, Field } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { customerLedgerSplit } from "@/lib/customer-ledger-split";

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
 // Classification fields are independent. Never silently reclassify customer money:
 // show a discrepancy and require the operator to reconcile the actual amount.
 function changeAmount(next:string){setAmount(next);}
 function changeReceivable(next:string){setReceivable(next);}
 function changePayable(next:string){setPayable(next);}
 const split=customerLedgerSplit(amount,receivable,payable);
 const splitValid=split.valid;
 const splitAmount=(split.classifiedPaise??0)/100;
 const splitDifference=split.differencePaise===null?null:split.differencePaise/100;
 const formatMoney=(value:number)=>"₹"+Math.abs(value).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
 async function save(event:FormEvent){
   event.preventDefault();setError("");
   if(!customerId){setError("Choose a customer from the search results");return;}
   if(!splitValid){
      setError("Customer due and credit amounts must equal the recorded payment. Check the real wallet/bank payment before correcting Amount.");return;
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
   <button type="submit" form="customer-ledger-full-edit" disabled={loading||!splitValid||reason.trim().length<3} className="app-primary-button min-h-11 disabled:opacity-40">{loading?"Saving…":"Save all changes"}</button></div>}>
  <form id="customer-ledger-full-edit" className="space-y-4" onSubmit={save}>
   {locked?<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
    This payment has ₹{allocated.toLocaleString("en-IN")} matched to dues. You can correct descriptions, reference, recipient and date, but must reverse the matched entries before changing financial amounts or the card/customer.
   </div>:null}
   {error?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
   <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Transaction type"><SearchableSelect className={control} value={direction} disabled={locked} onChange={e=>setDirection(e.target.value as "PAY_IN"|"PAY_OUT")}>
     <option value="PAY_IN">PAY IN — RECEIVED</option><option value="PAY_OUT">PAY OUT — PAID</option></SearchableSelect></Field>
    <Field label="Amount (₹)"><input className={control} inputMode="decimal" type="number" min=".01" step=".01" value={amount} disabled={locked} onChange={e=>changeAmount(e.target.value)} required/>{direction==="PAY_OUT"&&Number(amount)!==Number(detail.amount)?<p className="mt-1 text-xs text-amber-800">Changing this amount also corrects the posted wallet/bank movement and its audit. Verify the actual transfer first.</p>:null}</Field>
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
    <p className="mb-3 text-xs text-[var(--text-muted)]">Recorded {direction==="PAY_OUT"?"Pay Out":"Pay In"}: <strong>{formatMoney(Number(amount||0))}</strong>. Classify the whole payment below. Neither value changes the other automatically.</p>
    <div className="grid grid-cols-2 gap-3">
     <Field label={direction==="PAY_IN"?"Reduces customer due":"Creates customer due"}>
      <input type="number" min="0" step=".01" className={control} value={receivable} disabled={locked} onChange={e=>changeReceivable(e.target.value)}/></Field>
     <Field label={direction==="PAY_IN"?"Creates customer credit":"Reduces customer credit"}>
      <input type="number" min="0" step=".01" className={control} value={payable} disabled={locked} onChange={e=>changePayable(e.target.value)}/></Field>
    </div>
    <p className="mt-2 text-[11px] text-[var(--text-muted)]">Both portions must total the payment amount. Changing an existing allocation requires reversing that allocation first.</p>
    {!splitValid?
      <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
       {splitDifference===null?
        <p className="font-bold">Enter valid rupee amounts with at most two decimal places in all three fields.</p>:
        <>
         <p className="font-bold">{splitDifference>0
          ?formatMoney(splitDifference)+" of this payment is not classified."
          :formatMoney(splitDifference)+" is classified beyond the payment amount."}</p>
         <p className="mt-1">Recorded payment: {formatMoney(Number(amount))}. Classified: {formatMoney(splitAmount)}. Do not assign the difference to customer credit just to balance it.</p>
         <p className="mt-1">If the actual {direction==="PAY_OUT"?"wallet/bank payout":"receipt"} was {formatMoney(splitAmount)}, change <strong>Amount</strong> above to that total after verifying the statement. Otherwise classify the full recorded payment correctly.</p>
        </>}
      </div>:null}
    {direction==="PAY_OUT"&&!locked?<button type="button" onClick={()=>{setReceivable(amount);setPayable("0")}}
      className="mt-3 min-h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold">
      Classify full Pay Out as customer advance (creates due)
     </button>:null}
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
