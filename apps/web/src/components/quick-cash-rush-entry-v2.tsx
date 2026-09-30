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
type CustomerSuggestion={id:string;customerCode:string;fullName:string;mobile:string|null;savedDestinationCount?:number;savedServiceProfileCount?:number;lastUsedAt?:string|null};
type QuickEntryDestination={key:string;source:"SAVED"|"RECENT";mode:BeneficiaryMode;title:string;subtitle:string;upi?:string;accountHolder?:string;accountNumber?:string;ifsc?:string;lastUsedAt?:string|null;useCount:number;isLastUsed?:boolean};
type QuickServiceReference={id?:string;key?:string;serviceName:string;nickname?:string|null;providerName?:string|null;referenceNumber:string;lastUsedAt?:string|null;useCount?:number};
type QuickEntryCustomerProfile={customer:{id:string;customerCode:string;fullName:string;mobile:string|null};savedDestinations:QuickEntryDestination[];recentDestinations:QuickEntryDestination[];serviceProfiles:QuickServiceReference[];recentServiceReferences:QuickServiceReference[]};

type RushRow={
  key:string;direction:Direction;purpose:Purpose;amount:string;customerId:string;customerLookup:string;customerSuggestions:CustomerSuggestion[];customerSuggestionIndex:number;customerSearchLoading:boolean;customerProfile:QuickEntryCustomerProfile|null;customerProfileLoading:boolean;selectedDestinationKey:string;destinationHighlightKey:string;customerName:string;mobileNumber:string;newCustomerOpen:boolean;newCustomerName:string;newCustomerMobile:string;newCustomerType:"REGULAR"|"WALK_IN";newCustomerNotes:string;newCustomerSaving:boolean;newCustomerError?:string;commission:string;commissionOverridden:boolean;
  commissionMode:CommissionMode;commissionCash:string;cashReceived:string;cashReceivedOverridden:boolean;transferTypeId:string;beneficiaryMode:BeneficiaryMode;beneficiaryUpi:string;
  bankAccountHolder:string;bankAccountNumber:string;bankIfsc:string;cashOutType:CashOutType;successful:boolean;aadhaarLastFour:string;
  customerBankName:string;cardLastFour:string;serviceName:string;serviceProfileId:string;serviceReferenceLabel:string;serviceProviderName:string;serviceReferenceNumber:string;rememberServiceReference:boolean;servicePaymentMode:"CASH"|"UPI";servicePaymentAccountId:string;
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
    key:newKey(),direction,purpose:"TRANSFER",amount:"",customerId:"",customerLookup:"",customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:false,customerProfile:null,customerProfileLoading:false,selectedDestinationKey:"",destinationHighlightKey:"",customerName:"",mobileNumber:"",newCustomerOpen:false,newCustomerName:"",newCustomerMobile:"",newCustomerType:"REGULAR",newCustomerNotes:"",newCustomerSaving:false,commission:"",commissionOverridden:false,
    commissionMode:"CASH",commissionCash:"",cashReceived:"",cashReceivedOverridden:false,transferTypeId:"",beneficiaryMode:"UPI",beneficiaryUpi:"",
    bankAccountHolder:"",bankAccountNumber:"",bankIfsc:"",cashOutType:"UPI_QR",successful:true,aadhaarLastFour:"",
    customerBankName:"",cardLastFour:"",serviceName:"",serviceProfileId:"",serviceReferenceLabel:"",serviceProviderName:"",serviceReferenceNumber:"",rememberServiceReference:true,servicePaymentMode:"CASH",servicePaymentAccountId:"",
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
function destinationPatch(option:QuickEntryDestination):Partial<RushRow>{
  return option.mode==="UPI"
    ? {beneficiaryMode:"UPI",beneficiaryUpi:option.upi||"",bankAccountHolder:"",bankAccountNumber:"",bankIfsc:"",selectedDestinationKey:option.key,destinationHighlightKey:option.key}
    : {beneficiaryMode:"BANK",beneficiaryUpi:"",bankAccountHolder:option.accountHolder||"",bankAccountNumber:option.accountNumber||"",bankIfsc:option.ifsc||"",selectedDestinationKey:option.key,destinationHighlightKey:option.key};
}
function compatibleDestinations(profile:QuickEntryCustomerProfile|null,mode:BeneficiaryMode){
  if(!profile)return [] as QuickEntryDestination[];
  return [...profile.savedDestinations,...profile.recentDestinations].filter((item)=>item.mode===mode).sort((a,b)=>Number(Boolean(b.isLastUsed))-Number(Boolean(a.isLastUsed))||Number(b.source==="SAVED")-Number(a.source==="SAVED")||String(b.lastUsedAt||"").localeCompare(String(a.lastUsedAt||"")));
}
function serviceReferencePatch(option:QuickServiceReference):Partial<RushRow>{
  return {serviceProfileId:option.id||"",serviceReferenceLabel:option.nickname||"",serviceProviderName:option.providerName||"",serviceReferenceNumber:option.referenceNumber,rememberServiceReference:Boolean(option.id)};
}
function usedLabel(value?:string|null){
  if(!value)return "";
  const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
  return date.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
}
function transferFee(amountValue:string,type?:TransferType){
  const amount=Number(amountValue);
  if(!type||!amountValue.trim()||!Number.isFinite(amount)||amount<=0)return "";
  if(amount<=500)return "10";
  return String(Math.round((amount*Number(type.defaultCommissionRate||0)/100)*100)/100);
}
function rowError(row:RushRow,services:ServiceConfig[]){
  if(row.newCustomerOpen)return "Create or cancel the new customer details first.";
  const amount=Number(row.amount),fee=Number(row.commission||0);
  if(!row.amount.trim()||!Number.isFinite(amount)||amount<=0)return "Enter an amount greater than 0.";
  if(row.purpose==="TRANSFER"&&(!Number.isFinite(fee)||fee<0))return "Fee / commission cannot be negative.";
  if(row.purpose==="TRANSFER"&&row.commissionMode==="SPLIT"){
    const cashPart=Number(row.commissionCash||0);
    if(!Number.isFinite(cashPart)||cashPart<=0||cashPart>=fee)return "Split fee cash part must be greater than 0 and less than the total fee.";
  }
  if(row.direction==="IN"&&row.purpose==="TRANSFER"&&!row.transferTypeId)return "Choose a Cash In mode.";
  if(row.direction==="IN"&&row.purpose==="TRANSFER"&&row.cashReceivedOverridden&&Number(row.cashReceived||0)<cashDue(row))return "Cash received is less than amount + cash fee.";
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
  const [activeRowKey,setActiveRowKey]=useState("");
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [services,setServices]=useState<ServiceConfig[]>([]);
  const [transferTypes,setTransferTypes]=useState<TransferType[]>([]);
  const [configError,setConfigError]=useState("");
  const [savingAll,setSavingAll]=useState(false);
  const [savedSinceRefresh,setSavedSinceRefresh]=useState(false);
  const modeRefs=useRef<Record<string,HTMLSelectElement|null>>({});
  const amountRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const customerRefs=useRef<Record<string,HTMLInputElement|null>>({});
  const detailRefs=useRef<Record<string,HTMLElement|null>>({});
  const newCustomerRefs=useRef<Record<string,HTMLInputElement|null>>({});
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
    setSavingAll(false);setOpen(true);setMinimized(false);modeRefs.current={};amountRefs.current={};customerRefs.current={};
    const transferRows=await loadConfig();
    if(rows.length){
      window.setTimeout(()=>{
        const firstEditable=rows.find((row)=>row.status!=="SAVED");
        if(firstEditable){setActiveRowKey(firstEditable.key);modeRefs.current[firstEditable.key]?.focus();}
      },60);
      return;
    }
    const defaultType=transferRows.find((item)=>item.isActive!==false);
    const initial=Array.from({length:10},()=>readyRow(lastDirection.current,defaultType));
    setRows(initial);setActiveRowKey(initial[0].key);
    window.setTimeout(()=>modeRefs.current[initial[0].key]?.focus(),60);
  }
  async function closeRush(){
    setOpen(false);setMinimized(false);setMaximized(false);
    if(savedSinceRefresh){await onSaved?.();setSavedSinceRefresh(false);}
  }
  function minimizeRush(){setMinimized(true);setRowFilter("ACTIVE");}
  function restoreRush(){setMinimized(false);setOpen(true);}
  function rowNeedsDetails(row:RushRow){return row.direction==="IN"||(row.direction==="OUT"&&row.cashOutType!=="UPI_QR");}
  function activateRow(key:string,focus:"mode"|"amount"="mode"){
    const row=rows.find((item)=>item.key===key);if(!row||row.status==="SAVED")return;
    setActiveRowKey(key);
    setRows((current)=>current.map((item)=>item.key===key?item:item.expanded?{...item,expanded:false,newCustomerOpen:false}:item));
    window.setTimeout(()=>focus==="amount"?amountRefs.current[key]?.focus():modeRefs.current[key]?.focus(),20);
  }
  function expandForEntry(key:string,focusDetail=false){
    setActiveRowKey(key);
    setRows((current)=>current.map((row)=>row.key===key&&row.status!=="SAVED"?{...row,expanded:true}:row.expanded?{...row,expanded:false}:row));
    if(focusDetail)window.setTimeout(()=>detailRefs.current[key]?.focus(),30);
  }
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
    setActiveRowKey(key);
    const defaultType=activeTransferTypes[0];
    setRows((current)=>keepTrailingBlank(current.map((row)=>{
      if(row.key!==key||row.status==="SAVED")return row;
      const next={...emptyRow(direction),key:row.key,expanded:false};
      if(direction==="IN"&&defaultType){next.transferTypeId=defaultType.id;next.beneficiaryMode=defaultType.transferMode;}
      return next;
    })));
  }
  function toggleExpanded(key:string){
    setActiveRowKey(key);
    setRows((current)=>current.map((row)=>row.key===key?{...row,expanded:!row.expanded}:row.expanded?{...row,expanded:false}:row));
  }
  function setTransferType(key:string,id:string){
    const type=activeTransferTypes.find((item)=>item.id===id);
    setRows((current)=>keepTrailingBlank(current.map((row)=>{
      if(row.key===key&&row.status!=="SAVED"){
        const mode=type?.transferMode??"UPI";
        const options=compatibleDestinations(row.customerProfile,mode);
        const blank=mode==="UPI"?{beneficiaryMode:"UPI" as BeneficiaryMode,beneficiaryUpi:"",bankAccountHolder:"",bankAccountNumber:"",bankIfsc:"",selectedDestinationKey:"",destinationHighlightKey:""}:{beneficiaryMode:"BANK" as BeneficiaryMode,beneficiaryUpi:"",bankAccountHolder:"",bankAccountNumber:"",bankIfsc:"",selectedDestinationKey:"",destinationHighlightKey:""};
        return {...row,purpose:"TRANSFER",transferTypeId:id,...blank,...(options.length===1?destinationPatch(options[0]):{}),expanded:true,
          commission:type?transferFee(row.amount,type):row.commission,commissionOverridden:false,cashReceivedOverridden:false,status:"READY",message:undefined};
      }
      return row.expanded?{...row,expanded:false}:row;
    })));
  }
  function setGridMode(row:RushRow,value:string){
    setActiveRowKey(row.key);
    if(row.direction==="OUT"){
      setRows((current)=>keepTrailingBlank(current.map((item)=>{
        if(item.key===row.key&&item.status!=="SAVED")return {...item,cashOutType:value as CashOutType,expanded:value!=="UPI_QR",successful:true,
          commissionMode:value==="MICRO_ATM"?"UPI":"CASH",commissionCash:"",status:"READY",message:undefined};
        return item.expanded?{...item,expanded:false}:item;
      })));
      return;
    }
    if(value==="SERVICE"){
      setRows((current)=>keepTrailingBlank(current.map((item)=>item.key===row.key&&item.status!=="SAVED"?{...item,purpose:"SERVICE",expanded:true,commission:"",commissionCash:"",commissionOverridden:false,status:"READY",message:undefined}:item.expanded?{...item,expanded:false}:item)));
      return;
    }
    if(value.startsWith("TR:"))setTransferType(row.key,value.slice(3));
  }
  function selectService(row:RushRow,name:string){
    const service=activeServices.find((item)=>item.name.toLowerCase()===name.trim().toLowerCase());
    if(!service){updateRow(row.key,{serviceName:name});return;}
    const references=row.customerProfile?[...row.customerProfile.serviceProfiles,...row.customerProfile.recentServiceReferences].filter((item)=>item.serviceName.trim().toLowerCase()===name.trim().toLowerCase()):[];
    updateRow(row.key,{
      serviceName:name,
      serviceProfileId:"",serviceReferenceLabel:"",serviceProviderName:"",serviceReferenceNumber:"",rememberServiceReference:true,
      ...(references.length===1?serviceReferencePatch(references[0]):{}),
      amount:service.defaultAmount!==null&&service.defaultAmount!==undefined&&Number(service.defaultAmount)>0?String(Number(service.defaultAmount)):row.amount,
      serviceFulfillmentMode:"INTERNAL",servicePartnerName:service.defaultPartnerName??"",
      servicePartnerCharge:service.defaultPartnerCharge!==null&&service.defaultPartnerCharge!==undefined?String(Number(service.defaultPartnerCharge)):"",
      servicePartnerPaymentTiming:"PAID_NOW",servicePartnerPaymentAccountId:cashAccountId,
    });
  }
  function searchCustomer(row:RushRow,value:string){
    setActiveRowKey(row.key);
    const query=value.trim();
    const digits=query.replace(/\D/g,"");
    const looksLikePhone=query.length>0&&/^[+\d\s()-]+$/.test(query);
    updateRow(row.key,{customerLookup:value,customerId:"",customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:query.length>=2,customerProfile:null,customerProfileLoading:false,selectedDestinationKey:"",destinationHighlightKey:"",newCustomerOpen:false,newCustomerSaving:false,newCustomerError:undefined,
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
    setActiveRowKey(key);
    updateRow(key,{customerId:customer.id,customerLookup:customer.fullName+(customer.mobile?" · "+customer.mobile:""),customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:false,customerProfile:null,customerProfileLoading:true,selectedDestinationKey:"",destinationHighlightKey:"",customerName:customer.fullName,mobileNumber:customer.mobile||"",expanded:true,newCustomerOpen:false,newCustomerSaving:false,newCustomerError:undefined});
    apiFetch<QuickEntryCustomerProfile>("/customers/"+customer.id+"/quick-entry-profile").then((profile)=>{
      setRows((current)=>current.map((row)=>{
        if(row.key!==key||row.customerId!==customer.id||row.status==="SAVED")return row;
        const options=compatibleDestinations(profile,row.beneficiaryMode);
        const destination=options.length===1?destinationPatch(options[0]):{destinationHighlightKey:options[0]?.key||""};
        const serviceMatches=[...profile.serviceProfiles,...profile.recentServiceReferences].filter((item)=>item.serviceName.trim().toLowerCase()===row.serviceName.trim().toLowerCase());
        const serviceReference=row.purpose==="SERVICE"&&serviceMatches.length===1?serviceReferencePatch(serviceMatches[0]):{};
        return {...row,customerProfile:profile,customerProfileLoading:false,...destination,...serviceReference};
      }));
      window.setTimeout(()=>detailRefs.current[key]?.focus(),40);
    }).catch(()=>updateRow(key,{customerProfile:null,customerProfileLoading:false}));
  }
  function openNewCustomer(row:RushRow){
    setActiveRowKey(row.key);
    const query=row.customerLookup.trim();
    const digits=query.replace(/\D/g,"");
    const looksLikePhone=query.length>0&&/^[+\d\s()-]+$/.test(query);
    const normalizedMobile=digits.length>10&&digits.startsWith("91")?digits.slice(-10):digits;
    const rowDigits=row.mobileNumber.replace(/\D/g,"");
    const initialMobile=rowDigits.length>10&&rowDigits.startsWith("91")?rowDigits.slice(-10):(rowDigits||normalizedMobile).slice(0,10);
    setRows((current)=>keepTrailingBlank(current.map((item)=>{
      if(item.key===row.key&&item.status!=="SAVED")return {...item,expanded:true,newCustomerOpen:true,newCustomerName:looksLikePhone?"":(item.customerName||query).trim().toUpperCase(),newCustomerMobile:initialMobile,newCustomerType:"REGULAR",newCustomerNotes:"",newCustomerSaving:false,newCustomerError:undefined,customerSuggestions:[],customerSuggestionIndex:-1,customerSearchLoading:false};
      return item.expanded?{...item,expanded:false}:item;
    })));
    window.setTimeout(()=>newCustomerRefs.current[row.key]?.focus(),30);
  }
  async function createNewCustomer(row:RushRow){
    const name=row.newCustomerName.trim().toUpperCase();
    const mobile=row.newCustomerMobile.replace(/\D/g,"");
    if(!name){updateRow(row.key,{newCustomerError:"Enter customer name."});newCustomerRefs.current[row.key]?.focus();return;}
    if(mobile&&!/^[6-9]\d{9}$/.test(mobile)){updateRow(row.key,{newCustomerError:"Mobile must be a valid 10-digit Indian number."});return;}
    markRow(row.key,{newCustomerSaving:true,newCustomerError:undefined});
    try{
      const customer=await apiFetch<CustomerSuggestion>("/customers",{method:"POST",body:JSON.stringify({customerType:row.newCustomerType,fullName:name,mobile:mobile||undefined,notes:row.newCustomerNotes.trim()||undefined})});
      selectExistingCustomer(row.key,customer);
    }catch(error){
      markRow(row.key,{newCustomerSaving:false,newCustomerError:error instanceof Error?error.message:"Could not create customer."});
    }
  }
  function handleDestinationKeyDown(row:RushRow,options:QuickEntryDestination[],event:KeyboardEvent<HTMLInputElement>){
    if(!options.length)return;
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();
      const delta=event.key==="ArrowDown"?1:-1;
      const currentIndex=Math.max(0,options.findIndex((option)=>option.key===row.destinationHighlightKey));
      const nextIndex=(currentIndex+delta+options.length)%options.length;
      updateRow(row.key,{destinationHighlightKey:options[nextIndex].key});
      return;
    }
    if(event.key==="Enter"&&row.destinationHighlightKey){
      const option=options.find((item)=>item.key===row.destinationHighlightKey);
      if(option){event.preventDefault();updateRow(row.key,destinationPatch(option));}
    }
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
      if(row.customerLookup.trim()){openNewCustomer(row);return;}
      if(rowNeedsDetails(row)){expandForEntry(row.key,true);return;}
      void saveRow(row.key);
    }
  }
  function addRow(direction:Direction=lastDirection.current){
    const row=readyRow(direction);
    setRows((current)=>[...current,row]);setActiveRowKey(row.key);
    requestAnimationFrame(()=>modeRefs.current[row.key]?.focus());
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
    if(target&&target.status!=="SAVED"){setActiveRowKey(target.key);amountRefs.current[target.key]?.focus();}
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
          cashReceivedAmount:row.direction==="IN"&&purpose==="TRANSFER"?(row.cashReceivedOverridden?Number(row.cashReceived||0):cashDue(row)):undefined,
          serviceName:purpose==="SERVICE"?row.serviceName.trim():(row.direction==="IN"&&selectedType?selectedType.name:undefined),
          serviceProfileId:purpose==="SERVICE"&&row.serviceProfileId?row.serviceProfileId:undefined,
          serviceReferenceLabel:purpose==="SERVICE"&&row.serviceReferenceLabel.trim()?row.serviceReferenceLabel.trim():undefined,
          serviceProviderName:purpose==="SERVICE"&&row.serviceProviderName.trim()?row.serviceProviderName.trim():undefined,
          serviceReferenceNumber:purpose==="SERVICE"&&row.serviceReferenceNumber.trim()?row.serviceReferenceNumber.trim():undefined,
          rememberServiceReference:purpose==="SERVICE"&&Boolean(row.customerId)&&Boolean(row.serviceReferenceNumber.trim())?row.rememberServiceReference:undefined,
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
      if(focusNext){setActiveRowKey(nextKey);window.setTimeout(()=>modeRefs.current[nextKey]?.focus(),30);}
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
      className="flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/15 bg-white/10 px-3.5 text-[12px] font-black text-white shadow-sm transition hover:bg-white/15 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4">
      <span className="text-sm">▦</span><span>Quick Entry</span>
    </button>
    {open&&minimized&&typeof document!=="undefined"?createPortal(<div className="fixed bottom-[calc(.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[90] flex items-center gap-2 rounded-2xl border border-violet-200 bg-[var(--surface)] px-3 py-2.5 shadow-2xl sm:left-auto sm:right-4 sm:w-[420px] sm:gap-3 sm:px-4 sm:py-3"><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">Quick Entry</p><p className="mt-0.5 truncate text-[11px] font-bold text-[var(--text-muted)]">{savedRows.length} saved · {pendingRows.length} pending · {unsavedCount} unsaved</p></div><button type="button" onClick={restoreRush} className="min-h-9 shrink-0 rounded-lg bg-violet-600 px-3 text-[11px] font-black text-white">Restore</button><button type="button" onClick={()=>void closeRush()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-soft)] font-black text-[var(--text-muted)]">×</button></div>,document.body):null}
    {open&&!minimized&&typeof document!=="undefined"?createPortal(
      <div className="fixed inset-0 z-[105] flex flex-col bg-black/45 p-0 sm:p-3" role="dialog" aria-modal="true" aria-label="Quick cash entry">
        <div className={"rush-pos m-auto flex w-full flex-col overflow-hidden bg-[var(--surface)] shadow-2xl "+(maximized?"h-[100dvh] max-h-[100dvh] max-w-none rounded-none":"max-h-[97dvh] max-w-[1480px] rounded-none sm:rounded-[24px]")}>
          <header className="grid min-h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-white/95 px-3 py-2.5 backdrop-blur sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5"><div><h2 className="truncate text-[19px] font-black tracking-[-.035em] text-slate-950">Quick Entry</h2><p className="mt-0.5 hidden text-[12px] font-semibold text-slate-500 sm:block">Fast counter workspace · one customer at a time</p></div><span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">Counter</span>{pendingTransactionIds.length&&onShowPending?<button type="button" onClick={()=>{setOpen(false);setMinimized(false);onShowPending();}} className="min-h-7 shrink-0 rounded-full bg-amber-100 px-2.5 text-[10px] font-black text-amber-800">⚠ {pendingTransactionIds.length} need completion</button>:null}</div>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">{(["ACTIVE","UNSAVED","PENDING","COMPLETE"] as RowFilter[]).map((filter)=><button key={filter} type="button" onClick={()=>setRowFilter(filter)} className={"min-h-7 rounded-md px-2 text-[10px] font-black "+(rowFilter===filter?"bg-white text-violet-700 shadow-sm":"text-[var(--text-muted)]")}>{filter==="ACTIVE"?"Active":filter==="UNSAVED"?"Unsaved "+unsavedCount:filter==="PENDING"?"Pending "+pendingRows.length:"Complete "+completeRows.length}</button>)}</div>
            <div className="flex items-center justify-end gap-1 sm:border-l sm:border-[var(--border)] sm:pl-2"><button type="button" onClick={minimizeRush} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-sm font-black text-[var(--text-muted)]" aria-label="Minimize">—</button><button type="button" onClick={()=>setMaximized((value)=>!value)} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-xs font-black text-[var(--text-muted)]" aria-label={maximized?"Restore size":"Maximize"}>{maximized?"❐":"□"}</button><button type="button" onClick={()=>void closeRush()} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-lg font-bold text-[var(--text-muted)]" aria-label="Close quick entry">×</button></div>
          </header>
          {configError?<div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-[11px] font-bold text-amber-800">{configError}</div>:null}

          <div className="min-h-0 flex-1 overflow-auto" onKeyDown={(event)=>{if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();void saveAll();}}}>
            <div className="min-w-0 md:min-w-[1160px]">
              <div className="rush-pos-head sticky top-0 z-20 hidden border-b border-[var(--border)] bg-slate-50/95 px-4 py-2.5 text-[11px] font-black uppercase tracking-[.1em] text-slate-500 backdrop-blur md:grid">
                <span>#</span><span>Flow</span><span>Amount <b className="text-rose-500">*</b></span><span>Customer</span><span>Result</span><span className="text-right">Action</span>
              </div>
              {rowFilter==="ACTIVE"&&hiddenCompleteCount>0?<button type="button" onClick={()=>setRowFilter("COMPLETE")} className="flex w-full items-center justify-between border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[11px] font-black text-emerald-800 hover:bg-emerald-100">
                <span>{hiddenCompleteCount} older completed rows hidden from Active</span><span>View Complete →</span>
              </button>:null}
              <div className="divide-y divide-[var(--border)]">
                {visibleRows.map(({row,index})=>{
                  const modeValue=row.direction==="OUT"?row.cashOutType:row.purpose==="SERVICE"?"SERVICE":row.transferTypeId?"TR:"+row.transferTypeId:"";
                  const selectedService=activeServices.find((item)=>item.name.toLowerCase()===row.serviceName.trim().toLowerCase());
                  const destinationOptions=compatibleDestinations(row.customerProfile,row.beneficiaryMode);
                  const serviceReferenceOptions=row.customerProfile?[...row.customerProfile.serviceProfiles,...row.customerProfile.recentServiceReferences].filter((item)=>item.serviceName.trim().toLowerCase()===row.serviceName.trim().toLowerCase()).sort((a,b)=>String(b.lastUsedAt||"").localeCompare(String(a.lastUsedAt||""))):[];
                  const due=cashDue(row),given=row.cashReceivedOverridden?Number(row.cashReceived||0):due,short=Math.max(0,due-given),change=Math.max(0,given-due);
                  const primaryDue=row.direction==="IN"&&row.purpose==="TRANSFER"?due:Number(row.amount||0);
                  const dueWord=row.direction==="OUT"?"payout":row.purpose==="SERVICE"?"charge":"due";
                  const customerValue=row.customerLookup||row.customerName;
                  const isPending=row.status==="SAVED"&&row.savedStatus==="PENDING"&&Boolean(row.transactionId)&&!completedSet.has(row.transactionId!);
                  const isActive=activeRowKey===row.key&&row.status!=="SAVED";
                  const isIdleEditable=row.status!=="SAVED"&&!isActive;
                  return <div key={row.key} className={"rush-pos-row group relative "+(isActive?"rush-pos-row-active":isIdleEditable?"rush-pos-row-idle":row.status==="SAVED"?(isPending?"rush-pos-row-pending":"rush-pos-row-saved"):"")}>
                    {isIdleEditable?<button type="button" tabIndex={-1} onClick={()=>activateRow(row.key)} className="absolute inset-0 z-30 cursor-pointer rounded-[inherit]" aria-label={"Activate row "+(index+1)}/>:null}
                    <div className="rush-pos-main-row items-center px-3 py-2.5 md:px-4">
                      <span className="rush-cell-index text-center text-[12px] font-black text-slate-400">{index+1}</span>
                      <div className="rush-cell-flow grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                        <select value={row.direction} tabIndex={-1} disabled={row.status==="SAVED"||row.status==="SAVING"||isIdleEditable} onChange={(event)=>setDirection(row.key,event.target.value as Direction)}
                          className={"rush-flow-type h-10 rounded-xl border px-2 text-[12px] font-black outline-none "+(row.direction==="IN"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-rose-200 bg-rose-50 text-rose-700")}>
                          <option value="IN">↓ In</option><option value="OUT">↑ Out</option>
                        </select>
                        <select ref={(element)=>{modeRefs.current[row.key]=element;}} value={modeValue} tabIndex={isActive?0:-1} disabled={row.status==="SAVED"||row.status==="SAVING"||isIdleEditable} onFocus={()=>setActiveRowKey(row.key)} onChange={(event)=>setGridMode(row,event.target.value)}
                          className="rush-control h-10 rounded-xl border border-slate-200 bg-white px-3 font-extrabold text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
                          {row.direction==="IN"?<><option value="" disabled>Select mode</option>{activeTransferTypes.map((item)=><option key={item.id} value={"TR:"+item.id}>{item.name}</option>)}<option value="SERVICE">Service</option></>:<>
                            <option value="UPI_QR">UPI / QR</option><option value="AEPS">AEPS</option><option value="MICRO_ATM">Micro ATM</option></>}
                        </select>
                      </div>
                      <div className="rush-cell-amount rush-money-field flex h-11 items-center rounded-xl border border-transparent bg-slate-50 px-3 focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
                        <span className="mr-1.5 text-[15px] font-black text-slate-500">₹</span><input ref={(element)=>{amountRefs.current[row.key]=element;}} inputMode="decimal" value={row.amount} tabIndex={isActive?0:-1}
                          disabled={row.status==="SAVED"||row.status==="SAVING"||isIdleEditable} onFocus={(event)=>{setActiveRowKey(row.key);event.currentTarget.select();if(rowNeedsDetails(row)&&!row.expanded)expandForEntry(row.key);}} onChange={(event)=>updateAmount(row.key,event.target.value)}
                          onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();customerRefs.current[row.key]?.focus();}else if(event.key==="ArrowDown"){event.preventDefault();focusRelative(row.key,1);}else if(event.key==="ArrowUp"){event.preventDefault();focusRelative(row.key,-1);}}}
                          className="min-w-0 flex-1 bg-transparent text-right text-[18px] font-black tabular-nums tracking-[-.02em] text-slate-950 outline-none disabled:opacity-60" placeholder="0"/></div>
                      <div className="rush-cell-result rounded-xl bg-slate-50 px-3 py-1.5">
                        <div className="flex items-baseline justify-between gap-2"><span className="text-[11px] font-bold text-slate-500">Fee</span><label className="flex items-center text-[12px] font-extrabold text-slate-700"><span>₹</span><input inputMode="decimal" tabIndex={-1} value={row.commission} disabled={row.status==="SAVED"||row.status==="SAVING"||row.purpose==="SERVICE"||isIdleEditable} onFocus={(event)=>event.currentTarget.select()} onChange={(event)=>updateRow(row.key,{commission:event.target.value.replace(/[^0-9.]/g,""),commissionOverridden:true,cashReceivedOverridden:false})} className="w-[62px] bg-transparent text-right font-extrabold tabular-nums outline-none disabled:opacity-50" placeholder="0"/></label></div>
                        <div className="mt-0.5 flex items-baseline justify-between gap-2"><span className={"text-[11px] font-black uppercase tracking-[.06em] "+(row.direction==="OUT"?"text-rose-600":"text-emerald-600")}>{dueWord}</span><strong className={"money text-[13px] font-black "+(row.direction==="OUT"?"text-rose-700":"text-emerald-700")}>{money(primaryDue)}</strong></div>
                      </div>
                      <div className="rush-cell-customer relative">
                        <input ref={(element)=>{customerRefs.current[row.key]=element;}} value={customerValue} tabIndex={isActive?0:-1} disabled={row.status==="SAVED"||row.status==="SAVING"||isIdleEditable} onFocus={()=>setActiveRowKey(row.key)} onChange={(event)=>searchCustomer(row,event.target.value)}
                          onKeyDown={(event)=>handleCustomerKeyDown(row,event)}
                          className="rush-control h-11 w-full rounded-xl border border-transparent bg-slate-50 px-3 font-bold text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100 disabled:opacity-60" placeholder="Search name / mobile"/>
                        {!row.newCustomerOpen&&!row.customerId&&row.customerLookup.trim().length>=2?<div className="absolute inset-x-0 top-[calc(100%+4px)] z-40 max-h-44 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
                          {row.customerSearchLoading?<p className="px-2 py-1.5 text-[11px] font-semibold text-[var(--text-muted)]">Searching…</p>:row.customerSuggestions.length?row.customerSuggestions.map((customer,suggestionIndex)=><button key={customer.id} type="button" tabIndex={-1} onMouseEnter={()=>updateRow(row.key,{customerSuggestionIndex:suggestionIndex})} onClick={()=>selectExistingCustomer(row.key,customer)} className={"flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left "+(suggestionIndex===row.customerSuggestionIndex?"bg-violet-50 ring-1 ring-violet-100":"hover:bg-[var(--surface-soft)]")}><span className="min-w-0"><strong className="block truncate text-[12px]">{customer.fullName}</strong><span className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">{customer.mobile||"No mobile"} · {customer.customerCode}</span><span className="mt-1 flex flex-wrap gap-1 text-[9px] font-black">{customer.savedDestinationCount?<b className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{customer.savedDestinationCount} saved</b>:null}{customer.savedServiceProfileCount?<b className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{customer.savedServiceProfileCount} service ref</b>:null}{customer.lastUsedAt?<b className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[var(--text-muted)]">Used {usedLabel(customer.lastUsedAt)}</b>:null}</span></span><span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">Use</span></button>):<button type="button" tabIndex={-1} onClick={()=>openNewCustomer(row)} className="flex w-full items-center justify-between rounded-lg bg-violet-50 px-2.5 py-2 text-left"><span><strong className="block text-[11px] text-violet-800">No existing customer found</strong><span className="mt-0.5 block text-[10px] text-violet-600">Enter or click to add customer details</span></span><span className="rounded-full bg-violet-600 px-2 py-1 text-[10px] font-black text-white">Add</span></button>}
                          {!row.customerSearchLoading&&row.customerSuggestions.length?<button type="button" tabIndex={-1} onClick={()=>openNewCustomer(row)} className="mt-1 flex w-full items-center justify-between rounded-lg border border-dashed border-violet-200 px-2.5 py-1.5 text-left text-[10px] font-black text-violet-700 hover:bg-violet-50"><span>+ Add a different new customer</span><span>New →</span></button>:null}
                        </div>:null}
                      </div>
                      <div className="rush-cell-actions flex items-center justify-end gap-1.5">
                        {row.status==="SAVED"?isPending?<><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">Pending</span><button type="button" tabIndex={-1} onClick={()=>{setMinimized(true);if(row.transactionId)void onCompleteTransaction?.(row.transactionId);}} className="min-h-8 rounded-lg bg-amber-500 px-2.5 text-[11px] font-black text-white">Complete</button></>:<><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">✓ Complete</span><button type="button" tabIndex={-1} onClick={()=>void openTransaction(row)} className="min-h-8 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-black text-white">Open</button></>:
                        <>{row.status==="SAVING"?<span className="mr-1 text-[10px] font-black text-violet-700">Saving…</span>:row.status==="ERROR"?<span title={row.message} className="grid h-6 w-6 place-items-center rounded-full bg-rose-50 text-[11px] font-black text-rose-600">!</span>:null}
                          <button type="button" tabIndex={-1} disabled={row.status==="SAVING"||row.newCustomerOpen||isIdleEditable} onClick={()=>toggleExpanded(row.key)} className="min-h-8 rounded-lg px-2.5 text-[11px] font-black text-violet-700 hover:bg-violet-50 disabled:opacity-50">{row.newCustomerOpen?"Adding customer":row.expanded?"Hide":"Details"}</button>
                          <button type="button" tabIndex={-1} disabled={row.status==="SAVING"||row.newCustomerOpen||isIdleEditable||!hasDraft(row)} onClick={()=>void saveRow(row.key)} className="min-h-8 rounded-lg bg-violet-600 px-3 text-[11px] font-black text-white shadow-sm disabled:opacity-25">Save</button>
                          <button type="button" tabIndex={-1} disabled={row.status==="SAVING"} onClick={()=>removeRow(row.key)} className="grid h-8 w-7 place-items-center rounded-lg text-sm font-black text-[var(--text-muted)] opacity-0 transition hover:bg-rose-50 hover:text-rose-600 hover:opacity-100 focus:opacity-100 group-hover:opacity-35 group-focus-within:opacity-35" aria-label={"Remove row "+(index+1)}>×</button></>}
                      </div>
                    </div>

                    {row.newCustomerOpen&&row.status!=="SAVED"?<form onSubmit={(event)=>{event.preventDefault();void createNewCustomer(row);}} className="rush-workspace">
                      <div className="mb-2"><p className="rush-workspace-title">New customer</p><p className="mt-0.5 text-[12px] font-semibold text-slate-500">Create once, then reuse saved beneficiaries and service references next time.</p></div>
                      <div className="grid gap-2 md:grid-cols-[minmax(210px,1fr)_160px_140px_minmax(220px,1.4fr)_auto] md:items-end">
                        <div><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Customer name <b className="text-rose-500">*</b></span><input ref={(element)=>{newCustomerRefs.current[row.key]=element;}} value={row.newCustomerName} onChange={(event)=>updateRow(row.key,{newCustomerName:event.target.value.toUpperCase(),newCustomerError:undefined})} className="h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-[13px] font-extrabold uppercase outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" placeholder="Customer name"/></div>
                        <label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Mobile</span><input type="tel" inputMode="numeric" value={row.newCustomerMobile} onChange={(event)=>updateRow(row.key,{newCustomerMobile:event.target.value.replace(/\D/g,"").slice(0,10),newCustomerError:undefined})} className="h-9 w-full rounded-lg border border-[var(--border)] bg-white px-2.5 text-[12px] font-bold outline-none focus:border-violet-400" placeholder="Optional"/></label>
                        <label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Customer type</span><select value={row.newCustomerType} onChange={(event)=>updateRow(row.key,{newCustomerType:event.target.value as "REGULAR"|"WALK_IN"})} className="h-9 w-full rounded-lg border border-[var(--border)] bg-white px-2 text-[11px] font-black outline-none"><option value="REGULAR">Regular</option><option value="WALK_IN">Walk-in</option></select></label>
                        <label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Identifying note</span><input value={row.newCustomerNotes} onChange={(event)=>updateRow(row.key,{newCustomerNotes:event.target.value,newCustomerError:undefined})} className="h-9 w-full rounded-lg border border-[var(--border)] bg-white px-2.5 text-[11px] font-bold outline-none focus:border-violet-400" placeholder="Area / relation / identifying note · optional"/></label>
                        <div className="flex items-center justify-end gap-1.5"><button type="button" disabled={row.newCustomerSaving} onClick={()=>updateRow(row.key,{newCustomerOpen:false,newCustomerSaving:false,newCustomerError:undefined})} className="min-h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-[10px] font-black text-[var(--text-muted)]">Cancel</button><button type="submit" disabled={row.newCustomerSaving||!row.newCustomerName.trim()} className="min-h-9 rounded-lg bg-violet-600 px-4 text-[11px] font-black text-white shadow-sm disabled:opacity-40">{row.newCustomerSaving?"Creating…":"Create & Use"}</button></div>
                      </div>
                      {row.newCustomerError?<p className="mt-1.5 text-[10px] font-bold text-rose-600">{row.newCustomerError}</p>:<p className="mt-1.5 text-[9px] font-semibold text-[var(--text-muted)]">After creation this customer stays linked to the row, so saved bank / UPI / service references can be reused on future visits.</p>}
                    </form>:null}

                    {row.expanded&&!row.newCustomerOpen&&row.status!=="SAVED"?<div className="rush-workspace">
                      <div>
                        {row.direction==="IN"&&row.purpose==="TRANSFER"?<div className="grid gap-3 lg:grid-cols-[minmax(320px,1.25fr)_minmax(420px,1fr)_minmax(240px,.72fr)]">
                          <section className="rush-work-group">
                            <div className="flex items-center justify-between gap-2"><p className="rush-workspace-title">Destination</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{row.customerProfileLoading?"Loading history…":activeTransferTypes.find((item)=>item.id===row.transferTypeId)?.name||""}</span></div>
                            {destinationOptions.length?<div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">{destinationOptions.slice(0,6).map((option)=><button key={option.key} type="button" tabIndex={-1} onClick={()=>updateRow(row.key,destinationPatch(option))} className={"rush-choice-card min-w-[145px] max-w-[195px] border px-2.5 py-2 text-left transition "+(row.selectedDestinationKey===option.key?"border-violet-500 bg-violet-50 shadow-sm ring-2 ring-violet-100":row.destinationHighlightKey===option.key?"border-amber-300 bg-amber-50/70 ring-2 ring-amber-100":"border-slate-200 bg-white hover:border-violet-200")}><span className="flex items-center gap-1.5"><strong className="min-w-0 flex-1 truncate text-[12px] text-slate-900">{option.title}</strong>{option.isLastUsed?<b className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800">LAST</b>:option.source==="SAVED"?<b className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">SAVED</b>:<b className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-600">RECENT</b>}</span><span className="mt-1 block truncate text-[11px] font-semibold text-slate-500">{option.subtitle}{option.lastUsedAt?" · "+usedLabel(option.lastUsedAt):""}{option.useCount>1?" · "+option.useCount+"×":""}</span></button>)}</div>:row.customerId&&!row.customerProfileLoading?<p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] font-semibold text-slate-500">No saved {row.beneficiaryMode==="UPI"?"UPI":"bank"} destination yet. Enter new details below.</p>:null}
                            {row.beneficiaryMode==="UPI"?<label className="mt-2 block"><span className="mb-1 block text-[11px] font-extrabold text-slate-600">UPI ID / mobile</span><input ref={(element)=>{detailRefs.current[row.key]=element;}} value={row.beneficiaryUpi} onKeyDown={(event)=>handleDestinationKeyDown(row,destinationOptions,event)} onChange={(event)=>updateRow(row.key,{beneficiaryUpi:event.target.value,selectedDestinationKey:"",destinationHighlightKey:""})} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="UPI ID or mobile number"/></label>:
                            <div className="mt-2 grid gap-2 sm:grid-cols-3"><label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Account holder</span><input ref={(element)=>{detailRefs.current[row.key]=element;}} value={row.bankAccountHolder} onKeyDown={(event)=>handleDestinationKeyDown(row,destinationOptions,event)} onChange={(event)=>updateRow(row.key,{bankAccountHolder:event.target.value,selectedDestinationKey:"",destinationHighlightKey:""})} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Name"/></label><label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Account number</span><input inputMode="numeric" value={row.bankAccountNumber} onChange={(event)=>updateRow(row.key,{bankAccountNumber:event.target.value.replace(/\s/g,""),selectedDestinationKey:"",destinationHighlightKey:""})} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Account no."/></label><label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">IFSC</span><input value={row.bankIfsc} onChange={(event)=>updateRow(row.key,{bankIfsc:event.target.value.toUpperCase().replace(/\s/g,""),selectedDestinationKey:"",destinationHighlightKey:""})} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold uppercase outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="IFSC"/></label></div>}
                          </section>

                          <section className="rush-work-group">
                            <p className="rush-workspace-title">Payment</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-[150px_minmax(180px,1fr)_150px]">
                              <label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Fee paid by</span>{Number(row.commission||0)>0?<><select value={row.commissionMode} onChange={(event)=>updateRow(row.key,{commissionMode:event.target.value as CommissionMode,commissionCash:event.target.value==="SPLIT"?row.commissionCash:""})} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-extrabold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"><option value="CASH">Cash</option><option value="UPI">Bank / UPI</option><option value="SPLIT">Both</option></select>{row.commissionMode==="SPLIT"?<div className="mt-2 flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3"><span className="text-[12px] font-bold text-slate-500">Cash ₹</span><input inputMode="decimal" value={row.commissionCash} onFocus={(event)=>event.currentTarget.select()} onChange={(event)=>updateRow(row.key,{commissionCash:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right text-[12px] font-black outline-none" placeholder="0"/></div>:null}</>:<div className="flex h-10 items-center rounded-xl bg-slate-50 px-3 text-[12px] font-bold text-slate-500">No fee</div>}</label>
                              <label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Customer gave</span><div className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 focus-within:ring-4 focus-within:ring-emerald-100"><span className="font-black text-emerald-700">₹</span><input inputMode="decimal" value={row.cashReceivedOverridden?row.cashReceived:String(due||"")} onFocus={(event)=>event.currentTarget.select()} onChange={(event)=>{const value=event.target.value.replace(/[^0-9.]/g,"");updateRow(row.key,{cashReceived:value,cashReceivedOverridden:Boolean(value)});}} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}} placeholder={String(due||0)} className="min-w-0 flex-1 bg-transparent text-[15px] font-black tabular-nums text-emerald-950 outline-none"/>{row.cashReceivedOverridden?<button type="button" tabIndex={-1} onClick={()=>updateRow(row.key,{cashReceived:"",cashReceivedOverridden:false})} className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-emerald-700">Exact</button>:null}</div></label>
                              <div className={"rounded-xl px-3 py-2 "+(short>0?"bg-rose-50 ring-1 ring-rose-200":"bg-emerald-50 ring-1 ring-emerald-200")}><span className={"block text-[11px] font-black uppercase tracking-[.06em] "+(short>0?"text-rose-700":"text-emerald-700")}>{short>0?"Ask more":"Give back"}</span><strong className={"money mt-1 block text-[16px] font-black "+(short>0?"text-rose-800":"text-emerald-800")}>{money(short>0?short:change)}</strong></div>
                            </div>
                          </section>

                          <section className="rush-work-group">
                            <div><p className="rush-workspace-title">Optional</p><p className="mt-0.5 text-[12px] font-semibold text-slate-500">Only enter when useful</p></div>
                            <div className="mt-2 grid gap-2">
                              <label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Mobile</span><input type="tel" inputMode="numeric" value={row.mobileNumber} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value.replace(/\D/g,"").slice(0,10)})} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Optional"/></label>
                              <label><span className="mb-1 block text-[11px] font-extrabold text-slate-600">Reference / note</span><input value={row.remarks} onChange={(event)=>updateRow(row.key,{remarks:event.target.value})} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Optional note"/></label>
                            </div>
                          </section>
                        </div>:null}
                        {row.direction==="IN"&&row.purpose==="SERVICE"?<div><div className="mb-2"><p className="rush-workspace-title">Service details</p><p className="mt-0.5 text-[12px] font-semibold text-slate-500">Service, customer reference, payment and fulfilment</p></div><div className="flex flex-wrap items-stretch gap-2">
                          <label className="w-[210px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Service <b className="text-rose-500">*</b></span><select ref={(element)=>{detailRefs.current[row.key]=element;}} value={row.serviceName} onChange={(event)=>selectService(row,event.target.value)} className="mt-1 h-8 w-full cursor-pointer rounded-md border border-violet-200 bg-white px-2 text-[11px] font-black outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"><option value="">Select service</option>{activeServices.map((item)=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
                          {row.serviceName?<div className="w-[360px] shrink-0 rush-work-group bg-blue-50/70"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase text-blue-700">Customer reference · optional</span><span className="text-[9px] font-bold text-blue-600">{row.customerProfileLoading?"Loading history…":row.customerId?(serviceReferenceOptions.length?serviceReferenceOptions.length+" available":"New reference"):"Select customer to reuse"}</span></div>{serviceReferenceOptions.length?<div className="mt-1 flex gap-1 overflow-x-auto pb-1">{serviceReferenceOptions.slice(0,4).map((option,optionIndex)=>{const selected=option.id?row.serviceProfileId===option.id:!row.serviceProfileId&&row.serviceReferenceNumber===option.referenceNumber&&row.serviceProviderName===(option.providerName||"");return <button key={option.id||option.key||option.referenceNumber+optionIndex} type="button" onClick={()=>updateRow(row.key,serviceReferencePatch(option))} className={"min-w-[120px] rounded-md border px-2 py-1 text-left "+(selected?"border-blue-400 bg-white shadow-sm":"border-blue-100 bg-white/70")}><span className="flex items-center gap-1"><strong className="min-w-0 flex-1 truncate text-[9px]">{option.nickname||option.providerName||"Reference"}</strong>{optionIndex===0&&option.lastUsedAt?<b className="rounded bg-amber-100 px-1 text-[6px] font-black text-amber-800">LAST</b>:option.id?<b className="rounded bg-emerald-100 px-1 text-[6px] font-black text-emerald-700">SAVED</b>:<b className="rounded bg-slate-100 px-1 text-[6px] font-black text-slate-600">RECENT</b>}</span><span className="mt-0.5 block truncate text-[9px] text-[var(--text-muted)]">{option.referenceNumber}{option.providerName?" · "+option.providerName:""}{option.useCount&&option.useCount>1?" · "+option.useCount+"×":""}</span></button>})}</div>:null}<div className="mt-1 grid grid-cols-[1.25fr_.8fr] gap-1"><input value={row.serviceReferenceNumber} onChange={(event)=>updateRow(row.key,{serviceProfileId:"",serviceReferenceNumber:event.target.value,rememberServiceReference:Boolean(row.customerId)})} className="h-8 rounded-md border border-blue-100 bg-white px-2 text-[11px] font-bold outline-none focus:border-blue-400" placeholder="Consumer / account no."/><input value={row.serviceProviderName} onChange={(event)=>updateRow(row.key,{serviceProfileId:"",serviceProviderName:event.target.value,rememberServiceReference:Boolean(row.customerId)})} className="h-8 rounded-md border border-blue-100 bg-white px-2 text-[11px] font-bold outline-none focus:border-blue-400" placeholder="Provider"/></div><div className="mt-1 flex items-center gap-1"><input value={row.serviceReferenceLabel} onChange={(event)=>updateRow(row.key,{serviceProfileId:"",serviceReferenceLabel:event.target.value,rememberServiceReference:Boolean(row.customerId)})} className="h-7 min-w-0 flex-1 rounded-md border border-blue-100 bg-white px-2 text-[10px] font-bold outline-none" placeholder="Nickname e.g. Home EB"/>{row.customerId&&row.serviceReferenceNumber?<label className="flex shrink-0 items-center gap-1 text-[9px] font-black text-blue-700"><input type="checkbox" checked={row.rememberServiceReference} onChange={(event)=>updateRow(row.key,{rememberServiceReference:event.target.checked})}/>Remember</label>:null}</div></div>:null}
                          <div className="w-[190px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Customer paid by</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5">{(["CASH","UPI"] as const).map((mode)=><button type="button" key={mode} onClick={()=>updateRow(row.key,{servicePaymentMode:mode,servicePaymentAccountId:mode==="CASH"?"":row.servicePaymentAccountId})} className={"min-h-7 rounded-[6px] text-[10px] font-black "+(row.servicePaymentMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":"Bank / UPI"}</button>)}</div></div>
                          {row.servicePaymentMode==="UPI"?<label className="w-[180px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Received in <b className="text-rose-500">*</b></span><select value={row.servicePaymentAccountId} onChange={(event)=>updateRow(row.key,{servicePaymentAccountId:event.target.value})} className="mt-1 h-8 w-full rounded-md border border-violet-200 bg-white px-2 text-[11px] font-bold"><option value="">Select account</option>{servicePaymentAccounts.map((item)=><option key={item.id} value={item.id}>{item.accountName}</option>)}</select></label>:null}
                          <div className="w-[170px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Fulfilled by</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5"><button type="button" onClick={()=>updateRow(row.key,{serviceFulfillmentMode:"INTERNAL"})} className={"min-h-7 rounded-[6px] text-[10px] font-black "+(row.serviceFulfillmentMode==="INTERNAL"?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>Us</button><button type="button" disabled={Boolean(selectedService&&!selectedService.allowPartnerFulfillment)} onClick={()=>updateRow(row.key,{serviceFulfillmentMode:"PARTNER",servicePartnerName:row.servicePartnerName||selectedService?.defaultPartnerName||"",servicePartnerCharge:row.servicePartnerCharge||(selectedService?.defaultPartnerCharge!==null&&selectedService?.defaultPartnerCharge!==undefined?String(Number(selectedService.defaultPartnerCharge)):""),servicePartnerPaymentAccountId:row.servicePartnerPaymentAccountId||cashAccountId})} className={"min-h-7 rounded-[6px] text-[10px] font-black disabled:opacity-30 "+(row.serviceFulfillmentMode==="PARTNER"?"bg-violet-50 text-violet-700":"text-[var(--text-muted)]")}>Partner</button></div></div>
                          {row.serviceFulfillmentMode==="PARTNER"?<><label className="w-[165px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Partner <b className="text-rose-500">*</b></span><input value={row.servicePartnerName} onChange={(event)=>updateRow(row.key,{servicePartnerName:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[11px] font-bold outline-none" placeholder="Company"/></label>
                            <label className="w-[105px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Cost <b className="text-rose-500">*</b></span><div className="mt-1 flex h-8 items-center rounded-md bg-white px-2"><span className="text-[10px] font-black">₹</span><input inputMode="decimal" value={row.servicePartnerCharge} onChange={(event)=>updateRow(row.key,{servicePartnerCharge:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right text-[11px] font-black outline-none"/></div></label>
                            <div className="w-[145px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Partner payment</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5"><button type="button" onClick={()=>updateRow(row.key,{servicePartnerPaymentTiming:"PAID_NOW",servicePartnerPaymentAccountId:row.servicePartnerPaymentAccountId||cashAccountId})} className={"min-h-7 rounded-[6px] text-[10px] font-black "+(row.servicePartnerPaymentTiming==="PAID_NOW"?"bg-blue-50 text-blue-700":"text-[var(--text-muted)]")}>Now</button><button type="button" onClick={()=>updateRow(row.key,{servicePartnerPaymentTiming:"PAY_LATER"})} className={"min-h-7 rounded-[6px] text-[10px] font-black "+(row.servicePartnerPaymentTiming==="PAY_LATER"?"bg-amber-50 text-amber-700":"text-[var(--text-muted)]")}>Later</button></div></div>
                            {row.servicePartnerPaymentTiming==="PAID_NOW"?<label className="w-[175px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Paid from <b className="text-rose-500">*</b></span><select value={row.servicePartnerPaymentAccountId} onChange={(event)=>updateRow(row.key,{servicePartnerPaymentAccountId:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[11px] font-bold"><option value="">Select account</option>{partnerPaymentAccounts.map((item)=><option key={item.id} value={item.id}>{item.accountName}</option>)}</select></label>:<div className="w-[125px] shrink-0 rounded-lg bg-amber-50 px-2 py-1.5"><span className="block text-[9px] font-black uppercase text-amber-700">Payable</span><strong className="money mt-1 block text-[12px] text-amber-800">{money(Number(row.servicePartnerCharge||0))}</strong></div>}
                            <div className="w-[120px] shrink-0 rounded-lg bg-emerald-50 px-2 py-1.5"><span className="block text-[9px] font-black uppercase text-emerald-700">Our earning</span><strong className="money mt-1 block text-[12px] text-emerald-800">{money(Number(row.amount||0)-Number(row.servicePartnerCharge||0))}</strong></div></>:null}
                          <label className="w-[145px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Mobile · optional</span><input type="tel" value={row.mobileNumber} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[11px] font-bold outline-none" placeholder="Mobile"/></label>
                          <label className="w-[180px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Note · optional</span><input value={row.remarks} onChange={(event)=>updateRow(row.key,{remarks:event.target.value})} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[11px] font-bold outline-none" placeholder="Note"/></label>
                        </div></div>:null}
                        {row.direction==="OUT"?<div><div className="mb-2"><p className="rush-workspace-title">Cash out details</p><p className="mt-0.5 text-[12px] font-semibold text-slate-500">Provider result, verification, commission and optional reference</p></div><div className="flex flex-wrap items-stretch gap-2">
                          {row.cashOutType!=="UPI_QR"?<><div className="w-[155px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Attempt</span><div className="mt-1 grid grid-cols-2 rounded-md bg-white p-0.5"><button type="button" onClick={()=>updateRow(row.key,{successful:true})} className={"min-h-7 rounded-[6px] text-[10px] font-black "+(row.successful?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>Success</button><button type="button" onClick={()=>updateRow(row.key,{successful:false,commission:"",commissionCash:""})} className={"min-h-7 rounded-[6px] text-[10px] font-black "+(!row.successful?"bg-rose-50 text-rose-700":"text-[var(--text-muted)]")}>Failed</button></div></div>
                            {row.cashOutType==="AEPS"?<label className="w-[120px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Aadhaar last 4 <b className="text-rose-500">*</b></span><input ref={(element)=>{detailRefs.current[row.key]=element;}} inputMode="numeric" maxLength={4} value={row.aadhaarLastFour} onChange={(event)=>updateRow(row.key,{aadhaarLastFour:event.target.value.replace(/\D/g,"").slice(0,4)})} className="mt-1 h-8 w-full rounded-md border border-violet-200 bg-white px-2 text-[11px] font-black tracking-widest outline-none" placeholder="1234"/></label>:<>
                              <label className="w-[105px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Card last 4 <b className="text-rose-500">*</b></span><input ref={(element)=>{detailRefs.current[row.key]=element;}} inputMode="numeric" maxLength={4} value={row.cardLastFour} onChange={(event)=>updateRow(row.key,{cardLastFour:event.target.value.replace(/\D/g,"").slice(0,4)})} className="mt-1 h-8 w-full rounded-md border border-violet-200 bg-white px-2 text-[11px] font-black tracking-widest outline-none" placeholder="1234"/></label>
                              <label className="w-[145px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Customer bank</span><input value={row.customerBankName} onChange={(event)=>updateRow(row.key,{customerBankName:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[11px] font-bold outline-none" placeholder="Bank"/></label></>}
                          </>:null}
                          {row.commission&&Number(row.commission)>0&&row.successful?<div className="w-[205px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Commission in</span>{row.cashOutType==="MICRO_ATM"?<div className="mt-1 flex h-8 items-center rounded-md bg-blue-50 px-2 text-[10px] font-black text-blue-700">Bank / UPI</div>:<div className="mt-1 grid grid-cols-3 rounded-md bg-white p-0.5">{(["CASH","UPI","SPLIT"] as CommissionMode[]).map((mode)=><button key={mode} type="button" onClick={()=>updateRow(row.key,{commissionMode:mode,commissionCash:mode==="SPLIT"?row.commissionCash:""})} className={"min-h-7 rounded-[6px] px-1 text-[10px] font-black "+(row.commissionMode===mode?"bg-emerald-50 text-emerald-700":"text-[var(--text-muted)]")}>{mode==="CASH"?"Cash":mode==="UPI"?"UPI":"Split"}</button>)}</div>}{row.commissionMode==="SPLIT"&&row.cashOutType!=="MICRO_ATM"?<div className="mt-1 flex h-7 items-center rounded-md bg-white px-2"><span className="text-[10px] font-bold">Cash ₹</span><input inputMode="decimal" value={row.commissionCash} onChange={(event)=>updateRow(row.key,{commissionCash:event.target.value.replace(/[^0-9.]/g,"")})} className="min-w-0 flex-1 bg-transparent text-right text-[11px] font-black outline-none"/></div>:null}</div>:null}
                          <label className="w-[145px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Mobile · optional</span><input type="tel" value={row.mobileNumber} onChange={(event)=>updateRow(row.key,{mobileNumber:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[11px] font-bold outline-none" placeholder="Mobile"/></label>
                          <label className="w-[180px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Note · optional</span><input value={row.remarks} onChange={(event)=>updateRow(row.key,{remarks:event.target.value})} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void saveRow(row.key);}}} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[11px] font-bold outline-none" placeholder="Reference"/></label>
                          <label className="w-[180px] shrink-0 rush-work-group"><span className="block text-[9px] font-black uppercase text-[var(--text-muted)]">Date & time · optional</span><input type="datetime-local" value={row.transactionAt} onChange={(event)=>updateRow(row.key,{transactionAt:event.target.value})} className="mt-1 h-8 w-full rounded-md bg-white px-2 text-[10px] font-bold outline-none"/></label>
                        </div></div>:null}
                      </div>
                      {row.status==="ERROR"&&row.message?<p className="mt-1.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700">{row.message}</p>:null}
                    </div>:null}
                  </div>;
                })}
              </div>
            </div>
          </div>

          <footer className="rush-pos-footer shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 pb-[max(.6rem,env(safe-area-inset-bottom))] sm:px-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={()=>addRow("IN")} className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-black text-emerald-700 shadow-sm transition hover:bg-emerald-100"><span className="sm:hidden">+ In</span><span className="hidden sm:inline">+ Cash In</span></button>
                <button type="button" onClick={()=>addRow("OUT")} className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[11px] font-black text-rose-700 shadow-sm transition hover:bg-rose-100"><span className="sm:hidden">+ Out</span><span className="hidden sm:inline">+ Cash Out</span></button>
              </div>
              <div className="min-w-0 text-center sm:text-right">
                <p className="truncate text-[10px] font-black uppercase tracking-[.06em] text-slate-500"><span className="text-emerald-700">{savedRows.length} saved</span> · <span className={pendingRows.length?"text-amber-700":"text-slate-500"}>{pendingRows.length} pending</span> · {unsavedCount} unsaved</p>
                <p className="money mt-0.5 text-[13px] font-black text-slate-900">{money(readyTotal)} total</p>
                <p className="mt-0.5 hidden text-[10px] font-semibold text-slate-500 sm:block">Tab follows the working row · Enter confirms/saves · Ctrl/⌘ + Enter saves all</p>
              </div>
              <button type="button" onClick={()=>void saveAll()} disabled={savingAll||enteredRows.every((row)=>row.status==="SAVED")} className="min-h-11 rounded-xl bg-violet-600 px-4 text-[12px] font-black text-white shadow-[0_7px_18px_rgba(109,40,217,.22)] transition hover:bg-violet-700 disabled:opacity-30">{savingAll?"Saving…":"Save all"}</button>
            </div>
          </footer>
        </div>
      </div>,document.body):null}
  </>;
}
