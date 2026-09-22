"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, PageFrame, PageLoader, SectionHeading, SegmentedTabs, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Tx={id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;customer:{fullName:string}|null;createdBy:{id:string;fullName:string}|null;charges:{amount:string}[];commissions:{amount:string}[]};
type Account={id:string;accountName:string;accountType:string};
type Customer={id:string;fullName:string};
type Provider={id:string;name:string;gateways:{id:string;gatewayName:string}[]};
type Operator={id:string;fullName:string;role:{name:string}};
type AccountLedger={account:{accountName:string};openingBalance:number;openingBalanceIntroducedInRange?:number;rows:{id:string;entryType:string;amount:string;runningBalance:number;description:string|null;journal:{postingDate:string;transaction:{id:string;transactionNumber:string;customer:{fullName:string}|null}}}[]};
type CustomerLedger={customer:{fullName:string;customerCode:string};transactions:Tx[];payables:{id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string}[];receivables:{id:string;reason:string;reasonCategory?:string;originalAmount:string;receivedAmount:string;remainingAmount:string;dueAt:string|null;status:string}[]};
type Settlement={id:string;expectedAmount:string;receivedAmount:string;remainingAmount:string;dueAt:string|null;status:string;provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:{accountName:string};sourceTransaction:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;customer:{fullName:string}|null};receipts:{id:string;amount:string;receivedAt:string;destinationAccount:{accountName:string}}[]};
type Eod={id:string;businessDate:string;availableFunds:string;pendingProviderSettlements:string;customerReceivable:string;customerPayable:string;ownerCreditCardOutstanding:string;operatingPosition:string;netFinancialPosition:string;cashVariance:string;createdAt:string};
type Tab="earnings"|"settlements"|"accounting"|"eod";

const money=(v:number|string|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const settlementTone=(s:string)=>s==="SETTLED"?"emerald":s.includes("PARTIAL")?"indigo":s.includes("OVERDUE")?"rose":"amber";
const pretty=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/w/g,c=>c.toUpperCase());
const serviceName=(s:string)=>({"CARD_SWIPE":"Card Swipe","CASH_TRANSFER":"GPay / Transfer","AEPS_WITHDRAWAL":"AePS / Aadhaar","MICRO_ATM":"Micro ATM"}[s]??pretty(s));
const sum=(rows:{amount:string}[])=>rows.reduce((a,x)=>a+Number(x.amount),0);

export default function ReportsPage(){
 const [tab,setTab]=useState<Tab>("earnings");
 const [transactions,setTransactions]=useState<Tx[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[providers,setProviders]=useState<Provider[]>([]),[operators,setOperators]=useState<Operator[]>([]);
 const [settlements,setSettlements]=useState<Settlement[]>([]),[eod,setEod]=useState<Eod[]>([]);
 const [role]=useState(()=>{if(typeof window==="undefined")return "";try{return JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"";}catch{return "";}});
 const canSeeEod=role==="OWNER"||role==="ADMIN";
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[type,setType]=useState(""),[customerId,setCustomerId]=useState(""),[accountId,setAccountId]=useState(""),[providerId,setProviderId]=useState(""),[gatewayId,setGatewayId]=useState(""),[staffId,setStaffId]=useState(""),[reference,setReference]=useState("");
 const [ledger,setLedger]=useState<AccountLedger|null>(null),[customerLedger,setCustomerLedger]=useState<CustomerLedger|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[filtering,setFiltering]=useState(false);
 const control="app-control";

 const loadTransactions=()=>{
  const q=new URLSearchParams();
  if(from)q.set("from",new Date(from+"T00:00:00").toISOString());if(to)q.set("to",new Date(to+"T23:59:59").toISOString());
  if(type)q.set("type",type);if(customerId)q.set("customerId",customerId);if(providerId)q.set("providerId",providerId);if(gatewayId)q.set("gatewayId",gatewayId);if(staffId)q.set("staffId",staffId);if(reference)q.set("reference",reference);
  setFiltering(true);return apiFetch<Tx[]>("/reports/transactions?"+q.toString()).then(setTransactions).finally(()=>setFiltering(false));
 };

 useEffect(()=>{Promise.all([
  apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Customer[]>("/customers"),apiFetch<Provider[]>("/providers?includeInactive=true"),
  apiFetch<Operator[]>("/reports/operators"),apiFetch<Settlement[]>("/reports/provider-settlements"),canSeeEod?apiFetch<Eod[]>("/reports/end-of-day"):Promise.resolve([] as Eod[]),
 ]).then(([a,c,p,o,s,d])=>{setAccounts(a);setCustomers(c);setProviders(p);setOperators(o);setSettlements(s);setEod(d);return loadTransactions();}).catch(()=>setError("Failed to load reports")).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(loading)return;const timer=setTimeout(()=>loadTransactions().catch(()=>setError("Failed to filter report")),180);return()=>clearTimeout(timer);},[from,to,type,customerId,providerId,gatewayId,staffId,reference]);
 useEffect(()=>{if(!accountId){setLedger(null);return;}const q=new URLSearchParams();if(from)q.set("from",new Date(from+"T00:00:00").toISOString());if(to)q.set("to",new Date(to+"T23:59:59").toISOString());apiFetch<AccountLedger>("/reports/accounts/"+accountId+(q.toString()?"?"+q.toString():"")).then(setLedger).catch(()=>setError("Failed to load account ledger"));},[accountId,from,to]);
 useEffect(()=>{if(!customerId){setCustomerLedger(null);return;}apiFetch<CustomerLedger>("/reports/customers/"+customerId).then(setCustomerLedger).catch(()=>setError("Failed to load customer ledger"));},[customerId]);

 const totals=useMemo(()=>transactions.reduce((a,t)=>({gross:a.gross+Number(t.grossAmount),commission:a.commission+sum(t.commissions),charges:a.charges+sum(t.charges),profit:a.profit+sum(t.commissions)-sum(t.charges)}),{gross:0,commission:0,charges:0,profit:0}),[transactions]);
 const serviceEarnings=useMemo(()=>{
  const map=new Map<string,{gross:number;commission:number;charges:number;count:number}>();
  for(const t of transactions){if(!["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM"].includes(t.transactionType))continue;const row=map.get(t.transactionType)??{gross:0,commission:0,charges:0,count:0};row.gross+=Number(t.grossAmount);row.commission+=sum(t.commissions);row.charges+=sum(t.charges);row.count+=1;map.set(t.transactionType,row);}
  return [...map.entries()].map(([kind,row])=>({kind,...row}));
 },[transactions]);
 const settlementTotals=useMemo(()=>settlements.reduce((a,s)=>({expected:a.expected+Number(s.expectedAmount),received:a.received+Number(s.receivedAmount),remaining:a.remaining+Number(s.remainingAmount)}),{expected:0,received:0,remaining:0}),[settlements]);
 const latestEod=eod[0]??null;

 function clearFilters(){setFrom("");setTo("");setType("");setCustomerId("");setProviderId("");setGatewayId("");setStaffId("");setReference("");}
 function downloadCsv(){
  const esc=(v:unknown)=>'"'+String(v??"").replaceAll('"','""')+'"';let rows:(string|number)[][]=[];let name="cash-ledger-report.csv";
  if(tab==="earnings"){rows=[["Transaction","Date","Service","Customer","Processed","Customer Fee","Provider / Bank Fee","Profit","Status"],...transactions.map(t=>[t.transactionNumber,t.transactionAt,serviceName(t.transactionType),t.customer?.fullName??"",t.grossAmount,sum(t.commissions),sum(t.charges),sum(t.commissions)-sum(t.charges),t.status])];name="cash-ledger-earnings.csv";}
  else if(tab==="settlements"){rows=[["Source","Date","Provider","Gateway","Expected","Received","Remaining","Target","Due","Status"],...settlements.map(s=>[s.sourceTransaction.transactionNumber,s.sourceTransaction.transactionAt,s.provider?.name??"",s.gateway?.gatewayName??"",s.expectedAmount,s.receivedAmount,s.remainingAmount,s.destinationAccount.accountName,s.dueAt??"",s.status])];name="cash-ledger-provider-clearing.csv";}
  else if(tab==="eod"){rows=[["Business Date","Liquid Funds","Provider Clearing","Receivables","Payables","Operating Position","Owner CC","Net Position","Cash Variance"],...eod.map(x=>[x.businessDate,x.availableFunds,x.pendingProviderSettlements,x.customerReceivable,x.customerPayable,x.operatingPosition,x.ownerCreditCardOutstanding,x.netFinancialPosition,x.cashVariance])];name="cash-ledger-eod.csv";}
  else if(ledger){rows=[["Date","Transaction","Customer","Entry","Amount","Running Balance"],...ledger.rows.map(r=>[r.journal.postingDate,r.journal.transaction.transactionNumber,r.journal.transaction.customer?.fullName??"",r.entryType,r.amount,r.runningBalance])];name="cash-ledger-account-ledger.csv";}
  const blob=new Blob([rows.map(r=>r.map(esc).join(",")).join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
 }
 if(loading)return <AppShell><PageLoader label="Preparing reports…"/></AppShell>;

 return <AppShell><PageFrame>
  <SectionHeading title="Reports" action={<button onClick={downloadCsv} className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold">Export CSV</button>}/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  <SegmentedTabs<Tab> value={tab} onChange={setTab} items={[
   {value:"earnings",label:"Earnings"},{value:"settlements",label:"Provider clearing",count:settlements.length},{value:"accounting",label:"Account ledger"},
   ...(canSeeEod?[{value:"eod" as Tab,label:"End of day",count:eod.length}]:[]),
  ]}/>

  {tab==="earnings"?<>
   <Surface className="overflow-hidden">
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><h2 className="text-sm font-black">Business performance</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Aggregated view. Open Transactions for individual activity.</p></div><Link href="/transactions" className="text-xs font-bold text-[var(--accent)]">Transactions →</Link></div>
    <div className="grid grid-cols-2 gap-px bg-[var(--border)] lg:grid-cols-4"><div className="bg-[var(--surface)] p-4"><p className="text-xs text-[var(--text-muted)]">Processed volume</p><p className="money mt-1 text-xl font-black">{money(totals.gross)}</p></div><div className="bg-[var(--surface)] p-4"><p className="text-xs text-[var(--text-muted)]">Business profit</p><p className="money mt-1 text-xl font-black text-[var(--money-in)]">{money(totals.profit)}</p></div><div className="bg-[var(--surface)] p-4"><p className="text-xs text-[var(--text-muted)]">Provider / bank fees</p><p className="money mt-1 text-xl font-black text-[var(--money-out)]">{money(totals.charges)}</p></div><div className="bg-[var(--surface)] p-4"><p className="text-xs text-[var(--text-muted)]">Transactions</p><p className="mt-1 text-xl font-black">{transactions.length}</p></div></div>
   </Surface>

   <Surface className="overflow-hidden">
    <div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h2 className="text-sm font-black">By service</h2></div>
    {serviceEarnings.length?<div className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{serviceEarnings.map(x=><Link href={"/transactions?type="+x.kind} key={x.kind} className="p-4 transition hover:bg-[var(--surface-soft)]"><div className="flex items-start justify-between gap-2"><p className="text-sm font-bold">{serviceName(x.kind)}</p><span className="text-[10px] font-semibold text-[var(--text-muted)]">{x.count} tx</span></div><p className="money mt-2 text-xl font-black">{money(x.gross)}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"><span className="font-bold text-[var(--money-in)]">Customer fee {money(x.commission)}</span><span className="text-[var(--money-out)]">Provider fee {money(x.charges)}</span><span className="font-bold">Profit {money(x.commission-x.charges)}</span></div></Link>)}</div>:<div className="p-5"><EmptyState title="No service activity"/></div>}
   </Surface>

   <Surface className="overflow-hidden">
    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h2 className="text-sm font-black">Filters</h2><button onClick={clearFilters} className="text-xs font-bold text-[var(--accent)]">Clear</button></div>
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
     <Field label="From"><input className={control} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="To"><input className={control} type="date" value={to} onChange={e=>setTo(e.target.value)}/></Field>
     <Field label="Service"><select className={control} value={type} onChange={e=>setType(e.target.value)}><option value="">All services</option>{["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","MICRO_ATM"].map(x=><option key={x} value={x}>{serviceName(x)}</option>)}</select></Field>
     <Field label="Provider"><select className={control} value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}}><option value="">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
     <Field label="Gateway"><select className={control} value={gatewayId} onChange={e=>setGatewayId(e.target.value)}><option value="">All gateways</option>{providers.find(p=>p.id===providerId)?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></Field>
     <Field label="Customer"><select className={control} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
     <Field label="Operator"><select className={control} value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">All operators</option>{operators.map(o=><option key={o.id} value={o.id}>{o.fullName}</option>)}</select></Field>
     <Field label="Reference"><input className={control} placeholder="UTR / reference" value={reference} onChange={e=>setReference(e.target.value)}/></Field>
     <div className="flex items-end"><div className="flex min-h-11 w-full items-center rounded-xl bg-[var(--surface-soft)] px-3 text-xs font-semibold text-[var(--text-muted)]">{filtering?"Updating…":transactions.length+" matching"}</div></div>
    </div>
   </Surface>

   <details className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
    <summary className="cursor-pointer list-none px-4 py-4 text-sm font-bold sm:px-5">Underlying transactions <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{transactions.length}</span><span className="float-right text-[var(--text-muted)]">+</span></summary>
    <div className="border-t border-[var(--border)]">
     {transactions.length?<><div className="space-y-2 p-3 md:hidden">{transactions.map(t=><Link href={"/transactions/"+t.id} key={t.id} className="block rounded-xl bg-[var(--surface-soft)] p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-bold">{serviceName(t.transactionType)}</p><p className="text-[11px] text-[var(--text-muted)]">{t.transactionNumber} · {t.customer?.fullName??"—"}</p></div><strong className="money">{money(t.grossAmount)}</strong></div><div className="mt-2 flex gap-3 text-[11px]"><span className="text-[var(--money-in)]">Customer fee {money(sum(t.commissions))}</span><span className="text-[var(--money-out)]">Provider fee {money(sum(t.charges))}</span><span className="font-bold">Profit {money(sum(t.commissions)-sum(t.charges))}</span></div></Link>)}</div>
     <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Transaction</th><th>Date</th><th>Service</th><th>Customer</th><th className="text-right">Processed</th><th className="text-right">Customer fee</th><th className="text-right">Provider fee</th><th className="pr-5 text-right">Profit</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id} className="border-t border-[var(--border)]"><td className="px-5 py-3"><Link href={"/transactions/"+t.id} className="font-bold text-[var(--accent)]">{t.transactionNumber}</Link></td><td className="text-xs">{new Date(t.transactionAt).toLocaleString("en-IN")}</td><td>{serviceName(t.transactionType)}</td><td>{t.customer?.fullName??"—"}</td><td className="money text-right">{money(t.grossAmount)}</td><td className="money text-right text-[var(--money-in)]">{money(sum(t.commissions))}</td><td className="money text-right text-[var(--money-out)]">{money(sum(t.charges))}</td><td className="money pr-5 text-right font-bold">{money(sum(t.commissions)-sum(t.charges))}</td></tr>)}</tbody></table></div></>:<div className="p-5"><EmptyState title="No matching transactions"/></div>}
    </div>
   </details>
  </>:null}

  {tab==="settlements"?<>
   <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"><DetailStat label="Expected from providers" value={money(settlementTotals.expected)}/><DetailStat label="Received" value={money(settlementTotals.received)} tone="emerald"/><DetailStat label="Still clearing" value={money(settlementTotals.remaining)} tone="amber"/></div>
   {settlements.length?<><div className="space-y-2 md:hidden">{settlements.map(s=><Link href={"/transactions/"+s.sourceTransaction.id} key={s.id}><Surface className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{s.provider?.name??"Provider"} · {s.gateway?.gatewayName??"—"}</p><p className="text-[11px] text-[var(--text-muted)]">{s.sourceTransaction.transactionNumber}</p></div><StatusBadge tone={settlementTone(s.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{pretty(s.status)}</StatusBadge></div><div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[var(--border)]">{[["Expected",s.expectedAmount],["Received",s.receivedAmount],["Remaining",s.remainingAmount]].map(([l,v])=><div key={l} className="bg-[var(--surface-soft)] p-2.5 text-center"><p className="text-[9px] text-[var(--text-muted)]">{l}</p><p className="money mt-1 text-xs font-bold">{money(v)}</p></div>)}</div></Surface></Link>)}</div>
   <Surface className="hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Source</th><th>Provider</th><th>Gateway</th><th className="text-right">Expected</th><th className="text-right">Received</th><th className="text-right">Remaining</th><th>Destination</th><th className="pr-5">Status</th></tr></thead><tbody>{settlements.map(s=><tr key={s.id} className="border-t border-[var(--border)]"><td className="px-5 py-3"><Link href={"/transactions/"+s.sourceTransaction.id} className="font-bold text-[var(--accent)]">{s.sourceTransaction.transactionNumber}</Link><p className="text-[10px] text-[var(--text-muted)]">{new Date(s.sourceTransaction.transactionAt).toLocaleString("en-IN")}</p></td><td>{s.provider?.name??"—"}</td><td>{s.gateway?.gatewayName??"—"}</td><td className="money text-right">{money(s.expectedAmount)}</td><td className="money text-right text-[var(--money-in)]">{money(s.receivedAmount)}</td><td className="money text-right font-bold text-amber-700">{money(s.remainingAmount)}</td><td>{s.destinationAccount.accountName}</td><td className="pr-5"><StatusBadge tone={settlementTone(s.status) as "slate"|"emerald"|"indigo"|"amber"|"rose"}>{pretty(s.status)}</StatusBadge></td></tr>)}</tbody></table></div></Surface></>:<EmptyState title="No provider clearing records"/>}
  </>:null}

  {tab==="accounting"?<>
   <Surface className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Account"><select className={control} value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Select account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></Field>
    <Field label="Customer"><select className={control} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
    <Field label="From"><input className={control} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="To"><input className={control} type="date" value={to} onChange={e=>setTo(e.target.value)}/></Field>
   </Surface>
   {ledger?<Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h2 className="text-sm font-black">{ledger.account.accountName}</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Opening {money(ledger.openingBalance)}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Date</th><th>Transaction</th><th>Customer</th><th>Dr / Cr</th><th className="text-right">Amount</th><th className="pr-5 text-right">Running</th></tr></thead><tbody>{ledger.rows.map(r=><tr key={r.id} className="border-t border-[var(--border)]"><td className="px-5 py-3 text-xs">{new Date(r.journal.postingDate).toLocaleString("en-IN")}</td><td><Link href={"/transactions/"+r.journal.transaction.id} className="font-bold text-[var(--accent)]">{r.journal.transaction.transactionNumber}</Link></td><td>{r.journal.transaction.customer?.fullName??"—"}</td><td>{r.entryType}</td><td className="money text-right">{money(r.amount)}</td><td className="money pr-5 text-right font-bold">{money(r.runningBalance)}</td></tr>)}</tbody></table></div></Surface>:null}
   {customerLedger?<Surface className="overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h2 className="text-sm font-black">{customerLedger.customer.fullName}</h2><p className="text-[11px] text-[var(--text-muted)]">{customerLedger.customer.customerCode}</p></div><div className="grid gap-px bg-[var(--border)] lg:grid-cols-3"><LedgerList title="Transactions">{customerLedger.transactions.map(t=><Link href={"/transactions/"+t.id} key={t.id} className="flex items-start justify-between gap-3 border-t border-[var(--border)] py-2.5 first:border-0"><div className="min-w-0"><p className="truncate text-xs font-semibold">{t.transactionNumber} · {serviceName(t.transactionType)}</p></div><strong className="money shrink-0 text-xs">{money(t.netAmount??t.grossAmount)}</strong></Link>)}</LedgerList><LedgerList title="Payables">{customerLedger.payables.map(x=><div key={x.id} className="border-t border-[var(--border)] py-2.5 first:border-0"><div className="flex justify-between gap-3 text-xs"><span>{pretty(x.status)}</span><strong>{money(x.remainingAmount)}</strong></div><p className="mt-1 text-[10px] text-[var(--text-muted)]">Original {money(x.originalAmount)} · Paid {money(x.paidAmount)}</p></div>)}</LedgerList><LedgerList title="Receivables">{customerLedger.receivables.map(x=><div key={x.id} className="border-t border-[var(--border)] py-2.5 first:border-0"><div className="flex justify-between gap-3 text-xs"><span>{pretty(x.status)}</span><strong>{money(x.remainingAmount)}</strong></div><p className="mt-1 text-[10px] text-[var(--text-muted)]">{x.reason}</p></div>)}</LedgerList></div></Surface>:null}
   {!ledger&&!customerLedger?<EmptyState title="Choose an account or customer" description="Accounting detail stays separate from day-to-day transaction activity."/>:null}
  </>:null}

  {tab==="eod"?<>
   {latestEod?<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"><DetailStat label="Latest net position" value={money(latestEod.netFinancialPosition)} tone={Number(latestEod.netFinancialPosition)<0?"rose":"indigo"}/><DetailStat label="Liquid funds" value={money(latestEod.availableFunds)} tone="emerald"/><DetailStat label="Provider clearing" value={money(latestEod.pendingProviderSettlements)} tone="amber"/><DetailStat label="Cash variance" value={money(latestEod.cashVariance)} tone={Math.abs(Number(latestEod.cashVariance))>.005?"rose":"slate"}/></div>:null}
   {eod.length?<Surface className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Business date</th><th>Liquid funds</th><th>Provider clearing</th><th>Receivables</th><th>Payables</th><th>Operating</th><th>Net position</th><th className="pr-5">Cash variance</th></tr></thead><tbody>{eod.map(x=><tr key={x.id} className="border-t border-[var(--border)]"><td className="px-5 py-3 font-bold">{new Date(x.businessDate).toLocaleDateString("en-IN")}</td><td>{money(x.availableFunds)}</td><td>{money(x.pendingProviderSettlements)}</td><td>{money(x.customerReceivable)}</td><td>{money(x.customerPayable)}</td><td>{money(x.operatingPosition)}</td><td className="font-bold text-[var(--accent)]">{money(x.netFinancialPosition)}</td><td className={"pr-5 "+(Math.abs(Number(x.cashVariance))>.005?"font-bold text-rose-700":"")}>{money(x.cashVariance)}</td></tr>)}</tbody></table></div></Surface>:<EmptyState title="No EOD snapshots saved yet"/>}
  </>:null}
 </PageFrame></AppShell>;
}

function LedgerList({title,children}:{title:string;children:React.ReactNode}){return <div className="min-w-0 bg-[var(--surface)] p-4"><h4 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</h4><div className="mt-2 max-h-80 overflow-auto">{children}</div></div>;}
