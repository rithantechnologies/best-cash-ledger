"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { SearchableSelect } from "@/components/searchable-select";
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
 const [customerMode,setCustomerMode]=useState<"existing"|"new">("existing");
 const [customerSearch,setCustomerSearch]=useState("");
 const [newCustomerName,setNewCustomerName]=useState("");
 const [newCustomerMobile,setNewCustomerMobile]=useState("");
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
   const params=new URLSearchParams(window.location.search);
   const cash=a.filter(x=>x.accountType==="CASH");
   const presetCash=params.get("cashAccountId");
   if(presetCash&&cash.some(x=>x.id===presetCash))setCashAccountId(presetCash);
   else if(cash.length===1)setCashAccountId(cash[0].id);
   const remembered=localStorage.getItem("cashledger_micro_provider");const first=p.find(x=>x.id===remembered)?.id??p[0]?.id??"";if(first)setProviderId(first);
   const preset=params.get("customerId");if(preset&&c.some(x=>x.id===preset))setCustomerId(preset);
   const lastFour=params.get("cardLastFour");if(lastFour&&/^\d{4}$/.test(lastFour))setCardLastFour(lastFour);
  })
   .catch(e=>setError(e instanceof Error?e.message:"Failed to load form"))
   .finally(()=>setLoading(false));},[]);

 const provider=providers.find(p=>p.id===providerId);
 const providerWallet=accounts.find(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===providerId);
 const withdrawal=Number(amount||0);
 const filteredCustomers=customerSearch.trim()?customers.filter(c=>(c.fullName+" "+c.mobile).toLowerCase().includes(customerSearch.trim().toLowerCase())).slice(0,20):customers.slice(0,20);
 const newCustomerReady=newCustomerName.trim().length>=2&&(!newCustomerMobile.trim()||/^[6-9]\d{9}$/.test(newCustomerMobile.trim()));
 const providerCommission=Math.round(withdrawal*Number(commissionRate||0))/100;
 const settlement=Math.round((withdrawal+providerCommission)*100)/100;
 const cashAccount=accounts.find(a=>a.id===cashAccountId);
 const customerReady=customerMode==="existing"?Boolean(customerId):newCustomerReady;

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
  if(!providerId)return;
  const q=new URLSearchParams({transactionType:"MICRO_ATM",providerId});
  if(customerMode==="existing"&&customerId)q.set("customerId",customerId);
  if(gatewayId)q.set("gatewayId",gatewayId);
  apiFetch<{commissionRate:string}|null>("/settings/commission-rules/resolve?"+q.toString())
   .then(rule=>setCommissionRate(String(Number(rule?.commissionRate||0))))
   .catch(()=>{});
 },[customerMode,customerId,providerId,gatewayId]);

 async function submit(e:FormEvent){
  e.preventDefault();setSaving(true);setError("");
  try{
   let targetCustomerId=customerId;
   if(customerMode==="new"){
    const created=await apiFetch<Customer>("/customers",{method:"POST",body:JSON.stringify({customerType:"REGULAR",fullName:newCustomerName.trim(),mobile:newCustomerMobile.trim()||undefined})});
    targetCustomerId=created.id;
    setCustomers(current=>[created,...current]);
    setCustomerId(created.id);
   }
   await apiFetch("/transactions/micro-atm",{method:"POST",body:JSON.stringify({
    customerId:targetCustomerId,cardLastFour,customerBankName:bank||undefined,withdrawalAmount:withdrawal,
    providerId,gatewayId,providerCommissionRate:Number(commissionRate),
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
  <TransactionFrame eyebrow="Customer service" title="Micro ATM withdrawal" description="Customer receives the full withdrawal amount in cash. Provider commission is tracked separately and is not deducted from the customer."
   summary={<>
    <SummaryRow label="Customer gets cash" value={money(withdrawal)} tone="amber"/>
    <SummaryRow label="Provider commission" value={money(providerCommission)} tone="emerald"/>
    <SummaryRow label={settledNow?"Settlement received":"Provider clearing"} value={money(settlement)} tone="cyan"/>
   </>}
   footer={<button disabled={saving||!customerReady||cardLastFour.length!==4||withdrawal<=0||!providerId||!gatewayId||!cashAccountId||!settlementAccountId||(cashAccount&&cashAccount.currentBalance+0.001<withdrawal)} className="app-primary-button min-h-12 w-full px-5 text-sm font-bold disabled:opacity-40">{saving?"Saving transaction…":"Save Micro ATM withdrawal"}</button>}>

   {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

   <FormSection step="1" title="Customer & withdrawal">
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
     <button type="button" onClick={()=>setCustomerMode("existing")} className={"min-h-10 rounded-lg text-sm font-bold "+(customerMode==="existing"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Existing</button>
     <button type="button" onClick={()=>setCustomerMode("new")} className={"min-h-10 rounded-lg text-sm font-bold "+(customerMode==="new"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>New</button>
    </div>
    {customerMode==="existing"?<div className="grid gap-3 sm:grid-cols-2">
     <Field label="Find customer"><input className={control} value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search name or mobile"/></Field>
     <Field label="Customer"><SearchableSelect className={control} value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Select customer</option>{filteredCustomers.map(c=><option key={c.id} value={c.id}>{c.fullName}{c.mobile?" · "+c.mobile:""}</option>)}</SearchableSelect></Field>
    </div>:<div className="grid gap-3 sm:grid-cols-2">
     <Field label="Customer name"><input className={control} value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} placeholder="Enter customer name" required/></Field>
     <Field label="Mobile (optional)"><input className={control} inputMode="numeric" maxLength={10} value={newCustomerMobile} onChange={e=>setNewCustomerMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile"/>{newCustomerMobile&& !/^[6-9]\d{9}$/.test(newCustomerMobile)?<span className="mt-1.5 block text-[11px] font-semibold text-rose-600">Enter a valid 10-digit Indian mobile number.</span>:null}</Field>
    </div>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
     <Field label="Customer gets"><input className={control+" text-xl font-bold"} type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required/></Field>
     <Field label="Card last 4"><input className={control} inputMode="numeric" maxLength={4} placeholder="Last 4 digits" value={cardLastFour} onChange={e=>setCardLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} required/></Field>
     <Field label="Customer bank"><input className={control} value={bank} onChange={e=>setBank(e.target.value)} placeholder="Optional bank name"/></Field>
    </div>
   </FormSection>

   <FormSection step="2" title="Provider & commission">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Provider"><SearchableSelect className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");setSettlementAccountId("");}} required><option value="">Select provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect></Field>
     <Field label="Gateway / terminal"><SearchableSelect className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)} required><option value="">Select gateway</option>{provider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</SearchableSelect></Field>
     <Field label="Provider commission %"><input className={control} type="number" step="0.0001" min="0" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} required/></Field>
    </div>
   </FormSection>

   <FormSection step="3" title="Cash & settlement">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Cash account"><SearchableSelect className={control} value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)} required><option value="">Cash account paying customer</option>{accounts.filter(a=>a.accountType==="CASH").map(a=><option key={a.id} value={a.id}>{a.accountName} · {money(a.currentBalance)}</option>)}</SearchableSelect></Field>
     <Field label="Settlement wallet">{providerWallet?<div className={control+" flex items-center justify-between"}><span>{providerWallet.accountName}</span><span className="text-xs text-slate-400">{money(providerWallet.currentBalance)}</span></div>:<SearchableSelect className={control} value={settlementAccountId} onChange={e=>setSettlementAccountId(e.target.value)} required><option value="">Select settlement account</option>{accounts.filter(a=>a.accountType==="BANK"||a.accountType==="UPI").map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</SearchableSelect>}</Field>
     {!settledNow?<Field label="Expected settlement"><input className={control} type="datetime-local" value={settlementDueAt} onChange={e=>setSettlementDueAt(e.target.value)}/></Field>:null}
     <label className="flex min-h-11 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm"><input type="checkbox" checked={settledNow} onChange={e=>setSettledNow(e.target.checked)} className="h-4 w-4"/><span><strong className="block text-emerald-900">Settlement already received</strong><span className="text-[11px] text-emerald-700">Only when the funds are already visible in the selected account.</span></span></label>
    </div>
   </FormSection>

   <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)]"><summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-bold">More details <span className="float-right text-[var(--text-muted)] group-open:rotate-45">+</span></summary><div className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2"><Field label="Provider reference / RRN"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="RRN / transaction reference"/></Field><Field label="Notes"><textarea className={control+" min-h-24 py-3"} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></Field></div></details>
  </TransactionFrame>
 </form></AppShell>;
}
