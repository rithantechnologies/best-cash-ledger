"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Modal, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
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
type CreateKind="provider"|"gateway"|"term"|"category"|"rule"|null;
type Area="payments"|"rules"|"expenses";
type ToggleState={path:string;isActive:boolean;label:string}|null;

const input="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400";
const primary="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800";
const secondary="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50";
export default function SettingsPage(){
 const [providers,setProviders]=useState<Provider[]>([]),[terms,setTerms]=useState<Term[]>([]),[categories,setCategories]=useState<Category[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[rules,setRules]=useState<Rule[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [area,setArea]=useState<Area>("payments"),[create,setCreate]=useState<CreateKind>(null),[toggleState,setToggleState]=useState<ToggleState>(null);
 const [providerName,setProviderName]=useState(""),[providerType,setProviderType]=useState("MULTI_SERVICE");
 const [gatewayProvider,setGatewayProvider]=useState(""),[gatewayName,setGatewayName]=useState(""),[gatewayRate,setGatewayRate]=useState("");
 const [termName,setTermName]=useState(""),[durationValue,setDurationValue]=useState("0"),[durationUnit,setDurationUnit]=useState("DAYS"),[termRate,setTermRate]=useState("0");
 const [categoryName,setCategoryName]=useState(""),[categoryUsage,setCategoryUsage]=useState("BUSINESS");
 const [ruleCustomer,setRuleCustomer]=useState(""),[ruleProvider,setRuleProvider]=useState(""),[ruleGateway,setRuleGateway]=useState(""),[ruleTerm,setRuleTerm]=useState(""),[ruleType,setRuleType]=useState("CARD_SWIPE"),[ruleCalc,setRuleCalc]=useState("PERCENTAGE"),[ruleRate,setRuleRate]=useState("");
 const [edit,setEdit]=useState<EditState>(null),[e1,setE1]=useState(""),[e2,setE2]=useState(""),[e3,setE3]=useState(""),[e4,setE4]=useState("");

 const load=useCallback(async()=>{
  const [p,t,c,cu,r]=await Promise.all([
   apiFetch<Provider[]>("/providers?includeInactive=true"),
   apiFetch<Term[]>("/settings/payment-terms?includeInactive=true"),
   apiFetch<Category[]>("/settings/expense-categories?includeInactive=true"),
   apiFetch<Customer[]>("/customers"),
   apiFetch<Rule[]>("/settings/commission-rules?includeInactive=true"),
  ]);
  setProviders(p);setTerms(t);setCategories(c);setCustomers(cu);setRules(r);
 },[]);
 useEffect(()=>{
  setLoading(true);
  load().catch(()=>setError("You need Owner/Admin access to manage settings.")).finally(()=>setLoading(false));
 },[load]);

 async function run(action:()=>Promise<unknown>,reset:()=>void=()=>{},success="Saved."){
  setError("");setMessage("");
  try{await action();reset();await load();setMessage(success);window.setTimeout(()=>setMessage(""),2600);}
  catch(err){setError(err instanceof Error?err.message:"Save failed");throw err;}
 }
 async function addProvider(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/providers",{method:"POST",body:JSON.stringify({name:providerName,providerType})}),()=>{setProviderName("");setCreate(null);},"Provider added.");}catch{}}
 async function addGateway(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/providers/"+gatewayProvider+"/gateways",{method:"POST",body:JSON.stringify({gatewayName,defaultChargeType:"PERCENTAGE",defaultChargeRate:Number(gatewayRate)})}),()=>{setGatewayName("");setGatewayRate("");setCreate(null);},"Gateway added.");}catch{}}
 async function addTerm(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/payment-terms",{method:"POST",body:JSON.stringify({name:termName,durationValue:Number(durationValue),durationUnit,defaultCommissionType:"PERCENTAGE",defaultCommissionRate:Number(termRate)})}),()=>{setTermName("");setDurationValue("0");setTermRate("0");setCreate(null);},"Payment term added.");}catch{}}
 async function addCategory(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/expense-categories",{method:"POST",body:JSON.stringify({name:categoryName,expenseUsage:categoryUsage})}),()=>{setCategoryName("");setCreate(null);},"Expense category added.");}catch{}}
 async function addRule(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/commission-rules",{method:"POST",body:JSON.stringify({customerId:ruleCustomer||undefined,providerId:ruleProvider||undefined,gatewayId:ruleGateway||undefined,paymentTermId:ruleTerm||undefined,transactionType:ruleType,commissionType:ruleCalc,commissionRate:Number(ruleRate)})}),()=>{setRuleCustomer("");setRuleGateway("");setRuleTerm("");setRuleRate("");setCreate(null);},"Commission rule added.");}catch{}}

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
 async function confirmToggle(){
  if(!toggleState)return;
  const {path,isActive}=toggleState;
  try{await run(()=>apiFetch(path+"/active",{method:"PATCH",body:JSON.stringify({isActive:!isActive})}),()=>{},isActive?"Setting retired.":"Setting reactivated.");setToggleState(null);}catch{}
 }

 const selectedProvider=providers.find(p=>p.id===ruleProvider);
 const activeProviders=providers.filter(p=>p.isActive).length;
 const activeGateways=providers.flatMap(p=>p.gateways).filter(g=>g.isActive).length;
 const activeTerms=terms.filter(t=>t.isActive).length;
 const activeRules=rules.filter(r=>r.isActive).length;
 const activeCategories=categories.filter(c=>c.isActive).length;
 const tabs=[
  {id:"payments" as const,label:"Payments",desc:"Providers & gateways",count:activeProviders+activeGateways},
  {id:"rules" as const,label:"Terms & commission",desc:"Settlement timing & overrides",count:activeTerms+activeRules},
  {id:"expenses" as const,label:"Expenses",desc:"Expense categories",count:activeCategories},
 ];

 if(loading)return <AppShell><PageLoader label="Loading settings…"/></AppShell>;

 return <AppShell><div className="page-enter mx-auto max-w-7xl space-y-5">
  <SectionHeading eyebrow="Configuration" title="Settings" description="Manage the rules that shape daily operations. Only the workspace you choose is shown, so the page stays focused."/>

  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}

  <div className="grid gap-2 sm:grid-cols-3">{tabs.map(tab=><button key={tab.id} onClick={()=>setArea(tab.id)}
    className={"group rounded-2xl border p-4 text-left transition "+(area===tab.id?"border-indigo-200 bg-indigo-50/70 shadow-sm":"border-slate-200 bg-white hover:border-slate-300")}>
    <div className="flex items-start justify-between gap-3"><div><p className={"text-sm font-bold "+(area===tab.id?"text-indigo-800":"text-slate-800")}>{tab.label}</p><p className="mt-0.5 text-xs text-slate-500">{tab.desc}</p></div><span className={"grid h-8 min-w-8 place-items-center rounded-xl px-2 text-xs font-bold "+(area===tab.id?"bg-indigo-600 text-white":"bg-slate-100 text-slate-500")}>{tab.count}</span></div>
  </button>)}</div>
  {area==="payments"?<div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      <Surface className="p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Active providers</p><p className="mt-1 text-2xl font-black">{activeProviders}</p></Surface>
      <Surface className="p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Active gateways</p><p className="mt-1 text-2xl font-black">{activeGateways}</p></Surface>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold tracking-tight">Payment network</h3><p className="text-xs text-slate-500">Providers and their processing gateways.</p></div><div className="flex gap-2"><button onClick={()=>setCreate("provider")} className={secondary}>+ Provider</button><button onClick={()=>setCreate("gateway")} className={primary}>+ Gateway</button></div></div>
    {providers.length?<div className="grid gap-3 lg:grid-cols-2">{providers.map(p=><Surface key={p.id} className={!p.isActive?"p-4 opacity-60":"p-4"}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-bold">{p.name}</p><StatusBadge tone={p.isActive?"emerald":"slate"}>{p.isActive?"Active":"Inactive"}</StatusBadge></div><p className="mt-1 text-xs text-slate-400">{p.providerType.replaceAll("_"," ")}</p></div><div className="flex gap-1.5"><button onClick={()=>beginEdit({kind:"provider",item:p})} className={secondary}>Edit</button><button onClick={()=>setToggleState({path:"/providers/"+p.id,isActive:p.isActive,label:p.name})} className={secondary}>{p.isActive?"Retire":"Activate"}</button></div></div>
      <div className="mt-4 space-y-2">{p.gateways.map(g=><div key={g.id} className={"flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100 "+(!g.isActive?"opacity-60":"")}><div className="min-w-0"><p className="truncate text-sm font-semibold">{g.gatewayName}</p><p className="mt-0.5 text-[11px] text-slate-400">{Number(g.defaultChargeRate)}% default charge · {g.defaultChargeType.toLowerCase()}</p></div><div className="flex shrink-0 gap-1.5"><button onClick={()=>beginEdit({kind:"gateway",item:g})} className={secondary}>Edit</button><button onClick={()=>setToggleState({path:"/providers/gateways/"+g.id,isActive:g.isActive,label:g.gatewayName})} className={secondary}>{g.isActive?"Retire":"Activate"}</button></div></div>)}{!p.gateways.length?<p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">No gateways configured.</p>:null}</div>
    </Surface>)}</div>:<EmptyState title="No payment providers configured" description="Add a provider, then add its gateways."/>}
  </div>:null}
  {area==="rules"?<div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      <Surface className="p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Active payment terms</p><p className="mt-1 text-2xl font-black">{activeTerms}</p></Surface>
      <Surface className="p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Active commission rules</p><p className="mt-1 text-2xl font-black">{activeRules}</p></Surface>
    </div>
    <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
      <Surface className="p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-bold">Payment terms</h3><p className="text-xs text-slate-500">Settlement timing and default commission.</p></div><button onClick={()=>setCreate("term")} className={primary}>+ Term</button></div>
        <div className="space-y-2">{terms.map(t=><div key={t.id} className={"rounded-2xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100 "+(!t.isActive?"opacity-60":"")}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{t.name}</p><StatusBadge tone={t.isActive?"emerald":"slate"}>{t.isActive?"Active":"Inactive"}</StatusBadge></div><p className="mt-1 text-xs text-slate-500">{t.durationValue} {t.durationUnit.toLowerCase()} · {Number(t.defaultCommissionRate)}% default commission</p></div><div className="flex gap-1.5"><button onClick={()=>beginEdit({kind:"term",item:t})} className={secondary}>Edit</button><button onClick={()=>setToggleState({path:"/settings/payment-terms/"+t.id,isActive:t.isActive,label:t.name})} className={secondary}>{t.isActive?"Retire":"Activate"}</button></div></div></div>)}{!terms.length?<EmptyState title="No payment terms yet"/>:null}</div>
      </Surface>
      <Surface className="p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-bold">Commission overrides</h3><p className="text-xs text-slate-500">Specific exceptions override the defaults above.</p></div><button onClick={()=>setCreate("rule")} className={primary}>+ Rule</button></div>
        <div className="space-y-2">{rules.map(r=><div key={r.id} className={"rounded-2xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100 "+(!r.isActive?"opacity-60":"")}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{r.transactionType.replaceAll("_"," ")}</p><StatusBadge tone={r.isActive?"emerald":"slate"}>{r.isActive?"Active":"Inactive"}</StatusBadge></div><p className="mt-1 text-xs text-slate-500">{Number(r.commissionRate)}{r.commissionType==="PERCENTAGE"?"%":" fixed"} · {r.customerId?"Customer-specific":"Any customer"} · {r.paymentTerm?.name||"Any term"}</p></div><div className="flex gap-1.5"><button onClick={()=>beginEdit({kind:"rule",item:r})} className={secondary}>Edit</button><button onClick={()=>setToggleState({path:"/settings/commission-rules/"+r.id,isActive:r.isActive,label:"commission rule"})} className={secondary}>{r.isActive?"Retire":"Activate"}</button></div></div></div>)}{!rules.length?<EmptyState title="No commission override rules" description="Defaults will apply until you add an exception."/>:null}</div>
      </Surface>
    </div>
  </div>:null}
  {area==="expenses"?<div className="space-y-4">
    <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Active categories</p><p className="mt-1 text-3xl font-black">{activeCategories}</p></div><button onClick={()=>setCreate("category")} className={primary}>+ Expense category</button></div>
    {categories.length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.map(c=><Surface key={c.id} className={!c.isActive?"p-4 opacity-60":"p-4"}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{c.name}</p><StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge></div><p className="mt-1 text-xs text-slate-500">{c.expenseUsage==="MIXED"?"Business & personal":c.expenseUsage.toLowerCase()}</p></div><div className="flex gap-1.5"><button onClick={()=>beginEdit({kind:"category",item:c})} className={secondary}>Edit</button><button onClick={()=>setToggleState({path:"/settings/expense-categories/"+c.id,isActive:c.isActive,label:c.name})} className={secondary}>{c.isActive?"Retire":"Activate"}</button></div></div></Surface>)}</div>:<EmptyState title="No expense categories yet"/>}
  </div>:null}

  <Modal open={create==="provider"} title="Add provider" description="Create the service provider first; gateways can be attached next." onClose={()=>setCreate(null)}>
    <form onSubmit={addProvider} className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Provider name</span><input className={input} placeholder="PaySwitch / EzyPay" value={providerName} onChange={e=>setProviderName(e.target.value)} required/></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Provider type</span><select className={input} value={providerType} onChange={e=>setProviderType(e.target.value)}><option>MULTI_SERVICE</option><option>WALLET</option><option>CARD_PROVIDER</option><option>AEPS_PLATFORM</option></select></label><button className={primary+" w-full"}>Add Provider</button></form>
  </Modal>
  <Modal open={create==="gateway"} title="Add gateway" description="Attach a processing gateway to an active provider." onClose={()=>setCreate(null)}>
    <form onSubmit={addGateway} className="space-y-4"><select className={input} value={gatewayProvider} onChange={e=>setGatewayProvider(e.target.value)} required><option value="">Select provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input className={input} placeholder="Gateway name" value={gatewayName} onChange={e=>setGatewayName(e.target.value)} required/><input className={input} type="number" step="0.0001" min="0" placeholder="Default charge %" value={gatewayRate} onChange={e=>setGatewayRate(e.target.value)} required/><button className={primary+" w-full"}>Add Gateway</button></form>
  </Modal>

  <Modal open={create==="term"} title="Add payment term" description="Define settlement timing and the default commission rate." onClose={()=>setCreate(null)}>
    <form onSubmit={addTerm} className="grid gap-3 sm:grid-cols-2"><input className={input} placeholder="Term name" value={termName} onChange={e=>setTermName(e.target.value)} required/><input className={input} type="number" min="0" placeholder="Duration" value={durationValue} onChange={e=>setDurationValue(e.target.value)} required/><select className={input} value={durationUnit} onChange={e=>setDurationUnit(e.target.value)}><option value="HOURS">Hours</option><option value="DAYS">Days</option></select><input className={input} type="number" step="0.0001" min="0" placeholder="Default commission %" value={termRate} onChange={e=>setTermRate(e.target.value)} required/><button className={primary+" sm:col-span-2"}>Add Payment Term</button></form>
  </Modal>

  <Modal open={create==="category"} title="Add expense category" description="Categories keep business and personal spending easy to scan." onClose={()=>setCreate(null)}>
    <form onSubmit={addCategory} className="space-y-4"><input className={input} placeholder="Category name" value={categoryName} onChange={e=>setCategoryName(e.target.value)} required/><select className={input} value={categoryUsage} onChange={e=>setCategoryUsage(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Both</option></select><button className={primary+" w-full"}>Add Category</button></form>
  </Modal>
  <Modal open={create==="rule"} title="Add commission override" description="Use an override only when the default term or gateway rate should not apply." onClose={()=>setCreate(null)}>
    <form onSubmit={addRule} className="grid gap-3 sm:grid-cols-2">
      <select className={input} value={ruleCustomer} onChange={e=>setRuleCustomer(e.target.value)}><option value="">Any customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
      <select className={input} value={ruleProvider} onChange={e=>{setRuleProvider(e.target.value);setRuleGateway("");}}><option value="">Any provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className={input} value={ruleGateway} onChange={e=>setRuleGateway(e.target.value)}><option value="">Any gateway</option>{selectedProvider?.gateways.filter(g=>g.isActive).map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select>
      <select className={input} value={ruleTerm} onChange={e=>setRuleTerm(e.target.value)}><option value="">Any payment term</option>{terms.filter(t=>t.isActive).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select className={input} value={ruleType} onChange={e=>setRuleType(e.target.value)}><option value="CARD_SWIPE">Card Swipe</option><option value="CASH_TRANSFER">Cash Transfer</option><option value="AEPS_WITHDRAWAL">AePS</option></select>
      <select className={input} value={ruleCalc} onChange={e=>setRuleCalc(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></select>
      <input className={input} type="number" step="0.0001" min="0" placeholder="Rate / amount" value={ruleRate} onChange={e=>setRuleRate(e.target.value)} required/>
      <button className={primary}>Add Rule</button>
    </form>
  </Modal>
  <Modal open={!!edit} title={"Edit "+(edit?.kind??"setting")} description="Changes apply to future use; historical transactions remain intact." onClose={()=>setEdit(null)}>
    <form onSubmit={saveEdit} className="space-y-3">
      {edit?.kind==="provider"?<><input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Provider name" required/><select className={input} value={e2} onChange={e=>setE2(e.target.value)}><option>MULTI_SERVICE</option><option>WALLET</option><option>CARD_PROVIDER</option><option>AEPS_PLATFORM</option></select></>:null}
      {edit?.kind==="gateway"?<><input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Gateway name" required/><input className={input} type="number" min="0" step="0.0001" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Charge rate" required/><select className={input} value={e3} onChange={e=>setE3(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></select></>:null}
      {edit?.kind==="term"?<div className="grid gap-3 sm:grid-cols-2"><input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Term name" required/><input className={input} type="number" min="0" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Duration"/><select className={input} value={e3} onChange={e=>setE3(e.target.value)}><option value="HOURS">Hours</option><option value="DAYS">Days</option></select><input className={input} type="number" min="0" step="0.0001" value={e4} onChange={e=>setE4(e.target.value)} placeholder="Commission rate"/></div>:null}
      {edit?.kind==="category"?<><input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Category name" required/><select className={input} value={e2} onChange={e=>setE2(e.target.value)}><option value="BUSINESS">Business</option><option value="PERSONAL">Personal</option><option value="MIXED">Both</option></select></>:null}
      {edit?.kind==="rule"?<><input className={input} type="number" min="0" step="0.0001" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Rate / amount"/><select className={input} value={e2} onChange={e=>setE2(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></select></>:null}
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setEdit(null)} className={secondary}>Cancel</button><button className={primary}>Save changes</button></div>
    </form>
  </Modal>

  <Modal open={!!toggleState} title={toggleState?.isActive?"Retire setting?":"Reactivate setting?"} description="Historical transactions and references will remain unchanged." onClose={()=>setToggleState(null)}>
    <p className="text-sm leading-6 text-slate-600">{toggleState?.isActive?"Retire":"Reactivate"} <strong>{toggleState?.label}</strong>? This only changes whether it can be used for future transactions.</p>
    <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setToggleState(null)} className={secondary}>Cancel</button><button onClick={confirmToggle} className={primary}>{toggleState?.isActive?"Retire":"Reactivate"}</button></div>
  </Modal>
 </div></AppShell>;
}
