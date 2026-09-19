"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, FormSection, PageLoader, SummaryRow, TransactionFrame } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Customer={id:string;fullName:string;mobile:string};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;providerId:string|null};
type Gateway={id:string;gatewayName:string};
type Provider={id:string;name:string;gateways:Gateway[]};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(v);

export default function MicroAtmPage(){
 const router=useRouter();
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [providers,setProviders]=useState<Provider[]>([]);
 const [customerId,setCustomerId]=useState("");
 const [cardLastFour,setCardLastFour]=useState("");
 const [bank,setBank]=useState("");
 const [amount,setAmount]=useState("");
 const [providerId,setProviderId]=useState("");
 const [gatewayId,setGatewayId]=useState("");
 const [commissionRate,setCommissionRate]=useState("0");
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
 ]).then(([c,a,p])=>{
   setCustomers(c);setAccounts(a);setProviders(p);
   const cash=a.filter(x=>x.accountType==="CASH");if(cash.length===1)setCashAccountId(cash[0].id);
   const remembered=localStorage.getItem("cashledger_micro_provider");const first=p.find(x=>x.id===remembered)?.id??p[0]?.id??"";if(first)setProviderId(first);
   const params=new URLSearchParams(window.location.search);const preset=params.get("customerId");if(preset&&c.some(x=>x.id===preset))setCustomerId(preset);
   const lastFour=params.get("cardLastFour");if(lastFour&&/^\d{4}$/.test(lastFour))setCardLastFour(lastFour);
  })
   .catch(e=>setError(e instanceof Error?e.message:"Failed to load form"))
   .finally(()=>setLoading(false));},[]);

 const provider=providers.find(p=>p.id===providerId);
 const providerWallet=accounts.find(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId);
 const withdrawal=Number(amount||0);
 const providerCommission=Math.round(withdrawal*Number(commissionRate||0))/100;
 const settlement=Math.round((withdrawal+providerCommission)*100)/100;
 const cashAccount=accounts.find(a=>a.id===cashAccountId);

 useEffect(()=>{
  if(!providerId)return;
  localStorage.setItem("cashledger_micro_provider",providerId);
  const remembered=localStorage.getItem("cashledger_micro_gateway_"+providerId);
  const next=provider?.gateways.find(g=>g.id===remembered)??provider?.gateways[0];
  setGatewayId(next?.id??"");
  if(providerWallet)setSettlementAccountId(providerWallet.id);
 },[providerId,provider,providerWallet]);

 useEffect(()=>{if(gatewayId&&providerId)localStorage.setItem("cashledger_micro_gateway_"+providerId,gatewayId);},[gatewayId,providerId]);

 useEffect(()=>{
  if(!customerId||!providerId)return;
  const q=new URLSearchParams({transactionType:"MICRO_ATM",customerId,providerId});
  if(gatewayId)q.set("gatewayId",gatewayId);
  apiFetch<{commissionRate:string}|null>("/settings/commission-rules/resolve?"+q.toString())
   .then(rule=>{if(rule)setCommissionRate(String(Number(rule.commissionRate)));})
   .catch(()=>{});
 },[customerId,providerId,gatewayId]);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   await apiFetch("/transactions/micro-atm",{method:"POST",body:JSON.stringify({
    customerId,cardLastFour,customerBankName:bank||undefined,withdrawalAmount:withdrawal,
    providerId,gatewayId:gatewayId||undefined,providerCommissionRate:Number(commissionRate),
    cashAccountId,settlementAccountId,settledNow,
    settlementDueAt:settlementDueAt?new Date(settlementDueAt).toISOString():undefined,
    providerReference:reference||undefined,notes:notes||undefined,
   })});
   router.push("/transactions");
  }catch(err){setError(err instanceof Error?err.message:"Failed to save Micro ATM withdrawal");}
  finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Preparing Micro ATM withdrawal…"/></AppShell>;
 const control="app-control";
 return <AppShell><form onSubmit={submit}>
  <TransactionFrame eyebrow="Customer service" title="Micro ATM withdrawal" description="Customer card withdrawal: pay cash now, then track the provider principal plus provider commission until settlement."
   summary={<>
    <SummaryRow label="Customer withdrawal" value={money(withdrawal)}/>
    <SummaryRow label="Cash given" value={money(withdrawal)} tone="amber"/>
    <SummaryRow label="Customer commission" value={money(0)}/>
    <SummaryRow label="Provider commission" value={money(providerCommission)} tone="emerald"/>
    <SummaryRow label={settledNow?"Settlement received":"Provider clearing"} value={money(settlement)} tone="cyan"/>
   </>}
   footer={<button disabled={saving||cardLastFour.length!==4||withdrawal<=0||!providerId||!cashAccountId||!settlementAccountId||(cashAccount&&cashAccount.currentBalance+0.001<withdrawal)} className="app-primary-button min-h-12 w-full px-5 text-sm font-bold disabled:opacity-40">{saving?"Saving transaction…":"Save Micro ATM withdrawal"}</button>}>

   {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

   <FormSection step="1" title="Withdrawal">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Amount"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">₹</span><input className={control+" pl-8 text-xl font-bold"} type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required/></div></Field>
     <Field label="Customer"><select className={control} value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName} · {c.mobile}</option>)}</select></Field>
     <Field label="Card last 4"><input className={control} inputMode="numeric" maxLength={4} placeholder="Last 4 digits" value={cardLastFour} onChange={e=>setCardLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} required/></Field>
     <Field label="Customer bank"><input className={control} value={bank} onChange={e=>setBank(e.target.value)} placeholder="Optional bank name"/></Field>
    </div>
   </FormSection>

   <FormSection step="2" title="Provider & commission">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");setSettlementAccountId("");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
     <Field label="Gateway / terminal"><select className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)}><option value="">Optional gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
     <Field label="Provider commission %"><input className={control} type="number" step="0.0001" min="0" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/></Field>
     <Field label="Provider reference / RRN"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="RRN / transaction reference"/></Field>
    </div>
   </FormSection>

   <FormSection step="3" title="Cash & settlement">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Cash account"><select className={control} value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Cash account paying customer</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)}</option>)}</select></Field>
     <Field label="Settlement wallet">{providerWallet?<div className={control+" flex items-center justify-between"}><span>{providerWallet.accountName}</span><span className="text-xs text-slate-400">{money(providerWallet.currentBalance)}</span></div>:<select className={control} value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Select settlement account</option>{accounts.filter(a=>a.accountType==="BANK"||a.accountType==="UPI").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select>}</Field>
     <Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>
     <label className="flex min-h-11 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"><input type="checkbox" checked={settledNow} onChange={e=>setSettledNow(e.target.checked)} className="h-4 w-4"/><span><strong className="block text-emerald-900">Settlement already received</strong><span className="text-[11px] text-emerald-700">Only when the funds are already visible in the selected account.</span></span></label>
     <Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field>
    </div>
   </FormSection>
  </TransactionFrame>
 </form></AppShell>;
}
