"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, PageFrame, PageLoader, PanelHeader, SectionHeading, SegmentedTabs, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Tx={id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;charges:{amount:string}[];commissions:{amount:string}[]};
type Account={id:string;accountName:string;accountType:string};
type Customer={id:string;fullName:string};
type Provider={id:string;name:string;gateways:{id:string;gatewayName:string}[]};
type Operator={id:string;fullName:string;role:{name:string}};
type AccountLedger={account:{accountName:string};openingBalance:number;openingBalanceIntroducedInRange?:number;rows:{id:string;entryType:string;amount:string;runningBalance:number;description:string|null;journal:{postingDate:string;transaction:{transactionNumber:string;customer:{fullName:string}|null}}}[]};
type CustomerLedger={customer:{fullName:string;customerCode:string};transactions:Tx[];payables:{id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string}[];receivables:{id:string;reason:string;reasonCategory?:string;originalAmount:string;receivedAmount:string;remainingAmount:string;dueAt:string|null;status:string}[]};
type Settlement={id:string;expectedAmount:string;receivedAmount:string;remainingAmount:string;dueAt:string|null;status:string;provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:{accountName:string};sourceTransaction:{transactionNumber:string;transactionType:string;transactionAt:string;customer:{fullName:string}|null};receipts:{id:string;amount:string;receivedAt:string;destinationAccount:{accountName:string}}[]};
type Eod={id:string;businessDate:string;availableFunds:string;pendingProviderSettlements:string;customerReceivable:string;customerPayable:string;ownerCreditCardOutstanding:string;operatingPosition:string;netFinancialPosition:string;cashVariance:string;createdAt:string};
type Tab="transactions"|"settlements"|"eod";
const money=(v:number|string|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v||0));
const txTone=(s:string)=>s==="COMPLETED"?"emerald":s==="PENDING"?"amber":s==="REVERSED"?"rose":"slate";
const settlementTone=(s:string)=>s==="SETTLED"?"emerald":s.includes("PARTIAL")?"indigo":s.includes("OVERDUE")?"rose":"amber";

export default function ReportsPage(){
 const [tab,setTab]=useState<Tab>("transactions");
 const [transactions,setTransactions]=useState<Tx[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[providers,setProviders]=useState<Provider[]>([]),[operators,setOperators]=useState<Operator[]>([]);
 const [settlements,setSettlements]=useState<Settlement[]>([]),[eod,setEod]=useState<Eod[]>([]);
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[type,setType]=useState(""),[customerId,setCustomerId]=useState(""),[accountId,setAccountId]=useState(""),[providerId,setProviderId]=useState(""),[gatewayId,setGatewayId]=useState(""),[staffId,setStaffId]=useState(""),[reference,setReference]=useState("");
 const [ledger,setLedger]=useState<AccountLedger|null>(null),[customerLedger,setCustomerLedger]=useState<CustomerLedger|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[filtering,setFiltering]=useState(false);
 const control="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";

 const loadTransactions=()=>{
  const q=new URLSearchParams();
  if(from)q.set("from",new Date(from+"T00:00:00").toISOString());
  if(to)q.set("to",new Date(to+"T23:59:59").toISOString());
  if(type)q.set("type",type);if(customerId)q.set("customerId",customerId);if(accountId)q.set("accountId",accountId);if(providerId)q.set("providerId",providerId);if(gatewayId)q.set("gatewayId",gatewayId);if(staffId)q.set("staffId",staffId);if(reference)q.set("reference",reference);
  setFiltering(true);
  return apiFetch<Tx[]>("/reports/transactions?"+q.toString()).then(setTransactions).finally(()=>setFiltering(false));
 };

 useEffect(()=>{
  Promise.all([
   apiFetch<Account[]>("/dashboard/accounts"),
   apiFetch<Customer[]>("/customers"),
   apiFetch<Provider[]>("/providers?includeInactive=true"),
   apiFetch<Operator[]>("/reports/operators"),
   apiFetch<Settlement[]>("/reports/provider-settlements"),
   apiFetch<Eod[]>("/reports/end-of-day"),
  ]).then(([a,c,p,o,s,d])=>{setAccounts(a);setCustomers(c);setProviders(p);setOperators(o);setSettlements(s);setEod(d);return loadTransactions();})
   .catch(()=>setError("Failed to load reports")).finally(()=>setLoading(false));
 },[]);
 useEffect(()=>{if(loading)return;const timer=setTimeout(()=>loadTransactions().catch(()=>setError("Failed to filter report")),180);return()=>clearTimeout(timer);},[from,to,type,customerId,accountId,providerId,gatewayId,staffId,reference]);
 useEffect(()=>{
  if(!accountId){setLedger(null);return;}
  const q=new URLSearchParams();if(from)q.set("from",new Date(from+"T00:00:00").toISOString());if(to)q.set("to",new Date(to+"T23:59:59").toISOString());
  apiFetch<AccountLedger>("/reports/accounts/"+accountId+(q.toString()?"?"+q.toString():"")).then(setLedger).catch(()=>setError("Failed to load account ledger"));
 },[accountId,from,to]);
 useEffect(()=>{if(!customerId){setCustomerLedger(null);return;}apiFetch<CustomerLedger>("/reports/customers/"+customerId).then(setCustomerLedger).catch(()=>setError("Failed to load customer ledger"));},[customerId]);

 const totals=useMemo(()=>transactions.reduce((a,t)=>({gross:a.gross+Number(t.grossAmount),net:a.net+Number(t.netAmount??t.grossAmount),commission:a.commission+t.commissions.reduce((s,c)=>s+Number(c.amount),0),charges:a.charges+t.charges.reduce((s,c)=>s+Number(c.amount),0)}),{gross:0,net:0,commission:0,charges:0}),[transactions]);
 const settlementTotals=useMemo(()=>settlements.reduce((a,s)=>({expected:a.expected+Number(s.expectedAmount),received:a.received+Number(s.receivedAmount),remaining:a.remaining+Number(s.remainingAmount)}),{expected:0,received:0,remaining:0}),[settlements]);
 const latestEod=eod[0]??null;

 function clearFilters(){setFrom("");setTo("");setType("");setCustomerId("");setAccountId("");setProviderId("");setGatewayId("");setStaffId("");setReference("");}
 function downloadCsv(){
  const esc=(v:unknown)=>'"'+String(v??"").replaceAll('"','""')+'"';
  let rows:(string|number)[][]=[];let name="cash-ledger-report.csv";
  if(tab==="transactions"){rows=[["Transaction","Date","Type","Customer","Operator","Gross","Net","Status","Reference"],...transactions.map(t=>[t.transactionNumber,t.transactionAt,t.transactionType,t.customer?.fullName??"",t.createdBy?.fullName??"",t.grossAmount,t.netAmount??"",t.status,t.referenceNumber??""])];name="cash-ledger-transactions.csv";}
  else if(tab==="settlements"){rows=[["Source","Date","Provider","Gateway","Expected","Received","Remaining","Target","Due","Status"],...settlements.map(s=>[s.sourceTransaction.transactionNumber,s.sourceTransaction.transactionAt,s.provider?.name??"",s.gateway?.gatewayName??"",s.expectedAmount,s.receivedAmount,s.remainingAmount,s.destinationAccount.accountName,s.dueAt??"",s.status])];name="cash-ledger-provider-settlements.csv";}
  else{rows=[["Business Date","Available Funds","Provider Clearing","Receivables","Payables","Operating Position","Owner CC","Net Position","Cash Variance"],...eod.map(x=>[x.businessDate,x.availableFunds,x.pendingProviderSettlements,x.customerReceivable,x.customerPayable,x.operatingPosition,x.ownerCreditCardOutstanding,x.netFinancialPosition,x.cashVariance])];name="cash-ledger-eod.csv";}
  const blob=new Blob([rows.map(r=>r.map(esc).join(",")).join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
 }
 if(loading)return <AppShell><PageLoader label="Preparing reports…"/></AppShell>;
 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Analysis & reconciliation" title="Reports" description="Understand activity, clearing, account movement and end-of-day position without scanning raw tables."
   action={<button onClick={downloadCsv} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm">Export CSV</button>}/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <SegmentedTabs<Tab> value={tab} onChange={setTab} items={[
   {value:"transactions",label:"Transactions & ledgers",count:transactions.length},
   {value:"settlements",label:"Provider clearing",count:settlements.length},
   {value:"eod",label:"End of day",count:eod.length},
  ]}/>

  {tab==="transactions"?<>
   <Surface className="overflow-hidden">
    <PanelHeader title="Report filters" description="Narrow activity by period, operator, customer, account or provider." action={<button onClick={clearFilters} className="text-xs font-bold text-indigo-600">Clear filters</button>}/>
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
     <Field label="From"><input className={control} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field>
     <Field label="To"><input className={control} type="date" value={to} onChange={e=>setTo(e.target.value)}/></Field>
     <Field label="Type"><select className={control} value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM","CUSTOMER_PAYOUT","CUSTOMER_RECEIVABLE","CUSTOMER_RECEIPT","PROVIDER_SETTLEMENT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","CASH_ADJUSTMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}</select></Field>
     <Field label="Customer"><select className={control} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
     <Field label="Account / ledger"><select className={control} value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">All accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
     <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}}><option value="">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
     <Field label="Gateway"><select className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)}><option value="">All gateways</option>{providers.find(p=>p.id===providerId)?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
     <Field label="Operator"><select className={control} value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">All operators</option>{operators.map(o=><option key={o.id} value={o.id}>{o.fullName} · {o.role.name}</option>)}</select></Field>
     <Field label="Reference"><input className={control} placeholder="UTR / reference" value={reference} onChange={e=>setReference(e.target.value)}/></Field>
     <div className="flex items-end"><div className="flex min-h-11 w-full items-center rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-500">{filtering?"Updating report…":transactions.length+" matching transaction(s)"}</div></div>
    </div>
   </Surface>
   <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
    <DetailStat label="Gross activity" value={money(totals.gross)} tone="indigo"/>
    <DetailStat label="Net value" value={money(totals.net)}/>
    <DetailStat label="Commission" value={money(totals.commission)} tone="emerald"/>
    <DetailStat label="Charges" value={money(totals.charges)} tone="rose"/>
   </div>

   {transactions.length?<><div className="space-y-2 md:hidden">{transactions.map(t=><Surface key={t.id} className="p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{t.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(t.transactionAt).toLocaleString("en-IN")}</p></div><StatusBadge tone={txTone(t.status) as "slate"|"emerald"|"amber"|"rose"}>{t.status}</StatusBadge></div>
    <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-indigo-600">{t.transactionType.replaceAll("_"," ")}</p>
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><div><p className="text-slate-400">Customer</p><p className="mt-1 truncate font-semibold">{t.customer?.fullName??"—"}</p></div><div className="text-right"><p className="text-slate-400">Net</p><p className="mt-1 font-bold">{money(t.netAmount??t.grossAmount)}</p></div></div>
   </Surface>)}</div>
   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">No</th><th>Date</th><th>Type</th><th>Customer</th><th>Operator</th><th>Gross</th><th>Net</th><th>Commission</th><th>Charges</th><th className="pr-5">Status</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-3 font-bold">{t.transactionNumber}</td><td className="text-xs">{new Date(t.transactionAt).toLocaleString("en-IN")}</td><td className="text-xs font-semibold">{t.transactionType.replaceAll("_"," ")}</td><td>{t.customer?.fullName??"—"}</td><td>{t.createdBy?.fullName??"—"}</td><td>{money(t.grossAmount)}</td><td className="font-bold">{money(t.netAmount)}</td><td className="text-emerald-700">{money(t.commissions.reduce((s,c)=>s+Number(c.amount),0))}</td><td className="text-rose-700">{money(t.charges.reduce((s,c)=>s+Number(c.amount),0))}</td><td className="pr-5"><StatusBadge tone={txTone(t.status) as "slate"|"emerald"|"amber"|"rose"}>{t.status}</StatusBadge></td></tr>)}</tbody></table></div></Surface></>:<EmptyState title="No report activity" description="No transactions match the current filters."/>}
   {ledger?<Surface className="overflow-hidden">
    <PanelHeader title={ledger.account.accountName+" ledger"} description={"Opening balance "+money(ledger.openingBalance)+(Number(ledger.openingBalanceIntroducedInRange||0)!==0?" · Opening introduced "+money(ledger.openingBalanceIntroducedInRange||0):"")}/>
    <div className="space-y-2 p-3 md:hidden">{ledger.rows.map(r=><div key={r.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold">{r.journal.transaction.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(r.journal.postingDate).toLocaleString("en-IN")}</p></div><StatusBadge tone={r.entryType==="CREDIT"?"emerald":"indigo"}>{r.entryType}</StatusBadge></div><div className="mt-2 flex justify-between text-xs"><span>{money(r.amount)}</span><strong>Running {money(r.runningBalance)}</strong></div></div>)}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[750px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Customer</th><th>Dr/Cr</th><th>Amount</th><th>Running</th></tr></thead><tbody>{ledger.rows.map(r=><tr key={r.id} className="border-t border-slate-100"><td className="px-5 py-3 text-xs">{new Date(r.journal.postingDate).toLocaleString("en-IN")}</td><td>{r.journal.transaction.transactionNumber}</td><td>{r.journal.transaction.customer?.fullName??"—"}</td><td>{r.entryType}</td><td>{money(r.amount)}</td><td className="font-bold">{money(r.runningBalance)}</td></tr>)}</tbody></table></div>
   </Surface>:null}

   {customerLedger?<Surface className="overflow-hidden"><PanelHeader title={customerLedger.customer.fullName+" customer ledger"} description={customerLedger.customer.customerCode}/><div className="grid gap-px bg-slate-100 lg:grid-cols-3">
    <LedgerList title="Transactions">{customerLedger.transactions.map(t=><div key={t.id} className="flex items-start justify-between gap-3 border-t border-slate-100 py-2.5 first:border-0"><div className="min-w-0"><p className="truncate text-xs font-semibold">{t.transactionNumber} · {t.transactionType.replaceAll("_"," ")}</p><p className="text-[10px] text-slate-400">{t.createdBy?.fullName??"Unknown operator"}</p></div><strong className="shrink-0 text-xs">{money(t.netAmount??t.grossAmount)}</strong></div>)}</LedgerList>
    <LedgerList title="Payables">{customerLedger.payables.map(x=><div key={x.id} className="border-t border-slate-100 py-2.5 first:border-0"><div className="flex justify-between gap-3 text-xs"><span>{x.status.replaceAll("_"," ")}</span><strong>{money(x.remainingAmount)}</strong></div><p className="mt-1 text-[10px] text-slate-400">Original {money(x.originalAmount)} · Paid {money(x.paidAmount)} · Due {new Date(x.dueAt).toLocaleDateString("en-IN")}</p></div>)}</LedgerList>
    <LedgerList title="Receivables">{customerLedger.receivables.map(x=><div key={x.id} className="border-t border-slate-100 py-2.5 first:border-0"><div className="flex justify-between gap-3 text-xs"><span>{x.status.replaceAll("_"," ")}</span><strong>{money(x.remainingAmount)}</strong></div><p className="mt-1 text-[10px] text-slate-400">{x.reasonCategory?x.reasonCategory.replaceAll("_"," ")+" · ":""}{x.reason}</p></div>)}</LedgerList>
   </div></Surface>:null}
  </>:null}
  {tab==="settlements"?<>
   <div className="grid grid-cols-3 gap-2.5">
    <DetailStat label="Expected" value={money(settlementTotals.expected)}/>
    <DetailStat label="Received" value={money(settlementTotals.received)} tone="emerald"/>
    <DetailStat label="Still clearing" value={money(settlementTotals.remaining)} tone="amber"/>
   </div>
   {settlements.length?<><div className="space-y-2 md:hidden">{settlements.map(s=><Surface key={s.id} className="p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{s.sourceTransaction.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">{s.provider?.name??"No provider"} · {s.gateway?.gatewayName??"No gateway"}</p></div><StatusBadge tone={settlementTone(s.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{s.status.replaceAll("_"," ")}</StatusBadge></div>
    <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">{[["Expected",s.expectedAmount,""],["Received",s.receivedAmount,"text-emerald-700"],["Remaining",s.remainingAmount,"text-amber-700"]].map(([l,v,c])=><div key={l} className="bg-slate-50 p-2.5 text-center"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{l}</p><p className={"mt-1 text-xs font-bold "+c}>{money(v)}</p></div>)}</div>
    <p className="mt-2 text-[11px] text-slate-400">To {s.destinationAccount.accountName}{s.dueAt?" · Due "+new Date(s.dueAt).toLocaleDateString("en-IN"):""}</p>
   </Surface>)}</div>
   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Source</th><th>Date</th><th>Provider</th><th>Gateway</th><th>Expected</th><th>Received</th><th>Remaining</th><th>Target</th><th>Due</th><th className="pr-5">Status</th></tr></thead><tbody>{settlements.map(s=><tr key={s.id} className="border-t border-slate-100"><td className="px-5 py-3"><p className="font-bold">{s.sourceTransaction.transactionNumber}</p><p className="text-[10px] text-slate-400">{s.sourceTransaction.customer?.fullName??s.sourceTransaction.transactionType}</p></td><td className="text-xs">{new Date(s.sourceTransaction.transactionAt).toLocaleString("en-IN")}</td><td>{s.provider?.name??"—"}</td><td>{s.gateway?.gatewayName??"—"}</td><td>{money(s.expectedAmount)}</td><td className="text-emerald-700">{money(s.receivedAmount)}</td><td className="font-bold text-amber-700">{money(s.remainingAmount)}</td><td>{s.destinationAccount.accountName}</td><td>{s.dueAt?new Date(s.dueAt).toLocaleDateString("en-IN"):"—"}</td><td className="pr-5"><StatusBadge tone={settlementTone(s.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{s.status.replaceAll("_"," ")}</StatusBadge></td></tr>)}</tbody></table></div></Surface></>:<EmptyState title="No provider settlements recorded"/>}
  </>:null}
  {tab==="eod"?<>
   {latestEod?<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"><DetailStat label="Latest net position" value={money(latestEod.netFinancialPosition)} tone={Number(latestEod.netFinancialPosition)<0?"rose":"indigo"}/><DetailStat label="Available funds" value={money(latestEod.availableFunds)} tone="emerald"/><DetailStat label="Provider clearing" value={money(latestEod.pendingProviderSettlements)} tone="amber"/><DetailStat label="Cash variance" value={money(latestEod.cashVariance)} tone={Math.abs(Number(latestEod.cashVariance))>.005?"rose":"slate"}/></div>:null}
   {eod.length?<><div className="space-y-2 md:hidden">{eod.map(x=><Surface key={x.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{new Date(x.businessDate).toLocaleDateString("en-IN")}</p><p className="mt-0.5 text-[11px] text-slate-400">Saved {new Date(x.createdAt).toLocaleString("en-IN")}</p></div><strong className="text-indigo-700">{money(x.netFinancialPosition)}</strong></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Mini label="Available" value={money(x.availableFunds)}/><Mini label="Operating" value={money(x.operatingPosition)}/><Mini label="Receivables" value={money(x.customerReceivable)}/><Mini label="Payables" value={money(x.customerPayable)}/><Mini label="Provider clearing" value={money(x.pendingProviderSettlements)}/><Mini label="Cash variance" value={money(x.cashVariance)} alert={Math.abs(Number(x.cashVariance))>.005}/></div></Surface>)}</div>
   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Business date</th><th>Available</th><th>Provider clearing</th><th>Receivables</th><th>Payables</th><th>Operating</th><th>Owner CC</th><th>Net position</th><th>Cash variance</th><th className="pr-5">Saved</th></tr></thead><tbody>{eod.map(x=><tr key={x.id} className="border-t border-slate-100"><td className="px-5 py-3 font-bold">{new Date(x.businessDate).toLocaleDateString("en-IN")}</td><td>{money(x.availableFunds)}</td><td>{money(x.pendingProviderSettlements)}</td><td>{money(x.customerReceivable)}</td><td>{money(x.customerPayable)}</td><td className="font-semibold">{money(x.operatingPosition)}</td><td>{money(x.ownerCreditCardOutstanding)}</td><td className="font-bold text-indigo-700">{money(x.netFinancialPosition)}</td><td className={Math.abs(Number(x.cashVariance))>.005?"font-bold text-rose-700":""}>{money(x.cashVariance)}</td><td className="pr-5 text-xs">{new Date(x.createdAt).toLocaleString("en-IN")}</td></tr>)}</tbody></table></div></Surface></>:<EmptyState title="No EOD snapshots saved yet"/>}
  </>:null}
 </PageFrame></AppShell>;
}

function LedgerList({title,children}:{title:string;children:React.ReactNode}){return <div className="min-w-0 bg-white p-4"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h4><div className="mt-2 max-h-80 overflow-auto">{children}</div></div>;}
function Mini({label,value,alert=false}:{label:string;value:string;alert?:boolean}){return <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={"mt-1 font-bold "+(alert?"text-rose-700":"")}>{value}</p></div>;}
