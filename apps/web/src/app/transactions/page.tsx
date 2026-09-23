"use client";
/* eslint-disable react-hooks/exhaustive-deps */

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
const txHref=(tx:Tx)=>tx.transactionType==="CARD_DUE_CLEARING"?"/transactions/card-due-clearing?id="+tx.id:"/transactions/"+tx.id;
const sum=(rows:{amount:string}[])=>rows.reduce((a,x)=>a+Number(x.amount),0);
const customerFee=(tx:Tx)=>tx.commissions.filter(c=>c.commissionType!=="MICRO_ATM_PROVIDER").reduce((a,x)=>a+Number(x.amount),0);
const providerCommission=(tx:Tx)=>tx.commissions.filter(c=>c.commissionType==="MICRO_ATM_PROVIDER").reduce((a,x)=>a+Number(x.amount),0);
function activityDirection(tx:Tx):"IN"|"OUT"|null{
 if(["PROVIDER_SETTLEMENT","CUSTOMER_RECEIPT","CARD_DUE_RECOVERY","CARD_DUE_COMMISSION_COLLECTION"].includes(tx.transactionType))return "IN";
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
  title:label(tx.transactionType)+(tx.customer?" · "+tx.customer.fullName:""),
  meta:[tx.transactionNumber,detail,tx.createdBy?.fullName?"By "+tx.createdBy.fullName:null].filter(Boolean).join(" · "),
 };
}

export default function TransactionsPage(){
 const [items,setItems]=useState<Tx[]>([]);
 const [pagination,setPagination]=useState({page:1,pageSize:25,total:0,totalPages:1});
 const [q,setQ]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState(""),[moneyStatusFilter,setMoneyStatusFilter]=useState(""),[range,setRange]=useState<Range>("today");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);

 function load(page=pagination.page){
  const params=new URLSearchParams({page:String(page),pageSize:String(pagination.pageSize),sortBy:"transactionAt",sortDir:"desc"});
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
 useEffect(()=>{const timer=setTimeout(()=>load(1).catch(e=>setError(e instanceof Error?e.message:"Failed to load transactions")),160);return()=>clearTimeout(timer);},[q,type,status,moneyStatusFilter,range,pagination.pageSize]);

 const totals=useMemo(()=>items.reduce((a,t)=>({
  gross:a.gross+Number(t.grossAmount),net:a.net+Number(t.netAmount??t.grossAmount),
  fees:a.fees+sum(t.charges),earnings:a.earnings+sum(t.commissions)-sum(t.charges),
 }),{gross:0,net:0,fees:0,earnings:0}),[items]);
 const grouped=items.reduce((map,t)=>{const k=new Date(t.transactionAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});const row=map.get(k)??[];row.push(t);map.set(k,row);return map;},new Map<string,Tx[]>());

 return <AppShell><PageFrame className="ui-preview transactions-preview">
  <SectionHeading title="Transactions"/>
  <div id="transaction-actions" className="grid scroll-mt-20 grid-cols-2 gap-2 sm:grid-cols-4">{dailyActions.map(([mark,title,href])=><Link key={href} href={href} className="app-quick-action flex min-h-14 items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 shadow-sm"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[10px] font-black text-[var(--accent)]">{mark}</span><span className="truncate text-sm font-bold">{title}</span></Link>)}</div>

  <Surface className="p-1.5"><div className="grid grid-cols-4 gap-1">{([["today","Today"],["yesterday","Yesterday"],["week","7 days"],["all","All"]] as [Range,string][]).map(([v,l])=><button key={v} onClick={()=>setRange(v)} className={"min-h-11 rounded-xl px-2 text-xs font-semibold transition "+(range===v?"bg-[var(--accent)] text-white":"text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]")}>{l}</button>)}</div></Surface>
  <Surface className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
   <input className="app-control sm:col-span-2" placeholder="Search name, transaction or reference" value={q} onChange={e=>setQ(e.target.value)}/>
   <select className="app-control" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{["CARD_SWIPE","CARD_DUE_CLEARING","CARD_DUE_RECOVERY","CARD_DUE_COMMISSION_COLLECTION","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","CUSTOMER_PAYOUT","CUSTOMER_RECEIPT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}</select>
   <select className="app-control" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All transaction status</option>{["PENDING","PARTIALLY_PAID","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}</select>
   <select className="app-control" value={moneyStatusFilter} onChange={e=>setMoneyStatusFilter(e.target.value)}><option value="">All payout / pay-in</option>{moneyStatusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
  </Surface>

  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Processed</p><p className="money mt-1.5 truncate text-xl font-bold">{money(totals.gross)}</p></Surface>
   <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-[.07em] text-[var(--text-muted)]">Business earnings</p><p className="money mt-1.5 truncate text-xl font-bold text-[var(--money-in)]">{money(totals.earnings)}</p></Surface>
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
            {source?<p><span className="font-bold text-[var(--text)]">Source:</span> {sourceContext(tx)}</p>:null}
            <p><span className="font-bold text-[var(--text)]">By:</span> {displayUser(tx)} · {new Date(tx.transactionAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{direction?<MoneyFlowIcon direction={direction}/>:null}<p className={"money text-sm font-black "+(direction==="IN"?"text-[var(--money-in)]":direction==="OUT"?"text-[var(--money-out)]":"")}>{direction==="IN"?"+":direction==="OUT"?"−":""}{money(tx.grossAmount)}</p></div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5"><StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge>{moneyStatus(tx)?<StatusBadge tone={moneyStatus(tx)!.tone}>{moneyStatus(tx)!.label}</StatusBadge>:null}</div>
    </Link>})}</div></Surface></section>)}
    {!items.length?<EmptyState title="No transactions" description="Try another date or filter."/>:null}
   </div>

   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1940px] table-fixed text-sm">
    <thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr>
      <th className="w-[150px] px-4 py-3">Date</th><th className="w-[150px]">Service</th><th className="w-[170px]">Customer</th><th className="w-[165px]">Transaction ID</th><th className="w-[340px]">Source / settlement</th><th className="w-[120px]">User</th>
      <th className="text-right">Processed</th><th className="text-right">Customer fee</th><th className="text-right">Provider fee</th><th className="text-right">Profit</th><th className="text-right">Customer gets / net</th><th className="pl-4">Transaction status</th><th>Payout / Pay-in</th><th>Due date</th>
    </tr></thead>
    <tbody>{items.map(tx=>{const providerFees=sum(tx.charges),custFee=customerFee(tx),providerEarn=providerCommission(tx),profit=custFee+providerEarn-providerFees,direction=activityDirection(tx),source=settlementSource(tx);return <tr key={tx.id} className="border-t border-[var(--border)] align-top hover:bg-[var(--surface-soft)]">
      <td className="px-4 py-3 text-xs whitespace-nowrap">{new Date(tx.transactionAt).toLocaleString("en-IN")}</td>
      <td className="py-3 font-medium"><span className="flex items-center gap-2">{direction?<MoneyFlowIcon direction={direction} size="sm"/>:null}<span>{label(tx.transactionType)}</span></span>{providerEarn>0?<span className="mt-0.5 block text-[10px] font-bold text-[var(--money-in)]">Provider commission +{money(providerEarn)}</span>:null}</td>
      <td className="py-3 font-semibold">{displayCustomer(tx)}</td>
      <td className="py-3"><Link className="font-bold text-[var(--accent)] whitespace-nowrap" href={txHref(tx)}>{tx.transactionNumber}</Link></td>
      <td className="py-3 pr-4 text-xs leading-5 text-[var(--text-muted)]">{source?<span className="block whitespace-normal break-words text-[var(--text)]">{sourceContext(tx)}</span>:<span>—</span>}</td>
      <td className="py-3 text-xs font-semibold whitespace-nowrap">{displayUser(tx)}</td>
      <td className={"money py-3 text-right font-semibold "+(direction==="IN"?"text-[var(--money-in)]":direction==="OUT"?"text-[var(--money-out)]":"")}>{direction==="IN"?"+":direction==="OUT"?"−":""}{money(tx.grossAmount)}</td>
      <td className="money py-3 text-right font-bold text-[var(--money-in)]">{custFee?"+"+money(custFee):"—"}</td>
      <td className="money py-3 text-right text-[var(--money-out)]">{providerFees?"−"+money(providerFees):"—"}</td>
      <td className={"money py-3 text-right font-bold "+(profit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{custFee||providerEarn||providerFees?money(profit):"—"}</td>
      <td className="money py-3 text-right font-semibold">{money(tx.netAmount??tx.grossAmount)}</td>
      <td className="py-3 pl-4"><StatusBadge tone={statusTone(tx.status) as "slate"|"emerald"|"amber"|"rose"}>{label(tx.status)}</StatusBadge></td>
      <td className="py-3">{moneyStatus(tx)?<StatusBadge tone={moneyStatus(tx)!.tone}>{moneyStatus(tx)!.label}</StatusBadge>:<span className="text-[var(--text-muted)]">—</span>}</td>
      <td className="py-3 pr-4 text-xs text-[var(--text-muted)] whitespace-nowrap">{moneyStatus(tx)?.dueAt?new Date(moneyStatus(tx)!.dueAt!).toLocaleDateString("en-IN"):"—"}</td>
    </tr>})}</tbody>
   </table></div></Surface>
   <Pager total={pagination.total} page={pagination.page} totalPages={pagination.totalPages} label="transaction" onPrevious={()=>load(pagination.page-1).catch(()=>{})} onNext={()=>load(pagination.page+1).catch(()=>{})}/>
  </>}
 </PageFrame></AppShell>;
}
