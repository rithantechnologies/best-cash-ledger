"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Breakdown={dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number};
type Summary={
  cashBalance:number;bankBalance:number;upiBalance:number;walletBalance:number;availableFunds:number;
  customerPayable:number;customerReceivable:number;pendingProviderSettlements:number;pendingProviderSettlementCount:number;
  netFinancialPosition:number;creditCardOutstanding:number;creditCardAvailable:number;
  payableBreakdown:Breakdown;receivableBreakdown:Breakdown;
};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean;usageType?:string};
type Today={cashIn:number;cashOut:number;bankIn:number;bankOut:number;walletIn:number;walletOut:number;upiIn:number;upiOut:number;commission:number;businessExpense:number;personalExpense:number};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;customer:{fullName:string}};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type CashSession={id:string;status:string;cashAccount:{accountName:string};denominationCounts:Count[]};
type Trend={date:string;netPosition:number};
type Category={id:string;name:string;expenseUsage:string};
type ExpenseTx={id:string;transactionAt:string;grossAmount:string;expense:{expenseCategoryId:string;expenseType:string;amount:string;description:string}|null};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const compact=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",notation:"compact",maximumFractionDigits:1}).format(v);
const shortDate=(v:string)=>new Date(v).toLocaleDateString("en-IN",{day:"2-digit",month:"short"});

type IconName="bank"|"wallet"|"receive"|"pay"|"cash"|"net"|"expense"|"card"|"upi"|"chart";
function Icon({name}:{name:IconName}){
  const p:Record<IconName,ReactNode>={
    bank:<><path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 19h18M12 3 3 8h18z"/></>,
    wallet:<><path d="M4 7h14v12H4z"/><path d="M4 7V5h12"/><path d="M15 11h6v5h-6z"/></>,
    receive:<><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6"/><path d="M18 5v8m-3-3 3 3 3-3"/></>,
    pay:<><rect x="4" y="4" width="14" height="16" rx="2"/><path d="M8 8h6M8 12h4"/><path d="M17 13v7m-3-4 3 4 3-4"/></>,
    cash:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
    net:<><path d="M4 19V9M10 19V4M16 19v-7M22 19H2"/></>,
    expense:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/></>,
    card:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></>,
    upi:<><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M10 17h4"/></>,
    chart:<><path d="M4 18 9 13l4 3 7-9"/><path d="M15 7h5v5"/></>,
  };
  return <svg viewBox="0 0 24 24" className="ref-icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>;
}

function Kpi({label,value,icon,tone,href,meta}:{label:string;value:number;icon:IconName;tone:string;href:string;meta:string}){
  return <Link href={href} className={"ref-kpi ref-"+tone}>
    <div className="ref-kpi-title"><span><Icon name={icon}/></span><b>{label}</b><i>›</i></div>
    <strong className="money">{money(value)}</strong>
    <small>{meta}</small>
  </Link>;
}

function Panel({title,icon,href,children,className=""}:{title:string;icon?:IconName;href?:string;children:ReactNode;className?:string}){
  return <section className={"ref-panel "+className}>
    <header><div>{icon?<span className="ref-panel-icon"><Icon name={icon}/></span>:null}<h2>{title}</h2></div>{href?<Link href={href}>View all</Link>:null}</header>
    {children}
  </section>;
}

function Donut({items,total,label}:{items:{label:string;value:number;color:string}[];total:number;label:string}){
  const rows=items.filter(x=>x.value>0);
  const sum=rows.reduce((s,x)=>s+x.value,0);
  const stops=rows.map((x,i)=>{const before=rows.slice(0,i).reduce((s,r)=>s+r.value,0);return x.color+" "+(sum?before/sum*100:0)+"% "+(sum?(before+x.value)/sum*100:0)+"%";}).join(",");
  return <div className="ref-donut-wrap">
    <div className="ref-donut" style={{background:sum?"conic-gradient("+stops+")":"var(--surface-soft)"}}><div><strong className="money">{compact(total)}</strong><span>{label}</span></div></div>
    <div className="ref-legend">{rows.slice(0,5).map(x=><div key={x.label}><span><i style={{background:x.color}}/>{x.label}</span><b>{sum?Math.round(x.value/sum*100):0}%</b></div>)}</div>
  </div>;
}

function BarChart({rows}:{rows:{label:string;value:number}[]}){
  const max=Math.max(1,...rows.map(x=>x.value));
  return <div className="ref-bars">{rows.slice(0,4).map(x=><div key={x.label}><b className="money">{compact(x.value)}</b><span><i style={{height:Math.max(x.value?8:0,x.value/max*100)+"%"}}/></span><small>{x.label}</small></div>)}</div>;
}

function LineChart({values,labels}:{values:number[];labels:string[]}){
  if(values.length<2)return <EmptyState title="No trend yet"/>;
  const w=520,h=150,p=15,min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1;
  const pts=values.map((v,i)=>({x:p+i*(w-p*2)/(values.length-1),y:h-p-((v-min)/range)*(h-p*2)}));
  const path=pts.map((q,i)=>(i?"L":"M")+q.x.toFixed(1)+" "+q.y.toFixed(1)).join(" ");
  const area=path+" L "+pts[pts.length-1].x+" "+(h-p)+" L "+pts[0].x+" "+(h-p)+" Z";
  return <svg viewBox={"0 0 "+w+" "+h} className="ref-line-chart" aria-label="Monthly expense trend">
    {[.25,.5,.75].map(n=><line key={n} x1={p} x2={w-p} y1={p+n*(h-p*2)} y2={p+n*(h-p*2)} stroke="var(--ref-grid)" strokeWidth="1"/>)}
    <path d={area} fill="var(--ref-blue)" opacity=".08"/><path d={path} fill="none" stroke="var(--ref-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    {pts.map((q,i)=><g key={i}><circle cx={q.x} cy={q.y} r="4" fill="var(--ref-blue)"/><text x={q.x} y={h-1} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{labels[i]}</text></g>)}
  </svg>;
}

function TableRow({href,name,meta,value,tone}:{href:string;name:string;meta?:string;value:number|string;tone?:string}){
  return <Link href={href} className="ref-row"><div><b>{name}</b>{meta?<small>{meta}</small>:null}</div><strong className={"money "+(tone?"ref-value-"+tone:"")}>{money(value)}</strong><span>›</span></Link>;
}

export default function DashboardPage(){
  const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
  const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
  const [counter,setCounter]=useState<CashSession|null>(null),[cashHistory,setCashHistory]=useState<CashSession[]>([]);
  const [categories,setCategories]=useState<Category[]>([]),[personalTx,setPersonalTx]=useState<ExpenseTx[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[viewer,setViewer]=useState("");
  const [categoryId,setCategoryId]=useState(""),[accountId,setAccountId]=useState(""),[amount,setAmount]=useState(""),[description,setDescription]=useState("");
  const [saving,setSaving]=useState(false),[message,setMessage]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [s,a,t,p,r,tr,c,h,cats,pt]=await Promise.all([
        apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
        apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),apiFetch<Trend[]>("/dashboard/position-trend"),
        apiFetch<CashSession|null>("/cash-counter/current"),apiFetch<CashSession[]>("/cash-counter/history"),
        apiFetch<Category[]>("/settings/expense-categories"),apiFetch<ExpenseTx[]>("/reports/transactions?type=PERSONAL_EXPENSE"),
      ]);
      setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);setCounter(c);setCashHistory(h);setCategories(cats);setPersonalTx(pt);
      const pc=cats.filter(x=>x.expenseUsage==="PERSONAL"||x.expenseUsage==="MIXED");
      const pa=a.filter(x=>x.isActive&&x.usageType!=="BUSINESS");
      setCategoryId(v=>v||pc[0]?.id||"");setAccountId(v=>v||pa[0]?.id||"");
    }catch(e){setError(e instanceof Error?e.message:"Failed to load dashboard");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{try{const u=JSON.parse(localStorage.getItem("cashledger_user")||"{}");setViewer((u.fullName||u.name||"").split(" ")[0]||"");}catch{}load();},[load]);

  if(loading)return <AppShell><PageLoader label="Loading dashboard…"/></AppShell>;
  if(error||!summary||!today)return <AppShell><div className="mx-auto max-w-md py-20 text-center"><p className="font-bold">Dashboard could not load</p><p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p></div></AppShell>;

  const banks=accounts.filter(x=>x.isActive&&["BANK","UPI","OWNER_CREDIT_CARD"].includes(x.accountType)).sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
  const wallets=accounts.filter(x=>x.isActive&&x.accountType==="PROVIDER_WALLET").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
  const cashSnapshot=counter??cashHistory[0]??null;
  const countType=cashSnapshot?.status==="OPEN"?"OPENING":"CLOSING";
  const denominations=(cashSnapshot?.denominationCounts??[]).filter(x=>x.countType===countType).sort((a,b)=>Number(b.denomination)-Number(a.denomination));
  const personalCategories=categories.filter(x=>x.expenseUsage==="PERSONAL"||x.expenseUsage==="MIXED");
  const paymentAccounts=accounts.filter(x=>x.isActive&&x.usageType!=="BUSINESS"&&["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(x.accountType));
  const categoryMap=new Map(categories.map(x=>[x.id,x.name]));
  const now=new Date(),monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const thisMonth=personalTx.filter(x=>x.expense&&new Date(x.transactionAt).getTime()>=monthStart);
  const expMap=new Map<string,number>();
  for(const tx of thisMonth){if(!tx.expense)continue;const name=categoryMap.get(tx.expense.expenseCategoryId)||"Other";expMap.set(name,(expMap.get(name)||0)+Number(tx.expense.amount));}
  const palette=["#2088ff","#8957f6","#ffb33c","#27c99a","#94a3b8","#ff5d86"];
  const expenseItems=[...expMap.entries()].sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:palette[i%palette.length]}));
  const monthTotal=expenseItems.reduce((s,x)=>s+x.value,0);
  const walletItems=wallets.slice(0,5).map((x,i)=>({label:x.accountName,value:Math.max(0,x.currentBalance),color:palette[i%palette.length]}));
  const monthRows:Array<{key:string;label:string;amount:number}>=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);monthRows.push({key:d.getFullYear()+"-"+d.getMonth(),label:d.toLocaleDateString("en-IN",{month:"short"}),amount:0});}
  for(const tx of personalTx){if(!tx.expense)continue;const d=new Date(tx.transactionAt),row=monthRows.find(x=>x.key===d.getFullYear()+"-"+d.getMonth());if(row)row.amount+=Number(tx.expense.amount);}
  const topReceivables=[...receivables].sort((a,b)=>Number(b.remainingAmount)-Number(a.remainingAmount)).slice(0,4).map(x=>({label:x.customer.fullName.split(" ")[0],value:Number(x.remainingAmount)}));
  const netMove=trend.length>1?trend[trend.length-1].netPosition-trend[0].netPosition:0;
  const greeting=now.getHours()<12?"Good morning":now.getHours()<17?"Good afternoon":"Good evening";

  async function addExpense(e:FormEvent){
    e.preventDefault();const v=Number(amount);
    if(!categoryId||!accountId||v<=0||!description.trim()){setMessage("Complete all fields.");return;}
    setSaving(true);setMessage("");
    try{await apiFetch("/transactions/expense",{method:"POST",body:JSON.stringify({expenseType:"PERSONAL",expenseCategoryId:categoryId,amount:v,paymentAccountId:accountId,description:description.trim()})});setAmount("");setDescription("");setMessage("Expense added");await load();}
    catch(e){setMessage(e instanceof Error?e.message:"Could not add expense");}finally{setSaving(false);}
  }

  return <AppShell><div className="ref-dashboard mx-auto max-w-[1600px]">
    <div className="ref-welcome"><div><h1>{greeting}{viewer?", "+viewer:""}!</h1><p>Here&apos;s your financial overview for {now.toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</p></div><span>“Good financial control leads to a brighter tomorrow.”</span></div>

    <div className="ref-kpi-grid">
      <Kpi label="Bank" value={summary.bankBalance} icon="bank" tone="pink" href="/accounts?type=BANK" meta={"Today "+money(today.bankIn-today.bankOut)}/>
      <Kpi label="Wallet" value={summary.walletBalance} icon="wallet" tone="purple" href="/accounts?type=PROVIDER_WALLET" meta={"Today "+money(today.walletIn-today.walletOut)}/>
      <Kpi label="Receivable" value={summary.customerReceivable} icon="receive" tone="green" href="/receivables" meta={summary.receivableBreakdown.overdueCount+" overdue"}/>
      <Kpi label="Payable" value={summary.customerPayable} icon="pay" tone="orange" href="/payables" meta={summary.payableBreakdown.dueTodayCount+" due today"}/>
      <Kpi label="Cash" value={summary.cashBalance} icon="cash" tone="blue" href="/cash-counter" meta={"Today "+money(today.cashIn-today.cashOut)}/>
      <Kpi label="Net Balance" value={summary.netFinancialPosition} icon="net" tone="net" href="/reports" meta={(netMove>=0?"+":"")+money(netMove)+" · 10 days"}/>
    </div>

    <div className="ref-main-grid">
      <Panel title="Bank / UPI / Cards" icon="bank" href="/accounts" className="ref-bank-panel">
        <div className="ref-table-head"><span>Account</span><span>Type</span><span>Balance</span></div>
        <div className="ref-table-list">{banks.slice(0,8).map(a=><Link key={a.id} href={"/accounts/"+a.id} className="ref-table-line"><b>{a.accountName}</b><em>{a.accountType==="OWNER_CREDIT_CARD"?"Credit Card":a.accountType}</em><strong className="money">{money(a.currentBalance)}</strong></Link>)}</div>
        <div className="ref-total"><b>Total</b><strong className="money">{money(summary.bankBalance+summary.upiBalance)}</strong></div>
      </Panel>

      <Panel title="Wallets" icon="wallet" href="/accounts?type=PROVIDER_WALLET" className="ref-wallet-panel">
        <div className="ref-table-head ref-wallet-head"><span>Wallet</span><span>Balance</span></div>
        <div className="ref-table-list">{wallets.slice(0,8).map(a=><TableRow key={a.id} href={"/accounts/"+a.id} name={a.accountName} value={a.currentBalance}/>)}</div>
        <div className="ref-total"><b>Total</b><strong className="money">{money(summary.walletBalance)}</strong></div>
      </Panel>

      <Panel title="Wallet Distribution" icon="receive" href="/accounts?type=PROVIDER_WALLET" className="ref-wallet-chart">
        <Donut items={walletItems} total={summary.walletBalance} label="Total Wallet Balance"/>
      </Panel>

      <Panel title="Personal Expenses" icon="expense" href="/expenses" className="ref-expense-chart">
        {expenseItems.length?<Donut items={expenseItems} total={monthTotal} label="This Month"/>:<EmptyState title="No expenses this month"/>}
      </Panel>

      <Panel title="Receivables (Top Customers)" icon="receive" href="/receivables" className="ref-receivable-chart">
        {topReceivables.length?<BarChart rows={topReceivables}/>:<EmptyState title="No receivables"/>}
      </Panel>

      <Panel title="Monthly Expense Trend" icon="chart" href="/expenses" className="ref-monthly-chart">
        <LineChart values={monthRows.map(x=>x.amount)} labels={monthRows.map(x=>x.label)}/>
      </Panel>

      <Panel title="Receivables" icon="receive" href="/receivables" className="ref-receivable-table">
        <div className="ref-list">{receivables.slice(0,5).map(r=><TableRow key={r.id} href={"/receivables/"+r.id} name={r.customer.fullName} meta={r.dueAt?"Due "+shortDate(r.dueAt):undefined} value={r.remainingAmount} tone={r.bucket==="OVERDUE"?"red":"green"}/>)}</div>
        <div className="ref-total"><b>Total</b><strong className="money">{money(summary.customerReceivable)}</strong></div>
      </Panel>

      <Panel title="Payables" icon="pay" href="/payables" className="ref-payable-table">
        <div className="ref-list">{payables.slice(0,5).map(p=><TableRow key={p.id} href={"/payables/"+p.id} name={p.customer.fullName} meta={"Due "+shortDate(p.dueAt)} value={p.remainingAmount} tone={p.bucket==="OVERDUE"?"red":"orange"}/>)}</div>
        <div className="ref-total"><b>Total</b><strong className="money">{money(summary.customerPayable)}</strong></div>
      </Panel>

      <Panel title="Cash Denomination" icon="cash" href="/cash-counter" className="ref-cash-table">
        <div className="ref-cash-head"><span>Note</span><span>Count</span><span>Amount</span></div>
        <div className="ref-cash-list">{denominations.slice(0,7).map(x=><div key={x.denomination}><b>₹ {Number(x.denomination)}</b><span>{x.quantity}</span><strong className="money">{money(x.totalAmount)}</strong></div>)}</div>
        <div className="ref-total"><b>Total</b><strong className="money">{money(summary.cashBalance)}</strong></div>
      </Panel>

      <Panel title="Add Personal Expense" icon="wallet" className="ref-add-expense">
        <form onSubmit={addExpense}>
          <label><span>Category</span><select value={categoryId} onChange={e=>setCategoryId(e.target.value)} required><option value="">Select</option>{personalCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="₹ 0" required/></label>
          <label><span>Paid from</span><select value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Select</option>{paymentAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></label>
          <label className="wide"><span>Remarks</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="E.g. Office rent, travel, etc." required/></label>
          {message?<p>{message}</p>:null}
          <button disabled={saving}>{saving?"Adding…":"+ Add Expense"}</button>
        </form>
      </Panel>

      <Panel title="This Month Summary" className="ref-month-summary">
        <div className="ref-summary-box"><span>Total Expenses</span><strong className="money">{money(monthTotal)}</strong></div>
        <div className="ref-summary-box"><span>Transactions</span><strong>{thisMonth.length} entries</strong></div>
      </Panel>
    </div>
  </div></AppShell>;
}
