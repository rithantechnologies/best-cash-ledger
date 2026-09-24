"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type ExpenseDetail={expenseCategoryId:string;expenseType:string;amount:string;description:string};
type Tx={id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;expense:ExpenseDetail|null};
type Category={id:string;name:string;expenseUsage:string;isActive?:boolean};
type Scope="COMBINED"|"BUSINESS"|"PERSONAL";
type Period="30D"|"90D"|"6M"|"ALL"|"CUSTOM";

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const palette=["#2563eb","#7c3aed","#0f766e","#d97706","#db2777","#64748b","#0891b2","#65a30d"];

function ExpenseDonut({rows}:{rows:{name:string;amount:number}[]}){
 const total=rows.reduce((s,x)=>s+x.amount,0);
 let cursor=0;
 const stops=rows.map((x,i)=>{const start=cursor,end=total?cursor+x.amount/total*100:cursor;cursor=end;return palette[i%palette.length]+" "+start+"% "+end+"%";}).join(",");
 return <div className="grid gap-5 sm:grid-cols-[170px_1fr] sm:items-center">
  <div className="expense-donut relative mx-auto h-40 w-40 rounded-full" style={{background:total?"conic-gradient("+stops+")":"var(--surface-soft)"}}>
   <div className="absolute inset-[24px] grid place-items-center rounded-full bg-[var(--surface)] text-center"><div><p className="text-[10px] text-[var(--text-muted)]">Total</p><strong className="money block text-xl">{money(total)}</strong></div></div>
  </div>
  <div className="space-y-2.5">{rows.slice(0,8).map((x,i)=><div key={x.name} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-[var(--text-muted)]"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:palette[i%palette.length]}}/><span className="truncate">{x.name}</span></span><strong className="money shrink-0">{money(x.amount)}</strong></div>)}</div>
 </div>;
}

function MonthlyChart({rows}:{rows:{label:string;amount:number}[]}){
 const width=720,height=245,pad=28,max=Math.max(1,...rows.map(x=>x.amount));
 const points=rows.map((x,i)=>({x:pad+(rows.length<=1?0:i*(width-pad*2)/(rows.length-1)),y:height-pad-(x.amount/max)*(height-pad*2)}));
 const line=points.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" ");
 const area=points.length?line+" L "+points[points.length-1].x+" "+(height-pad)+" L "+points[0].x+" "+(height-pad)+" Z":"";
 return <div>
  <svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full" role="img" aria-label="Monthly expense trend">
   {[.25,.5,.75].map(n=><line key={n} x1={pad} x2={width-pad} y1={pad+n*(height-pad*2)} y2={pad+n*(height-pad*2)} stroke="var(--border)" strokeDasharray="4 7"/>)}
   {area?<path d={area} fill="color-mix(in srgb, var(--money-out) 9%, transparent)" className="dashboard-chart-area"/>:null}
   <path d={line} pathLength="1" fill="none" stroke="var(--money-out)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="dashboard-chart-line"/>
   {points.map((p,i)=><g key={rows[i].label}><circle cx={p.x} cy={p.y} r="4" fill="var(--money-out)" className="dashboard-chart-dot"><title>{rows[i].label+" · "+money(rows[i].amount)}</title></circle><text x={p.x} y={height-5} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{rows[i].label}</text></g>)}
  </svg>
 </div>;
}

export default function ExpensesPage(){
 const [transactions,setTransactions]=useState<Tx[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [scope]=useState<Scope>("COMBINED"),[period,setPeriod]=useState<Period>("90D");
 const [categoryId,setCategoryId]=useState("ALL"),[dateFrom,setDateFrom]=useState(""),[dateTo,setDateTo]=useState("");
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{
  Promise.all([
   apiFetch<Tx[]>("/reports/transactions?type=BUSINESS_EXPENSE"),
   apiFetch<Tx[]>("/reports/transactions?type=PERSONAL_EXPENSE"),
   apiFetch<Category[]>("/settings/expense-categories?includeInactive=true"),
  ]).then(([business,personal,cats])=>{setTransactions([...business,...personal].sort((a,b)=>new Date(b.transactionAt).getTime()-new Date(a.transactionAt).getTime()));setCategories(cats);})
   .catch(e=>setError(e instanceof Error?e.message:"Failed to load expenses")).finally(()=>setLoading(false));
 },[]);

 const categoryById=useMemo(()=>new Map(categories.map(x=>[x.id,x.name])),[categories]);
 const filtered=useMemo(()=>{
  const now=new Date();
  const cutoff=period==="ALL"||period==="CUSTOM"?0:period==="30D"?now.getTime()-30*86400000:period==="90D"?now.getTime()-90*86400000:new Date(now.getFullYear(),now.getMonth()-5,1).getTime();
  const customFrom=dateFrom?new Date(dateFrom+"T00:00:00").getTime():0;
  const customTo=dateTo?new Date(dateTo+"T23:59:59.999").getTime():Number.POSITIVE_INFINITY;
  return transactions.filter(tx=>{
   const expense=tx.expense;if(!expense)return false;
   if(scope!=="COMBINED"&&expense.expenseType!==scope)return false;
   if(categoryId!=="ALL"&&expense.expenseCategoryId!==categoryId)return false;
   const when=new Date(tx.transactionAt).getTime();
   if(period==="CUSTOM")return when>=customFrom&&when<=customTo;
   return when>=cutoff;
  });
 },[transactions,scope,period,categoryId,dateFrom,dateTo]);

 const totals=useMemo(()=>{
  const now=new Date(),monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const total=filtered.reduce((s,t)=>s+Number(t.expense?.amount??t.grossAmount),0);
  const month=transactions.filter(t=>t.expense&&(scope==="COMBINED"||t.expense.expenseType===scope)&&(categoryId==="ALL"||t.expense.expenseCategoryId===categoryId)&&new Date(t.transactionAt).getTime()>=monthStart).reduce((s,t)=>s+Number(t.expense?.amount??0),0);
  const business=filtered.filter(t=>t.expense?.expenseType==="BUSINESS").reduce((s,t)=>s+Number(t.expense?.amount??0),0);
  const personal=filtered.filter(t=>t.expense?.expenseType==="PERSONAL").reduce((s,t)=>s+Number(t.expense?.amount??0),0);
  return {total,month,business,personal};
 },[filtered,transactions,scope,categoryId]);

 const byCategory=useMemo(()=>{
  const map=new Map<string,number>();
  for(const tx of filtered){const e=tx.expense;if(!e)continue;const name=categoryById.get(e.expenseCategoryId)??"Other";map.set(name,(map.get(name)??0)+Number(e.amount));}
  return [...map.entries()].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount);
 },[filtered,categoryById]);

 const monthly=useMemo(()=>{
  const latest=filtered.length?new Date(Math.max(...filtered.map(tx=>new Date(tx.transactionAt).getTime()))):new Date();
  const rows:{key:string;label:string;amount:number}[]=[];
  for(let i=5;i>=0;i--){const d=new Date(latest.getFullYear(),latest.getMonth()-i,1);rows.push({key:d.getFullYear()+"-"+d.getMonth(),label:d.toLocaleDateString("en-IN",{month:"short"}),amount:0});}
  for(const tx of filtered){const e=tx.expense;if(!e)continue;const d=new Date(tx.transactionAt),key=d.getFullYear()+"-"+d.getMonth();const row=rows.find(x=>x.key===key);if(row)row.amount+=Number(e.amount);}
  return rows.map(({label,amount})=>({label,amount}));
 },[filtered]);

 const monthCount=Math.max(1,new Set(filtered.map(t=>{const d=new Date(t.transactionAt);return d.getFullYear()+"-"+d.getMonth();})).size);
 const topCategory=byCategory[0];

 if(loading)return <AppShell><PageLoader label="Loading expenses…"/></AppShell>;
 return <AppShell><div className="page-enter mx-auto -mt-2 max-w-[1450px] space-y-3 sm:-mt-3 lg:-mt-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-[1.7rem] font-black tracking-[-.04em] sm:text-[2rem]">Expenses</h1><p className="mt-0.5 text-xs text-[var(--text-muted)]">All expenses, category mix, trend and underlying transactions.</p></div>
   <Link href="/transactions/expense" className="app-primary-button px-4 py-2.5 text-xs font-bold">+ Add expense</Link>
  </div>

  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <Surface className="p-3">
   <div className="grid gap-3 lg:grid-cols-[minmax(180px,.8fr)_minmax(330px,1.1fr)_auto] lg:items-end">
    <label className="grid gap-1"><span className="px-1 text-[10px] font-bold uppercase tracking-[.07em] text-[var(--text-muted)]">Category</span><select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"><option value="ALL">All categories</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2">
     <label className="grid gap-1"><span className="px-1 text-[10px] font-bold uppercase tracking-[.07em] text-[var(--text-muted)]">From date</span><input type="date" value={dateFrom} max={dateTo||undefined} onChange={e=>{setDateFrom(e.target.value);setPeriod("CUSTOM");}} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"/></label>
     <label className="grid gap-1"><span className="px-1 text-[10px] font-bold uppercase tracking-[.07em] text-[var(--text-muted)]">To date</span><input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>{setDateTo(e.target.value);setPeriod("CUSTOM");}} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"/></label>
    </div>
    <div className="flex flex-wrap items-center gap-1">{(["30D","90D","6M","ALL"] as Exclude<Period,"CUSTOM">[]).map(v=><button key={v} onClick={()=>{setPeriod(v);setDateFrom("");setDateTo("");}} className={"min-h-10 shrink-0 rounded-full border px-3 text-xs font-semibold "+(period===v?"border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]":"border-[var(--border)] text-[var(--text-muted)]")}>{v==="30D"?"30 days":v==="90D"?"90 days":v==="6M"?"6 months":"All"}</button>)}{period==="CUSTOM"||categoryId!=="ALL"?<button onClick={()=>{setCategoryId("ALL");setPeriod("90D");setDateFrom("");setDateTo("");}} className="min-h-10 rounded-full px-3 text-xs font-bold text-[var(--accent)]">Reset</button>:null}</div>
   </div>
  </Surface>

  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
   <Surface className="expense-kpi p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Total expenses</p><p className="money mt-2 text-xl font-black text-[var(--money-out)] sm:text-2xl">{money(totals.total)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{filtered.length} transaction{filtered.length===1?"":"s"}</p></Surface>
   <Surface className="expense-kpi p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">This month</p><p className="money mt-2 text-xl font-black sm:text-2xl">{money(totals.month)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Current calendar month</p></Surface>
   <Surface className="expense-kpi p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Average / month</p><p className="money mt-2 text-xl font-black sm:text-2xl">{money(totals.total/monthCount)}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Across selected range</p></Surface>
   <Surface className="expense-kpi p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Top category</p><p className="mt-2 truncate text-lg font-black sm:text-xl">{topCategory?.name??"—"}</p><p className="money mt-1 text-[10px] text-[var(--text-muted)]">{topCategory?money(topCategory.amount):"No spending yet"}</p></Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
   <Surface className="dashboard-panel p-4 sm:p-5"><div className="mb-4"><p className="dashboard-kicker">Category mix</p><h2 className="mt-1 text-base font-bold">Where the money went</h2></div>{byCategory.length?<ExpenseDonut rows={byCategory}/>:<EmptyState title="No expense data in this range"/>}</Surface>
   <Surface className="dashboard-panel p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><p className="dashboard-kicker">Trend</p><h2 className="mt-1 text-base font-bold">Monthly expense movement</h2></div><span className="text-[10px] text-[var(--text-muted)]">Last 6 months</span></div><MonthlyChart rows={monthly}/></Surface>
  </div>

  <div className="grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header border-b border-[var(--border)] px-4 py-3.5"><p className="dashboard-kicker">Simple view</p><h2 className="mt-1 text-base font-bold">Category table</h2></div>
    {byCategory.length?<div className="divide-y divide-[var(--border)]">{byCategory.map((row,i)=><div key={row.name} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><i className="h-3 w-3 shrink-0 rounded-full" style={{background:palette[i%palette.length]}}/><span className="truncate text-sm font-semibold">{row.name}</span></div><div className="text-right"><strong className="money text-sm">{money(row.amount)}</strong><p className="text-[10px] text-[var(--text-muted)]">{totals.total?((row.amount/totals.total)*100).toFixed(0):0}%</p></div></div>)}</div>:<div className="p-4"><EmptyState title="No categories to show"/></div>}

   </Surface>

   <Surface className="dashboard-panel overflow-hidden"><div className="app-panel-header flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><div><p className="dashboard-kicker">Transactions</p><h2 className="mt-1 text-base font-bold">Expense ledger</h2></div><Link href="/transactions" className="text-xs font-bold text-[var(--accent)]">All activity</Link></div>
    {filtered.length?<><div className="md:hidden divide-y divide-[var(--border)]">{filtered.slice(0,20).map(tx=><Link key={tx.id} href={"/transactions/"+tx.id} className="block px-4 py-3.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{tx.expense?.description??"Expense"}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{categoryById.get(tx.expense?.expenseCategoryId??"")??"Other"} · {new Date(tx.transactionAt).toLocaleDateString("en-IN")}</p></div><strong className="money shrink-0 text-sm text-[var(--money-out)]">{money(tx.expense?.amount??tx.grossAmount)}</strong></div></Link>)}</div>
     <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-xs"><thead className="bg-[var(--surface-soft)] text-left text-[10px] uppercase tracking-[.06em] text-[var(--text-muted)]"><tr><th className="px-4 py-3">Date</th><th>Particulars</th><th>Category</th><th>Reference</th><th className="pr-4 text-right">Amount</th></tr></thead><tbody>{filtered.slice(0,100).map(tx=><tr key={tx.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 text-[var(--text-muted)]">{new Date(tx.transactionAt).toLocaleDateString("en-IN")}</td><td><Link href={"/transactions/"+tx.id} className="font-bold text-[var(--accent)]">{tx.expense?.description??tx.transactionNumber}</Link></td><td>{categoryById.get(tx.expense?.expenseCategoryId??"")??"Other"}</td><td className="text-[var(--text-muted)]">{tx.referenceNumber??"—"}</td><td className="money pr-4 text-right font-bold text-[var(--money-out)]">{money(tx.expense?.amount??tx.grossAmount)}</td></tr>)}</tbody></table></div>
    </>:<div className="p-4"><EmptyState title="No expenses in this range" description="Change the filter or record a new expense."/></div>}
   </Surface>
  </div>
 </div></AppShell>;
}
