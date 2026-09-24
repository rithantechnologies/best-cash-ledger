"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CashHistoryChart, CashMovementChart } from "@/components/cash-desk/cash-desk-charts";
import { FundsAllocationDonut } from "@/components/dashboard/dashboard-charts";
import { EmptyState, Modal, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;isActive?:boolean;currentBalance?:string|number};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type Movement={
  id:string;activityId?:string;transactionId?:string;direction:"IN"|"OUT";amount:number;runningBalance:number;
  grossAmount:number;netAmount:number;commissionAmount:number;
  description:string|null;transactionNumber:string;transactionType:string;transactionAt:string;
};
type Activity={
  id:string;transactionId:string;transactionNumber:string;serviceType:string;transactionAt:string;
  particular:string;transactionAmount:number;netAmount:number;cashIn:number;cashOut:number;
  commissionAmount:number;providerFeeAmount?:number;payoutChargeAmount?:number;profitAmount?:number;
  quickCashDirection?:"IN"|"OUT"|null;quickCashPurpose?:string|null;
  commissionMode?:"CASH"|"UPI"|null;commissionAccountType?:string|null;commissionAccountName?:string|null;
  transactionStatus?:string;runningBalance:number;movementCount:number;
};
type ServiceSummary={
  id:string;transactionAmount:number;cashIn:number;cashOut:number;commissionAmount:number;count:number;
};
type UserRef={id:string;fullName:string}|null;
type Operator={id:string;fullName:string;role:{name:string}};
type Session={
  id:string;cashAccountId:string;businessDate:string;openedAt:string;openingTotal:string;
  expectedClosingTotal:string|null;liveExpectedClosingTotal?:number;liveCashIn?:number;liveCashOut?:number;
  actualClosingTotal:string|null;differenceAmount:string|null;status:string;closingNotes:string|null;
  cashAccount:{accountName:string};denominationCounts:Count[];movements?:Movement[];activities?:Activity[];
  serviceSummary?:ServiceSummary[];commissionEarned?:number;transactionCount?:number;
  openedBy?:UserRef;closedBy?:UserRef;closedAt?:string|null;
};

type QuickCashDirection="IN"|"OUT";
type QuickCashFieldErrors={amount?:string;commission?:string;serviceName?:string;servicePaymentAccount?:string};
type ServiceConfig={id:string;name:string;defaultAmount:string|number|null;isActive:boolean};
type BankBeneficiary={accountHolder:string;accountNumber:string;ifsc:string};
const emptyBankBeneficiary=():BankBeneficiary=>({accountHolder:"",accountNumber:"",ifsc:""});
function parseBankBeneficiary(value?:string|null):BankBeneficiary{
  if(!value)return emptyBankBeneficiary();
  try{
    const parsed=JSON.parse(value) as Partial<BankBeneficiary>;
    if(parsed&&typeof parsed==="object"){
      return {
        accountHolder:typeof parsed.accountHolder==="string"?parsed.accountHolder:"",
        accountNumber:typeof parsed.accountNumber==="string"?parsed.accountNumber:"",
        ifsc:typeof parsed.ifsc==="string"?parsed.ifsc:"",
      };
    }
  }catch{}
  return {accountHolder:"",accountNumber:value,ifsc:""};
}
function serializeBankBeneficiary(accountHolder:string,accountNumber:string,ifsc:string){
  const value={accountHolder:accountHolder.trim(),accountNumber:accountNumber.trim(),ifsc:ifsc.trim().toUpperCase()};
  return Object.values(value).some(Boolean)?JSON.stringify(value):"";
}
type QuickCashPending={
  id:string;direction:QuickCashDirection;customerName:string|null;mobileNumber:string|null;
  amount:string|number;commissionAmount:string|number;commissionMode?:"CASH"|"UPI";
  beneficiaryMode?:"UPI"|"BANK"|null;beneficiaryDetails?:string|null;
  createdAt:string;
  transaction:{id:string;transactionNumber:string;transactionAt:string;status:string;notes:string|null};
};
type Range="today"|"7d"|"30d";
type LedgerView="CASHBOOK"|"DETAILED";
type DirectionFilter="ALL"|"IN"|"OUT"|"COMMISSION"|"REVERSAL"|"ADJUSTMENT";
type TxColumn="TIME"|"PARTICULAR"|"SERVICE"|"TXN_AMOUNT"|"CASH_IN"|"CASH_OUT"|"CUSTOMER_FEE"|"PROVIDER_FEE"|"PROFIT"|"DRAWER";
const txColumnDefs:Array<{id:TxColumn;label:string;width:string}>=[
  {id:"TIME",label:"Time",width:"72px"},
  {id:"PARTICULAR",label:"Particular",width:"minmax(200px,1.5fr)"},
  {id:"SERVICE",label:"Service",width:"140px"},
  {id:"TXN_AMOUNT",label:"Txn amount",width:"110px"},
  {id:"CASH_IN",label:"Cash in",width:"105px"},
  {id:"CASH_OUT",label:"Cash out",width:"105px"},
  {id:"CUSTOMER_FEE",label:"Customer fee",width:"115px"},
  {id:"PROVIDER_FEE",label:"Provider fee",width:"115px"},
  {id:"PROFIT",label:"Profit",width:"105px"},
  {id:"DRAWER",label:"Drawer",width:"115px"},
];
const defaultTxColumns:TxColumn[]=txColumnDefs.map((column)=>column.id);

const denominations=[500,200,100,50,20,10,5,2,1];
const money=(value:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value||0));
const words=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase());
const commissionReceiptLabel=(activity:Activity)=>{
  if(!activity.commissionAmount)return "";
  if(activity.commissionMode==="CASH")return "Cash";
  if(activity.commissionMode==="UPI"){
    if(activity.commissionAccountType==="BANK")return "Bank";
    if(activity.commissionAccountType==="UPI")return "UPI";
    return "Bank/UPI";
  }
  return "";
};
const friendlyService=(value:string)=>{
  const labels:Record<string,string>={
    CARD_SWIPE:"Card Swipe",
    CASH_TRANSFER:"Cash Transfer / UPI",
    SERVICE_INCOME:"Service Income",
    AEPS_WITHDRAWAL:"Aadhaar / AePS",
    MICRO_ATM:"Micro ATM",
    ATM_WITHDRAWAL:"ATM Cash Added",
    CUSTOMER_PAYOUT:"Customer Payout",
    CUSTOMER_RECEIPT:"Customer Receipt",
    BUSINESS_EXPENSE:"Expense",
    PERSONAL_EXPENSE:"Expense",
    INTERNAL_TRANSFER:"Internal Transfer",
    OWNER_CC_PAYMENT:"Credit Card Payment",
    CASH_ADJUSTMENT:"Cash Adjustment",
    REVERSAL:"Reversal",
  };
  return labels[value]??words(value);
};

function CountGrid({
  qty,setQty,compact=false,
}:{
  qty:Record<number,string>;
  setQty:(updater:(current:Record<number,string>)=>Record<number,string>)=>void;
  compact?:boolean;
}){
  function step(note:number,delta:number){
    setQty((current)=>({...current,[note]:String(Math.max(0,Number(current[note]||0)+delta))}));
  }
  return <div className={compact?"grid gap-2":"grid gap-2 xl:grid-cols-2"}>
    {denominations.map((note)=><div key={note} className="cash-count-row grid grid-cols-[56px_minmax(0,1fr)_88px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <strong className="money text-sm">₹{note}</strong>
      <div className="cash-count-control grid min-w-0 grid-cols-[40px_minmax(48px,1fr)_40px] items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-soft)]">
        <button type="button" aria-label={"Decrease ₹"+note+" note quantity"} onClick={()=>step(note,-1)} className="h-11 text-lg font-bold text-[var(--text-muted)]">−</button>
        <input
          aria-label={"Quantity of ₹"+note+" notes"}
          className="cash-count-input h-11 w-full min-w-0 border-x border-[var(--border)] bg-[var(--surface)] px-1 text-center text-lg font-extrabold text-[var(--text)] outline-none"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={qty[note]||""}
          placeholder="Qty"
          onFocus={(event)=>event.currentTarget.select()}
          onChange={(event)=>{
            const value=event.target.value.replace(/\D/g,"");
            setQty((current)=>({...current,[note]:value}));
          }}
        />
        <button type="button" aria-label={"Increase ₹"+note+" note quantity"} onClick={()=>step(note,1)} className="h-11 text-lg font-bold text-[var(--text-muted)]">+</button>
      </div>
      <span className="cash-count-total money text-right text-[13px] font-bold text-[var(--text-muted)]">{money(note*Number(qty[note]||0))}</span>
    </div>)}
  </div>;
}

function CountBreakdown({counts,type}:{counts:Count[];type:"OPENING"|"CLOSING"}){
  const rows=counts.filter((count)=>count.countType===type&&count.quantity>0).sort((a,b)=>Number(b.denomination)-Number(a.denomination));
  if(!rows.length)return <p className="text-sm text-[var(--text-muted)]">No denomination details recorded.</p>;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {rows.map((count)=><div key={type+"-"+count.denomination} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-sm font-bold">₹{Number(count.denomination)} × {count.quantity}</p>
      <p className="money mt-0.5 text-[13px] text-[var(--text-muted)]">{money(count.totalAmount)}</p>
    </div>)}
  </div>;
}

function MetricCard({
  label,value,detail,tone="default",
}:{
  label:string;value:string;detail?:string;tone?:"default"|"in"|"out"|"accent"|"good"|"bad";
}){
  const toneClass={
    default:"text-[var(--text)]",
    in:"text-[var(--money-in)]",
    out:"text-[var(--money-out)]",
    accent:"text-[var(--accent)]",
    good:"text-[var(--money-in)]",
    bad:"text-[var(--money-out)]",
  }[tone];
  return <div data-tone={tone} className={"cash-desk-metric-card min-w-0 bg-[var(--surface)] p-4 "+(tone==="accent"?"bg-[color-mix(in_srgb,var(--accent-soft)_62%,var(--surface))]":"")}>
    <p className="text-xs font-extrabold uppercase tracking-[.09em] text-[var(--text-muted)]">{label}</p>
    <p className={"money mt-1.5 truncate text-[clamp(1.05rem,5vw,1.45rem)] font-black tracking-[-.04em] "+toneClass}>{value}</p>
    {detail?<p className="mt-1 truncate text-xs font-semibold text-[var(--text-muted)]">{detail}</p>:null}
  </div>;
}

export default function CashCounterPage(){
  const router=useRouter();
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [operators,setOperators]=useState<Operator[]>([]);
  const [today,setToday]=useState<Session|null>(null);
  const [history,setHistory]=useState<Session[]>([]);
  const [cashAccountId,setCashAccountId]=useState("");
  const [responsibleUserId,setResponsibleUserId]=useState("");
  const [sourceCashAccountId,setSourceCashAccountId]=useState("");
  const [handoverTarget,setHandoverTarget]=useState("");
  const [qty,setQty]=useState<Record<number,string>>({});
  const [remarks,setRemarks]=useState("");
  const [closing,setClosing]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [range,setRange]=useState<Range>("today");
  const [ledgerView,setLedgerView]=useState<LedgerView>(()=>{
    if(typeof window==="undefined")return "CASHBOOK";
    return localStorage.getItem("cashledger_daily_cash_view")==="DETAILED"?"DETAILED":"CASHBOOK";
  });
  const [cashBookMobileDirection,setCashBookMobileDirection]=useState<QuickCashDirection>("IN");
  const [direction,setDirection]=useState<DirectionFilter>("ALL");
  const [serviceFilter,setServiceFilter]=useState<string|null>(null);
  const [txColumns,setTxColumns]=useState<TxColumn[]>(()=>{
    if(typeof window==="undefined")return defaultTxColumns;
    try{
      const saved=JSON.parse(localStorage.getItem("cashledger_daily_cash_columns")||"[]") as TxColumn[];
      return saved.length?saved.filter((id)=>defaultTxColumns.includes(id)):defaultTxColumns;
    }catch{return defaultTxColumns;}
  });
  const [selectedActivityId,setSelectedActivityId]=useState<string|null>(null);
  const [selectedHistoryId,setSelectedHistoryId]=useState<string|null>(null);
  const [reverseActivity,setReverseActivity]=useState<Activity|null>(null);
  const [reverseReason,setReverseReason]=useState("");
  const [reverseSaving,setReverseSaving]=useState(false);
  const [reverseError,setReverseError]=useState("");
  const [quickDirection,setQuickDirection]=useState<QuickCashDirection|null>(null);
  const [quickAmount,setQuickAmount]=useState("");
  const [quickPurpose,setQuickPurpose]=useState<"TRANSFER"|"SERVICE">("TRANSFER");
  const [quickServiceName,setQuickServiceName]=useState("");
  const [quickCommission,setQuickCommission]=useState("");
  const [quickCommissionMode,setQuickCommissionMode]=useState<"CASH"|"UPI">("CASH");
  const [quickBeneficiaryMode,setQuickBeneficiaryMode]=useState<"UPI"|"BANK">("UPI");
  const [quickBeneficiaryUpi,setQuickBeneficiaryUpi]=useState("");
  const [quickBankAccountHolder,setQuickBankAccountHolder]=useState("");
  const [quickBankAccountNumber,setQuickBankAccountNumber]=useState("");
  const [quickBankIfsc,setQuickBankIfsc]=useState("");
  const [quickServicePaymentMode,setQuickServicePaymentMode]=useState<"CASH"|"UPI">("CASH");
  const [quickServicePaymentAccountId,setQuickServicePaymentAccountId]=useState("");
  const [quickCustomerName,setQuickCustomerName]=useState("");
  const [quickMobile,setQuickMobile]=useState("");
  const [quickRemarks,setQuickRemarks]=useState("");
  const [quickTransactionAt,setQuickTransactionAt]=useState("");
  const [serviceCatalog,setServiceCatalog]=useState<ServiceConfig[]>([]);
  const [quickFieldErrors,setQuickFieldErrors]=useState<QuickCashFieldErrors>({});
  const [quickError,setQuickError]=useState("");
  const [quickSaving,setQuickSaving]=useState(false);
  const quickAmountRef=useRef<HTMLInputElement>(null);
  const quickCommissionRef=useRef<HTMLInputElement>(null);
  const quickServiceRef=useRef<HTMLInputElement>(null);
  const [portalReady,setPortalReady]=useState(false);
  const [pendingQuickCash,setPendingQuickCash]=useState<QuickCashPending[]>([]);
  const [completePendingId,setCompletePendingId]=useState<string|null>(null);
  const [completeSourceAccountId,setCompleteSourceAccountId]=useState("");
  const [completeCommissionAccountId,setCompleteCommissionAccountId]=useState("");
  const [completeBeneficiaryMode,setCompleteBeneficiaryMode]=useState<"UPI"|"BANK">("UPI");
  const [completeBeneficiaryUpi,setCompleteBeneficiaryUpi]=useState("");
  const [completeBankAccountHolder,setCompleteBankAccountHolder]=useState("");
  const [completeBankAccountNumber,setCompleteBankAccountNumber]=useState("");
  const [completeBankIfsc,setCompleteBankIfsc]=useState("");
  const [completeCustomerName,setCompleteCustomerName]=useState("");
  const [completeMobile,setCompleteMobile]=useState("");
  const [completeReference,setCompleteReference]=useState("");
  const [completeNotes,setCompleteNotes]=useState("");
  const [completeError,setCompleteError]=useState("");
  const [currentUser]=useState<{id?:string;userId?:string;role?:string}>(()=>{if(typeof window==="undefined")return {};try{return JSON.parse(localStorage.getItem("cashledger_user")||"{}");}catch{return {};}});
  const role=currentUser.role??"";
  const completingQuickCash=useMemo(()=>pendingQuickCash.find((item)=>item.id===completePendingId)??null,[pendingQuickCash,completePendingId]);

  const load=async(preferredCashAccountId?:string)=>{
    const [accountRows,balanceRows,historyRows,operatorRows,serviceRows]=await Promise.all([
      apiFetch<Account[]>("/accounts"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<Session[]>("/cash-counter/history"),
      apiFetch<Operator[]>("/cash-counter/operators"),
      apiFetch<ServiceConfig[]>("/settings/services"),
    ]);
    const balanceMap=new Map(balanceRows.map((account)=>[account.id,account]));
    const mergedAccounts=accountRows.map((account)=>({
      ...account,
      currentBalance:balanceMap.get(account.id)?.currentBalance??account.currentBalance??0,
    }));
    const cashRows=mergedAccounts.filter((account)=>account.accountType==="CASH"&&account.isActive!==false);
    const targetId=preferredCashAccountId||cashAccountId||cashRows[0]?.id||"";
    const session=targetId
      ?await apiFetch<Session|null>("/cash-counter/current?cashAccountId="+encodeURIComponent(targetId))
      :null;
    const pending=targetId
      ?await apiFetch<QuickCashPending[]>("/transactions/quick-cash/pending?cashAccountId="+encodeURIComponent(targetId))
      :[];
    setAccounts(mergedAccounts);setToday(session);setHistory(historyRows);setOperators(operatorRows);setPendingQuickCash(pending);setServiceCatalog(serviceRows);
    if(targetId)setCashAccountId(targetId);
    const me=currentUser.id??currentUser.userId??"";
    if(!responsibleUserId)setResponsibleUserId(me||operatorRows[0]?.id||"");
  };

  useEffect(()=>{load().catch(()=>setError("Failed to load cash desk")).finally(()=>setLoading(false));},[]);
  useEffect(()=>{setPortalReady(true);},[]);
  useEffect(()=>{
    if(typeof window!=="undefined")localStorage.setItem("cashledger_daily_cash_columns",JSON.stringify(txColumns));
  },[txColumns]);
  useEffect(()=>{
    if(!portalReady||(!quickDirection&&!completePendingId))return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=previous;};
  },[portalReady,quickDirection,completePendingId]);
  useEffect(()=>{
    if(!today||today.status==="CLOSED"||typeof window==="undefined")return;
    const requested=new URLSearchParams(window.location.search).get("quick");
    if(requested==="IN"||requested==="OUT"){
      setError("");setQuickError("");setQuickFieldErrors({});
      setQuickDirection(requested);
      const url=new URL(window.location.href);
      url.searchParams.delete("quick");
      window.history.replaceState({}, "", url.pathname+url.search+url.hash);
    }
  },[today?.id,today?.status]);
  const countedTotal=useMemo(()=>denominations.reduce((sum,note)=>sum+note*Number(qty[note]||0),0),[qty]);
  const expected=Number(today?.liveExpectedClosingTotal??today?.expectedClosingTotal??today?.openingTotal??0);
  const cashIn=Number(today?.liveCashIn??0),cashOut=Number(today?.liveCashOut??0);
  const commission=Number(today?.commissionEarned??0);
  const previewDifference=countedTotal-expected;
  const closedDifference=Number(today?.differenceAmount??0);
  const isClosed=today?.status==="CLOSED";
  const cashAccounts=accounts.filter((account)=>account.accountType==="CASH"&&account.isActive!==false);
  const cashDrawer=cashAccounts.find((account)=>account.id===cashAccountId)??cashAccounts[0];
  const anyCashDrawer=accounts.find((account)=>account.accountType==="CASH");
  const otherCashAccounts=cashAccounts.filter((account)=>account.id!==cashAccountId);
  const canConfigure=role==="OWNER"||role==="ADMIN";

  const closedHistory=useMemo(()=>history.filter((session)=>session.status==="CLOSED"),[history]);
  const previousHistory=useMemo(()=>closedHistory.filter((session)=>session.id!==today?.id),[closedHistory,today?.id]);
  const historyRows=useMemo(()=>{
    const limit=range==="7d"?7:30;
    return closedHistory.slice(0,limit).reverse();
  },[closedHistory,range]);

  const serviceGroups=useMemo(()=>{
    const palette=["#55a4f4","#6366d9","#12a47b","#f0ad4e","#d84b5f","#8b5cf6","#14b8a6","#f97316"];
    const rows=(today?.serviceSummary??[])
      .filter((row)=>row.id!=="REVERSAL")
      .map((row)=>({...row,label:friendlyService(row.id),value:row.cashIn+row.cashOut}))
      .filter((row)=>row.value>0);
    const total=Math.max(1,rows.reduce((sum,row)=>sum+row.value,0));
    return rows.map((row,index)=>({
      ...row,
      color:palette[index%palette.length],
      percentage:(row.value/total)*100,
    }));
  },[today?.serviceSummary]);
  const serviceMovementTotal=useMemo(()=>serviceGroups.reduce((sum,row)=>sum+row.value,0),[serviceGroups]);

  useEffect(()=>{
    if(typeof window!=="undefined")localStorage.setItem("cashledger_daily_cash_view",ledgerView);
  },[ledgerView]);

  const cashBookRows=useMemo(()=>{
    const activities=[...(today?.activities??[])].reverse();
    const rowsFor=(target:QuickCashDirection)=>activities
      .filter((activity)=>activity.quickCashDirection
        ?activity.quickCashDirection===target
        :target==="IN"?activity.cashIn>0:activity.cashOut>0)
      .map((activity)=>({
        activity,
        amount:target==="IN"?activity.cashIn:activity.cashOut,
      }))
      .filter((row)=>row.amount>0);
    return {IN:rowsFor("IN"),OUT:rowsFor("OUT")};
  },[today?.activities]);
  const cashBookTotals=useMemo(()=>{
    const summarize=(rows:typeof cashBookRows.IN)=>({
      amount:rows.reduce((sum,row)=>sum+row.amount,0),
      commission:rows.reduce((sum,row)=>sum+Number(row.activity.commissionAmount||0),0),
    });
    return {IN:summarize(cashBookRows.IN),OUT:summarize(cashBookRows.OUT)};
  },[cashBookRows]);

  const visibleActivities=useMemo(()=>{
    return [...(today?.activities??[])].filter((activity)=>{
      const directionMatch=direction==="ALL"||
        (direction==="ADJUSTMENT"?activity.serviceType==="CASH_ADJUSTMENT":
          direction==="REVERSAL"?activity.serviceType==="REVERSAL":
          direction==="COMMISSION"?activity.commissionAmount>0:
          direction==="IN"?(activity.quickCashDirection?activity.quickCashDirection==="IN":activity.cashIn>0):
          (activity.quickCashDirection?activity.quickCashDirection==="OUT":activity.cashOut>0));
      const serviceMatch=!serviceFilter||activity.serviceType===serviceFilter;
      return directionMatch&&serviceMatch;
    }).reverse();
  },[today?.activities,direction,serviceFilter]);
  const transactionServices=useMemo(()=>{
    return Array.from(new Set((today?.activities??[]).map((activity)=>activity.serviceType))).sort((a,b)=>friendlyService(a).localeCompare(friendlyService(b)));
  },[today?.activities]);
  const displayedTxColumns=useMemo<TxColumn[]>(()=>direction==="COMMISSION"?["TIME","PARTICULAR","SERVICE","CUSTOMER_FEE"]:txColumns,[direction,txColumns]);
  const txGridTemplate=useMemo(()=>txColumnDefs.filter((column)=>displayedTxColumns.includes(column.id)).map((column)=>column.width).join(" "),[displayedTxColumns]);
  const txTableMinWidth=useMemo(()=>{
    const minimums:Record<TxColumn,number>={
      TIME:72,PARTICULAR:240,SERVICE:140,TXN_AMOUNT:110,CASH_IN:105,CASH_OUT:105,
      CUSTOMER_FEE:115,PROVIDER_FEE:115,PROFIT:105,DRAWER:115,
    };
    const visible=displayedTxColumns.reduce((sum,column)=>sum+minimums[column],0);
    const gaps=Math.max(0,displayedTxColumns.length-1)*16;
    return Math.max(direction==="COMMISSION"?640:760,visible+gaps+40);
  },[displayedTxColumns,direction]);
  const quickServiceOptions=useMemo(()=>serviceCatalog.filter((item)=>item.isActive!==false).slice(0,5),[serviceCatalog]);
  function toggleTxColumn(id:TxColumn){
    setTxColumns((current)=>current.includes(id)?(current.length===1?current:current.filter((column)=>column!==id)):[...current,id]);
  }
  function keepQuickFieldVisible(element:HTMLElement){
    window.setTimeout(()=>element.scrollIntoView({behavior:"smooth",block:"center"}),120);
  }

  function denominationPayload(){return denominations.map((denomination)=>({denomination,quantity:Number(qty[denomination]||0)}));}

  function openCashBookReverse(activity:Activity){
    setReverseActivity(activity);setReverseReason("");setReverseError("");
  }
  async function reverseCashBookTransaction(event:FormEvent){
    event.preventDefault();
    if(!reverseActivity||reverseReason.trim().length<3)return;
    setReverseSaving(true);setReverseError("");
    try{
      await apiFetch("/transactions/"+reverseActivity.transactionId+"/reverse",{
        method:"POST",body:JSON.stringify({reason:reverseReason.trim()}),
      });
      setReverseActivity(null);setReverseReason("");
      await load(cashAccountId||undefined);
    }catch(err){setReverseError(err instanceof Error?err.message:"Reversal failed");}
    finally{setReverseSaving(false);}
  }

  async function openCounter(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    try{
      let targetId=cashAccountId;
      if(!targetId){
        if(anyCashDrawer){
          if(anyCashDrawer.isActive===false){
            if(!canConfigure)throw new Error("Owner/Admin must reactivate the shop cash drawer.");
            await apiFetch("/accounts/"+anyCashDrawer.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:true})});
          }
          targetId=anyCashDrawer.id;
        }else{
          if(!canConfigure)throw new Error("Owner/Admin must set up the shop cash drawer.");
          const created=await apiFetch<Account>("/accounts",{method:"POST",body:JSON.stringify({
            accountName:"Shop Cash Drawer",accountType:"CASH",accountNature:"ASSET",usageType:"BUSINESS",openingBalance:countedTotal,
          })});
          targetId=created.id;
        }
      }
      await apiFetch("/cash-counter/open",{method:"POST",body:JSON.stringify({cashAccountId:targetId,responsibleUserId:canConfigure?(responsibleUserId||undefined):undefined,sourceCashAccountId:sourceCashAccountId||undefined,denominations:denominationPayload()})});
      setCashAccountId(targetId);setQty({});setSourceCashAccountId("");setRange("today");await load(targetId);
    }catch(err){setError(err instanceof Error?err.message:"Failed to start today's cash desk");}
    finally{setSaving(false);}
  }

  async function closeCounter(event:FormEvent){
    event.preventDefault();if(!today||today.status!=="OPEN")return;
    if(Math.abs(previewDifference)>.005){
      setError("Cash cannot be closed until Counted and Expected match. Review the cash ledger for a missing or incorrect transaction.");return;
    }
    setSaving(true);setError("");
    try{
      const handoverToUserId=handoverTarget.startsWith("user:")?handoverTarget.slice(5):undefined;
      const handoverToCashAccountId=handoverTarget.startsWith("account:")?handoverTarget.slice(8):undefined;
      await apiFetch("/cash-counter/"+today.id+"/close",{method:"POST",body:JSON.stringify({
        denominations:denominationPayload(),
        notes:remarks.trim()||undefined,
        handoverToUserId,
        handoverToCashAccountId,
      })});
      setQty({});setRemarks("");setHandoverTarget("");setClosing(false);setRange("today");await load(cashAccountId);
    }catch(err){setError(err instanceof Error?err.message:"Failed to close today's cash desk");}
    finally{setSaving(false);}
  }

  function resetQuickCash(){
    setQuickDirection(null);setQuickAmount("");setQuickPurpose("TRANSFER");setQuickServiceName("");setQuickCommission("");setQuickCommissionMode("CASH");setQuickBeneficiaryMode("UPI");setQuickBeneficiaryUpi("");setQuickBankAccountHolder("");setQuickBankAccountNumber("");setQuickBankIfsc("");setQuickServicePaymentMode("CASH");setQuickServicePaymentAccountId("");setQuickCustomerName("");setQuickMobile("");setQuickRemarks("");setQuickTransactionAt("");setQuickFieldErrors({});setQuickError("");
  }
  function openCashOutFlow(path:string){
    const drawerId=today?.cashAccountId||cashAccountId;
    resetQuickCash();
    router.push(path+(drawerId?"?cashAccountId="+encodeURIComponent(drawerId):""));
  }

  function clearQuickFieldError(field:keyof QuickCashFieldErrors){
    setQuickFieldErrors((current)=>{
      if(!current[field])return current;
      const next={...current};delete next[field];return next;
    });
  }

  async function saveQuickCash(event:FormEvent){
    event.preventDefault();
    if(!quickDirection||!today||isClosed)return;
    const amount=Number(quickAmount),commissionAmount=Number(quickCommission||0);
    const purpose=quickDirection==="IN"?quickPurpose:"TRANSFER";
    const validation:QuickCashFieldErrors={};
    if(!quickAmount.trim()||!Number.isFinite(amount)||amount<=0)validation.amount="Amount must be greater than 0.";
    if(purpose==="TRANSFER"&&(!Number.isFinite(commissionAmount)||commissionAmount<0))validation.commission="Commission cannot be negative.";
    if(purpose==="SERVICE"&&!quickServiceName.trim())validation.serviceName="Service name is required.";
    if(purpose==="SERVICE"&&quickServicePaymentMode==="UPI"&&!quickServicePaymentAccountId)validation.servicePaymentAccount="Choose the receiving bank / UPI account.";
    if(Object.keys(validation).length){
      setQuickFieldErrors(validation);setQuickError("");
      requestAnimationFrame(()=>{
        if(validation.amount)quickAmountRef.current?.focus();
        else if(validation.commission)quickCommissionRef.current?.focus();
        else if(validation.serviceName)quickServiceRef.current?.focus();
      });
      return;
    }
    setQuickSaving(true);setQuickFieldErrors({});setQuickError("");setError("");
    try{
      const beneficiaryDetails=quickBeneficiaryMode==="BANK"
        ?serializeBankBeneficiary(quickBankAccountHolder,quickBankAccountNumber,quickBankIfsc)
        :quickBeneficiaryUpi.trim();
      await apiFetch("/transactions/quick-cash",{method:"POST",body:JSON.stringify({
        direction:quickDirection,
        cashAccountId:today.cashAccountId,
        amount,
        purpose,
        serviceName:purpose==="SERVICE"?quickServiceName.trim():undefined,
        commissionAmount:purpose==="TRANSFER"?commissionAmount:0,
        commissionMode:purpose==="TRANSFER"&&commissionAmount>0?quickCommissionMode:undefined,
        beneficiaryMode:purpose==="TRANSFER"&&quickDirection==="IN"&&beneficiaryDetails?quickBeneficiaryMode:undefined,
        beneficiaryDetails:purpose==="TRANSFER"&&quickDirection==="IN"?beneficiaryDetails||undefined:undefined,
        servicePaymentMode:purpose==="SERVICE"?quickServicePaymentMode:undefined,
        servicePaymentAccountId:purpose==="SERVICE"&&quickServicePaymentMode==="UPI"?quickServicePaymentAccountId||undefined:undefined,
        customerName:quickCustomerName.trim()||undefined,
        mobileNumber:quickMobile.trim()||undefined,
        remarks:quickRemarks.trim()||undefined,
        transactionAt:quickDirection==="OUT"&&quickTransactionAt?new Date(quickTransactionAt).toISOString():undefined,
      })});
      resetQuickCash();
      await load(today.cashAccountId);
    }catch(err){setQuickError(err instanceof Error?err.message:"Failed to save cash entry");}
    finally{setQuickSaving(false);}
  }

  async function completeQuickCash(event:FormEvent){
    event.preventDefault();
    if(!completePendingId)return;
    if(!completeSourceAccountId){setCompleteError(completingQuickCash?.direction==="OUT"?"Select the bank / UPI account that received the customer payment.":"Select the transfer account.");return;}
    if(Number(completingQuickCash?.commissionAmount||0)>0&&completingQuickCash?.commissionMode==="UPI"&&!completeCommissionAccountId){setCompleteError("Select the account that received the commission.");return;}
    setQuickSaving(true);setCompleteError("");setError("");
    try{
      const beneficiaryDetails=completeBeneficiaryMode==="BANK"
        ?serializeBankBeneficiary(completeBankAccountHolder,completeBankAccountNumber,completeBankIfsc)
        :completeBeneficiaryUpi.trim();
      await apiFetch("/transactions/quick-cash/"+completePendingId+"/complete",{method:"POST",body:JSON.stringify({
        sourceAccountId:completeSourceAccountId,
        commissionAccountId:Number(completingQuickCash?.commissionAmount||0)>0&&completingQuickCash?.commissionMode==="UPI"?completeCommissionAccountId||undefined:undefined,
        beneficiaryMode:completingQuickCash?.direction==="IN"&&beneficiaryDetails?completeBeneficiaryMode:undefined,
        beneficiaryDetails:completingQuickCash?.direction==="IN"?beneficiaryDetails||undefined:undefined,
        customerName:completeCustomerName.trim()||undefined,
        mobileNumber:completeMobile.trim()||undefined,
        referenceNumber:completeReference.trim()||undefined,
        notes:completeNotes.trim()||undefined,
      })});
      setCompletePendingId(null);setCompleteSourceAccountId("");setCompleteCommissionAccountId("");setCompleteBeneficiaryMode("UPI");setCompleteBeneficiaryUpi("");setCompleteBankAccountHolder("");setCompleteBankAccountNumber("");setCompleteBankIfsc("");setCompleteCustomerName("");setCompleteMobile("");setCompleteReference("");setCompleteNotes("");setCompleteError("");
      await load(cashAccountId);
    }catch(err){setCompleteError(err instanceof Error?err.message:"Failed to complete pending cash entry");}
    finally{setQuickSaving(false);}
  }

  function openPendingCompletion(item:QuickCashPending){
    const mode=item.beneficiaryMode==="BANK"?"BANK":"UPI";
    const bank=mode==="BANK"?parseBankBeneficiary(item.beneficiaryDetails):emptyBankBeneficiary();
    setCompletePendingId(item.id);setCompleteSourceAccountId("");setCompleteCommissionAccountId("");
    setCompleteBeneficiaryMode(mode);
    setCompleteBeneficiaryUpi(mode==="UPI"?(item.beneficiaryDetails||""):"");
    setCompleteBankAccountHolder(bank.accountHolder);setCompleteBankAccountNumber(bank.accountNumber);setCompleteBankIfsc(bank.ifsc);
    setCompleteCustomerName(item.customerName||"");setCompleteMobile(item.mobileNumber||"");setCompleteReference("");setCompleteNotes("");setCompleteError("");
  }

  function selectMovement(movement:{id:string;activityId?:string}){
    const activityId=movement.activityId??movement.id;
    setSelectedActivityId(activityId);
    requestAnimationFrame(()=>document.getElementById("cash-activity-"+activityId)?.scrollIntoView({behavior:"smooth",block:"nearest"}));
  }

  async function selectCashAccount(id:string){
    setCashAccountId(id);setQty({});setClosing(false);setSourceCashAccountId("");setHandoverTarget("");setError("");
    try{await load(id);}catch{setError("Failed to load selected cash drawer");}
  }

  if(loading)return <AppShell><PageLoader label="Loading daily cash desk…"/></AppShell>;

  return <AppShell><div className="cash-desk-page page-enter mx-auto max-w-7xl space-y-3 sm:space-y-5">
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

    {cashAccounts.length?<Surface className="overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 sm:hidden">
        <span className={"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-black "+(isClosed?"bg-emerald-50 text-emerald-700":"bg-violet-50 text-violet-700")}><span className={"h-1.5 w-1.5 rounded-full "+(isClosed?"bg-emerald-500":"bg-violet-500")}/>{isClosed?"Closed":"Live"}</span>
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {cashAccounts.map((account)=><button key={account.id} type="button" onClick={()=>selectCashAccount(account.id)} className={"min-h-8 rounded-lg px-2.5 text-[12px] font-black transition "+(cashAccountId===account.id?"bg-[var(--accent)] text-white":"bg-[var(--surface-soft)] text-[var(--text)]")}>{account.accountName}</button>)}
          </div>
        </div>
        {canConfigure?<button type="button" onClick={()=>router.push("/accounts")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-soft)] text-base font-black text-[var(--accent)]" aria-label="Manage drawers">⋯</button>:null}
      </div>

      <div className="hidden items-center gap-2 px-3 py-2.5 sm:flex">
        <span className="px-1 text-[11px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Drawer</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {cashAccounts.map((account)=><button key={account.id} type="button" onClick={()=>selectCashAccount(account.id)} className={"min-h-9 rounded-xl px-3 text-sm font-black transition "+(cashAccountId===account.id?"bg-[var(--accent)] text-white shadow-sm":"bg-[var(--surface-soft)] text-[var(--text)] hover:bg-[var(--border)]")}>{account.accountName}</button>)}
        </div>
        {today?<span className={"inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-black "+(isClosed?"bg-emerald-50 text-emerald-700":"bg-violet-50 text-violet-700")}><span className={"h-1.5 w-1.5 rounded-full "+(isClosed?"bg-emerald-500":"bg-violet-500")}/>{isClosed?"Closed":"Live"}</span>:null}
        {today&&!isClosed?<button type="button" onClick={()=>document.getElementById("cash-close-panel")?.scrollIntoView({behavior:"smooth",block:"start"})} className="min-h-9 rounded-xl bg-[var(--surface-soft)] px-3 text-xs font-black text-[var(--text)] transition hover:bg-[var(--border)]">Close cash</button>:null}
        {canConfigure?<button type="button" onClick={()=>router.push("/accounts")} className="min-h-9 rounded-xl px-2.5 text-xs font-black text-[var(--accent)]">Manage</button>:null}
      </div>
    </Surface>:null}

    {!today?<Surface className="counter-surface mx-auto max-w-5xl overflow-hidden">
      <form onSubmit={openCounter} className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-4 sm:p-5 lg:p-6">
          <div className="mb-4">
            <h3 className="text-lg font-black tracking-[-.025em]">Opening cash</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Count the notes in the drawer.</p>
          </div>
          {!cashDrawer?<div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5">
            <p className="text-sm font-bold">{anyCashDrawer?"Cash drawer inactive":"First setup"}</p>
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{canConfigure?(anyCashDrawer?"It will be reactivated when you start.":"The cash drawer will be created automatically."):"Owner/Admin setup required."}</p>
          </div>:null}
          <CountGrid qty={qty} setQty={setQty}/>
        </div>
        <aside className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-soft)_36%,var(--surface))] p-4 sm:p-5 lg:border-l lg:border-t-0 lg:p-6">
          <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--text-muted)]">Opening total</p>
          <strong className="money mt-2 block text-[2.25rem] font-black leading-none tracking-[-.055em] text-[var(--accent)] sm:text-[2.6rem]">{money(countedTotal)}</strong>
          <p className="mt-2 text-sm font-semibold text-[var(--text-muted)]">{cashDrawer?.accountName??"Cash drawer"} · new session</p>
          {canConfigure&&operators.length?<label className="mt-4 block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.06em] text-[var(--text-muted)]">Responsible</span><SearchableSelect className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={responsibleUserId} onChange={(event)=>setResponsibleUserId(event.target.value)}>{operators.map((operator)=><option key={operator.id} value={operator.id}>{operator.fullName} · {words(operator.role.name)}</option>)}</SearchableSelect></label>:null}
          {otherCashAccounts.length?<label className="mt-3 block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[.06em] text-[var(--text-muted)]">Opening source</span><SearchableSelect className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={sourceCashAccountId} onChange={(event)=>setSourceCashAccountId(event.target.value)}><option value="">Counted cash already in drawer</option>{otherCashAccounts.map((account)=><option key={account.id} value={account.id}>Issue from {account.accountName}</option>)}</SearchableSelect><p className="mt-1.5 text-xs text-[var(--text-muted)]">If a reserve is selected, this opening amount is transferred from that reserve.</p></label>:null}
          <button disabled={saving||(!cashDrawer&&!canConfigure)} className="app-primary-button mt-5 min-h-12 w-full px-4 text-sm font-black disabled:opacity-40">{saving?"Starting…":"Start session"}</button>
        </aside>
      </form>
    </Surface>:null}

    {today?<>
      <Surface className="cash-desk-hero overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <p className="truncate text-sm font-bold">{today.cashAccount.accountName}{today.openedBy?.fullName?" · "+today.openedBy.fullName:""}</p>
          <p className="shrink-0 text-[13px] font-semibold text-[var(--text-muted)]">{new Date(today.businessDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})} · {new Date(today.openedAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)]">
          <div className="cash-desk-now p-4 sm:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-[.12em] text-[var(--text-muted)]">{isClosed?"Closed cash":"Cash in hand"}</span>
              {!isClosed?<span className="dashboard-live-badge"><i/>Live</span>:<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">Closed</span>}
            </div>
            <strong className="money cash-desk-now-money mt-3 block text-[var(--text)]">{money(isClosed?today.actualClosingTotal||expected:expected)}</strong>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-[var(--text-muted)]">
              <span>Opening {money(today.openingTotal)}</span><span>+</span><span className="text-[var(--money-in)]">In {money(cashIn)}</span><span>−</span><span className="text-[var(--money-out)]">Out {money(cashOut)}</span><span>=</span><strong className="money text-[var(--text)]">{money(expected)}</strong>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-[var(--border)] bg-[var(--border)] lg:border-l lg:border-t-0">
            <MetricCard label="Opening" value={money(today.openingTotal)}/>
            <MetricCard label="In" value={"+"+money(cashIn)} detail={(today.activities??[]).filter((row)=>row.cashIn>0).length+" txns"} tone="in"/>
            <MetricCard label="Out" value={"−"+money(cashOut)} detail={(today.activities??[]).filter((row)=>row.cashOut>0).length+" txns"} tone="out"/>
            <MetricCard label="Commission earned" value={money(commission)} detail="All modes · Cash / UPI / Bank" tone="accent"/>
          </div>
        </div>
      </Surface>

      {pendingQuickCash.length?<Surface className="scroll-mt-24 overflow-hidden">
        <div id="pending-cash" className="scroll-mt-24 flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div><h3 className="text-sm font-extrabold">Pending completion</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Cash given. Add transfer and commission account details before end of day.</p></div>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-black text-amber-800">{pendingQuickCash.length}</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {pendingQuickCash.map((item)=><div key={item.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[90px_minmax(0,1fr)_auto_auto] sm:items-center sm:px-5">
            <div><span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-black "+(item.direction==="IN"?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-700")}>{item.direction==="IN"?"Cash In":"Cash Out"}</span></div>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{item.customerName||item.mobileNumber||"Walk-in customer"}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.transaction.transactionNumber} · {new Date(item.transaction.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p></div>
            <div className="text-left sm:text-right"><strong className="money block text-sm">{money(item.amount)}</strong>{Number(item.commissionAmount)>0?<span className="text-xs font-semibold text-[var(--accent)]">Fee {money(item.commissionAmount)} · {item.commissionMode==="UPI"?"UPI":"Cash"}</span>:null}</div>
            <button type="button" onClick={()=>openPendingCompletion(item)} className="min-h-10 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-black text-amber-800">Complete</button>
          </div>)}
        </div>
      </Surface>:null}

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div>
            <h3 className="text-sm font-extrabold">Balance</h3>
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{range==="today"?"Through the day":"Expected vs counted"}</p>
          </div>
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-1">
            {([["today","Today"],["7d","7D"],["30d","30D"]] as Array<[Range,string]>).map(([id,label])=><button key={id} type="button" onClick={()=>{setRange(id);setSelectedHistoryId(null);}} className={"min-h-8 rounded-lg px-3 text-[13px] font-extrabold "+(range===id?"bg-[var(--accent)] text-white shadow-sm":"text-[var(--text-muted)]")}>{label}</button>)}
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {range==="today"?<CashMovementChart opening={Number(today.openingTotal)} movements={today.movements??[]} selectedId={selectedActivityId} onSelect={selectMovement}/>:<CashHistoryChart rows={historyRows} selectedId={selectedHistoryId} onSelect={(row)=>setSelectedHistoryId(row.id)}/>}
        </div>
      </Surface>

      {serviceGroups.length?<Surface className="cash-service-mix overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <div><h3 className="text-sm font-extrabold">Cash mix</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Where today&apos;s physical cash moved</p></div>
          {serviceFilter?<button type="button" onClick={()=>setServiceFilter(null)} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-bold text-[var(--accent)]">Clear</button>:null}
        </div>
        <div className="grid lg:grid-cols-[330px_minmax(0,1fr)]">
          <div className="cash-service-donut border-b border-[var(--border)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <FundsAllocationDonut
              items={serviceGroups}
              total={serviceMovementTotal}
              selectedId={serviceFilter}
              centerLabel="Cash moved"
              centerHint="Tap a slice"
              ariaLabel="Today cash movement by service"
              className="cash-service-donut-frame"
              onSelect={(item)=>setServiceFilter((current)=>current===item.id?null:item.id)}
            />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {serviceGroups.map((row)=><button key={row.id} type="button" onClick={()=>setServiceFilter((current)=>current===row.id?null:row.id)} className={"cash-service-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 text-left transition sm:px-5 "+(serviceFilter===row.id?"bg-[var(--accent-soft)]":"hover:bg-[var(--surface-soft)]")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:row.color}}/><strong className="truncate text-[15px] font-extrabold">{row.label}</strong></div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-5 text-[13px] font-semibold text-[var(--text-muted)]">
                  <span>{row.count} txn{row.count===1?"":"s"}</span>
                  <span className="text-[var(--money-in)]">In {money(row.cashIn)}</span>
                  <span className="text-[var(--money-out)]">Out {money(row.cashOut)}</span>
                  <span className="text-[var(--accent)]">Earned {money(row.commissionAmount)}</span>
                </div>
              </div>
              <div className="shrink-0 text-right"><strong className="money block text-base font-black">{money(row.value)}</strong><span className="mt-0.5 block text-xs font-bold text-[var(--text-muted)]">{row.percentage.toFixed(0)}%</span></div>
            </button>)}
          </div>
        </div>
      </Surface>:null}

{ledgerView==="CASHBOOK"?<>
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold">Cash book</h3>
              <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Simple daily view · time, particular, amount and commission</p>
            </div>
            <div className="grid grid-cols-2 rounded-xl bg-[var(--surface-soft)] p-1">
              <button type="button" className="min-h-8 rounded-lg bg-[var(--surface)] px-3 text-xs font-black text-[var(--text)] shadow-sm">Cash Book</button>
              <button type="button" onClick={()=>setLedgerView("DETAILED")} className="min-h-8 rounded-lg px-3 text-xs font-black text-[var(--text-muted)]">Detailed</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 rounded-xl bg-[var(--surface-soft)] p-1 lg:hidden">
            <button type="button" onClick={()=>setCashBookMobileDirection("IN")} className={"min-h-9 rounded-lg text-sm font-black "+(cashBookMobileDirection==="IN"?"bg-[var(--surface)] text-[var(--money-in)] shadow-sm":"text-[var(--text-muted)]")}>Cash In</button>
            <button type="button" onClick={()=>setCashBookMobileDirection("OUT")} className={"min-h-9 rounded-lg text-sm font-black "+(cashBookMobileDirection==="OUT"?"bg-[var(--surface)] text-[var(--money-out)] shadow-sm":"text-[var(--text-muted)]")}>Cash Out</button>
          </div>
        </div>

        <div className="hidden lg:grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--border)]">
          {(["IN","OUT"] as QuickCashDirection[]).map((side)=>{
            const rows=cashBookRows[side],totals=cashBookTotals[side];
            return <div key={side} className="min-w-0">
              <div className={"flex items-center justify-between border-b border-[var(--border)] px-4 py-3 "+(side==="IN"?"bg-emerald-50/55":"bg-rose-50/55")}>
                <div><p className={"text-sm font-black "+(side==="IN"?"text-emerald-700":"text-rose-700")}>{side==="IN"?"Cash In":"Cash Out"}</p><p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">{rows.length} entr{rows.length===1?"y":"ies"}</p></div>
                <div className="text-right"><strong className="money block text-base font-black">{money(totals.amount)}</strong><span className="text-xs font-bold text-[var(--accent)]">Comm {money(totals.commission)}</span></div>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)_100px_86px] gap-3 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-[10px] font-black uppercase tracking-[.06em] text-[var(--text-muted)]">
                <span>Time</span><span>Particular</span><span className="text-right">Amount</span><span className="text-right">Comm.</span>
              </div>
              {rows.length?<div className="divide-y divide-[var(--border)]">{rows.map(({activity,amount})=><div key={activity.id} role="button" tabIndex={0} onClick={()=>router.push("/transactions/"+activity.transactionId)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" ")router.push("/transactions/"+activity.transactionId);}} className="grid w-full cursor-pointer grid-cols-[72px_minmax(0,1fr)_100px_86px] items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-soft)]">
                <span className="text-xs font-semibold text-[var(--text-muted)]">{new Date(activity.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold">{activity.particular}</span>
                  {(role==="OWNER"||role==="ADMIN")&&activity.serviceType!=="REVERSAL"?<span className="mt-0.5 flex items-center gap-2 text-[10px] font-black">
                    {activity.transactionStatus==="REVERSED"?<span className="text-rose-500">Reversed</span>:<button type="button" onClick={(event)=>{event.stopPropagation();openCashBookReverse(activity);}} className="text-rose-600 hover:underline">↩ Reverse</button>}
                  </span>:null}
                </span>
                <strong className={"money text-right text-sm "+(side==="IN"?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{money(amount)}</strong>
                <span className="text-right">{activity.commissionAmount?<><strong className="money block text-sm text-[var(--accent)]">{money(activity.commissionAmount)}</strong>{commissionReceiptLabel(activity)?<span className="mt-0.5 block text-[9px] font-black uppercase tracking-wide text-[var(--text-muted)]">{commissionReceiptLabel(activity)}</span>:null}</>:<strong className="money text-sm text-[var(--accent)]">—</strong>}</span>
              </div>)}</div>:<div className="px-4 py-8 text-center text-sm font-semibold text-[var(--text-muted)]">No {side==="IN"?"Cash In":"Cash Out"} entries</div>}
              <div className="grid grid-cols-[72px_minmax(0,1fr)_100px_86px] gap-3 border-t border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm">
                <span/><strong>Total</strong><strong className="money text-right">{money(totals.amount)}</strong><strong className="money text-right text-[var(--accent)]">{money(totals.commission)}</strong>
              </div>
            </div>;
          })}
        </div>

        <div className="lg:hidden">
          {(()=>{
            const side=cashBookMobileDirection,rows=cashBookRows[side],totals=cashBookTotals[side];
            return <>
              <div className="grid grid-cols-[58px_minmax(0,1fr)_82px_68px] gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-[9px] font-black uppercase tracking-[.05em] text-[var(--text-muted)]">
                <span>Time</span><span>Particular</span><span className="text-right">Amount</span><span className="text-right">Comm.</span>
              </div>
              {rows.length?<div className="divide-y divide-[var(--border)]">{rows.map(({activity,amount})=><div key={activity.id} role="button" tabIndex={0} onClick={()=>router.push("/transactions/"+activity.transactionId)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" ")router.push("/transactions/"+activity.transactionId);}} className="grid w-full cursor-pointer grid-cols-[58px_minmax(0,1fr)_82px_68px] items-center gap-2 px-3 py-3 text-left">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">{new Date(activity.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>
                <span className="min-w-0"><span className="block truncate text-[13px] font-bold">{activity.particular}</span>{(role==="OWNER"||role==="ADMIN")&&activity.serviceType!=="REVERSAL"?<span className="mt-0.5 block text-[9px] font-black">{activity.transactionStatus==="REVERSED"?<span className="text-rose-500">Reversed</span>:<button type="button" onClick={(event)=>{event.stopPropagation();openCashBookReverse(activity);}} className="text-rose-600">↩ Reverse</button>}</span>:null}</span>
                <strong className={"money text-right text-[13px] "+(side==="IN"?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{money(amount)}</strong>
                <span className="text-right">{activity.commissionAmount?<><strong className="money block text-[13px] text-[var(--accent)]">{money(activity.commissionAmount)}</strong>{commissionReceiptLabel(activity)?<span className="mt-0.5 block text-[8px] font-black uppercase text-[var(--text-muted)]">{commissionReceiptLabel(activity)}</span>:null}</>:<strong className="money text-[13px] text-[var(--accent)]">—</strong>}</span>
              </div>)}</div>:<div className="px-4 py-8 text-center text-sm font-semibold text-[var(--text-muted)]">No {side==="IN"?"Cash In":"Cash Out"} entries</div>}
              <div className="grid grid-cols-[58px_minmax(0,1fr)_82px_68px] gap-2 border-t border-[var(--border)] bg-[var(--surface-soft)] px-3 py-3 text-[13px]">
                <span/><strong>Total</strong><strong className="money text-right">{money(totals.amount)}</strong><strong className="money text-right text-[var(--accent)]">{money(totals.commission)}</strong>
              </div>
            </>;
          })()}
        </div>
      </Surface>
      </>:<>
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-sm font-extrabold">Transactions</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{visibleActivities.length} of {today.activities?.length??0}</p></div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="mr-1 grid grid-cols-2 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={()=>setLedgerView("CASHBOOK")} className="min-h-8 rounded-lg px-3 text-xs font-black text-[var(--text-muted)]">Cash Book</button>
                <button type="button" className="min-h-8 rounded-lg bg-[var(--surface)] px-3 text-xs font-black text-[var(--text)] shadow-sm">Detailed</button>
              </div>
              {([["ALL","All"],["IN","Cash In"],["OUT","Cash Out"],["COMMISSION","Commission"],["REVERSAL","Reversal"],["ADJUSTMENT","Adjust"]] as Array<[DirectionFilter,string]>).map(([id,label])=><button key={id} type="button" onClick={()=>setDirection(id)} className={"min-h-9 rounded-xl border px-3 text-sm font-extrabold "+(direction===id?"border-[var(--accent)] bg-[var(--accent)] text-white":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{label}</button>)}
              <SearchableSelect className="min-h-9 min-w-[150px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-bold text-[var(--text)]" value={serviceFilter??""} onChange={(event)=>setServiceFilter(event.target.value||null)}>
                <option value="">All services</option>
                {transactionServices.map((service)=><option key={service} value={service}>{friendlyService(service)}</option>)}
              </SearchableSelect>
              {direction==="COMMISSION"
                ?<span className="inline-flex min-h-9 items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-extrabold text-[var(--accent)]">Commission only</span>
                :<details className="relative">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-extrabold text-[var(--text-muted)] [&::-webkit-details-marker]:hidden">
                    Columns <span className="rounded-md bg-[var(--surface-soft)] px-1.5 py-0.5 text-[11px]">{txColumns.length}</span>
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl">
                    <div className="flex items-center justify-between px-2 py-1.5"><span className="text-xs font-black uppercase tracking-[.08em] text-[var(--text-muted)]">Show columns</span><button type="button" onClick={()=>setTxColumns(defaultTxColumns)} className="text-xs font-bold text-[var(--accent)]">Reset</button></div>
                    {txColumnDefs.map((column)=><label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm font-bold hover:bg-[var(--surface-soft)]">
                      <input type="checkbox" checked={txColumns.includes(column.id)} onChange={()=>toggleTxColumn(column.id)} className="h-4 w-4 accent-[var(--accent)]"/>
                      <span>{column.label}</span>
                    </label>)}
                  </div>
                </details>}
            </div>
          </div>
          {(direction!=="ALL"||serviceFilter)?<div className="mt-2 flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]"><span>Filtered view</span><button type="button" onClick={()=>{setDirection("ALL");setServiceFilter(null);}} className="font-black text-[var(--accent)]">Clear filters</button></div>:null}
        </div>
        {visibleActivities.length?<div className="overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
          <div className="cash-ledger-header hidden gap-4 border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-3 text-xs font-extrabold uppercase tracking-[.05em] text-[var(--text-muted)] xl:grid" style={{gridTemplateColumns:txGridTemplate,minWidth:txTableMinWidth}}>
            {displayedTxColumns.includes("TIME")?<span>Time</span>:null}
            {displayedTxColumns.includes("PARTICULAR")?<span>Particular</span>:null}
            {displayedTxColumns.includes("SERVICE")?<span>Service</span>:null}
            {displayedTxColumns.includes("TXN_AMOUNT")?<span className="text-right">Txn amount</span>:null}
            {displayedTxColumns.includes("CASH_IN")?<span className="text-right">Cash in</span>:null}
            {displayedTxColumns.includes("CASH_OUT")?<span className="text-right">Cash out</span>:null}
            {displayedTxColumns.includes("CUSTOMER_FEE")?<span className="text-right">{direction==="COMMISSION"?"Commission":"Customer fee"}</span>:null}
            {displayedTxColumns.includes("PROVIDER_FEE")?<span className="text-right">Provider fee</span>:null}
            {displayedTxColumns.includes("PROFIT")?<span className="text-right">Profit</span>:null}
            {displayedTxColumns.includes("DRAWER")?<span className="text-right">Drawer</span>:null}
          </div>
          <div className="divide-y divide-[var(--border)]">
          {visibleActivities.map((activity)=>{
            const selected=activity.id===selectedActivityId;
            return <button id={"cash-activity-"+activity.id} key={activity.id} type="button" onClick={()=>{setSelectedActivityId(activity.id);router.push("/transactions/"+activity.transactionId);}} className={"cash-activity-row w-full px-4 py-4 text-left transition sm:px-5 "+(selected?"bg-[var(--accent-soft)]":"hover:bg-[var(--surface-soft)]")}>
              <div className="hidden items-center gap-4 xl:grid" style={{gridTemplateColumns:txGridTemplate,minWidth:txTableMinWidth-40}}>
                {displayedTxColumns.includes("TIME")?<span className="text-[13px] font-semibold text-[var(--text-muted)]">{new Date(activity.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>:null}
                {displayedTxColumns.includes("PARTICULAR")?<div className="min-w-0"><p className="truncate text-[15px] font-bold">{activity.particular}</p><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{activity.transactionNumber}</p></div>:null}
                {displayedTxColumns.includes("SERVICE")?<span className="truncate text-[13px] font-semibold text-[var(--text-muted)]">{friendlyService(activity.serviceType)}</span>:null}
                {displayedTxColumns.includes("TXN_AMOUNT")?<strong className="money text-right text-sm">{money(activity.transactionAmount)}</strong>:null}
                {displayedTxColumns.includes("CASH_IN")?<strong className="money text-right text-sm text-[var(--money-in)]">{activity.cashIn?money(activity.cashIn):"—"}</strong>:null}
                {displayedTxColumns.includes("CASH_OUT")?<strong className="money text-right text-sm text-[var(--money-out)]">{activity.cashOut?money(activity.cashOut):"—"}</strong>:null}
                {displayedTxColumns.includes("CUSTOMER_FEE")?<strong className="money text-right text-sm text-[var(--accent)]">{activity.commissionAmount?money(activity.commissionAmount):"—"}</strong>:null}
                {displayedTxColumns.includes("PROVIDER_FEE")?<strong className="money text-right text-sm text-[var(--money-out)]">{activity.providerFeeAmount?"−"+money(activity.providerFeeAmount):"—"}</strong>:null}
                {displayedTxColumns.includes("PROFIT")?<strong className={"money text-right text-sm "+((activity.profitAmount??0)>=0?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{activity.profitAmount!==undefined?money(activity.profitAmount):"—"}</strong>:null}
                {displayedTxColumns.includes("DRAWER")?<strong className="money text-right text-sm">{money(activity.runningBalance)}</strong>:null}
              </div>
              {direction==="COMMISSION"
                ?<div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 xl:hidden">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-sm font-black text-[var(--accent)]">₹</span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold">{activity.particular}</p>
                    <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{friendlyService(activity.serviceType)} · {new Date(activity.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{activity.transactionNumber}</p>
                  </div>
                  <div className="text-right"><strong className="money block text-[17px] font-black text-[var(--accent)]">{money(activity.commissionAmount)}</strong><span className="mt-0.5 block text-xs font-semibold text-[var(--text-muted)]">Commission</span></div>
                </div>
                :<div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 xl:hidden">
                  <span className={"grid h-10 w-10 place-items-center rounded-xl text-sm font-black "+(!activity.cashIn&&!activity.cashOut&&activity.commissionAmount?"bg-[var(--accent-soft)] text-[var(--accent)]":activity.cashIn>=activity.cashOut?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-600")}>{!activity.cashIn&&!activity.cashOut&&activity.commissionAmount?"₹":activity.cashIn>=activity.cashOut?"↓":"↑"}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold">{activity.particular}</p>
                    <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{friendlyService(activity.serviceType)} · {new Date(activity.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Txn {money(activity.transactionAmount)}{activity.commissionAmount?" · Fee "+money(activity.commissionAmount):""}{activity.providerFeeAmount?" · Provider −"+money(activity.providerFeeAmount):""}{activity.profitAmount!==undefined?" · Profit "+money(activity.profitAmount):""}</p>
                  </div>
                  <div className="text-right">
                    {activity.cashIn?<strong className="money block text-[15px] text-[var(--money-in)]">+{money(activity.cashIn)}</strong>:null}
                    {activity.cashOut?<strong className="money block text-[15px] text-[var(--money-out)]">−{money(activity.cashOut)}</strong>:null}
                    <span className="money mt-0.5 block text-xs font-semibold text-[var(--text-muted)]">Drawer {money(activity.runningBalance)}</span>
                  </div>
                </div>}
            </button>;
          })}
          </div>
        </div>:<div className="p-5 sm:p-7"><EmptyState title="No transactions yet" description="Cash movements and commission earned during this session will appear here."/></div>}
      </Surface>
      </>}

      <div id="cash-close-panel" className="scroll-mt-20">
        <Surface className="counter-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div><h3 className="text-sm font-extrabold">{isClosed?"Session closed":"Close / hand over"}</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{isClosed?"Final cash reconciliation":"Count the drawer when this cash session ends"}</p></div>
            {!isClosed?<span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-extrabold text-[var(--accent)]">{money(expected)} expected</span>:null}
          </div>

          {isClosed?<div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="border-b border-[var(--border)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <div className={"rounded-2xl border p-5 "+(Math.abs(closedDifference)>.005?"border-amber-200 bg-amber-50":"border-emerald-200 bg-emerald-50")}>
                <p className={"text-sm font-black "+(Math.abs(closedDifference)>.005?"text-amber-800":"text-emerald-700")}>{Math.abs(closedDifference)>.005?"LEGACY VARIANCE":"✓ CASH MATCHED"}</p>
                <div className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3"><span>Opening</span><strong className="money">{money(today.openingTotal)}</strong></div>
                  <div className="flex justify-between gap-3 text-[var(--money-in)]"><span>Cash in</span><strong className="money">+{money(cashIn)}</strong></div>
                  <div className="flex justify-between gap-3 text-[var(--money-out)]"><span>Cash out</span><strong className="money">−{money(cashOut)}</strong></div>
                  <div className="flex justify-between gap-3 border-t border-current/10 pt-2.5"><span>Expected</span><strong className="money">{money(expected)}</strong></div>
                  <div className="flex justify-between gap-3"><span>Counted</span><strong className="money">{money(today.actualClosingTotal||0)}</strong></div>
                  <div className="flex justify-between gap-3 text-base"><span className="font-bold">Difference</span><strong className="money">{money(closedDifference)}</strong></div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--text-muted)]">
                {today.closedBy?.fullName?<span>Closed by <strong className="text-[var(--text)]">{today.closedBy.fullName}</strong></span>:null}
                {today.closedAt?<span>{new Date(today.closedAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>:null}
              </div>
            </div>
            <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-2">
              <div><p className="mb-3 text-sm font-extrabold">Opening denominations</p><CountBreakdown counts={today.denominationCounts} type="OPENING"/></div>
              <div><p className="mb-3 text-sm font-extrabold">Closing denominations</p><CountBreakdown counts={today.denominationCounts} type="CLOSING"/></div>
            </div>
          </div>:!closing?<div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)_240px]">
            <div className="border-b border-[var(--border)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <p className="text-xs font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Expected cash</p>
              <strong className="money mt-2 block text-[2.2rem] font-black tracking-[-.05em] text-[var(--accent)]">{money(expected)}</strong>
              <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[13px] font-semibold text-[var(--text-muted)]">
                <span>{money(today.openingTotal)}</span><span>+</span><span className="text-[var(--money-in)]">{money(cashIn)}</span><span>−</span><span className="text-[var(--money-out)]">{money(cashOut)}</span>
              </div>
            </div>
            <div className="border-b border-[var(--border)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <p className="mb-3 text-sm font-extrabold">Opening denominations</p>
              <CountBreakdown counts={today.denominationCounts} type="OPENING"/>
            </div>
            <div className="flex flex-col justify-center p-4 sm:p-5">
              <button type="button" onClick={()=>{setClosing(true);setQty({});setError("");}} className="app-primary-button min-h-12 w-full px-4 text-sm font-black">Count & close</button>
              <p className="mt-2 text-center text-xs text-[var(--text-muted)]">A session can close and reopen multiple times in the same day.</p>
            </div>
          </div>:<form onSubmit={closeCounter} className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_360px]">
            <div className="border-b border-[var(--border)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-sm font-extrabold">Closing count</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">Count every note. It must match.</p></div>
                <button type="button" onClick={()=>{setClosing(false);setQty({});setRemarks("");setError("");}} className="text-sm font-bold text-[var(--text-muted)]">Cancel</button>
              </div>
              <CountGrid qty={qty} setQty={setQty}/>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Expected</p><p className="money mt-1 text-sm font-black">{money(expected)}</p></div>
                <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Counted</p><p className="money mt-1 text-sm font-black">{money(countedTotal)}</p></div>
                <div className={"rounded-xl p-3 "+(Math.abs(previewDifference)>.005?"bg-rose-50":"bg-emerald-50")}><p className={"text-xs font-bold uppercase "+(Math.abs(previewDifference)>.005?"text-rose-600":"text-emerald-700")}>Difference</p><p className={"money mt-1 text-sm font-black "+(Math.abs(previewDifference)>.005?"text-rose-700":"text-emerald-700")}>{money(previewDifference)}</p></div>
              </div>
              {Math.abs(previewDifference)>.005?<div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-black text-rose-700">NOT READY TO CLOSE</p>
                <p className="mt-1 text-[13px] font-semibold text-rose-700">{previewDifference>0?"Over":"Short"} by {money(Math.abs(previewDifference))}. Check the ledger before closing.</p>
              </div>:<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-700">✓ Cash matches. Ready to close.</div>}
              <label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold">After closing</span><SearchableSelect className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" value={handoverTarget} onChange={(event)=>setHandoverTarget(event.target.value)}><option value="">Close session only</option><optgroup label="Hand over same drawer">{operators.filter((operator)=>operator.id!==today.openedBy?.id).map((operator)=><option key={operator.id} value={"user:"+operator.id}>To {operator.fullName}</option>)}</optgroup>{otherCashAccounts.length?<optgroup label="Move all cash to">{otherCashAccounts.map((account)=><option key={account.id} value={"account:"+account.id}>{account.accountName}</option>)}</optgroup>:null}</SearchableSelect><p className="mt-1.5 text-xs text-[var(--text-muted)]">Person handover keeps cash in this drawer. Reserve/drawer handover moves the cash internally.</p></label>
              <label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold">Note <span className="font-normal text-[var(--text-muted)]">(optional)</span></span><textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-base sm:text-sm" placeholder="Closing / handover note" value={remarks} onChange={(event)=>setRemarks(event.target.value)}/></label>
              <button disabled={saving||Math.abs(previewDifference)>.005} className="mt-4 min-h-12 w-full rounded-xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--surface)] disabled:opacity-35">{saving?"Closing…":Math.abs(previewDifference)>.005?"Match cash to close":handoverTarget?"Close & hand over":"Close session"}</button>
            </div>
          </form>}
        </Surface>
      </div>
    </>:null}

    {portalReady&&!loading&&!quickDirection&&!completePendingId?createPortal(<div className="fixed right-3 z-[70] flex flex-col items-end gap-2 bottom-[calc(5.35rem+env(safe-area-inset-bottom))] lg:bottom-5 lg:right-5">
      <button type="button" aria-label="Cash in" onClick={()=>{if(!today||today.status==="CLOSED"){setError("Open or reopen the cash session to record Cash In");window.scrollTo({top:0,behavior:"smooth"});return;}setError("");setQuickError("");setQuickFieldErrors({});setQuickDirection("IN");}} className="flex min-h-10 items-center gap-2 rounded-full bg-emerald-600 px-3.5 text-[13px] font-black text-white shadow-[0_6px_18px_rgba(5,150,105,.20)] transition hover:-translate-y-0.5 active:translate-y-0">
        <span className="text-base">↓</span><span>Cash In</span>
      </button>
      <button type="button" aria-label="Cash out" onClick={()=>{if(!today||today.status==="CLOSED"){setError("Open or reopen the cash session to record Cash Out");window.scrollTo({top:0,behavior:"smooth"});return;}setError("");setQuickError("");setQuickFieldErrors({});setQuickDirection("OUT");}} className="flex min-h-10 items-center gap-2 rounded-full bg-rose-600 px-3.5 text-[13px] font-black text-white shadow-[0_6px_18px_rgba(225,29,72,.18)] transition hover:-translate-y-0.5 active:translate-y-0">
        <span className="text-base">↑</span><span>Cash Out</span>
      </button>
    </div>,document.body):null}

    {portalReady&&quickDirection?createPortal(<div className="fixed inset-0 z-[100] grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-5" role="dialog" aria-modal="true">
      <form onSubmit={saveQuickCash} className="cash-quick-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--surface)] shadow-2xl sm:max-h-[86dvh] sm:max-w-[520px] sm:rounded-[26px]">
        <div className="flex items-center justify-between px-5 pb-1.5 pt-4">
          <div className="flex items-center gap-3">
            <span className={"grid h-10 w-10 place-items-center rounded-full text-xl font-black "+(quickDirection==="IN"?"bg-emerald-100 text-emerald-700":"bg-rose-100 text-rose-700")}>{quickDirection==="IN"?"↓":"↑"}</span>
            <div>
              <h3 className="text-[22px] font-black tracking-[-.04em]">{quickDirection==="IN"?"Cash In":"Cash Out"}</h3>
              <p className="text-[12px] font-bold text-[var(--text-muted)]">{quickDirection==="IN"&&quickPurpose==="SERVICE"?"Service income · completes now":quickDirection==="OUT"?"UPI / QR received · cash paid to customer":"Transfer · complete source later"}</p>
            </div>
          </div>
          <button type="button" onClick={resetQuickCash} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-soft)] text-xl font-bold text-[var(--text-muted)]" aria-label="Close">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {quickDirection==="IN"?<div className="mx-5 mt-2 grid grid-cols-2 rounded-[14px] bg-[var(--surface-soft)] p-1">
          <button type="button" onClick={()=>{setQuickPurpose("TRANSFER");setQuickError("");clearQuickFieldError("serviceName");}} className={"min-h-9 rounded-[10px] text-[13px] font-black transition "+(quickPurpose==="TRANSFER"?"bg-[var(--surface)] text-[var(--text)] shadow-[0_2px_8px_rgba(15,23,42,.08)]":"text-[var(--text-muted)]")}>Transfer</button>
          <button type="button" onClick={()=>{setQuickPurpose("SERVICE");setQuickCommission("");setQuickError("");clearQuickFieldError("commission");}} className={"min-h-9 rounded-[10px] text-[13px] font-black transition "+(quickPurpose==="SERVICE"?"bg-[var(--surface)] text-[var(--text)] shadow-[0_2px_8px_rgba(15,23,42,.08)]":"text-[var(--text-muted)]")}>Service</button>
        </div>:<div className="mx-5 mt-2 grid grid-cols-3 rounded-[14px] bg-[var(--surface-soft)] p-1">
          <button type="button" className="min-h-10 rounded-[10px] bg-[var(--surface)] px-2 text-[12px] font-black text-[var(--text)] shadow-[0_2px_8px_rgba(15,23,42,.08)]">UPI / QR</button>
          <button type="button" onClick={()=>openCashOutFlow("/transactions/aeps")} className="min-h-10 rounded-[10px] px-2 text-[12px] font-black text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]">AEPS</button>
          <button type="button" onClick={()=>openCashOutFlow("/transactions/micro-atm")} className="min-h-10 rounded-[10px] px-2 text-[12px] font-black text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]">Micro ATM</button>
        </div>}

        <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <label className="block">
            <span className="block text-center text-[10px] font-black uppercase tracking-[.16em] text-[var(--text-muted)]">Amount <span className="text-rose-500">*</span></span>
            <div className="mt-1 flex items-center justify-center gap-2 border-b border-[var(--border)] pb-2">
              <span className="quick-cash-amount-currency font-black leading-none text-[var(--text)]">₹</span>
              <input ref={quickAmountRef} autoFocus inputMode="decimal" aria-invalid={Boolean(quickFieldErrors.amount)} aria-describedby={quickFieldErrors.amount?"quick-amount-error":undefined} className="quick-cash-amount-input min-w-0 max-w-[280px] flex-1 appearance-none bg-transparent p-0 text-center tabular-nums text-[var(--text)] placeholder:text-[color-mix(in_srgb,var(--text-muted)_20%,transparent)]" placeholder="0" value={quickAmount} onChange={(event)=>{setQuickAmount(event.target.value.replace(/[^0-9.]/g,""));clearQuickFieldError("amount");setQuickError("");}}/>
            </div>
            {quickFieldErrors.amount?<p id="quick-amount-error" className="mt-2 text-center text-[12px] font-bold text-rose-600">{quickFieldErrors.amount}</p>:null}
          </label>

          {quickPurpose==="TRANSFER"?<div className="mt-3 rounded-[17px] bg-[var(--surface-soft)] p-3">
            <div className="flex items-center justify-between gap-4 px-1">
              <p className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Commission <span className="normal-case font-semibold">(₹0 allowed)</span></p>
              <div className="flex min-w-[150px] items-center justify-end gap-1.5">
                <span className="text-xl font-black">₹</span>
                <input ref={quickCommissionRef} inputMode="decimal" aria-invalid={Boolean(quickFieldErrors.commission)} aria-describedby={quickFieldErrors.commission?"quick-commission-error":undefined} className="quick-cash-commission-input w-[150px] appearance-none bg-transparent p-0 text-right tabular-nums text-[var(--text)]" placeholder="0" value={quickCommission} onChange={(event)=>{setQuickCommission(event.target.value.replace(/[^0-9.]/g,""));clearQuickFieldError("commission");setQuickError("");}}/>
              </div>
            </div>
            {quickFieldErrors.commission?<p id="quick-commission-error" className="px-1 pt-1 text-[12px] font-bold text-rose-600">{quickFieldErrors.commission}</p>:null}
            {Number(quickCommission||0)>0?<fieldset className="mt-2.5 grid grid-cols-2 rounded-[12px] bg-[var(--surface)] p-1" aria-label="Commission payment mode">
              <label className={"relative flex min-h-9 cursor-pointer items-center justify-center rounded-[9px] text-[12px] font-black transition "+(quickCommissionMode==="CASH"?"bg-emerald-50 text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>
                <input type="radio" name="commissionMode" value="CASH" checked={quickCommissionMode==="CASH"} onChange={()=>setQuickCommissionMode("CASH")} className="absolute h-px w-px opacity-0"/>
                <span>Cash</span>
              </label>
              <label className={"relative flex min-h-9 cursor-pointer items-center justify-center rounded-[9px] text-[12px] font-black transition "+(quickCommissionMode==="UPI"?"bg-blue-50 text-blue-700 shadow-sm":"text-[var(--text-muted)]")}>
                <input type="radio" name="commissionMode" value="UPI" checked={quickCommissionMode==="UPI"} onChange={()=>setQuickCommissionMode("UPI")} className="absolute h-px w-px opacity-0"/>
                <span>UPI / GPay</span>
              </label>
            </fieldset>:<p className="mt-2.5 px-1 text-[11px] font-semibold text-[var(--text-muted)]">No commission · payment mode is not required.</p>}
          </div>:<div className="mt-3 rounded-[17px] bg-[var(--surface-soft)] px-4 py-3">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Service <span className="text-rose-500">*</span></span>
              <input ref={quickServiceRef} list="quick-service-options" aria-invalid={Boolean(quickFieldErrors.serviceName)} aria-describedby={quickFieldErrors.serviceName?"quick-service-error":undefined} className="mt-1 w-full appearance-none bg-transparent p-0 text-[20px] font-black tracking-[-.02em] text-[var(--text)] placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="Type or choose a service" value={quickServiceName} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>{setQuickServiceName(event.target.value);clearQuickFieldError("serviceName");setQuickError("");}}/>
              <datalist id="quick-service-options">{serviceCatalog.filter((item)=>item.isActive!==false).map((item)=><option key={item.id} value={item.name}/>)}</datalist>
              {quickFieldErrors.serviceName?<p id="quick-service-error" className="mt-1.5 text-[12px] font-bold text-rose-600">{quickFieldErrors.serviceName}</p>:null}
            </label>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {quickServiceOptions.map((item)=><button key={item.id} type="button" onClick={()=>{setQuickServiceName(item.name);if(item.defaultAmount!==null&&Number(item.defaultAmount)>0)setQuickAmount(String(Number(item.defaultAmount)));clearQuickFieldError("serviceName");clearQuickFieldError("amount");setQuickError("");quickServiceRef.current?.focus();}} className={"min-h-8 rounded-full border px-3 text-[12px] font-black transition active:scale-[.98] "+(quickServiceName.toLowerCase()===item.name.toLowerCase()?"border-emerald-300 bg-emerald-50 text-emerald-700":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{item.name}{item.defaultAmount!==null&&Number(item.defaultAmount)>0?" · ₹"+Number(item.defaultAmount).toLocaleString("en-IN"):""}</button>)}
            </div>
            <fieldset className="mt-3 grid grid-cols-2 rounded-[12px] bg-[var(--surface)] p-1" aria-label="Service payment mode">
              <label className={"relative flex min-h-9 cursor-pointer items-center justify-center rounded-[9px] text-[12px] font-black transition "+(quickServicePaymentMode==="CASH"?"bg-emerald-50 text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}><input type="radio" name="servicePaymentMode" value="CASH" checked={quickServicePaymentMode==="CASH"} onChange={()=>{setQuickServicePaymentMode("CASH");setQuickServicePaymentAccountId("");clearQuickFieldError("servicePaymentAccount");}} className="absolute h-px w-px opacity-0"/><span>Cash</span></label>
              <label className={"relative flex min-h-9 cursor-pointer items-center justify-center rounded-[9px] text-[12px] font-black transition "+(quickServicePaymentMode==="UPI"?"bg-blue-50 text-blue-700 shadow-sm":"text-[var(--text-muted)]")}><input type="radio" name="servicePaymentMode" value="UPI" checked={quickServicePaymentMode==="UPI"} onChange={()=>setQuickServicePaymentMode("UPI")} className="absolute h-px w-px opacity-0"/><span>Bank / UPI</span></label>
            </fieldset>
            {quickServicePaymentMode==="UPI"?<div className="mt-2">
              <SearchableSelect mobileSheet aria-label="Service payment received in" searchPlaceholder="Search bank / UPI account" className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] font-black text-[var(--text)]" value={quickServicePaymentAccountId} onChange={(event)=>{setQuickServicePaymentAccountId(event.target.value);clearQuickFieldError("servicePaymentAccount");setQuickError("");}}>
                <option value="">Received in…</option>
                {accounts.filter((account)=>account.isActive!==false&&["BANK","UPI"].includes(account.accountType)).map((account)=><option key={account.id} value={account.id}>{account.accountName} · {money(account.currentBalance??0)}</option>)}
              </SearchableSelect>
              {quickFieldErrors.servicePaymentAccount?<p className="mt-1.5 text-[12px] font-bold text-rose-600">{quickFieldErrors.servicePaymentAccount}</p>:null}
            </div>:null}
          </div>}

          {quickPurpose==="TRANSFER"&&quickDirection==="IN"?<div className="mt-3 rounded-[17px] bg-[var(--surface-soft)] p-3">
            <div className="flex items-center justify-between gap-3 px-1"><span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Beneficiary destination</span><div className="grid grid-cols-2 rounded-[10px] bg-[var(--surface)] p-1 text-[11px] font-black"><button type="button" onClick={()=>setQuickBeneficiaryMode("UPI")} className={"rounded-[8px] px-3 py-1.5 "+(quickBeneficiaryMode==="UPI"?"bg-blue-50 text-blue-700":"text-[var(--text-muted)]")}>UPI</button><button type="button" onClick={()=>setQuickBeneficiaryMode("BANK")} className={"rounded-[8px] px-3 py-1.5 "+(quickBeneficiaryMode==="BANK"?"bg-blue-50 text-blue-700":"text-[var(--text-muted)]")}>Bank</button></div></div>
            {quickBeneficiaryMode==="UPI"
              ?<input className="mt-2 w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[15px] font-bold text-[var(--text)] outline-none" value={quickBeneficiaryUpi} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>setQuickBeneficiaryUpi(event.target.value)} placeholder="UPI ID / mobile"/>
              :<div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">Account holder</span><input className="mt-1 w-full bg-transparent p-0 text-[14px] font-bold text-[var(--text)] outline-none" value={quickBankAccountHolder} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>setQuickBankAccountHolder(event.target.value)} placeholder="Name"/></label>
                <label className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">Account number</span><input inputMode="numeric" className="mt-1 w-full bg-transparent p-0 text-[14px] font-bold text-[var(--text)] outline-none" value={quickBankAccountNumber} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>setQuickBankAccountNumber(event.target.value.replace(/\s/g,""))} placeholder="Account no."/></label>
                <label className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">IFSC</span><input autoCapitalize="characters" className="mt-1 w-full bg-transparent p-0 text-[14px] font-bold uppercase text-[var(--text)] outline-none" value={quickBankIfsc} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>setQuickBankIfsc(event.target.value.toUpperCase().replace(/\s/g,""))} placeholder="IFSC code"/></label>
              </div>}
          </div>:null}

          <div className="mt-3 overflow-hidden rounded-[17px] bg-[var(--surface-soft)] px-4">
            <label className="flex min-h-[52px] items-center gap-3 border-b border-[var(--border)]"><span className="w-[76px] shrink-0 text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Customer</span><input className="min-w-0 flex-1 appearance-none bg-transparent p-0 text-right text-[18px] font-black tracking-[-.015em] text-[var(--text)] placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="Name" value={quickCustomerName} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>{setQuickCustomerName(event.target.value);setQuickError("");}}/></label>
            <label className="flex min-h-[52px] items-center gap-3 border-b border-[var(--border)]"><span className="w-[76px] shrink-0 text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Mobile</span><input inputMode="tel" className="min-w-0 flex-1 appearance-none bg-transparent p-0 text-right text-[18px] font-black tracking-[-.015em] text-[var(--text)] placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="Mobile number" value={quickMobile} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>{setQuickMobile(event.target.value);setQuickError("");}}/></label>
            {quickDirection==="OUT"?<label className="flex min-h-[58px] items-center gap-3 border-b border-[var(--border)] py-2.5">
              <span className="w-[76px] shrink-0 text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Date & time</span>
              <div className="min-w-0 flex-1 text-right"><input type="datetime-local" className="min-h-10 max-w-full bg-transparent p-0 text-right text-[14px] font-bold text-[var(--text)] outline-none" value={quickTransactionAt} onChange={(event)=>setQuickTransactionAt(event.target.value)}/><p className="mt-0.5 text-[9px] font-semibold text-[var(--text-muted)]">Optional · blank uses current time</p></div>
            </label>:null}
            <label className="flex min-h-[58px] items-start gap-3 py-3">
              <span className="w-[76px] shrink-0 pt-1 text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Note</span>
              <textarea rows={2} className="min-h-[42px] min-w-0 flex-1 resize-none appearance-none bg-transparent p-0 text-right text-[17px] font-extrabold leading-5 text-[var(--text)] placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="Add note" value={quickRemarks} onFocus={(event)=>keepQuickFieldVisible(event.currentTarget)} onChange={(event)=>{setQuickRemarks(event.target.value);setQuickError("");}}/>
            </label>
          </div>

          {quickError?<div role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{quickError}</div>:null}
        </div>
        </div>
        <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <button disabled={quickSaving} className={"min-h-[52px] w-full rounded-[16px] px-5 text-base font-black text-white shadow-[0_10px_22px_rgba(15,23,42,.12)] transition active:scale-[.99] disabled:opacity-50 "+(quickDirection==="IN"?"bg-emerald-600":"bg-rose-600")}>{quickSaving?"Saving…":quickPurpose==="SERVICE"?"Record service":quickDirection==="OUT"?"Save cash out":"Save transfer"}</button>
        </footer>
      </form>
    </div>,document.body):null}

    {portalReady&&completePendingId?createPortal(<div className="fixed inset-0 z-[100] grid place-items-end bg-black/50 p-0 sm:place-items-center sm:p-5" role="dialog" aria-modal="true">
      <form onSubmit={completeQuickCash} className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[30px] bg-[var(--surface)] shadow-2xl sm:max-h-[88dvh] sm:max-w-4xl sm:rounded-[28px]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-amber-700">Pending cash · complete</p>
            <h3 className="mt-1 text-[23px] font-black tracking-[-.04em] sm:text-[26px]">Complete transaction</h3>
            {completingQuickCash?<div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1">Amount {money(completingQuickCash.amount)}</span>
              <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1">{Number(completingQuickCash.commissionAmount)>0?"Commission "+money(completingQuickCash.commissionAmount)+" · "+(completingQuickCash.commissionMode==="UPI"?"UPI / GPay":"Cash"):"No commission"}</span>
            </div>:null}
          </div>
          <button type="button" onClick={()=>{setCompletePendingId(null);setCompleteError("");}} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-xl font-bold text-[var(--text-muted)] transition hover:bg-[var(--border)] active:scale-95" aria-label="Close">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {completeError?<div role="alert" className="mb-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-extrabold leading-5 text-rose-700">
            <span className="mr-2">!</span>{completeError}
          </div>:null}

          <div className={"grid gap-3 "+(Number(completingQuickCash?.commissionAmount||0)>0&&completingQuickCash?.commissionMode==="UPI"?"lg:grid-cols-2":"")}>
            <label className="block rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] p-4 transition focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-[.11em] text-[var(--text-muted)]">{completingQuickCash?.direction==="OUT"?"UPI / bank received in":"Money transferred from"} <span className="text-rose-500">*</span></span>
                </div>
                {completeSourceAccountId?<strong className="money shrink-0 text-sm font-black">{money(accounts.find((account)=>account.id===completeSourceAccountId)?.currentBalance??0)}</strong>:null}
              </div>
              <SearchableSelect mobileSheet aria-label={completingQuickCash?.direction==="OUT"?"UPI or bank received in":"Money transferred from"} searchPlaceholder="Search bank / UPI / wallet" className="mt-3 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[16px] font-black text-[var(--text)] outline-none" value={completeSourceAccountId} onChange={(event)=>{setCompleteSourceAccountId(event.target.value);setCompleteError("");}}>
                <option value="">Select Bank / UPI / Wallet</option>
                {accounts.filter((account)=>account.isActive!==false&&["BANK","UPI","PROVIDER_WALLET"].includes(account.accountType)).map((account)=><option key={account.id} value={account.id}>{account.accountName} · {money(account.currentBalance??0)}</option>)}
              </SearchableSelect>
              {completeSourceAccountId?<div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface)] px-3 py-2.5 text-[13px] font-bold">
                <span className="text-[var(--text-muted)]">Current balance</span>
                <strong className="money text-[16px] font-black text-[var(--text)]">{money(accounts.find((account)=>account.id===completeSourceAccountId)?.currentBalance??0)}</strong>
              </div>:null}
            </label>

            {Number(completingQuickCash?.commissionAmount||0)>0&&completingQuickCash?.commissionMode==="UPI"?<label className="block rounded-[20px] border border-blue-200 bg-blue-50/55 p-4 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-[.11em] text-blue-700">Commission received in <span className="text-rose-500">*</span></span>
                </div>
                {completeCommissionAccountId?<strong className="money shrink-0 text-sm font-black">{money(accounts.find((account)=>account.id===completeCommissionAccountId)?.currentBalance??0)}</strong>:null}
              </div>
              <SearchableSelect mobileSheet aria-label="Commission received in" searchPlaceholder="Search bank / UPI account" className="mt-3 min-h-12 w-full rounded-xl border border-blue-200 bg-[var(--surface)] px-3 text-[16px] font-black text-[var(--text)] outline-none" value={completeCommissionAccountId} onChange={(event)=>{setCompleteCommissionAccountId(event.target.value);setCompleteError("");}}>
                <option value="">Select Bank / UPI account</option>
                {accounts.filter((account)=>account.isActive!==false&&["BANK","UPI","PROVIDER_WALLET"].includes(account.accountType)).map((account)=><option key={account.id} value={account.id}>{account.accountName} · {money(account.currentBalance??0)}</option>)}
              </SearchableSelect>
              {completeCommissionAccountId?<div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface)] px-3 py-2.5 text-[13px] font-bold">
                <span className="text-[var(--text-muted)]">Current balance</span>
                <strong className="money text-[16px] font-black">{money(accounts.find((account)=>account.id===completeCommissionAccountId)?.currentBalance??0)}</strong>
              </div>:null}
            </label>:null}
          </div>

          {completingQuickCash?.direction==="IN"?<div className="mt-4 rounded-[18px] border border-[var(--border)] bg-[var(--surface-soft)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Beneficiary destination</span>
              <div className="grid grid-cols-2 rounded-[10px] bg-[var(--surface)] p-1 text-[11px] font-black"><button type="button" onClick={()=>setCompleteBeneficiaryMode("UPI")} className={"rounded-[8px] px-3 py-1.5 "+(completeBeneficiaryMode==="UPI"?"bg-blue-50 text-blue-700":"text-[var(--text-muted)]")}>UPI</button><button type="button" onClick={()=>setCompleteBeneficiaryMode("BANK")} className={"rounded-[8px] px-3 py-1.5 "+(completeBeneficiaryMode==="BANK"?"bg-blue-50 text-blue-700":"text-[var(--text-muted)]")}>Bank</button></div>
            </div>
            {completeBeneficiaryMode==="UPI"
              ?<input className="mt-3 min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[16px] font-extrabold text-[var(--text)] outline-none" value={completeBeneficiaryUpi} onChange={(event)=>setCompleteBeneficiaryUpi(event.target.value)} placeholder="UPI ID / mobile"/>
              :<div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">Account holder</span><input className="mt-1 w-full bg-transparent p-0 text-[15px] font-extrabold text-[var(--text)] outline-none" value={completeBankAccountHolder} onChange={(event)=>setCompleteBankAccountHolder(event.target.value)} placeholder="Name"/></label>
                <label className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">Account number</span><input inputMode="numeric" className="mt-1 w-full bg-transparent p-0 text-[15px] font-extrabold text-[var(--text)] outline-none" value={completeBankAccountNumber} onChange={(event)=>setCompleteBankAccountNumber(event.target.value.replace(/\s/g,""))} placeholder="Account no."/></label>
                <label className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><span className="block text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">IFSC</span><input autoCapitalize="characters" className="mt-1 w-full bg-transparent p-0 text-[15px] font-extrabold uppercase text-[var(--text)] outline-none" value={completeBankIfsc} onChange={(event)=>setCompleteBankIfsc(event.target.value.toUpperCase().replace(/\s/g,""))} placeholder="IFSC code"/></label>
              </div>}
          </div>:null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 ring-1 ring-inset ring-[var(--border)]">
              <span className="block text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Customer</span>
              <input className="mt-1.5 w-full border-0 bg-transparent p-0 text-[17px] font-extrabold text-[var(--text)] outline-none placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="" value={completeCustomerName} onChange={(event)=>setCompleteCustomerName(event.target.value)}/>
            </label>
            <label className="block rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 ring-1 ring-inset ring-[var(--border)]">
              <span className="block text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Mobile</span>
              <input inputMode="tel" className="mt-1.5 w-full border-0 bg-transparent p-0 text-[17px] font-extrabold text-[var(--text)] outline-none placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="" value={completeMobile} onChange={(event)=>setCompleteMobile(event.target.value)}/>
            </label>
            <label className="block rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 ring-1 ring-inset ring-[var(--border)]">
              <span className="block text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Reference / UTR</span>
              <input className="mt-1.5 w-full border-0 bg-transparent p-0 text-[17px] font-extrabold text-[var(--text)] outline-none placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="" value={completeReference} onChange={(event)=>setCompleteReference(event.target.value)}/>
            </label>
            <label className="block rounded-[16px] bg-[var(--surface-soft)] px-4 py-3 ring-1 ring-inset ring-[var(--border)]">
              <span className="block text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Remarks</span>
              <input className="mt-1.5 w-full border-0 bg-transparent p-0 text-[17px] font-extrabold text-[var(--text)] outline-none placeholder:font-semibold placeholder:text-[var(--text-muted)]" placeholder="" value={completeNotes} onChange={(event)=>setCompleteNotes(event.target.value)}/>
            </label>
          </div>
        </div>

        <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button type="button" onClick={()=>{setCompletePendingId(null);setCompleteError("");}} className="hidden min-h-11 rounded-xl px-4 text-sm font-black text-[var(--text-muted)] sm:inline-flex sm:items-center">Cancel</button>
          <button disabled={quickSaving||!completeSourceAccountId||(Number(completingQuickCash?.commissionAmount||0)>0&&completingQuickCash?.commissionMode==="UPI"&&!completeCommissionAccountId)} className="min-h-[52px] w-full rounded-[16px] bg-[var(--accent)] px-6 text-base font-black text-white shadow-lg shadow-blue-600/15 transition active:scale-[.99] disabled:opacity-40 sm:w-auto sm:min-w-[190px]">{quickSaving?"Completing…":"Complete transaction"}</button>
        </footer>
      </form>
    </div>,document.body):null}

    <Modal open={Boolean(reverseActivity)} title="Reverse transaction?" description={reverseActivity?reverseActivity.particular+" · "+money(reverseActivity.transactionAmount):undefined} onClose={()=>{if(!reverseSaving){setReverseActivity(null);setReverseReason("");setReverseError("");}}} footer={<div className="grid grid-cols-2 gap-2"><button type="button" disabled={reverseSaving} onClick={()=>{setReverseActivity(null);setReverseReason("");setReverseError("");}} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-bold">Keep</button><button form="cashbook-reverse" disabled={reverseSaving||reverseReason.trim().length<3} className="min-h-11 rounded-xl bg-rose-700 text-sm font-black text-white disabled:opacity-40">{reverseSaving?"Reversing…":"Confirm reversal"}</button></div>}>
      <form id="cashbook-reverse" onSubmit={reverseCashBookTransaction} className="space-y-3">
        {reverseError?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{reverseError}</div>:null}
        <p className="text-xs leading-5 text-[var(--text-muted)]">The original remains in the audit trail and the balancing reversal will appear on the opposite Cash In / Cash Out side.</p>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Reason <span className="text-rose-500">*</span></span><textarea autoFocus minLength={3} required value={reverseReason} onChange={(event)=>setReverseReason(event.target.value)} className="app-control min-h-24 w-full p-3" placeholder="Why is this being reversed?"/></label>
      </form>
    </Modal>

    {previousHistory.length?<details className="cash-history-collapsible app-surface overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div><h3 className="text-sm font-extrabold">Previous sessions</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{previousHistory.length} closed</p></div>
        <span className="cash-history-chevron text-lg text-[var(--text-muted)]">›</span>
      </summary>
      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {previousHistory.slice(0,14).map((session)=>{
          const variance=Number(session.differenceAmount||0);
          return <details key={session.id} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{session.cashAccount.accountName} · {new Date(session.businessDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>
                <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">{session.openedBy?.fullName?"Responsible: "+session.openedBy.fullName+" · ":""}{new Date(session.openedAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}{session.closedAt?" → "+new Date(session.closedAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}):""}</p>
              </div>
              <div className="text-right">
                <p className="money text-sm font-black">{money(session.actualClosingTotal||0)}</p>
                <p className={"text-[13px] font-semibold "+(Math.abs(variance)>.005?"text-[var(--money-out)]":"text-[var(--money-in)]")}>{Math.abs(variance)>.005?"Legacy variance "+money(variance):"Matched"}</p>
              </div>
              <span className="text-lg text-[var(--text-muted)]">›</span>
            </summary>
            <div className="border-t border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4 sm:px-5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[var(--surface)] p-3"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Opening</p><p className="money mt-1 text-sm font-black">{money(session.openingTotal)}</p></div>
                <div className="rounded-xl bg-[var(--surface)] p-3"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Expected</p><p className="money mt-1 text-sm font-black">{money(session.expectedClosingTotal||0)}</p></div>
                <div className="rounded-xl bg-[var(--surface)] p-3"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Counted</p><p className="money mt-1 text-sm font-black">{money(session.actualClosingTotal||0)}</p></div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div><p className="mb-2 text-sm font-bold">Opening denominations</p><CountBreakdown counts={session.denominationCounts} type="OPENING"/></div>
                <div><p className="mb-2 text-sm font-bold">Closing denominations</p><CountBreakdown counts={session.denominationCounts} type="CLOSING"/></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--text-muted)]">
                {session.closedBy?.fullName?<span>Closed by <strong className="text-[var(--text)]">{session.closedBy.fullName}</strong></span>:null}
                {session.closedAt?<span>{new Date(session.closedAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>:null}
                {session.closingNotes?<span>Note: {session.closingNotes}</span>:null}
              </div>
            </div>
          </details>;
        })}
      </div>
    </details>:null}
  </div></AppShell>;
}
