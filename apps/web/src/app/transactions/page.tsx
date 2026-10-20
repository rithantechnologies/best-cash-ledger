"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Pager, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { moneyStatus, moneyStatusOptions } from "@/lib/money-status";
import { MoneyFlowIcon } from "@/components/money-flow-icon";
import { transactionParticulars } from "@/lib/transaction-particulars";

type Tx={
 id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
 status:string;referenceNumber:string|null;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;
 cardSwipe:{customerCard:{bankName:string;lastFourDigits:string}}|null;
 microAtm:{customerBankName:string|null;cardLastFour:string}|null;
 aeps:{customerBankName:string;aadhaarLastFour:string}|null;
 quickCashTransfer:{direction:string;purpose:string;serviceName:string|null;cashOutType:string;beneficiaryMode:string|null;sourceAccount:{accountName:string}|null;servicePaymentMode:string;serviceFulfillmentMode?:string;servicePartnerName?:string|null;servicePartnerCharge?:string;cashAccount:{accountName:string}|null;servicePaymentAccount:{accountName:string}|null;commissionAccount:{accountName:string}|null}|null;
 cashTransfer:{customerUpiAccount:object|null;customerBankAccount:object|null;beneficiaryAccount:object|null;sourceAccount:{accountName:string}|null}|null;
 internalTransfer:{sourceAccount:{accountName:string};destinationAccount:{accountName:string}}|null;
 providerSettlementReceipt:{settlement:{sourceTransaction:{
   transactionNumber:string;transactionType:string;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;
   cardSwipe:{customerCard:{bankName:string;lastFourDigits:string}}|null;
   microAtm:{customerBankName:string|null;cardLastFour:string}|null;
   aeps:{customerBankName:string;aadhaarLastFour:string}|null;
 }}}|null;
 charges:{amount:string;chargeType:string}[];commissions:{amount:string;commissionType:string}[];
 accountEntry:{direction:"IN"|"OUT";entryKind:string;entryLabel:string|null;account:{accountName:string}}|null;
 customerLedgerEntry:{direction:"PAY_IN"|"PAY_OUT";amount:string;remarks:string;customerCard:{bankName:string;lastFourDigits:string}|null;financialAccount:{accountName:string}}|null;
 payable:{originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string}|null;
 receivableSource:{originalAmount?:string;receivedAmount?:string;remainingAmount:string;dueAt:string|null;status:string}|null;
};
type TransactionAggregates={processed:number;customerCommission:number;providerIncome:number;serviceRevenue:number;totalIncome:number;providerCost:number;partnerCost:number;profit:number};
type Paged={items:Tx[];pagination:{page:number;pageSize:number;total:number;totalPages:number};aggregates:TransactionAggregates};
type EarningAmounts={customerCommission:number;providerIncome:number;serviceRevenue:number;totalIncome:number;providerCost:number;payoutCost:number;partnerCost:number;netIncome:number};
type EarningCategory={category:string;count:number;totals:EarningAmounts;examples:{id:string;transactionNumber:string;transactionAt:string;customer:string|null;amounts:EarningAmounts;attribution?:string}[]};
type EarningBreakdown={summary:EarningAmounts;transactionCount:number;categories:EarningCategory[];basis:string;detailPage?:number;detailPageSize?:number;reconciliation?:{checked:boolean;balanced:boolean;independentIncome:number;independentCosts:number;independentNetIncome:number;transactionCount:number;quickCompletionCount:number;discrepancies:string[]}};
type Range="today"|"yesterday"|"week"|"all";
const money=(v:string|number|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v??0));
const statusTone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";
const label=(t:string)=>t.replaceAll("_"," ").toLowerCase().replace(/w/g,c=>c.toUpperCase());
type DesktopColumnKey="transactionId"|"date"|"service"|"customer"|"source"|"user"|"processed"|"customerFee"|"providerIncome"|"serviceIncome"|"partnerCost"|"netServiceEarning"|"totalIncome"|"providerFee"|"profit"|"net"|"payout"|"dueDate"|"status";
const DEFAULT_DESKTOP_COLUMNS:DesktopColumnKey[]=["transactionId","date","service","customer","processed","totalIncome","profit","payout","status"];
const LOCKED_DESKTOP_COLUMNS=new Set<DesktopColumnKey>(["transactionId","date","service","processed","status"]);
const DESKTOP_COLUMN_STORAGE_KEY="cashledger.transactions.desktop-columns.v3";
const DESKTOP_COLUMN_META:Record<DesktopColumnKey,{label:string;width:number;right?:boolean}>={
 transactionId:{label:"Transaction ID",width:170},date:{label:"Date & time",width:165},service:{label:"Particulars / Service",width:255},
 customer:{label:"Customer",width:155},source:{label:"Source / settlement",width:315},user:{label:"User",width:115},
 processed:{label:"Processed",width:135,right:true},customerFee:{label:"Customer commission",width:155,right:true},
 providerIncome:{label:"Provider income",width:140,right:true},serviceIncome:{label:"Service revenue",width:140,right:true},
 partnerCost:{label:"Partner cost",width:130,right:true},netServiceEarning:{label:"Net service earning",width:160,right:true},totalIncome:{label:"Total income",width:135,right:true},
 providerFee:{label:"Provider / bank cost",width:155,right:true},profit:{label:"Business profit",width:140,right:true},
 net:{label:"Customer gets / net",width:155,right:true},payout:{label:"Payout / Pay-in",width:150},
 dueDate:{label:"Due date",width:115},status:{label:"Status",width:150},
};
const SORTABLE_DESKTOP_COLUMNS:Partial<Record<DesktopColumnKey,string>>={transactionId:"transactionNumber",date:"transactionAt",service:"transactionType",processed:"grossAmount",net:"netAmount",status:"status"};
const txHref=(tx:Tx)=>tx.transactionType==="CARD_DUE_CLEARING"?"/transactions/card-due-clearing?id="+tx.id:"/transactions/"+tx.id;
const sum=(rows:{amount:string}[])=>rows.reduce((a,x)=>a+Number(x.amount),0);
const providerIncome=(tx:Tx)=>tx.commissions.filter(c=>c.commissionType.endsWith("_PROVIDER")).reduce((a,x)=>a+Number(x.amount),0);
const customerCommissionIncome=(tx:Tx)=>tx.commissions.filter(c=>!c.commissionType.endsWith("_PROVIDER")).reduce((a,x)=>a+Number(x.amount),0);
const serviceRevenue=(tx:Tx)=>tx.transactionType==="SERVICE_INCOME"?Number(tx.grossAmount):0;
const displayService=(tx:Tx)=>tx.customerLedgerEntry?(tx.customerLedgerEntry.direction==="PAY_IN"?"Pay In":"Pay Out")+" · "+tx.customerLedgerEntry.remarks:tx.accountEntry?(tx.accountEntry.entryLabel||"Manual amount entry"):transactionParticulars(tx).title;
const displayServiceDetail=(tx:Tx)=>transactionParticulars(tx).detail;
function activityDirection(tx:Tx):"IN"|"OUT"|null{
 if(tx.customerLedgerEntry)return tx.customerLedgerEntry.direction==="PAY_IN"?"IN":"OUT";
 if(tx.accountEntry)return tx.accountEntry.direction;
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
 if(tx.customerLedgerEntry)return tx.customerLedgerEntry.financialAccount.accountName;
 if(tx.accountEntry)return tx.accountEntry.account.accountName;
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
 const manualCard=tx.customerLedgerEntry?.customerCard;
 const card=tx.cardSwipe?.customerCard;
 const detail=manualCard?manualCard.bankName+" •••• "+manualCard.lastFourDigits
  :card?card.bankName+" •••• "+card.lastFourDigits
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
 const [aggregates,setAggregates]=useState<TransactionAggregates>({processed:0,customerCommission:0,providerIncome:0,serviceRevenue:0,totalIncome:0,providerCost:0,partnerCost:0,profit:0});
 const [q,setQ]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState(""),[moneyStatusFilter,setMoneyStatusFilter]=useState(""),[range,setRange]=useState<Range>("today");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [filtersOpen,setFiltersOpen]=useState(false),[columnsOpen,setColumnsOpen]=useState(false);
 const [desktopColumnOrder,setDesktopColumnOrder]=useState<DesktopColumnKey[]>(DEFAULT_DESKTOP_COLUMNS);
 const [desktopVisibleColumns,setDesktopVisibleColumns]=useState<DesktopColumnKey[]>(DEFAULT_DESKTOP_COLUMNS);
 const [desktopColumnsReady,setDesktopColumnsReady]=useState(false),[draggedColumn,setDraggedColumn]=useState<DesktopColumnKey|null>(null);
 const [sortBy,setSortBy]=useState("transactionAt"),[sortDir,setSortDir]=useState<"asc"|"desc">("desc");
 const [incomeOpen,setIncomeOpen]=useState(false),[incomeLoading,setIncomeLoading]=useState(false);
 const [incomeBreakdown,setIncomeBreakdown]=useState<EarningBreakdown|null>(null);
 const [incomeError,setIncomeError]=useState(""),[expandedIncomeCategory,setExpandedIncomeCategory]=useState<string|null>(null);
 const [incomeDetails,setIncomeDetails]=useState<{category:string;page:number;pageSize:number;count:number;rows:EarningCategory["examples"]}|null>(null);
 const [incomeDetailsLoading,setIncomeDetailsLoading]=useState(false);
 const incomeRequest=useRef(0);

 function filterParams(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy,sortDir});
  if(q.trim())params.set("q",q.trim());if(type)params.set("type",type);if(status)params.set("status",status);if(moneyStatusFilter)params.set("moneyStatus",moneyStatusFilter);
  if(range!=="all"){
   const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setHours(23,59,59,999);
   if(range==="yesterday"){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}
   if(range==="week")start.setDate(start.getDate()-6);
   params.set("from",start.toISOString());params.set("to",end.toISOString());
  }
  return params;
 }
 function load(page=pagination.page){
  const params=filterParams(page);
  ++incomeRequest.current;
  setIncomeOpen(false);setIncomeBreakdown(null);
  setLoading(true);
  return apiFetch<Paged>("/transactions?"+params.toString()).then(r=>{setItems(r.items);setPagination(r.pagination);setAggregates(r.aggregates);setError("");}).finally(()=>setLoading(false));
 }
 function toggleIncomeBreakdown(){
  if(incomeOpen){++incomeRequest.current;setIncomeOpen(false);return;}
  const request=++incomeRequest.current;
  setIncomeOpen(true);setIncomeLoading(true);setIncomeError("");setIncomeBreakdown(null);setExpandedIncomeCategory(null);setIncomeDetails(null);
  apiFetch<EarningBreakdown>("/transactions/income-breakdown?"+filterParams(1).toString())
   .then(data=>{if(request===incomeRequest.current)setIncomeBreakdown(data);})
   .catch(err=>{if(request===incomeRequest.current)setIncomeError(err instanceof Error?err.message:"Unable to load income breakdown");})
   .finally(()=>{if(request===incomeRequest.current)setIncomeLoading(false);});
 }
 function showIncomeDetails(category:string,page=1){
  const request=++incomeRequest.current;
  setIncomeDetailsLoading(true);setIncomeError("");
  const params=filterParams(1);
  params.set("detailCategory",category);params.set("detailPage",String(page));
  apiFetch<EarningBreakdown>("/transactions/income-breakdown?"+params.toString())
   .then(data=>{
    if(request!==incomeRequest.current)return;
    const group=data.categories.find(g=>g.category===category);
    setIncomeDetails({category,page:data.detailPage??page,pageSize:data.detailPageSize??25,count:group?.count??0,rows:group?.examples??[]});
   })
   .catch(err=>{if(request===incomeRequest.current)setIncomeError(err instanceof Error?err.message:"Failed to load contributing transactions");})
   .finally(()=>{if(request===incomeRequest.current)setIncomeDetailsLoading(false);});
 }
 useEffect(()=>{const initial=new URLSearchParams(window.location.search).get("type");if(!initial)return;const timer=window.setTimeout(()=>setType(initial),0);return()=>window.clearTimeout(timer);},[]);
 useEffect(()=>{
  if(!filtersOpen&&!columnsOpen)return;
  const closeOnEscape=(event:KeyboardEvent)=>{
   if(event.key!=="Escape"||event.defaultPrevented)return;
   setFiltersOpen(false);setColumnsOpen(false);
  };
  document.addEventListener("keydown",closeOnEscape);
  return()=>document.removeEventListener("keydown",closeOnEscape);
 },[filtersOpen,columnsOpen]);
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

 const clearFilters=()=>{setQ("");setType("");setStatus("");setMoneyStatusFilter("");setRange("today");};
 const toggleDesktopColumn=(key:DesktopColumnKey)=>{if(LOCKED_DESKTOP_COLUMNS.has(key))return;setDesktopVisibleColumns(v=>v.includes(key)?v.filter(k=>k!==key):desktopColumnOrder.filter(k=>k===key||v.includes(k)));};
 const moveDesktopColumn=(source:DesktopColumnKey,target:DesktopColumnKey)=>{if(source===target)return;setDesktopColumnOrder(order=>{const next=order.filter(k=>k!==source);next.splice(next.indexOf(target),0,source);return next;});};
 const resetDesktopColumns=()=>{setDesktopColumnOrder(DEFAULT_DESKTOP_COLUMNS);setDesktopVisibleColumns(DEFAULT_DESKTOP_COLUMNS);};
 const changeSort=(key:DesktopColumnKey)=>{const next=SORTABLE_DESKTOP_COLUMNS[key];if(!next)return;if(sortBy===next)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortBy(next);setSortDir("asc");}};

 const grouped=items.reduce((map,t)=>{const k=new Date(t.transactionAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});const row=map.get(k)??[];row.push(t);map.set(k,row);return map;},new Map<string,Tx[]>());

 return <AppShell><PageFrame width="max-w-none" className="ui-preview transactions-preview w-full min-w-0">
  <SectionHeading title="Transactions"/>

  <Surface className="p-3 sm:p-4">
   <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
     <label className="relative min-w-0 flex-1">
      <span className="sr-only">Search transactions</span>
      <input name="cashledger_search_transactions" autoComplete="off" type="search" className="app-control w-full pr-9" placeholder="Search customer, ID or reference" value={q} onChange={e=>setQ(e.target.value)}/>
     </label>
     <button type="button" aria-expanded={filtersOpen} aria-controls="transaction-more-filters"
      onClick={()=>{setFiltersOpen(v=>!v);setColumnsOpen(false);}}
      className={"min-h-11 shrink-0 rounded-xl border px-3 text-xs font-bold transition sm:px-4 sm:text-sm "+
       (filtersOpen||type||status||moneyStatusFilter?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] bg-[var(--surface)] text-[var(--text)]")}>
      {filtersOpen?"Close filters":"More filters"}{type||status||moneyStatusFilter?" · "+[type,status,moneyStatusFilter].filter(Boolean).length:""}
     </button>
     <button type="button" aria-expanded={columnsOpen} aria-controls="transaction-columns"
      onClick={()=>{setColumnsOpen(v=>!v);setFiltersOpen(false);}}
      className={"hidden min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold transition md:inline-flex md:items-center "+
       (columnsOpen?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] bg-[var(--surface)]")}>
      Columns
     </button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
     <div role="group" aria-label="Transaction date" className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-xl bg-[var(--surface-soft)] p-1 sm:max-w-[440px]">
      {([["today","Today"],["yesterday","Yesterday"],["week","7 days"],["all","All time"]] as [Range,string][]).map(([value,label])=>
       <button type="button" key={value} aria-pressed={range===value} onClick={()=>setRange(value)}
        className={"min-h-10 rounded-lg px-1 text-[11px] font-bold transition sm:px-3 sm:text-xs "+
         (range===value?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)] hover:text-[var(--text)]")}>
        {label}
       </button>)}
     </div>
     {(q||activeFilterCount>0)?<button type="button" onClick={clearFilters} className="min-h-10 rounded-xl px-3 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]">Reset all</button>:null}
    </div>
   </div>
   {filtersOpen?<div id="transaction-more-filters" className="mt-3 border-t border-[var(--border)] pt-3">
    <div className="grid gap-3 sm:grid-cols-3">
     <label className="block text-xs font-semibold text-[var(--text-muted)]">Service
      <select aria-label="Filter by service" className="app-control mt-1.5 w-full" value={type} onChange={e=>setType(e.target.value)}>
       <option value="">All services</option>
       {["CARD_SWIPE","CARD_DUE_CLEARING","CARD_DUE_RECOVERY","CARD_DUE_COMMISSION_COLLECTION","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","SERVICE_INCOME","CUSTOMER_PAYOUT","CUSTOMER_RECEIPT","INTERNAL_TRANSFER","ACCOUNT_ENTRY","CUSTOMER_LEDGER_ENTRY","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x} value={x}>{label(x)}</option>)}
      </select>
     </label>
     <label className="block text-xs font-semibold text-[var(--text-muted)]">Transaction status
      <select aria-label="Filter by transaction status" className="app-control mt-1.5 w-full" value={status} onChange={e=>setStatus(e.target.value)}>
       <option value="">All statuses</option>
       {["PENDING","PARTIALLY_PAID","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x} value={x}>{label(x)}</option>)}
      </select>
     </label>
     <label className="block text-xs font-semibold text-[var(--text-muted)]">Payout / Pay-in
      <select aria-label="Filter by payout or pay-in" className="app-control mt-1.5 w-full" value={moneyStatusFilter} onChange={e=>setMoneyStatusFilter(e.target.value)}>
       <option value="">All payouts / pay-ins</option>
       {moneyStatusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
     </label>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3">
     <p className="text-[11px] text-[var(--text-muted)]">Results update automatically.</p>
     <button type="button" onClick={()=>setFiltersOpen(false)}
      className="min-h-10 rounded-xl bg-[var(--accent)] px-5 text-xs font-black text-white">
      Done
     </button>
    </div>
   </div>:null}
   {columnsOpen?<div id="transaction-columns" className="mt-3 border-t border-[var(--border)] pt-3">
    <div className="mb-3 flex items-center justify-between gap-3">
     <div><p className="text-sm font-bold">Table columns</p><p className="text-[11px] text-[var(--text-muted)]">Select columns or drag to reorder.</p></div>
     <button type="button" onClick={resetDesktopColumns} className="min-h-9 rounded-lg px-3 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]">Reset columns</button>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
     {desktopColumnOrder.map(key=><label key={key} draggable onDragStart={()=>setDraggedColumn(key)} onDragEnd={()=>setDraggedColumn(null)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(draggedColumn)moveDesktopColumn(draggedColumn,key);setDraggedColumn(null);}}
      className={"flex cursor-grab items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm "+(draggedColumn===key?"opacity-50":"")}>
      <span aria-hidden className="select-none text-[var(--text-muted)]">⋮⋮</span>
      <input type="checkbox" checked={desktopVisibleColumns.includes(key)} disabled={LOCKED_DESKTOP_COLUMNS.has(key)} onChange={()=>toggleDesktopColumn(key)}/>
      <span className="min-w-0 flex-1 font-semibold">{DESKTOP_COLUMN_META[key].label}</span>
      {LOCKED_DESKTOP_COLUMNS.has(key)?<span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Fixed</span>:null}
     </label>)}
    </div>
    <div className="mt-3 flex justify-end"><button type="button" onClick={()=>setColumnsOpen(false)} className="min-h-10 rounded-xl bg-[var(--accent)] px-5 text-xs font-black text-white">Done</button></div>
   </div>:null}
  </Surface>

  <div className="-mx-3 overflow-x-auto px-3 pb-1 md:hidden">
   <div className="flex min-w-max gap-2">
    <button type="button" onClick={toggleIncomeBreakdown} aria-expanded={incomeOpen} aria-controls="transactions-net-income-breakdown" className="w-[165px] shrink-0 text-left"><Surface className="h-full border border-[var(--money-in)] p-3"><p className="text-[9px] font-black uppercase tracking-[.07em]">Net income <span aria-hidden>↗</span></p><p className={"money mt-1 text-base font-black "+(aggregates.profit<0?"text-[var(--money-out)]":"text-[var(--money-in)]")}>{money(aggregates.profit)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">After transaction costs</p></Surface></button>
    {[
     ["Processed",money(aggregates.processed),"text-[var(--text)]"],
     ["Total income",money(aggregates.totalIncome),"text-[var(--money-in)]"],
     ["Transactions",String(pagination.total),"text-[var(--text)]"],
     ["Customer commission",money(aggregates.customerCommission),"text-[var(--money-in)]"],
     ["Provider income",money(aggregates.providerIncome),"text-[var(--money-in)]"],
     ["Service revenue",money(aggregates.serviceRevenue),"text-[var(--money-in)]"],
     ["Provider / bank cost",money(aggregates.providerCost),"text-[var(--money-out)]"],
     ["Partner cost",money(aggregates.partnerCost),"text-[var(--money-out)]"],
    ].map(([name,value,tone])=><Surface key={name} className="w-[145px] shrink-0 p-3"><p className="text-[9px] font-bold uppercase tracking-[.07em] text-[var(--text-muted)]">{name}</p><p className={"money mt-1 truncate text-base font-black "+tone}>{value}</p></Surface>)}
   </div>
  </div>
  <div className="hidden gap-2.5 md:grid md:grid-cols-4 xl:grid-cols-9">
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Processed</p><p className="money mt-1.5 truncate text-lg font-bold">{money(aggregates.processed)}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Total income</p><p className="money mt-1.5 truncate text-lg font-bold text-[var(--money-in)]">{money(aggregates.totalIncome)}</p></Surface>
   <Surface className="border border-[var(--money-in)] p-0"><button type="button" onClick={toggleIncomeBreakdown} aria-expanded={incomeOpen} aria-controls="transactions-net-income-breakdown" className="block h-full w-full p-3.5 text-left hover:bg-[var(--surface-soft)]"><p className="text-[10px] font-bold uppercase tracking-[.07em]">Net income ↗</p><p className={"money mt-1.5 truncate text-lg font-black "+(aggregates.profit<0?"text-[var(--money-out)]":"text-[var(--money-in)]")}>{money(aggregates.profit)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">After transaction costs</p></button></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Customer commission</p><p className="money mt-1.5 truncate text-lg font-bold text-[var(--money-in)]">{money(aggregates.customerCommission)}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Provider income</p><p className="money mt-1.5 truncate text-lg font-bold text-[var(--money-in)]">{money(aggregates.providerIncome)}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Service revenue</p><p className="money mt-1.5 truncate text-lg font-bold text-[var(--money-in)]">{money(aggregates.serviceRevenue)}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Provider / bank cost</p><p className="money mt-1.5 truncate text-lg font-bold text-[var(--money-out)]">{money(aggregates.providerCost)}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Partner cost</p><p className="money mt-1.5 truncate text-lg font-bold text-[var(--money-out)]">{money(aggregates.partnerCost)}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Transactions</p><p className="money mt-1.5 text-lg font-bold">{pagination.total}</p></Surface>
  </div>

  {incomeOpen?<Surface className="overflow-hidden" >
   <div id="transactions-net-income-breakdown" className="p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><h3 className="text-lg font-black">Net income breakdown</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Same date and transaction filters as above · Recorded revenue less recorded transaction costs.</p></div>
     <button type="button" onClick={()=>{++incomeRequest.current;setIncomeOpen(false);}} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-bold">Close</button>
    </div>
    {incomeLoading?<p className="mt-4 text-sm text-[var(--text-muted)]">Calculating recorded income and fees across the selected transactions…</p>:null}
    {incomeError?<p role="alert" className="mt-3 text-sm text-[var(--money-out)]">{incomeError}</p>:null}
    {incomeBreakdown?<div className="mt-4 space-y-4">
     {incomeBreakdown.reconciliation?<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3" role="status">
      <p className="text-sm font-black">{incomeBreakdown.reconciliation.balanced?"✓ Reconciled with saved transaction records":"⚠ Income reconciliation mismatch — review required"}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Independent totals for the selected date and filters: Income {money(incomeBreakdown.reconciliation.independentIncome)} · Costs {money(incomeBreakdown.reconciliation.independentCosts)} · Net {money(incomeBreakdown.reconciliation.independentNetIncome)}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{incomeBreakdown.reconciliation.transactionCount} transactions, including charges from {incomeBreakdown.reconciliation.quickCompletionCount} linked Quick Cash completions. {incomeBreakdown.reconciliation.balanced?"Source totals and all category totals match.":"Differences: "+incomeBreakdown.reconciliation.discrepancies.join(", ")}</p>
     </div>:null}
     <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {([["Customer commission",incomeBreakdown.summary.customerCommission,false],["Provider commission",incomeBreakdown.summary.providerIncome,false],["Service revenue",incomeBreakdown.summary.serviceRevenue,false],["Provider / bank fees",incomeBreakdown.summary.providerCost,true],["Payout fees",incomeBreakdown.summary.payoutCost,true],["Partner costs",incomeBreakdown.summary.partnerCost,true]] as [string,number,boolean][]).map(([title,amount,cost])=>
       <div key={title} className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold text-[var(--text-muted)]">{title}</p><p className={"money mt-1 text-sm font-black "+(cost?"text-[var(--money-out)]":"text-[var(--money-in)]")}>{cost?"−":"+"}{money(amount)}</p></div>)}
     </div>
     <div className="flex flex-wrap items-center justify-between gap-2 border-y border-[var(--border)] py-3">
      <p className="text-sm font-bold">Total income {money(incomeBreakdown.summary.totalIncome)} − costs {money(incomeBreakdown.summary.providerCost+incomeBreakdown.summary.payoutCost+incomeBreakdown.summary.partnerCost)}</p>
      <p className={"money text-lg font-black "+(incomeBreakdown.summary.netIncome<0?"text-[var(--money-out)]":"text-[var(--money-in)]")}>Net income {money(incomeBreakdown.summary.netIncome)}</p>
     </div>
     <p className="text-xs leading-5 text-[var(--text-muted)]">{incomeBreakdown.basis} Payout costs may appear on a later transaction date than the original swipe. Only recorded charges are deducted; missing provider costs need to be entered to make this accurate.</p>
     <div>
      <h4 className="mb-2 text-sm font-black">Earnings by transaction / service type</h4>
      {incomeBreakdown.categories.length? <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
       {incomeBreakdown.categories.map(group=><div key={group.category}>
        <button type="button" aria-expanded={expandedIncomeCategory===group.category} onClick={()=>{++incomeRequest.current;setIncomeDetails(null);setExpandedIncomeCategory(value=>value===group.category?null:group.category);}}
         className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 text-left hover:bg-[var(--surface-soft)]">
         <span className="min-w-0"><span className="block text-sm font-bold">{group.category} <span aria-hidden>{expandedIncomeCategory===group.category?"▴":"▾"}</span></span><span className="block text-[11px] text-[var(--text-muted)]">{group.count} contributing transaction(s) · Income {money(group.totals.totalIncome)} · Costs {money(group.totals.providerCost+group.totals.payoutCost+group.totals.partnerCost)}</span></span>
         <strong className={"money text-sm "+(group.totals.netIncome<0?"text-[var(--money-out)]":"text-[var(--money-in)]")}>{money(group.totals.netIncome)}</strong>
        </button>
        {expandedIncomeCategory===group.category?<div className="space-y-1 border-t border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
         <p className="mb-1 text-[11px] text-[var(--text-muted)]">{incomeDetails?.category===group.category?'Showing page '+incomeDetails.page+' of the complete history':'Latest '+group.examples.length+' of '+group.count+' contributing transaction(s)'}. Select an ID for the full audited fee and commission details.</p>
         {(incomeDetails?.category===group.category?incomeDetails.rows:group.examples).map((item,index)=><Link key={item.id+"-"+index} href={"/transactions/"+item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface)] p-2 text-xs hover:underline">
          <span className="font-semibold text-[var(--accent)]">{item.transactionNumber}{item.customer?" · "+item.customer:""}{"attribution" in item && typeof item.attribution==="string"?" · "+item.attribution:""}</span>
          <span className="text-[var(--text-muted)]">Income {money(item.amounts.totalIncome)} · Costs {money(item.amounts.providerCost+item.amounts.payoutCost+item.amounts.partnerCost)}</span>
          <strong className={"money "+(item.amounts.netIncome<0?"text-[var(--money-out)]":"text-[var(--money-in)]")}>{money(item.amounts.netIncome)}</strong>
         </Link>)}
         {incomeDetailsLoading&&incomeDetails?.category===group.category?<p className="py-2 text-xs">Loading transaction history…</p>:null}
         {incomeDetails?.category===group.category?<div className="flex flex-wrap items-center justify-between gap-2 py-2">
           <button type="button" disabled={incomeDetails.page<=1||incomeDetailsLoading} onClick={()=>showIncomeDetails(group.category,incomeDetails.page-1)} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-40">Previous</button>
           <span className="text-xs font-medium">Page {incomeDetails.page} / {Math.max(1,Math.ceil(incomeDetails.count/incomeDetails.pageSize))}</span>
           <button type="button" disabled={incomeDetailsLoading||incomeDetails.page*incomeDetails.pageSize>=incomeDetails.count} onClick={()=>showIncomeDetails(group.category,incomeDetails.page+1)} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-40">Next</button>
          </div>:group.count>8?<button type="button" onClick={()=>showIncomeDetails(group.category)} disabled={incomeDetailsLoading} className="mt-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-[var(--surface)]">View all {group.count} transactions</button>:null}
        </div>:null}
       </div>)}
      </div>:<p className="text-sm text-[var(--text-muted)]">No recorded income or transaction costs for the selected range.</p>}
     </div>
    </div>:null}
   </div>
  </Surface>:null}

  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>:null}
  {loading?<PageLoader label="Loading transactions…"/>:<>
   <div className="space-y-4 md:hidden">
    {[...grouped.entries()].map(([day,rows])=><section key={day}><div className="sticky top-15 z-10 mb-1.5 bg-[var(--bg)] py-1 text-xs font-semibold text-[var(--text-muted)]">{day}</div><Surface className="overflow-hidden"><div className="divide-y divide-[var(--border)]">{rows.map(tx=>{const context=activityContext(tx),direction=activityDirection(tx),source=settlementSource(tx);return <Link key={tx.id} href={txHref(tx)} className="block px-4 py-3.5 hover:bg-[var(--surface-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-5">{context.title}</p>
          {displayServiceDetail(tx)?<p className="mt-0.5 text-xs leading-4 text-[var(--text-muted)]">{displayServiceDetail(tx)}</p>:null}
          <div className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
            <p className="truncate">{tx.transactionNumber} · {new Date(tx.transactionAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} · {displayUser(tx)}</p>
            {source||tx.transactionType==="SERVICE_INCOME"?<p className="mt-0.5 line-clamp-2"><span className="font-semibold text-[var(--text)]">Received in:</span> {sourceContext(tx)}</p>:null}
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
    <tbody>{items.map(tx=>{const providerFees=sum(tx.charges.filter(charge=>charge.chargeType!=="SERVICE_PARTNER_COST")),customerCommission=customerCommissionIncome(tx),providerEarn=providerIncome(tx),service=serviceRevenue(tx),partnerCost=tx.transactionType==="SERVICE_INCOME"?Number(tx.quickCashTransfer?.servicePartnerCharge??0):0,netServiceEarning=service-partnerCost,income=customerCommission+providerEarn+service,profit=income-providerFees-partnerCost,direction=activityDirection(tx),source=settlementSource(tx),mStatus=moneyStatus(tx);
      const content=(key:DesktopColumnKey)=>{
       if(key==="transactionId")return <Link className="font-bold text-[var(--accent)] whitespace-nowrap" href={txHref(tx)}>{tx.transactionNumber}</Link>;
       if(key==="date")return <span className="text-xs whitespace-nowrap">{new Date(tx.transactionAt).toLocaleString("en-IN")}</span>;
       if(key==="service")return <><span className="flex min-w-0 items-start gap-2">{direction?<MoneyFlowIcon direction={direction} size="sm"/>:null}<span className="min-w-0 break-words font-medium leading-5">{displayService(tx)}{displayServiceDetail(tx)?<span className="mt-0.5 block text-[11px] font-normal leading-4 text-[var(--text-muted)]">{displayServiceDetail(tx)}</span>:null}</span></span>{providerEarn>0?<span className="mt-0.5 block text-[10px] font-bold leading-4 text-[var(--money-in)]">Provider commission +{money(providerEarn)}</span>:null}</>;
       if(key==="customer")return <span className="block break-words font-semibold">{displayCustomer(tx)}</span>;
       if(key==="source")return source||tx.transactionType==="SERVICE_INCOME"?<span className="block whitespace-normal break-words text-xs leading-5 text-[var(--text)]">{sourceContext(tx)}</span>:<span className="text-[var(--text-muted)]">—</span>;
       if(key==="user")return <span className="text-xs font-semibold whitespace-nowrap">{displayUser(tx)}</span>;
       if(key==="processed")return <span className={"money font-semibold whitespace-nowrap "+(direction==="IN"?"text-[var(--money-in)]":direction==="OUT"?"text-[var(--money-out)]":"")}>{direction==="IN"?"+":direction==="OUT"?"−":""}{money(tx.grossAmount)}</span>;
       if(key==="customerFee")return <span className="money font-bold text-[var(--money-in)] whitespace-nowrap">{customerCommission?"+"+money(customerCommission):"—"}</span>;
       if(key==="providerIncome")return <span className="money font-bold text-[var(--money-in)] whitespace-nowrap">{providerEarn?"+"+money(providerEarn):"—"}</span>;
       if(key==="serviceIncome")return <span className="money font-bold text-[var(--money-in)] whitespace-nowrap">{service?"+"+money(service):"—"}</span>;
       if(key==="partnerCost")return <span className="money text-[var(--money-out)] whitespace-nowrap">{partnerCost?"−"+money(partnerCost):"—"}</span>;
       if(key==="netServiceEarning")return <span className="money font-bold whitespace-nowrap">{service?money(netServiceEarning):"—"}</span>;
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
