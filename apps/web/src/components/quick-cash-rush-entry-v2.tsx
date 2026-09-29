"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Direction="IN"|"OUT";
type Purpose="TRANSFER"|"SERVICE";
type CashOutType="UPI_QR"|"AEPS"|"MICRO_ATM";
type CommissionMode="CASH"|"UPI"|"SPLIT";
type BeneficiaryMode="UPI"|"BANK";
type RowStatus="READY"|"SAVING"|"SAVED"|"ERROR";
type Account={id:string;accountName:string;accountType:string;isActive?:boolean;currentBalance?:string|number};
type ServiceConfig={id:string;name:string;defaultAmount:string|number|null;allowPartnerFulfillment:boolean;defaultPartnerName:string|null;defaultPartnerCharge:string|number|null;isActive:boolean};
type TransferType={id:string;name:string;transferMode:BeneficiaryMode;defaultCommissionRate:string|number;isActive:boolean};
type SavedTransaction={id:string;transactionNumber:string;status:string};

type RushRow={
  key:string;direction:Direction;purpose:Purpose;amount:string;customerName:string;mobileNumber:string;commission:string;commissionOverridden:boolean;
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
    key:newKey(),direction,purpose:"TRANSFER",amount:"",customerName:"",mobileNumber:"",commission:"",commissionOverridden:false,
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
function outLabel(type:CashOutType){
  return type==="AEPS"?"AEPS":type==="MICRO_ATM"?"Micro ATM":"UPI / QR";
}

export function QuickCashRushEntryV2({cashAccountId,disabled=false,onSaved}:{cashAccountId:string;disabled?:boolean;onSaved?:()=>void|Promise<void>}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<RushRow[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [services,setServices]=useState<ServiceConfig[]>([]);
  const [transferTypes,setTransferTypes]=useState<TransferType[]>([]);
  const [configError,setConfigError]=useState("");
  const [savingAll,setSavingAll]=useState(false);
  const [savedSinceRefresh,setSavedSinceRefresh]=useState(false);
  const amountRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const lastDirection=useRef<Direction>("IN");

  const activeServices=services.filter((item)=>item.isActive!==false);
  const activeTransferTypes=transferTypes.filter((item)=>item.isActive!==false);
  const servicePaymentAccounts=accounts.filter((item)=>item.isActive!==false&&["BANK","UPI"].includes(item.accountType));
  const partnerPaymentAccounts=accounts.filter((item)=>item.isActive!==false&&(item.id===cashAccountId||["BANK","UPI","PROVIDER_WALLET"].includes(item.accountType)));

  async function loadConfig(){
    try{
      const [accountRows,serviceRows,transferRows]=await Promise.all([
        apiFetch<Account[]>("/dashboard/accounts"),
        apiFetch<ServiceConfig[]>("/settings/services"),
        apiFetch<TransferType[]>("/settings/cash-in-transfer-types"),
      ]);
      setAccounts(accountRows);setServices(serviceRows);setTransferTypes(transferRows);setConfigError("");
    }catch(error){setConfigError(error instanceof Error?error.message:"Could not load detailed options. Fast entry still works.");}
  }
  function openRush(){
    if(disabled||!cashAccountId)return;
    const initial=Array.from({length:7},()=>emptyRow(lastDirection.current));
    amountRefs.current={};setRows(initial);setSavedSinceRefresh(false);setSavingAll(false);setOpen(true);
    void loadConfig();
    window.setTimeout(()=>amountRefs.current[initial[0].key]?.focus(),60);
  }
  async function closeRush(){
    const unsaved=rows.some((row)=>row.status!=="SAVED"&&hasDraft(row));
    if(unsaved&&!window.confirm("Discard unsaved rush-entry rows? Saved rows are already recorded."))return;
    setOpen(false);
    if(savedSinceRefresh)await onSaved?.();
  }
  function updateRow(key:string,patch:Partial<RushRow>){
    setRows((current)=>current.map((row)=>row.key===key&&row.status!=="SAVED"?{...row,...patch,status:"READY",message:undefined}:row));
  }
  function updateAmount(key:string,value:string){
    const clean=value.replace(/[^0-9.]/g,"");
    setRows((current)=>current.map((row)=>{
      if(row.key!==key||row.status==="SAVED")return row;
      const type=activeTransferTypes.find((item)=>item.id===row.transferTypeId);
      const commission=row.direction==="IN"&&row.purpose==="TRANSFER"&&type&&!row.commissionOverridden?transferFee(clean,type):row.commission;
      return {...row,amount:clean,commission,status:"READY",message:undefined};
    }));
  }
  function setDirection(key:string,direction:Direction){
    setRows((current)=>current.map((row)=>row.key===key&&row.status!=="SAVED"?{...emptyRow(direction),key:row.key,expanded:row.expanded}:row));
  }
  function toggleExpanded(key:string){
    setRows((current)=>current.map((row)=>row.key===key?{...row,expanded:!row.expanded}:row.expanded?{...row,expanded:false}:row));
  }
  function setTransferType(key:string,id:string){
    const type=activeTransferTypes.find((item)=>item.id===id);
    setRows((current)=>current.map((row)=>{
      if(row.key!==key||row.status==="SAVED")return row;
      return {...row,purpose:"TRANSFER",transferTypeId:id,beneficiaryMode:type?.transferMode??"UPI",
        commission:type?transferFee(row.amount,type):row.commission,commissionOverridden:false,status:"READY",message:undefined};
    }));
  }
  function setGridMode(row:RushRow,value:string){
    if(row.direction==="OUT"){
      updateRow(row.key,{cashOutType:value as CashOutType,expanded:value!=="UPI_QR"?true:row.expanded,successful:true,
        commissionMode:value==="MICRO_ATM"?"UPI":"CASH",commissionCash:""});
      return;
    }
    if(value==="SERVICE"){updateRow(row.key,{purpose:"SERVICE",expanded:true,commission:"",commissionCash:"",commissionOverridden:false});return;}
    if(value==="QUICK"){updateRow(row.key,{purpose:"TRANSFER",transferTypeId:"",beneficiaryMode:"UPI",commissionOverridden:true});return;}
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
  function addRow(direction:Direction=lastDirection.current){
    const row=emptyRow(direction);setRows((current)=>[...current,row]);
    requestAnimationFrame(()=>amountRefs.current[row.key]?.focus());
  }
  function removeRow(key:string){setRows((current)=>current.length<=1?current:current.filter((row)=>row.key!==key));}
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
        if(focusNext){if(!next[index+1])next.push(emptyRow(row.direction));nextKey=next[index+1].key;}
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
  const savedRows=rows.filter((row)=>row.status==="SAVED"),enteredRows=rows.filter(hasDraft);
  const readyTotal=enteredRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const unsavedCount=rows.filter((row)=>row.status!=="SAVED"&&hasDraft(row)).length;

  return <>
    <button type="button" onClick={openRush} disabled={disabled||!cashAccountId}
      className="flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900 px-3 text-[12px] font-black text-white shadow-[0_6px_18px_rgba(15,23,42,.22)] transition hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40">
      <span className="text-sm">▦</span><span>Rush / Bulk</span>
    </button>
    {open&&typeof document!=="undefined"?createPortal(
      <div className="fixed inset-0 z-[105] flex flex-col bg-black/45 p-0 sm:p-3" role="dialog" aria-modal="true" aria-label="Rush cash entry">
        <div className="m-auto flex max-h-[97dvh] w-full max-w-[1480px] flex-col overflow-hidden rounded-none bg-[var(--surface)] shadow-2xl sm:rounded-[26px]">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black tracking-[-.035em]">Rush Cash Entry 2.0</h2>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">Counter grid mode</span></div>
              <p className="mt-1 text-[12px] font-semibold text-[var(--text-muted)]">Type fast like Excel. Expand only the row that needs the full Cash In / Cash Out options.</p>
            </div>
            <div className="hidden shrink-0 items-center gap-5 xl:flex">
              <div className="text-[11px]"><strong className="block">⚡ 1. Type fast</strong><span className="text-[var(--text-muted)]">Tab / Enter across rows</span></div>
              <div className="text-[11px]"><strong className="block">☷ 2. Expand when needed</strong><span className="text-[var(--text-muted)]">Full options inline</span></div>
              <div className="text-[11px]"><strong className="block">✓ 3. Save together</strong><span className="text-[var(--text-muted)]">One counter workspace</span></div>
            </div>
            <button type="button" onClick={()=>void closeRush()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-xl font-bold text-[var(--text-muted)]" aria-label="Close rush entry">×</button>
          </header>
          {configError?<div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-[11px] font-bold text-amber-800">{configError}</div>:null}
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-[var(--text-muted)]">
              <span><strong className="text-[var(--text)]">Enter</strong> saves row</span><span><strong className="text-[var(--text)]">Tab</strong> moves across</span>
              <span><strong className="text-[var(--text)]">↑ / ↓</strong> amount cells</span><span><strong className="text-[var(--text)]">Ctrl/⌘ + Enter</strong> saves all</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto" onKeyDown={(event)=>{if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();void saveAll();}}}>
            <div className="min-w-[1160px]">
              <div className="sticky top-0 z-20 grid grid-cols-[44px_128px_170px_130px_105px_minmax(170px,1fr)_150px_135px_138px] gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-[9px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">
                <span>#</span><span>Type</span><span>Mode</span><span>Amount</span><span>Fee</span><span>Customer</span><span>Mobile</span><span>Status</span><span>Actions</span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {rows.map((row,index)=>{
                  const modeValue=row.direction==="OUT"?row.cashOutType:row.purpose==="SERVICE"?"SERVICE":row.transferTypeId?"TR:"+row.transferTypeId:"QUICK";
                  const selectedService=activeServices.find((item)=>item.name.toLowerCase()===row.serviceName.trim().toLowerCase());
                  const due=cashDue(row),given=row.cashReceived.trim()?Number(row.cashReceived):due,change=Math.max(0,given-due);
                  return <div key={row.key} className={row.expanded?"bg-violet-50/25":row.status==="SAVED"?"bg-emerald-50/35":""}>
                    <div className="grid grid-cols-[44px_128px_170px_130px_105px_minmax(170px,1fr)_150px_135px_138px] items-center gap-2 px-3 py-2">
                      <span className="text-center text-xs font-black text-[var(--text-muted)]">{index+1}</span>
                      <select value={row.direction} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>setDirection(row.key,event.target.value as Direction)}
                        className={"h-10 rounded-xl border px-2 text-sm font-black outline-none "+(row.direction==="IN"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-rose-200 bg-rose-50 text-rose-700")}>
                        <option value="IN">↓ Cash In</option><option value="OUT">↑ Cash Out</option>
                      </select>
                      <select value={modeValue} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>setGridMode(row,event.target.value)}
                        className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-black outline-none focus:border-[var(--accent)]">
                        {row.direction==="IN"?<><option value="QUICK">Quick transfer</option>{activeTransferTypes.map((item)=><option key={item.id} value={"TR:"+item.id}>{item.name}</option>)}<option value="SERVICE">Service</option></>:<>
                          <option value="UPI_QR">UPI / QR</option><option value="AEPS">AEPS</option><option value="MICRO_ATM">Micro ATM</option></>}
                      </select>
                      <div className="flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 focus-within:border-[var(--accent)]">
                        <span className="mr-1 font-black">₹</span><input ref={(element)=>{amountRefs.current[row.key]=element;}} inputMode="decimal" value={row.amount}
                          disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>updateAmount(row.key,event.target.value)}
                          onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}else if(event.key==="ArrowDown"){event.preventDefault();focusRelative(row.key,1);}else if(event.key==="ArrowUp"){event.preventDefault();focusRelative(row.key,-1);}}}
                          className="min-w-0 flex-1 bg-transparent text-right text-[15px] font-black tabular-nums outline-none disabled:opacity-60" placeholder="0"/></div>
                      <div className="flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 focus-within:border-[var(--accent)]">
                        <span className="mr-1 text-xs font-black text-[var(--text-muted)]">₹</span><input inputMode="decimal" value={row.commission} disabled={row.status==="SAVED"||row.status==="SAVING"||row.purpose==="SERVICE"}
                          onChange={(event)=>updateRow(row.key,{commission:event.target.value.replace(/[^0-9.]/g,""),commissionOverridden:true})}
                          onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}}
                          className="min-w-0 flex-1 bg-transparent text-right text-sm font-black tabular-nums outline-none disabled:opacity-50" placeholder="0"/></div>
                      <input value={row.customerName} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>updateRow(row.key,{customerName:event.target.value.toUpperCase()})}
                        onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}}
                        className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold uppercase outline-none focus:border-[var(--accent)] disabled:opacity-60" placeholder="Optional name"/>
                      <input type="tel" inputMode="tel" value={row.mobileNumber} disabled={row.status==="SAVED"||row.status==="SAVING"} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value})}
                        onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}}
                        className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)] disabled:opacity-60" placeholder="Optional mobile"/>
                      <div className="min-w-0">{row.status==="SAVED"?<><p className="truncate text-[11px] font-black text-emerald-700">Saved · {row.savedStatus==="COMPLETED"?"Complete":"Pending"}</p><p className="truncate text-[9px] font-semibold text-[var(--text-muted)]">{row.transactionNumber}</p></>:
                        row.status==="SAVING"?<p className="text-[11px] font-black text-violet-700">Saving…</p>:row.status==="ERROR"?<p className="line-clamp-2 text-[10px] font-bold leading-3 text-rose-600">{row.message}</p>:
                        <p className="text-[11px] font-bold text-[var(--text-muted)]">{hasDraft(row)?"Ready":"Ready"}</p>}</div>
                      <div className="flex justify-end gap-1">
                        {row.status==="SAVED"?<button type="button" onClick={()=>void openTransaction(row)} className="min-h-8 rounded-lg bg-emerald-600 px-2 text-[10px] font-black text-white">Open</button>:<>
                          <button type="button" onClick={()=>toggleExpanded(row.key)} className={"grid h-8 w-8 place-items-center rounded-lg text-xs font-black "+(row.expanded?"bg-violet-100 text-violet-700":"bg-[var(--surface-soft)] text-[var(--accent)]")} aria-label="Toggle row details">{row.expanded?"⌃":"⌄"}</button>
                          <button type="button" disabled={row.status==="SAVING"||!hasDraft(row)} onClick={()=>void saveRow(row.key)} className="min-h-8 rounded-lg bg-[var(--accent)] px-2 text-[10px] font-black text-white disabled:opacity-30">Save</button>
                          <button type="button" disabled={row.status==="SAVING"} onClick={()=>removeRow(row.key)} className="grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600" aria-label={"Remove row "+(index+1)}>×</button>
                        </>}
                      </div>
                    </div>

                    {row.expanded&&row.status!=="SAVED"?<div className="mx-3 mb-3 rounded-2xl border border-violet-200 bg-[var(--surface)] p-3 shadow-[0_8px_26px_rgba(76,29,149,.06)]">
                      {row.direction==="IN"?<div className="grid grid-cols-2 rounded-xl bg-[var(--surface-soft)] p-1">
                        <button type="button" onClick={()=>updateRow(row.key,{purpose:"TRANSFER"})} className={"min-h-9 rounded-lg text-xs font-black "+(row.purpose==="TRANSFER"?"bg-[var(--surface)] shadow-sm":"text-[var(--text-muted)]")}>Transfer</button>
                        <button type="button" onClick={()=>updateRow(row.key,{purpose:"SERVICE",commission:"",commissionCash:""})} className={"min-h-9 rounded-lg text-xs font-black "+(row.purpose==="SERVICE"?"bg-[var(--surface)] shadow-sm":"text-[var(--text-muted)]")}>Service</button>
                      </div>:<div className="grid grid-cols-3 rounded-xl bg-[var(--surface-soft)] p-1">
                        {(["UPI_QR","AEPS","MICRO_ATM"] as CashOutType[]).map((kind)=><button key={kind} type="button" onClick={()=>updateRow(row.key,{cashOutType:kind,successful:true,commissionMode:kind==="MICRO_ATM"?"UPI":"CASH",commissionCash:""})} className={"min-h-9 rounded-lg text-xs font-black "+(row.cashOutType===kind?"bg-[var(--surface)] shadow-sm":"text-[var(--text-muted)]")}>{outLabel(kind)}</button>)}
                      </div>}
                      {row.direction==="IN"&&row.purpose==="TRANSFER"?<div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_.8fr_1.05fr]">
                        <section className="rounded-xl bg-[var(--surface-soft)] p-3">
                          <p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Transfer mode</p>
                          <div className="mt-2 flex flex-wrap gap-1.5"><button type="button" onClick={()=>setGridMode(row,"QUICK")} className={"min-h-8 rounded-lg px-2.5 text-[10px] font-black "+(!row.transferTypeId?"bg-slate-900 text-white":"bg-[var(--surface)] text-[var(--text-muted)]")}>Quick pending</button>
                            {activeTransferTypes.map((item)=><button key={item.id} type="button" onClick={()=>setTransferType(row.key,item.id)} className={"min-h-8 rounded-lg px-2.5 text-[10px] font-black "+(row.transferTypeId===item.id?"bg-blue-100 text-blue-700":"bg-[var(--surface)] text-[var(--text-muted)]")}>{item.name}</button>)}</div>
                          <p className="mt-2 text-[10px] font-semibold text-[var(--text-muted)]">Quick pending keeps counter entry minimal. Choose a configured mode when beneficiary details are known now.</p>
                        </section>
                        <section className="rounded-xl bg-[var(--surface-soft)] p-3">
                          <p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Fee paid by</p>
                          <div className="mt-2 grid grid-cols-3 rounded-lg bg-[var(--surface)] p-1">{(["CASH","UPI","SPLIT"] as CommissionMode[]).map((mode)=><button key={mode} type="button" onClick={()=>updateRow(row.key,{commissionMode:mode,commissionCash:mode==="SPLIT"?row.commissionCash:""})} className={"min-h-8 rounded-md text-[10px] font-black "+(row.commissionMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":mode==="UPI"?"Bank / UPI":"Both"}</button>)}</div>
                          {row.commissionMode==="SPLIT"?<label className="mt-2 flex items-center rounded-lg bg-[var(--surface)] px-2 py-1.5 text-xs"><span>Cash part ₹</span><input inputMode="decimal" value={row.commissionCash} onChange={(event)=>updateRow(row.key,{commissionCash:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right font-black outline-none"/></label>:null}
                        </section>
                        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                          <div className="grid grid-cols-3 gap-2 text-center"><div><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Transfer</span><strong className="money mt-1 block text-sm">{money(Number(row.amount||0))}</strong></div>
                            <div><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">+ Cash fee</span><strong className="money mt-1 block text-sm">{money(cashCommission(row))}</strong></div>
                            <div><span className="block text-[9px] font-black uppercase text-emerald-700">Total</span><strong className="money mt-1 block text-lg text-emerald-700">{money(due)}</strong></div></div>
                          <div className="mt-2 grid grid-cols-[1fr_150px] gap-2"><label className="rounded-lg bg-white px-2.5 py-2"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Cash given by customer</span><div className="mt-1 flex items-center gap-1"><span className="font-black">₹</span><input inputMode="decimal" value={row.cashReceived} onChange={(event)=>updateRow(row.key,{cashReceived:event.target.value.replace(/[^0-9.]/g,"")})} placeholder={String(due||0)} className="min-w-0 flex-1 bg-transparent font-black outline-none"/></div></label>
                            <div className="rounded-lg bg-emerald-100 px-2.5 py-2"><span className="block text-[9px] font-black uppercase text-emerald-700">Give back</span><strong className="money mt-1 block text-lg text-emerald-700">{money(change)}</strong></div></div>
                        </section>
                      </div>:null}

                      {row.direction==="IN"&&row.purpose==="TRANSFER"&&row.transferTypeId?<section className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3">
                        <div className="flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Beneficiary details</p><span className="text-[10px] font-bold text-[var(--text-muted)]">{row.beneficiaryMode==="BANK"?"Bank transfer":"UPI / GPay"}</span></div>
                        {row.beneficiaryMode==="UPI"?<input value={row.beneficiaryUpi} onChange={(event)=>updateRow(row.key,{beneficiaryUpi:event.target.value})} className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none" placeholder="UPI ID / mobile"/>:
                        <div className="mt-2 grid grid-cols-3 gap-2"><input value={row.bankAccountHolder} onChange={(event)=>updateRow(row.key,{bankAccountHolder:event.target.value})} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none" placeholder="Account holder"/>
                          <input value={row.bankAccountNumber} onChange={(event)=>updateRow(row.key,{bankAccountNumber:event.target.value.replace(/\s/g,"")})} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold outline-none" placeholder="Account number"/>
                          <input value={row.bankIfsc} onChange={(event)=>updateRow(row.key,{bankIfsc:event.target.value.toUpperCase().replace(/\s/g,"")})} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold uppercase outline-none" placeholder="IFSC"/></div>}
                      </section>:null}

                      {row.direction==="IN"&&row.purpose==="SERVICE"?<section className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3">
                        <div className="grid gap-3 xl:grid-cols-[1.1fr_.8fr_1.1fr]">
                          <div><p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Service</p>
                            <input list={"rush-service-"+row.key} value={row.serviceName} onChange={(event)=>selectService(row,event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black outline-none" placeholder="Choose / type service"/>
                            <datalist id={"rush-service-"+row.key}>{activeServices.map((item)=><option key={item.id} value={item.name}/>)}</datalist>
                            <div className="mt-2 flex flex-wrap gap-1">{activeServices.slice(0,5).map((item)=><button type="button" key={item.id} onClick={()=>selectService(row,item.name)} className="rounded-full bg-[var(--surface)] px-2 py-1 text-[9px] font-black text-[var(--text-muted)]">{item.name}</button>)}</div>
                          </div>
                          <div><p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Customer paid by</p><div className="mt-1.5 grid grid-cols-2 rounded-xl bg-[var(--surface)] p-1">
                            {(["CASH","UPI"] as const).map((mode)=><button type="button" key={mode} onClick={()=>updateRow(row.key,{servicePaymentMode:mode,servicePaymentAccountId:mode==="CASH"?"":row.servicePaymentAccountId})} className={"min-h-9 rounded-lg text-[10px] font-black "+(row.servicePaymentMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":"Bank / UPI"}</button>)}</div>
                            {row.servicePaymentMode==="UPI"?<select value={row.servicePaymentAccountId} onChange={(event)=>updateRow(row.key,{servicePaymentAccountId:event.target.value})} className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-bold"><option value="">Received in…</option>{servicePaymentAccounts.map((item)=><option key={item.id} value={item.id}>{item.accountName}</option>)}</select>:null}
                          </div>
                          <div><p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Fulfilled by</p><div className="mt-1.5 grid grid-cols-2 rounded-xl bg-[var(--surface)] p-1">
                            <button type="button" onClick={()=>updateRow(row.key,{serviceFulfillmentMode:"INTERNAL"})} className={"min-h-9 rounded-lg text-[10px] font-black "+(row.serviceFulfillmentMode==="INTERNAL"?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>✓ Done by us</button>
                            <button type="button" disabled={Boolean(selectedService&&!selectedService.allowPartnerFulfillment)} onClick={()=>updateRow(row.key,{serviceFulfillmentMode:"PARTNER",servicePartnerName:row.servicePartnerName||selectedService?.defaultPartnerName||"",servicePartnerCharge:row.servicePartnerCharge||(selectedService?.defaultPartnerCharge!==null&&selectedService?.defaultPartnerCharge!==undefined?String(Number(selectedService.defaultPartnerCharge)):""),servicePartnerPaymentAccountId:row.servicePartnerPaymentAccountId||cashAccountId})} className={"min-h-9 rounded-lg text-[10px] font-black disabled:opacity-30 "+(row.serviceFulfillmentMode==="PARTNER"?"bg-violet-50 text-violet-700":"text-[var(--text-muted)]")}>Partner</button></div>
                          </div>
                        </div>
                        {row.serviceFulfillmentMode==="PARTNER"?<div className="mt-3 grid gap-2 lg:grid-cols-[1fr_150px_190px_1fr]">
                          <input value={row.servicePartnerName} onChange={(event)=>updateRow(row.key,{servicePartnerName:event.target.value})} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold" placeholder="Partner / company"/>
                          <div className="flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2"><span className="font-black">₹</span><input inputMode="decimal" value={row.servicePartnerCharge} onChange={(event)=>updateRow(row.key,{servicePartnerCharge:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right text-sm font-black outline-none" placeholder="Partner cost"/></div>
                          <div className="grid grid-cols-2 rounded-xl bg-[var(--surface)] p-1"><button type="button" onClick={()=>updateRow(row.key,{servicePartnerPaymentTiming:"PAID_NOW",servicePartnerPaymentAccountId:row.servicePartnerPaymentAccountId||cashAccountId})} className={"rounded-lg text-[9px] font-black "+(row.servicePartnerPaymentTiming==="PAID_NOW"?"bg-blue-50 text-blue-700":"text-[var(--text-muted)]")}>Paid now</button><button type="button" onClick={()=>updateRow(row.key,{servicePartnerPaymentTiming:"PAY_LATER"})} className={"rounded-lg text-[9px] font-black "+(row.servicePartnerPaymentTiming==="PAY_LATER"?"bg-amber-50 text-amber-700":"text-[var(--text-muted)]")}>Pay later</button></div>
                          {row.servicePartnerPaymentTiming==="PAID_NOW"?<select value={row.servicePartnerPaymentAccountId} onChange={(event)=>updateRow(row.key,{servicePartnerPaymentAccountId:event.target.value})} className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-bold"><option value="">Paid from…</option>{partnerPaymentAccounts.map((item)=><option key={item.id} value={item.id}>{item.accountName}</option>)}</select>:<div className="flex h-10 items-center rounded-xl bg-amber-50 px-3 text-[10px] font-bold text-amber-800">Creates partner payable</div>}
                        </div>:null}
                        {row.serviceFulfillmentMode==="PARTNER"?<div className="mt-2 flex justify-end gap-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs"><span>Customer <strong>{money(Number(row.amount||0))}</strong></span><span>− Partner <strong>{money(Number(row.servicePartnerCharge||0))}</strong></span><span>= Our earning <strong className="text-emerald-700">{money(Number(row.amount||0)-Number(row.servicePartnerCharge||0))}</strong></span></div>:null}
                      </section>:null}

                      {row.direction==="OUT"&&row.cashOutType!=="UPI_QR"?<section className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3">
                        <div className="grid gap-3 lg:grid-cols-[220px_1fr]"><div><p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Attempt status</p><div className="mt-1.5 grid grid-cols-2 rounded-xl bg-[var(--surface)] p-1">
                          <button type="button" onClick={()=>updateRow(row.key,{successful:true})} className={"min-h-9 rounded-lg text-[10px] font-black "+(row.successful?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>Successful</button>
                          <button type="button" onClick={()=>updateRow(row.key,{successful:false,commission:"",commissionCash:""})} className={"min-h-9 rounded-lg text-[10px] font-black "+(!row.successful?"bg-rose-50 text-rose-700":"text-[var(--text-muted)]")}>Failed</button></div></div>
                          {row.cashOutType==="AEPS"?<label><span className="text-[9px] font-black uppercase text-[var(--text-muted)]">Aadhaar last 4 *</span><input inputMode="numeric" maxLength={4} value={row.aadhaarLastFour} onChange={(event)=>updateRow(row.key,{aadhaarLastFour:event.target.value.replace(/\D/g,"").slice(0,4)})} className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black tracking-widest" placeholder="1234"/></label>:
                          <div className="grid grid-cols-2 gap-2"><label><span className="text-[9px] font-black uppercase text-[var(--text-muted)]">Card last 4 *</span><input inputMode="numeric" maxLength={4} value={row.cardLastFour} onChange={(event)=>updateRow(row.key,{cardLastFour:event.target.value.replace(/\D/g,"").slice(0,4)})} className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black tracking-widest" placeholder="1234"/></label>
                            <label><span className="text-[9px] font-black uppercase text-[var(--text-muted)]">Customer bank</span><input value={row.customerBankName} onChange={(event)=>updateRow(row.key,{customerBankName:event.target.value})} className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold" placeholder="Bank name"/></label></div>}
                        </div>
                      </section>:null}

                      {row.direction==="OUT"&&row.commission&&Number(row.commission)>0&&row.successful?<section className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3">
                        <div className="flex items-center justify-between gap-3"><p className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Commission received in</p>{row.cashOutType==="MICRO_ATM"?<span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">Bank / UPI</span>:null}</div>
                        {row.cashOutType==="MICRO_ATM"?<p className="mt-2 text-[10px] font-semibold text-[var(--text-muted)]">Micro ATM commission is treated as digital. Settlement account can be completed later from Pending.</p>:<>
                          <div className="mt-2 grid grid-cols-3 rounded-xl bg-[var(--surface)] p-1">{(["CASH","UPI","SPLIT"] as CommissionMode[]).map((mode)=><button key={mode} type="button" onClick={()=>updateRow(row.key,{commissionMode:mode,commissionCash:mode==="SPLIT"?row.commissionCash:""})} className={"min-h-9 rounded-lg text-[10px] font-black "+(row.commissionMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":mode==="UPI"?"Bank / UPI":"Split"}</button>)}</div>
                          {row.commissionMode==="SPLIT"?<div className="mt-2 grid grid-cols-2 gap-2"><label className="rounded-xl bg-[var(--surface)] px-3 py-2"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Cash part</span><div className="mt-1 flex items-center gap-1"><span className="font-black">₹</span><input inputMode="decimal" value={row.commissionCash} onChange={(event)=>updateRow(row.key,{commissionCash:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-sm font-black outline-none" placeholder="0"/></div></label><div className="rounded-xl bg-blue-50 px-3 py-2"><span className="block text-[9px] font-black uppercase text-blue-700">Bank / UPI part</span><strong className="money mt-1 block text-sm text-blue-700">{money(Math.max(0,Number(row.commission||0)-Number(row.commissionCash||0)))}</strong></div></div>:null}
                        </>}
                      </section>:null}

                      <section className="mt-3 grid gap-2 md:grid-cols-[1fr_180px_1.2fr]">
                        <label className="rounded-xl bg-[var(--surface-soft)] px-3 py-2"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Customer</span><input value={row.customerName} onChange={(event)=>updateRow(row.key,{customerName:event.target.value.toUpperCase()})} className="mt-1 w-full bg-transparent text-sm font-black uppercase outline-none" placeholder="Optional name"/></label>
                        <label className="rounded-xl bg-[var(--surface-soft)] px-3 py-2"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Mobile</span><input type="tel" value={row.mobileNumber} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value})} className="mt-1 w-full bg-transparent text-sm font-black outline-none" placeholder="Optional"/></label>
                        <label className="rounded-xl bg-[var(--surface-soft)] px-3 py-2"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Note</span><input value={row.remarks} onChange={(event)=>updateRow(row.key,{remarks:event.target.value})} className="mt-1 w-full bg-transparent text-sm font-bold outline-none" placeholder="Reference / note"/></label>
                      </section>
                      {row.direction==="OUT"?<div className="mt-2 flex justify-end"><label className="flex items-center gap-2 text-[10px] font-bold text-[var(--text-muted)]"><span>Date & time (optional)</span><input type="datetime-local" value={row.transactionAt} onChange={(event)=>updateRow(row.key,{transactionAt:event.target.value})} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-bold"/></label></div>:null}
                      {row.status==="ERROR"&&row.message?<p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">{row.message}</p>:null}
                    </div>:null}
                  </div>;
                })}
              </div>
            </div>
          </div>

          <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={()=>addRow()} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-xs font-black">+ Add row</button>
              <button type="button" onClick={()=>addRow("IN")} className="min-h-10 rounded-xl bg-emerald-50 px-3 text-xs font-black text-emerald-700">+ Cash In row</button>
              <button type="button" onClick={()=>addRow("OUT")} className="min-h-10 rounded-xl bg-rose-50 px-3 text-xs font-black text-rose-700">+ Cash Out row</button></div>
              <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-[10px] font-black uppercase tracking-wide text-[var(--text-muted)]">{enteredRows.length} rows entered · {savedRows.length} saved · {unsavedCount} unsaved</p><p className="money mt-0.5 text-sm font-black">{money(readyTotal)} total</p></div>
                <button type="button" onClick={()=>void saveAll()} disabled={savingAll||enteredRows.every((row)=>row.status==="SAVED")} className="min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-black text-white shadow-sm disabled:opacity-35">{savingAll?"Saving rows…":"Save all filled rows"}</button></div>
            </div>
          </footer>
        </div>
      </div>,document.body):null}
  </>;
}
