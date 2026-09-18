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
type EditState=
 | {kind:"provider";item:Provider}
 | {kind:"gateway";item:Gateway}
 | {kind:"term";item:Term}
 | {kind:"category";item:Category}
 | {kind:"rule";item:Rule}
 | null;

export default function SettingsPage(){
 const [providers,setProviders]=useState<Provider[]>([]),[terms,setTerms]=useState<Term[]>([]),[categories,setCategories]=useState<Category[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[rules,setRules]=useState<Rule[]>([]);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const [providerName,setProviderName]=useState(""),[providerType,setProviderType]=useState("MULTI_SERVICE");
 const [gatewayProvider,setGatewayProvider]=useState(""),[gatewayName,setGatewayName]=useState(""),[gatewayRate,setGatewayRate]=useState("");
 const [termName,setTermName]=useState(""),[durationValue,setDurationValue]=useState("0"),[durationUnit,setDurationUnit]=useState("DAYS"),[termRate,setTermRate]=useState("0");
 const [categoryName,setCategoryName]=useState(""),[categoryUsage,setCategoryUsage]=useState("BUSINESS");
 const [ruleCustomer,setRuleCustomer]=useState(""),[ruleProvider,setRuleProvider]=useState(""),[ruleGateway,setRuleGateway]=useState(""),[ruleTerm,setRuleTerm]=useState(""),[ruleType,setRuleType]=useState("CARD_SWIPE"),[ruleCalc,setRuleCalc]=useState("PERCENTAGE"),[ruleRate,setRuleRate]=useState("");
 const [edit,setEdit]=useState<EditState>(null),[e1,setE1]=useState(""),[e2,setE2]=useState(""),[e3,setE3]=useState(""),[e4,setE4]=useState("");

 const load=()=>Promise.all([
  apiFetch<Provider[]>("/providers?includeInactive=true"),
  apiFetch<Term[]>("/settings/payment-terms?includeInactive=true"),
  apiFetch<Category[]>("/settings/expense-categories?includeInactive=true"),
  apiFetch<Customer[]>("/customers"),
  apiFetch<Rule[]>("/settings/commission-rules?includeInactive=true"),
 ]).then(([p,t,c,cu,r])=>{setProviders(p);setTerms(t);setCategories(c);setCustomers(cu);setRules(r);});
 useEffect(()=>{load().catch(()=>setError("You need Owner/Admin access to manage settings."));},[]);

 async function run(action:()=>Promise<unknown>,reset:()=>void=()=>{},success="Saved."){
  setError("");setMessage("");
  try{await action();reset();await load();setMessage(success);}
  catch(err){setError(err instanceof Error?err.message:"Save failed");throw err;}
 }
 async function addProvider(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/providers",{method:"POST",body:JSON.stringify({name:providerName,providerType})}),()=>setProviderName(""),"Provider added.");}catch{}}
 async function addGateway(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/providers/"+gatewayProvider+"/gateways",{method:"POST",body:JSON.stringify({gatewayName,defaultChargeType:"PERCENTAGE",defaultChargeRate:Number(gatewayRate)})}),()=>{setGatewayName("");setGatewayRate("");},"Gateway added.");}catch{}}
 async function addTerm(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/payment-terms",{method:"POST",body:JSON.stringify({name:termName,durationValue:Number(durationValue),durationUnit,defaultCommissionType:"PERCENTAGE",defaultCommissionRate:Number(termRate)})}),()=>{setTermName("");setDurationValue("0");setTermRate("0");},"Payment term added.");}catch{}}
 async function addCategory(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/expense-categories",{method:"POST",body:JSON.stringify({name:categoryName,expenseUsage:categoryUsage})}),()=>setCategoryName(""),"Expense category added.");}catch{}}
 async function addRule(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/commission-rules",{method:"POST",body:JSON.stringify({customerId:ruleCustomer||undefined,providerId:ruleProvider||undefined,gatewayId:ruleGateway||undefined,paymentTermId:ruleTerm||undefined,transactionType:ruleType,commissionType:ruleCalc,commissionRate:Number(ruleRate)})}),()=>{setRuleCustomer("");setRuleGateway("");setRuleTerm("");setRuleRate("");},"Commission rule added.");}catch{}}

 function beginEdit(next:Exclude<EditState,null>){
  setEdit(next);setError("");setMessage("");
  if(next.kind==="provider"){setE1(next.item.name);setE2(next.item.providerType);setE3("");setE4("");}
  if(next.kind==="gateway"){setE1(next.item.gatewayName);setE2(String(Number(next.item.defaultChargeRate)));setE3(next.item.defaultChargeType);setE4("");}
  if(next.kind==="term"){setE1(next.item.name);setE2(String(next.item.durationValue));setE3(next.item.durationUnit);setE4(String(Number(next.item.defaultCommissionRate)));}
  if(next.kind==="category"){setE1(next.item.name);setE2(next.item.expenseUsage);setE3("");setE4("");}
  if(next.kind==="rule"){setE1(String(Number(next.item.commissionRate)));setE2(next.item.commissionType);setE3("");setE4("");}
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!edit)return;
  try{
   if(edit.kind==="provider")await run(()=>apiFetch("/providers/"+edit.item.id,{method:"PATCH",body:JSON.stringify({name:e1.trim(),providerType:e2})}),()=>{},"Provider updated.");
   if(edit.kind==="gateway")await run(()=>apiFetch("/providers/gateways/"+edit.item.id,{method:"PATCH",body:JSON.stringify({gatewayName:e1.trim(),defaultChargeRate:Number(e2),defaultChargeType:e3})}),()=>{},"Gateway updated.");
   if(edit.kind==="term")await run(()=>apiFetch("/settings/payment-terms/"+edit.item.id,{method:"PATCH",body:JSON.stringify({name:e1.trim(),durationValue:Number(e2),durationUnit:e3,defaultCommissionType:edit.item.defaultCommissionType,defaultCommissionRate:Number(e4)})}),()=>{},"Payment term updated.");
   if(edit.kind==="category")await run(()=>apiFetch("/settings/expense-categories/"+edit.item.id,{method:"PATCH",body:JSON.stringify({name:e1.trim(),expenseUsage:e2})}),()=>{},"Expense category updated.");
   if(edit.kind==="rule")await run(()=>apiFetch("/settings/commission-rules/"+edit.item.id,{method:"PATCH",body:JSON.stringify({commissionRate:Number(e1),commissionType:e2})}),()=>{},"Commission rule updated.");
   setEdit(null);
  }catch{}
 }

 async function toggle(path:string,isActive:boolean,label:string){
  if(!window.confirm((isActive?"Retire ":"Reactivate ")+label+"? Historical use is preserved."))return;
  try{await run(()=>apiFetch(path+"/active",{method:"PATCH",body:JSON.stringify({isActive:!isActive})}),()=>{},isActive?"Setting retired.":"Setting reactivated.");}catch{}
 }

 const selectedProvider=providers.find(p=>p.id===ruleProvider);
 return <AppShell><div className="mx-auto max-w-7xl space-y-6">
  <div><h2 className="text-2xl font-bold">Settings</h2><p className="text-sm text-slate-500">Providers, gateways, terms, categories and commission overrides. Retiring a setting preserves its historical use.</p></div>

  {edit?<form onSubmit={saveEdit} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
   <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Edit {edit.kind}</h3><p className="text-xs text-slate-500">Changes apply to future use; historical transactions remain intact.</p></div><button type="button" onClick={()=>setEdit(null)} className="text-sm font-semibold">Close</button></div>
   {edit.kind==="provider"?<div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Provider name" required/><select className="rounded-lg border bg-white px-3 py-2.5" value={e2} onChange={e=>setE2(e.target.value)}><option>MULTI_SERVICE</option><option>WALLET</option><option>CARD_PROVIDER</option><option>AEPS_PLATFORM</option></select></div>:null}
   {edit.kind==="gateway"?<div className="mt-4 grid gap-3 sm:grid-cols-3"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Gateway name" required/><input className="rounded-lg border bg-white px-3 py-2.5" type="number" min="0" step="0.0001" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Charge rate" required/><select className="rounded-lg border bg-white px-3 py-2.5" value={e3} onChange={e=>setE3(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></select></div>:null}
   {edit.kind==="term"?<div className="mt-4 grid gap-3 sm:grid-cols-4"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Term name" required/><input className="rounded-lg border bg-white px-3 py-2.5" type="number" min="0" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Duration"/><select className="rounded-lg border bg-white px-3 py-2.5" value={e3} onChange={e=>setE3(e.target.value)}><option value="HOURS">Hours</option><option value="DAYS">Days</option></select><input className="rounded-lg border bg-white px-3 py-2.5" type="number" min="0" step="0.0001" value={e4} onChange={e=>setE4(e.target.value)} placeholder="Commission rate"/></div>:null}
   {edit.kind==="category"?<div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="rounded-lg border bg-white px-3 py-2.5" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Category name" required/><select className="rounded-lg border bg-white px-3 py-2.5" value={e2} onChange={e=>setE2(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Both</option></select></div>:null}
   {edit.kind==="rule"?<div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="rounded-lg border bg-white px-3 py-2.5" type="number" min="0" step="0.0001" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Rate / amount"/><select className="rounded-lg border bg-white px-3 py-2.5" value={e2} onChange={e=>setE2(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></select></div>:null}
   <div className="mt-4 flex justify-end"><button className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white">Save Changes</button></div>
  </form>:null}

  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  {message?<p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{message}</p>:null}

  <section className="grid gap-5 xl:grid-cols-2">
   <form onSubmit={addProvider} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-3"><h3 className="font-semibold sm:col-span-3">Provider</h3><input className="rounded-lg border px-3 py-2" placeholder="PaySwitch / EzyPay" value={providerName} onChange={e=>setProviderName(e.target.value)} required/><select className="rounded-lg border px-3 py-2" value={providerType} onChange={e=>setProviderType(e.target.value)}><option>MULTI_SERVICE</option><option>WALLET</option><option>CARD_PROVIDER</option><option>AEPS_PLATFORM</option></select><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Provider</button></form>
   <form onSubmit={addGateway} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-4"><h3 className="font-semibold sm:col-span-4">Gateway</h3><select className="rounded-lg border px-3 py-2" value={gatewayProvider} onChange={e=>setGatewayProvider(e.target.value)} required><option value="">Provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input className="rounded-lg border px-3 py-2" placeholder="Gateway name" value={gatewayName} onChange={e=>setGatewayName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" type="number" step="0.0001" min="0" placeholder="Default charge %" value={gatewayRate} onChange={e=>setGatewayRate(e.target.value)} required/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Gateway</button></form>
   <form onSubmit={addTerm} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-5"><h3 className="font-semibold sm:col-span-5">Payment Term</h3><input className="rounded-lg border px-3 py-2" placeholder="Term name" value={termName} onChange={e=>setTermName(e.target.value)} required/><input className="rounded-lg border px-3 py-2" type="number" min="0" placeholder="Duration" value={durationValue} onChange={e=>setDurationValue(e.target.value)} required/><select className="rounded-lg border px-3 py-2" value={durationUnit} onChange={e=>setDurationUnit(e.target.value)}><option value="HOURS">Hours</option><option value="DAYS">Days</option></select><input className="rounded-lg border px-3 py-2" type="number" step="0.0001" min="0" placeholder="Default commission %" value={termRate} onChange={e=>setTermRate(e.target.value)} required/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Term</button></form>
   <form onSubmit={addCategory} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-3"><h3 className="font-semibold sm:col-span-3">Expense Category</h3><input className="rounded-lg border px-3 py-2" placeholder="Category name" value={categoryName} onChange={e=>setCategoryName(e.target.value)} required/><select className="rounded-lg border px-3 py-2" value={categoryUsage} onChange={e=>setCategoryUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Both</option></select><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Category</button></form>
  </section>

  <form onSubmit={addRule} className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-4 xl:grid-cols-8"><h3 className="font-semibold md:col-span-4 xl:col-span-8">Commission Override Rule</h3>
   <select className="rounded-lg border px-3 py-2" value={ruleCustomer} onChange={e=>setRuleCustomer(e.target.value)}><option value="">Any customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleProvider} onChange={e=>{setRuleProvider(e.target.value);setRuleGateway("");}}><option value="">Any provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleGateway} onChange={e=>setRuleGateway(e.target.value)}><option value="">Any gateway</option>{selectedProvider?.gateways.filter(g=>g.isActive).map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleTerm} onChange={e=>setRuleTerm(e.target.value)}><option value="">Any term</option>{terms.filter(t=>t.isActive).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
   <select className="rounded-lg border px-3 py-2" value={ruleType} onChange={e=>setRuleType(e.target.value)}><option value="CARD_SWIPE">Card Swipe</option><option value="CASH_TRANSFER">Cash Transfer</option><option value="AEPS_WITHDRAWAL">AePS</option></select>
   <select className="rounded-lg border px-3 py-2" value={ruleCalc} onChange={e=>setRuleCalc(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></select>
   <input className="rounded-lg border px-3 py-2" type="number" step="0.0001" min="0" placeholder="Rate / amount" value={ruleRate} onChange={e=>setRuleRate(e.target.value)} required/><button className="rounded-lg bg-slate-950 px-4 py-2 text-white">Add Rule</button>
  </form>

  <section className="grid gap-5 xl:grid-cols-3">
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Providers & Gateways</h3><div className="mt-4 space-y-5">{providers.map(p=><div key={p.id} className={!p.isActive?"opacity-60":""}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.providerType} · {p.isActive?"Active":"Inactive"}</p></div><div className="flex gap-1"><button onClick={()=>beginEdit({kind:"provider",item:p})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/providers/"+p.id,p.isActive,p.name)} className="rounded border px-2 py-1 text-xs">{p.isActive?"Retire":"Reactivate"}</button></div></div><ul className="mt-2 space-y-2 text-sm">{p.gateways.map(g=><li key={g.id} className={"flex items-center justify-between gap-2 rounded bg-slate-50 p-2 "+(!g.isActive?"opacity-60":"")}><span>{g.gatewayName} · {Number(g.defaultChargeRate)}% · {g.isActive?"Active":"Inactive"}</span><span className="flex gap-1"><button onClick={()=>beginEdit({kind:"gateway",item:g})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/providers/gateways/"+g.id,g.isActive,g.gatewayName)} className="rounded border px-2 py-1 text-xs">{g.isActive?"Retire":"Reactivate"}</button></span></li>)}</ul></div>)}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Payment Terms</h3><div className="mt-4 space-y-2">{terms.map(t=><div key={t.id} className={"rounded bg-slate-50 p-2 text-sm "+(!t.isActive?"opacity-60":"")}><div className="flex justify-between"><span>{t.name} · {Number(t.defaultCommissionRate)}%</span><span>{t.isActive?"Active":"Inactive"}</span></div><div className="mt-2 flex gap-1"><button onClick={()=>beginEdit({kind:"term",item:t})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/settings/payment-terms/"+t.id,t.isActive,t.name)} className="rounded border px-2 py-1 text-xs">{t.isActive?"Retire":"Reactivate"}</button></div></div>)}</div><h3 className="mt-6 font-semibold">Expense Categories</h3><div className="mt-3 space-y-2">{categories.map(c=><div key={c.id} className={"rounded bg-slate-50 p-2 text-sm "+(!c.isActive?"opacity-60":"")}><div className="flex justify-between"><span>{c.name} · {c.expenseUsage}</span><span>{c.isActive?"Active":"Inactive"}</span></div><div className="mt-2 flex gap-1"><button onClick={()=>beginEdit({kind:"category",item:c})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/settings/expense-categories/"+c.id,c.isActive,c.name)} className="rounded border px-2 py-1 text-xs">{c.isActive?"Retire":"Reactivate"}</button></div></div>)}</div></div>
   <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Commission Rules</h3><div className="mt-4 space-y-3">{rules.map(r=><div key={r.id} className={"rounded-lg bg-slate-50 p-3 text-sm "+(!r.isActive?"opacity-60":"")}><p className="font-medium">{r.transactionType} · {Number(r.commissionRate)}{r.commissionType==="PERCENTAGE"?"%":" fixed"} · {r.isActive?"Active":"Inactive"}</p><p className="mt-1 text-xs text-slate-500">{r.customerId?"Customer-specific":"Any customer"} · {r.paymentTerm?.name||"Any term"}</p><div className="mt-2 flex gap-1"><button onClick={()=>beginEdit({kind:"rule",item:r})} className="rounded border px-2 py-1 text-xs">Edit</button><button onClick={()=>toggle("/settings/commission-rules/"+r.id,r.isActive,"commission rule")} className="rounded border px-2 py-1 text-xs">{r.isActive?"Retire":"Reactivate"}</button></div></div>)}{!rules.length?<p className="text-sm text-slate-500">No override rules.</p>:null}</div></div>
  </section>
 </div></AppShell>;
}
