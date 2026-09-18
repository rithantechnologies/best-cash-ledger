"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
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
const money=(v:number|string|null)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v||0));

export default function ReportsPage(){
 const [tab,setTab]=useState<"transactions"|"settlements"|"eod">("transactions");
 const [transactions,setTransactions]=useState<Tx[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[providers,setProviders]=useState<Provider[]>([]),[operators,setOperators]=useState<Operator[]>([]);
 const [settlements,setSettlements]=useState<Settlement[]>([]),[eod,setEod]=useState<Eod[]>([]);
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[type,setType]=useState(""),[customerId,setCustomerId]=useState(""),[accountId,setAccountId]=useState(""),[providerId,setProviderId]=useState(""),[gatewayId,setGatewayId]=useState(""),[staffId,setStaffId]=useState(""),[reference,setReference]=useState("");
 const [ledger,setLedger]=useState<AccountLedger|null>(null),[customerLedger,setCustomerLedger]=useState<CustomerLedger|null>(null),[error,setError]=useState("");

 const loadTransactions=()=>{
  const q=new URLSearchParams();
  if(from)q.set("from",new Date(from+"T00:00:00").toISOString());
  if(to)q.set("to",new Date(to+"T23:59:59").toISOString());
  if(type)q.set("type",type);if(customerId)q.set("customerId",customerId);if(accountId)q.set("accountId",accountId);if(providerId)q.set("providerId",providerId);if(gatewayId)q.set("gatewayId",gatewayId);if(staffId)q.set("staffId",staffId);if(reference)q.set("reference",reference);
  return apiFetch<Tx[]>("/reports/transactions?"+q.toString()).then(setTransactions);
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
    .catch(()=>setError("Failed to load reports"));
 },[]);
 useEffect(()=>{loadTransactions().catch(()=>setError("Failed to filter report"));},[from,to,type,customerId,accountId,providerId,gatewayId,staffId,reference]);
 useEffect(()=>{
  if(!accountId){setLedger(null);return;}
  const q=new URLSearchParams();if(from)q.set("from",new Date(from+"T00:00:00").toISOString());if(to)q.set("to",new Date(to+"T23:59:59").toISOString());
  apiFetch<AccountLedger>("/reports/accounts/"+accountId+(q.toString()?"?"+q.toString():"")).then(setLedger).catch(()=>setError("Failed to load account ledger"));
 },[accountId,from,to]);
 useEffect(()=>{if(!customerId){setCustomerLedger(null);return;}apiFetch<CustomerLedger>("/reports/customers/"+customerId).then(setCustomerLedger).catch(()=>setError("Failed to load customer ledger"));},[customerId]);

 const totals=useMemo(()=>transactions.reduce((a,t)=>({gross:a.gross+Number(t.grossAmount),commission:a.commission+t.commissions.reduce((s,c)=>s+Number(c.amount),0),charges:a.charges+t.charges.reduce((s,c)=>s+Number(c.amount),0)}),{gross:0,commission:0,charges:0}),[transactions]);
 const settlementTotals=useMemo(()=>settlements.reduce((a,s)=>({expected:a.expected+Number(s.expectedAmount),received:a.received+Number(s.receivedAmount),remaining:a.remaining+Number(s.remainingAmount)}),{expected:0,received:0,remaining:0}),[settlements]);

 function downloadCsv(){
  const esc=(v:unknown)=>'"'+String(v??"").replaceAll('"','""')+'"';
  let rows:(string|number)[][]=[];
  let name="cash-ledger-report.csv";
  if(tab==="transactions"){
   rows=[["Transaction","Date","Type","Customer","Operator","Gross","Net","Status","Reference"],...transactions.map(t=>[t.transactionNumber,t.transactionAt,t.transactionType,t.customer?.fullName??"",t.createdBy?.fullName??"",t.grossAmount,t.netAmount??"",t.status,t.referenceNumber??""])];
   name="cash-ledger-transactions.csv";
  }else if(tab==="settlements"){
   rows=[["Source","Date","Provider","Gateway","Expected","Received","Remaining","Target","Due","Status"],...settlements.map(s=>[s.sourceTransaction.transactionNumber,s.sourceTransaction.transactionAt,s.provider?.name??"",s.gateway?.gatewayName??"",s.expectedAmount,s.receivedAmount,s.remainingAmount,s.destinationAccount.accountName,s.dueAt??"",s.status])];
   name="cash-ledger-provider-settlements.csv";
  }else{
   rows=[["Business Date","Available Funds","Provider Clearing","Receivables","Payables","Operating Position","Owner CC","Net Position","Cash Variance"],...eod.map(x=>[x.businessDate,x.availableFunds,x.pendingProviderSettlements,x.customerReceivable,x.customerPayable,x.operatingPosition,x.ownerCreditCardOutstanding,x.netFinancialPosition,x.cashVariance])];
   name="cash-ledger-eod.csv";
  }
  const blob=new Blob([rows.map(r=>r.map(esc).join(",")).join("\n")],{type:"text/csv"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
 }

 return <AppShell><div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Reports</h2><p className="text-sm text-slate-500">Transactions, ledgers, provider clearing and saved end-of-day positions.</p></div><button onClick={downloadCsv} className="rounded-lg border px-4 py-2 text-sm font-semibold">Export Current CSV</button></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}

  <div className="w-full overflow-x-auto pb-1"><div className="inline-flex min-w-max rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold shadow-sm">
   <button onClick={()=>setTab("transactions")} className={"rounded-lg px-4 py-2 "+(tab==="transactions"?"bg-slate-950 text-white":"text-slate-600")}>Transactions & Ledgers</button>
   <button onClick={()=>setTab("settlements")} className={"rounded-lg px-4 py-2 "+(tab==="settlements"?"bg-slate-950 text-white":"text-slate-600")}>Provider Settlements</button>
   <button onClick={()=>setTab("eod")} className={"rounded-lg px-4 py-2 "+(tab==="eod"?"bg-slate-950 text-white":"text-slate-600")}>End of Day</button>
  </div></div>

  {tab==="transactions"?<>
   <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
    <label className="text-sm"><span className="mb-1 block">From</span><input className="w-full rounded-lg border px-3 py-2" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label className="text-sm"><span className="mb-1 block">To</span><input className="w-full rounded-lg border px-3 py-2" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    <label className="text-sm"><span className="mb-1 block">Type</span><select className="w-full rounded-lg border px-3 py-2" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","CUSTOMER_PAYOUT","CUSTOMER_RECEIVABLE","CUSTOMER_RECEIPT","PROVIDER_SETTLEMENT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","CASH_ADJUSTMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label className="text-sm"><span className="mb-1 block">Customer</span><select className="w-full rounded-lg border px-3 py-2" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></label>
    <label className="text-sm"><span className="mb-1 block">Account / Ledger</span><select className="w-full rounded-lg border px-3 py-2" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">All accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></label>
    <label className="text-sm"><span className="mb-1 block">Provider</span><select className="w-full rounded-lg border px-3 py-2" value={providerId} onChange={e=>{setProviderId(e.target.value);setGatewayId("");}}><option value="">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="text-sm"><span className="mb-1 block">Gateway</span><select className="w-full rounded-lg border px-3 py-2" value={gatewayId} onChange={e=>setGatewayId(e.target.value)}><option value="">All gateways</option>{providers.find(p=>p.id===providerId)?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName}</option>)}</select></label>
    <label className="text-sm"><span className="mb-1 block">Operator</span><select className="w-full rounded-lg border px-3 py-2" value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">All operators</option>{operators.map(o=><option key={o.id} value={o.id}>{o.fullName} — {o.role.name}</option>)}</select></label>
    <label className="text-sm"><span className="mb-1 block">Reference</span><input className="w-full rounded-lg border px-3 py-2" placeholder="UTR / reference" value={reference} onChange={e=>setReference(e.target.value)}/></label>
   </section>

   <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Gross Activity</p><p className="mt-2 text-2xl font-bold">{money(totals.gross)}</p></div><div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Commission</p><p className="mt-2 text-2xl font-bold">{money(totals.commission)}</p></div><div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Charges</p><p className="mt-2 text-2xl font-bold">{money(totals.charges)}</p></div></section>

   <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[1000px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">No</th><th>Date</th><th>Type</th><th>Customer</th><th>Operator</th><th>Gross</th><th>Net</th><th>Commission</th><th>Charges</th><th>Status</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id} className="border-t"><td className="px-4 py-3 font-medium">{t.transactionNumber}</td><td>{new Date(t.transactionAt).toLocaleString("en-IN")}</td><td>{t.transactionType.replaceAll("_"," ")}</td><td>{t.customer?.fullName??"—"}</td><td>{t.createdBy?.fullName??"—"}</td><td>{money(t.grossAmount)}</td><td>{money(t.netAmount)}</td><td>{money(t.commissions.reduce((s,c)=>s+Number(c.amount),0))}</td><td>{money(t.charges.reduce((s,c)=>s+Number(c.amount),0))}</td><td>{t.status}</td></tr>)}</tbody></table></section>

   {ledger?<section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">{ledger.account.accountName} Ledger</h3><p className="mt-1 text-xs text-slate-500">Opening balance for selected range: {money(ledger.openingBalance)}{Number(ledger.openingBalanceIntroducedInRange||0)!==0?" · Account opening introduced in range: "+money(ledger.openingBalanceIntroducedInRange||0):""}</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[750px] text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Date</th><th>Transaction</th><th>Customer</th><th>Dr/Cr</th><th>Amount</th><th>Running</th></tr></thead><tbody>{ledger.rows.map(r=><tr key={r.id} className="border-t"><td className="py-3">{new Date(r.journal.postingDate).toLocaleString("en-IN")}</td><td>{r.journal.transaction.transactionNumber}</td><td>{r.journal.transaction.customer?.fullName??"—"}</td><td>{r.entryType}</td><td>{money(r.amount)}</td><td className="font-semibold">{money(r.runningBalance)}</td></tr>)}</tbody></table></div></section>:null}
   {customerLedger?<section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">{customerLedger.customer.fullName} Customer Ledger</h3><p className="text-xs text-slate-500">{customerLedger.customer.customerCode}</p><div className="mt-4 grid gap-4 lg:grid-cols-3"><div><h4 className="text-sm font-semibold">Transactions</h4><div className="mt-2 max-h-80 overflow-auto">{customerLedger.transactions.map(t=><div key={t.id} className="flex justify-between border-t py-2 text-sm"><span>{t.transactionNumber} · {t.transactionType}<span className="block text-xs text-slate-500">{t.createdBy?.fullName??"Unknown operator"}</span></span><strong>{money(t.netAmount??t.grossAmount)}</strong></div>)}</div></div><div><h4 className="text-sm font-semibold">Payables</h4><div className="mt-2 max-h-80 overflow-auto">{customerLedger.payables.map(x=><div key={x.id} className="border-t py-2 text-sm"><div className="flex justify-between"><span>{x.status}</span><strong>{money(x.remainingAmount)} remaining</strong></div><p className="text-xs text-slate-500">Original {money(x.originalAmount)} · Paid {money(x.paidAmount)} · Due {new Date(x.dueAt).toLocaleDateString("en-IN")}</p></div>)}</div></div><div><h4 className="text-sm font-semibold">Receivables</h4><div className="mt-2 max-h-80 overflow-auto">{customerLedger.receivables.map(x=><div key={x.id} className="border-t py-2 text-sm"><div className="flex justify-between"><span>{x.status}</span><strong>{money(x.remainingAmount)} remaining</strong></div><p className="text-xs text-slate-500">{x.reasonCategory?x.reasonCategory.replaceAll("_"," ")+" · ":""}{x.reason} · Original {money(x.originalAmount)} · Received {money(x.receivedAmount)}{x.dueAt?" · Due "+new Date(x.dueAt).toLocaleDateString("en-IN"):""}</p></div>)}</div></div></div></section>:null}
  </>:null}

  {tab==="settlements"?<>
   <section className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Expected</p><p className="mt-2 text-2xl font-bold">{money(settlementTotals.expected)}</p></div><div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Received</p><p className="mt-2 text-2xl font-bold text-emerald-700">{money(settlementTotals.received)}</p></div><div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Still in Clearing</p><p className="mt-2 text-2xl font-bold text-amber-700">{money(settlementTotals.remaining)}</p></div></section>
   <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Source</th><th>Date</th><th>Provider</th><th>Gateway</th><th>Expected</th><th>Received</th><th>Remaining</th><th>Target</th><th>Due</th><th>Status</th></tr></thead><tbody>{settlements.map(s=><tr key={s.id} className="border-t"><td className="px-4 py-3"><strong>{s.sourceTransaction.transactionNumber}</strong><span className="block text-xs text-slate-500">{s.sourceTransaction.customer?.fullName??s.sourceTransaction.transactionType}</span></td><td>{new Date(s.sourceTransaction.transactionAt).toLocaleString("en-IN")}</td><td>{s.provider?.name??"—"}</td><td>{s.gateway?.gatewayName??"—"}</td><td>{money(s.expectedAmount)}</td><td className="text-emerald-700">{money(s.receivedAmount)}</td><td className="font-semibold">{money(s.remainingAmount)}</td><td>{s.destinationAccount.accountName}</td><td>{s.dueAt?new Date(s.dueAt).toLocaleString("en-IN"):"—"}</td><td>{s.status.replaceAll("_"," ")}</td></tr>)}{!settlements.length?<tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">No provider settlements recorded.</td></tr>:null}</tbody></table></section>
  </>:null}

  {tab==="eod"?<section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[1150px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Business Date</th><th>Available</th><th>Provider Clearing</th><th>Receivables</th><th>Payables</th><th>Operating</th><th>Owner CC</th><th>Net Position</th><th>Cash Variance</th><th>Saved</th></tr></thead><tbody>{eod.map(x=><tr key={x.id} className="border-t"><td className="px-4 py-3 font-semibold">{new Date(x.businessDate).toLocaleDateString("en-IN")}</td><td>{money(x.availableFunds)}</td><td>{money(x.pendingProviderSettlements)}</td><td>{money(x.customerReceivable)}</td><td>{money(x.customerPayable)}</td><td className="font-semibold">{money(x.operatingPosition)}</td><td>{money(x.ownerCreditCardOutstanding)}</td><td className="font-bold">{money(x.netFinancialPosition)}</td><td className={Math.abs(Number(x.cashVariance))>.005?"font-semibold text-red-700":""}>{money(x.cashVariance)}</td><td>{new Date(x.createdAt).toLocaleString("en-IN")}</td></tr>)}{!eod.length?<tr><td colSpan={10} className="px-4 py-10 text-center text-slate-500">No EOD snapshots saved yet.</td></tr>:null}</tbody></table></section>:null}
 </div></AppShell>;
}
