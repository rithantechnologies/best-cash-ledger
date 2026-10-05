"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { AccountBrandIcon } from "@/components/account-brand-icon";
import { SearchableSelect } from "@/components/searchable-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Modal, PageFrame, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { moneyStatus, moneyStatusOptions } from "@/lib/money-status";
import { MoneyFlowIcon } from "@/components/money-flow-icon";

type Account={
  id:string;accountName:string;accountType:string;accountNature:"ASSET"|"LIABILITY";usageType:string;
  bankName:string|null;accountReference:string|null;lastFourDigits:string|null;creditLimit:string|null;
};
type MoneyRef={payable:{status:string;dueAt:string|null;remainingAmount:string}|null;receivableSource:{status:string;dueAt:string|null;remainingAmount:string}|null};
type BusinessTx=MoneyRef&{
  id?:string;transactionNumber:string;transactionType:string;transactionAt:string;status:string;referenceNumber?:string|null;notes?:string|null;customer:{fullName:string}|null;createdBy:{fullName:string}|null;charges:Charge[];
  cardSwipe:{swipeAmount:string;commissionAmount:string;customerCard:{bankName:string;lastFourDigits:string}}|null;
  quickCashTransfer:{direction:string;purpose:string;serviceName:string|null;cashOutType:string;aadhaarLastFour:string|null;customerBankName:string|null;cardLastFour:string|null;customerName:string|null;mobileNumber:string|null;beneficiaryMode:string|null;beneficiaryDetails:string|null;servicePaymentMode:string;cashAccount:{accountName:string}|null;sourceAccount:{accountName:string}|null;servicePaymentAccount:{accountName:string}|null;commissionAccount:{accountName:string}|null}|null;
  expense:{expenseType:string;amount:string;description:string;expenseCategory:{name:string};paymentAccount:{accountName:string}}|null;
  cashTransfer:{actualTransferAmount:string;beneficiary:{beneficiaryName:string}|null;beneficiaryAccount:{bankName:string|null;accountReference:string|null;upiId:string|null}|null;customerBankAccount:{bankName:string;accountHolderName:string}|null;customerUpiAccount:{accountName:string;upiId:string|null}|null;sourceAccount:{accountName:string};cashAccount:{accountName:string}}|null;
  aeps:{aadhaarLastFour:string;customerBankName:string;withdrawalAmount:string;cashGiven:string;settlementAmount:string;settlementAccount:{accountName:string}}|null;
  microAtm:{cardLastFour:string;customerBankName:string|null;withdrawalAmount:string;cashGiven:string;settlementAmount:string;settlementAccount:{accountName:string}}|null;
  internalTransfer:{transferAmount:string;sourceAccount:{accountName:string};destinationAccount:{accountName:string}}|null;
  atmWithdrawal:{withdrawalAmount:string;bankAccount:{accountName:string};cashAccount:{accountName:string}}|null;
  creditCardPayment:{paymentAmount:string;creditCardAccount:{accountName:string};sourceAccount:{accountName:string}}|null;
  accountEntry:{direction:"IN"|"OUT";entryKind:string;amount:string;entryLabel:string|null;account:{accountName:string}}|null;
};
type RowTx=BusinessTx&{
  quickCashCompletionSource:BusinessTx|null;
  providerSettlementReceipt:{settlement:{sourceTransaction:BusinessTx}}|null;
  payablePayment:{amount:string;sourceAccount:{accountName:string};payable:{sourceTransaction:BusinessTx}}|null;
};
type Row={
  id:string;entryType:"DEBIT"|"CREDIT";amount:string;runningBalance:number;description:string|null;
  journal:{postingDate:string;transaction:RowTx};
};
type Ledger={account:Account;openingBalance:number;openingBalanceIntroducedInRange:number;rows:Row[]};
type Charge={id:string;amount:string;rate:string|null;chargeType:string;calculationType:string;notes:string|null;sourceAccount:TxAccount|null};
type Commission={amount:string;rate:string;commissionType:string};
type TxAccount={id:string;accountName:string};
type SourceRef={id:string;transactionNumber:string};
type DrillTx={
  id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;
  status:string;referenceNumber:string|null;notes:string|null;createdById:string;createdBy:{fullName:string}|null;customer:{fullName:string}|null;
  charges:Charge[];commissions:Commission[];
  quickCashTransfer:{purpose:string;serviceName:string|null;servicePaymentMode:string;cashAccount:TxAccount|null;servicePaymentAccount:TxAccount|null;commissionAccount:TxAccount|null}|null;
  cardSwipe:{swipeAmount:string;providerChargeRate:string;providerChargeAmount:string;commissionRate:string;commissionAmount:string;customerPayableAmount:string;settlementAmount:string;settlementAccount:TxAccount}|null;
  payable:{payments:{status:string;transaction:{charges:Charge[]}}[]}|null;
  payablePayment:{amount:string;sourceAccount:TxAccount;payable:{sourceTransaction:SourceRef}}|null;
  providerSettlementSource:{provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:TxAccount}|null;
  providerSettlementReceipt:{amount:string;destinationAccount:TxAccount;settlement:{provider:{name:string}|null;gateway:{gatewayName:string}|null;destinationAccount:TxAccount;sourceTransaction:SourceRef}}|null;
  accountEntry:{direction:"IN"|"OUT";entryKind:string;amount:string;entryLabel:string|null;account:TxAccount}|null;
};
type DrillDetail={movement:DrillTx;source:DrillTx|null;row:Row;isIn:boolean};
type Range="7d"|"30d"|"90d"|"all";
const money=(value:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(value||0));
const localDateValue=()=>{const now=new Date(),offset=now.getTimezoneOffset()*60000;return new Date(now.getTime()-offset).toISOString().slice(0,10);};
const dateWithCurrentLocalTime=(date:string)=>{const now=new Date(),[year,month,day]=date.split("-").map(Number);return new Date(year,month-1,day,now.getHours(),now.getMinutes(),now.getSeconds(),now.getMilliseconds()).toISOString();};
const accountEntryLabels:Record<string,string>={LOAN_RECEIVED:"Loan received",LOAN_REPAYMENT:"Loan repayment",OWNER_FUNDING:"Owner funds added",OWNER_WITHDRAWAL:"Owner withdrawal",OTHER_NON_INCOME:"Other / adjustment",OTHER_NON_EXPENSE:"Other / adjustment"};
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
const ledgerBusinessSource=(tx:RowTx):BusinessTx=>tx.quickCashCompletionSource??tx.providerSettlementReceipt?.settlement.sourceTransaction??tx.payablePayment?.payable.sourceTransaction??tx;
const ledgerMoneySource=(tx:RowTx):MoneyRef=>ledgerBusinessSource(tx);
const ledgerActivityDate=(tx:RowTx)=>tx.quickCashCompletionSource?.transactionAt??tx.transactionAt;
const cleanAccountName=(value:string|null|undefined)=>String(value??"").trim().toLowerCase();
function payoutChargesForAccount(account:Account,tx:RowTx){
  if(account.accountType!=="PROVIDER_WALLET")return [];
  const charges=(tx.charges??[]).filter((charge)=>charge.chargeType==="PAYOUT");
  if(!charges.length)return [];
  const accountName=cleanAccountName(account.accountName);
  const source=ledgerBusinessSource(tx);
  const directSourceNames=[
    tx.payablePayment?.sourceAccount.accountName,
    source.quickCashTransfer?.sourceAccount?.accountName,
    source.expense?.paymentAccount.accountName,
    source.cashTransfer?.sourceAccount.accountName,
    source.internalTransfer?.sourceAccount.accountName,
    source.atmWithdrawal?.bankAccount.accountName,
    source.creditCardPayment?.sourceAccount.accountName,
  ].map(cleanAccountName).filter(Boolean);
  return charges.filter((charge)=>{
    if(charge.sourceAccount?.id)return charge.sourceAccount.id===account.id;
    if(charge.notes&&cleanAccountName(charge.notes).includes(accountName))return true;
    return charges.length===1&&directSourceNames.includes(accountName);
  });
}
function payoutChargeForAccount(account:Account,tx:RowTx){
  return total(payoutChargesForAccount(account,tx));
}
function businessSummary(tx:BusinessTx,row:Row){
  if(tx.accountEntry){
    const label=accountEntryLabels[tx.accountEntry.entryKind]??nice(tx.accountEntry.entryKind);
    return {
      primary:tx.accountEntry.entryLabel?.trim()||label,
      secondary:[label,tx.transactionNumber,tx.referenceNumber?"Ref "+tx.referenceNumber:null,tx.createdBy?.fullName?"By "+tx.createdBy.fullName:null].filter(Boolean).join(" · "),
    };
  }
  if(tx.transactionType==="SERVICE_INCOME"&&tx.quickCashTransfer){
    const receivedIn=tx.quickCashTransfer.servicePaymentMode==="UPI"
      ?tx.quickCashTransfer.servicePaymentAccount?.accountName??"Bank / UPI"
      :tx.quickCashTransfer.cashAccount?.accountName??"Cash drawer";
    return {
      primary:tx.quickCashTransfer.serviceName??"Service income",
      secondary:"Service income · "+tx.transactionNumber+" · received in "+receivedIn+(tx.createdBy?.fullName?" · By "+tx.createdBy.fullName:""),
    };
  }
  if(tx.quickCashTransfer){
    const quick=tx.quickCashTransfer;
    const customer=quick.customerName??tx.customer?.fullName??null;
    if(quick.purpose==="TRANSFER"&&quick.direction==="OUT"){
      const label=quick.cashOutType==="AEPS"?"AEPS / Aadhaar withdrawal":quick.cashOutType==="MICRO_ATM"?"Micro ATM withdrawal":"UPI / QR cash out";
      const identity=quick.cashOutType==="AEPS"&&quick.aadhaarLastFour
        ?"Aadhaar ••••"+quick.aadhaarLastFour
        :quick.cashOutType==="MICRO_ATM"&&quick.cardLastFour
          ?"Card ••••"+quick.cardLastFour
          :null;
      const isCommission=row.description==="Bank / UPI commission received";
      return {
        primary:label+(isCommission?" · Commission":""),
        secondary:[
          customer,
          identity,
          quick.customerBankName,
          isCommission?"Commission received":null,
          tx.transactionNumber,
          tx.createdBy?.fullName?"By "+tx.createdBy.fullName:null,
        ].filter(Boolean).join(" · "),
      };
    }
    if(quick.purpose==="TRANSFER"&&quick.direction==="IN"){
      const label=quick.serviceName??(quick.beneficiaryMode==="BANK"?"Cash In · Bank transfer":"Cash In · UPI transfer");
      const isCommission=row.description==="Bank / UPI commission received";
      return {
        primary:label+(isCommission?" · Commission":""),
        secondary:[
          customer,
          isCommission?"Commission received":quick.beneficiaryMode==="BANK"?"Bank transfer":"UPI transfer",
          tx.transactionNumber,
          quick.sourceAccount?.accountName?"via "+quick.sourceAccount.accountName:null,
          tx.createdBy?.fullName?"By "+tx.createdBy.fullName:null,
        ].filter(Boolean).join(" · "),
      };
    }
  }
  if(tx.cardSwipe){
    const card=tx.cardSwipe.customerCard;
    return {
      primary:(tx.customer?.fullName?tx.customer.fullName+" · ":"")+card.bankName+" •••• "+card.lastFourDigits,
      secondary:"Card swipe · "+tx.transactionNumber+" · "+money(tx.cardSwipe.swipeAmount)+(tx.createdBy?.fullName?" · By "+tx.createdBy.fullName:""),
    };
  }
  if(tx.microAtm){
    return {
      primary:"Micro ATM withdrawal",
      secondary:[
        tx.customer?.fullName,
        (tx.microAtm.customerBankName??"Bank")+" · Card ••••"+tx.microAtm.cardLastFour,
        tx.transactionNumber,
        money(tx.microAtm.withdrawalAmount),
        tx.createdBy?.fullName?"By "+tx.createdBy.fullName:null,
      ].filter(Boolean).join(" · "),
    };
  }
  if(tx.aeps){
    return {
      primary:"AEPS / Aadhaar withdrawal",
      secondary:[
        tx.customer?.fullName,
        tx.aeps.customerBankName+" · Aadhaar ••••"+tx.aeps.aadhaarLastFour,
        tx.transactionNumber,
        money(tx.aeps.withdrawalAmount),
        tx.createdBy?.fullName?"By "+tx.createdBy.fullName:null,
      ].filter(Boolean).join(" · "),
    };
  }
  if(tx.expense){
    return {
      primary:(tx.expense.expenseType==="PERSONAL"?"Personal · ":"")+tx.expense.expenseCategory.name+" · "+tx.expense.description,
      secondary:"Expense · "+tx.transactionNumber+" · "+money(tx.expense.amount)+" · Paid from "+tx.expense.paymentAccount.accountName+(tx.createdBy?.fullName?" · By "+tx.createdBy.fullName:""),
    };
  }
  if(tx.cashTransfer){
    const destination=tx.cashTransfer.beneficiary?.beneficiaryName
      ??tx.cashTransfer.customerBankAccount?.accountHolderName
      ??tx.cashTransfer.customerUpiAccount?.accountName
      ??"Customer transfer";
    const destinationMeta=tx.cashTransfer.beneficiaryAccount?.upiId
      ??tx.cashTransfer.beneficiaryAccount?.accountReference
      ??tx.cashTransfer.customerUpiAccount?.upiId
      ??tx.cashTransfer.customerBankAccount?.bankName
      ??null;
    return {
      primary:(tx.customer?.fullName?tx.customer.fullName+" → ":"")+destination+(destinationMeta?" · "+destinationMeta:""),
      secondary:"Cash transfer · "+tx.transactionNumber+" · "+money(tx.cashTransfer.actualTransferAmount)+" · from "+tx.cashTransfer.sourceAccount.accountName+(tx.createdBy?.fullName?" · By "+tx.createdBy.fullName:""),
    };
  }
  if(tx.internalTransfer)return {primary:tx.internalTransfer.sourceAccount.accountName+" → "+tx.internalTransfer.destinationAccount.accountName,secondary:"Internal transfer "+money(tx.internalTransfer.transferAmount)};
  if(tx.atmWithdrawal)return {primary:tx.atmWithdrawal.bankAccount.accountName+" → "+tx.atmWithdrawal.cashAccount.accountName,secondary:"ATM withdrawal "+money(tx.atmWithdrawal.withdrawalAmount)};
  if(tx.creditCardPayment)return {primary:tx.creditCardPayment.sourceAccount.accountName+" → "+tx.creditCardPayment.creditCardAccount.accountName,secondary:"Credit card payment "+money(tx.creditCardPayment.paymentAmount)};
  return {primary:tx.customer?.fullName??row.description??nice(tx.transactionType),secondary:row.description&&row.description!==tx.customer?.fullName?row.description:nice(tx.transactionType)};
}
function activityType(tx:RowTx,row:Row,source:BusinessTx){
  const quick=source.quickCashTransfer;
  let label=nice(source.transactionType);
  if(tx.providerSettlementReceipt)label="Provider settlement";
  else if(tx.payablePayment)label="Customer payout";
  else if(source.transactionType==="SERVICE_INCOME")label="Service income";
  else if(quick?.purpose==="TRANSFER"&&quick.direction==="IN")label=quick.beneficiaryMode==="BANK"?"Bank transfer":"UPI transfer";
  else if(quick?.purpose==="TRANSFER"&&quick.direction==="OUT")label=quick.cashOutType==="AEPS"?"AEPS / Aadhaar withdrawal":quick.cashOutType==="MICRO_ATM"?"Micro ATM withdrawal":"UPI / QR cash out";
  else if(source.cardSwipe)label="Card swipe";
  else if(source.microAtm)label="Micro ATM withdrawal";
  else if(source.aeps)label="AEPS / Aadhaar withdrawal";
  else if(source.expense)label="Expense";
  else if(source.cashTransfer)label="Cash transfer";
  else if(source.internalTransfer)label="Internal transfer";
  else if(source.atmWithdrawal)label="ATM withdrawal";
  else if(source.creditCardPayment)label="Credit card payment";
  if(row.description?.toLowerCase().includes("commission"))label+=" · Commission";
  return label;
}
function activityPresentation(tx:RowTx,row:Row,summary:{primary:string;secondary:string}){
  const source=ledgerBusinessSource(tx);
  const quickCustomer=source.quickCashTransfer?.customerName
    ??source.customer?.fullName
    ??source.quickCashTransfer?.mobileNumber
    ??null;
  const name=quickCustomer
    ??(source.quickCashTransfer?.purpose==="TRANSFER"?"Walk-in customer":null)
    ??source.cashTransfer?.beneficiary?.beneficiaryName
    ??source.cashTransfer?.customerBankAccount?.accountHolderName
    ??source.cashTransfer?.customerUpiAccount?.accountName
    ??source.expense?.expenseCategory.name
    ??summary.primary;
  const type=activityType(tx,row,source);
  const hidden=new Set([name,type,tx.transactionNumber,source.transactionNumber].filter(Boolean).map((value)=>String(value).trim().toLowerCase()));
  const details=summary.secondary.split(" · ").map((part)=>part.trim()).filter((part)=>part&&!hidden.has(part.toLowerCase())).join(" · ");
  return {name,type,details,sourceTransactionNumber:source.transactionNumber!==tx.transactionNumber?source.transactionNumber:null};
}
function movementSummary(tx:RowTx,row:Row){
  const source=ledgerBusinessSource(tx);
  const summary=businessSummary(source,row);
  if(tx.providerSettlementReceipt){
    const customer=source.customer?.fullName??summary.primary;
    const sourceMeta=[
      nice(source.transactionType),
      source.transactionNumber,
      source.cardSwipe?source.cardSwipe.customerCard.bankName+" •••• "+source.cardSwipe.customerCard.lastFourDigits:null,
      source.microAtm?(source.microAtm.customerBankName??"Bank")+" •••• "+source.microAtm.cardLastFour:null,
      source.aeps?source.aeps.customerBankName+" · Aadhaar •••• "+source.aeps.aadhaarLastFour:null,
      source.createdBy?.fullName?"By "+source.createdBy.fullName:null,
    ].filter(Boolean).join(" · ");
    return {primary:"Provider settlement · "+customer,secondary:sourceMeta};
  }
  if(tx.payablePayment){
    return {primary:(source.customer?.fullName?source.customer.fullName+" · ":"")+"Customer payout",secondary:"Paid "+money(tx.payablePayment.amount)+" from "+tx.payablePayment.sourceAccount.accountName+" · "+summary.primary};
  }
  return summary;
}
function DetailStat({label,value,tone=""}:{label:string;value:string;tone?:string}){
  return <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className={"mt-1 text-sm font-black "+tone}>{value}</p></div>;
}
function AccountMovementDetail({detail,account}:{detail:DrillDetail;account:Account}){
  const {movement,source,row,isIn}=detail;
  const tx=source??movement;
  const summary=movementSummary(row.journal.transaction,row);
  const card=tx.cardSwipe;
  const gatewayFees=total(tx.charges);
  const movementPayoutFees=total((movement.charges??[]).filter((charge)=>charge.chargeType==="PAYOUT"&&(
    charge.sourceAccount?.id===account.id||(!charge.sourceAccount&&charge.notes&&cleanAccountName(charge.notes).includes(cleanAccountName(account.accountName)))
  )));
  const movementPrincipal=Math.max(0,Number(row.amount)-movementPayoutFees);
  const customerFees=total(tx.commissions);
  const payoutFees=tx.payable?.payments.filter((p)=>p.status==="COMPLETED").reduce((sum,p)=>sum+total(p.transaction.charges),0)??0;
  const profit=customerFees-gatewayFees-payoutFees;
  const provider=tx.providerSettlementSource?.provider?.name??movement.providerSettlementReceipt?.settlement.provider?.name??null;
  const gateway=tx.providerSettlementSource?.gateway?.gatewayName??movement.providerSettlementReceipt?.settlement.gateway?.gatewayName??null;
  return <div className="space-y-4">
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--text-muted)]">{isIn?"Money in":"Money out"}</p><p className={"money mt-1 text-2xl font-black "+(isIn?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{isIn?"+":"−"}{money(row.amount)}</p>{movementPayoutFees>0?<p className="mt-1 text-[11px] font-black text-rose-700">Payout {money(movementPrincipal)} · Fee {money(movementPayoutFees)}</p>:null}</div><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Balance after</p><p className="money mt-1 text-sm font-black">{money(row.runningBalance)}</p></div></div>
      <p className="mt-2 text-xs font-semibold text-[var(--text)]">{summary.primary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{summary.secondary} · {new Date(tx.transactionAt).toLocaleString("en-IN")}</p>
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
    </>:tx.transactionType==="SERVICE_INCOME"?<div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><DetailStat label="Service income" value={"+"+money(tx.grossAmount)} tone="text-[var(--money-in)]"/><DetailStat label="Service" value={tx.quickCashTransfer?.serviceName??"Service"}/><DetailStat label="Received in" value={tx.quickCashTransfer?.servicePaymentMode==="UPI"?(tx.quickCashTransfer.servicePaymentAccount?.accountName??"Bank / UPI"):(tx.quickCashTransfer?.cashAccount?.accountName??"Cash drawer")}/><DetailStat label="Charges" value={gatewayFees?"−"+money(gatewayFees):money(0)} tone={gatewayFees?"text-[var(--money-out)]":""}/></div>:<div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><DetailStat label="Processed" value={money(movement.grossAmount)}/><DetailStat label="Net value" value={money(movement.netAmount??movement.grossAmount)}/><DetailStat label="Charges" value={gatewayFees?"−"+money(gatewayFees):money(0)} tone={gatewayFees?"text-[var(--money-out)]":""}/><DetailStat label="Commission income" value={customerFees?"+"+money(customerFees):money(0)} tone={customerFees?"text-[var(--money-in)]":""}/></div>}
    {movementPayoutFees>0?<div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-800"><div className="flex items-center justify-between gap-3"><span><b>Payout charge</b>{movement.charges.find(c=>c.chargeType==="PAYOUT")?.sourceAccount?.accountName?" · "+movement.charges.find(c=>c.chargeType==="PAYOUT")?.sourceAccount?.accountName:""}</span><strong className="money text-rose-700">−{money(movementPayoutFees)}</strong></div><p className="mt-1 text-[10px] text-rose-700/80">Deducted in addition to the payout principal.</p></div>:null}
    {movement.payablePayment?<div className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">Paid from <b className="text-[var(--text)]">{movement.payablePayment.sourceAccount.accountName}</b> · payout {money(movement.payablePayment.amount)}{movementPayoutFees>0?" · payout charge "+money(movementPayoutFees):""}</div>:null}
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
  const [entryOpen,setEntryOpen]=useState(false),[entrySaving,setEntrySaving]=useState(false),[entryError,setEntryError]=useState("");
  const [entryDirection,setEntryDirection]=useState<"IN"|"OUT">("IN"),[entryKind,setEntryKind]=useState("OTHER_NON_INCOME"),[entryAmount,setEntryAmount]=useState("");
  const [entryDate,setEntryDate]=useState(localDateValue),[entryLabel,setEntryLabel]=useState(""),[entryReference,setEntryReference]=useState(""),[entryNote,setEntryNote]=useState("");
  const load=useCallback(async(nextRange:Range)=>{
    setLoading(true);setError("");
    try{
      const from=rangeStart(nextRange);
      const query=from?"?from="+encodeURIComponent(from):"";
      setData(await apiFetch<Ledger>("/reports/accounts/"+id+query));
    }catch(err){setError(err instanceof Error?err.message:"Failed to load ledger");}
    finally{setLoading(false);}
  },[id]);
  const resetAccountEntry=()=>{setEntryDirection("IN");setEntryKind("OTHER_NON_INCOME");setEntryAmount("");setEntryDate(localDateValue());setEntryLabel("");setEntryReference("");setEntryNote("");setEntryError("");};
  const submitAccountEntry=async(event:FormEvent)=>{
    event.preventDefault();
    const amount=Number(entryAmount);
    if(!Number.isFinite(amount)||amount<=0){setEntryError("Enter a valid amount.");return;}
    if(!entryDate){setEntryError("Choose the entry date.");return;}
    if(entryDate>localDateValue()){setEntryError("Entry date cannot be in the future.");return;}
    if(entryLabel.trim().length<2){setEntryError("Add a short reason or source for this amount.");return;}
    setEntrySaving(true);setEntryError("");
    try{
      await apiFetch("/transactions/account-entry",{method:"POST",body:JSON.stringify({accountId:id,direction:entryDirection,entryKind,amount,transactionAt:dateWithCurrentLocalTime(entryDate),entryLabel:entryLabel.trim()||undefined,referenceNumber:entryReference.trim()||undefined,notes:entryNote.trim()||undefined})});
      setEntryOpen(false);resetAccountEntry();await load(range);
    }catch(err){setEntryError(err instanceof Error?err.message:"Failed to save amount entry");}
    finally{setEntrySaving(false);}
  };
  const openMovement=async(row:Row,isIn:boolean)=>{
    const txId=row.journal.transaction.id;
    if(!txId)return;
    setDetailOpen(true);setDetailLoading(true);setDetailError("");setDetail(null);
    try{
      const movement=await apiFetch<DrillTx>("/transactions/"+txId);
      const sourceId=row.journal.transaction.quickCashCompletionSource?.id??movement.providerSettlementReceipt?.settlement.sourceTransaction?.id??movement.payablePayment?.payable.sourceTransaction?.id??null;
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
  const payoutChargeTotal=data&&data.account.accountType==="PROVIDER_WALLET"?(()=>{
    const seen=new Set<string>();
    let sum=0;
    for(const row of data.rows){
      if(increases(data.account,row))continue;
      for(const charge of payoutChargesForAccount(data.account,row.journal.transaction)){
        if(seen.has(charge.id))continue;
        seen.add(charge.id);
        sum+=Number(charge.amount);
      }
    }
    return sum;
  })():0;
  const showPayoutCharges=account?.accountType==="PROVIDER_WALLET";
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
        <div className="mt-1 flex min-w-0 items-center gap-3">
          {account&&account.accountType!=="CASH"?<AccountBrandIcon account={account} className="!h-11 !w-11 !rounded-2xl"/>:null}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-[-.035em] sm:text-3xl">{account?.accountName??"Account"}</h1>
            {account?<p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{accountMeta(account)}</p>:null}
          </div>
        </div>
      </div>
      {admin?<div className="flex shrink-0 items-center gap-2">{account&&["BANK","UPI"].includes(account.accountType)?<button type="button" onClick={()=>{resetAccountEntry();setEntryOpen(true);}} className="inline-flex min-h-10 items-center rounded-xl bg-[var(--accent)] px-3.5 text-xs font-black text-white shadow-sm">+ New amount entry</button>:null}<Link href={"/accounts?edit="+id} className="inline-flex min-h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-bold text-[var(--text)] shadow-sm">Edit</Link></div>:null}
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

          {showPayoutCharges?<div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
            <div className="min-w-0"><p className="text-[11px] font-semibold text-[var(--text-muted)]">Period opening</p><p className="money mt-1 truncate text-sm font-black">{money(periodOpening)}</p></div>
            <div className="min-w-0"><p className="text-[11px] font-semibold text-emerald-700">Money in</p><p className="money mt-1 truncate text-sm font-black text-emerald-700">{money(movement.in)}</p></div>
            <div className="min-w-0"><p className="text-[11px] font-semibold text-rose-600">Money out</p><p className="money mt-1 truncate text-sm font-black text-rose-600">{money(movement.out)}</p></div>
            <div className="min-w-0"><p className="text-[11px] font-semibold text-rose-600">Payout charges</p><p className="money mt-1 truncate text-sm font-black text-rose-600">{money(payoutChargeTotal)}</p><p className="mt-0.5 text-[9px] font-semibold text-[var(--text-muted)]">Included in Money out</p></div>
          </div>:<div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border)] border-t border-[var(--border)] pt-4">
            <div className="min-w-0 pr-2.5 sm:pr-4"><p className="text-[11px] font-semibold text-[var(--text-muted)]">Period opening</p><p className="money mt-1 truncate text-sm font-black">{money(periodOpening)}</p></div>
            <div className="min-w-0 px-2.5 sm:px-4"><p className="text-[11px] font-semibold text-emerald-700">{isCard?"Added":"Money in"}</p><p className="money mt-1 truncate text-sm font-black text-emerald-700">{money(movement.in)}</p></div>
            <div className="min-w-0 pl-2.5 sm:pl-4"><p className="text-[11px] font-semibold text-rose-600">{isCard?"Paid / reduced":"Money out"}</p><p className="money mt-1 truncate text-sm font-black text-rose-600">{money(movement.out)}</p></div>
          </div>}
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
          <SearchableSelect className="app-control" value={txStatusFilter} onChange={(event)=>setTxStatusFilter(event.target.value)}><option value="">All transaction status</option>{["COMPLETED","PENDING","FAILED","CANCELLED","REVERSED"].map((x)=><option key={x}>{nice(x)}</option>)}</SearchableSelect>
          <SearchableSelect className="app-control" value={moneyStatusFilter} onChange={(event)=>setMoneyStatusFilter(event.target.value)}><option value="">All payout / pay-in</option>{moneyStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</SearchableSelect>
        </div>
        {rows.length?<div className="divide-y divide-[var(--border)]">
          {showPayoutCharges?<div className="hidden bg-[var(--surface-soft)] px-5 py-2.5 text-[10px] font-black uppercase tracking-[.06em] text-[var(--text-muted)] sm:grid sm:grid-cols-[110px_minmax(240px,1fr)_120px_110px_140px_130px] sm:items-center sm:gap-2">
            <span>Date</span><span>Activity</span><span className="text-right">Transaction amount</span><span className="text-right">Payout charge</span><span className="text-right">Wallet movement</span><span className="text-right">Balance</span>
          </div>:null}
          {rows.map((row)=>{
            const isIn=increases(data.account,row);
            const tx=row.journal.transaction;
            const ms=moneyStatus(ledgerMoneySource(tx));
            const rowPayoutCharge=isIn?0:payoutChargeForAccount(data.account,tx);
            const rowPrincipal=Math.max(0,Number(row.amount)-rowPayoutCharge);
            const summary=movementSummary(tx,row);
            const presentation=activityPresentation(tx,row,summary);
            return <button type="button" key={row.id} disabled={!tx.id} onClick={()=>openMovement(row,isIn)} className="w-full text-left transition hover:bg-[var(--surface-soft)] disabled:cursor-default disabled:hover:bg-transparent">
              <div className="p-4 sm:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black leading-5 text-[var(--text)]">{presentation.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-bold text-[var(--text)]">{presentation.type}</span>
                      <span className="text-[10px] font-semibold text-[var(--text-muted)]">{new Date(ledgerActivityDate(tx)).toLocaleDateString("en-IN",{day:"numeric",month:"short"})} · {new Date(ledgerActivityDate(tx)).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>
                    </div>
                    {presentation.details?<p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{presentation.details}</p>:null}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <MoneyFlowIcon direction={isIn?"IN":"OUT"}/>
                    <div className="text-right">
                      <p className={"money text-base font-black "+(isIn?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{isIn?"+":"−"}{money(row.amount)}</p>
                      {showPayoutCharges?<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]"><div className="text-left"><p className="font-bold uppercase tracking-wide text-[var(--text-muted)]">Transaction</p><p className="money mt-0.5 font-black text-[var(--text)]">{money(rowPrincipal)}</p></div><div className="text-right"><p className="font-bold uppercase tracking-wide text-[var(--text-muted)]">Payout charge</p><p className={"money mt-0.5 font-black "+(rowPayoutCharge>0?"text-rose-600":"text-[var(--text-muted)]")}>{rowPayoutCharge>0?money(rowPayoutCharge):"—"}</p></div></div>:null}
                      <p className="mt-1 text-[10px] font-semibold text-[var(--text-muted)]">Bal. {money(row.runningBalance)}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={tx.status==="COMPLETED"?"emerald":tx.status==="REVERSED"?"rose":"amber"}>{nice(tx.status)}</StatusBadge>
                  {ms?<StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>:null}
                  {ms?.dueAt?<span className="rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">Due {new Date(ms.dueAt).toLocaleDateString("en-IN")}</span>:null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
                  <p className="min-w-0 break-all text-[10px] font-medium text-[var(--text-muted)]">{presentation.sourceTransactionNumber?"Source "+presentation.sourceTransactionNumber+" · Entry ":"Ref "}{tx.transactionNumber}</p>
                  {tx.id?<span className="shrink-0 text-[11px] font-black text-[var(--accent)]">View details →</span>:null}
                </div>
              </div>
              <div className={"hidden gap-2 px-5 py-3.5 sm:grid sm:items-center "+(showPayoutCharges?"sm:grid-cols-[110px_minmax(240px,1fr)_120px_110px_140px_130px]":"sm:grid-cols-[110px_minmax(0,1fr)_130px_130px]")}>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
                  <MoneyFlowIcon direction={isIn?"IN":"OUT"} size="sm"/>
                  <div>
                  <p>{new Date(ledgerActivityDate(tx)).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p>
                  <p className="mt-0.5">{new Date(ledgerActivityDate(tx)).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[var(--text)]">{presentation.name}</p>
                  <p className="mt-0.5 truncate text-xs font-bold text-[var(--text)]">{presentation.type}</p>
                  {presentation.details?<p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{presentation.details}</p>:null}
                  <div className="mt-1.5 flex flex-wrap gap-1"><StatusBadge tone={tx.status==="COMPLETED"?"emerald":tx.status==="REVERSED"?"rose":"amber"}>{nice(tx.status)}</StatusBadge>{ms?<StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>:null}{ms?.dueAt?<span className="px-1 py-0.5 text-[10px] text-[var(--text-muted)]">Due {new Date(ms.dueAt).toLocaleDateString("en-IN")}</span>:null}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    <span className="truncate font-medium text-[var(--text-muted)]">{presentation.sourceTransactionNumber?"Source "+presentation.sourceTransactionNumber+" · Entry ":"Ref "}{tx.transactionNumber}</span>
                    {tx.id?<span className="shrink-0 font-bold text-[var(--accent)]">View details</span>:null}
                  </div>
                </div>
                {showPayoutCharges?<>
                  <div className="text-right"><p className="money text-sm font-extrabold text-[var(--text)]">{money(rowPrincipal)}</p></div>
                  <div className="text-right"><p className={"money text-sm font-extrabold "+(rowPayoutCharge>0?"text-rose-600":"text-[var(--text-muted)]")}>{rowPayoutCharge>0?money(rowPayoutCharge):"—"}</p></div>
                  <div className="flex items-center justify-end gap-2"><MoneyFlowIcon direction={isIn?"IN":"OUT"} size="sm"/><p className={"money text-sm font-extrabold "+(isIn?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{isIn?"+":"−"}{money(row.amount)}</p></div>
                  <div className="text-right"><p className="money text-xs font-bold text-[var(--text-muted)]">{money(row.runningBalance)}</p></div>
                </>:<>
                  <div className="flex items-center justify-end gap-2"><MoneyFlowIcon direction={isIn?"IN":"OUT"} size="sm"/><p className={"money text-sm font-extrabold "+(isIn?"text-[var(--money-in)]":"text-[var(--money-out)]")}>{isIn?"+":"−"}{money(row.amount)}</p></div>
                  <div className="text-right"><p className="money text-xs font-bold text-[var(--text-muted)]">{money(row.runningBalance)}</p></div>
                </>}
              </div>
            </button>;
          })}
        </div>:search?<div className="p-5"><EmptyState title="No matching activity" description="Try a different search."/></div>:Math.abs(periodOpening)>0.005?<div className="p-4 sm:p-5"><div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3.5"><div><p className="text-sm font-bold">Opening balance</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">No transactions in this period yet.</p></div><strong className="money shrink-0 text-sm">{money(periodOpening)}</strong></div></div>:<div className="p-5"><EmptyState title="No transactions yet" description="Activity will appear here when money moves through this account."/></div>}
      </Surface>
    </>:null}
    {entryOpen?<Modal open title="New amount entry" onClose={()=>{if(!entrySaving){setEntryOpen(false);resetAccountEntry();}}} footer={<div className="grid grid-cols-2 gap-2"><button type="button" disabled={entrySaving} onClick={()=>{setEntryOpen(false);resetAccountEntry();}} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-bold disabled:opacity-50">Cancel</button><button form="account-amount-entry" disabled={entrySaving||!entryAmount||Number(entryAmount)<=0||entryLabel.trim().length<2} className="app-primary-button min-h-11 text-sm font-black disabled:opacity-50">{entrySaving?"Saving…":"Save entry"}</button></div>}>
      <form id="account-amount-entry" onSubmit={submitAccountEntry} className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-soft)] p-1.5">
          <button type="button" onClick={()=>{setEntryDirection("IN");setEntryKind("OTHER_NON_INCOME");setEntryError("");}} className={"min-h-10 rounded-lg text-sm font-black "+(entryDirection==="IN"?"bg-[var(--surface)] text-emerald-700 shadow-sm":"text-[var(--text-muted)]")}>Money in</button>
          <button type="button" onClick={()=>{setEntryDirection("OUT");setEntryKind("OTHER_NON_EXPENSE");setEntryError("");}} className={"min-h-10 rounded-lg text-sm font-black "+(entryDirection==="OUT"?"bg-[var(--surface)] text-rose-700 shadow-sm":"text-[var(--text-muted)]")}>Money out</button>
        </div>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Category</span><SearchableSelect className="app-control" value={entryKind} onChange={(event)=>setEntryKind(event.target.value)}>{entryDirection==="IN"?<><option value="OTHER_NON_INCOME">Other / adjustment</option><option value="LOAN_RECEIVED">Loan received</option><option value="OWNER_FUNDING">Owner funds added</option></>:<><option value="OTHER_NON_EXPENSE">Other / adjustment</option><option value="LOAN_REPAYMENT">Loan repayment</option><option value="OWNER_WITHDRAWAL">Owner withdrawal</option></>}</SearchableSelect></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Amount</span><input className="app-control" type="number" min="0.01" step="0.01" inputMode="decimal" value={entryAmount} onChange={(event)=>{setEntryAmount(event.target.value);setEntryError("");}} placeholder="₹ 0.00" required/></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Date</span><input className="app-control" type="date" max={localDateValue()} value={entryDate} onChange={(event)=>{setEntryDate(event.target.value);setEntryError("");}} required/></label>
        </div>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Reason / source</span><input className="app-control" value={entryLabel} onChange={(event)=>{setEntryLabel(event.target.value);setEntryError("");}} placeholder={entryKind==="LOAN_RECEIVED"?"e.g. Gold loan credited":entryKind==="LOAN_REPAYMENT"?"e.g. Gold loan repayment":entryKind==="OWNER_FUNDING"?"e.g. Owner funds added":entryKind==="OWNER_WITHDRAWAL"?"e.g. Owner withdrawal":"e.g. Balance adjustment / refund / other source"} required/></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Reference</span><input className="app-control" value={entryReference} onChange={(event)=>setEntryReference(event.target.value)} placeholder="Bank ref / UTR / document no. (optional)"/></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Note</span><textarea className="app-control min-h-20 resize-y" value={entryNote} onChange={(event)=>setEntryNote(event.target.value)} placeholder="Optional note"/></label>
        {entryError?<p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{entryError}</p>:null}
        {entryKind==="LOAN_RECEIVED"?<p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Loan received increases this account and the loan liability. It is not business income.</p>:entryKind==="LOAN_REPAYMENT"?<p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Loan repayment reduces this account and the loan liability. It is not a business expense.</p>:entryKind.startsWith("OTHER_")?<p className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">Use this for balance-affecting money that should not be treated as normal business income or expense. Add the reason so the entry stays auditable.</p>:null}
      </form>
    </Modal>:null}
    {detailOpen&&typeof document!=="undefined"?createPortal(<Modal open title="Account transaction details" description="Trace this account movement back to the customer or source transaction." onClose={()=>{setDetailOpen(false);setDetail(null);setDetailError("");}}>
      {detailLoading?<div className="py-10 text-center text-sm font-semibold text-[var(--text-muted)]">Loading transaction details…</div>:detailError?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{detailError}</div>:detail&&account?<AccountMovementDetail detail={detail} account={account}/>:null}
    </Modal>,document.body):null}
  </PageFrame></AppShell>;
}
