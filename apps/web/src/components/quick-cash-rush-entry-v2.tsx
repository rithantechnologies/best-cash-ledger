"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Direction="IN"|"OUT";
type Purpose="TRANSFER"|"SERVICE";
type CashOutType="UPI_QR"|"AEPS"|"MICRO_ATM";
type CommissionMode="CASH"|"UPI"|"SPLIT";
type BeneficiaryMode="UPI"|"BANK";
type RowStatus="READY"|"SAVING"|"SAVED"|"ERROR";
type RowFilter="ACTIVE"|"UNSAVED"|"PENDING"|"COMPLETE";
const COMPLETE_AUTO_HIDE_THRESHOLD=25;
const RECENT_COMPLETE_ROWS_IN_ACTIVE=10;
type Account={id:string;accountName:string;accountType:string;isActive?:boolean;currentBalance?:string|number};
type ServiceConfig={id:string;name:string;defaultAmount:string|number|null;allowPartnerFulfillment:boolean;defaultPartnerName:string|null;defaultPartnerCharge:string|number|null;isActive:boolean};
type TransferType={id:string;name:string;transferMode:BeneficiaryMode;defaultCommissionRate:string|number;isActive:boolean};
type SavedTransaction={id:string;transactionNumber:string;status:string};
type CustomerSuggestion={id:string;customerCode:string;fullName:string;mobile:string|null};

type RushRow={
  key:string;direction:Direction;purpose:Purpose;amount:string;customerId:string;customerLookup:string;customerSuggestions:CustomerSuggestion[];customerSuggestionIndex:number;customerSearchLoading:boolean;customerName:string;mobileNumber:string;commission:string;commissionOverridden:boolean;
  commissionMode:CommissionMode;commissionCash:string;cashReceived:string;transferTypeId:string;beneficiaryMode:BeneficiaryMode;beneficiaryUpi:string;
  bankAccountHolder:string;bankAccountNumber:string;bankIfsc:string;cashOutType:CashOutType;successful:boolean;aadhaarLastFour:string;
  customerBankName:string;cardLastFour:string;serviceName:string;servicePaymentMode:"CASH"|"UPI";servicePaymentAccountId:string;
  serviceFulfillmentMode:"INTERNAL"|"PARTNER";servicePartnerName:string;servicePartnerCharge:string;servicePartnerPaymentTiming:"PAID_NOW"|"PAY_LATER";
  servicePartnerPaymentAccountId:string;remarks:string;transactionAt:string;expanded:boolean;status:RowStatus;message?:string;
  transactionId?:string;transactionNumber?:string;savedStatus?:string;
};

function newKey(){
  if(typeof crypto!=="undefined"&&"randomUUID" in crypto)return crypto.randomUUID();
  return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
}
function emptyRow(direction:Direction="IN"):RushRow{
  return {
    key:newKey(),direction,purpose:"TRANSFER",amount:"",customerId:"",customerLookup:"",customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:false,customerName:"",mobileNumber:"",commission:"",commissionOverridden:false,
    commissionMode:"CASH",commissionCash:"",cashReceived:"",transferTypeId:"",beneficiaryMode:"UPI",beneficiaryUpi:"",
    bankAccountHolder:"",bankAccountNumber:"",bankIfsc:"",cashOutType:"UPI_QR",successful:true,aadhaarLastFour:"",
    customerBankName:"",cardLastFour:"",serviceName:"",servicePaymentMode:"CASH",servicePaymentAccountId:"",
    serviceFulfillmentMode:"INTERNAL",servicePartnerName:"",servicePartnerCharge:"",servicePartnerPaymentTiming:"PAID_NOW",
    servicePartnerPaymentAccountId:"",remarks:"",transactionAt:"",expanded:false,status:"READY",
  };
}
function hasDraft(row:RushRow){
  return Boolean(row.amount.trim()||row.customerName.trim()||row.mobileNumber.trim()||row.commission.trim()||row.serviceName.trim());
}
function money(value:number){
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number.isFinite(value)?value:0);
}
function cashCommission(row:RushRow){
  const fee=Number(row.commission||0);
  if(row.commissionMode==="UPI")return 0;
  if(row.commissionMode==="SPLIT")return Number(row.commissionCash||0);
  return fee;
}
function cashDue(row:RushRow){
  return Math.round((Number(row.amount||0)+cashCommission(row))*100)/100;
}
function serializeBank(row:RushRow){
  const value={accountHolder:row.bankAccountHolder.trim(),accountNumber:row.bankAccountNumber.trim(),ifsc:row.bankIfsc.trim().toUpperCase()};
  return Object.values(value).some(Boolean)?JSON.stringify(value):"";
}
function transferFee(amountValue:string,type?:TransferType){
  const amount=Number(amountValue);
  if(!type||!amountValue.trim()||!Number.isFinite(amount)||amount<=0)return "";
  if(amount<=500)return "10";
  return String(Math.round((amount*Number(type.defaultCommissionRate||0)/100)*100)/100);
}
function rowError(row:RushRow,services:ServiceConfig[]){
  const amount=Number(row.amount),fee=Number(row.commission||0);
  if(!row.amount.trim()||!Number.isFinite(amount)||amount<=0)return "Enter an amount greater than 0.";
  if(row.purpose==="TRANSFER"&&(!Number.isFinite(fee)||fee<0))return "Fee / commission cannot be negative.";
  if(row.purpose==="TRANSFER"&&row.commissionMode==="SPLIT"){
    const cashPart=Number(row.commissionCash||0);
    if(!Number.isFinite(cashPart)||cashPart<=0||cashPart>=fee)return "Split fee cash part must be greater than 0 and less than the total fee.";
  }
  if(row.direction==="IN"&&row.purpose==="TRANSFER"&&!row.transferTypeId)return "Choose a Cash In mode.";
  if(row.direction==="IN"&&row.purpose==="TRANSFER"&&row.cashReceived.trim()&&Number(row.cashReceived)<cashDue(row))return "Cash received is less than amount + cash fee.";
  if(row.direction==="OUT"&&row.cashOutType==="AEPS"&&!/^\d{4}$/.test(row.aadhaarLastFour))return "Enter Aadhaar last 4 digits.";
  if(row.direction==="OUT"&&row.cashOutType==="MICRO_ATM"&&!/^\d{4}$/.test(row.cardLastFour))return "Enter card last 4 digits.";
  if(row.direction==="IN"&&row.purpose==="SERVICE"){
    if(!row.serviceName.trim())return "Choose or enter a service.";
    if(row.servicePaymentMode==="UPI"&&!row.servicePaymentAccountId)return "Choose the bank / UPI account receiving the service payment.";
    if(row.serviceFulfillmentMode==="PARTNER"){
      if(!row.servicePartnerName.trim())return "Enter the partner / company name.";
      const cost=Number(row.servicePartnerCharge);
      if(!row.servicePartnerCharge.trim()||!Number.isFinite(cost)||cost<=0)return "Partner charge must be greater than 0.";
      if(row.servicePartnerPaymentTiming==="PAID_NOW"&&!row.servicePartnerPaymentAccountId)return "Choose where the partner was paid from.";
    }
    const configured=services.find((item)=>item.name.toLowerCase()===row.serviceName.trim().toLowerCase());
    if(configured&&!configured.allowPartnerFulfillment&&row.serviceFulfillmentMode==="PARTNER")return "This service is configured as done by us.";
  }
  return "";
}
export function QuickCashRushEntryV2({cashAccountId,disabled=false,onSaved,onCompleteTransaction,onShowPending,completedTransactionIds=[],pendingTransactionIds=[]}:{cashAccountId:string;disabled?:boolean;onSaved?:()=>void|Promise<void>;onCompleteTransaction?:(transactionId:string)=>void|Promise<void>;onShowPending?:()=>void;completedTransactionIds?:string[];pendingTransactionIds?:string[]}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [minimized,setMinimized]=useState(false);
  const [maximized,setMaximized]=useState(false);
  const [rowFilter,setRowFilter]=useState<RowFilter>("ACTIVE");
  const [rows,setRows]=useState<RushRow[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [services,setServices]=useState<ServiceConfig[]>([]);
  const [transferTypes,setTransferTypes]=useState<TransferType[]>([]);
  const [configError,setConfigError]=useState("");
  const [savingAll,setSavingAll]=useState(false);
  const [savedSinceRefresh,setSavedSinceRefresh]=useState(false);
  const amountRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const customerSearchTimers=useRef<Record<string,number>>({});
  const lastDirection=useRef<Direction>("IN");

  const activeServices=services.filter((item)=>item.isActive!==false);
  const activeTransferTypes=transferTypes.filter((item)=>item.isActive!==false);
  const servicePaymentAccounts=accounts.filter((item)=>item.isActive!==false&&["BANK","UPI"].includes(item.accountType));
  const partnerPaymentAccounts=accounts.filter((item)=>item.isActive!==false&&(item.id===cashAccountId||["BANK","UPI","PROVIDER_WALLET"].includes(item.accountType)));

  function readyRow(direction:Direction=lastDirection.current,type:TransferType|undefined=activeTransferTypes[0]){
    const row=emptyRow(direction);
    if(direction==="IN"&&type){row.transferTypeId=type.id;row.beneficiaryMode=type.transferMode;}
    return row;
  }
  function keepTrailingBlank(current:RushRow[]){
    if(!current.length)return [readyRow()];
    const last=current[current.length-1];
    return hasDraft(last)||last.status==="SAVED"?[...current,readyRow(last.direction)]:current;
  }

  async function loadConfig(){
    try{
      const [accountRows,serviceRows,transferRows]=await Promise.all([
        apiFetch<Account[]>("/dashboard/accounts"),
        apiFetch<ServiceConfig[]>("/settings/services"),
        apiFetch<TransferType[]>("/settings/cash-in-transfer-types"),
      ]);
      setAccounts(accountRows);setServices(serviceRows);setTransferTypes(transferRows);setConfigError("");
      return transferRows;
    }catch(error){
      setConfigError(error instanceof Error?error.message:"Could not load detailed options.");
      return [] as TransferType[];
    }
  }
  async function openRush(){
    if(disabled||!cashAccountId)return;
    setSavingAll(false);setOpen(true);setMinimized(false);amountRefs.current={};
    const transferRows=await loadConfig();
    if(rows.length){
      window.setTimeout(()=>{
        const firstEditable=rows.find((row)=>row.status!=="SAVED");
        if(firstEditable)amountRefs.current[firstEditable.key]?.focus();
      },60);
      return;
    }
    const defaultType=transferRows.find((item)=>item.isActive!==false);
    const initial=Array.from({length:10},()=>readyRow(lastDirection.current,defaultType));
    setRows(initial);
    window.setTimeout(()=>amountRefs.current[initial[0].key]?.focus(),60);
  }
  async function closeRush(){
    setOpen(false);setMinimized(false);setMaximized(false);
    if(savedSinceRefresh){await onSaved?.();setSavedSinceRefresh(false);}
  }
  function minimizeRush(){setMinimized(true);setRowFilter("ACTIVE");}
  function restoreRush(){setMinimized(false);setOpen(true);}

  function updateRow(key:string,patch:Partial<RushRow>){
    setRows((current)=>keepTrailingBlank(current.map((row)=>row.key===key&&row.status!=="SAVED"?{...row,...patch,status:"READY",message:undefined}:row)));
  }
  function updateAmount(key:string,value:string){
    const clean=value.replace(/[^0-9.]/g,"");
    setRows((current)=>keepTrailingBlank(current.map((row)=>{
      if(row.key!==key||row.status==="SAVED")return row;
      const type=activeTransferTypes.find((item)=>item.id===row.transferTypeId);
      const commission=row.direction==="IN"&&row.purpose==="TRANSFER"&&type&&!row.commissionOverridden?transferFee(clean,type):row.commission;
      return {...row,amount:clean,commission,status:"READY",message:undefined};
    })));
  }
  function setDirection(key:string,direction:Direction){
    const defaultType=activeTransferTypes[0];
    setRows((current)=>keepTrailingBlank(current.map((row)=>{
      if(row.key!==key||row.status==="SAVED")return row;
      const next={...emptyRow(direction),key:row.key,expanded:false};
      if(direction==="IN"&&defaultType){next.transferTypeId=defaultType.id;next.beneficiaryMode=defaultType.transferMode;}
      return next;
    })));
  }
  function toggleExpanded(key:string){
    setRows((current)=>current.map((row)=>row.key===key?{...row,expanded:!row.expanded}:row.expanded?{...row,expanded:false}:row));
  }
  function setTransferType(key:string,id:string){
    const type=activeTransferTypes.find((item)=>item.id===id);
    setRows((current)=>keepTrailingBlank(current.map((row)=>{
      if(row.key!==key||row.status==="SAVED")return row;
      return {...row,purpose:"TRANSFER",transferTypeId:id,beneficiaryMode:type?.transferMode??"UPI",expanded:false,
        commission:type?transferFee(row.amount,type):row.commission,commissionOverridden:false,status:"READY",message:undefined};
    })));
  }
  function setGridMode(row:RushRow,value:string){
    if(row.direction==="OUT"){
      updateRow(row.key,{cashOutType:value as CashOutType,expanded:value!=="UPI_QR",successful:true,
        commissionMode:value==="MICRO_ATM"?"UPI":"CASH",commissionCash:""});
      return;
    }
    if(value==="SERVICE"){updateRow(row.key,{purpose:"SERVICE",expanded:true,commission:"",commissionCash:"",commissionOverridden:false});return;}
    if(value.startsWith("TR:"))setTransferType(row.key,value.slice(3));
  }
  function selectService(row:RushRow,name:string){
    const service=activeServices.find((item)=>item.name.toLowerCase()===name.trim().toLowerCase());
    if(!service){updateRow(row.key,{serviceName:name});return;}
    updateRow(row.key,{
      serviceName:name,
      amount:service.defaultAmount!==null&&service.defaultAmount!==undefined&&Number(service.defaultAmount)>0?String(Number(service.defaultAmount)):row.amount,
      serviceFulfillmentMode:"INTERNAL",servicePartnerName:service.defaultPartnerName??"",
      servicePartnerCharge:service.defaultPartnerCharge!==null&&service.defaultPartnerCharge!==undefined?String(Number(service.defaultPartnerCharge)):"",
      servicePartnerPaymentTiming:"PAID_NOW",servicePartnerPaymentAccountId:cashAccountId,
    });
  }
  function searchCustomer(row:RushRow,value:string){
    const query=value.trim();
    const digits=query.replace(/\D/g,"");
    const looksLikePhone=query.length>0&&/^[+\d\s()-]+$/.test(query);
    updateRow(row.key,{customerLookup:value,customerId:"",customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:query.length>=2,
      customerName:looksLikePhone?"":value.toUpperCase(),mobileNumber:looksLikePhone?digits:(row.customerId?"":row.mobileNumber)});
    if(customerSearchTimers.current[row.key])window.clearTimeout(customerSearchTimers.current[row.key]);
    if(query.length<2)return;
    customerSearchTimers.current[row.key]=window.setTimeout(()=>{
      apiFetch<CustomerSuggestion[]>("/search/customers?q="+encodeURIComponent(query))
        .then((results)=>setRows((current)=>current.map((item)=>item.key===row.key&&!item.customerId&&item.customerLookup.trim()===query?{...item,customerSuggestions:results.slice(0,6),customerSuggestionIndex:results.length?0:-1,customerSearchLoading:false}:item)))
        .catch(()=>setRows((current)=>current.map((item)=>item.key===row.key?{...item,customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:false}:item)));
    },180);
  }
  function selectExistingCustomer(key:string,customer:CustomerSuggestion){
    updateRow(key,{customerId:customer.id,customerLookup:customer.fullName+(customer.mobile?" · "+customer.mobile:""),customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:false,customerName:customer.fullName,mobileNumber:customer.mobile||""});
  }
  function handleCustomerKeyDown(row:RushRow,event:KeyboardEvent<HTMLInputElement>){
    const hasSuggestions=row.customerSuggestions.length>0&&!row.customerId;
    if(event.key==="ArrowDown"&&hasSuggestions){
      event.preventDefault();
      updateRow(row.key,{customerSuggestionIndex:(row.customerSuggestionIndex+1+row.customerSuggestions.length)%row.customerSuggestions.length});
      return;
    }
    if(event.key==="ArrowUp"&&hasSuggestions){
      event.preventDefault();
      updateRow(row.key,{customerSuggestionIndex:(row.customerSuggestionIndex-1+row.customerSuggestions.length)%row.customerSuggestions.length});
      return;
    }
    if(event.key==="Escape"&&(hasSuggestions||row.customerSearchLoading)){
      event.preventDefault();
      updateRow(row.key,{customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:false});
      return;
    }
    if(event.key==="Enter"){
      event.preventDefault();
      if(row.customerSearchLoading)return;
      if(hasSuggestions){
        const index=row.customerSuggestionIndex>=0?row.customerSuggestionIndex:0;
        selectExistingCustomer(row.key,row.customerSuggestions[index]);
        return;
      }
      void saveRow(row.key);
    }
  }
  function addRow(direction:Direction=lastDirection.current){
    const row=readyRow(direction);
    setRows((current)=>[...current,row]);
    requestAnimationFrame(()=>amountRefs.current[row.key]?.focus());
  }
  function removeRow(key:string){
    setRows((current)=>{
      const next=current.filter((row)=>row.key!==key);
      while(next.length<10)next.push(readyRow(lastDirection.current));
      return keepTrailingBlank(next);
    });
  }
  function focusRelative(key:string,delta:number){
    const index=rows.findIndex((row)=>row.key===key),target=rows[index+delta];
    if(target)amountRefs.current[target.key]?.focus();
  }
  function markRow(key:string,patch:Partial<RushRow>){setRows((current)=>current.map((row)=>row.key===key?{...row,...patch}:row));}

  async function saveSnapshot(row:RushRow,focusNext:boolean){
    if(row.status==="SAVED"||row.status==="SAVING")return true;
    const validation=rowError(row,activeServices);
    if(validation){markRow(row.key,{status:"ERROR",message:validation,expanded:true});amountRefs.current[row.key]?.focus();return false;}
    markRow(row.key,{status:"SAVING",message:undefined});
    const amount=Number(row.amount),commission=Number(row.commission||0),purpose=row.direction==="IN"?row.purpose:"TRANSFER";
    const cashFee=cashCommission(row);
    const selectedType=activeTransferTypes.find((item)=>item.id===row.transferTypeId);
    const beneficiaryDetails=row.beneficiaryMode==="BANK"?serializeBank(row):row.beneficiaryUpi.trim();
    const failedProvider=row.direction==="OUT"&&row.cashOutType!=="UPI_QR"&&!row.successful;
    try{
      const transaction=await apiFetch<SavedTransaction>("/transactions/quick-cash",{
        method:"POST",headers:{"idempotency-key":"cash-rush-v2-"+row.key},
        body:JSON.stringify({
          direction:row.direction,cashAccountId,amount,purpose,
          cashReceivedAmount:row.direction==="IN"&&purpose==="TRANSFER"?(row.cashReceived.trim()?Number(row.cashReceived):cashDue(row)):undefined,
          serviceName:purpose==="SERVICE"?row.serviceName.trim():(row.direction==="IN"&&selectedType?selectedType.name:undefined),
          cashOutType:row.direction==="OUT"?row.cashOutType:undefined,
          successful:row.direction==="OUT"&&row.cashOutType!=="UPI_QR"?row.successful:undefined,
          customerId:row.customerId||undefined,
          aadhaarLastFour:row.direction==="OUT"&&row.cashOutType==="AEPS"?row.aadhaarLastFour:undefined,
          customerBankName:row.direction==="OUT"&&row.cashOutType==="MICRO_ATM"?row.customerBankName.trim()||undefined:undefined,
          cardLastFour:row.direction==="OUT"&&row.cashOutType==="MICRO_ATM"?row.cardLastFour:undefined,
          commissionAmount:purpose==="TRANSFER"?(failedProvider?0:commission):0,
          commissionCashAmount:purpose==="TRANSFER"&&commission>0&&!failedProvider?(row.direction==="OUT"&&row.cashOutType==="MICRO_ATM"?0:cashFee):undefined,
          commissionMode:purpose==="TRANSFER"&&commission>0&&!failedProvider?(row.direction==="OUT"&&row.cashOutType==="MICRO_ATM"?"UPI":row.commissionMode):undefined,
          beneficiaryMode:row.direction==="IN"&&purpose==="TRANSFER"?row.beneficiaryMode:undefined,
          beneficiaryDetails:row.direction==="IN"&&purpose==="TRANSFER"?beneficiaryDetails||undefined:undefined,
          servicePaymentMode:purpose==="SERVICE"?row.servicePaymentMode:undefined,
          servicePaymentAccountId:purpose==="SERVICE"&&row.servicePaymentMode==="UPI"?row.servicePaymentAccountId||undefined:undefined,
          serviceFulfillmentMode:purpose==="SERVICE"?row.serviceFulfillmentMode:undefined,
          servicePartnerName:purpose==="SERVICE"&&row.serviceFulfillmentMode==="PARTNER"?row.servicePartnerName.trim()||undefined:undefined,
          servicePartnerCharge:purpose==="SERVICE"&&row.serviceFulfillmentMode==="PARTNER"?Number(row.servicePartnerCharge||0):undefined,
          servicePartnerPaymentTiming:purpose==="SERVICE"&&row.serviceFulfillmentMode==="PARTNER"?row.servicePartnerPaymentTiming:undefined,
          servicePartnerPaymentAccountId:purpose==="SERVICE"&&row.serviceFulfillmentMode==="PARTNER"&&row.servicePartnerPaymentTiming==="PAID_NOW"?row.servicePartnerPaymentAccountId||undefined:undefined,
          customerName:row.customerName.trim()||undefined,mobileNumber:row.mobileNumber.trim()||undefined,remarks:row.remarks.trim()||undefined,
          transactionAt:row.direction==="OUT"&&row.transactionAt?new Date(row.transactionAt).toISOString():undefined,
        }),
      });
      lastDirection.current=row.direction;setSavedSinceRefresh(true);
      let nextKey="";
      setRows((current)=>{
        const index=current.findIndex((item)=>item.key===row.key);if(index<0)return current;
        const next=[...current];next[index]={...next[index],status:"SAVED",expanded:false,message:undefined,transactionId:transaction.id,transactionNumber:transaction.transactionNumber,savedStatus:transaction.status};
        if(focusNext){if(!next[index+1])next.push(readyRow(row.direction));nextKey=next[index+1].key;}
        return next;
      });
      if(focusNext)window.setTimeout(()=>amountRefs.current[nextKey]?.focus(),30);
      return true;
    }catch(error){markRow(row.key,{status:"ERROR",message:error instanceof Error?error.message:"Could not save this row",expanded:true});return false;}
  }
  async function saveRow(key:string){const row=rows.find((item)=>item.key===key);if(row)await saveSnapshot(row,true);}
  async function saveAll(){
    if(savingAll)return;setSavingAll(true);
    try{
      const snapshots=rows.filter((row)=>row.status!=="SAVED"&&hasDraft(row));
      for(const row of snapshots)await saveSnapshot(row,false);
      if(snapshots.length)await onSaved?.();
      if(snapshots.length)setSavedSinceRefresh(false);
    }finally{setSavingAll(false);}
  }
  async function openTransaction(row:RushRow){
    if(!row.transactionId)return;setOpen(false);if(savedSinceRefresh)await onSaved?.();router.push("/transactions/"+row.transactionId);
  }
  const completedSet=new Set(completedTransactionIds);
  const savedRows=rows.filter((row)=>row.status==="SAVED"),enteredRows=rows.filter(hasDraft);
  const pendingRows=rows.filter((row)=>row.status==="SAVED"&&row.savedStatus==="PENDING"&&Boolean(row.transactionId)&&!completedSet.has(row.transactionId!));
  const completeRows=rows.filter((row)=>row.status==="SAVED"&&!pendingRows.includes(row));
  const readyTotal=enteredRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const unsavedCount=rows.filter((row)=>row.status!=="SAVED"&&hasDraft(row)).length;
  const collapseOlderComplete=rowFilter==="ACTIVE"&&savedRows.length>=COMPLETE_AUTO_HIDE_THRESHOLD&&completeRows.length>RECENT_COMPLETE_ROWS_IN_ACTIVE;
  const recentCompleteKeys=new Set(collapseOlderComplete?completeRows.slice(-RECENT_COMPLETE_ROWS_IN_ACTIVE).map((row)=>row.key):[]);
  const hiddenCompleteCount=collapseOlderComplete?completeRows.length-recentCompleteKeys.size:0;
  const visibleRows=rows.map((row,index)=>({row,index})).filter(({row})=>{
    if(rowFilter==="UNSAVED")return row.status!=="SAVED"&&hasDraft(row);
    if(rowFilter==="PENDING")return pendingRows.includes(row);
    if(rowFilter==="COMPLETE")return completeRows.includes(row);
    if(!collapseOlderComplete)return true;
    return !completeRows.includes(row)||recentCompleteKeys.has(row.key);
  });

  return <>
    <button type="button" onClick={openRush} disabled={disabled||!cashAccountId}
      className="flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900 px-3 text-[12px] font-black text-white shadow-[0_6px_18px_rgba(15,23,42,.22)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40">
      <span className="text-sm">▦</span><span>Rush / Bulk</span>
    </button>
    {open&&minimized&&typeof document!=="undefined"?createPortal(<div className="fixed bottom-[calc(.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[90] flex items-center gap-2 rounded-2xl border border-violet-200 bg-[var(--surface)] px-3 py-2.5 shadow-2xl sm:left-auto sm:right-4 sm:w-[420px] sm:gap-3 sm:px-4 sm:py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">Rush Cash Entry</p><p className="mt-0.5 truncate text-[10px] font-bold text-[var(--text-muted)]">{savedRows.length} saved · {pendingRows.length} pending · {unsavedCount} unsaved</p></div><button type="button" onClick={restoreRush} className="min-h-9 shrink-0 rounded-lg bg-violet-600 px-3 text-[10px] font-black text-white">Restore</button><button type="button" onClick={()=>void closeRush()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-soft)] font-black text-[var(--text-muted)]">×</button></div>,document.body):null}
    {open&&!minimized&&typeof document!=="undefined"?createPortal(
      <div className="fixed inset-0 z-[105] flex flex-col bg-black/45 p-0 sm:p-3" role="dialog" aria-modal="true" aria-label="Rush cash entry">
        <div className={"m-auto flex w-full flex-col overflow-hidden bg-[var(--surface)] shadow-2xl "+(maximized?"h-[100dvh] max-h-[100dvh] max-w-none rounded-none":"max-h-[97dvh] max-w-[1480px] rounded-none sm:rounded-[22px]")}>
          <header className="grid min-h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="truncate text-[17px] font-black tracking-[-.03em]">Rush Cash Entry</h2><span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">Counter</span>{pendingTransactionIds.length&&onShowPending?<button type="button" onClick={()=>{setOpen(false);setMinimized(false);onShowPending();}} className="min-h-7 shrink-0 rounded-full bg-amber-100 px-2.5 text-[9px] font-black text-amber-800">⚠ {pendingTransactionIds.length} need completion</button>:null}</div>
            <div className="flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] p-0.5">{(["ACTIVE","UNSAVED","PENDING","COMPLETE"] as RowFilter[]).map((filter)=><button key={filter} type="button" onClick={()=>setRowFilter(filter)} className={"min-h-7 rounded-md px-2 text-[9px] font-black "+(rowFilter===filter?"bg-white text-violet-700 shadow-sm":"text-[var(--text-muted)]")}>{filter==="ACTIVE"?"Active":filter==="UNSAVED"?"Unsaved "+unsavedCount:filter==="PENDING"?"Pending "+pendingRows.length:"Complete "+completeRows.length}</button>)}</div>
            <div className="flex items-center justify-end gap-1 sm:border-l sm:border-[var(--border)] sm:pl-2"><button type="button" onClick={minimizeRush} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-sm font-black text-[var(--text-muted)]" aria-label="Minimize">—</button><button type="button" onClick={()=>setMaximized((value)=>!value)} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-xs font-black text-[var(--text-muted)]" aria-label={maximized?"Restore size":"Maximize"}>{maximized?"❐":"□"}</button><button type="button" onClick={()=>void closeRush()} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-lg font-bold text-[var(--text-muted)]" aria-label="Close rush entry">×</button></div>
          </header>
          {configError?<div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-[10px] font-bold text-amber-800">{configError}</div>:null}

          <div className="min-h-0 flex-1 overflow-auto" onKeyDown={(event)=>{if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();void saveAll();}}}>
            <div className="min-w-[1080px]">
              <div className="sticky top-0 z-20 grid grid-cols-[34px_118px_175px_125px_92px_110px_minmax(210px,1fr)_168px] gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">
                <span>#</span><span>Type</span><span>Mode <b className="text-rose-500">*</b></span><span>Amount <b className="text-rose-500">*</b></span><span>Fee</span><span>Due / Payout</span><span className="opacity-70">Customer · optional</span><span className="text-right">Action</span>
              </div>
              {rowFilter==="ACTIVE"&&hiddenCompleteCount>0?<button type="button" onClick={()=>setRowFilter("COMPLETE")} className="flex w-full items-center justify-between border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[10px] font-black text-emerald-800 hover:bg-emerald-100">
                <span>{hiddenCompleteCount} older completed rows hidden from Active</span><span>View Complete →</span>
              </button>:null}
              <div className="divide-y divide-[var(--border)]">
                {visibleRows.map(({row,index})=>{
                  const modeValue=row.direction==="OUT"?row.cashOutType:row.purpose==="SERVICE"?"SERVICE":row.transferTypeId?"TR:"+row.transferTypeId:"";
                  const selectedService=activeServices.find((item)=>item.name.toLowerCase()===row.serviceName.trim().toLowerCase());
                  const due=cashDue(row),given=row.cashReceived.trim()?Number(row.cashReceived):due,change=Math.max(0,given-due);
                  const primaryDue=row.direction==="IN"&&row.purpose==="TRANSFER"?due:Number(row.amount||0);
                  const dueWord=row.direction==="OUT"?"payout":row.purpose==="SERVICE"?"charge":"due";
                  const customerValue=row.customerLookup||row.customerName;
                  const isPending=row.status==="SAVED"&&row.savedStatus==="PENDING"&&Boolean(row.transactionId)&&!completedSet.has(row.transactionId!);
                  return <div key={row.key} className={"group "+(row.expanded?"bg-violet-50/20":row.status==="SAVED"?(isPending?"bg-amber-50/30":"bg-emerald-50/30"):"")}>
                    <div className="grid grid-cols-[34px_118px_175px_125px_92px_110px_minmax(210px,1fr)_168px] items-center gap-2 px-3 py-1.5">
                      <span className="text-center text-[10px] font-black text-[var(--text-muted)]">{index+1}</span>
                      <select value={row.direction} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>setDirection(row.key,event.target.value as Direction)}
                        className={"h-9 rounded-lg border px-2 text-[12px] font-black outline-none "+(row.direction==="IN"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-rose-200 bg-rose-50 text-rose-700")}>
                        <option value="IN">↓ Cash In</option><option value="OUT">↑ Cash Out</option>
                      </select>
                      <select value={modeValue} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>setGridMode(row,event.target.value)}
                        className="h-9 rounded-lg border border-violet-200 bg-white px-2 text-[11px] font-black outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100">
                        {row.direction==="IN"?<><option value="" disabled>Select mode</option>{activeTransferTypes.map((item)=><option key={item.id} value={"TR:"+item.id}>{item.name}</option>)}<option value="SERVICE">Service</option></>:<>
                          <option value="UPI_QR">UPI / QR</option><option value="AEPS">AEPS</option><option value="MICRO_ATM">Micro ATM</option></>}
                      </select>
                      <div className="flex h-9 items-center rounded-lg border border-violet-200 bg-white px-2 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100">
                        <span className="mr-1 text-xs font-black">₹</span><input ref={(element)=>{amountRefs.current[row.key]=element;}} inputMode="decimal" value={row.amount}
                          disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>updateAmount(row.key,event.target.value)}
                          onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}else if(event.key==="ArrowDown"){event.preventDefault();focusRelative(row.key,1);}else if(event.key==="ArrowUp"){event.preventDefault();focusRelative(row.key,-1);}}}
                          className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-black tabular-nums outline-none disabled:opacity-60" placeholder="0"/></div>
                      <div className="flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-2 focus-within:border-violet-400">
                        <span className="mr-1 text-[10px] font-black text-[var(--text-muted)]">₹</span><input inputMode="decimal" value={row.commission} disabled={row.status==="SAVED"||row.status==="SAVING"||row.purpose==="SERVICE"}
                          onChange={(event)=>updateRow(row.key,{commission:event.target.value.replace(/[^0-9.]/g,""),commissionOverridden:true})}
                          onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}}
                          className="min-w-0 flex-1 bg-transparent text-right text-[12px] font-black tabular-nums outline-none disabled:opacity-40" placeholder="0"/></div>
                      <div className={"rounded-lg px-2 py-1.5 text-right "+(row.direction==="OUT"?"bg-rose-50":"bg-emerald-50")}>
                        <strong className={"money block text-[12px] font-black "+(row.direction==="OUT"?"text-rose-800":"text-emerald-800")}>{money(primaryDue)}</strong>
                        <span className={"block text-[8px] font-black uppercase tracking-wide "+(row.direction==="OUT"?"text-rose-600":"text-emerald-600")}>{dueWord}</span>
                      </div>
                      <div className="relative">
                        <input value={customerValue} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>searchCustomer(row,event.target.value)}
                          onKeyDown={(event)=>handleCustomerKeyDown(row,event)}
                          className="h-9 w-full rounded-lg border border-transparent bg-[var(--surface-soft)] px-2.5 text-[11px] font-bold outline-none placeholder:text-[var(--text-muted)]/70 focus:border-[var(--border)] focus:bg-white disabled:opacity-60" placeholder="Name / mobile"/>
                        {!row.customerId&&row.customerLookup.trim().length>=2?<div className="absolute inset-x-0 top-[calc(100%+4px)] z-40 max-h-44 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
                          {row.customerSearchLoading?<p className="px-2 py-1.5 text-[10px] font-semibold text-[var(--text-muted)]">Searching…</p>:row.customerSuggestions.length?row.customerSuggestions.map((customer,suggestionIndex)=><button key={customer.id} type="button" onMouseEnter={()=>updateRow(row.key,{customerSuggestionIndex:suggestionIndex})} onClick={()=>selectExistingCustomer(row.key,customer)} className={"flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left "+(suggestionIndex===row.customerSuggestionIndex?"bg-violet-50":"hover:bg-[var(--surface-soft)]")}><span className="min-w-0"><strong className="block truncate text-[10px]">{customer.fullName}</strong><span className="block truncate text-[9px] text-[var(--text-muted)]">{customer.mobile||"No mobile"} · {customer.customerCode}</span></span><span className="text-[9px] font-black text-violet-600">Use</span></button>):<p className="px-2 py-1.5 text-[10px] text-[var(--text-muted)]">No match · Enter saves as entered</p>}
                        </div>:null}
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        {row.status==="SAVED"?isPending?<><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-800">Pending</span><button type="button" onClick={()=>{setMinimized(true);if(row.transactionId)void onCompleteTransaction?.(row.transactionId);}} className="min-h-8 rounded-lg bg-amber-500 px-2.5 text-[10px] font-black text-white">Complete</button></>:<><span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">✓ Complete</span><button type="button" onClick={()=>void openTransaction(row)} className="min-h-8 rounded-lg bg-emerald-600 px-2.5 text-[10px] font-black text-white">Open</button></>:
                        <>{row.status==="SAVING"?<span className="mr-1 text-[9px] font-black text-violet-700">Saving…</span>:row.status==="ERROR"?<span title={row.message} className="grid h-6 w-6 place-items-center rounded-full bg-rose-50 text-[10px] font-black text-rose-600">!</span>:null}
                          <button type="button" disabled={row.status==="SAVING"} onClick={()=>toggleExpanded(row.key)} className={"min-h-8 rounded-lg px-2.5 text-[10px] font-black "+(row.expanded?"bg-violet-100 text-violet-700":"bg-[var(--surface-soft)] text-violet-700")}>{row.expanded?"Hide":"Details"}</button>
                          <button type="button" disabled={row.status==="SAVING"||!hasDraft(row)} onClick={()=>void saveRow(row.key)} className="min-h-8 rounded-lg bg-violet-600 px-3 text-[10px] font-black text-white shadow-sm disabled:opacity-25">Save</button>
                          <button type="button" disabled={row.status==="SAVING"} onClick={()=>removeRow(row.key)} className="grid h-8 w-7 place-items-center rounded-lg text-sm font-black text-[var(--text-muted)] opacity-0 transition hover:bg-rose-50 hover:text-rose-600 hover:opacity-100 focus:opacity-100 group-hover:opacity-35 group-focus-within:opacity-35" aria-label={"Remove row "+(index+1)}>×</button></>}
                      </div>
                    </div>

                    {row.expanded&&row.status!=="SAVED"?<div className="border-t border-violet-100 bg-white px-3 py-1.5">
                      <div className="overflow-x-auto pb-0.5">
                        {row.direction==="IN"&&row.purpose==="TRANSFER"?<div className="flex min-w-max items-stretch gap-2">
                          <div className="order-2 w-[220px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                            <span className="block text-[8px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">Fee paid by</span>
                            <div className="mt-1 grid grid-cols-3 rounded-md bg-white p-0.5">{(["CASH","UPI","SPLIT"] as CommissionMode[]).map((mode)=><button key={mode} type="button" onClick={()=>updateRow(row.key,{commissionMode:mode,commissionCash:mode==="SPLIT"?row.commissionCash:""})} className={"min-h-7 rounded-[6px] px-1 text-[9px] font-black "+(row.commissionMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":mode==="UPI"?"Bank / UPI":"Both"}</button>)}</div>
                            {row.commissionMode==="SPLIT"?<div className="mt-1 flex h-7 items-center rounded-md bg-white px-2"><span className="text-[9px] font-bold text-[var(--text-muted)]">Cash ₹</span><input inputMode="decimal" value={row.commissionCash} onChange={(event)=>updateRow(row.key,{commissionCash:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right text-[10px] font-black outline-none" placeholder="0"/></div>:null}
                          </div>
                          <div className="order-1 w-[430px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2"><span className="text-[8px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">Beneficiary</span><span className="text-[8px] font-bold text-[var(--text-muted)]">{activeTransferTypes.find((item)=>item.id===row.transferTypeId)?.name||""}</span></div>
                            {row.beneficiaryMode==="UPI"?<input value={row.beneficiaryUpi} onChange={(event)=>updateRow(row.key,{beneficiaryUpi:event.target.value})} className="mt-1 h-8 w-full rounded-md border border-[var(--border)] bg-white px-2 text-[10px] font-bold outline-none" placeholder="UPI ID / mobile"/>:
                            <div className="mt-1 grid grid-cols-3 gap-1"><input value={row.bankAccountHolder} onChange={(event)=>updateRow(row.key,{bankAccountHolder:event.target.value})} className="h-8 rounded-md border border-[var(--border)] bg-white px-2 text-[10px] font-bold outline-none" placeholder="Account holder"/><input value={row.bankAccountNumber} onChange={(event)=>updateRow(row.key,{bankAccountNumber:event.target.value.replace(/\s/g,"")})} className="h-8 rounded-md border border-[var(--border)] bg-white px-2 text-[10px] font-bold outline-none" placeholder="Account number"/><input value={row.bankIfsc} onChange={(event)=>updateRow(row.key,{bankIfsc:event.target.value.toUpperCase().replace(/\s/g,"")})} className="h-8 rounded-md border border-[var(--border)] bg-white px-2 text-[10px] font-bold uppercase outline-none" placeholder="IFSC"/></div>}
                          </div>
                          <label className="order-3 w-[145px] shrink-0 rounded-lg bg-emerald-50 px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-emerald-700">Cash received</span><div className="mt-1 flex h-8 items-center gap-1"><span className="font-black">₹</span><input inputMode="decimal" value={row.cashReceived} onChange={(event)=>updateRow(row.key,{cashReceived:event.target.value.replace(/[^0-9.]/g,"")})} placeholder={String(due||0)} className="min-w-0 flex-1 bg-transparent text-[11px] font-black outline-none"/></div></label>
                          <div className="order-4 w-[105px] shrink-0 rounded-lg bg-emerald-100 px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-emerald-700">Give back</span><strong className="money mt-1 block text-[14px] text-emerald-700">{money(change)}</strong></div>
                          <label className="w-[145px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Mobile · optional</span><input type="tel" value={row.mobileNumber} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Mobile"/></label>
                          <label className="order-6 w-[185px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Note · optional</span><input value={row.remarks} onChange={(event)=>updateRow(row.key,{remarks:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Reference / note"/></label>
                        </div>:null}
                        {row.direction==="IN"&&row.purpose==="SERVICE"?<div className="flex min-w-max items-stretch gap-2">
                          <label className="w-[210px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Service <b className="text-rose-500">*</b></span><select value={row.serviceName} onChange={(event)=>selectService(row,event.target.value)} className="mt-1 h-8 w-full cursor-pointer rounded-md border border-violet-200 bg-white px-2 text-[10px] font-black outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"><option value="">Select service</option>{activeServices.map((item)=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
                          <div className="w-[190px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Customer paid by</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5">{(["CASH","UPI"] as const).map((mode)=><button type="button" key={mode} onClick={()=>updateRow(row.key,{servicePaymentMode:mode,servicePaymentAccountId:mode==="CASH"?"":row.servicePaymentAccountId})} className={"min-h-7 rounded-[6px] text-[9px] font-black "+(row.servicePaymentMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":"Bank / UPI"}</button>)}</div></div>
                          {row.servicePaymentMode==="UPI"?<label className="w-[180px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Received in <b className="text-rose-500">*</b></span><select value={row.servicePaymentAccountId} onChange={(event)=>updateRow(row.key,{servicePaymentAccountId:event.target.value})} className="mt-1 h-8 w-full rounded-md border border-violet-200 bg-white px-2 text-[10px] font-bold"><option value="">Select account</option>{servicePaymentAccounts.map((item)=><option key={item.id} value={item.id}>{item.accountName}</option>)}</select></label>:null}
                          <div className="w-[170px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Fulfilled by</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5"><button type="button" onClick={()=>updateRow(row.key,{serviceFulfillmentMode:"INTERNAL"})} className={"min-h-7 rounded-[6px] text-[9px] font-black "+(row.serviceFulfillmentMode==="INTERNAL"?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>Us</button><button type="button" disabled={Boolean(selectedService&&!selectedService.allowPartnerFulfillment)} onClick={()=>updateRow(row.key,{serviceFulfillmentMode:"PARTNER",servicePartnerName:row.servicePartnerName||selectedService?.defaultPartnerName||"",servicePartnerCharge:row.servicePartnerCharge||(selectedService?.defaultPartnerCharge!==null&&selectedService?.defaultPartnerCharge!==undefined?String(Number(selectedService.defaultPartnerCharge)):""),servicePartnerPaymentAccountId:row.servicePartnerPaymentAccountId||cashAccountId})} className={"min-h-7 rounded-[6px] text-[9px] font-black disabled:opacity-30 "+(row.serviceFulfillmentMode==="PARTNER"?"bg-violet-50 text-violet-700":"text-[var(--text-muted)]")}>Partner</button></div></div>
                          {row.serviceFulfillmentMode==="PARTNER"?<><label className="w-[165px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Partner <b className="text-rose-500">*</b></span><input value={row.servicePartnerName} onChange={(event)=>updateRow(row.key,{servicePartnerName:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Company"/></label>
                            <label className="w-[105px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Cost <b className="text-rose-500">*</b></span><div className="mt-1 flex h-8 items-center rounded-md bg-white px-2"><span className="text-[9px] font-black">₹</span><input inputMode="decimal" value={row.servicePartnerCharge} onChange={(event)=>updateRow(row.key,{servicePartnerCharge:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right text-[10px] font-black outline-none"/></div></label>
                            <div className="w-[145px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Partner payment</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5"><button type="button" onClick={()=>updateRow(row.key,{servicePartnerPaymentTiming:"PAID_NOW",servicePartnerPaymentAccountId:row.servicePartnerPaymentAccountId||cashAccountId})} className={"min-h-7 rounded-[6px] text-[9px] font-black "+(row.servicePartnerPaymentTiming==="PAID_NOW"?"bg-blue-50 text-blue-700":"text-[var(--text-muted)]")}>Now</button><button type="button" onClick={()=>updateRow(row.key,{servicePartnerPaymentTiming:"PAY_LATER"})} className={"min-h-7 rounded-[6px] text-[9px] font-black "+(row.servicePartnerPaymentTiming==="PAY_LATER"?"bg-amber-50 text-amber-700":"text-[var(--text-muted)]")}>Later</button></div></div>
                            {row.servicePartnerPaymentTiming==="PAID_NOW"?<label className="w-[175px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Paid from <b className="text-rose-500">*</b></span><select value={row.servicePartnerPaymentAccountId} onChange={(event)=>updateRow(row.key,{servicePartnerPaymentAccountId:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold"><option value="">Select account</option>{partnerPaymentAccounts.map((item)=><option key={item.id} value={item.id}>{item.accountName}</option>)}</select></label>:<div className="w-[125px] shrink-0 rounded-lg bg-amber-50 px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-amber-700">Payable</span><strong className="money mt-1 block text-[12px] text-amber-800">{money(Number(row.servicePartnerCharge||0))}</strong></div>}
                            <div className="w-[120px] shrink-0 rounded-lg bg-emerald-50 px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-emerald-700">Our earning</span><strong className="money mt-1 block text-[12px] text-emerald-800">{money(Number(row.amount||0)-Number(row.servicePartnerCharge||0))}</strong></div></>:null}
                          <label className="w-[145px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Mobile · optional</span><input type="tel" value={row.mobileNumber} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Mobile"/></label>
                          <label className="w-[180px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Note · optional</span><input value={row.remarks} onChange={(event)=>updateRow(row.key,{remarks:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Note"/></label>
                        </div>:null}
                        {row.direction==="OUT"?<div className="flex min-w-max items-stretch gap-2">
                          {row.cashOutType!=="UPI_QR"?<><div className="w-[155px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Attempt</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5"><button type="button" onClick={()=>updateRow(row.key,{successful:true})} className={"min-h-7 rounded-[6px] text-[9px] font-black "+(row.successful?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>Success</button><button type="button" onClick={()=>updateRow(row.key,{successful:false,commission:"",commissionCash:""})} className={"min-h-7 rounded-[6px] text-[9px] font-black "+(!row.successful?"bg-rose-50 text-rose-700":"text-[var(--text-muted)]")}>Failed</button></div></div>
                            {row.cashOutType==="AEPS"?<label className="w-[120px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Aadhaar last 4 <b className="text-rose-500">*</b></span><input inputMode="numeric" maxLength={4} value={row.aadhaarLastFour} onChange={(event)=>updateRow(row.key,{aadhaarLastFour:event.target.value.replace(/\D/g,"").slice(0,4)})} className="mt-1 h-8 w-full rounded-md border border-violet-200 bg-white px-2 text-[10px] font-black tracking-widest outline-none" placeholder="1234"/></label>:<>
                              <label className="w-[105px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Card last 4 <b className="text-rose-500">*</b></span><input inputMode="numeric" maxLength={4} value={row.cardLastFour} onChange={(event)=>updateRow(row.key,{cardLastFour:event.target.value.replace(/\D/g,"").slice(0,4)})} className="mt-1 h-8 w-full rounded-md border border-violet-200 bg-white px-2 text-[10px] font-black tracking-widest outline-none" placeholder="1234"/></label>
                              <label className="w-[145px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Customer bank</span><input value={row.customerBankName} onChange={(event)=>updateRow(row.key,{customerBankName:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Bank"/></label></>}
                          </>:null}
                          {row.commission&&Number(row.commission)>0&&row.successful?<div className="w-[205px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Commission in</span>{row.cashOutType==="MICRO_ATM"?<div className="mt-1 flex h-8 items-center rounded-md bg-blue-50 px-2 text-[9px] font-black text-blue-700">Bank / UPI</div>:<div className="mt-1 grid grid-cols-3 rounded-md bg-white p-0.5">{(["CASH","UPI","SPLIT"] as CommissionMode[]).map((mode)=><button key={mode} type="button" onClick={()=>updateRow(row.key,{commissionMode:mode,commissionCash:mode==="SPLIT"?row.commissionCash:""})} className={"min-h-7 rounded-[6px] px-1 text-[9px] font-black "+(row.commissionMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":mode==="UPI"?"UPI":"Split"}</button>)}</div>}{row.commissionMode==="SPLIT"&&row.cashOutType!=="MICRO_ATM"?<div className="mt-1 flex h-7 items-center rounded-md bg-white px-2"><span className="text-[9px] font-bold">Cash ₹</span><input inputMode="decimal" value={row.commissionCash} onChange={(event)=>updateRow(row.key,{commissionCash:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right text-[10px] font-black outline-none"/></div>:null}</div>:null}
                          <label className="w-[145px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Mobile · optional</span><input type="tel" value={row.mobileNumber} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Mobile"/></label>
                          <label className="w-[180px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Note · optional</span><input value={row.remarks} onChange={(event)=>updateRow(row.key,{remarks:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none" placeholder="Reference"/></label>
                          <label className="w-[180px] shrink-0 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5"><span className="block text-[8px] font-black uppercase text-[var(--text-muted)]">Date & time · optional</span><input type="datetime-local" value={row.transactionAt} onChange={(event)=>updateRow(row.key,{transactionAt:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[9px] font-bold outline-none"/></label>
                        </div>:null}
                      </div>
                      {row.status==="ERROR"&&row.message?<p className="mt-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[9px] font-bold text-rose-700">{row.message}</p>:null}
                    </div>:null}
                  </div>;
                })}
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={()=>addRow("IN")} className="min-h-9 rounded-lg bg-emerald-50 px-3 text-[10px] font-black text-emerald-700">+ Cash In</button>
                <button type="button" onClick={()=>addRow("OUT")} className="min-h-9 rounded-lg bg-rose-50 px-3 text-[10px] font-black text-rose-700">+ Cash Out</button>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block"><p className="text-[9px] font-black uppercase tracking-wide text-[var(--text-muted)]">{savedRows.length} saved · <span className={pendingRows.length?"text-amber-700":"text-[var(--text-muted)]"}>{pendingRows.length} pending</span> · {unsavedCount} unsaved</p><p className="money mt-0.5 text-[12px] font-black">{money(readyTotal)} total</p></div>
                <button type="button" onClick={()=>void saveAll()} disabled={savingAll||enteredRows.every((row)=>row.status==="SAVED")} className="min-h-9 rounded-lg bg-violet-600 px-4 text-[11px] font-black text-white shadow-sm disabled:opacity-30">{savingAll?"Saving…":"Save all"}</button>
              </div>
            </div>
          </footer>
        </div>
      </div>,document.body):null}
  </>;
}
