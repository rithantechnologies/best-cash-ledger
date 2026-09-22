"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Modal, PageFrame, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { moneyStatus, moneyStatusOptions } from "@/lib/money-status";

type Account={
  accountName:string;accountType:string;accountNature:"ASSET"|"LIABILITY";usageType:string;
  bankName:string|null;accountReference:string|null;lastFourDigits:string|null;creditLimit:string|null;
};
type MoneyRef={payable:{status:string;dueAt:string|null;remainingAmount:string}|null;receivableSource:{status:string;dueAt:string|null;remainingAmount:string}|null};
type RowTx=MoneyRef&{
  id?:string;transactionNumber:string;transactionType:string;status:string;referenceNumber?:string|null;notes?:string|null;customer:{fullName:string}|null;
  cardSwipe:{swipeAmount:string;commissionAmount:string;customerCard:{bankName:string;lastFourDigits:string}}|null;
  expense:{expenseType:string;amount:string;description:string;expenseCategory:{name:string};paymentAccount:{accountName:string}}|null;
  cashTransfer:{actualTransferAmount:string;beneficiary:{beneficiaryName:string}|null;beneficiaryAccount:{bankName:string|null;accountReference:string|null;upiId:string|null}|null;customerBankAccount:{bankName:string;accountHolderName:string}|null;customerUpiAccount:{accountName:string;upiId:string|null}|null;sourceAccount:{accountName:string};cashAccount:{accountName:string}}|null;
  internalTransfer:{transferAmount:string;sourceAccount:{accountName:string};destinationAccount:{accountName:string}}|null;
  atmWithdrawal:{withdrawalAmount:string;bankAccount:{accountName:string};cashAccount:{accountName:string}}|null;
  creditCardPayment:{paymentAmount:string;creditCardAccount:{accountName:string};sourceAccount:{accountName:string}}|null;
  providerSettlementReceipt:{settlement:{sourceTransaction:MoneyRef}}|null;
  payablePayment:{amount:string;sourceAccount:{accountName:string};payable:{sourceTransaction:MoneyRef}}|null;
};
type Row={
  id:string;entryType:"DEBIT"|"CREDIT";amount:string;runningBalance:number;description:string|null;
  journal:{postingDate:string;transaction:RowTx};
};
type Ledger={account:Account;openingBalance:number;openingBalanceIntroducedInRange:number;rows:Row[]};
type Charge={amount:string;rate:string|null;chargeType:string};
type Commission={amount:string;rate:string;commissionType:string};
type TxAccount={id:string;accountName:string};
type SourceRef={id:string;transactionNumber:string};
type DrillTx={
  id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
  status:string;referenceNumber:string|null;notes:string|null;createdById:string;createdBy:{fullName:string}|null;customer:{fullName:string}|null;
  charges:Charge[];commissions:Commission[];
  cardSwipe:{swipeAmount:string;providerChargeRate:string;providerChargeAmount:string;commissionRate:string;commissionAmount:string;customerPayableAmount:string;settlementAmount:string;settlementAccount:TxAccount}|null;
  payable:{payments:{status:string;transaction:{charges:Charge[]}}[]}|null;
  payablePayment:{amount:string;sourceAccount:TxAccount;payable:{sourceTransaction:SourceRef}}|null;
  providerSettlementSource:{provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:TxAccount}|null;
  providerSettlementReceipt:{amount:string;destinationAccount:TxAccount;settlement:{provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:TxAccount;sourceTransaction:SourceRef}}|null;
};
type DrillDetail={movement:DrillTx;source:DrillTx|null;row:Row;isIn:boolean};
type Range="7d"|"30d"|"90d"|"all";
const money=(value:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(value||0));
const typeLabels:Record<string,string>={CASH:"Shop cash",BANK:"Bank",UPI:"Bank",PROVIDER_WALLET:"Wallet",OWNER_CREDIT_CARD:"Credit card"};
function rangeStart(range:Range){
  if(range==="all")return "";
  const days=range==="7d"?7:range==="30d"?30:90;
  const date=new Date();
  date.setHours(0,0,0,0);
  date.setDate(date.getDate()-(days-1));
  return date.toISOString();
}
function accountMeta(account:Account){
  return [typeLabels[account.accountType]??account.accountType,account.bankName,account.lastFourDigits?"•••• "+account.lastFourDigits:null]
    .filter(Boolean).join(" · ");
}
function increases(account:Account,row:Row){
  return account.accountNature==="ASSET"?row.entryType==="DEBIT":row.entryType==="CREDIT";
}
const nice=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(c)=>c.toUpperCase());
const total=(items:{amount:string}[])=>items.reduce((sum,item)=>sum+Number(item.amount),0);
const ledgerMoneySource=(tx:RowTx):MoneyRef=>tx.payable||tx.receivableSource?tx:tx.providerSettlementReceipt?.settlement.sourceTransaction??tx.payablePayment?.payable.sourceTransaction??tx;
function movementSummary(tx:RowTx,row:Row){
  if(tx.cardSwipe){
    const card=tx.cardSwipe.customerCard;
    return {
      primary:(tx.customer?.fullName?tx.customer.fullName+" · ":"")+card.bankName+" •••• "+card.lastFourDigits,
      secondary:"Card swipe "+money(tx.cardSwipe.swipeAmount)+(Number(tx.cardSwipe.commissionAmount)>0?" · Customer fee "+money(tx.cardSwipe.commissionAmount):""),
    };
  }
  if(tx.expense){
    return {
      primary:(tx.expense.expenseType==="PERSONAL"?"Personal · ":"")+tx.expense.expenseCategory.name,
      secondary:tx.expense.description||row.description||"Expense payment",
    };
  }
  if(tx.cashTransfer){
    const destination=tx.cashTransfer.beneficiary?.beneficiaryName
      ??tx.cashTransfer.customerBankAccount?.accountHolderName
      ??tx.cashTransfer.customerUpiAccount?.accountName
      ??"Customer transfer";
    return {primary:(tx.customer?.fullName?tx.customer.fullName+" → ":"")+destination,secondary:"Transfer "+money(tx.cashTransfer.actualTransferAmount)+" · from "+tx.cashTransfer.sourceAccount.accountName};
  }
  if(tx.internalTransfer){
    return {primary:tx.internalTransfer.sourceAccount.accountName+" → "+tx.internalTransfer.destinationAccount.accountName,secondary:"Internal transfer "+money(tx.internalTransfer.transferAmount)};
  }
  if(tx.payablePayment){
    return {primary:(tx.customer?.fullName?tx.customer.fullName+" · ":"")+"Customer payout",secondary:"Paid "+money(tx.payablePayment.amount)+" from "+tx.payablePayment.sourceAccount.accountName};
  }
  if(tx.atmWithdrawal){
    return {primary:tx.atmWithdrawal.bankAccount.accountName+" → "+tx.atmWithdrawal.cashAccount.accountName,secondary:"ATM withdrawal "+money(tx.atmWithdrawal.withdrawalAmount)};
  }
  if(tx.creditCardPayment){
    return {primary:tx.creditCardPayment.sourceAccount.accountName+" → "+tx.creditCardPayment.creditCardAccount.accountName,secondary:"Credit card payment "+money(tx.creditCardPayment.paymentAmount)};
  }
  return {primary:tx.customer?.fullName??row.description??nice(tx.transactionType),secondary:row.description&&row.description!==tx.customer?.fullName?row.description:nice(tx.transactionType)};
}
function DetailStat({label,value,tone=""}:{label:string;value:string;tone?:string}){
  return <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className={"mt-1 text-sm font-black "+tone}>{value}</p></div>;
}
function AccountMovementDetail({detail}:{detail:DrillDetail}){
  const {movement,source,row,isIn}=detail;
  const tx=source??movement;
  const card=tx.cardSwipe;
  const gatewayFees=total(tx.charges);
  const customerFees=total(tx.commissions);
  const payoutFees=tx.payable?.payments.filter((p)=>p.status==="COMPLETED").reduce((sum,p)=>sum+total(p.transaction.charges),0)??0;
  const profit=customerFees-gatewayFees-payoutFees;
  const provider=tx.providerSettlementSource?.provider?.name??movement.providerSettlementReceipt?.settlement.provider?.name??null;
  const gateway=tx.providerSettlementSource?.gateway?.gatewayName??movement.providerSettlementReceipt?.settlement.gateway?.gatewayName??null;
  return <div className="space-y-4">
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--text-muted)]">{isIn?"Money in":"Money out"}</p><p className={"money mt-1 text-2xl font-black "+(isIn?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{isIn?"+":"−"}{money(row.amount)}</p></div><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Balance after</p><p className="money mt-1 text-sm font-black">{money(row.runningBalance)}</p></div></div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{row.description??nice(movement.transactionType)} · {new Date(movement.transactionAt).toLocaleString("en-IN")}</p>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <DetailStat label="Customer" value={tx.customer?.fullName??"—"}/>
      <DetailStat label={source?"Source transaction":"Transaction"} value={tx.transactionNumber}/>
      {source?<DetailStat label="Wallet entry" value={movement.transactionNumber}/>:null}
      <DetailStat label={source?"Swipe / source by":"Performed by"} value={tx.createdBy?.fullName??tx.createdById}/>
      {source?<DetailStat label="Wallet entry by" value={movement.createdBy?.fullName??movement.createdById}/>:null}
      <DetailStat label="Reference" value={tx.referenceNumber??movement.referenceNumber??"—"}/>
    </div>
    {card?<>
      <div><h3 className="text-sm font-black">Transaction breakup</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Same source figures used in the customer transaction ledger.</p></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <DetailStat label="Original customer amount" value={money(card.customerPayableAmount)}/>
        <DetailStat label="Customer commission" value={"+"+money(card.commissionAmount)} tone="text-[var(--money-in)]"/>
        <DetailStat label="Total card swipe" value={money(card.swipeAmount)}/>
        <DetailStat label="Gateway charge" value={"−"+money(card.providerChargeAmount)} tone="text-[var(--money-out)]"/>
        <DetailStat label="Wallet settlement" value={money(card.settlementAmount)} tone="text-[var(--accent)]"/>
        <DetailStat label="Business profit" value={money(profit)} tone={profit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]"}/>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-[var(--border)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
        <span>Provider: <b className="text-[var(--text)]">{provider??"—"}</b></span><span>Gateway: <b className="text-[var(--text)]">{gateway??"—"}</b></span>{payoutFees>0?<span>Payout charges: <b className="money text-[var(--money-out)]">{money(payoutFees)}</b></span>:null}
      </div>
    </>:<div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><DetailStat label="Processed" value={money(movement.grossAmount)}/><DetailStat label="Net value" value={money(movement.netAmount??movement.grossAmount)}/><DetailStat label="Charges" value={gatewayFees?"−"+money(gatewayFees):money(0)} tone={gatewayFees?"text-[var(--money-out)]":""}/><DetailStat label="Commission" value={customerFees?"+"+money(customerFees):money(0)} tone={customerFees?"text-[var(--money-in)]":""}/></div>}
    {movement.payablePayment?<div className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">Paid from <b className="text-[var(--text)]">{movement.payablePayment.sourceAccount.accountName}</b> · payout {money(movement.payablePayment.amount)}</div>:null}
    {(tx.notes||movement.notes)?<div className="rounded-xl border border-[var(--border)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Notes</p><p className="mt-1 text-sm text-[var(--text-muted)]">{tx.notes??movement.notes}</p></div>:null}
    <Link href={"/transactions/"+tx.id} className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-bold text-[var(--accent)]">Open full transaction →</Link>
  </div>;
}

function AccountLedgerSkeleton(){
  return <AppShell><PageFrame width="max-w-6xl">
    <div className="space-y-2">
      <div className="ui-shimmer h-4 w-20 rounded"/>
      <div className="ui-shimmer h-9 w-44 rounded-lg"/>
      <div className="ui-shimmer h-4 w-28 rounded"/>
    </div>
    <div className="ui-shimmer h-12 w-full rounded-xl"/>
    <div className="grid grid-cols-3 gap-2.5">
      {[0,1,2].map((i)=><Surface key={i} className="space-y-3 p-3.5 sm:p-4"><div className="ui-shimmer h-3 w-14 rounded"/><div className="ui-shimmer h-7 w-24 max-w-full rounded-md"/></Surface>)}
    </div>
    <Surface className="p-3"><div className="ui-shimmer h-12 w-full rounded-xl"/></Surface>
    <Surface className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4"><div className="ui-shimmer h-4 w-16 rounded"/><div className="ui-shimmer h-4 w-5 rounded"/></div>
      <div className="divide-y divide-[var(--border)]">
        {[0,1,2,3].map((i)=><div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="space-y-2"><div className="ui-shimmer h-3 w-12 rounded"/><div className="ui-shimmer h-3 w-14 rounded"/></div>
          <div className="min-w-0 flex-1 space-y-2"><div className="ui-shimmer h-4 w-32 rounded"/><div className="ui-shimmer h-3 w-24 rounded"/></div>
          <div className="ui-shimmer h-4 w-20 rounded"/>
        </div>)}
      </div>
    </Surface>
  </PageFrame></AppShell>;
}

export default function AccountLedgerPage(){
  const {id}=useParams<{id:string}>();
  const [data,setData]=useState<Ledger|null>(null);
  const [range,setRange]=useState<Range>("30d");
  const [search,setSearch]=useState("");
  const [txStatusFilter,setTxStatusFilter]=useState(""),[moneyStatusFilter,setMoneyStatusFilter]=useState("");
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[role,setRole]=useState("");
  const [detailOpen,setDetailOpen]=useState(false),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState("");
  const [detail,setDetail]=useState<DrillDetail|null>(null);
  const load=useCallback(async(nextRange:Range)=>{
    setLoading(true);setError("");
    try{
      const from=rangeStart(nextRange);
      const query=from?"?from="+encodeURIComponent(from):"";
      setData(await apiFetch<Ledger>("/reports/accounts/"+id+query));
    }catch(err){setError(err instanceof Error?err.message:"Failed to load ledger");}
    finally{setLoading(false);}
  },[id]);
  const openMovement=async(row:Row,isIn:boolean)=>{
    const txId=row.journal.transaction.id;
    if(!txId)return;
    setDetailOpen(true);setDetailLoading(true);setDetailError("");setDetail(null);
    try{
      const movement=await apiFetch<DrillTx>("/transactions/"+txId);
      const sourceId=movement.providerSettlementReceipt?.settlement.sourceTransaction?.id??movement.payablePayment?.payable.sourceTransaction?.id??null;
      const source=sourceId&&sourceId!==movement.id?await apiFetch<DrillTx>("/transactions/"+sourceId):null;
      setDetail({movement,source,row,isIn});
    }catch(err){setDetailError(err instanceof Error?err.message:"Failed to load transaction details");}
    finally{setDetailLoading(false);}
  };

  useEffect(()=>{load(range);},[load,range]);
  useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{}},[]);

  const rows=useMemo(()=>{
    const query=search.trim().toLowerCase();
    const source=[...(data?.rows??[])].reverse();
    const statusFiltered=source.filter((row)=>(!txStatusFilter||row.journal.transaction.status===txStatusFilter)&&(!moneyStatusFilter||moneyStatus(ledgerMoneySource(row.journal.transaction))?.key===moneyStatusFilter));
    if(!query)return statusFiltered;
    return statusFiltered.filter((row)=>{
      const summary=movementSummary(row.journal.transaction,row);
      return [row.journal.transaction.transactionNumber,row.journal.transaction.customer?.fullName,row.description,summary.primary,summary.secondary]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  },[data,search,txStatusFilter,moneyStatusFilter]);

  if(loading&&!data)return <AccountLedgerSkeleton/>;
  const account=data?.account;
  const closing=data
    ?(data.rows.length?data.rows[data.rows.length-1].runningBalance:data.openingBalance+Number(data.openingBalanceIntroducedInRange||0))
    :0;
  const movement=data?.rows.reduce((totals,row)=>{
    const amount=Number(row.amount);
    if(increases(data.account,row))totals.in+=amount;else totals.out+=amount;
    return totals;
  },{in:0,out:0})??{in:0,out:0};
  const isCard=account?.accountType==="OWNER_CREDIT_CARD";
  const creditLimit=isCard?Math.max(0,Number(account?.creditLimit||0)):0;
  const availableCredit=isCard&&creditLimit>0?Math.max(0,creditLimit-closing):0;
  const utilisation=isCard&&creditLimit>0?Math.min(100,(Math.max(0,closing)/creditLimit)*100):0;
  const periodOpening=data?data.openingBalance+Number(data.openingBalanceIntroducedInRange||0):0;
  const admin=role==="OWNER"||role==="ADMIN";

  return <AppShell><PageFrame width="max-w-6xl">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href="/accounts" className="inline-flex min-h-8 items-center text-xs font-bold text-[var(--accent)]">← Accounts</Link>
        <h1 className="mt-1 truncate text-2xl font-black tracking-[-.035em] sm:text-3xl">{account?.accountName??"Account"}</h1>
        {account?<p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{accountMeta(account)}</p>:null}
      </div>
      {admin?<Link href={"/accounts?edit="+id} className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-bold text-[var(--text)] shadow-sm">Edit</Link>:null}
    </div>
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}
    {data?<>
      <Surface className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-muted)]">{isCard?"Outstanding":"Current balance"}</p>
              <p className={"money mt-1 text-[2rem] font-black leading-none tracking-[-.045em] sm:text-4xl "+(isCard&&closing>0?"text-rose-600":closing<0?"text-rose-600":"text-[var(--text)]")}>{money(closing)}</p>
            </div>
            {isCard&&creditLimit>0?<div className="shrink-0 text-right">
              <p className="text-xs font-semibold text-emerald-700">Available credit</p>
              <p className="money mt-1 text-xl font-black text-emerald-700">{money(availableCredit)}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">of {money(creditLimit)} limit</p>
            </div>:null}
          </div>

          {isCard&&creditLimit>0?<div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]"><span>{Math.round(utilisation)}% utilised</span><span>{Math.round(100-utilisation)}% available</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-rose-400" style={{width:utilisation+"%"}}/></div>
          </div>:null}

          <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border)] border-t border-[var(--border)] pt-4">
            <div className="min-w-0 pr-2.5 sm:pr-4"><p className="text-[11px] font-semibold text-[var(--text-muted)]">Period opening</p><p className="money mt-1 truncate text-sm font-black">{money(periodOpening)}</p></div>
            <div className="min-w-0 px-2.5 sm:px-4"><p className="text-[11px] font-semibold text-emerald-700">{isCard?"Added":"Money in"}</p><p className="money mt-1 truncate text-sm font-black text-emerald-700">{money(movement.in)}</p></div>
            <div className="min-w-0 pl-2.5 sm:pl-4"><p className="text-[11px] font-semibold text-rose-600">{isCard?"Paid / reduced":"Money out"}</p><p className="money mt-1 truncate text-sm font-black text-rose-600">{money(movement.out)}</p></div>
          </div>
        </div>
      </Surface>

      <div className="ui-scroll-fade"><div className="flex gap-1.5 overflow-x-auto pb-0.5 pr-5">
        {([["7d","7 days"],["30d","30 days"],["90d","90 days"],["all","All time"]] as [Range,string][]).map(([value,label])=><button type="button" key={value} onClick={()=>setRange(value)} className={"min-h-10 shrink-0 rounded-full px-3.5 text-xs font-bold transition "+(range===value?"bg-[var(--text)] text-[var(--surface)]":"bg-[var(--surface-soft)] text-[var(--text-muted)]")}>{label}</button>)}
      </div></div>

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div><h2 className="text-sm font-extrabold">Activity</h2><p className="mt-0.5 text-xs text-[var(--text-muted)]">{rows.length} transaction entr{rows.length===1?"y":"ies"}</p></div>
        </div>
        <div className="grid gap-2 border-b border-[var(--border)] p-3 md:grid-cols-[minmax(0,1fr)_180px_220px]">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
            <input className="app-control !pl-10" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search activity"/>
          </div>
          <select className="app-control" value={txStatusFilter} onChange={(event)=>setTxStatusFilter(event.target.value)}><option value="">All transaction status</option>{["COMPLETED","PENDING","FAILED","CANCELLED","REVERSED"].map((x)=><option key={x}>{nice(x)}</option>)}</select>
          <select className="app-control" value={moneyStatusFilter} onChange={(event)=>setMoneyStatusFilter(event.target.value)}><option value="">All payout / pay-in</option>{moneyStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        </div>
        {rows.length?<div className="divide-y divide-[var(--border)]">
          {rows.map((row)=>{
            const isIn=increases(data.account,row);
            const tx=row.journal.transaction;
            const ms=moneyStatus(ledgerMoneySource(tx));
            const summary=movementSummary(tx,row);
            return <button type="button" key={row.id} disabled={!tx.id} onClick={()=>openMovement(row,isIn)} className="grid w-full gap-2 px-4 py-3.5 text-left transition hover:bg-[var(--surface-soft)] disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[110px_minmax(0,1fr)_130px_130px] sm:items-center sm:px-5">
              <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                <p>{new Date(row.journal.postingDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p>
                <p className="mt-0.5">{new Date(row.journal.postingDate).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{tx.transactionNumber}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text)]">{summary.primary}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{summary.secondary}</p>
                <div className="mt-1.5 flex flex-wrap gap-1"><StatusBadge tone={tx.status==="COMPLETED"?"emerald":tx.status==="REVERSED"?"rose":"amber"}>{nice(tx.status)}</StatusBadge>{ms?<StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>:null}{ms?.dueAt?<span className="px-1 py-0.5 text-[10px] text-[var(--text-muted)]">Due {new Date(ms.dueAt).toLocaleDateString("en-IN")}</span>:null}</div>
                {tx.id?<p className="mt-1 text-[10px] font-bold text-[var(--accent)]">View details</p>:null}
              </div>
              <p className={"money text-sm font-extrabold sm:text-right "+(isIn?"text-emerald-700":"text-rose-600")}>{isIn?"+":"−"}{money(row.amount)}</p>
              <div className="flex items-center justify-between gap-2 sm:block sm:text-right"><span className="text-[11px] font-semibold text-[var(--text-muted)] sm:hidden">Balance</span><p className="money text-xs font-bold text-[var(--text-muted)]">{money(row.runningBalance)}</p></div>
            </button>;
          })}
        </div>:search?<div className="p-5"><EmptyState title="No matching activity" description="Try a different search."/></div>:Math.abs(periodOpening)>0.005?<div className="p-4 sm:p-5"><div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3.5"><div><p className="text-sm font-bold">Opening balance</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">No transactions in this period yet.</p></div><strong className="money shrink-0 text-sm">{money(periodOpening)}</strong></div></div>:<div className="p-5"><EmptyState title="No transactions yet" description="Activity will appear here when money moves through this account."/></div>}
      </Surface>
    </>:null}
    <Modal open={detailOpen} title="Account transaction details" description="Trace this account movement back to the customer or source transaction." onClose={()=>{setDetailOpen(false);setDetail(null);setDetailError("");}}>
      {detailLoading?<div className="py-10 text-center text-sm font-semibold text-[var(--text-muted)]">Loading transaction details…</div>:detailError?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{detailError}</div>:detail?<AccountMovementDetail detail={detail}/>:null}
    </Modal>
  </PageFrame></AppShell>;
}
