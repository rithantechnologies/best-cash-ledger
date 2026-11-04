"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Surface } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";
import { indianDate, indianDateTime, reportIsoDate } from "./indian-date";

type Row = { id:string; transactionNumber:string;transactionAt:string;customerName:string;mobile:string;cardType:string;cardLastFour:string;
 swipeAmount:number;customerFee:number;gatewayFee:number;payoutFee:number;netProfit:number;payableAmount:number;paidAmount:number;
 remainingAmount:number;payoutStatus:string;payoutSources:string[];payInAccount:string;provider:string;gateway:string };
type Totals = Pick<Row,"swipeAmount"|"customerFee"|"gatewayFee"|"payoutFee"|"netProfit"|"payableAmount"|"paidAmount"|"remainingAmount">;
type DueRow = {id:string;transactionNumber:string;transactionAt:string;customerName:string;activity:string;status:string;
 principal:number;remainingPrincipal:number|null;remainingCommission:number|null;commissionCollected:number;
 earnedCommission:number;providerCost:number;payoutCost:number;netProfit:number;
 receivedAmount?:number|null;receivedIn?:string|null;referenceNumber?:string|null};
type DueSummary = {earnedCommission:number;providerCost:number;payoutCost:number;netProfit:number;principalRecovered:number};
type Report = {from:string;to:string;count:number;summary:Totals;rows:Row[];basis:string;cardDue?:{rows:DueRow[];summary:DueSummary}};
type Option = {id:string;name?:string;fullName?:string};
const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(v);
function todayIST(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const p=(name:string)=>parts.find(x=>x.type===name)?.value??"";
 return p("year")+"-"+p("month")+"-"+p("day");
}
function shift(d:string,n:number){const t=new Date(d+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
const indianDay=indianDate;
const displayDate=indianDateTime;
function csvCell(value:string|number){const s=String(value??"");return '"'+(/^[\s\u0000-\u001f]*[=+\-@]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
const cols=["S.No","Date (DD-MM-YYYY IST)","Transaction","Customer","Cell number","Card type","Card last four","Amount","Com. Fee","Cus. Fee",
 "Payout Fee","Net Profit","Payable","Paid","Remaining","Payout Source","Pay-in Account","Provider","Gateway","Status"];
function rowCsv(r:Row,i:number):(string|number)[]{return [i+1,displayDate(r.transactionAt),r.transactionNumber,r.customerName,r.mobile,
 r.cardType,"•••• "+r.cardLastFour,r.swipeAmount,r.gatewayFee,r.customerFee,r.payoutFee,r.netProfit,r.payableAmount,
 r.paidAmount,r.remainingAmount,r.payoutSources.join(" / "),r.payInAccount,r.provider,r.gateway,r.payoutStatus];}

export default function CardSwipeReportPage(){
 const [today]=useState(todayIST);
 const [fromText,setFromText]=useState(()=>indianDate(todayIST()));
 const [toText,setToText]=useState(()=>indianDate(todayIST()));
 const from=reportIsoDate(fromText)??"";
 const to=reportIsoDate(toText)??"";
 const datesValid=Boolean(from&&to&&from<=to);
 const [customerId,setCustomerId]=useState(""),[providerId,setProviderId]=useState("");
 const [customers,setCustomers]=useState<Option[]>([]),[providers,setProviders]=useState<Option[]>([]);
 const [report,setReport]=useState<Report|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{Promise.all([apiFetch<Option[]>("/customers"),apiFetch<Option[]>("/providers?includeInactive=true")])
 .then(([c,p])=>{setCustomers(c);setProviders(p);}).catch(()=>setError("Could not load customer/provider filters."));},[]);
 useEffect(()=>{
  if(!datesValid){setReport(null);setLoading(false);return;}
  let active=true;const query=new URLSearchParams({from,to});if(customerId)query.set("customerId",customerId);if(providerId)query.set("providerId",providerId);
  setLoading(true);apiFetch<Report>("/reports/card-swipes?"+query.toString())
  .then(r=>{if(active){setReport(r);setError("");}}).catch(e=>{if(active){setReport(null);setError(e instanceof Error?e.message:"Unable to load report.");}})
  .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[from,to,datesValid,customerId,providerId]);
 function range(which:string){setToText(indianDate(today));setFromText(indianDate(which==="today"?today:which==="week"?shift(today,-6):today.slice(0,8)+"01"));}
 function csv(){
  if(!report)return;
  const s=report.summary;const values:(string|number)[][]=[cols,...report.rows.map(rowCsv),["TOTAL","","","","","","",s.swipeAmount,s.gatewayFee,s.customerFee,s.payoutFee,s.netProfit,s.payableAmount,s.paidAmount,s.remainingAmount,"","","","",""]];
  const blob=new Blob(["\uFEFF"+values.map(v=>v.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Credit_Card_Report_"+indianDay(from)+"_to_"+indianDay(to)+".csv";document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 const [pdfBusy,setPdfBusy]=useState(false);
 async function pdfExport(){
  if(!report||pdfBusy)return;
  setPdfBusy(true);
  try{const {downloadCardSwipePdf}=await import("./export-pdf");downloadCardSwipePdf(from,to,report.rows,report.summary);}
  catch(e){setError(e instanceof Error?e.message:"Unable to generate PDF.");}
  finally{setPdfBusy(false);}
 }
 const s=report?.summary;
 return <AppShell><PageFrame>
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-xs text-[var(--text-muted)]"><Link href="/reports" className="text-[var(--accent)]">Reports</Link> / Credit Cards</p>
    <h1 className="mt-1 text-2xl font-black">Credit Card Swipe Report</h1><p className="text-xs text-[var(--text-muted)]">Dates: DD-MM-YYYY (India Standard Time). Click a swipe to inspect its ledger history.</p></div>
   <div className="flex flex-wrap gap-2"><button type="button" onClick={pdfExport} disabled={loading||!report||pdfBusy} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pdfBusy?"Preparing PDF…":"Download PDF"}</button><button type="button" onClick={csv} disabled={loading||!report} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Download CSV</button><Link href="/reports/export" className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold">Full Excel Export</Link></div>
  </div>
  <Surface className="mb-4 p-4">
   <div className="flex flex-wrap gap-2">{[["today","Today"],["week","Last 7 Days"],["month","This Month"]].map(([key,label])=><button type="button" key={key} onClick={()=>range(key)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold">{label}</button>)}</div>
   <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-xs font-bold">From (DD-MM-YYYY)<input className="app-control mt-1 w-full" type="text" inputMode="numeric" maxLength={10} placeholder="DD-MM-YYYY" value={fromText} onChange={e=>setFromText(e.target.value)}/></label>
    <label className="text-xs font-bold">To (DD-MM-YYYY)<input className="app-control mt-1 w-full" type="text" inputMode="numeric" maxLength={10} placeholder="DD-MM-YYYY" value={toText} onChange={e=>setToText(e.target.value)}/></label>
    <label className="text-xs font-bold">Customer<SearchableSelect className="app-control mt-1 w-full" value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">All customers</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</SearchableSelect></label>
    <label className="text-xs font-bold">Provider<SearchableSelect className="app-control mt-1 w-full" value={providerId} onChange={e=>setProviderId(e.target.value)}><option value="">All providers</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect></label>
   </div>
   {!datesValid?<p role="alert" className="mt-2 text-xs text-rose-600">{!from||!to?"Enter valid dates in DD-MM-YYYY format.":"From date must be before To date."}</p>:null}
   {error?<p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>:null}
  </Surface>
  {loading?<PageLoader label="Loading card swipes…"/>:report&&s?<>
   <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">{([["Swipe Amount",s.swipeAmount],["Customer Fees",s.customerFee],["Gateway Fees",s.gatewayFee],["Net Profit",s.netProfit]] as [string,number][]).map(([label,value])=><Surface key={label} className="p-4"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="money mt-1 text-xl font-black">{money(value)}</p></Surface>)}</div>
   <Surface className="mb-4 p-4"><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{([["Original Payable",s.payableAmount],["Paid / Allocated",s.paidAmount],["Outstanding",s.remainingAmount],["Payout Charges",s.payoutFee]] as [string,number][]).map(([label,value])=><div key={label}><p className="text-xs text-[var(--text-muted)]">{label}</p><p className="money mt-1 font-bold">{money(value)}</p></div>)}</div></Surface>
   <Surface className="overflow-hidden">
    <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-black">Swipe register ({indianDay(from)}{from===to?"":" to "+indianDay(to)}) · {report.count} transaction{report.count===1?"":"s"}</div>
    {report.rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[1850px] text-xs">
     <thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase text-[var(--text-muted)]"><tr>{["S.No","Date","Customer / Pay In","Cell number","Card type","Card number","Amount","Com. Fee","Cus. Fee","Payout Fee","Net Profit","Payable","Paid","Remaining","PAYOUT","PAYIN","Status"].map(h=><th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}</tr></thead>
     <tbody>{report.rows.map((r,i)=><tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-soft)]">
      <td className="px-3 py-3">{i+1}</td><td className="whitespace-nowrap px-3">{displayDate(r.transactionAt)}</td>
      <td className="min-w-36 px-3"><p className="font-bold">{r.customerName}</p><Link href={"/transactions/"+r.id} className="text-[10px] text-[var(--accent)]">{r.transactionNumber}</Link></td>
      <td className="px-3">{r.mobile||"—"}</td><td className="whitespace-nowrap px-3">{r.cardType}</td><td className="whitespace-nowrap px-3 font-mono">•••• {r.cardLastFour}</td>
      {[r.swipeAmount,r.gatewayFee,r.customerFee,r.payoutFee,r.netProfit,r.payableAmount,r.paidAmount,r.remainingAmount].map((v,n)=><td key={n} className={"money px-3 text-right "+(n===4?"font-black text-[var(--money-in)]":"")}>{money(v)}</td>)}
      <td className="min-w-32 px-3">{r.payoutSources.join(", ")||"Pending"}</td><td className="px-3">{r.payInAccount}</td><td className="px-3">{r.payoutStatus.replaceAll("_"," ")}</td>
     </tr>)}</tbody>
     <tfoot className="bg-[var(--surface-soft)] font-black"><tr><td colSpan={6} className="px-3 py-3">TOTAL</td>{[s.swipeAmount,s.gatewayFee,s.customerFee,s.payoutFee,s.netProfit,s.payableAmount,s.paidAmount,s.remainingAmount].map((v,i)=><td key={i} className="money px-3 text-right">{money(v)}</td>)}<td colSpan={3}/></tr></tfoot>
    </table></div>:<div className="p-4"><EmptyState title="No completed card swipes in this period"/></div>}
   </Surface>
   {report.cardDue ? <Surface className="mt-4 overflow-hidden">
    <div className="border-b border-[var(--border)] p-4">
     <h2 className="text-base font-black">Card Due activity · {report.cardDue.rows.length} entries</h2>
     <p className="mt-1 text-xs text-[var(--text-muted)]">Includes pending Card Due entries, recoveries and commission events dated within this period. Original swipe totals above remain separate. Recovery principal and commission collection are not new income.</p>
     <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {([["Principal Recovered",report.cardDue.summary.principalRecovered],["Earned Commission",report.cardDue.summary.earnedCommission],["Provider Costs",report.cardDue.summary.providerCost],["Payout Costs",report.cardDue.summary.payoutCost],["Card Due Net Profit",report.cardDue.summary.netProfit]] as [string,number][]).map(([name,amount])=><div key={name}><p className="text-xs text-[var(--text-muted)]">{name}</p><p className="money font-bold">{money(amount)}</p></div>)}
     </div>
     <p className="mt-2 text-sm font-bold">Combined swipe + Card Due profit: {money(s.netProfit+report.cardDue.summary.netProfit)}</p>
    </div>
    {report.cardDue.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-xs">
     <thead><tr className="text-left">{["Date","Transaction","Customer","Activity","Status","Principal","Remaining Due","Remaining Commission","Commission Collected","Earned Commission","Provider Cost","Payout Cost","Net Profit","Payment Received","Received Into","UTR / Reference"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
     <tbody>{report.cardDue.rows.map(r=><tr key={r.id} className="border-t border-[var(--border)]">
      <td className="whitespace-nowrap px-3 py-3">{displayDate(r.transactionAt)}</td>
      <td className="px-3"><Link className="text-[var(--accent)]" href={"/transactions/"+r.id}>{r.transactionNumber}</Link></td>
      <td className="px-3">{r.customerName}</td><td className="px-3">{r.activity}</td><td className="px-3">{r.status}</td>
      {[r.principal,r.remainingPrincipal,r.remainingCommission,r.commissionCollected,r.earnedCommission,r.providerCost,r.payoutCost,r.netProfit].map((n,i)=><td key={i} className="money px-3 text-right">{n===null?"—":money(n)}</td>)}
      <td className="money px-3 text-right">{r.receivedAmount==null?"—":money(r.receivedAmount)}</td>
      <td className="px-3">{r.receivedIn??"—"}</td>
      <td className="px-3">{r.referenceNumber??"—"}</td>
     </tr>)}</tbody>
    </table></div> : <div className="p-4"><EmptyState title="No Card Due activity in this period"/></div>}
   </Surface> : null}
   <p className="mt-3 text-xs text-[var(--text-muted)]">{report.basis} Card numbers are masked.</p>
  </>:null}
 </PageFrame></AppShell>;
}
