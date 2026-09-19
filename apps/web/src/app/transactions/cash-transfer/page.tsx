"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Customer={
  id:string;fullName:string;
  bankAccounts:{id:string;bankName:string;accountReference:string;isActive:boolean}[];
  upiAccounts:{id:string;accountName:string;upiId:string|null;mobileNumber:string|null;isActive:boolean}[];
  beneficiaries:{id:string;beneficiaryName:string;isActive:boolean;accounts:{id:string;accountType:string;bankName:string|null;accountReference:string|null;upiId:string|null;mobileNumber:string|null;isActive:boolean}[]}[];
};
type Account={id:string;accountName:string;accountType:string;currentBalance:number};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function CashTransferPage(){
  const router=useRouter();
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [customerId,setCustomerId]=useState("");
  const [ownDestination,setOwnDestination]=useState("");
  const [beneficiaryId,setBeneficiaryId]=useState("");
  const [beneficiaryAccountId,setBeneficiaryAccountId]=useState("");
  const [cashAccountId,setCashAccountId]=useState("");
  const [sourceAccountId,setSourceAccountId]=useState("");
  const [amount,setAmount]=useState("");
  const [method,setMethod]=useState("ADD_ON");
  const [rate,setRate]=useState("2");
  const [transferCharge,setTransferCharge]=useState("0");
  const [transferChargeType,setTransferChargeType]=useState("TRANSFER");
  const [reference,setReference]=useState("");
  const [notes,setNotes]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{Promise.all([apiFetch<Customer[]>("/customers"),apiFetch<Account[]>("/dashboard/accounts")]).then(([c,a])=>{setCustomers(c);setAccounts(a);}).catch(()=>setError("Failed to load form")).finally(()=>setLoading(false));},[]);

  const customer=customers.find(c=>c.id===customerId);
  const beneficiary=customer?.beneficiaries.find(b=>b.id===beneficiaryId);
  const sourceAccount=accounts.find(a=>a.id===sourceAccountId);

  useEffect(()=>{
    if(!customerId)return;
    const q=new URLSearchParams({transactionType:"CASH_TRANSFER",customerId});
    apiFetch<{commissionRate:string}|null>("/settings/commission-rules/resolve?"+q.toString())
      .then(rule=>{if(rule)setRate(String(Number(rule.commissionRate)));})
      .catch(()=>{});
  },[customerId]);

  useEffect(()=>{
    if(!sourceAccount)return;
    setTransferChargeType(sourceAccount.accountType==="PROVIDER_WALLET"?"WALLET":sourceAccount.accountType==="BANK"?"BANK":"TRANSFER");
  },[sourceAccountId]);

  const requested=Number(amount||0);
  const commission=requested*Number(rate||0)/100;
  const charge=Number(transferCharge||0);
  const cashReceived=method==="ADD_ON"?requested+commission:requested;
  const transferAmount=method==="ADD_ON"?requested:requested-commission;
  const sourceOutflow=transferAmount+charge;

  async function submit(e:FormEvent){
    e.preventDefault();setSaving(true);setError("");
    try{
      const [destinationType,destinationId]=ownDestination?ownDestination.split(":"):["",""];
      await apiFetch("/transactions/cash-transfer",{method:"POST",body:JSON.stringify({
        customerId,
        beneficiaryId:beneficiaryId||undefined,
        beneficiaryAccountId:beneficiaryAccountId||undefined,
        customerBankAccountId:destinationType==="BANK"?destinationId:undefined,
        customerUpiAccountId:destinationType==="UPI"?destinationId:undefined,
        requestedAmount:requested,
        commissionMethod:method,
        commissionRate:Number(rate),
        transferChargeAmount:charge,
        transferChargeType:charge>0?transferChargeType:undefined,
        cashAccountId,
        sourceAccountId,
        referenceNumber:reference||undefined,
        notes:notes||undefined,
      })});
      router.push("/transactions");
    }catch(err){setError(err instanceof Error?err.message:"Failed to save transfer");}
    finally{setSaving(false);}
  }

  if(loading)return <AppShell><PageLoader label="Preparing cash transfer…"/></AppShell>;
  const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
  return <AppShell><form onSubmit={submit}>
    <TransactionFrame eyebrow="Customer service" title="Cash transfer" description="Receive cash, send money from the selected account, and keep commission and transfer charges visible."
      summary={<>
        <SummaryRow label="Cash received" value={money(cashReceived)} tone="emerald"/>
        <SummaryRow label="Business commission" value={money(commission)} tone="emerald"/>
        <SummaryRow label="Transferred" value={money(transferAmount)} tone="indigo"/>
        <SummaryRow label="Transfer charge" value={money(charge)} tone="rose"/>
        <SummaryRow label="Source outflow" value={money(sourceOutflow)} tone="amber"/>
      </>}
      footer={<button disabled={saving||transferAmount<=0} className="min-h-12 w-full rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-40">{saving?"Saving transaction…":"Save cash transfer"}</button>}>

      {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

      <FormSection step="1" title="Transfer">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">₹</span><input className={control+" pl-8 text-xl font-bold"} inputMode="decimal" type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} required/></div></Field>
          <Field label="Customer"><select className={control} value={customerId} onChange={e=>{setCustomerId(e.target.value);setOwnDestination("");setBeneficiaryId("");setBeneficiaryAccountId("");}} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
          <Field label="Customer bank / UPI" hint="Use this when the transfer is going to the customer's own saved account."><select className={control} value={ownDestination} onChange={e=>{setOwnDestination(e.target.value);if(e.target.value){setBeneficiaryId("");setBeneficiaryAccountId("");}}}><option value="">Not selected</option>{customer?.bankAccounts.filter(a=>a.isActive).map(a=><option key={a.id} value={"BANK:"+a.id}>Bank — {a.bankName} {a.accountReference}</option>)}{customer?.upiAccounts.filter(a=>a.isActive).map(a=><option key={a.id} value={"UPI:"+a.id}>UPI — {a.upiId||a.mobileNumber||a.accountName}</option>)}</select></Field>
          <Field label="Saved beneficiary"><select className={control} value={beneficiaryId} onChange={e=>{setBeneficiaryId(e.target.value);setBeneficiaryAccountId("");if(e.target.value)setOwnDestination("");}}><option value="">Not selected</option>{customer?.beneficiaries.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.beneficiaryName}</option>)}</select></Field>
          {beneficiaryId?<Field label="Beneficiary account" className="sm:col-span-2"><select className={control} value={beneficiaryAccountId} onChange={e=>setBeneficiaryAccountId(e.target.value)}><option value="">Select beneficiary account</option>{beneficiary?.accounts.filter(a=>a.isActive).map(a=><option key={a.id} value={a.id}>{a.accountType} — {a.bankName?(a.bankName+" "+(a.accountReference||"")):(a.upiId||a.mobileNumber||"")}</option>)}</select></Field>:null}
        </div>
      </FormSection>

      <FormSection step="2" title="Funding & commission">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Commission method"><select className={control} value={method} onChange={e=>setMethod(e.target.value)}><option value="ADD_ON">Added on top</option><option value="DEDUCT">Deducted from transfer</option></select></Field>
          <Field label="Commission %"><input className={control} type="number" min="0" step="0.0001" value={rate} onChange={e=>setRate(e.target.value)} required/></Field>
          <Field label="Cash account receiving money"><select className={control} value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Select cash account</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
          <Field label="Transfer source account"><select className={control} value={sourceAccountId} onChange={e=>setSourceAccountId(e.target.value)} required><option value="">Select source account</option>{accounts.filter(a=>a.accountType!=="CASH"&&a.accountType!=="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
          <Field label="Bank / wallet charge"><input className={control} type="number" min="0" step="0.01" value={transferCharge} onChange={e=>setTransferCharge(e.target.value)} placeholder="0.00"/></Field>
          <Field label="Charge type"><select className={control} value={transferChargeType} onChange={e=>setTransferChargeType(e.target.value)} disabled={charge<=0}><option value="BANK">Bank charge</option><option value="WALLET">Wallet charge</option><option value="TRANSFER">Transfer charge</option></select></Field>
        </div>
      </FormSection>

      <FormSection step="3" title="More details">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Transfer reference / UTR"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="UTR / reference"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div>
      </FormSection>
    </TransactionFrame>
  </form></AppShell>;
}
