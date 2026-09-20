"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageLoader } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Scope="ALL"|"BUSINESS"|"PERSONAL";
type Period="TODAY"|"7D"|"30D"|"THIS_MONTH"|"PREV_MONTH"|"CUSTOM";
type Breakdown={dueTodayAmount:number;dueTodayCount:number;overdueAmount:number;overdueCount:number;pendingAmount?:number;pendingCount?:number;partialAmount?:number;partialCount?:number};
type Summary={
  cashBalance:number;bankBalance:number;upiBalance:number;walletBalance:number;availableFunds:number;
  customerPayable:number;customerReceivable:number;pendingProviderSettlements:number;pendingProviderSettlementCount:number;
  operatingPosition:number;netFinancialPosition:number;creditCardOutstanding:number;creditCardAvailable:number;
  payableBreakdown:Breakdown;receivableBreakdown:Breakdown;
};
type Account={id:string;accountName:string;accountType:string;accountNature:string;currentBalance:number;isActive:boolean;usageType:string;bankName?:string|null;lastFourDigits?:string|null};
type Today={
  cashIn:number;cashOut:number;bankIn:number;bankOut:number;walletIn:number;walletOut:number;upiIn:number;upiOut:number;
  cardSwipe:number;aeps:number;microAtm:number;customerPayout:number;customerReceipt:number;receivableCreated:number;
  commission:number;providerCharges:number;businessExpense:number;personalExpense:number;
};
type Payable={id:string;remainingAmount:string;dueAt:string;bucket:string;customer:{fullName:string}};
type Receivable={id:string;remainingAmount:string;dueAt:string|null;bucket:string;customer:{fullName:string}};
type Trend={date:string;availableFunds:number;pendingProviderSettlements:number;receivables:number;payables:number;creditCardOutstanding:number;netPosition:number};
type Category={id:string;name:string;expenseUsage:string};
type ExpenseDetail={expenseCategoryId:string;expenseType:string;amount:string;description:string;paymentAccountId?:string};
type Tx={
  id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
  status:string;referenceNumber:string|null;customer:{fullName:string}|null;expense:ExpenseDetail|null;
};
type InsightBucket={label:string;amount:number;count:number};
type Insights={receivables:InsightBucket[];payables:InsightBucket[]};
type LedgerRow={
  id:string;entryType:"DEBIT"|"CREDIT";amount:string;description:string|null;runningBalance:number;
  journal:{postingDate:string;transaction:{id:string;transactionNumber:string;transactionType:string;customer:{fullName:string}|null}};
};
type AccountLedger={rows:LedgerRow[]};
type FlowEntry={
  id:string;accountId:string;accountName:string;date:string;direction:"IN"|"OUT";amount:number;
  transactionId:string;transactionNumber:string;transactionType:string;description:string|null;
};
type DetailState={kind:"category";categoryId:string}|{kind:"flow";date:string}|null;

const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const compact=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",notation:"compact",maximumFractionDigits:1}).format(Number(v||0));

const palette=["#2563eb","#0f9f79","#7c5ce5","#e7a328","#e0556f","#0f8fa8","#7d8a9a","#9a6a4c"];

function indiaKey(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get=(t:string)=>parts.find(p=>p.type===t)?.value??"";
  return get("year")+"-"+get("month")+"-"+get("day");
}
function shiftKey(key:string,days:number){
  const d=new Date(key+"T12:00:00+05:30");d.setUTCDate(d.getUTCDate()+days);return indiaKey(d);
}
function rangeDates(startKey:string,endKey:string){
  return {start:new Date(startKey+"T00:00:00+05:30"),end:new Date(endKey+"T23:59:59.999+05:30")};
}
function rangeFor(period:Period,customFrom:string,customTo:string){
  const today=indiaKey(),[y,m]=today.split("-").map(Number);
  if(period==="TODAY")return {startKey:today,endKey:today,label:"Today"};
  if(period==="7D")return {startKey:shiftKey(today,-6),endKey:today,label:"Last 7 days"};
  if(period==="30D")return {startKey:shiftKey(today,-29),endKey:today,label:"Last 30 days"};
  if(period==="THIS_MONTH")return {startKey:`${y}-${String(m).padStart(2,"0")}-01`,endKey:today,label:"This month"};
  if(period==="PREV_MONTH"){
    const first=new Date(Date.UTC(y,m-1,1,6,30)),prevLast=new Date(Date.UTC(y,m-1,0,6,30));
    return {startKey:indiaKey(first),endKey:indiaKey(prevLast),label:"Previous month"};
  }
  const from=customFrom||today,to=customTo||today;
  return {startKey:from<=to?from:to,endKey:from<=to?to:from,label:"Custom range"};
}
function previousRange(startKey:string,endKey:string){
  const days=Math.round((new Date(endKey+"T12:00:00+05:30").getTime()-new Date(startKey+"T12:00:00+05:30").getTime())/86400000)+1;
  return {startKey:shiftKey(startKey,-days),endKey:shiftKey(startKey,-1)};
}
function scopeMatchesTx(tx:Tx,scope:Scope){
  if(scope==="ALL")return true;
  if(scope==="PERSONAL")return tx.transactionType==="PERSONAL_EXPENSE";
  return tx.transactionType!=="PERSONAL_EXPENSE";
}
function scopeMatchesAccount(account:Account,scope:Scope){
  if(scope==="ALL")return true;
  if(scope==="BUSINESS")return account.usageType!=="PERSONAL";
  return account.usageType!=="BUSINESS";
}
function txLabel(type:string){return type.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}
function accountLabel(type:string){return type==="PROVIDER_WALLET"?"Provider wallet":type==="OWNER_CREDIT_CARD"?"Credit card":type;}
function activityAmount(tx:Tx){return Number(tx.expense?.amount??tx.netAmount??tx.grossAmount??0);}

type IconName="wallet"|"bank"|"cash"|"receive"|"pay"|"card"|"settle"|"expense"|"flow"|"activity"|"alert"|"arrow"|"spark";
function Icon({name,className="h-5 w-5"}:{name:IconName;className?:string}){
  const p:Record<IconName,ReactNode>={
    wallet:<><path d="M4 7h15v12H4z"/><path d="M4 7V5h12"/><path d="M15 11h6v5h-6z"/></>,
    bank:<><path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 19h18M12 3 3 8h18z"/></>,
    cash:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
    receive:<><path d="M12 3v13m-4-4 4 4 4-4"/><path d="M5 20h14"/></>,
    pay:<><path d="M12 21V8m-4 4 4-4 4 4"/><path d="M5 4h14"/></>,
    card:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></>,
    settle:<><path d="M4 7h12m-3-3 3 3-3 3M20 17H8m3-3-3 3 3 3"/></>,
    expense:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/></>,
    flow:<><path d="M3 17 8 12l4 3 8-9"/><path d="M15 6h5v5"/></>,
    activity:<><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/></>,
    alert:<><path d="M12 4 3.5 19h17z"/><path d="M12 9v4m0 3h.01"/></>,
    arrow:<><path d="M5 12h14m-5-5 5 5-5 5"/></>,
    spark:<><path d="m3 15 5-5 4 3 7-8"/><path d="M15 5h4v4"/></>,
  };
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>;
}

function Sparkline({rows}:{rows:Trend[]}){
  if(rows.length<2)return null;
  const w=420,h=92,p=6,vals=rows.map(x=>x.netPosition),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
  const pts=vals.map((v,i)=>({x:p+i*(w-p*2)/(vals.length-1),y:h-p-(v-min)/span*(h-p*2)}));
  const line=pts.map((q,i)=>(i?"L":"M")+q.x.toFixed(1)+" "+q.y.toFixed(1)).join(" ");
  const area=line+` L ${pts.at(-1)?.x} ${h} L ${pts[0].x} ${h} Z`;
  return <svg viewBox={`0 0 ${w} ${h}`} className="fc-hero-spark" role="img" aria-label="10 day net financial position trend">
    <defs><linearGradient id="fcHeroArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
    <path d={area} fill="url(#fcHeroArea)"/><path d={line} pathLength="1" className="fc-draw-line" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function ExpenseDonut({rows,onSelect}:{rows:{id:string;name:string;amount:number;percent:number}[];onSelect:(id:string)=>void}){
  const [hovered,setHovered]=useState<string|null>(null);
  const focus=rows.find(x=>x.id===hovered)??rows[0];

  return <div className="fc-donut-layout">
    <div className="fc-donut-shell">
      <svg viewBox="0 0 200 200" className="fc-donut-svg" aria-label="Expense category distribution">
        <circle cx="100" cy="100" r="72" fill="none" stroke="var(--surface-soft)" strokeWidth="24"/>
        {rows.map((row,i)=>{const start=rows.slice(0,i).reduce((s,x)=>s+x.percent,0);return <circle key={row.id} cx="100" cy="100" r="72" pathLength="100" fill="none" stroke={palette[i%palette.length]} strokeWidth={hovered===row.id?28:24} strokeDasharray={`${row.percent} ${100-row.percent}`} strokeDashoffset={-start} strokeLinecap="butt" transform="rotate(-90 100 100)" className="fc-donut-segment" onMouseEnter={()=>setHovered(row.id)} onMouseLeave={()=>setHovered(null)} onClick={()=>onSelect(row.id)}><title>{row.name+" · "+money(row.amount)+" · "+row.percent.toFixed(1)+"%"}</title></circle>})}
      </svg>
      <button type="button" className="fc-donut-centre" onClick={()=>focus&&onSelect(focus.id)} disabled={!focus}>
        <span>{focus?.name??"No spend"}</span><strong className="money">{focus?compact(focus.amount):money(0)}</strong><small>{focus?focus.percent.toFixed(0)+"% of spend":"Selected range"}</small>
      </button>
    </div>
    <div className="fc-donut-legend">{rows.slice(0,6).map((row,i)=><button key={row.id} type="button" onMouseEnter={()=>setHovered(row.id)} onMouseLeave={()=>setHovered(null)} onClick={()=>onSelect(row.id)}><span><i style={{background:palette[i%palette.length]}}/>{row.name}</span><strong>{row.percent.toFixed(0)}%</strong></button>)}</div>
  </div>;
}

function CashFlowChart({rows,onSelect}:{rows:{date:string;moneyIn:number;moneyOut:number;net:number}[];onSelect:(date:string)=>void}){
  const [hover,setHover]=useState<number|null>(null);
  if(!rows.length)return <EmptyState title="No cash movement in this range"/>;
  const w=880,h=285,pX=34,pT=28,pB=34,max=Math.max(1,...rows.flatMap(x=>[x.moneyIn,x.moneyOut])),slot=(w-pX*2)/rows.length,bar=Math.max(3,Math.min(12,slot*.26));
  const netMax=Math.max(1,...rows.map(x=>Math.abs(x.net))),mid=h*.53,netScale=(h-pT-pB)*.28/netMax;
  const netPts=rows.map((x,i)=>({x:pX+slot*(i+.5),y:mid-x.net*netScale}));
  const netLine=netPts.map((q,i)=>(i?"L":"M")+q.x.toFixed(1)+" "+q.y.toFixed(1)).join(" ");
  const active=hover===null?null:rows[hover];
  return <div className="fc-flow-chart">
    {active?<div className="fc-chart-tooltip" style={{left:`${Math.min(86,Math.max(14,((hover!+.5)/rows.length)*100))}%`}}><b>{new Date(active.date+"T12:00:00+05:30").toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</b><span>In {money(active.moneyIn)}</span><span>Out {money(active.moneyOut)}</span><strong className={active.net>=0?"positive":"negative"}>{active.net>=0?"+":""}{money(active.net)}</strong></div>:null}
    <svg viewBox={`0 0 ${w} ${h}`} className="fc-flow-svg" role="img" aria-label="Money in, money out and net movement">
      {[.25,.5,.75].map(n=><line key={n} x1={pX} x2={w-pX} y1={pT+n*(h-pT-pB)} y2={pT+n*(h-pT-pB)} stroke="var(--border)" strokeDasharray="3 7"/>)}
      <line x1={pX} x2={w-pX} y1={mid} y2={mid} stroke="var(--border)"/>
      {rows.map((r,i)=>{const x=pX+slot*(i+.5),inH=(r.moneyIn/max)*(h-pT-pB)*.72,outH=(r.moneyOut/max)*(h-pT-pB)*.72;return <g key={r.date} className="fc-flow-day" onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onClick={()=>onSelect(r.date)}>
        <rect x={x-bar-2} y={h-pB-inH} width={bar} height={inH} rx="3" fill="var(--money-in)" opacity={hover===null||hover===i ? .9 : .38}/>
        <rect x={x+2} y={h-pB-outH} width={bar} height={outH} rx="3" fill="var(--money-out)" opacity={hover===null||hover===i ? .82 : .34}/>
        <rect x={x-slot/2} y={pT} width={slot} height={h-pT-pB} fill="transparent"/>
        {(rows.length<=10||i%Math.ceil(rows.length/7)===0||i===rows.length-1)?<text x={x} y={h-8} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{new Date(r.date+"T12:00:00+05:30").toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</text>:null}
      </g>})}
      <path d={netLine} pathLength="1" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="fc-draw-line"/>
      {netPts.map((q,i)=><circle key={i} cx={q.x} cy={q.y} r={hover===i?4:2.5} fill="var(--accent)"/>)}
    </svg>
  </div>;
}

function Panel({kicker,title,action,children,className=""}:{kicker?:string;title:string;action?:ReactNode;children:ReactNode;className?:string}){
  return <section className={"fc-panel "+className}><header><div>{kicker?<p>{kicker}</p>:null}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

function PositionItem({label,value,icon,href,tone="neutral",meta}:{label:string;value:number;icon:IconName;href:string;tone?:"neutral"|"in"|"out"|"warn";meta?:string}){
  return <Link href={href} className={"fc-position-item fc-tone-"+tone}><span className="fc-position-icon"><Icon name={icon}/></span><div><p>{label}</p><strong className="money">{money(value)}</strong>{meta?<small>{meta}</small>:null}</div><Icon name="arrow" className="fc-row-arrow"/></Link>;
}

export default function DashboardPage(){
  const [summary,setSummary]=useState<Summary|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[today,setToday]=useState<Today|null>(null);
  const [payables,setPayables]=useState<Payable[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[trend,setTrend]=useState<Trend[]>([]);
  const [insights,setInsights]=useState<Insights|null>(null),[categories,setCategories]=useState<Category[]>([]);
  const [scope,setScope]=useState<Scope>("ALL"),[period,setPeriod]=useState<Period>("30D");
  const nowKey=indiaKey(),[customFrom,setCustomFrom]=useState(shiftKey(nowKey,-29)),[customTo,setCustomTo]=useState(nowKey);
  const [transactions,setTransactions]=useState<Tx[]>([]),[expenseTransactions,setExpenseTransactions]=useState<Tx[]>([]),[flowEntries,setFlowEntries]=useState<FlowEntry[]>([]);
  const [loading,setLoading]=useState(true),[analyticsLoading,setAnalyticsLoading]=useState(false),[flowLoading,setFlowLoading]=useState(false),[error,setError]=useState("");
  const [viewer,setViewer]=useState(""),[detail,setDetail]=useState<DetailState>(null);

  const range=useMemo(()=>rangeFor(period,customFrom,customTo),[period,customFrom,customTo]);
  const prevRange=useMemo(()=>previousRange(range.startKey,range.endKey),[range.startKey,range.endKey]);
  const currentDates=useMemo(()=>rangeDates(range.startKey,range.endKey),[range.startKey,range.endKey]);
  const prevDates=useMemo(()=>rangeDates(prevRange.startKey,prevRange.endKey),[prevRange.startKey,prevRange.endKey]);

  const loadBase=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const [s,a,t,p,r,tr,oi,cats]=await Promise.all([
        apiFetch<Summary>("/dashboard/summary"),apiFetch<Account[]>("/dashboard/accounts"),apiFetch<Today>("/dashboard/today"),
        apiFetch<Payable[]>("/dashboard/payables"),apiFetch<Receivable[]>("/dashboard/receivables"),apiFetch<Trend[]>("/dashboard/position-trend"),
        apiFetch<Insights>("/dashboard/obligation-insights"),apiFetch<Category[]>("/settings/expense-categories?includeInactive=true"),
      ]);
      setSummary(s);setAccounts(a);setToday(t);setPayables(p);setReceivables(r);setTrend(tr);setInsights(oi);setCategories(cats);
    }catch(e){setError(e instanceof Error?e.message:"Failed to load financial command centre");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{try{const u=JSON.parse(localStorage.getItem("cashledger_user")||"{}");setViewer((u.fullName||u.name||"").split(" ")[0]||"");}catch{}loadBase();},[loadBase]);

  useEffect(()=>{
    let alive=true;setAnalyticsLoading(true);
    const query=(start:Date,end:Date,type?:string)=>"/reports/transactions?from="+encodeURIComponent(start.toISOString())+"&to="+encodeURIComponent(end.toISOString())+(type?"&type="+type:"");
    Promise.all([
      apiFetch<Tx[]>(query(currentDates.start,currentDates.end)),
      apiFetch<Tx[]>(query(currentDates.start,currentDates.end,"BUSINESS_EXPENSE")),
      apiFetch<Tx[]>(query(currentDates.start,currentDates.end,"PERSONAL_EXPENSE")),
      apiFetch<Tx[]>(query(prevDates.start,prevDates.end,"BUSINESS_EXPENSE")),
      apiFetch<Tx[]>(query(prevDates.start,prevDates.end,"PERSONAL_EXPENSE")),
    ]).then(([current,business,personal,prevBusiness,prevPersonal])=>{
      if(!alive)return;
      setTransactions(current.filter(x=>x.status!=="REVERSED"));
      setExpenseTransactions([...business,...personal,...prevBusiness,...prevPersonal].filter(x=>x.status!=="REVERSED"));
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:"Could not load dashboard analytics");})
      .finally(()=>{if(alive)setAnalyticsLoading(false);});
    return()=>{alive=false;};
  },[currentDates.start,currentDates.end,prevDates.start,prevDates.end]);

  useEffect(()=>{
    if(!accounts.length)return;
    let alive=true;setFlowLoading(true);
    const fundTypes=["CASH","BANK","UPI","PROVIDER_WALLET"];
    const selected=accounts.filter(a=>a.isActive&&fundTypes.includes(a.accountType)&&scopeMatchesAccount(a,scope));
    const from=currentDates.start.toISOString(),to=currentDates.end.toISOString();
    Promise.allSettled(selected.map(async account=>{
      const data=await apiFetch<AccountLedger>("/reports/accounts/"+account.id+"?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to));
      return data.rows.map(row=>({
        id:account.id+":"+row.id,accountId:account.id,accountName:account.accountName,date:indiaKey(new Date(row.journal.postingDate)),
        direction:row.entryType==="DEBIT"?"IN":"OUT",amount:Number(row.amount),transactionId:row.journal.transaction.id,
        transactionNumber:row.journal.transaction.transactionNumber,transactionType:row.journal.transaction.transactionType,description:row.description,
      } as FlowEntry));
    })).then(results=>{if(!alive)return;setFlowEntries(results.flatMap(r=>r.status==="fulfilled"?r.value:[]));})
      .finally(()=>{if(alive)setFlowLoading(false);});
    return()=>{alive=false;};
  },[accounts,scope,currentDates.start,currentDates.end]);

  const categoryById=useMemo(()=>new Map(categories.map(x=>[x.id,x.name])),[categories]);
  const currentTx=useMemo(()=>transactions.filter(tx=>{const d=new Date(tx.transactionAt);return d>=currentDates.start&&d<=currentDates.end&&scopeMatchesTx(tx,scope);}),[transactions,currentDates,scope]);

  const expenses=useMemo(()=>expenseTransactions.filter(tx=>{const d=new Date(tx.transactionAt);return d>=currentDates.start&&d<=currentDates.end&&tx.expense&&(scope==="ALL"||tx.expense.expenseType===scope);}),[expenseTransactions,currentDates,scope]);
  const previousExpenses=useMemo(()=>expenseTransactions.filter(tx=>{const d=new Date(tx.transactionAt);return d>=prevDates.start&&d<=prevDates.end&&tx.expense&&(scope==="ALL"||tx.expense.expenseType===scope);}),[expenseTransactions,prevDates,scope]);
  const expenseTotal=expenses.reduce((s,x)=>s+Number(x.expense?.amount??0),0);
  const previousExpenseTotal=previousExpenses.reduce((s,x)=>s+Number(x.expense?.amount??0),0);
  const expenseDelta=previousExpenseTotal>0?(expenseTotal-previousExpenseTotal)/previousExpenseTotal*100:null;
  const businessExpense=expenses.filter(x=>x.expense?.expenseType==="BUSINESS").reduce((s,x)=>s+Number(x.expense?.amount??0),0);
  const personalExpense=expenses.filter(x=>x.expense?.expenseType==="PERSONAL").reduce((s,x)=>s+Number(x.expense?.amount??0),0);

  const categoryRows=useMemo(()=>{
    const map=new Map<string,{id:string;name:string;amount:number;txs:Tx[]}>();
    for(const tx of expenses){const e=tx.expense;if(!e)continue;const id=e.expenseCategoryId||"other",name=categoryById.get(id)??"Other",row=map.get(id)??{id,name,amount:0,txs:[]};row.amount+=Number(e.amount);row.txs.push(tx);map.set(id,row);}
    const total=[...map.values()].reduce((s,x)=>s+x.amount,0)||1;
    return [...map.values()].sort((a,b)=>b.amount-a.amount).map(x=>({...x,percent:x.amount/total*100}));
  },[expenses,categoryById]);

  const flowRows=useMemo(()=>{
    const rows:{date:string;moneyIn:number;moneyOut:number;net:number}[]=[];
    for(let key=range.startKey;key<=range.endKey;key=shiftKey(key,1)){rows.push({date:key,moneyIn:0,moneyOut:0,net:0});if(rows.length>370)break;}
    const byDate=new Map(rows.map(x=>[x.date,x]));
    for(const e of flowEntries){const row=byDate.get(e.date);if(!row)continue;if(e.direction==="IN")row.moneyIn+=e.amount;else row.moneyOut+=e.amount;}
    rows.forEach(r=>r.net=r.moneyIn-r.moneyOut);return rows;
  },[flowEntries,range.startKey,range.endKey]);
  const flowIn=flowRows.reduce((s,x)=>s+x.moneyIn,0),flowOut=flowRows.reduce((s,x)=>s+x.moneyOut,0),flowNet=flowIn-flowOut;

  const fundAccounts=useMemo(()=>accounts.filter(a=>a.isActive&&["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)&&scopeMatchesAccount(a,scope)).sort((a,b)=>Math.abs(b.currentBalance)-Math.abs(a.currentBalance)),[accounts,scope]);
  const scopedFunds=fundAccounts.reduce((s,x)=>s+x.currentBalance,0),maxAccount=Math.max(1,...fundAccounts.map(x=>Math.max(0,x.currentBalance)));
  const largestExpense=[...expenses].sort((a,b)=>Number(b.expense?.amount??0)-Number(a.expense?.amount??0))[0];
  const netMove=trend.length>1?trend.at(-1)!.netPosition-trend[0].netPosition:0;

  const attention=useMemo(()=>{
    if(!summary)return [] as {tone:string;title:string;detail:string;amount:number;href:string}[];
    const rows:{tone:string;title:string;detail:string;amount:number;href:string}[]=[];
    if(summary.receivableBreakdown.overdueAmount>0)rows.push({tone:"in",title:"Overdue receivables",detail:summary.receivableBreakdown.overdueCount+" record"+(summary.receivableBreakdown.overdueCount===1?"":"s")+" need collection",amount:summary.receivableBreakdown.overdueAmount,href:"/receivables"});
    if(summary.payableBreakdown.overdueAmount>0)rows.push({tone:"out",title:"Overdue payables",detail:summary.payableBreakdown.overdueCount+" payment"+(summary.payableBreakdown.overdueCount===1?"":"s")+" past due",amount:summary.payableBreakdown.overdueAmount,href:"/payables"});
    if(summary.pendingProviderSettlements>0)rows.push({tone:"warn",title:"Provider clearing",detail:summary.pendingProviderSettlementCount+" settlement"+(summary.pendingProviderSettlementCount===1?"":"s")+" still pending",amount:summary.pendingProviderSettlements,href:"/provider-settlements"});
    if(summary.creditCardOutstanding>0)rows.push({tone:"out",title:"Credit card outstanding",detail:"Owner credit-card obligation",amount:summary.creditCardOutstanding,href:"/accounts?type=OWNER_CREDIT_CARD"});
    return rows;
  },[summary]);

  if(loading)return <AppShell><PageLoader label="Loading financial command centre…"/></AppShell>;
  if(error&&!summary)return <AppShell><div className="mx-auto max-w-lg py-24 text-center"><h1 className="text-xl font-black">Dashboard could not load</h1><p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p></div></AppShell>;
  if(!summary||!today)return null;

  const greeting=new Date().getHours()<12?"Good morning":new Date().getHours()<17?"Good afternoon":"Good evening";
  const selectedCategory=detail?.kind==="category"?categoryRows.find(x=>x.id===detail.categoryId):null;
  const selectedFlow=detail?.kind==="flow"?flowEntries.filter(x=>x.date===detail.date):[];
  const selectedFlowIn=selectedFlow.filter(x=>x.direction==="IN").reduce((s,x)=>s+x.amount,0),selectedFlowOut=selectedFlow.filter(x=>x.direction==="OUT").reduce((s,x)=>s+x.amount,0);

  return <AppShell><div className="fc-dashboard">
    <section className="fc-command-header">
      <div className="fc-heading"><p>{greeting}{viewer?", "+viewer:""}.</p><h1>Your money, in one place.</h1><span>Live financial position · {new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})}</span></div>
      <div className="fc-scope-switch" role="group" aria-label="Financial context">{(["ALL","BUSINESS","PERSONAL"] as Scope[]).map(v=><button key={v} type="button" className={scope===v?"active":""} onClick={()=>setScope(v)}>{v==="ALL"?"All":v==="BUSINESS"?"Business":"Personal"}</button>)}</div>
    </section>

    <section className="fc-hero">
      <div className="fc-hero-primary">
        <div className="fc-hero-label"><span>Overall financial position</span><i className={netMove>=0?"up":"down"}>{netMove>=0?"+":""}{compact(netMove)} · 10 days</i></div>
        <div className="fc-hero-amount money">{money(summary.netFinancialPosition)}</div>
        <p>Available funds, money due to you, provider clearing and obligations brought into one trusted position.</p>
        <div className="fc-hero-actions"><Link href="/reports">Open financial reports <Icon name="arrow"/></Link><span>{scope==="ALL"?"All money":scope==="BUSINESS"?"Business-linked accounts":"Personal-linked accounts"} · {money(scopedFunds)} liquid</span></div>
      </div>
      <div className="fc-hero-trend"><div><p>Position trend</p><strong className="money">{trend.length?money(trend.at(-1)!.netPosition):money(summary.netFinancialPosition)}</strong><span>Ledger-backed · last 10 days</span></div><Sparkline rows={trend}/></div>
    </section>

    <section className="fc-position-system">
      <div className="fc-position-group fc-position-liquid"><div className="fc-group-heading"><div><p>Immediately available</p><h2 className="money">{money(summary.availableFunds)}</h2></div><span>Liquid funds</span></div>
        <div className="fc-liquid-grid">
          <PositionItem label="Physical cash" value={summary.cashBalance} icon="cash" href="/cash-counter" meta="Cash counter"/>
          <PositionItem label="Bank + UPI" value={summary.bankBalance+summary.upiBalance} icon="bank" href="/accounts" meta="Banking rails"/>
          <PositionItem label="Provider wallets" value={summary.walletBalance} icon="wallet" href="/accounts?type=PROVIDER_WALLET" meta="Service balances"/>
        </div>
      </div>
      <div className="fc-position-obligations">
        <PositionItem label="Receivables" value={summary.customerReceivable} icon="receive" href="/receivables" tone="in" meta={summary.receivableBreakdown.overdueCount+" overdue"}/>
        <PositionItem label="Pending settlement" value={summary.pendingProviderSettlements} icon="settle" href="/provider-settlements" tone="warn" meta={summary.pendingProviderSettlementCount+" open"}/>
        <PositionItem label="Payables" value={summary.customerPayable} icon="pay" href="/payables" tone="out" meta={summary.payableBreakdown.dueTodayCount+" due today"}/>
        <PositionItem label="Credit card outstanding" value={summary.creditCardOutstanding} icon="card" href="/accounts?type=OWNER_CREDIT_CARD" tone="out" meta={money(summary.creditCardAvailable)+" available"}/>
      </div>
    </section>

    <section className="fc-period-bar">
      <div><span>Analysis period</span><strong>{range.label}</strong></div>
      <div className="fc-period-tabs">{([["TODAY","Today"],["7D","7 Days"],["30D","30 Days"],["THIS_MONTH","This Month"],["PREV_MONTH","Previous Month"],["CUSTOM","Custom"]] as [Period,string][]).map(([v,label])=><button key={v} type="button" className={period===v?"active":""} onClick={()=>setPeriod(v)}>{label}</button>)}</div>
      {period==="CUSTOM"?<div className="fc-custom-range"><label>From<input type="date" value={customFrom} max={customTo} onChange={e=>setCustomFrom(e.target.value)}/></label><label>To<input type="date" value={customTo} min={customFrom} onChange={e=>setCustomTo(e.target.value)}/></label></div>:null}
    </section>

    <section className="fc-dues-grid">
      <Panel kicker="Money to receive" title={money(summary.customerReceivable)} action={<Link href="/receivables">Open receivables <Icon name="arrow"/></Link>} className="fc-receive-panel">
        <div className="fc-dues-summary"><div><span>Overdue</span><strong className="money">{money(summary.receivableBreakdown.overdueAmount)}</strong><small>{summary.receivableBreakdown.overdueCount} records</small></div><div><span>Due today</span><strong className="money">{money(summary.receivableBreakdown.dueTodayAmount)}</strong><small>{summary.receivableBreakdown.dueTodayCount} records</small></div></div>
        {insights?<div className="fc-aging">{insights.receivables.map((b)=><div key={b.label}><span>{b.label}<small>{b.count}</small></span><i><b style={{width:(summary.customerReceivable?Math.max(2,b.amount/summary.customerReceivable*100):0)+"%"}}/></i><strong className="money">{money(b.amount)}</strong></div>)}</div>:null}
        <div className="fc-obligation-list">{receivables.slice(0,3).map(r=><Link href={"/receivables/"+r.id} key={r.id}><div><b>{r.customer.fullName}</b><span>{r.dueAt?"Due "+new Date(r.dueAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}):"No due date"}</span></div><strong className="money">{money(r.remainingAmount)}</strong></Link>)}</div>
      </Panel>
      <Panel kicker="Money to pay" title={money(summary.customerPayable+summary.creditCardOutstanding)} action={<Link href="/payables">Open payables <Icon name="arrow"/></Link>} className="fc-pay-panel">
        <div className="fc-dues-summary"><div><span>Overdue</span><strong className="money">{money(summary.payableBreakdown.overdueAmount)}</strong><small>{summary.payableBreakdown.overdueCount} records</small></div><div><span>Due today</span><strong className="money">{money(summary.payableBreakdown.dueTodayAmount)}</strong><small>{summary.payableBreakdown.dueTodayCount} records</small></div></div>
        {insights?<div className="fc-aging fc-aging-out">{insights.payables.map((b)=><div key={b.label}><span>{b.label}<small>{b.count}</small></span><i><b style={{width:(summary.customerPayable?Math.max(2,b.amount/summary.customerPayable*100):0)+"%"}}/></i><strong className="money">{money(b.amount)}</strong></div>)}</div>:null}
        <div className="fc-obligation-list">{payables.slice(0,3).map(p=><Link href={"/payables/"+p.id} key={p.id}><div><b>{p.customer.fullName}</b><span>Due {new Date(p.dueAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</span></div><strong className="money">{money(p.remainingAmount)}</strong></Link>)}</div>
      </Panel>
    </section>

    <section className="fc-expense-section">
      <div className="fc-section-title"><div><p>Spending intelligence</p><h2>Expenses that explain themselves.</h2><span>Every category is built from the same transaction records shown when you open it.</span></div><Link href={"/expenses?scope="+(scope==="ALL"?"COMBINED":scope)}>Open expense ledger <Icon name="arrow"/></Link></div>
      <div className="fc-expense-overview">
        <div className="fc-expense-total"><span>Total expenses · {range.label}</span><strong className="money">{analyticsLoading?"—":money(expenseTotal)}</strong><div>{expenseDelta===null?<small>No reliable prior-period comparison</small>:<small className={expenseDelta<=0?"good":"bad"}>{expenseDelta>0?"+":""}{expenseDelta.toFixed(1)}% vs previous period</small>}<em>{expenses.length} transaction{expenses.length===1?"":"s"}</em></div></div>
        <div className="fc-split-spend"><div><span>Business</span><strong className="money">{money(businessExpense)}</strong></div><div><span>Personal</span><strong className="money">{money(personalExpense)}</strong></div><i><b style={{width:(expenseTotal?businessExpense/expenseTotal*100:50)+"%"}}/></i><small>{scope==="ALL"?"Business vs personal spend mix":scope==="BUSINESS"?"Business spending selected":"Personal spending selected"}</small></div>
      </div>
      <div className="fc-expense-analytics">
        <div className="fc-expense-donut-card"><div className="fc-card-head"><div><span>Category distribution</span><h3>Where the money went</h3></div><small>Tap a segment</small></div>{categoryRows.length?<ExpenseDonut rows={categoryRows} onSelect={id=>setDetail({kind:"category",categoryId:id})}/>:<EmptyState title="No expenses in this range"/>}</div>
        <div className="fc-ranking-card"><div className="fc-card-head"><div><span>Category ranking</span><h3>Biggest spending areas</h3></div><small>{categoryRows.length} categories</small></div>
          <div className="fc-ranking">{categoryRows.slice(0,7).map((row,i)=><button key={row.id} type="button" onClick={()=>setDetail({kind:"category",categoryId:row.id})}><span className="fc-rank-index">{String(i+1).padStart(2,"0")}</span><div><b>{row.name}</b><i><em style={{width:Math.max(2,row.percent)+"%",background:palette[i%palette.length]}}/></i></div><strong className="money">{money(row.amount)}<small>{row.percent.toFixed(0)}%</small></strong></button>)}</div>
          {largestExpense?<Link href={"/transactions/"+largestExpense.id} className="fc-largest-expense"><span>Largest individual expense</span><div><b>{largestExpense.expense?.description||"Expense"}</b><strong className="money">{money(largestExpense.expense?.amount??0)}</strong></div><small>{categoryById.get(largestExpense.expense?.expenseCategoryId??"")??"Other"} · {new Date(largestExpense.transactionAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</small></Link>:null}
        </div>
      </div>
    </section>

    <section className="fc-cashflow-section">
      <div className="fc-section-title fc-section-title-compact"><div><p>Cash flow</p><h2>Money moving through your accounts.</h2><span>Ledger movements for {scope==="ALL"?"all":scope.toLowerCase()} linked funds · click any day to reconcile it.</span></div><div className="fc-flow-legend"><span><i className="in"/>Money In</span><span><i className="out"/>Money Out</span><span><i className="net"/>Net</span></div></div>
      <div className="fc-flow-totals"><div><span>Money In</span><strong className="money">{flowLoading?"—":money(flowIn)}</strong></div><div><span>Money Out</span><strong className="money">{flowLoading?"—":money(flowOut)}</strong></div><div className={flowNet>=0?"positive":"negative"}><span>Net Movement</span><strong className="money">{flowLoading?"—":(flowNet>=0?"+":"")+money(flowNet)}</strong></div></div>
      <CashFlowChart rows={flowRows} onSelect={date=>setDetail({kind:"flow",date})}/>
    </section>

    <section className="fc-funds-today-grid">
      <Panel kicker="Funds & accounts" title={scope==="ALL"?"Where the money is":scope==="BUSINESS"?"Business-linked funds":"Personal-linked funds"} action={<Link href="/accounts">All accounts <Icon name="arrow"/></Link>} className="fc-funds-panel">
        <div className="fc-funds-total"><span>Visible liquid balance</span><strong className="money">{money(scopedFunds)}</strong><small>{fundAccounts.length} active account{fundAccounts.length===1?"":"s"}</small></div>
        <div className="fc-account-list">{fundAccounts.slice(0,8).map((a)=><Link href={"/accounts/"+a.id} key={a.id} className="fc-account-row"><span className="fc-account-mark"><Icon name={a.accountType==="CASH"?"cash":a.accountType==="PROVIDER_WALLET"?"wallet":"bank"}/></span><div><b>{a.accountName}</b><small>{accountLabel(a.accountType)}{a.lastFourDigits?" · •••• "+a.lastFourDigits:""}</small><i><em style={{width:(Math.max(0,a.currentBalance)/maxAccount*100)+"%"}}/></i></div><strong className="money">{money(a.currentBalance)}</strong></Link>)}</div>
      </Panel>
      <Panel kicker="Today" title="Operations pulse" action={<Link href="/transactions">Activity <Icon name="arrow"/></Link>} className="fc-today-panel">
        <div className="fc-today-grid">{[
          ["Cash In",today.cashIn,"in"],["Cash Out",today.cashOut,"out"],["Card Swipe",today.cardSwipe,"neutral"],["AePS",today.aeps,"neutral"],
          ["Micro ATM",today.microAtm,"neutral"],["Bank + UPI movement",today.bankIn+today.bankOut+today.upiIn+today.upiOut,"neutral"],
          ["Commissions",today.commission,"in"],["Charges",today.providerCharges,"out"],
          [scope==="PERSONAL"?"Personal expenses":scope==="BUSINESS"?"Business expenses":"Expenses",scope==="PERSONAL"?today.personalExpense:scope==="BUSINESS"?today.businessExpense:today.businessExpense+today.personalExpense,"out"],
        ].map(([label,value,tone])=><div key={String(label)} className={"fc-today-metric "+tone}><span>{label}</span><strong className="money">{money(Number(value))}</strong></div>)}</div>
      </Panel>
    </section>

    <section className="fc-bottom-grid">
      <Panel kicker="Needs attention" title={attention.length?attention.length+" items to review":"Nothing urgent"} action={<span className="fc-live"><i/>Live</span>} className="fc-attention-panel">
        {attention.length?<div className="fc-attention-list">{attention.map(item=><Link key={item.title} href={item.href} className={"fc-attention-item "+item.tone}><span><Icon name="alert"/></span><div><b>{item.title}</b><small>{item.detail}</small></div><strong className="money">{money(item.amount)}</strong><Icon name="arrow" className="fc-row-arrow"/></Link>)}</div>:<div className="p-4"><EmptyState title="No overdue or pending items" description="Current obligations are clear from the live data."/></div>}
      </Panel>
      <Panel kicker="Recent activity" title={scope==="ALL"?"Latest financial activity":scope==="BUSINESS"?"Latest business activity":"Latest personal activity"} action={<Link href="/transactions">View all <Icon name="arrow"/></Link>} className="fc-activity-panel">
        {currentTx.length?<div className="fc-activity-list">{currentTx.slice(0,8).map(tx=><Link href={"/transactions/"+tx.id} key={tx.id}><span className={"fc-activity-icon "+(tx.transactionType.includes("EXPENSE")?"out":"")}><Icon name={tx.transactionType.includes("EXPENSE")?"expense":"activity"}/></span><div><b>{tx.expense?.description||tx.customer?.fullName||txLabel(tx.transactionType)}</b><small>{txLabel(tx.transactionType)} · {new Date(tx.transactionAt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</small></div><strong className={"money "+(tx.transactionType.includes("EXPENSE")?"negative":"")}>{money(activityAmount(tx))}</strong><span className="fc-status">{tx.status}</span></Link>)}</div>:<div className="p-4"><EmptyState title="No activity in this range"/></div>}
      </Panel>
    </section>

    {error?<div className="fc-soft-error">{error}</div>:null}

    {detail?<div className="fc-detail-layer" role="dialog" aria-modal="true"><button className="fc-detail-backdrop" aria-label="Close detail" onClick={()=>setDetail(null)}/><aside className="fc-detail-drawer">
      <div className="fc-drawer-handle"/><header><div><p>{detail.kind==="category"?"Expense category":"Cash-flow reconciliation"}</p><h2>{detail.kind==="category"?selectedCategory?.name??"Category":new Date(detail.date+"T12:00:00+05:30").toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"long"})}</h2></div><button type="button" onClick={()=>setDetail(null)} aria-label="Close">×</button></header>
      {detail.kind==="category"&&selectedCategory?<><div className="fc-drawer-summary"><div><span>Total</span><strong className="money">{money(selectedCategory.amount)}</strong></div><div><span>Share</span><strong>{selectedCategory.percent.toFixed(1)}%</strong></div><div><span>Records</span><strong>{selectedCategory.txs.length}</strong></div></div><div className="fc-reconcile-note">These records total exactly <strong>{money(selectedCategory.amount)}</strong>, matching the selected chart segment.</div><div className="fc-drawer-list">{selectedCategory.txs.map(tx=><Link key={tx.id} href={"/transactions/"+tx.id}><div><b>{tx.expense?.description||"Expense"}</b><small>{new Date(tx.transactionAt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} · {tx.expense?.expenseType}</small></div><strong className="money">{money(tx.expense?.amount??0)}</strong><Icon name="arrow"/></Link>)}</div></>:null}
      {detail.kind==="flow"?<><div className="fc-drawer-summary"><div><span>Money In</span><strong className="money positive">{money(selectedFlowIn)}</strong></div><div><span>Money Out</span><strong className="money negative">{money(selectedFlowOut)}</strong></div><div><span>Net</span><strong className={"money "+(selectedFlowIn-selectedFlowOut>=0?"positive":"negative")}>{(selectedFlowIn-selectedFlowOut)>=0?"+":""}{money(selectedFlowIn-selectedFlowOut)}</strong></div></div><div className="fc-reconcile-note">Ledger entries below reconcile exactly to the selected day: <strong>{money(selectedFlowIn)}</strong> in and <strong>{money(selectedFlowOut)}</strong> out.</div><div className="fc-drawer-list">{selectedFlow.length?selectedFlow.sort((a,b)=>b.amount-a.amount).map(e=><Link key={e.id} href={"/transactions/"+e.transactionId}><span className={"fc-flow-direction "+e.direction}>{e.direction}</span><div><b>{e.transactionNumber} · {e.accountName}</b><small>{txLabel(e.transactionType)}{e.description?" · "+e.description:""}</small></div><strong className={"money "+(e.direction==="IN"?"positive":"negative")}>{money(e.amount)}</strong><Icon name="arrow"/></Link>):<EmptyState title="No ledger movement on this day"/>}</div></>:null}
    </aside></div>:null}
  </div></AppShell>;
}
