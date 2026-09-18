"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Gateway={id:string;gatewayName:string;defaultChargeRate:string;defaultChargeType:string;isActive:boolean};
type Provider={id:string;name:string;providerType:string;isActive:boolean;gateways:Gateway[]};
type Term={id:string;name:string;durationValue:number;durationUnit:string;defaultCommissionType:string;defaultCommissionRate:string;isActive:boolean};
type Category={id:string;name:string;expenseUsage:string;isActive:boolean};
type Customer={id:string;fullName:string};
type Rule={id:string;customerId:string|null;providerId:string|null;gatewayId:string|null;paymentTermId:string|null;transactionType:string;commissionType:string;commissionRate:string;isActive:boolean;paymentTerm:Term|null};

export default function SettingsPage(){
 const [providers,setProviders]=useState<Provider[]>([]);
 const [terms,setTerms]=useState<Term[]>([]);
 const [categories,setCategories]=useState<Category[]>([]);
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [rules,setRules]=useState<Rule[]>([]);
 const [error,setError]=useState("");

 const [providerName,setProviderName]=useState("");const [providerType,setProviderType]=useState("MULTI_SERVICE");
 const [gatewayProvider,setGatewayProvider]=useState("");const [gatewayName,setGatewayName]=useState("");const [gatewayRate,setGatewayRate]=useState("");
 const [termName,setTermName]=useState("");const [durationValue,setDurationValue]=useState("0");const [durationUnit,setDurationUnit]=useState("DAYS");const [termRate,setTermRate]=useState("0");
 const [categoryName,setCategoryName]=useState("");const [categoryUsage,setCategoryUsage]=useState("BUSINESS");
 const [ruleCustomer,setRuleCustomer]=useState("");const [ruleProvider,setRuleProvider]=useState("");const [ruleGateway,setRuleGateway]=useState("");const [ruleTerm,setRuleTerm]=useState("");const [ruleType,setRuleType]=useState("CARD_SWIPE");const [ruleCalc,setRuleCalc]=useState("PERCENTAGE");const [ruleRate,setRuleRate]=useState("");

 const load=()=>Promise.all([
  apiFetch<Provider[]>("/providers?includeInactive=true"),
  apiFetch<Term[]>("/settings/payment-terms?includeInactive=true"),
  apiFetch<Category[]>("/settings/expense-categories?includeInactive=true"),
  apiFetch<Customer[]>("/customers"),
  apiFetch<Rule[]>("/settings/commission-rules?includeInactive=true"),
 ]).then(([p,t,c,cu,r])=>{setProviders(p);setTerms(t);setCategories(c);setCustomers(cu);setRules(r);});
 useEffect(()=>{load().catch(()=>setError("You need Owner/Admin access to manage settings."));},[]);

 async function run(action:()=>Promise<unknown>,reset:()=>void=()=>{}){setError("");try{await action();reset();await load();}catch(err){setError(err instanceof Error?err.message:"Save failed");}}
 async function addProvider(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/providers",{method:"POST",body:JSON.stringify({name:providerName,providerType})}),()=>setProviderName(""));}
 async function addGateway(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/providers/"+gatewayProvider+"/gateways",{method:"POST",body:JSON.stringify({gatewayName,defaultChargeType:"PERCENTAGE",defaultChargeRate:Number(gatewayRate)})}),()=>{setGatewayName("");setGatewayRate("");});}
 async function addTerm(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/settings/payment-terms",{method:"POST",body:JSON.stringify({name:termName,durationValue:Number(durationValue),durationUnit,defaultCommissionType:"PERCENTAGE",defaultCommissionRate:Number(termRate)})}),()=>{setTermName("");setDurationValue("0");setTermRate("0");});}
 async function addCategory(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/settings/expense-categories",{method:"POST",body:JSON.stringify({name:categoryName,expenseUsage:categoryUsage})}),()=>setCategoryName(""));}
 async function addRule(e:FormEvent){e.preventDefault();await run(()=>apiFetch("/settings/commission-rules",{method:"POST",body:JSON.stringify({customerId:ruleCustomer||undefined,providerId:ruleProvider||undefined,gatewayId:ruleGateway||undefined,paymentTermId:ruleTerm||undefined,transactionType:ruleType,commissionType:ruleCalc,commissionRate:Number(ruleRate)})}),()=>{setRuleCustomer("");setRuleGateway("");setRuleTerm("");setRuleRate("");});}

 async function editProvider(p:Provider){
  const name=window.prompt("Provider name",p.name);if(name===null||!name.trim())return;
  const type=window.prompt("Provider type",p.providerType);if(type===null||!type.trim())return;
  await run(()=>apiFetch("/providers/"+p.id,{method:"PATCH",body:JSON.stringify({name:name.trim(),providerType:type.trim()})}));
 }
 async function toggleProvider(p:Provider){if(!window.confirm((p.isActive?"Deactivate ":"Reactivate ")+p.name+"?"))return;await run(()=>apiFetch("/providers/"+p.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!p.isActive})}));}
 async function editGateway(g:Gateway){
  const name=window.prompt("Gateway name",g.gatewayName);if(name===null||!name.trim())return;
  const rate=window.prompt("Default charge rate",String(Number(g.defaultChargeRate)));if(rate===null)return;
  await run(()=>apiFetch("/providers/gateways/"+g.id,{method:"PATCH",body:JSON.stringify({gatewayName:name.trim(),defaultChargeRate:Number(rate),defaultChargeType:g.defaultChargeType})}));
 }
 async function toggleGateway(g:Gateway){if(!window.confirm((g.isActive?"Deactivate ":"Reactivate ")+g.gatewayName+"?"))return;await run(()=>apiFetch("/providers/gateways/"+g.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!g.isActive})}));}

 async function editTerm(t:Term){
  const name=window.prompt("Term name",t.name);if(name===null||!name.trim())return;
  const duration=window.prompt("Duration value",String(t.durationValue));if(duration===null)return;
  const unit=window.prompt("Duration unit: HOURS or DAYS",t.durationUnit);if(unit===null)return;
  const rate=window.prompt("Default commission rate",String(Number(t.defaultCommissionRate)));if(rate===null)return;
  await run(()=>apiFetch("/settings/payment-terms/"+t.id,{method:"PATCH",body:JSON.stringify({name:name.trim(),durationValue:Number(duration),durationUnit:unit.trim().toUpperCase(),defaultCommissionType:t.defaultCommissionType,defaultCommissionRate:Number(rate)})}));
 }
 async function toggleTerm(t:Term){if(!window.confirm((t.isActive?"Deactivate ":"Reactivate ")+t.name+"?"))return;await run(()=>apiFetch("/settings/payment-terms/"+t.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!t.isActive})}));}

 async function editCategory(c:Category){
  const name=window.prompt("Category name",c.name);if(name===null||!name.trim())return;
  const usage=window.prompt("Usage: BUSINESS, PERSONAL or MIXED",c.expenseUsage);if(usage===null)return;
  await run(()=>apiFetch("/settings/expense-categories/"+c.id,{method:"PATCH",body:JSON.stringify({name:name.trim(),expenseUsage:usage.trim().toUpperCase()})}));
 }
 async function toggleCategory(c:Category){if(!window.confirm((c.isActive?"Deactivate ":"Reactivate ")+c.name+"?"))return;await run(()=>apiFetch("/settings/expense-categories/"+c.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!c.isActive})}));}

 async function editRule(r:Rule){
  const rate=window.prompt("Commission rate / fixed amount",String(Number(r.commissionRate)));if(rate===null)return;
  const calc=window.prompt("Calculation type: PERCENTAGE or FIXED",r.commissionType);if(calc===null)return;
  await run(()=>apiFetch("/settings/commission-rules/"+r.id,{method:"PATCH",body:JSON.stringify({commissionRate:Number(rate),commissionType:calc.trim().toUpperCase()})}));
 }
 async function toggleRule(r:Rule){if(!window.confirm((r.isActive?"Deactivate ":"Reactivate ")+"this commission rule?"))return;await run(()=>apiFetch("/settings/commission-rules/"+r.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!r.isActive})}));}

 const selectedProvider=providers.find(p=>p.id===ruleProvider);

 return <AppShell><div className="mx-auto max-w-7xl space-y-6">
  <div><h2 className="text-2xl font-bold">Settings</h2><p className="text-sm text-slate-500">Providers, gateways, terms, categories and commission overrides. Retiring a setting preserves its historical use.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}

  <section className="grid gap-5 xl:grid-cols-2">
   <form onSubmit={addProvider} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-3"><h3 className="font-semibold sm:col-span-3">Provider</h3><input className="rounded-lg border px-3 py-2" placeholder="PaySwitch / ExyPay" value={providerName} onChange={e=>setProviderName(e.target.value)} required/><select className="rounded-lg border px-3 py-2" value={providerType} onChange={e=>setProviderType(e.target.value)}><option>MULTI_SERVICE</option><option>WALLET</option><option>CARD_PROVIDER</option><option>AEPS_PLATFORM</option></select><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Provider</button></form>
   <form onSubmit={addGateway} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-4"><h3 className="font-semibold sm:col-span-4">Gateway</h3><select className="rounded-lg border px-3 py-2" value={gatewayProvider} onChange={e=>setGatewayProvider(e.target.value)} required><option value="">Provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input className="rounded-lg border px-3 py-2" placeholder="Gateway name" value={gatewayName} onChange={e=>setGatewayName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" type="number" step="0.0001" placeholder="Default charge %" value={gatewayRate} onChange={e=>setGatewayRate(e.target.value)} required/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Gateway</button></form>
   <form onSubmit={addTerm} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-5"><h3 className="font-semibold sm:col-span-5">Payment Term</h3><input className="rounded-lg border px-3 py-2" placeholder="Term name" value={termName} onChange={e=>setTermName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" type="number" min="0" placeholder="Duration" value={durationValue} onChange={e=>setDurationValue(e.target.value)} required/><select className="rounded-lg border px-3 py-2" value={durationUnit} onChange={e=>setDurationUnit(e.target.value)}><option value="HOURS">Hours</option><option value="DAYS">Days</option></select><input className="rounded-lg border px-3 py-2" type="number" step="0.0001" min="0" placeholder="Default commission %" value={termRate} onChange={e=>setTermRate(e.target.value)} required/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Term</button></form>
   <form onSubmit={addCategory} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-3"><h3 className="font-semibold sm:col-span-3">Expense Category</h3><input className="rounded-lg border px-3 py-2" placeholder="Category name" value={categoryName} onChange={e=>setCategoryName(e.target.value)} required/><select className="rounded-lg border px-3 py-2" value={categoryUsage} onChange={e=>setCategoryUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Both</option></select><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Category</button></form>
  </section>

  <form onSubmit={addRule} className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-4 xl:grid-cols-8">
   <h3 className="font-semibold md:col-span-4 xl:col-span-8">Commission Override Rule</h3>
   <select className="rounded-lg border px-3 py-2" value={ruleCustomer} onChange={e=>setRuleCustomer(e.target.value)}><option value="">Any customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleProvider} onChange={e=>{setRuleProvider(e.target.value);setRuleGateway("");}}><option value="">Any provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleGateway} onChange={e=>setRuleGateway(e.target.value)}><option value="">Any gateway</option>{selectedProvider?.gateways.filter(g=>g.isActive).map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleTerm} onChange={e=>setRuleTerm(e.target.value)}><option value="">Any term</option>{terms.filter(t=>t.isActive).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleType} onChange={e=>setRuleType(e.target.value)}><option value="CARD_SWIPE">Card Swipe</option><option value="CASH_TRANSFER">Cash Transfer</option><option value="AEPS_WITHDRAWAL">AePS</option></select>
   <select className="rounded-lg border px-3 py-2" value={ruleCalc} onChange={e=>setRuleCalc(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></select>
   <input className="rounded-lg border px-3 py-2" type="number" step="0.0001" min="0" placeholder="Rate / amount" value={ruleRate} onChange={e=>setRuleRate(e.target.value)} required/>
   <button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Rule</button>
  </form>

  <section className="grid gap-5 xl:grid-cols-3">
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Providers & Gateways</h3><div className="mt-4 space-y-5">{providers.map(p=><div key={p.id} className={!p.isActive?"opacity-60":""}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.providerType} · {p.isActive?"Active":"Inactive"}</p></div><div className="flex gap-1"><button onClick={()=>editProvider(p)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggleProvider(p)} className="rounded border px-2 py-1 text-xs">{p.isActive?"Retire":"Reactivate"}</button></div></div><ul className="mt-2 space-y-2 text-sm">{p.gateways.map(g=><li key={g.id} className={"flex items-center justify-between gap-2 rounded bg-slate-50 p-2 "+(!g.isActive?"opacity-60":"")}><span>{g.gatewayName} · {Number(g.defaultChargeRate)}% · {g.isActive?"Active":"Inactive"}</span><span className="flex gap-1"><button onClick={()=>editGateway(g)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggleGateway(g)} className="rounded border px-2 py-1 text-xs">{g.isActive?"Retire":"Reactivate"}</button></span></li>)}</ul></div>)}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Payment Terms</h3><div className="mt-4 space-y-2">{terms.map(t=><div key={t.id} className={"rounded bg-slate-50 p-2 text-sm "+(!t.isActive?"opacity-60":"")}><div className="flex justify-between"><span>{t.name} · {Number(t.defaultCommissionRate)}%</span><span>{t.isActive?"Active":"Inactive"}</span></div><div className="mt-2 flex gap-1"><button onClick={()=>editTerm(t)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggleTerm(t)} className="rounded border px-2 py-1 text-xs">{t.isActive?"Retire":"Reactivate"}</button></div></div>)}</div><h3 className="mt-6 font-semibold">Expense Categories</h3><div className="mt-3 space-y-2">{categories.map(c=><div key={c.id} className={"rounded bg-slate-50 p-2 text-sm "+(!c.isActive?"opacity-60":"")}><div className="flex justify-between"><span>{c.name} · {c.expenseUsage}</span><span>{c.isActive?"Active":"Inactive"}</span></div><div className="mt-2 flex gap-1"><button onClick={()=>editCategory(c)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggleCategory(c)} className="rounded border px-2 py-1 text-xs">{c.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Commission Rules</h3><div className="mt-4 space-y-3">{rules.map(r=><div key={r.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!r.isActive?"opacity-60":"")}><p className="font-medium">{r.transactionType} · {Number(r.commissionRate)}{r.commissionType==="PERCENTAGE"?"%":" fixed"} · {r.isActive?"Active":"Inactive"}</p><p className="mt-1 text-xs text-slate-500">{r.customerId?"Customer-specific":"Any customer"} · {r.paymentTerm?.name||"Any term"}</p><div className="mt-2 flex gap-1"><button onClick={()=>editRule(r)} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggleRule(r)} className="rounded border px-2 py-1 text-xs">{r.isActive?"Retire":"Reactivate"}</button></div></div>)}{!rules.length?<p className="text-sm text-slate-500">No override rules.</p>:null}</div></div>
  </section>
 </div></AppShell>;
}
