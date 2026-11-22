"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Surface } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";
import { indianDate, indianDateTime, reportIsoDate } from "./indian-date";
import { PendingPayoutModal } from "./pending-payout-modal";

type Row = { id:string; transactionNumber:string;transactionAt:string;customerName:string;mobile:string;cardType:string;cardLastFour:string;
 swipeAmount:number;customerFee:number;gatewayFee:number;payoutFee:number;netProfit:number;payableAmount:number;paidAmount:number;
 remainingAmount:number;payInStatus:string;providerSettlementDueAt:string|null;expectedPayoutAt:string|null;payoutStatus:string;payoutSources:string[];payInAccount:string;provider:string;gateway:string };
type Totals = Pick<Row,"swipeAmount"|"customerFee"|"gatewayFee"|"payoutFee"|"netProfit"|"payableAmount"|"paidAmount"|"remainingAmount">;
type DueRow = {id:string;transactionNumber:string;transactionAt:string;customerName:string;activity:string;status:string;
 principal:number;remainingPrincipal:number|null;remainingCommission:number|null;commissionCollected:number;
 earnedCommission:number;providerCost:number;payoutCost:number;netProfit:number;
 receivedAmount?:number|null;receivedIn?:string|null;referenceNumber?:string|null};
type DueSummary = {earnedCommission:number;providerCost:number;payoutCost:number;netProfit:number;principalRecovered:number};
type PendingPayout = {id:string;payableId:string;transactionNumber:string;transactionAt:string;customerName:string;expectedPayoutAt:string|null;payableAmount:number;paidAmount:number;remainingAmount:number};
type Report = {from:string;to:string;count:number;summary:Totals;rows:Row[];pendingPayouts:PendingPayout[];pendingTruncated:boolean;basis:string;cardDue?:{rows:DueRow[];summary:DueSummary}};
type Option = {id:string;name?:string;fullName?:string};
type CardOption = {id:string;bankName:string;lastFourDigits:string;nickname?:string|null};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(v);
function todayIST(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const p=(name:string)=>parts.find(x=>x.type===name)?.value??"";
 return p("year")+"-"+p("month")+"-"+p("day");
}
function shift(d:string,n:number){const t=new Date(d+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
const indianDay=indianDate;
const displayDate=indianDateTime;
const profitClass=(value:number)=>value>0?"text-[var(--money-in)]":value<0?"text-[var(--money-out)]":"";
const payoutLabel=(r:Row)=>r.remainingAmount<=0?"Paid":r.paidAmount>0?"Partially paid":"Pending";
function csvCell(value:string|number){const s=String(value??"");return '"'+(/^[\s\u0000-\u001f]*[=+\-@]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
const cols=["S.No","Date (DD-MM-YYYY IST)","Transaction","Customer","Cell number","Card type","Card last four","Amount","Com. Fee","Cus. Fee",
 "Payout Fee","Net Profit","Payable","Paid","Remaining","Provider settlement due","Customer payout due","Pay In","Pay Out","Payout Source","Pay-in Account","Provider","Gateway","Status"];
function rowCsv(r:Row,i:number):(string|number)[]{return [i+1,displayDate(r.transactionAt),r.transactionNumber,r.customerName,r.mobile,
 r.cardType,"•••• "+r.cardLastFour,r.swipeAmount,r.gatewayFee,r.customerFee,r.payoutFee,r.netProfit,r.payableAmount,
 r.paidAmount,r.remainingAmount,r.providerSettlementDueAt?indianDay(r.providerSettlementDueAt):"",r.expectedPayoutAt?indianDay(r.expectedPayoutAt):"",r.payInStatus,payoutLabel(r),r.payoutSources.join(" / "),r.payInAccount,r.provider,r.gateway,r.payoutStatus];}

export default function CardSwipeReportPage(){
 const [today]=useState(todayIST);
 const [fromText,setFromText]=useState(()=>indianDate(todayIST()));
 const [toText,setToText]=useState(()=>indianDate(todayIST()));
 const allTime=fromText==="All Time";
 const from=allTime?"1900-01-01":reportIsoDate(fromText)??"";
 const to=reportIsoDate(toText)??"";
 const datesValid=Boolean(from&&to&&from<=to);
 const [customerId,setCustomerId]=useState(""),[providerId,setProviderId]=useState(""),[cardId,setCardId]=useState("");
 const [cards,setCards]=useState<CardOption[]>([]);
 const [customers,setCustomers]=useState<Option[]>([]),[providers,setProviders]=useState<Option[]>([]);
 const [report,setReport]=useState<Report|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [payoutId,setPayoutId]=useState<string|null>(null),[reportRevision,setReportRevision]=useState(0);
 const [pendingSearch,setPendingSearch]=useState("");
 // Links from a customer's Card Ledger retain the same business-day selection.
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const selectedFrom=params.get("from"),selectedTo=params.get("to");
  if(selectedFrom&&selectedTo&&/^\d{4}-\d{2}-\d{2}$/.test(selectedFrom)&&/^\d{4}-\d{2}-\d{2}$/.test(selectedTo)&&
    reportIsoDate(indianDate(selectedFrom))===selectedFrom&&reportIsoDate(indianDate(selectedTo))===selectedTo&&selectedFrom<=selectedTo){
   setFromText(selectedFrom==="1900-01-01"?"All Time":indianDate(selectedFrom));setToText(indianDate(selectedTo));
  }
  if(params.get("customerId")){setCustomerId(params.get("customerId")!);if(params.get("cardId"))setCardId(params.get("cardId")!);}
 },[]);
 useEffect(()=>{
   if(!customerId){setCards([]);return;}
   let active=true;
   apiFetch<{cards:CardOption[]}>("/customers/"+encodeURIComponent(customerId))
     .then(customer=>{if(active){setCards(customer.cards??[]);setCardId(current=>current&&!(customer.cards??[]).some(card=>card.id===current)?"":current);}})
     .catch(()=>{if(active){setCards([]);setCardId("");}});
   return()=>{active=false;};
  },[customerId]);
  useEffect(()=>{Promise.all([apiFetch<Option[]>("/customers"),apiFetch<Option[]>("/providers?includeInactive=true")])
 .then(([c,p])=>{setCustomers(c);setProviders(p);}).catch(()=>setError("Could not load customer/provider filters."));},[]);
 useEffect(()=>{
  if(!datesValid){setReport(null);setLoading(false);return;}
  let active=true;const query=new URLSearchParams({from,to});if(customerId)query.set("customerId",customerId);if(providerId)query.set("providerId",providerId);if(customerId&&cardId)query.set("cardId",cardId);
  setLoading(true);apiFetch<Report>("/reports/card-swipes?"+query.toString())
  .then(r=>{if(active){setReport(r);setError("");}}).catch(e=>{if(active){setReport(null);setError(e instanceof Error?e.message:"Unable to load report.");}})
  .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[from,to,datesValid,customerId,providerId,cardId,reportRevision]);
 function range(which:string){
  const end=which==="yesterday"?shift(today,-1):today;
  const begin=which==="all"?"1900-01-01":which==="week"?shift(today,-6):which==="month"?today.slice(0,8)+"01":end;
  setFromText(which==="all"?"All Time":indianDate(begin));setToText(indianDate(end));
 }
 function csv(){
  if(!report)return;
  const s=report.summary;const values:(string|number)[][]=[cols,...report.rows.map(rowCsv),["TOTAL","","","","","","",s.swipeAmount,s.gatewayFee,s.customerFee,s.payoutFee,s.netProfit,s.payableAmount,s.paidAmount,s.remainingAmount,"","","","","","","","",""]];
  const blob=new Blob(["\uFEFF"+values.map(v=>v.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Credit_Card_Report_"+(allTime?"All_Time":indianDay(from))+"_to_"+indianDay(to)+".csv";document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 const [pdfBusy,setPdfBusy]=useState(false);
 async function pdfExport(){
  if(!report||pdfBusy)return;
  setPdfBusy(true);
  try{const {downloadCardSwipePdf}=await import("./export-pdf");downloadCardSwipePdf(from,to,report.rows,report.summary,allTime);}
  catch(e){setError(e instanceof Error?e.message:"Unable to generate PDF.");}
  finally{setPdfBusy(false);}
 }
 const s=report?.summary;
 const pending=report?.pendingPayouts??[];
 const pendingQuery=pendingSearch.trim().toLocaleLowerCase();
 const matchingPending=[...pending].filter(r=>!pendingQuery||`${r.customerName} ${r.transactionNumber}`.toLocaleLowerCase().includes(pendingQuery))
  .sort((a,b)=>(a.expectedPayoutAt??"9999").localeCompare(b.expectedPayoutAt??"9999"));
 return <AppShell><PageFrame>
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-xs text-[var(--text-muted)]"><Link href="/reports" className="text-[var(--accent)]">Reports</Link> / Credit Cards</p>
    <h1 className="mt-1 text-2xl font-black">Credit Card Swipe Report</h1><p className="text-xs text-[var(--text-muted)]">Dates: DD-MM-YYYY (India Standard Time). Click a swipe to inspect its ledger history.</p></div>
   <div className="flex flex-wrap gap-2"><button type="button" onClick={pdfExport} disabled={loading||!report||pdfBusy} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pdfBusy?"Preparing PDF…":"Download PDF"}</button><button type="button" onClick={csv} disabled={loading||!report} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Download CSV</button><Link href="/reports/export" className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold">Full Excel Export</Link></div>
  </div>
  <Surface className="mb-4 p-4">
   <div className="flex flex-wrap gap-2">{[["today","Today"],["yesterday","Yesterday"],["week","Last 7 Days"],["month","This Month"],["all","All Time"]].map(([key,label])=><button type="button" key={key} onClick={()=>range(key)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">{label}</button>)}</div>
   <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <label className="text-xs font-bold">{allTime?"From · All recorded dates":"From (DD-MM-YYYY)"}<input aria-label="From calendar date" className="app-control mt-1 mb-1 w-full" type="date" value={allTime?"":from} onChange={e=>setFromText(indianDate(e.target.value))}/><input className="app-control mt-1 w-full" type="text" inputMode="numeric" maxLength={10} placeholder={allTime?"All Time — no start date":"DD-MM-YYYY"} value={allTime?"":fromText} onChange={e=>setFromText(e.target.value)}/></label>
    <label className="text-xs font-bold">To (DD-MM-YYYY)<input aria-label="To calendar date" className="app-control mt-1 mb-1 w-full" type="date" value={to} onChange={e=>setToText(indianDate(e.target.value))}/><input className="app-control mt-1 w-full" type="text" inputMode="numeric" maxLength={10} placeholder="DD-MM-YYYY" value={toText} onChange={e=>setToText(e.target.value)}/></label>
    <label className="text-xs font-bold">Customer<SearchableSelect className="app-control mt-1 w-full" value={customerId} onChange={e=>{setCustomerId(e.target.value);setCardId("");}}><option value="">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</SearchableSelect></label>
     <label className="text-xs font-bold">Saved card<SearchableSelect className="app-control mt-1 w-full" value={cardId} disabled={!customerId||cards.length===0} onChange={e=>setCardId(e.target.value)}><option value="">All cards</option>{cards.map(c=><option key={c.id} value={c.id}>{c.bankName+" •••• "+c.lastFourDigits+(c.nickname?" · "+c.nickname:"")}</option>)}</SearchableSelect></label>
    <label className="text-xs font-bold">Provider<SearchableSelect className="app-control mt-1 w-full" value={providerId} onChange={e=>setProviderId(e.target.value)}><option value="">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect></label>
   </div>
   <p className="mt-2 text-[11px] text-[var(--text-muted)]">Swipe totals use the selected IST transaction dates and customer/card filters. Paid and outstanding amounts show the latest recorded payout state, even for a historical swipe period. Pending payouts below are an all-time outstanding list.</p>
    {!datesValid?<p role="alert" className="mt-2 text-xs text-rose-600">{!from||!to?"Enter valid dates in DD-MM-YYYY format.":"From date must be before To date."}</p>:null}
   {error?<p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>:null}
  </Surface>
  {loading?<PageLoader label="Loading card swipes…"/>:report&&s?<>
   <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">{([["Swipe Amount",s.swipeAmount],["Customer Fees",s.customerFee],["Gateway Fees",s.gatewayFee],["Net Profit",s.netProfit]] as [string,number][]).map(([label,value])=><Surface key={label} className="p-4"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className={"money mt-1 text-xl font-black "+(label==="Net Profit"?profitClass(value):"")}>{money(value)}</p></Surface>)}</div>
   <Surface className="mb-4 p-4"><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{([["Original Payable",s.payableAmount],["Paid / Allocated",s.paidAmount],["Outstanding",s.remainingAmount],["Payout Charges",s.payoutFee]] as [string,number][]).map(([label,value])=><div key={label}><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="money mt-1 font-bold">{money(value)}</p></div>)}</div></Surface>
   <Surface className="overflow-hidden">
    <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-black">Swipe register ({allTime?"All Time through "+indianDay(to):indianDay(from)+(from===to?"":" to "+indianDay(to))}) · {report.count} transaction{report.count===1?"":"s"}</div>
    {report.rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[1850px] text-xs">
     <thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase text-[var(--text-muted)]"><tr>{["S.No","Date","Customer / Pay In","Cell number","Card type","Card number","Amount","Com. Fee","Cus. Fee","Payout Fee","Net Profit","Payable","Paid","Remaining","Payout source","Pay In account","Pay In status","Pay Out status","Provider due","Customer payout due"].map(h=><th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}</tr></thead>
     <tbody>{report.rows.map((r,i)=><tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-soft)]">
      <td className="px-3 py-3">{i+1}</td><td className="whitespace-nowrap px-3">{displayDate(r.transactionAt)}</td>
      <td className="min-w-36 px-3"><p className="font-bold">{r.customerName}</p><Link href={"/transactions/"+r.id} className="text-[10px] text-[var(--accent)]">{r.transactionNumber}</Link></td>
      <td className="px-3">{r.mobile||"—"}</td><td className="whitespace-nowrap px-3">{r.cardType}</td><td className="whitespace-nowrap px-3 font-mono">•••• {r.cardLastFour}</td>
      {[r.swipeAmount,r.gatewayFee,r.customerFee,r.payoutFee,r.netProfit,r.payableAmount,r.paidAmount,r.remainingAmount].map((v,n)=><td key={n} className={"money px-3 text-right "+(n===4?"font-black "+profitClass(v):"")}>{money(v)}</td>)}
      <td className="min-w-32 px-3">{r.payoutSources.join(", ")||"Pending"}</td><td className="px-3">{r.payInAccount}</td><td className="px-3 font-bold text-[var(--money-in)]">{r.payInStatus}</td><td className="px-3 font-bold">{payoutLabel(r)}</td><td className="whitespace-nowrap px-3">{r.providerSettlementDueAt?indianDay(r.providerSettlementDueAt):"—"}</td><td className="whitespace-nowrap px-3">{r.expectedPayoutAt?indianDay(r.expectedPayoutAt):"—"}</td>
     </tr>)}</tbody>
     <tfoot className="bg-[var(--surface-soft)] font-black"><tr><td colSpan={6} className="px-3 py-3">TOTAL</td>{[s.swipeAmount,s.gatewayFee,s.customerFee,s.payoutFee,s.netProfit,s.payableAmount,s.paidAmount,s.remainingAmount].map((v,i)=><td key={i} className={"money px-3 text-right "+(i===4?profitClass(v):"")}>{money(v)}</td>)}<td colSpan={6}/></tr></tfoot>
    </table></div>:<div className="p-4"><EmptyState title="No completed card swipes in this period"/></div>}
   </Surface>
   <Surface className="mt-4 overflow-hidden">
    <div className="border-b border-[var(--border)] p-4">
     <h2 className="font-black">Pending Customer Payouts · {pending.length}</h2>
     <p className="mt-1 text-xs text-[var(--text-muted)]">All outstanding card-swipe customer payouts, including swipes from earlier dates. Customer, saved-card and provider filters apply, but the date range does not. Expected payout is a due date, not a confirmed transfer. Use Complete / Match to record a new payout or link an earlier recorded payment without paying twice.</p>
     <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="block w-full max-w-sm text-xs font-bold">Search pending payouts
       <input type="search" className="app-control mt-1 w-full" value={pendingSearch} onChange={e=>setPendingSearch(e.target.value)} placeholder="Customer name or transaction number" autoComplete="off"/>
      </label>
      <span role="status" className="pb-2 text-xs text-[var(--text-muted)]">{pendingQuery?`Showing ${matchingPending.length} of ${pending.length} pending payouts`:`${pending.length} pending payouts`}</span>
      {pendingSearch?<button type="button" onClick={()=>setPendingSearch("")} className="mb-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">Clear search</button>:null}
     </div>
    </div>
    {report.pendingTruncated?<p className="px-4 pt-3 text-xs text-amber-700">Showing the first 1,000 outstanding payouts; narrow the customer, saved card or provider filter to see more.</p>:null}
    {pending.length&&matchingPending.length?<div className="overflow-x-auto"><table className="w-full min-w-[850px] text-xs">
     <thead className="bg-[var(--surface-soft)] text-left"><tr>{["Swipe date","Customer / transaction","Paid","Remaining","Expected payout","Pay In","Pay Out"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
     <tbody>{matchingPending.map(r=><tr key={r.id} className="border-t border-[var(--border)]">
      <td className="whitespace-nowrap px-3 py-3">{displayDate(r.transactionAt)}</td>
      <td className="px-3"><p className="font-bold">{r.customerName}</p><Link className="text-[var(--accent)]" href={"/transactions/"+r.id}>{r.transactionNumber}</Link></td>
      <td className="money px-3 text-right">{money(r.paidAmount)}</td><td className="money px-3 text-right font-bold">{money(r.remainingAmount)}</td>
      <td className="whitespace-nowrap px-3">{r.expectedPayoutAt?indianDay(r.expectedPayoutAt):"Not set"}</td>
      <td className="px-3 font-bold text-[var(--money-in)]">Success</td>
      <td className="px-3 py-2"><div className="space-y-1"><p className="font-bold">{r.paidAmount>0?"Partially paid":"Pending"}</p><button type="button" onClick={()=>setPayoutId(r.payableId)} className="min-h-9 whitespace-nowrap rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white">Complete / Match</button></div></td>
     </tr>)}</tbody>
    </table></div>:<p className="p-4 text-sm text-[var(--text-muted)]">{pending.length?"No pending payouts match your search.":"No outstanding customer payouts."}</p>}
   </Surface>
   {report.cardDue ? <Surface className="mt-4 overflow-hidden">
    <div className="border-b border-[var(--border)] p-4">
     <h2 className="text-base font-black">Card Due activity · {report.cardDue.rows.length} entries</h2>
     <p className="mt-1 text-xs text-[var(--text-muted)]">Includes pending Card Due entries, recoveries and commission events dated within this period. Original swipe totals above remain separate. Recovery principal and commission collection are not new income.</p>
     <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {([["Principal Recovered",report.cardDue.summary.principalRecovered],["Earned Commission",report.cardDue.summary.earnedCommission],["Provider Costs",report.cardDue.summary.providerCost],["Payout Costs",report.cardDue.summary.payoutCost],["Card Due Net Profit",report.cardDue.summary.netProfit]] as [string,number][]).map(([name,amount])=><div key={name}><p className="text-xs text-[var(--text-muted)]">{name}</p><p className={"money font-bold "+(name==="Card Due Net Profit"?profitClass(amount):"")}>{money(amount)}</p></div>)}
     </div>
     <p className={"mt-2 text-sm font-bold "+profitClass(s.netProfit+report.cardDue.summary.netProfit)}>Combined swipe + Card Due profit: {money(s.netProfit+report.cardDue.summary.netProfit)}</p>
    </div>
    {report.cardDue.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-xs">
     <thead><tr className="text-left">{["Date","Transaction","Customer","Activity","Status","Principal","Remaining Due","Remaining Commission","Commission Collected","Earned Commission","Provider Cost","Payout Cost","Net Profit","Payment Received","Received Into","UTR / Reference"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
     <tbody>{report.cardDue.rows.map(r=><tr key={r.id} className="border-t border-[var(--border)]">
      <td className="whitespace-nowrap px-3 py-3">{displayDate(r.transactionAt)}</td>
      <td className="px-3"><Link className="text-[var(--accent)]" href={"/transactions/"+r.id}>{r.transactionNumber}</Link></td>
      <td className="px-3">{r.customerName}</td><td className="px-3">{r.activity}</td><td className="px-3">{r.status}</td>
      {[r.principal,r.remainingPrincipal,r.remainingCommission,r.commissionCollected,r.earnedCommission,r.providerCost,r.payoutCost,r.netProfit].map((n,i)=><td key={i} className={"money px-3 text-right "+(i===7&&n!==null?profitClass(n):"")}>{n===null?"—":money(n)}</td>)}
      <td className="money px-3 text-right">{r.receivedAmount==null?"—":money(r.receivedAmount)}</td>
      <td className="px-3">{r.receivedIn??"—"}</td>
      <td className="px-3">{r.referenceNumber??"—"}</td>
     </tr>)}</tbody>
    </table></div> : <div className="p-4"><EmptyState title="No Card Due activity in this period"/></div>}
   </Surface> : null}
   <p className="mt-3 text-xs text-[var(--text-muted)]">{report.basis} Card numbers are masked.</p>
  </>:null}
  <PendingPayoutModal payableId={payoutId} onClose={()=>setPayoutId(null)} onSaved={()=>setReportRevision(n=>n+1)}/>
 </PageFrame></AppShell>;
}
