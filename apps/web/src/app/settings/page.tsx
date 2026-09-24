"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Modal, PageLoader, Surface } from "@/components/ui";
import { SettingsWorkspace } from "@/app/settings/settings-modern";
import { apiFetch } from "@/lib/api";

type Gateway={id:string;gatewayName:string;defaultChargeRate:string;defaultChargeType:string;isActive:boolean};
type Provider={id:string;name:string;providerType:string;supportsAeps:boolean;aepsCommissionRate:string;isActive:boolean;gateways:Gateway[]};
type Term={id:string;name:string;durationValue:number;durationUnit:string;defaultCommissionType:string;defaultCommissionRate:string;isActive:boolean};
type Category={id:string;name:string;expenseUsage:string;isActive:boolean};
type ServiceConfig={id:string;name:string;defaultAmount:string|number|null;isActive:boolean};
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
type ToggleState={path:string;isActive:boolean;label:string}|null;

const input="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent)_10%,transparent)]";
const primary="app-primary-button min-h-11 px-4 text-sm font-bold";
const secondary="app-secondary-button min-h-10 px-3 text-xs font-bold";
export default function SettingsPage(){
 const [providers,setProviders]=useState<Provider[]>([]),[terms,setTerms]=useState<Term[]>([]),[categories,setCategories]=useState<Category[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[rules,setRules]=useState<Rule[]>([]),[services,setServices]=useState<ServiceConfig[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [create,setCreate]=useState<CreateKind>(null),[toggleState,setToggleState]=useState<ToggleState>(null);
 const [providerName,setProviderName]=useState(""),[providerType,setProviderType]=useState("MULTI_SERVICE"),[providerSupportsAeps,setProviderSupportsAeps]=useState(false),[providerAepsRate,setProviderAepsRate]=useState("0");
 const [gatewayProvider,setGatewayProvider]=useState(""),[gatewayName,setGatewayName]=useState(""),[gatewayRate,setGatewayRate]=useState("");
 const [termName,setTermName]=useState(""),[durationValue,setDurationValue]=useState("0"),[durationUnit,setDurationUnit]=useState("DAYS"),[termRate,setTermRate]=useState("0");
 const [categoryName,setCategoryName]=useState("");
 const [ruleCustomer,setRuleCustomer]=useState(""),[ruleProvider,setRuleProvider]=useState(""),[ruleGateway,setRuleGateway]=useState(""),[ruleTerm,setRuleTerm]=useState(""),[ruleType,setRuleType]=useState("CARD_SWIPE"),[ruleCalc,setRuleCalc]=useState("PERCENTAGE"),[ruleRate,setRuleRate]=useState("");
 const [edit,setEdit]=useState<EditState>(null),[e1,setE1]=useState(""),[e2,setE2]=useState(""),[e3,setE3]=useState(""),[e4,setE4]=useState("");
 const [serviceName,setServiceName]=useState(""),[serviceDefaultAmount,setServiceDefaultAmount]=useState("");
 const [serviceEdit,setServiceEdit]=useState<ServiceConfig|null>(null),[serviceEditName,setServiceEditName]=useState(""),[serviceEditAmount,setServiceEditAmount]=useState("");

 const load=useCallback(async()=>{
  const [p,t,c,cu,r,s]=await Promise.all([
   apiFetch<Provider[]>("/providers?includeInactive=true"),
   apiFetch<Term[]>("/settings/payment-terms?includeInactive=true"),
   apiFetch<Category[]>("/settings/expense-categories?includeInactive=true"),
   apiFetch<Customer[]>("/customers"),
   apiFetch<Rule[]>("/settings/commission-rules?includeInactive=true"),
   apiFetch<ServiceConfig[]>("/settings/services?includeInactive=true"),
  ]);
  setProviders(p);setTerms(t);setCategories(c);setCustomers(cu);setRules(r);setServices(s);
 },[]);
 useEffect(()=>{
  setLoading(true);
  load().catch(()=>setError("You need Owner/Admin access to manage settings.")).finally(()=>setLoading(false));
 },[load]);

 async function run(action:()=>Promise<unknown>,reset:()=>void=()=>{},success="Saved."){
  setError("");setMessage("");
  try{await action();reset();await load();try{localStorage.setItem("cashledger_settings_updated_at",String(Date.now()));}catch{}setMessage(success);window.setTimeout(()=>setMessage(""),2600);}
  catch(err){setError(err instanceof Error?err.message:"Save failed");throw err;}
 }
 async function addProvider(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/providers",{method:"POST",body:JSON.stringify({name:providerName,providerType,supportsAeps:providerSupportsAeps,aepsCommissionRate:Number(providerAepsRate||0)})}),()=>{setProviderName("");setProviderSupportsAeps(false);setProviderAepsRate("0");setCreate(null);},"Provider added.");}catch{}}
 async function addGateway(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/providers/"+gatewayProvider+"/gateways",{method:"POST",body:JSON.stringify({gatewayName,defaultChargeType:"PERCENTAGE",defaultChargeRate:Number(gatewayRate)})}),()=>{setGatewayName("");setGatewayRate("");setCreate(null);},"Gateway added.");}catch{}}
 async function addTerm(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/payment-terms",{method:"POST",body:JSON.stringify({name:termName,durationValue:Number(durationValue),durationUnit,defaultCommissionType:"PERCENTAGE",defaultCommissionRate:Number(termRate)})}),()=>{setTermName("");setDurationValue("0");setTermRate("0");setCreate(null);},"Payment term added.");}catch{}}
 async function addService(e:FormEvent){
  e.preventDefault();
  const name=serviceName.trim();if(!name)return;
  try{await run(()=>apiFetch("/settings/services",{method:"POST",body:JSON.stringify({name,defaultAmount:serviceDefaultAmount.trim()===""?undefined:Number(serviceDefaultAmount)})}),()=>{setServiceName("");setServiceDefaultAmount("");},"Service added.");}catch{}
 }
 function beginServiceEdit(item:ServiceConfig){setServiceEdit(item);setServiceEditName(item.name);setServiceEditAmount(item.defaultAmount===null||item.defaultAmount===undefined?"":String(Number(item.defaultAmount)));}
 async function saveServiceEdit(e:FormEvent){
  e.preventDefault();if(!serviceEdit)return;
  try{await run(()=>apiFetch("/settings/services/"+serviceEdit.id,{method:"PATCH",body:JSON.stringify({name:serviceEditName.trim(),defaultAmount:serviceEditAmount.trim()===""?null:Number(serviceEditAmount)})}),()=>setServiceEdit(null),"Service updated.");}catch{}
 }
 async function toggleService(item:ServiceConfig){
  try{await run(()=>apiFetch("/settings/services/"+item.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:!item.isActive})}),()=>{},item.isActive?"Service retired.":"Service activated.");}catch{}
 }
 async function addCategory(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/expense-categories",{method:"POST",body:JSON.stringify({name:categoryName,expenseUsage:"MIXED"})}),()=>{setCategoryName("");setCreate(null);},"Expense category added.");}catch{}}
 async function quickAddCategory(name:string){try{await run(()=>apiFetch("/settings/expense-categories",{method:"POST",body:JSON.stringify({name,expenseUsage:"MIXED"})}),()=>{},name+" added.");}catch{}}
 async function saveServiceDefault(transactionType:"CARD_SWIPE"|"CASH_TRANSFER"|"AEPS_WITHDRAWAL",rate:number,label:string){
  const existing=rules.find(r=>r.transactionType===transactionType&&!r.customerId&&!r.providerId&&!r.gatewayId&&!r.paymentTermId);
  await run(async()=>{
   if(existing){
    await apiFetch("/settings/commission-rules/"+existing.id,{method:"PATCH",body:JSON.stringify({commissionType:"PERCENTAGE",commissionRate:rate})});
    if(!existing.isActive)await apiFetch("/settings/commission-rules/"+existing.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:true})});
   }else{
    await apiFetch("/settings/commission-rules",{method:"POST",body:JSON.stringify({transactionType,commissionType:"PERCENTAGE",commissionRate:rate})});
   }
  },()=>{},label+" default updated.");
 }
 async function saveCashTransferDefault(rate:number){await saveServiceDefault("CASH_TRANSFER",rate,"Cash transfer");}
 async function saveCardSwipeDefault(rate:number){await saveServiceDefault("CARD_SWIPE",rate,"Card swipe");}
 async function saveAepsDefault(rate:number){await saveServiceDefault("AEPS_WITHDRAWAL",rate,"AEPS");}
 async function addRule(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/settings/commission-rules",{method:"POST",body:JSON.stringify({customerId:ruleCustomer||undefined,providerId:ruleProvider||undefined,gatewayId:ruleGateway||undefined,paymentTermId:ruleTerm||undefined,transactionType:ruleType,commissionType:ruleCalc,commissionRate:Number(ruleRate)})}),()=>{setRuleCustomer("");setRuleGateway("");setRuleTerm("");setRuleRate("");setCreate(null);},"Commission rule added.");}catch{}}

 function beginEdit(next:Exclude<EditState,null>){
  setEdit(next);setError("");setMessage("");
  if(next.kind==="provider"){setE1(next.item.name);setE2(next.item.providerType);setE3(next.item.supportsAeps?"true":"false");setE4(String(Number(next.item.aepsCommissionRate||0)));}
  if(next.kind==="gateway"){setE1(next.item.gatewayName);setE2(String(Number(next.item.defaultChargeRate)));setE3(next.item.defaultChargeType);setE4("");}
  if(next.kind==="term"){setE1(next.item.name);setE2(String(next.item.durationValue));setE3(next.item.durationUnit);setE4(String(Number(next.item.defaultCommissionRate)));}
  if(next.kind==="category"){setE1(next.item.name);setE2("MIXED");setE3("");setE4("");}
  if(next.kind==="rule"){setE1(String(Number(next.item.commissionRate)));setE2(next.item.commissionType);setE3("");setE4("");}
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!edit)return;
  try{
   if(edit.kind==="provider")await run(()=>apiFetch("/providers/"+edit.item.id,{method:"PATCH",body:JSON.stringify({name:e1.trim(),providerType:e2,supportsAeps:e3==="true",aepsCommissionRate:Number(e4||0)})}),()=>{},"Provider updated.");
   if(edit.kind==="gateway")await run(()=>apiFetch("/providers/gateways/"+edit.item.id,{method:"PATCH",body:JSON.stringify({gatewayName:e1.trim(),defaultChargeRate:Number(e2),defaultChargeType:e3})}),()=>{},"Gateway updated.");
   if(edit.kind==="term")await run(()=>apiFetch("/settings/payment-terms/"+edit.item.id,{method:"PATCH",body:JSON.stringify({name:e1.trim(),durationValue:Number(e2),durationUnit:e3,defaultCommissionType:edit.item.defaultCommissionType,defaultCommissionRate:Number(e4)})}),()=>{},"Payment term updated.");
   if(edit.kind==="category")await run(()=>apiFetch("/settings/expense-categories/"+edit.item.id,{method:"PATCH",body:JSON.stringify({name:e1.trim(),expenseUsage:"MIXED"})}),()=>{},"Expense category updated.");
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

 if(loading)return <AppShell><PageLoader label="Loading settings…"/></AppShell>;

 return <AppShell><div className="page-enter mx-auto max-w-[1320px] space-y-5">
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}
  <Surface className="overflow-hidden">
    <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div><p className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--accent)]">Daily Cash</p><h2 className="mt-1 text-lg font-black">Service catalog</h2><p className="mt-1 text-xs text-[var(--text-muted)]">These services appear in Cash In → Service. Default amount is optional.</p></div>
      <form onSubmit={addService} className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_140px_auto]">
        <input className={input} value={serviceName} onChange={e=>setServiceName(e.target.value)} placeholder="Service name" required/>
        <input className={input} value={serviceDefaultAmount} onChange={e=>setServiceDefaultAmount(e.target.value.replace(/[^0-9.]/g,""))} inputMode="decimal" placeholder="Default ₹"/>
        <button className={primary}>+ Service</button>
      </form>
    </div>
    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
      {services.map(item=><div key={item.id} className={"rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 "+(!item.isActive?"opacity-55":"")}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{item.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{item.defaultAmount!==null&&Number(item.defaultAmount)>0?"Default ₹"+Number(item.defaultAmount).toLocaleString("en-IN"):"Amount entered at sale"}</p></div><span className={"h-2.5 w-2.5 shrink-0 rounded-full "+(item.isActive?"bg-emerald-500":"bg-slate-300")}/></div>
        <div className="mt-4 flex gap-2"><button type="button" onClick={()=>beginServiceEdit(item)} className={secondary}>Edit</button><button type="button" onClick={()=>toggleService(item)} className={secondary}>{item.isActive?"Retire":"Activate"}</button></div>
      </div>)}
      {!services.length?<p className="p-3 text-sm text-[var(--text-muted)]">No services configured yet.</p>:null}
    </div>
  </Surface>

  <SettingsWorkspace
   providers={providers}
   terms={terms}
   categories={categories}
   rules={rules}
   onCreate={(kind,providerId)=>{if(kind==="gateway"&&providerId)setGatewayProvider(providerId);if(kind==="rule"&&providerId){setRuleProvider(providerId);setRuleGateway("");}setCreate(kind);}}
   onEditProvider={item=>beginEdit({kind:"provider",item})}
   onEditGateway={item=>beginEdit({kind:"gateway",item})}
   onEditTerm={item=>beginEdit({kind:"term",item})}
   onEditCategory={item=>beginEdit({kind:"category",item})}
   onEditRule={item=>beginEdit({kind:"rule",item})}
   onToggle={(path,isActive,label)=>setToggleState({path,isActive,label})}
   onQuickAddCategory={quickAddCategory}
   onSaveCashTransferDefault={saveCashTransferDefault}
   onSaveCardSwipeDefault={saveCardSwipeDefault}
   onSaveAepsDefault={saveAepsDefault}
  />

  <Modal open={!!serviceEdit} title="Edit service" description="Changes apply to future service entries." onClose={()=>setServiceEdit(null)}>
    <form onSubmit={saveServiceEdit} className="space-y-3">
      <input className={input} value={serviceEditName} onChange={e=>setServiceEditName(e.target.value)} placeholder="Service name" required/>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Default amount</span><input className={input} value={serviceEditAmount} onChange={e=>setServiceEditAmount(e.target.value.replace(/[^0-9.]/g,""))} inputMode="decimal" placeholder="Leave blank to enter each time"/></label>
      <div className="flex justify-end gap-2"><button type="button" onClick={()=>setServiceEdit(null)} className={secondary}>Cancel</button><button className={primary}>Save service</button></div>
    </form>
  </Modal>

  <Modal open={create==="provider"} title="Add provider" description="Configure only the services this provider actually supports." onClose={()=>setCreate(null)}>
    <form onSubmit={addProvider} className="space-y-4">
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Provider name</span><input className={input} placeholder="DigiSeva / 24PAY" value={providerName} onChange={e=>setProviderName(e.target.value)} required/></label>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Provider type</span><SearchableSelect className={input} value={providerType} onChange={e=>setProviderType(e.target.value)}><option>MULTI_SERVICE</option><option>WALLET</option><option>CARD_PROVIDER</option><option>AEPS_PLATFORM</option></SearchableSelect></label>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
        <label className="flex cursor-pointer items-center justify-between gap-3"><span><strong className="block text-sm">Aadhaar withdrawal</strong><span className="mt-0.5 block text-xs text-[var(--text-muted)]">Show this provider in Aadhaar-based withdrawals.</span></span><input type="checkbox" checked={providerSupportsAeps} onChange={e=>setProviderSupportsAeps(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]"/></label>
        {providerSupportsAeps?<label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Default Aadhaar commission %</span><input className={input} type="number" min="0" max="100" step="0.0001" value={providerAepsRate} onChange={e=>setProviderAepsRate(e.target.value)} /></label>:null}
      </div>
      <button className={primary+" w-full"}>Add Provider</button>
    </form>
  </Modal>
  <Modal open={create==="gateway"} title="Add gateway" description="Attach a processing gateway to an active provider." onClose={()=>setCreate(null)}>
    <form onSubmit={addGateway} className="space-y-4"><SearchableSelect className={input} value={gatewayProvider} onChange={e=>setGatewayProvider(e.target.value)} required><option value="">Select provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect><input className={input} placeholder="Gateway name" value={gatewayName} onChange={e=>setGatewayName(e.target.value)} required/><input className={input} type="number" step="0.0001" min="0" placeholder="Default charge %" value={gatewayRate} onChange={e=>setGatewayRate(e.target.value)} required/><button className={primary+" w-full"}>Add Gateway</button></form>
  </Modal>

  <Modal open={create==="term"} title="Add payment term" description="Define settlement timing and the default commission rate." onClose={()=>setCreate(null)}>
    <form onSubmit={addTerm} className="grid gap-3 sm:grid-cols-2"><input className={input} placeholder="Term name" value={termName} onChange={e=>setTermName(e.target.value)} required/><input className={input} type="number" min="0" placeholder="Duration" value={durationValue} onChange={e=>setDurationValue(e.target.value)} required/><SearchableSelect className={input} value={durationUnit} onChange={e=>setDurationUnit(e.target.value)}><option value="HOURS">Hours</option><option value="DAYS">Days</option></SearchableSelect><input className={input} type="number" step="0.0001" min="0" placeholder="Default commission %" value={termRate} onChange={e=>setTermRate(e.target.value)} required/><button className={primary+" sm:col-span-2"}>Add Payment Term</button></form>
  </Modal>

  <Modal open={create==="category"} title="Add expense category" description="Categories keep expenses quick to enter and easy to scan." onClose={()=>setCreate(null)}>
    <form onSubmit={addCategory} className="space-y-4"><input className={input} placeholder="Category name" value={categoryName} onChange={e=>setCategoryName(e.target.value)} required/><button className={primary+" w-full"}>Add Category</button></form>
  </Modal>
  <Modal open={create==="rule"} title="Add commission override" description="Use an override only when the default term or gateway rate should not apply." onClose={()=>setCreate(null)}>
    <form onSubmit={addRule} className="grid gap-3 sm:grid-cols-2">
      <SearchableSelect className={input} value={ruleCustomer} onChange={e=>setRuleCustomer(e.target.value)}><option value="">Any customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</SearchableSelect>
      <SearchableSelect className={input} value={ruleProvider} onChange={e=>{setRuleProvider(e.target.value);setRuleGateway("");}}><option value="">Any provider</option>{providers.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect>
      <SearchableSelect className={input} value={ruleGateway} onChange={e=>setRuleGateway(e.target.value)}><option value="">Any gateway</option>{selectedProvider?.gateways.filter(g=>g.isActive).map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</SearchableSelect>
      <SearchableSelect className={input} value={ruleTerm} onChange={e=>setRuleTerm(e.target.value)}><option value="">Any payment term</option>{terms.filter(t=>t.isActive).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</SearchableSelect>
      <SearchableSelect className={input} value={ruleType} onChange={e=>setRuleType(e.target.value)}><option value="CARD_SWIPE">Card Swipe</option><option value="CASH_TRANSFER">Cash Transfer</option><option value="AEPS_WITHDRAWAL">AePS</option><option value="MICRO_ATM">Micro ATM provider commission</option></SearchableSelect>
      <SearchableSelect className={input} value={ruleCalc} onChange={e=>setRuleCalc(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></SearchableSelect>
      <input className={input} type="number" step="0.0001" min="0" placeholder="Rate / amount" value={ruleRate} onChange={e=>setRuleRate(e.target.value)} required/>
      <button className={primary}>Add Rule</button>
    </form>
  </Modal>
  <Modal open={!!edit} title={"Edit "+(edit?.kind??"setting")} description="Changes apply to future use; historical transactions remain intact." onClose={()=>setEdit(null)}>
    <form onSubmit={saveEdit} className="space-y-3">
      {edit?.kind==="provider"?<>
        <input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Provider name" required/>
        <SearchableSelect className={input} value={e2} onChange={e=>setE2(e.target.value)}><option>MULTI_SERVICE</option><option>WALLET</option><option>CARD_PROVIDER</option><option>AEPS_PLATFORM</option></SearchableSelect>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3"><span><strong className="block text-sm">Aadhaar withdrawal</strong><span className="mt-0.5 block text-xs text-[var(--text-muted)]">Enable only when this provider supports Aadhaar-linked bank withdrawal.</span></span><input type="checkbox" checked={e3==="true"} onChange={e=>setE3(e.target.checked?"true":"false")} className="h-5 w-5 accent-[var(--accent)]"/></label>
          {e3==="true"?<label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Default Aadhaar commission %</span><input className={input} type="number" min="0" max="100" step="0.0001" value={e4} onChange={e=>setE4(e.target.value)} /></label>:null}
        </div>
      </>:null}
      {edit?.kind==="gateway"?<><input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Gateway name" required/><input className={input} type="number" min="0" step="0.0001" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Charge rate" required/><SearchableSelect className={input} value={e3} onChange={e=>setE3(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></SearchableSelect></>:null}
      {edit?.kind==="term"?<div className="grid gap-3 sm:grid-cols-2"><input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Term name" required/><input className={input} type="number" min="0" value={e2} onChange={e=>setE2(e.target.value)} placeholder="Duration"/><SearchableSelect className={input} value={e3} onChange={e=>setE3(e.target.value)}><option value="HOURS">Hours</option><option value="DAYS">Days</option></SearchableSelect><input className={input} type="number" min="0" step="0.0001" value={e4} onChange={e=>setE4(e.target.value)} placeholder="Commission rate"/></div>:null}
      {edit?.kind==="category"?<input className={input} value={e1} onChange={e=>setE1(e.target.value)} placeholder="Category name" required/>:null}
      {edit?.kind==="rule"?<><input className={input} type="number" min="0" step="0.0001" value={e1} onChange={e=>setE1(e.target.value)} placeholder="Rate / amount"/><SearchableSelect className={input} value={e2} onChange={e=>setE2(e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed</option></SearchableSelect></>:null}
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setEdit(null)} className={secondary}>Cancel</button><button className={primary}>Save changes</button></div>
    </form>
  </Modal>

  <Modal open={!!toggleState} title={toggleState?.isActive?"Retire setting?":"Reactivate setting?"} description="Historical transactions and references will remain unchanged." onClose={()=>setToggleState(null)}>
    <p className="text-sm leading-6 text-slate-600">{toggleState?.isActive?"Retire":"Reactivate"} <strong>{toggleState?.label}</strong>? This only changes whether it can be used for future transactions.</p>
    <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setToggleState(null)} className={secondary}>Cancel</button><button onClick={confirmToggle} className={primary}>{toggleState?.isActive?"Retire":"Reactivate"}</button></div>
  </Modal>
 </div></AppShell>;
}
