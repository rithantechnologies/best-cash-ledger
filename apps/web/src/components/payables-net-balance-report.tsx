"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";

export type NetBalanceRow={
 id:string;dueDate:string;swipeDate:string;customerId:string;customer:string;mobile:string;
 card:string;provider:string;gateway:string;transactionNumber:string;service:string;term:string;
 termDays:number|null;termLabel?:string;grossSwipe:number;customerCharges:number;customerRate:number|null;
 gatewayCharge:number;netPayable:number;paid:number;advance:number;remaining:number;status:string;
};
export type NetBalanceDay={
 date:string;itemCount:number;customerCount:number;cardCount:number;grossSwipe:number;
 customerCharges:number;netPayable:number;paid:number;advance:number;remaining:number;
 status:"OVERDUE"|"TODAY"|"UPCOMING";
};
export type NetBalanceCard={
 customer:string;mobile:string;card:string;earliestDue:string;swipeCount:number;
 grossSwipe:number;customerCharges:number;netPayable:number;paid:number;advance:number;remaining:number;
};
export type NetBalanceReport={
 businessDate:string;
 totals:{outstanding:number;overdue:number;today:number;upcoming:number;itemCount:number;customerCount:number};
 dates:NetBalanceDay[];rows:NetBalanceRow[];cards:NetBalanceCard[];
};
type View="net"|"dates"|"details"|"cards"|"customer";
const MONEY=new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"});
const cash=(value:number)=>MONEY.format(value);
const day=(value:string)=>new Date(value+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
const term=(row:NetBalanceRow)=>row.termLabel??(row.termDays===null?row.term:row.termDays+" DAYS");
const source=(row:NetBalanceRow)=>[row.provider,row.gateway].filter(Boolean).join(" / ")||"—";
const priority=(value:string)=>value==="OVERDUE"?"text-rose-700":value==="TODAY"||value==="DUE TODAY"?"text-amber-700":"text-emerald-700";

const headers=["SWIPE DATE","GATEWAY / SOURCE","PAYABLE","AMOUNT","DUE DATE","TERM",
 "GROSS SWIPE","SERVICE CHARGE","NET PAYABLE","ALREADY PAID","ADVANCE","REFERENCE"];

function HeaderCell({children,accent=false}:{children:ReactNode;accent?:boolean}){
 return <th scope="col" className={"whitespace-nowrap border-b px-3 py-3 text-left text-[10px] font-extrabold uppercase tracking-wide text-white "+(accent?"bg-[#55328c]":"bg-[#1d3452]")}>{children}</th>;
}
function DataCell({children,accent=false,right=false,large=false}:{children:ReactNode;accent?:boolean;right?:boolean;large?:boolean}){
 return <td className={"border-b border-slate-200 px-3 py-3 text-xs "+(right?"text-right tabular-nums ":"")+(large?"font-extrabold ":"")+(accent?"bg-[#604095] text-white":"text-slate-800")}>{children}</td>;
}
function GrossRow({row,cardOnly=false}:{row:NetBalanceRow;cardOnly?:boolean}){
 return <tr className="hover:bg-violet-50/50">
  <DataCell>{day(row.swipeDate)}</DataCell>
  <DataCell>{source(row)}</DataCell>
  <DataCell accent><span className="font-bold">{cardOnly?row.card:row.customer+" — "+row.card}</span></DataCell>
  <DataCell accent right large><Link className="underline decoration-white/40 underline-offset-2" href={"/payables/"+encodeURIComponent(row.id)} title="Open payable">{cash(row.remaining)}</Link></DataCell>
  <DataCell><span className={"font-semibold "+priority(row.status)}>{day(row.dueDate)}</span></DataCell>
  <DataCell>{term(row)}</DataCell>
  <DataCell right>{cash(row.grossSwipe)}</DataCell>
  <DataCell right>{cash(row.customerCharges)}</DataCell>
  <DataCell right>{cash(row.netPayable)}</DataCell>
  <DataCell right>{cash(row.paid)}</DataCell>
  <DataCell right>{cash(row.advance)}</DataCell>
  <DataCell><span className="font-mono text-[11px]">{row.transactionNumber}</span></DataCell>
 </tr>;
}
function MoneyFooter({amount,label}:{amount:number;label:string}){
 return <tr className="bg-[#167a4c] text-white">
  <td colSpan={3} className="px-3 py-4 text-xs font-black uppercase tracking-wide">{label}</td>
  <td className="px-3 py-4 text-right text-base font-black tabular-nums">{cash(amount)}</td>
  <td colSpan={8} />
 </tr>;
}
function TableFrame({children}:{children:ReactNode}){
 return <div className="overflow-x-auto overscroll-x-contain rounded-b-xl border-t border-slate-200"><table className="w-full min-w-[1430px] border-separate border-spacing-0 text-left">{children}</table></div>;
}
function PayableHeader(){
 return <thead><tr>{headers.map((v,i)=><HeaderCell key={v} accent={i===2||i===3}>{v}</HeaderCell>)}</tr></thead>;
}

export function PayablesNetBalanceReport({
 report,onSelectDate,selectedDate,
}:{
 report:NetBalanceReport;onSelectDate:(date:string)=>void;selectedDate:string;
}){
 const [view,setView]=useState<View>("net");
 const [customerId,setCustomerId]=useState("");
 const customers=useMemo(()=>{
  const found=new Map<string,{id:string;name:string;count:number}>();
  for(const row of report.rows){
   const prev=found.get(row.customerId);
   if(prev)prev.count++;else found.set(row.customerId,{id:row.customerId,name:row.customer,count:1});
  }
  return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name));
 },[report.rows]);
 const visibleCustomer=customers.find(v=>v.id===customerId)??customers[0];
 const customerRows=report.rows.filter(row=>row.customerId===visibleCustomer?.id);
 const customerTotal=Math.round(customerRows.reduce((a,b)=>a+b.remaining,0)*100)/100;
 const tabs:{key:View;label:string}[]=[
  {key:"net",label:"NET BALANCE"},{key:"dates",label:"DATE WISE"},
  {key:"details",label:"PENDING DETAILS"},{key:"cards",label:"CARD TOTALS"},
  {key:"customer",label:"CUSTOMER WISE"},
 ];
 return <section aria-label="Excel-style customer net balance" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1d3452] px-4 py-4 text-white sm:px-5">
   <div><h2 className="text-lg font-black tracking-wide">NET BALANCE <span className="text-violet-200">/ PAYABLE</span></h2>
    <p className="mt-0.5 text-xs text-white/75">As of {day(report.businessDate)}</p>
   </div>
   <div className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-right">
    <p className="text-[10px] uppercase tracking-wide text-white/70">Total to pay</p>
    <p className="text-xl font-black tabular-nums">{cash(report.totals.outstanding)}</p>
   </div>
  </div>
  <div role="tablist" aria-label="Payables workbook views" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 pt-2 sm:px-4">
   {tabs.map(tab=><button type="button" key={tab.key} role="tab" aria-selected={view===tab.key}
    onClick={()=>setView(tab.key)}
    className={"shrink-0 rounded-t-lg px-3 py-3 text-[11px] font-extrabold tracking-wide transition-colors sm:text-xs "+
     (view===tab.key?"bg-[#55328c] text-white":"text-slate-600 hover:bg-violet-100 hover:text-violet-900")}>{tab.label}</button>)}
  </div>
  {view==="net"?<div role="tabpanel" aria-label="NET BALANCE">
   <TableFrame><PayableHeader/><tbody>
    {report.dates.map(dateGroup=><Fragment key={dateGroup.date}>
     <tr className="bg-[#e6e9f4]">
      <td colSpan={3} className="px-3 py-2 text-xs font-extrabold text-[#1d3452]">
       <button type="button" className="underline decoration-slate-400 underline-offset-4 hover:text-violet-800" onClick={()=>onSelectDate(dateGroup.date)}>DUE {day(dateGroup.date)} · {dateGroup.customerCount} customer{dateGroup.customerCount===1?"":"s"}</button>
      </td>
      <td className="px-3 py-2 text-right text-xs font-black tabular-nums text-[#55328c]">{cash(dateGroup.remaining)}</td>
      <td colSpan={8} className={"px-3 py-2 text-xs font-bold "+priority(dateGroup.status)}>{dateGroup.status} · {dateGroup.itemCount} pending entr{dateGroup.itemCount===1?"y":"ies"}</td>
     </tr>
     {report.rows.filter(row=>row.dueDate===dateGroup.date).map(row=><GrossRow key={row.id} row={row}/>)}
    </Fragment>)}
    {!report.rows.length?<tr><td colSpan={12} className="px-5 py-10 text-center text-sm text-slate-500">No pending payments.</td></tr>:null}
    <MoneyFooter amount={report.totals.outstanding} label="GRAND TOTAL"/>
   </tbody></TableFrame>
  </div>:null}
  {view==="dates"?<div role="tabpanel" aria-label="DATE WISE">
   <div className="overflow-x-auto"><table className="w-full min-w-[1030px] text-xs">
    <thead><tr>{["DUE DATE","STATUS","CUSTOMERS","CARDS","ENTRIES","GROSS SWIPE","CUSTOMER CHARGE","NET PAYABLE","PAID","ADVANCE","STILL TO PAY"].map(v=><HeaderCell key={v}>{v}</HeaderCell>)}</tr></thead>
    <tbody>{report.dates.map(dateGroup=><tr key={dateGroup.date} className={"border-b hover:bg-slate-50 "+(selectedDate===dateGroup.date?"bg-violet-50":"")}>
     <DataCell><button type="button" className="font-bold text-violet-700 underline underline-offset-2" onClick={()=>onSelectDate(dateGroup.date)}>{day(dateGroup.date)}</button></DataCell>
     <DataCell><span className={"font-extrabold "+priority(dateGroup.status)}>{dateGroup.status}</span></DataCell>
     <DataCell right>{dateGroup.customerCount}</DataCell><DataCell right>{dateGroup.cardCount}</DataCell><DataCell right>{dateGroup.itemCount}</DataCell>
     <DataCell right>{cash(dateGroup.grossSwipe)}</DataCell><DataCell right>{cash(dateGroup.customerCharges)}</DataCell>
     <DataCell right>{cash(dateGroup.netPayable)}</DataCell><DataCell right>{cash(dateGroup.paid)}</DataCell>
     <DataCell right>{cash(dateGroup.advance)}</DataCell><DataCell right large>{cash(dateGroup.remaining)}</DataCell>
    </tr>)}
    <tr className="bg-[#167a4c] font-black text-white"><td colSpan={10} className="px-3 py-4 text-sm">GRAND TOTAL — {report.totals.itemCount} pending entries</td><td className="px-3 py-4 text-right text-sm tabular-nums">{cash(report.totals.outstanding)}</td></tr>
    </tbody>
   </table></div>
  </div>:null}
  {view==="details"?<div role="tabpanel" aria-label="PENDING DETAILS">
   <div className="overflow-x-auto"><table className="w-full min-w-[1700px] text-xs">
    <thead><tr>{["DUE DATE","SWIPE DATE","CUSTOMER","MOBILE","CARD","SOURCE","REFERENCE","TERM","GROSS SWIPE","CUSTOMER FEE %","CUSTOMER CHARGE","NET PAYABLE","PAID","ADVANCE","STILL TO PAY","GATEWAY COST","PRIORITY"].map(v=><HeaderCell key={v}>{v}</HeaderCell>)}</tr></thead>
    <tbody>{report.rows.map(row=><tr key={row.id} className="border-b border-slate-200 hover:bg-violet-50">
     <DataCell>{day(row.dueDate)}</DataCell><DataCell>{day(row.swipeDate)}</DataCell><DataCell><Link href={"/payables/"+encodeURIComponent(row.id)} className="font-bold text-violet-800 underline">{row.customer}</Link></DataCell>
     <DataCell>{row.mobile}</DataCell><DataCell>{row.card}</DataCell><DataCell>{source(row)}</DataCell><DataCell>{row.transactionNumber}</DataCell><DataCell>{term(row)}</DataCell>
     <DataCell right>{cash(row.grossSwipe)}</DataCell><DataCell right>{row.customerRate===null?"—":row.customerRate.toFixed(2)+"%"}</DataCell><DataCell right>{cash(row.customerCharges)}</DataCell>
     <DataCell right>{cash(row.netPayable)}</DataCell><DataCell right>{cash(row.paid)}</DataCell><DataCell right>{cash(row.advance)}</DataCell>
     <DataCell right large><Link href={"/payables/"+encodeURIComponent(row.id)} className="text-violet-700 underline">{cash(row.remaining)}</Link></DataCell>
     <DataCell right>{cash(row.gatewayCharge)}</DataCell><DataCell><span className={"font-bold "+priority(row.status)}>{row.status}</span></DataCell>
    </tr>)}</tbody>
   </table></div>
  </div>:null}
  {view==="cards"?<div role="tabpanel" aria-label="CARD TOTALS">
   <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-xs">
    <thead><tr>{["CUSTOMER","MOBILE","CARD","EARLIEST DUE","ENTRIES","GROSS SWIPE","SERVICE CHARGE","NET PAYABLE","PAID","ADVANCE","BALANCE"].map(v=><HeaderCell key={v}>{v}</HeaderCell>)}</tr></thead>
    <tbody>{report.cards.map((row,i)=><tr key={row.customer+"-"+row.card+"-"+i} className="border-b border-slate-200 hover:bg-slate-50">
     <DataCell><span className="font-bold">{row.customer}</span></DataCell><DataCell>{row.mobile}</DataCell><DataCell>{row.card}</DataCell><DataCell><span className={priority(row.earliestDue<report.businessDate?"OVERDUE":row.earliestDue===report.businessDate?"TODAY":"UPCOMING")}>{day(row.earliestDue)}</span></DataCell><DataCell right>{row.swipeCount}</DataCell><DataCell right>{cash(row.grossSwipe)}</DataCell><DataCell right>{cash(row.customerCharges)}</DataCell><DataCell right>{cash(row.netPayable)}</DataCell><DataCell right>{cash(row.paid)}</DataCell><DataCell right>{cash(row.advance)}</DataCell><DataCell right large><span className="text-violet-800">{cash(row.remaining)}</span></DataCell>
    </tr>)}</tbody>
   </table></div>
  </div>:null}
  {view==="customer"?<div role="tabpanel" aria-label="CUSTOMER WISE">
   <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">Customer
     <select aria-label="Select customer report" value={visibleCustomer?.id??""} onChange={e=>setCustomerId(e.target.value)} className="max-w-[230px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800">
      {customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name} ({customer.count})</option>)}
     </select>
    </label>
    <span className="text-sm font-black text-[#167a4c]">Customer total: {cash(customerTotal)}</span>
   </div>
   <TableFrame><PayableHeader/><tbody>
    {customerRows.map(row=><GrossRow key={row.id} row={row} cardOnly/>)}
    {!customerRows.length?<tr><td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-500">No pending payments.</td></tr>:null}
    <MoneyFooter amount={customerTotal} label="CUSTOMER TOTAL"/>
   </tbody></TableFrame>
  </div>:null}
  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
   <span className="font-semibold text-[#167a4c]">{report.totals.itemCount} pending · {report.totals.customerCount} customers</span>
  </div>
 </section>;
}
