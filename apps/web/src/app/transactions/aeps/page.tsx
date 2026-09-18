"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Customer={id:string;fullName:string;bankAccounts:{id:string;bankName:string;accountReference:string;isActive:boolean}[]};
type Account={id:string;accountName:string;accountType:string};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string};
type Provider={id:string;name:string;gateways:Gateway[]};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function AepsPage(){
 const router=useRouter();
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [providers,setProviders]=useState<Provider[]>([]);
 const [customerId,setCustomerId]=useState("");
 const [aadhaar,setAadhaar]=useState("");
 const [bank,setBank]=useState("");
 const [amount,setAmount]=useState("");
 const [platformId,setPlatformId]=useState("");
 const [providerId,setProviderId]=useState("");
 const [gatewayId,setGatewayId]=useState("");
 const [chargeRate,setChargeRate]=useState("0.5");
 const [commissionRate,setCommissionRate]=useState("1");
 const [cashAccountId,setCashAccountId]=useState("");
 const [settlementAccountId,setSettlementAccountId]=useState("");
 const [reference,setReference]=useState("");
 const [notes,setNotes]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);

 useEffect(()=>{Promise.all([
  apiFetch<Customer[]>("/customers"),
  apiFetch<Account[]>("/dashboard/accounts"),
  apiFetch<Provider[]>("/providers"),
 ]).then(([c,a,p])=>{setCustomers(c);setAccounts(a);setProviders(p);}).catch(()=>setError("Failed to load form"));},[]);

 const customer=customers.find(c=>c.id===customerId);
 const provider=providers.find(p=>p.id===providerId);

 useEffect(()=>{
  if(!customerId)return;
  const q=new URLSearchParams({transactionType:"AEPS_WITHDRAWAL",customerId});
  if(providerId)q.set("providerId",providerId);
  if(gatewayId)q.set("gatewayId",gatewayId);
  apiFetch<{commissionRate:string}|null>("/settings/commission-rules/resolve?"+q.toString())
   .then(rule=>{if(rule)setCommissionRate(String(Number(rule.commissionRate)));})
   .catch(()=>{});
 },[customerId,providerId,gatewayId]);

 const withdrawal=Number(amount||0);
 const charge=withdrawal*Number(chargeRate||0)/100;
 const commission=withdrawal*Number(commissionRate||0)/100;
 const cashGiven=withdrawal-commission;
 const settlement=withdrawal-charge;

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/aeps",{method:"POST",body:JSON.stringify({
    customerId,
    aadhaarLastFour:aadhaar,
    customerBankName:bank,
    withdrawalAmount:withdrawal,
    platformId:platformId||undefined,
    providerId:providerId||undefined,
    gatewayId:gatewayId||undefined,
    platformChargeRate:Number(chargeRate),
    commissionRate:Number(commissionRate),
    cashAccountId,
    settlementAccountId,
    providerReference:reference||undefined,
    notes:notes||undefined,
   })});
   router.push("/transactions");
  }catch(err){setError(err instanceof Error?err.message:"Failed to save AePS");}
  finally{setSaving(false);}
 }

 return <AppShell><div className="mx-auto max-w-4xl space-y-6">
  <div><h2 className="text-2xl font-bold">AePS Withdrawal</h2><p className="text-sm text-slate-500">Record the external biometric/platform transaction only. No OTP or biometric data is stored.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
   <select className="rounded-lg border px-3 py-2.5" value={customerId} onChange={e=>{setCustomerId(e.target.value);setBank("");}} required><option value="">Customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
   <input className="rounded-lg border px-3 py-2.5" placeholder="Aadhaar last 4" maxLength={4} value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,"").slice(0,4))} required/>

   <div>
    <input list="aeps-customer-banks" className="w-full rounded-lg border px-3 py-2.5" placeholder="Customer bank" value={bank} onChange={e=>setBank(e.target.value)} required/>
    <datalist id="aeps-customer-banks">{customer?.bankAccounts.filter(x=>x.isActive).map(x=><option key={x.id} value={x.bankName}>{x.accountReference}</option>)}</datalist>
   </div>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.01" min="0.01" placeholder="Withdrawal amount" value={amount} onChange={e=>setAmount(e.target.value)} required/>

   <input className="rounded-lg border px-3 py-2.5" placeholder="Platform ID / terminal (optional)" value={platformId} onChange={e=>setPlatformId(e.target.value)}/>
   <select className="rounded-lg border px-3 py-2.5" value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}}><option value="">Platform / Provider (optional)</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <select className="rounded-lg border px-3 py-2.5" value={gatewayId} onChange={e=>{setGatewayId(e.target.value);const g=provider?.gateways.find(x=>x.id===e.target.value);if(g)setChargeRate(String(Number(g.defaultChargeRate)));}}><option value="">Gateway (optional)</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.0001" min="0" placeholder="Platform charge %" value={chargeRate} onChange={e=>setChargeRate(e.target.value)} required/>
   <input className="rounded-lg border px-3 py-2.5" type="number" step="0.0001" min="0" placeholder="Business commission %" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/>

   <select className="rounded-lg border px-3 py-2.5" value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Cash account paying customer</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>
   <select className="rounded-lg border px-3 py-2.5" value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Settlement wallet / bank</option>{accounts.filter(a=>a.accountType!=="CASH"&&a.accountType!=="OWNER_CREDIT_CARD").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>

   <input className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Provider reference" value={reference} onChange={e=>setReference(e.target.value)}/>
   <textarea className="rounded-lg border px-3 py-2.5 md:col-span-2" placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)}/>

   <div className="md:col-span-2 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4"><div><p className="text-xs text-slate-500">Withdrawal</p><p className="font-semibold">{money(withdrawal)}</p></div><div><p className="text-xs text-slate-500">Platform Charge</p><p className="font-semibold">{money(charge)}</p></div><div><p className="text-xs text-slate-500">Cash Given</p><p className="font-semibold">{money(cashGiven)}</p></div><div><p className="text-xs text-slate-500">Settlement</p><p className="font-semibold">{money(settlement)}</p></div></div>
   <div className="md:col-span-2 flex justify-end"><button disabled={saving||aadhaar.length!==4||cashGiven<=0||settlement<=0} className="rounded-lg bg-slate-950 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save AePS"}</button></div>
  </form>
 </div></AppShell>;
}
