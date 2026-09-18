"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
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

  useEffect(()=>{Promise.all([apiFetch<Customer[]>("/customers"),apiFetch<Account[]>("/dashboard/accounts")]).then(([c,a])=>{setCustomers(c);setAccounts(a);}).catch(()=>setError("Failed to load form"));},[]);

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

  return <AppShell><div className="mx-auto max-w-4xl space-y-6">
    <div><h2 className="text-2xl font-bold">Cash Transfer</h2><p className="text-sm text-slate-500">Customer gives cash; transfer from bank/UPI/wallet to the customer or a saved beneficiary.</p></div>
    {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
    <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
      <select className="rounded-lg border px-3 py-2.5" value={customerId} onChange={e=>{setCustomerId(e.target.value);setOwnDestination("");setBeneficiaryId("");setBeneficiaryAccountId("");}} required><option value="">Customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
      <input className="rounded-lg border px-3 py-2.5" type="number" min="0.01" step="0.01" placeholder="Requested amount" value={amount} onChange={e=>setAmount(e.target.value)} required/>

      <select className="rounded-lg border px-3 py-2.5" value={ownDestination} onChange={e=>{setOwnDestination(e.target.value);if(e.target.value){setBeneficiaryId("");setBeneficiaryAccountId("");}}}>
        <option value="">Customer bank / UPI (optional)</option>
        {customer?.bankAccounts.filter(a=>a.isActive).map(a=><option key={a.id} value={"BANK:"+a.id}>Bank — {a.bankName} {a.accountReference}</option>)}
        {customer?.upiAccounts.filter(a=>a.isActive).map(a=><option key={a.id} value={"UPI:"+a.id}>UPI — {a.upiId||a.mobileNumber||a.accountName}</option>)}
      </select>

      <select className="rounded-lg border px-3 py-2.5" value={beneficiaryId} onChange={e=>{setBeneficiaryId(e.target.value);setBeneficiaryAccountId("");if(e.target.value)setOwnDestination("");}}>
        <option value="">Beneficiary (optional)</option>
        {customer?.beneficiaries.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.beneficiaryName}</option>)}
      </select>
      <select className="rounded-lg border px-3 py-2.5" value={beneficiaryAccountId} onChange={e=>setBeneficiaryAccountId(e.target.value)}>
        <option value="">Beneficiary account (optional)</option>
        {beneficiary?.accounts.filter(a=>a.isActive).map(a=><option key={a.id} value={a.id}>{a.accountType} — {a.bankName?(a.bankName+" "+(a.accountReference||"")):(a.upiId||a.mobileNumber||"")}</option>)}
      </select>

      <select className="rounded-lg border px-3 py-2.5" value={method} onChange={e=>setMethod(e.target.value)}><option value="ADD_ON">Commission added on top</option><option value="DEDUCT">Commission deducted</option></select>
      <input className="rounded-lg border px-3 py-2.5" type="number" min="0" step="0.0001" placeholder="Commission %" value={rate} onChange={e=>setRate(e.target.value)} required/>

      <select className="rounded-lg border px-3 py-2.5" value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Cash account receiving money</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>
      <select className="rounded-lg border px-3 py-2.5" value={sourceAccountId} onChange={e=>setSourceAccountId(e.target.value)} required><option value="">Account used to transfer</option>{accounts.filter(a=>a.accountType!=="CASH"&&a.accountType!=="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>

      <input className="rounded-lg border px-3 py-2.5" type="number" min="0" step="0.01" placeholder="Bank / wallet transfer charge" value={transferCharge} onChange={e=>setTransferCharge(e.target.value)}/>
      <select className="rounded-lg border px-3 py-2.5" value={transferChargeType} onChange={e=>setTransferChargeType(e.target.value)} disabled={charge<=0}><option value="BANK">Bank charge</option><option value="WALLET">Wallet charge</option><option value="TRANSFER">Transfer charge</option></select>

      <input className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Transfer reference / UTR" value={reference} onChange={e=>setReference(e.target.value)}/>
      <textarea className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)}/>

      <div className="md:col-span-2 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-5">
        <div><p className="text-xs text-slate-500">Cash Received</p><p className="font-semibold">{money(cashReceived)}</p></div>
        <div><p className="text-xs text-slate-500">Commission</p><p className="font-semibold">{money(commission)}</p></div>
        <div><p className="text-xs text-slate-500">Transferred</p><p className="font-semibold">{money(transferAmount)}</p></div>
        <div><p className="text-xs text-slate-500">Transfer Charge</p><p className="font-semibold">{money(charge)}</p></div>
        <div><p className="text-xs text-slate-500">Source Outflow</p><p className="font-semibold">{money(sourceOutflow)}</p></div>
      </div>
      <div className="md:col-span-2 flex justify-end"><button disabled={saving||transferAmount<=0} className="rounded-lg bg-slate-950 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save Transfer"}</button></div>
    </form>
  </div></AppShell>;
}
