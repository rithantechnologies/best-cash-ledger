"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { moneyStatus, moneyStatusOptions } from "@/lib/money-status";
import { MoneyFlowIcon } from "@/components/money-flow-icon";

type Tx={
 id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
 status:string;referenceNumber:string|null;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;
 cardSwipe:{customerCard:{bankName:string;lastFourDigits:string}}|null;
 microAtm:{customerBankName:string|null;cardLastFour:string}|null;
 aeps:{customerBankName:string;aadhaarLastFour:string}|null;
 quickCashTransfer:{purpose:string;serviceName:string|null;servicePaymentMode:string;cashAccount:{accountName:string}|null;servicePaymentAccount:{accountName:string}|null;commissionAccount:{accountName:string}|null}|null;
 providerSettlementReceipt:{settlement:{sourceTransaction:{
   transactionNumber:string;transactionType:string;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;
   cardSwipe:{customerCard:{bankName:string;lastFourDigits:string}}|null;
   microAtm:{customerBankName:string|null;cardLastFour:string}|null;
   aeps:{customerBankName:string;aadhaarLastFour:string}|null;
 }}}|null;
 charges:{amount:string}[];commissions:{amount:string;commissionType:string}[];
 payable:{originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string}|null;
 receivableSource:{originalAmount?:string;receivedAmount?:string;remainingAmount:string;dueAt:string|null;status:string}|null;
};
type Paged={items:Tx[];pagination:{page:number;pageSize:number;total:number;totalPages:number}};
type Range="today"|"yesterday"|"week"|"all";
const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v??0));
const statusTone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";
const label=(t:string)=>t.replaceAll("_"," ").toLowerCase().replace(/w/g,c=>c.toUpperCase());
const dailyActions=[["CS","Card Swipe","/transactions/card-swipe"],["DC","Due Clearing","/transactions/card-due-clearing"],["CT","Cash Transfer","/transactions/cash-transfer"],["AP","AePS","/transactions/aeps"],["MA","Micro ATM","/transactions/micro-atm"],["IT","Move Money","/transactions/internal-transfer"],["ATM","ATM Withdrawal","/transactions/atm-withdrawal"],["CC","Card Payment","/transactions/owner-credit-card-payment"],["EX","Expenses","/transactions/expense"]] as const;
type DesktopColumnKey="transactionId"|"date"|"service"|"customer"|"source"|"user"|"processed"|"customerFee"|"serviceIncome"|"totalIncome"|"providerFee"|"profit"|"net"|"payout"|"dueDate"|"status";
const DEFAULT_DESKTOP_COLUMNS:DesktopColumnKey[]=["transactionId","date","service","customer","source","user","processed","customerFee","serviceIncome","totalIncome","providerFee","profit","net","payout","dueDate","status"];
const LOCKED_DESKTOP_COLUMNS=new Set<DesktopColumnKey>(["transactionId","date","service","processed","status"]);
const DESKTOP_COLUMN_STORAGE_KEY="cashledger.transactions.desktop-columns.v2";
const DESKTOP_COLUMN_META:Record<DesktopColumnKey,{label:string;width:number;right?:boolean}>={
 transactionId:{label:"Transaction ID",width:170},date:{label:"Date & time",width:165},service:{label:"Service",width:185},
 customer:{label:"Customer",width:155},source:{label:"Source / settlement",width:315},user:{label:"User",width:115},
 processed:{label:"Processed",width:135,right:true},customerFee:{label:"Commission income",width:145,right:true},
 serviceIncome:{label:"Service income",width:135,right:true},totalIncome:{label:"Total income",width:135,right:true},
 providerFee:{label:"Provider fee",width:130,right:true},profit:{label:"Profit",width:120,right:true},
 net:{label:"Customer gets / net",width:155,right:true},payout:{label:"Payout / Pay-in",width:150},
 dueDate:{label:"Due date",width:115},status:{label:"Status",width:150},
};
const SORTABLE_DESKTOP_COLUMNS:Partial<Record<DesktopColumnKey,string>>={transactionId:"transactionNumber",date:"transactionAt",service:"transactionType",processed:"grossAmount",net:"netAmount",status:"status"};
const txHref=(tx:Tx)=>tx.transactionType==="CARD_DUE_CLEARING"?"/transactions/card-due-clearing?id="+tx.id:"/transactions/"+tx.id;
const sum=(rows:{amount:string}[])=>rows.reduce((a,x)=>a+Number(x.amount),0);
const commissionIncome=(tx:Tx)=>sum(tx.commissions);
const serviceIncome=(tx:Tx)=>tx.transactionType==="SERVICE_INCOME"?Number(tx.grossAmount):0;
const totalIncome=(tx:Tx)=>commissionIncome(tx)+serviceIncome(tx);
const providerCommission=(tx:Tx)=>tx.commissions.filter(c=>c.commissionType==="MICRO_ATM_PROVIDER").reduce((a,x)=>a+Number(x.amount),0);
const displayService=(tx:Tx)=>tx.transactionType==="SERVICE_INCOME"&&tx.quickCashTransfer?.serviceName?tx.quickCashTransfer.serviceName:label(tx.transactionType);
function activityDirection(tx:Tx):"IN"|"OUT"|null{
 if(["PROVIDER_SETTLEMENT","CUSTOMER_RECEIPT","CARD_DUE_RECOVERY","CARD_DUE_COMMISSION_COLLECTION","SERVICE_INCOME"].includes(tx.transactionType))return "IN";
 if(["CUSTOMER_PAYOUT","BUSINESS_EXPENSE","PERSONAL_EXPENSE"].includes(tx.transactionType))return "OUT";
 return null;
}
function settlementSource(tx:Tx){
 return tx.providerSettlementReceipt?.settlement.sourceTransaction??null;
}
function displayCustomer(tx:Tx){
 return tx.customer?.fullName??settlementSource(tx)?.customer?.fullName??"—";
}
function displayUser(tx:Tx){
 return settlementSource(tx)?.createdBy?.fullName??tx.createdBy?.fullName??"—";
}
function sourceContext(tx:Tx){
 if(tx.transactionType==="SERVICE_INCOME"&&tx.quickCashTransfer){
  return tx.quickCashTransfer.servicePaymentMode==="UPI"
   ?tx.quickCashTransfer.servicePaymentAccount?.accountName??"Bank / UPI"
   :tx.quickCashTransfer.cashAccount?.accountName??"Cash drawer";
 }
 const source=settlementSource(tx);
 if(!source)return "—";
 const card=source.cardSwipe?.customerCard;
 const detail=card?card.bankName+" •••• "+card.lastFourDigits
  :source.microAtm?(source.microAtm.customerBankName??"Bank")+" •••• "+source.microAtm.cardLastFour
  :source.aeps?source.aeps.customerBankName+" · Aadhaar •••• "+source.aeps.aadhaarLastFour
  :null;
 return [label(source.transactionType),source.transactionNumber,detail].filter(Boolean).join(" · ");
}
function activityContext(tx:Tx){
 const source=tx.providerSettlementReceipt?.settlement.sourceTransaction;
 if(source){
  const card=source.cardSwipe?.customerCard;
  const detail=card?card.bankName+" •••• "+card.lastFourDigits
   :source.microAtm?(source.microAtm.customerBankName??"Bank")+" •••• "+source.microAtm.cardLastFour
   :source.aeps?source.aeps.customerBankName+" · Aadhaar •••• "+source.aeps.aadhaarLastFour
   :null;
  return {
   title:"Provider settlement"+(source.customer?.fullName?" · "+source.customer.fullName:""),
   meta:[label(source.transactionType),source.transactionNumber,detail,source.createdBy?.fullName?"By "+source.createdBy.fullName:null].filter(Boolean).join(" · "),
  };
 }
 const card=tx.cardSwipe?.customerCard;
 const detail=card?card.bankName+" •••• "+card.lastFourDigits
  :tx.microAtm?(tx.microAtm.customerBankName??"Bank")+" •••• "+tx.microAtm.cardLastFour
  :tx.aeps?tx.aeps.customerBankName+" · Aadhaar •••• "+tx.aeps.aadhaarLastFour
  :null;
 return {
  title:displayService(tx)+(tx.customer?" · "+tx.customer.fullName:""),
  meta:[tx.transactionNumber,detail,tx.createdBy?.fullName?"By "+tx.createdBy.fullName:null].filter(Boolean).join(" · "),
 };
}

export default function TransactionsPage(){
 const [items,setItems]=useState<Tx[]>([]);
 const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState(""),[moneyStatusFilter,setMoneyStatusFilter]=useState(""),[range,setRange]=useState<Range>("today");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [desktopFiltersOpen,setDesktopFiltersOpen]=useState(false),[columnsOpen,setColumnsOpen]=useState(false),[desktopSearchOpen,setDesktopSearchOpen]=useState(false);
 const [desktopColumnOrder,setDesktopColumnOrder]=useState<DesktopColumnKey[]>(DEFAULT_DESKTOP_COLUMNS);
 const [desktopVisibleColumns,setDesktopVisibleColumns]=useState<DesktopColumnKey[]>(DEFAULT_DESKTOP_COLUMNS);
 const [desktopColumnsReady,setDesktopColumnsReady]=useState(false),[draggedColumn,setDraggedColumn]=useState<DesktopColumnKey|null>(null);
 const [sortBy,setSortBy]=useState("transactionAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("desc");

 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir});
  if(q.trim())params.set("q",q.trim());if(type)params.set("type",type);if(status)params.set("status",status);if(moneyStatusFilter)params.set("moneyStatus",moneyStatusFilter);
  if(range!=="all"){
   const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setHours(23,59,59,999);
   if(range==="yesterday"){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}
   if(range==="week")start.setDate(start.getDate()-6);
   params.set("from",start.toISOString());params.set("to",end.toISOString());
  }
  setLoading(true);
  return apiFetch<Paged>("/transactions?"+params.toString()).then(r=>{setItems(r.items);setPagination(r.pagination);setError("");}).finally(()=>setLoading(false));
 }
 useEffect(()=>{const initial=new URLSearchParams(window.location.search).get("type");if(!initial)return;const timer=window.setTimeout(()=>setType(initial),0);return()=>window.clearTimeout(timer);},[]);
 useEffect(()=>{const timer=setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to load transactions")),160);return()=>clearTimeout(timer);},[q,type,status,moneyStatusFilter,range,pagination.pageSize,sortBy,sortDir]);
 useEffect(()=>{
  const timer=window.setTimeout(()=>{
   try{
    const saved=window.localStorage.getItem(DESKTOP_COLUMN_STORAGE_KEY);
    if(saved){
     const parsed=JSON.parse(saved) as {order?:DesktopColumnKey[];visible?:DesktopColumnKey[]};
     const valid=new Set(DEFAULT_DESKTOP_COLUMNS);
     const savedOrder=(parsed.order??[]).filter(k=>valid.has(k));
     const order=[...savedOrder,...DEFAULT_DESKTOP_COLUMNS.filter(k=>!savedOrder.includes(k))];
     const visible=new Set((parsed.visible??DEFAULT_DESKTOP_COLUMNS).filter(k=>valid.has(k)));
     LOCKED_DESKTOP_COLUMNS.forEach(k=>visible.add(k));
     setDesktopColumnOrder(order);setDesktopVisibleColumns(order.filter(k=>visible.has(k)));
    }
   }catch{}finally{setDesktopColumnsReady(true);}
  },0);
  return()=>window.clearTimeout(timer);
 },[]);
 useEffect(()=>{if(!desktopColumnsReady)return;window.localStorage.setItem(DESKTOP_COLUMN_STORAGE_KEY,JSON.stringify({order:desktopColumnOrder,visible:desktopVisibleColumns}));},[desktopColumnsReady,desktopColumnOrder,desktopVisibleColumns]);

 const desktopColumns=desktopColumnOrder.filter(k=>desktopVisibleColumns.includes(k));
 const desktopTableWidth=desktopColumns.reduce((total,k)=>total+DESKTOP_COLUMN_META[k].width,0);
 const desktopStickyLefts=desktopColumns.map((_,index)=>desktopColumns.slice(0,index).reduce((total,k)=>total+DESKTOP_COLUMN_META[k].width,0));
 const activeFilterCount=[range!=="today",type,status,moneyStatusFilter].filter(Boolean).length;
 const desktopSearchNeedle=q.trim().toLowerCase();
 const desktopSearchSuggestions=desktopSearchNeedle?items.filter(tx=>[tx.transactionNumber,tx.referenceNumber??"",displayCustomer(tx),displayService(tx)].some(value=>value.toLowerCase().includes(desktopSearchNeedle))).slice(0,7):[];
 const clearFilters=()=>{setQ("");setType("");setStatus("");setMoneyStatusFilter("");setRange("today");};
 const toggleDesktopColumn=(key:DesktopColumnKey)=>{if(LOCKED_DESKTOP_COLUMNS.has(key))return;setDesktopVisibleColumns(v=>v.includes(key)?v.filter(k=>k!==key):desktopColumnOrder.filter(k=>k===key||v.includes(k)));};
 const moveDesktopColumn=(source:DesktopColumnKey,target:DesktopColumnKey)=>{if(source===target)return;setDesktopColumnOrder(order=>{const next=order.filter(k=>k!==source);next.splice(next.indexOf(target),0,source);return next;});};
 const resetDesktopColumns=()=>{setDesktopColumnOrder(DEFAULT_DESKTOP_COLUMNS);setDesktopVisibleColumns(DEFAULT_DESKTOP_COLUMNS);};
 const changeSort=(key:DesktopColumnKey)=>{const next=SORTABLE_DESKTOP_COLUMNS[key];if(!next)return;if(sortBy===next)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortBy(next);setSortDir("asc");}};

 const totals=useMemo(()=>items.reduce((a,t)=>{
  const commission=commissionIncome(t),service=serviceIncome(t),income=commission+service,fees=sum(t.charges);
  return {gross:a.gross+Number(t.grossAmount),net:a.net+Number(t.netAmount??t.grossAmount),fees:a.fees+fees,commission:a.commission+commission,service:a.service+service,income:a.income+income,profit:a.profit+income-fees};
 },{gross:0,net:0,fees:0,commission:0,service:0,income:0,profit:0}),[items]);
 const grouped=items.reduce((map,t)=>{const k=new Date(t.transactionAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});const row=map.get(k)??[];row.push(t);map.set(k,row);return map;},new Map<string,Tx[]>());

 return <AppShell><PageFrame className="ui-preview transactions-preview">
  <SectionHeading title="Transactions"/>
  <div id="transaction-actions" className="grid scroll-mt-20 grid-cols-2 gap-2 sm:grid-cols-4">{dailyActions.map(([mark,title,href])=><Link key={href} href={href} className="app-quick-action flex min-h-14 items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 shadow-sm"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[10px] font-black text-[var(--accent)]">{mark}</span><span className="truncate text-sm font-bold">{title}</span></Link>)}</div>

  <Surface className="p-1.5 md:hidden"><div className="grid grid-cols-4 gap-1">{([["today","Today"],["yesterday","Yesterday"],["week","7 days"],["all","All"]] as [Range,string][]).map(([v,l])=><button key={v} onClick={()=>setRange(v)} className={"min-h-11 rounded-xl px-2 text-xs font-semibold transition "+(range===v?"bg-[var(--accent)] text-white":"text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]")}>{l}</button>)}</div></Surface>
  <Surface className="grid gap-2 p-3 sm:grid-cols-2 md:hidden">
   <input className="app-control sm:col-span-2" placeholder="Search name, transaction or reference" value={q} onChange={e=>setQ(e.target.value)}/>
   <SearchableSelect className="app-control" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{["CARD_SWIPE","CARD_DUE_CLEARING","CARD_DUE_RECOVERY","CARD_DUE_COMMISSION_COLLECTION","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","SERVICE_INCOME","CUSTOMER_PAYOUT","CUSTOMER_RECEIPT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}</SearchableSelect>
   <SearchableSelect className="app-control" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All transaction status</option>{["PENDING","PARTIALLY_PAID","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</SearchableSelect>
   <SearchableSelect className="app-control" value={moneyStatusFilter} onChange={e=>setMoneyStatusFilter(e.target.value)}><option value="">All payout / pay-in</option>{moneyStatusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</SearchableSelect>
  </Surface>
  <Surface className="relative z-30 hidden overflow-visible p-3 md:block">
   <div className="flex items-center gap-2">
    <div className="relative min-w-[300px] flex-1">
     <input className="app-control w-full" placeholder="Search customer, transaction ID or reference" value={q} autoComplete="off" onFocus={()=>setDesktopSearchOpen(true)} onBlur={()=>window.setTimeout(()=>setDesktopSearchOpen(false),120)} onChange={e=>{setQ(e.target.value);setDesktopSearchOpen(true);}}/>
     {desktopSearchOpen&&q.trim()?<div className="absolute inset-x-0 top-[calc(100%+.4rem)] z-[90] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(15,23,42,.18)]">
      <div className="max-h-80 overflow-y-auto p-1.5">
       {loading?<div className="px-3 py-5 text-center text-xs font-semibold text-[var(--text-muted)]">Searching transactions…</div>:desktopSearchSuggestions.length?desktopSearchSuggestions.map(tx=><Link key={tx.id} href={txHref(tx)} onClick={()=>setDesktopSearchOpen(false)} className="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 hover:bg-[var(--surface-soft)]">
        <div className="min-w-0"><p className="truncate text-sm font-black text-[var(--accent)]">{tx.transactionNumber}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{displayCustomer(tx)} · {displayService(tx)} · {new Date(tx.transactionAt).toLocaleDateString("en-IN")}</p></div>
        <span className="money shrink-0 text-xs font-bold">{money(tx.grossAmount)}</span>
       </Link>):<div className="px-3 py-5 text-center"><p className="text-xs font-bold">No matching transactions</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">Try a customer, transaction ID or reference.</p></div>}
      </div>
     </div>:null}
    </div>
    <button type="button" onClick={()=>{setDesktopFiltersOpen(v=>!v);setColumnsOpen(false);setDesktopSearchOpen(false);}} className={"min-h-11 rounded-xl border px-4 text-sm font-bold transition "+(desktopFiltersOpen?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] hover:bg-[var(--surface-soft)]")}>Filters{activeFilterCount?" ("+activeFilterCount+")":""}</button>
    <button type="button" onClick={()=>{setColumnsOpen(v=>!v);setDesktopFiltersOpen(false);setDesktopSearchOpen(false);}} className={"min-h-11 rounded-xl border px-4 text-sm font-bold transition "+(columnsOpen?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] hover:bg-[var(--surface-soft)]")}>Columns · {desktopColumns.length}/{DEFAULT_DESKTOP_COLUMNS.length}</button>
    {(q||activeFilterCount)?<button type="button" onClick={clearFilters} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]">Clear</button>:null}
   </div>
   {desktopFiltersOpen?<div className="absolute right-3 top-[calc(100%+.45rem)] z-[80] w-[min(760px,calc(100vw-3rem))] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_22px_60px_rgba(15,23,42,.20)]">
    <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-black">Filter transactions</p><p className="text-[11px] text-[var(--text-muted)]">Narrow the full transaction list.</p></div><button type="button" onClick={clearFilters} className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]">Clear filters</button></div>
    <div className="mb-3"><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Date</p><div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{([["today","Today"],["yesterday","Yesterday"],["week","7 days"],["all","All"]] as [Range,string][]).map(([v,l])=><button key={v} type="button" onClick={()=>setRange(v)} className={"min-h-9 rounded-lg px-2 text-xs font-bold "+(range===v?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)] hover:text-[var(--text)]")}>{l}</button>)}</div></div>
    <div className="grid gap-3 lg:grid-cols-3">
     <div><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Service</p><SearchableSelect className="app-control" value={type} onChange={e=>setType(e.target.value)}><option value="">All services</option>{["CARD_SWIPE","CARD_DUE_CLEARING","CARD_DUE_RECOVERY","CARD_DUE_COMMISSION_COLLECTION","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","SERVICE_INCOME","CUSTOMER_PAYOUT","CUSTOMER_RECEIPT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x} value={x}>{label(x)}</option>)}</SearchableSelect></div>
     <div><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Transaction status</p><SearchableSelect className="app-control" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING","PARTIALLY_PAID","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x} value={x}>{label(x)}</option>)}</SearchableSelect></div>
     <div><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Payout / Pay-in</p><SearchableSelect className="app-control" value={moneyStatusFilter} onChange={e=>setMoneyStatusFilter(e.target.value)}><option value="">All payout / pay-in</option>{moneyStatusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</SearchableSelect></div>
    </div>
   </div>:null}
   {columnsOpen?<div className="absolute right-3 top-[calc(100%+.45rem)] z-[80] w-[min(720px,calc(100vw-3rem))] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_22px_60px_rgba(15,23,42,.20)]">
    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-black">Desktop columns</p><p className="text-[11px] text-[var(--text-muted)]">Choose columns and drag them to change order.</p></div><button type="button" onClick={resetDesktopColumns} className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]">Reset default</button></div>
    <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">{desktopColumnOrder.map(key=><label key={key} draggable onDragStart={()=>setDraggedColumn(key)} onDragEnd={()=>setDraggedColumn(null)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(draggedColumn)moveDesktopColumn(draggedColumn,key);setDraggedColumn(null);}} className={"flex cursor-grab items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm "+(draggedColumn===key?"opacity-50":"")}>
      <span className="select-none text-[var(--text-muted)]">⋮⋮</span><input type="checkbox" checked={desktopVisibleColumns.includes(key)} disabled={LOCKED_DESKTOP_COLUMNS.has(key)} onChange={()=>toggleDesktopColumn(key)}/><span className="min-w-0 flex-1 font-semibold">{DESKTOP_COLUMN_META[key].label}</span>{LOCKED_DESKTOP_COLUMNS.has(key)?<span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Fixed</span>:null}
    </label>)}</div>
   </div>:null}
  </Surface>

  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Processed</p><p className="money mt-1.5 truncate text-xl font-bold">{money(totals.gross)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Total income</p><p className="money mt-1.5 truncate text-xl font-bold text-[var(--money-in)]">{money(totals.income)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Commission income</p><p className="money mt-1.5 truncate text-xl font-bold text-[var(--money-in)]">{money(totals.commission)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Service income</p><p className="money mt-1.5 truncate text-xl font-bold text-[var(--money-in)]">{money(totals.service)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Provider / bank fees</p><p className="money mt-1.5 truncate text-xl font-bold text-[var(--money-out)]">{money(totals.fees)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Transactions</p><p className="money mt-1.5 text-xl font-bold">{pagination.total}</p></Surface>
  </div>

  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
  {loading?<PageLoader label="Loading transactions…"/>:<>
   <div className="space-y-4 md:hidden">
    {[...grouped.entries()].map(([day,rows])=><section key={day}><div className="sticky top-15 z-10 mb-1.5 bg-[var(--bg)] py-1 text-xs font-semibold text-[var(--text-muted)]">{day}</div><Surface className="overflow-hidden"><div className="divide-y divide-[var(--border)]">{rows.map(tx=>{const context=activityContext(tx),direction=activityDirection(tx),source=settlementSource(tx);return <Link key={tx.id} href={txHref(tx)} className="block px-4 py-3.5 hover:bg-[var(--surface-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-5">{context.title}</p>
          <div className="mt-1.5 space-y-1 text-[11px] leading-4 text-[var(--text-muted)]">
            <p className="break-all"><span className="font-bold text-[var(--text)]">Txn:</span> {tx.transactionNumber}</p>
            {source||tx.transactionType==="SERVICE_INCOME"?<p><span className="font-bold text-[var(--text)]">Received in:</span> {sourceContext(tx)}</p>:null}
            <p><span className="font-bold text-[var(--text)]">By:</span> {displayUser(tx)} · {new Date(tx.transactionAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{direction?<MoneyFlowIcon direction={direction}/>:null}<p className={"money text-sm font-black "+(direction==="IN"?"text-[var(--money-in)]":direction==="OUT"?"text-[var(--money-out)]":"")}>{direction==="IN"?"+":direction==="OUT"?"−":""}{money(tx.grossAmount)}</p></div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5"><StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge>{moneyStatus(tx)?<StatusBadge tone={moneyStatus(tx)!.tone}>{moneyStatus(tx)!.label}</StatusBadge>:null}</div>
    </Link>})}</div></Surface></section>)}
    {!items.length?<EmptyState title="No transactions" description="Try another date or filter."/>:null}
   </div>

   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="table-fixed text-sm" style={{width:desktopTableWidth,minWidth:"100%"}}>
    <colgroup>{desktopColumns.map(key=><col key={key} style={{width:DESKTOP_COLUMN_META[key].width}}/>)}</colgroup>
    <thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr>{desktopColumns.map((key,index)=>{
      const meta=DESKTOP_COLUMN_META[key],sortKey=SORTABLE_DESKTOP_COLUMNS[key],sticky=index<4;
      return <th key={key} style={sticky?{left:desktopStickyLefts[index]}:undefined} className={"px-3 py-3 "+(meta.right?"text-right ":"")+(sticky?"lg:sticky lg:z-20 bg-[var(--surface-soft)] ":"")}>
       {sortKey?<button type="button" onClick={()=>changeSort(key)} className={"inline-flex items-center gap-1 font-bold uppercase tracking-wide hover:text-[var(--text)] "+(meta.right?"ml-auto":"")}>{meta.label}{sortBy===sortKey?<span aria-hidden>{sortDir==="asc"?"↑":"↓"}</span>:null}</button>:meta.label}
      </th>;
    })}</tr></thead>
    <tbody>{items.map(tx=>{const providerFees=sum(tx.charges),commission=commissionIncome(tx),service=serviceIncome(tx),income=commission+service,providerEarn=providerCommission(tx),profit=income-providerFees,direction=activityDirection(tx),source=settlementSource(tx),mStatus=moneyStatus(tx);
      const content=(key:DesktopColumnKey)=>{
       if(key==="transactionId")return <Link className="font-bold text-[var(--accent)] whitespace-nowrap" href={txHref(tx)}>{tx.transactionNumber}</Link>;
       if(key==="date")return <span className="text-xs whitespace-nowrap">{new Date(tx.transactionAt).toLocaleString("en-IN")}</span>;
       if(key==="service")return <><span className="flex min-w-0 items-start gap-2">{direction?<MoneyFlowIcon direction={direction} size="sm"/>:null}<span className="min-w-0 break-words font-medium leading-5">{displayService(tx)}</span></span>{providerEarn>0?<span className="mt-0.5 block text-[10px] font-bold leading-4 text-[var(--money-in)]">Provider commission +{money(providerEarn)}</span>:null}</>;
       if(key==="customer")return <span className="block break-words font-semibold">{displayCustomer(tx)}</span>;
       if(key==="source")return source||tx.transactionType==="SERVICE_INCOME"?<span className="block whitespace-normal break-words text-xs leading-5 text-[var(--text)]">{sourceContext(tx)}</span>:<span className="text-[var(--text-muted)]">—</span>;
       if(key==="user")return <span className="text-xs font-semibold whitespace-nowrap">{displayUser(tx)}</span>;
       if(key==="processed")return <span className={"money font-semibold whitespace-nowrap "+(direction==="IN"?"text-[var(--money-in)]":direction==="OUT"?"text-[var(--money-out)]":"")}>{direction==="IN"?"+":direction==="OUT"?"−":""}{money(tx.grossAmount)}</span>;
       if(key==="customerFee")return <span className="money font-bold text-[var(--money-in)] whitespace-nowrap">{commission?"+"+money(commission):"—"}</span>;
       if(key==="serviceIncome")return <span className="money font-bold text-[var(--money-in)] whitespace-nowrap">{service?"+"+money(service):"—"}</span>;
       if(key==="totalIncome")return <span className="money font-black text-[var(--money-in)] whitespace-nowrap">{income?"+"+money(income):"—"}</span>;
       if(key==="providerFee")return <span className="money text-[var(--money-out)] whitespace-nowrap">{providerFees?"−"+money(providerFees):"—"}</span>;
       if(key==="profit")return <span className={"money font-bold whitespace-nowrap "+(profit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{income||providerFees?money(profit):"—"}</span>;
       if(key==="net")return <span className="money font-semibold whitespace-nowrap">{money(tx.netAmount??tx.grossAmount)}</span>;
       if(key==="payout")return mStatus?<StatusBadge tone={mStatus.tone}>{mStatus.label}</StatusBadge>:<span className="text-[var(--text-muted)]">—</span>;
       if(key==="dueDate")return <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{mStatus?.dueAt?new Date(mStatus.dueAt).toLocaleDateString("en-IN"):"—"}</span>;
       return <StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge>;
      };
      return <tr key={tx.id} className="group border-t border-[var(--border)] align-top hover:bg-[var(--surface-soft)]">{desktopColumns.map((key,index)=>{const meta=DESKTOP_COLUMN_META[key],sticky=index<4;return <td key={key} style={sticky?{left:desktopStickyLefts[index]}:undefined} className={"px-3 py-3 "+(meta.right?"text-right ":"")+(sticky?"lg:sticky lg:z-10 bg-[var(--surface)] group-hover:bg-[var(--surface-soft)] ":"")}>{content(key)}</td>;})}</tr>;
    })}</tbody>
   </table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="transaction" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}
 </PageFrame></AppShell>;
}
