"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
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
 const [settledNow,setSettledNow]=useState(false);
 const [settlementDueAt,setSettlementDueAt]=useState("");
 const [reference,setReference]=useState("");
 const [notes,setNotes]=useState("");
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const [loading,setLoading]=useState(true);

 useEffect(()=>{Promise.all([
  apiFetch<Customer[]>("/customers"),
  apiFetch<Account[]>("/dashboard/accounts"),
  apiFetch<Provider[]>("/providers"),
 ]).then(([c,a,p])=>{setCustomers(c);setAccounts(a);setProviders(p);}).catch(()=>setError("Failed to load form")).finally(()=>setLoading(false));},[]);

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
    settledNow,
    settlementDueAt:settlementDueAt?new Date(settlementDueAt).toISOString():undefined,
    providerReference:reference||undefined,
    notes:notes||undefined,
   })});
   router.push("/transactions");
  }catch(err){setError(err instanceof Error?err.message:"Failed to save AePS");}
  finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Preparing AePS withdrawal…"/></AppShell>;
 const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
 return <AppShell><form onSubmit={submit}>
  <TransactionFrame eyebrow="Customer service" title="AePS withdrawal" description="Record the external AePS withdrawal, customer cash payout and provider clearing without storing biometric or OTP data."
   summary={<>
    <SummaryRow label="Withdrawal" value={money(withdrawal)}/>
    <SummaryRow label="Platform charge" value={money(charge)} tone="rose"/>
    <SummaryRow label="Business commission" value={money(commission)} tone="emerald"/>
    <SummaryRow label="Cash given" value={money(cashGiven)} tone="amber"/>
    <SummaryRow label={settledNow?"Settlement received":"Provider clearing"} value={money(settlement)} tone="cyan"/>
   </>}
   footer={<button disabled={saving||aadhaar.length!==4||cashGiven<=0||settlement<=0} className="min-h-12 w-full rounded-xl bg-slate-950 px-5 text-sm font-bold text-white shadow-sm disabled:opacity-40">{saving?"Saving transaction…":"Save AePS withdrawal"}</button>}>

   {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

   <FormSection step="1" title="Customer & withdrawal" description="Identify the customer and the external bank account used for the AePS withdrawal.">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Customer"><select className={control} value={customerId} onChange={e=>{setCustomerId(e.target.value);setBank("");}} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
     <Field label="Aadhaar last 4" hint="Only the last four digits are stored."><input className={control} inputMode="numeric" placeholder="Last 4 digits" maxLength={4} value={aadhaar} onChange={e=>setAadhaar(e.target.value.replace(/\D/g,"").slice(0,4))} required/></Field>
     <Field label="Customer bank"><div><input list="aeps-customer-banks" className={control} placeholder="Bank name" value={bank} onChange={e=>setBank(e.target.value)} required/><datalist id="aeps-customer-banks">{customer?.bankAccounts.filter(x=>x.isActive).map(x=><option key={x.id} value={x.bankName}>{x.accountReference}</option>)}</datalist></div></Field>
     <Field label="Withdrawal amount"><input className={control} type="number" step="0.01" min="0.01" placeholder="₹ 0.00" value={amount} onChange={e=>setAmount(e.target.value)} required/></Field>
    </div>
   </FormSection>

   <FormSection step="2" title="Platform & charges" description="Select the AePS provider and keep charges and commission visible.">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Platform / terminal ID"><input className={control} placeholder="Optional terminal ID" value={platformId} onChange={e=>setPlatformId(e.target.value)}/></Field>
     <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}}><option value="">Optional provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
     <Field label="Gateway"><select className={control} value={gatewayId} onChange={e=>{setGatewayId(e.target.value);const g=provider?.gateways.find(x=>x.id===e.target.value);if(g)setChargeRate(String(Number(g.defaultChargeRate)));}}><option value="">Optional gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
     <Field label="Platform charge %"><input className={control} type="number" step="0.0001" min="0" value={chargeRate} onChange={e=>setChargeRate(e.target.value)} required/></Field>
     <Field label="Business commission %"><input className={control} type="number" step="0.0001" min="0" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/></Field>
    </div>
   </FormSection>

   <FormSection step="3" title="Cash & provider settlement" description="Choose the cash drawer paying the customer and where provider settlement is expected.">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Cash account"><select className={control} value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Cash account paying customer</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
     <Field label="Settlement target"><select className={control} value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Wallet / bank receiving settlement</option>{accounts.filter(a=>["BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)).map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
     <Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>
     <label className="flex min-h-11 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"><input type="checkbox" checked={settledNow} onChange={e=>setSettledNow(e.target.checked)} className="h-4 w-4"/><span><strong className="block text-emerald-900">Settlement already received</strong><span className="text-[11px] text-emerald-700">Only when visible in the target account.</span></span></label>
    </div>
   </FormSection>

   <FormSection step="4" title="Reference & notes" description="Optional reconciliation information.">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Provider reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reference / transaction ID"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div>
   </FormSection>
  </TransactionFrame>
 </form></AppShell>;
}
