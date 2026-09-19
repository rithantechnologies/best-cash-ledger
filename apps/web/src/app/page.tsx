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
type Account={
  id:string;accountName:string;accountType:string;currentBalance:number;isActive:boolean;
  usageType?:string;bankName?:string|null;lastFourDigits?:string|null;
};
type Today={
  cashIn:number;cashOut:number;bankIn:number;bankOut:number;walletIn:number;walletOut:number;upiIn:number;upiOut:number;
  commission:number;businessExpense:number;personalExpense:number;
};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;customer:{fullName:string}};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type CashSession={id:string;status:string;cashAccount:{accountName:string};denominationCounts:Count[]};
type Trend={date:string;netPosition:number};
type InsightBucket={label:string;amount:number;count:number};
type Insights={receivables:InsightBucket[];payables:InsightBucket[]};
type Category={id:string;name:string;expenseUsage:string};
type ExpenseTx={
  id:string;transactionNumber:string;transactionAt:string;grossAmount:string;netAmount:string|null;
  expense:{expenseCategoryId:string;expenseType:string;amount:string;description:string}|null;
};

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const compact=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",notation:"compact",maximumFractionDigits:1}).format(v);
const shortDate=(v:string)=>new Date(v).toLocaleDateString("en-IN",{day:"2-digit",month:"short"});
const titleCase=(v:string)=>v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

type IconName="bank"|"wallet"|"receive"|"pay"|"cash"|"net"|"expense"|"card"|"upi"|"chart";
function Icon({name}:{name:IconName}){
  const paths:Record<IconName,ReactNode>={
    bank:<><path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 19h18M12 3 3 8h18z"/></>,
    wallet:<><path d="M4 7h14v12H4z"/><path d="M4 7V5h12"/><path d="M15 11h6v5h-6z"/></>,
    receive:<><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6"/><path d="M18 5v8m-3-3 3 3 3-3"/></>,
    pay:<><rect x="4" y="4" width="14" height="16" rx="2"/><path d="M8 8h6M8 12h4"/><path d="M17 13v7m-3-4 3 4 3-4"/></>,
    cash:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
    net:<><path d="M4 19V9M10 19V4M16 19v-7M22 19H2"/></>,
    expense:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="M16 14v4M14 16h4"/></>,
    card:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></>,
    upi:<><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M10 17h4"/></>,
    chart:<><path d="M4 18 9 13l4 3 7-9"/><path d="M15 7h5v5"/></>,
  };
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function KpiCard({label,value,href,icon,tone,meta}:{label:string;value:number;href:string;icon:IconName;tone:string;meta?:string}){
  return <Link href={href} className={"neon-kpi neon-kpi-"+tone}>
    <div className="neon-kpi-top"><span className="neon-kpi-icon"><Icon name={icon}/></span><span className="neon-kpi-label">{label}</span></div>
    <strong className="neon-kpi-value money">{money(value)}</strong>
    <div className="neon-kpi-foot"><span>{meta||"View details"}</span><i/></div>
  </Link>;
}

function Card({title,href,children,badge,className=""}:{title:string;href?:string;children:ReactNode;badge?:string;className?:string}){
  return <section className={"neon-panel "+className}>
    <header className="neon-panel-head">
      <h2>{title}</h2>
      <div className="flex items-center gap-2">{badge?<span className="neon-badge">{badge}</span>:null}{href?<Link href={href}>View all</Link>:null}</div>
    </header>
    {children}
  </section>;
}

function Donut({items,total,label}:{items:{label:string;value:number;color:string}[];total:number;label:string}){
  const positive=items.filter(x=>x.value>0);
  const sum=positive.reduce((s,x)=>s+x.value,0);
  const stops=positive.map((item,index)=>{
    const before=positive.slice(0,index).reduce((s,x)=>s+x.value,0);
    return item.color+" "+(sum?before/sum*100:0)+"% "+(sum?(before+item.value)/sum*100:0)+"%";
  }).join(",");
  return <div className="neon-donut-layout">
    <div className="neon-donut" style={{background:sum?"conic-gradient("+stops+")":"#11263d"}}>
      <div><strong className="money">{compact(total)}</strong><span>{label}</span></div>
    </div>
    <div className="neon-donut-legend">{items.slice(0,5).map(item=><div key={item.label}><span><i style={{background:item.color}}/>{item.label}</span><strong className="money">{compact(item.value)}</strong></div>)}</div>
  </div>;
}

function LineChart({values,labels,color="#22d3ee"}:{values:number[];labels:string[];color?:string}){
  const w=420,h=142,p=12,min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1;
  const pts=values.map((value,index)=>({x:p+(values.length<=1?0:index*(w-p*2)/(values.length-1)),y:h-p-((value-min)/range)*(h-p*2)}));
  const path=pts.map((pt,index)=>(index?"L":"M")+pt.x.toFixed(1)+" "+pt.y.toFixed(1)).join(" ");
  const area=pts.length?path+" L "+pts[pts.length-1].x+" "+(h-p)+" L "+pts[0].x+" "+(h-p)+" Z":"";
  if(!values.length)return <EmptyState title="No trend yet"/>;
  return <svg viewBox={"0 0 "+w+" "+h} className="neon-line-chart" aria-label="Trend chart">
    {[.25,.5,.75].map(n=><line key={n} x1={p} x2={w-p} y1={p+n*(h-p*2)} y2={p+n*(h-p*2)} stroke="#173958" strokeDasharray="4 6"/>)}
    <path d={area} fill={color} opacity=".08"/>
    <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    {pts.map((pt,index)=><g key={index}><circle cx={pt.x} cy={pt.y} r="3.2" fill={color}/><text x={pt.x} y={h-1} textAnchor="middle" fontSize="8" fill="#7792ad">{labels[index]||""}</text></g>)}
  </svg>;
}

function Bars({items}:{items:{label:string;amount:number;count:number}[]}){
  const max=Math.max(1,...items.map(x=>x.amount));
  const colors=["#2fe6a4","#2f8cff","#ff9f43","#ff5876"];
  return <div className="neon-bars">{items.slice(0,4).map((item,index)=><div key={item.label} className="neon-bar-col">
    <strong className="money">{compact(item.amount)}</strong>
    <div className="neon-bar-track"><i style={{height:Math.max(item.amount?8:0,item.amount/max*100)+"%",background:colors[index%colors.length]}}/></div>
    <span>{item.label}</span>
  </div>)}</div>;
}

function DataRow({href,name,meta,value,tone}:{href:string;name:string;meta?:string;value:number|string;tone?:string}){
  return <Link href={href} className="neon-row">
    <div className="min-w-0"><p>{name}</p>{meta?<small>{meta}</small>:null}</div>
    <strong className={"money "+(tone?"neon-value-"+tone:"")}>{money(value)}</strong>
  </Link>;
}

export default function DashboardPage(){
  const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
  const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
  const [insights,setInsights]=useState<Insights|null>(null),[counter,setCounter]=useState<CashSession|null>(null),[cashHistory,setCashHistory]=useState<CashSession[]>([]);
  const [categories,setCategories]=useState<Category[]>([]),[personalTx,setPersonalTx]=useState<ExpenseTx[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [expenseCategoryId,setExpenseCategoryId]=useState(""),[expenseAccountId,setExpenseAccountId]=useState(""),[expenseAmount,setExpenseAmount]=useState(""),[expenseDescription,setExpenseDescription]=useState("");
  const [savingExpense,setSavingExpense]=useState(false),[expenseMessage,setExpenseMessage]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [s,a,t,p,r,tr,oi,c,h,cats,pt]=await Promise.all([
        apiFetch<Summary>("/dashboard/summary"),
        apiFetch<Account[]>("/dashboard/accounts"),
        apiFetch<Today>("/dashboard/today"),
        apiFetch<Payable[]>("/dashboard/payables"),
        apiFetch<Receivable[]>("/dashboard/receivables"),
        apiFetch<Trend[]>("/dashboard/position-trend"),
        apiFetch<Insights>("/dashboard/obligation-insights"),
        apiFetch<CashSession|null>("/cash-counter/current"),
        apiFetch<CashSession[]>("/cash-counter/history"),
        apiFetch<Category[]>("/settings/expense-categories"),
        apiFetch<ExpenseTx[]>("/reports/transactions?type=PERSONAL_EXPENSE"),
      ]);
      setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);setInsights(oi);setCounter(c);setCashHistory(h);setCategories(cats);setPersonalTx(pt);
      const personalCategories=cats.filter(x=>x.expenseUsage==="PERSONAL"||x.expenseUsage==="MIXED");
      const paymentAccounts=a.filter(x=>x.isActive&&x.usageType!=="BUSINESS"&&["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(x.accountType));
      setExpenseCategoryId(current=>current||personalCategories[0]?.id||"");
      setExpenseAccountId(current=>current||paymentAccounts[0]?.id||"");
    }catch(e){setError(e instanceof Error?e.message:"Failed to load dashboard");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);

  if(loading)return <AppShell><PageLoader label="Loading dashboard…"/></AppShell>;
  if(error||!summary||!today)return <AppShell><div className="neon-error"><p>Dashboard could not load</p><span>{error}</span><button onClick={load}>Retry</button></div></AppShell>;

  const banks=accounts.filter(a=>a.isActive&&["BANK","UPI","OWNER_CREDIT_CARD"].includes(a.accountType)).sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
  const wallets=accounts.filter(a=>a.isActive&&a.accountType==="PROVIDER_WALLET").sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance));
  const cashSnapshot=counter??cashHistory[0]??null;
  const countType=cashSnapshot?.status==="OPEN"?"OPENING":"CLOSING";
  const denominations=(cashSnapshot?.denominationCounts??[]).filter(x=>x.countType===countType).sort((a,b)=>Number(b.denomination)-Number(a.denomination));
  const personalCategories=categories.filter(x=>x.expenseUsage==="PERSONAL"||x.expenseUsage==="MIXED");
  const paymentAccounts=accounts.filter(x=>x.isActive&&x.usageType!=="BUSINESS"&&["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(x.accountType));
  const categoryMap=new Map(categories.map(x=>[x.id,x.name]));

  const walletColors=["#8b5cf6","#2f8cff","#2fe6a4","#ff9f43","#ff5876","#7189a5"];
  const walletTop=wallets.slice(0,4).map((x,index)=>({label:x.accountName,value:Math.max(0,x.currentBalance),color:walletColors[index]}));
  const walletOther=wallets.slice(4).reduce((sum,x)=>sum+Math.max(0,x.currentBalance),0);
  const walletDonut=[...walletTop,...(walletOther?[{label:"Others",value:walletOther,color:walletColors[5]}]:[])];

  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const thisMonthPersonal=personalTx.filter(tx=>new Date(tx.transactionAt).getTime()>=monthStart);
  const expenseByCategory=new Map<string,number>();
  for(const tx of thisMonthPersonal){
    if(!tx.expense)continue;
    const name=categoryMap.get(tx.expense.expenseCategoryId)||"Other";
    expenseByCategory.set(name,(expenseByCategory.get(name)||0)+Number(tx.expense.amount||0));
  }
  const expensePalette=["#2f8cff","#8b5cf6","#ff9f43","#2fe6a4","#94a3b8","#ff5876"];
  const expenseDonut=[...expenseByCategory.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value],index)=>({label:name,value,color:expensePalette[index%expensePalette.length]}));
  const personalMonthTotal=expenseDonut.reduce((sum,x)=>sum+x.value,0);

  const monthRows:Array<{key:string;label:string;amount:number}>=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);monthRows.push({key:d.getFullYear()+"-"+d.getMonth(),label:d.toLocaleDateString("en-IN",{month:"short"}),amount:0});}
  for(const tx of personalTx){const d=new Date(tx.transactionAt),key=d.getFullYear()+"-"+d.getMonth();const row=monthRows.find(x=>x.key===key);if(row&&tx.expense)row.amount+=Number(tx.expense.amount||0);}

  const recentPersonal=[...personalTx].filter(x=>x.expense).sort((a,b)=>new Date(b.transactionAt).getTime()-new Date(a.transactionAt).getTime()).slice(0,5);
  const receivableBuckets=insights?.receivables??[];
  const payableBuckets=insights?.payables??[];
  const netMovement=trend.length>1?trend[trend.length-1].netPosition-trend[0].netPosition:0;

  async function addPersonalExpense(e:FormEvent){
    e.preventDefault();
    const amount=Number(expenseAmount);
    if(!expenseCategoryId||!expenseAccountId||amount<=0||!expenseDescription.trim()){setExpenseMessage("Complete all fields.");return;}
    setSavingExpense(true);setExpenseMessage("");
    try{
      await apiFetch("/transactions/expense",{method:"POST",body:JSON.stringify({
        expenseType:"PERSONAL",expenseCategoryId,amount,paymentAccountId:expenseAccountId,description:expenseDescription.trim(),
      })});
      setExpenseAmount("");setExpenseDescription("");setExpenseMessage("Expense added.");await load();
    }catch(e){setExpenseMessage(e instanceof Error?e.message:"Could not add expense.");}
    finally{setSavingExpense(false);}
  }

  return <AppShell><div className="neon-dashboard mx-auto max-w-[1600px]">
    <div className="neon-dashboard-head">
      <div><h1>Welcome back</h1><p>Your complete money picture — all in one place.</p></div>
      <div className="neon-period"><span>{now.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span><small>Live balances</small></div>
    </div>

    <div className="neon-kpi-grid">
      <KpiCard label="Bank" value={summary.bankBalance} href="/accounts?type=BANK" icon="bank" tone="pink" meta={banks.filter(x=>x.accountType==="BANK").length+" accounts"}/>
      <KpiCard label="Wallet" value={summary.walletBalance} href="/accounts?type=PROVIDER_WALLET" icon="wallet" tone="violet" meta={wallets.length+" wallets"}/>
      <KpiCard label="Receivable" value={summary.customerReceivable} href="/receivables" icon="receive" tone="green" meta={summary.receivableBreakdown.overdueCount+" overdue"}/>
      <KpiCard label="Payable" value={summary.customerPayable} href="/payables" icon="pay" tone="orange" meta={summary.payableBreakdown.dueTodayCount+" due today"}/>
      <KpiCard label="Cash" value={summary.cashBalance} href="/cash-counter" icon="cash" tone="blue" meta={counter?"Counter open":"Ledger balance"}/>
      <KpiCard label="Net Balance" value={summary.netFinancialPosition} href="/reports" icon="net" tone="cyan" meta={(netMovement>=0?"+":"")+money(netMovement)+" · 10 days"}/>
    </div>

    <div className="neon-chart-grid">
      <Card title="Net Position Trend" href="/reports" badge="10 days">
        <div className="neon-chart-number"><strong className="money">{money(summary.netFinancialPosition)}</strong><span className={netMovement<0?"down":"up"}>{netMovement>=0?"+":""}{money(netMovement)}</span></div>
        <LineChart values={trend.map(x=>x.netPosition)} labels={trend.map(x=>x.date.slice(5))}/>
      </Card>
      <Card title="Wallet Distribution" href="/accounts?type=PROVIDER_WALLET">
        <Donut items={walletDonut} total={summary.walletBalance} label="Wallet balance"/>
      </Card>
      <Card title="Receivable Aging" href="/receivables">
        {receivableBuckets.length?<Bars items={receivableBuckets}/>:<EmptyState title="No receivable aging yet"/>}
      </Card>
      <Card title="Expense Categories" href="/expenses" badge="This month">
        {expenseDonut.length?<Donut items={expenseDonut} total={personalMonthTotal} label="Personal expense"/>:<EmptyState title="No personal expenses this month"/>}
      </Card>
    </div>

    <div className="neon-table-grid">
      <Card title="Bank / UPI / Cards" href="/accounts" className="neon-table-card">
        <div className="neon-table-head"><span>Account</span><span>Type</span><span>Balance</span></div>
        <div className="neon-table-body">{banks.slice(0,8).map(a=><Link key={a.id} href={"/accounts/"+a.id} className="neon-table-row"><span>{a.accountName}</span><em>{a.accountType==="OWNER_CREDIT_CARD"?"Card":titleCase(a.accountType)}</em><strong className="money">{money(a.currentBalance)}</strong></Link>)}</div>
        <div className="neon-table-total"><span>Total bank + UPI</span><strong className="money">{money(summary.bankBalance+summary.upiBalance)}</strong></div>
      </Card>

      <Card title="Wallet Balances" href="/accounts?type=PROVIDER_WALLET" className="neon-table-card">
        <div className="neon-table-head neon-two-col"><span>Wallet</span><span>Balance</span></div>
        <div className="neon-table-body">{wallets.slice(0,8).map(a=><DataRow key={a.id} href={"/accounts/"+a.id} name={a.accountName} value={a.currentBalance}/>)}</div>
        <div className="neon-table-total neon-total-violet"><span>Total</span><strong className="money">{money(summary.walletBalance)}</strong></div>
      </Card>

      <Card title="Receivables" href="/receivables" className="neon-table-card">
        <div className="neon-table-head neon-two-col"><span>Customer</span><span>Amount</span></div>
        <div className="neon-table-body">{receivables.slice(0,8).map(r=><DataRow key={r.id} href={"/receivables/"+r.id} name={r.customer.fullName} meta={r.dueAt?"Due "+shortDate(r.dueAt):undefined} value={r.remainingAmount} tone={r.bucket==="OVERDUE"?"red":"green"}/>)}</div>
        <div className="neon-table-total neon-total-green"><span>Total</span><strong className="money">{money(summary.customerReceivable)}</strong></div>
      </Card>

      <Card title="Payables" href="/payables" className="neon-table-card">
        <div className="neon-table-head neon-two-col"><span>Particulars</span><span>Amount</span></div>
        <div className="neon-table-body">{payables.slice(0,8).map(p=><DataRow key={p.id} href={"/payables/"+p.id} name={p.customer.fullName} meta={"Due "+shortDate(p.dueAt)} value={p.remainingAmount} tone={p.bucket==="OVERDUE"?"red":"orange"}/>)}</div>
        <div className="neon-table-total neon-total-orange"><span>Total</span><strong className="money">{money(summary.customerPayable)}</strong></div>
      </Card>

      <Card title="Cash Denominations" href="/cash-counter" className="neon-table-card">
        <div className="neon-cash-head"><span>Note</span><span>Count</span><span>Amount</span></div>
        <div className="neon-cash-body">{denominations.slice(0,7).map(x=><div key={x.denomination}><span>₹ {Number(x.denomination)}</span><span>{x.quantity}</span><strong className="money">{money(x.totalAmount)}</strong></div>)}</div>
        <div className="neon-table-total neon-total-blue"><span>Total cash</span><strong className="money">{money(summary.cashBalance)}</strong></div>
      </Card>
    </div>

    <div className="neon-bottom-grid">
      <Card title="Payable Due Timeline" href="/payables">
        {payableBuckets.length?<Bars items={payableBuckets}/>:<EmptyState title="No payable timeline yet"/>}
      </Card>

      <Card title="Monthly Personal Expense" href="/expenses" badge="6 months">
        <div className="neon-chart-number"><strong className="money">{money(personalMonthTotal)}</strong><span>This month</span></div>
        <LineChart values={monthRows.map(x=>x.amount)} labels={monthRows.map(x=>x.label)} color="#2fe6a4"/>
      </Card>

      <Card title="Quick Add Personal Expense" className="neon-expense-card">
        <form onSubmit={addPersonalExpense} className="neon-expense-form">
          <label>Category<select value={expenseCategoryId} onChange={e=>setExpenseCategoryId(e.target.value)} required><option value="">Select</option>{personalCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Amount<input type="number" min="0.01" step="0.01" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)} placeholder="₹ 0" required/></label>
          <label>Paid from<select value={expenseAccountId} onChange={e=>setExpenseAccountId(e.target.value)} required><option value="">Select</option>{paymentAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</select></label>
          <label className="neon-expense-desc">Description<input value={expenseDescription} onChange={e=>setExpenseDescription(e.target.value)} placeholder="e.g. Chennai trip - cab" required/></label>
          {expenseMessage?<p className="neon-expense-message">{expenseMessage}</p>:null}
          <button disabled={savingExpense}>{savingExpense?"Adding…":"+ Add Expense"}</button>
        </form>
      </Card>

      <Card title="Recent Personal Expenses" href="/expenses">
        <div className="neon-personal-list">{recentPersonal.length?recentPersonal.map(tx=><Link key={tx.id} href={"/transactions/"+tx.id}><span>{shortDate(tx.transactionAt)}</span><p>{tx.expense?.description||"Personal expense"}<small>{tx.expense?categoryMap.get(tx.expense.expenseCategoryId)||"Other":""}</small></p><strong className="money">{money(tx.expense?.amount||tx.grossAmount)}</strong></Link>):<EmptyState title="No personal expenses yet"/>}</div>
      </Card>
    </div>
  </div></AppShell>;
}
