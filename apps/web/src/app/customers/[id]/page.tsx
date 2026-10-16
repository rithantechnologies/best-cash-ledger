"use client";
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { CustomerCashModalRequest } from "@/components/cash-counter-workspace";
const CustomerQuickCash = dynamic(()=>import("@/components/cash-counter-workspace"));
import { AppShell } from "@/components/app-shell";
import { DetailStat, EmptyState, Field, Modal, PageFrame, PageLoader, PanelHeader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { transactionHref } from "@/lib/transaction-return";
import { moneyStatus, moneyStatusOptions } from "@/lib/money-status";
import { SearchSelect } from "@/components/search-select";
import { BankIfscPicker } from "@/components/bank-ifsc-picker";
import { matchesSavedDetailSearch } from "@/lib/saved-detail-search";
import { formatBankCopyText } from "@/lib/bank-copy-text";
import { suggestedPayOutSource, type PayInSource } from "@/lib/pay-out-source";

const DEMO_TEST_NUMBERS = ["4242424242424242", "5555555555554444", "4000000000000002", "4111111111111111"];
// The development demo accepts typed 16-digit samples, not actual card PANs.
const isSafeDemoNumber=(value:string)=>/^\d{16}$/.test(value);
type Card={id:string;bankName:string;cardType:string|null;lastFourDigits:string;nickname:string|null;isActive:boolean};
type Bank={id:string;accountHolderName:string;bankName:string;accountReference:string;ifsc:string|null;isActive:boolean};
type Upi={id:string;accountName:string;upiId:string|null;mobileNumber:string|null;providerName:string|null;isActive:boolean};
type EbConnection={id:string;serviceName:string;nickname:string|null;ownerName:string|null;providerName:string|null;referenceNumber:string;isActive:boolean};
type AepsAccount={id:string;bankName:string;holderName:string;prNumber?:string|null;aadhaarLastSix?:string|null;isActive:boolean};
type EsevaiService={id:string;esevaiName:string;serviceName:string;isActive:boolean};
type CashServiceCatalogOption={id:string;name:string;isActive:boolean};
type BAccount={id:string;accountType:string;bankName:string|null;accountReference:string|null;ifsc:string|null;upiId:string|null;mobileNumber:string|null;isActive:boolean};
type Beneficiary={id:string;beneficiaryName:string;relationshipNote:string|null;notes:string|null;isActive:boolean;accounts:BAccount[]};
type CustomerTypeChoice={id:string;name:string;legacyType:"REGULAR"|"WALK_IN"|null;isActive:boolean};
type Customer={
 id:string;customerCode:string;customerType:string;customerTypeId:string|null;customerTypeConfig:{id:string;name:string;isActive:boolean}|null;fullName:string;mobile:string|null;ebNumber:string|null;notes:string|null;isActive:boolean;
 cards:Card[];bankAccounts:Bank[];upiAccounts:Upi[];serviceProfiles?:EbConnection[];aepsAccounts?:AepsAccount[];esevaiServices?:EsevaiService[];beneficiaries:Beneficiary[];
 transactions:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;grossAmount:string;netAmount:string|null;status:string;referenceNumber:string|null;payable:{status:string;dueAt:string;remainingAmount:string}|null;receivableSource:{status:string;dueAt:string|null;remainingAmount:string}|null}[];
 payables:{id:string;remainingAmount:string;dueAt:string;status:string}[];
 receivables:{id:string;reason:string;remainingAmount:string;receivedAmount:string;originalAmount:string;dueAt:string|null;status:string}[];
};
type CardLedgerCard={id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean;label:string};
type CardLedgerRow={id:string;at:string;kind:"CARD_SWIPE"|"CUSTOMER_PAYOUT"|"CARD_DUE_PAYMENT"|"CARD_DUE_RECOVERY"|"PAY_IN"|"PAY_OUT";remarks:string;detail:string;debit:number;credit:number;closingBalance:number;cardId:string|null;cardLabel:string;transactionId:string;transactionNumber:string;referenceNumber:string|null};
type CardLedgerOpenItem={targetType:"PAYABLE"|"CARD_DUE";targetId:string;sourceKind:"CARD_SWIPE"|"EXCESS_RECOVERY"|"CARD_DUE";transactionId:string;transactionNumber:string;transactionAt:string;dueAt:string;originalAmount:number;remainingAmount:number;cardId:string;cardLabel:string;label:string};
type Advance={id:string;customerCardId:string|null;amount:number;applied:number;remaining:number;transactionId:string;transactionNumber:string;date:string;source:string};
type CardLedger={payInSources:PayInSource[];availableAdvances:Advance[];customer:{id:string;fullName:string;mobile:string|null};cards:CardLedgerCard[];selectedCardId:string|null;openPayOutItems:CardLedgerOpenItem[];openPayInItems:CardLedgerOpenItem[];totals:{debit:number;credit:number;balance:number;position:"TO_PAY_CUSTOMER"|"TO_RECOVER_FROM_CUSTOMER"|"SETTLED"};rows:CardLedgerRow[]};
type EditState={kind:"card";item:Card}|{kind:"bank";item:Bank}|{kind:"upi";item:Upi}|{kind:"beneficiary";item:Beneficiary}|{kind:"beneficiaryAccount";item:BAccount}|null;
type AddKind="bank"|"upi"|"beneficiary"|"beneficiaryAccount"|null;
type ToggleTarget={path:string;isActive:boolean;label:string}|null;
type LedgerAccount={id:string;accountName:string;accountType:string;isActive:boolean};
type LedgerEntryDirection="PAY_IN"|"PAY_OUT";
const money=(v:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(v||0));
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]??ch));
const localDateValue=()=>{const now=new Date(),offset=now.getTimezoneOffset()*60000;return new Date(now.getTime()-offset).toISOString().slice(0,10);};
const dateWithCurrentLocalTime=(date:string)=>{const now=new Date(),[year,month,day]=date.split("-").map(Number);return new Date(year,month-1,day,now.getHours(),now.getMinutes(),now.getSeconds(),now.getMilliseconds()).toISOString();};

export default function CustomerDetailPage(){
 const {id}=useParams<{id:string}>();
 const [c,setC]=useState<Customer|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [view,setView]=useState<"details"|"activity">("details"),[setupGuide,setSetupGuide]=useState(false);
 const [savedSearch,setSavedSearch]=useState("");
 const [customerQuickRequest,setCustomerQuickRequest]=useState<CustomerCashModalRequest|null>(null);
 const quickFocusReturnRef=useRef<HTMLButtonElement|null>(null);
 const [demoEnabled,setDemoEnabled]=useState(false),[demoCardIds,setDemoCardIds]=useState<string[]>([]);
 const [demoAddNumber,setDemoAddNumber]=useState("");
 // Full values stay out of rendered state/DOM and are cleared after copying or closing.
 const copyValueRef=useRef("");
 const copyRequestRef=useRef(0);
 const [copyLoadingId,setCopyLoadingId]=useState<string|null>(null),[copyFallbackCard,setCopyFallbackCard]=useState<Card|null>(null),[copyError,setCopyError]=useState("");
 const [addingCard,setAddingCard]=useState(false),[cardBank,setCardBank]=useState(""),[cardLastFour,setCardLastFour]=useState(""),[cardNickname,setCardNickname]=useState(""),[cardError,setCardError]=useState("");
 const [profileEditing,setProfileEditing]=useState(false),[profileName,setProfileName]=useState(""),[profileMobile,setProfileMobile]=useState(""),[profileTypeId,setProfileTypeId]=useState(""),[profileNotes,setProfileNotes]=useState(""),[profileError,setProfileError]=useState("");
 const [ebEditing,setEbEditing]=useState(false),[ebTarget,setEbTarget]=useState<EbConnection|null>(null),[ebOwnerName,setEbOwnerName]=useState(""),[ebDraft,setEbDraft]=useState(""),[ebError,setEbError]=useState("");
 const [aepsEditing,setAepsEditing]=useState(false),[aepsTarget,setAepsTarget]=useState<AepsAccount|null>(null),[aepsHolder,setAepsHolder]=useState(""),[aepsBank,setAepsBank]=useState(""),[aepsPrNumber,setAepsPrNumber]=useState(""),[aepsError,setAepsError]=useState("");
 const [esevaiEditing,setEsevaiEditing]=useState(false),[esevaiTarget,setEsevaiTarget]=useState<EsevaiService|null>(null),[esevaiName,setEsevaiName]=useState(""),[esevaiServiceName,setEsevaiServiceName]=useState(""),[esevaiError,setEsevaiError]=useState("");
 const [esevaiCatalog,setEsevaiCatalog]=useState<CashServiceCatalogOption[]>([]),[esevaiCatalogStatus,setEsevaiCatalogStatus]=useState<"idle"|"loading"|"loaded"|"error">("idle");
 const [customerTypes,setCustomerTypes]=useState<CustomerTypeChoice[]>([]);
 const [txStatusFilter,setTxStatusFilter]=useState(""),[moneyStatusFilter,setMoneyStatusFilter]=useState("");
 const [cardLedger,setCardLedger]=useState<CardLedger|null>(null),[ledgerCardId,setLedgerCardId]=useState(""),[ledgerLoading,setLedgerLoading]=useState(true),[ledgerError,setLedgerError]=useState("");
 const [ledgerAccounts,setLedgerAccounts]=useState<LedgerAccount[]>([]),[ledgerEntryDirection,setLedgerEntryDirection]=useState<LedgerEntryDirection|null>(null),[ledgerEntryBusy,setLedgerEntryBusy]=useState(false),[ledgerEntryError,setLedgerEntryError]=useState("");
 const [ledgerPayoutDestination,setLedgerPayoutDestination]=useState(""),[ledgerPayoutDetails,setLedgerPayoutDetails]=useState("");
 const [ledgerPaidFromManual,setLedgerPaidFromManual]=useState(false);
 const [ledgerCashConfirmed,setLedgerCashConfirmed]=useState(false);
 const [ledgerEntryAmount,setLedgerEntryAmount]=useState(""),[ledgerEntryDate,setLedgerEntryDate]=useState(localDateValue),[ledgerEntryAccountId,setLedgerEntryAccountId]=useState(""),[ledgerEntryCardId,setLedgerEntryCardId]=useState(""),[ledgerEntryRemarks,setLedgerEntryRemarks]=useState(""),[ledgerEntryReference,setLedgerEntryReference]=useState(""),[ledgerEntryNote,setLedgerEntryNote]=useState(""),[ledgerAllocations,setLedgerAllocations]=useState<Record<string,string>>({});
 const [addKind,setAddKind]=useState<AddKind>(null),[toggleTarget,setToggleTarget]=useState<ToggleTarget>(null);
 const [bankName,setBankName]=useState(""),[holder,setHolder]=useState(""),[accountRef,setAccountRef]=useState(""),[ifsc,setIfsc]=useState("");
 const [upiName,setUpiName]=useState(""),[upiId,setUpiId]=useState(""),[upiMobile,setUpiMobile]=useState(""),[upiProvider,setUpiProvider]=useState(""),[upiError,setUpiError]=useState("");
 const [beneficiaryName,setBeneficiaryName]=useState(""),[relationship,setRelationship]=useState("");
 const [beneficiaryId,setBeneficiaryId]=useState(""),[bType,setBType]=useState("BANK"),[bBank,setBBank]=useState(""),[bRef,setBRef]=useState(""),[bIfsc,setBIfsc]=useState(""),[bUpi,setBUpi]=useState(""),[bMobile,setBMobile]=useState("");
 const [editDemoNumber,setEditDemoNumber]=useState(""),[editOriginalNumber,setEditOriginalNumber]=useState(""),[editError,setEditError]=useState("");
 const [editNumberStatus,setEditNumberStatus]=useState<"none"|"loading"|"loaded"|"error">("none"),[showEditNumber,setShowEditNumber]=useState(false);
 const editNumberRequestRef=useRef(0);
 const [edit,setEdit]=useState<EditState>(null),[e1,setE1]=useState(""),[e2,setE2]=useState(""),[e3,setE3]=useState(""),[e4,setE4]=useState(""),[e5,setE5]=useState("");
 const control="app-control";

 const load=()=>apiFetch<Customer>("/customers/"+id).then(setC);
 const loadDemoStatus=()=>apiFetch<{enabled:boolean;cardIds:string[]}>("/customers/"+id+"/demo-card-status").then(result=>{setDemoEnabled(result.enabled);setDemoCardIds(result.cardIds);}).catch(()=>{setDemoEnabled(false);setDemoCardIds([]);});
 useEffect(()=>{void loadDemoStatus();},[id]);
 function clearCopyFallback(){
  copyRequestRef.current++;
  copyValueRef.current="";
  setCopyLoadingId(null);
  setCopyFallbackCard(null);
  setCopyError("");
 }
 async function writeCardNumberToClipboard(value:string){
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(value);return;}catch{/* Older mobile browsers require a direct selection fallback. */}
  }
  const field=document.createElement("textarea");
  field.value=value;
  field.readOnly=true;
  field.setAttribute("aria-hidden","true");
  field.style.position="fixed";
  field.style.opacity="0";
  field.style.left="-9999px";
  document.body.appendChild(field);
  let success=false;
  try{field.focus();field.select();field.setSelectionRange(0,value.length);success=document.execCommand("copy");}
  finally{field.remove();}
  if(!success)throw new Error("Clipboard access was blocked. Tap Copy again or allow clipboard access in your browser.");
 }
 async function copyDemoTestNumber(card:Card){
  const request=++copyRequestRef.current;
  copyValueRef.current="";
  setCopyFallbackCard(null);
  setCopyLoadingId(card.id);
  setCopyError("");setError("");setMessage("");
  try{
   const response=await apiFetch<{demoNumber:string}>("/customers/cards/"+card.id+"/copy-demo-test-number",{method:"POST"});
   if(request!==copyRequestRef.current)return;
   if(!/^\d{16}$/.test(response.demoNumber))throw new Error("Saved full card number is unavailable. Open Edit Card to add it.");
   copyValueRef.current=response.demoNumber;
   try{
    await writeCardNumberToClipboard(response.demoNumber);
    if(request===copyRequestRef.current){copyValueRef.current="";setMessage("Copied.");}
   }catch{
    // A fetch preceding clipboard access can lose user activation in Safari/mobile.
    // A fresh tap on the fallback dialog restores browser clipboard permission.
    if(request===copyRequestRef.current){setCopyFallbackCard(card);setCopyError("");}
   }
  }catch(err){
   if(request===copyRequestRef.current){copyValueRef.current="";setError(err instanceof Error?err.message:"Unable to retrieve the saved card number.");}
  }finally{if(request===copyRequestRef.current)setCopyLoadingId(null);}
 }
 async function copyReadyCardNumber(){
  const value=copyValueRef.current;
  if(!/^\d{16}$/.test(value)){setCopyError("Card number unavailable. Close and retry.");return;}
  try{await writeCardNumberToClipboard(value);clearCopyFallback();setMessage("Copied.");}
  catch(err){setCopyError(err instanceof Error?err.message:"Clipboard access is blocked.");}
 }
 useEffect(()=>()=>{copyRequestRef.current++;copyValueRef.current="";},[id]);
 const loadCardLedger=(cardId=ledgerCardId)=>{setLedgerLoading(true);setLedgerError("");return apiFetch<CardLedger>("/customers/"+id+"/card-ledger"+(cardId?"?cardId="+encodeURIComponent(cardId):"")).then(setCardLedger).catch(e=>setLedgerError(e instanceof Error?e.message:"Failed to load card ledger")).finally(()=>setLedgerLoading(false));};
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  setSetupGuide(params.has("setup"));
  if(params.get("tab")==="activity")setView("activity");
  if(params.get("saved")==="quick"){
   setMessage("Quick entry saved. Check Daily Cash for any pending settlement details.");
   const url=new URL(window.location.href);url.searchParams.delete("saved");
   window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
  }
},[id]);
function switchView(next:"details"|"activity"){
  setView(next);
  const url=new URL(window.location.href);
  if(next==="activity")url.searchParams.set("tab","activity");
  else url.searchParams.delete("tab");
  window.history.replaceState(window.history.state,"",url.pathname+url.search);
}
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Failed to load customer"));},[id]);
 useEffect(()=>{
  const refresh=()=>{setMessage("Card Swipe saved.");void load().catch(()=>{});void loadCardLedger(ledgerCardId);};
  window.addEventListener("cashledger:card-swipe-saved",refresh);
  return()=>window.removeEventListener("cashledger:card-swipe-saved",refresh);
 // The event originates from the globally mounted quick Card Swipe modal.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id,ledgerCardId]);
 useEffect(()=>{loadCardLedger(ledgerCardId);},[id,ledgerCardId]);
 useEffect(()=>{apiFetch<LedgerAccount[]>("/accounts").then(rows=>setLedgerAccounts(rows.filter(a=>a.isActive&&["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType)))).catch(()=>setLedgerAccounts([]));},[]);
 useEffect(()=>{apiFetch<CustomerTypeChoice[]>("/settings/customer-types?includeInactive=true").then(setCustomerTypes).catch(()=>setCustomerTypes([]));},[]);
 function openProfileEdit(){
  if(!c)return;
  setProfileName(c.fullName);setProfileMobile(c.mobile||"");
  setProfileTypeId(c.customerTypeId??customerTypes.find(t=>t.legacyType===c.customerType)?.id??"");
  setProfileNotes(c.notes||"");setProfileError("");setProfileEditing(true);
 }
 function openEbEditor(item?:EbConnection){
  setEbTarget(item||null);setEbOwnerName(item?.ownerName||"");setEbDraft(item?.referenceNumber||"");setEbError("");setEbEditing(true);
 }
 function openAepsEditor(item?:AepsAccount){
  setAepsTarget(item||null);setAepsHolder(item?.holderName||c?.fullName||"");setAepsBank(item?.bankName||"");setAepsPrNumber(item?.prNumber?.length===12?item.prNumber:"");setAepsError("");setAepsEditing(true);
 }
 async function saveAepsAccount(e:FormEvent){
  e.preventDefault();
  const holderName=aepsHolder.trim(),bankName=aepsBank.trim(),prNumber=aepsPrNumber.trim();
  if(!bankName||!holderName||bankName.length>150||holderName.length>150){setAepsError("Enter a bank and account holder name (up to 150 characters).");return;}
  if(!/^\d{12}$/.test(prNumber)){setAepsError("PR Number must contain exactly 12 digits.");return;}
  setBusy(true);setAepsError("");setError("");
  try{
   if(aepsTarget)await apiFetch("/customers/aeps-accounts/"+aepsTarget.id,{method:"PATCH",body:JSON.stringify({bankName,holderName,prNumber})});
   else await apiFetch("/customers/"+id+"/aeps-accounts",{method:"POST",body:JSON.stringify({bankName,holderName,prNumber})});
   await load();setAepsEditing(false);setAepsTarget(null);setMessage("AEPS account saved.");
  }catch(err){setAepsError(err instanceof Error?err.message:"Unable to save AEPS account.");}
  finally{setBusy(false);}
 }
 function openEsevaiEditor(item?:EsevaiService){
  setEsevaiTarget(item||null);setEsevaiName(item?.esevaiName||"");setEsevaiServiceName(item?.serviceName||"");setEsevaiError("");setEsevaiEditing(true);
  // Daily Cash uses this same catalog. Refresh on each open so newly configured services appear.
  setEsevaiCatalogStatus("loading");
  void apiFetch<CashServiceCatalogOption[]>("/settings/services")
    .then(rows=>{setEsevaiCatalog(rows.filter(row=>row.isActive!==false));setEsevaiCatalogStatus("loaded");})
    .catch(()=>{setEsevaiCatalog([]);setEsevaiCatalogStatus("error");});
 }
 async function saveEsevaiService(e:FormEvent){
  e.preventDefault();
  const name=esevaiName.trim(),service=esevaiServiceName.trim();
  if(!name||!service||name.length>150||service.length>150){setEsevaiError("Enter E-Sevai name and service (maximum 150 characters each).");return;}
  if(esevaiCatalogStatus!=="loaded"){setEsevaiError("Services are not loaded. Open the form again to retry.");return;}
  if(!esevaiCatalog.some(row=>row.name===service)&&esevaiTarget?.serviceName!==service){setEsevaiError("Choose a service from the Daily Cash service list.");return;}
  setBusy(true);setEsevaiError("");setError("");
  try{
   if(esevaiTarget)await apiFetch("/customers/esevai-services/"+esevaiTarget.id,{method:"PATCH",body:JSON.stringify({esevaiName:name,serviceName:service})});
   else await apiFetch("/customers/"+id+"/esevai-services",{method:"POST",body:JSON.stringify({esevaiName:name,serviceName:service})});
   await load();setEsevaiEditing(false);setEsevaiTarget(null);setMessage("E-Sevai details saved.");
  }catch(err){setEsevaiError(err instanceof Error?err.message:"Unable to save E-Sevai details.");}
  finally{setBusy(false);}
 }
 async function saveEbNumber(e:FormEvent){
  e.preventDefault();
  const ebNumber=ebDraft.trim();
  if(!ebNumber||ebNumber.length>50){setEbError("Enter an EB number up to 50 characters.");return;}
  if(!ebOwnerName.trim()||ebOwnerName.trim().length>150){setEbError("Enter a consumer name (maximum 150 characters).");return;}
  setBusy(true);setEbError("");setError("");
  try{
   if(ebTarget)await apiFetch("/customers/service-profiles/"+ebTarget.id,{method:"PATCH",body:JSON.stringify({referenceNumber:ebNumber,ownerName:ebOwnerName.trim()})});
   else await apiFetch("/customers/"+id+"/service-profiles",{method:"POST",body:JSON.stringify({serviceName:"Eb Bill",referenceNumber:ebNumber,ownerName:ebOwnerName.trim()})});
   await load();
   setEbEditing(false);setEbTarget(null);setMessage("EB connection saved.");
  }catch(err){setEbError(err instanceof Error?err.message:"Unable to save EB number.");}
  finally{setBusy(false);}
 }
 async function saveProfile(e:FormEvent){
  e.preventDefault();
  if(!profileTypeId){setProfileError("Select a customer type.");return;}
  setBusy(true);setProfileError("");
  try{
   await apiFetch("/customers/"+id,{method:"PATCH",body:JSON.stringify({
    fullName:profileName.trim(),mobile:profileMobile.trim()||undefined,customerTypeId:profileTypeId,notes:profileNotes.trim()||undefined,
   })});
   setProfileEditing(false);setMessage("Customer profile updated.");await load();
  }catch(err){setProfileError(err instanceof Error?err.message:"Unable to update customer.");}
  finally{setBusy(false);}
 }


 function resetLedgerEntry(){
  setLedgerPayoutDestination("");setLedgerPayoutDetails("");setLedgerPaidFromManual(false);setLedgerCashConfirmed(false);setLedgerEntryDirection(null);setLedgerEntryAmount("");setLedgerEntryDate(localDateValue());setLedgerEntryAccountId("");setLedgerEntryCardId("");setLedgerEntryRemarks("");setLedgerEntryReference("");setLedgerEntryNote("");setLedgerAllocations({});setLedgerEntryError("");
 }
 function openLedgerEntry(direction:LedgerEntryDirection){
  setLedgerPayoutDestination("");setLedgerPayoutDetails("");setLedgerPaidFromManual(false);setLedgerCashConfirmed(false);setLedgerEntryDirection(direction);setLedgerEntryAmount("");setLedgerEntryDate(localDateValue());setLedgerEntryAccountId("");setLedgerEntryCardId(ledgerCardId);setLedgerEntryRemarks("");setLedgerEntryReference("");setLedgerEntryNote("");setLedgerAllocations({});setLedgerEntryError("");
 }
 function matchingLedgerItems(direction=ledgerEntryDirection,cardId=ledgerEntryCardId){
  const items=direction==="PAY_IN"?(cardLedger?.openPayInItems??[]):(cardLedger?.openPayOutItems??[]);
  return cardId?items.filter(item=>item.cardId===cardId):items;
 }
 function suggestedLedgerAllocations(value:string,direction=ledgerEntryDirection,cardId=ledgerEntryCardId){
  let left=Number(value)||0;const next:Record<string,string>={};
  for(const item of matchingLedgerItems(direction,cardId)){if(left<=.001)break;const applied=Math.min(left,item.remainingAmount);if(applied>.001){next[item.targetId]=String(Math.round(applied*100)/100);left=Math.round((left-applied)*100)/100;}}
  return next;
 }
 async function submitLedgerEntry(e:FormEvent){
  e.preventDefault();if(!ledgerEntryDirection)return;
  const amount=Number(ledgerEntryAmount);
  if(!Number.isFinite(amount)||amount<=0){setLedgerEntryError("Enter a valid amount.");return;}
  if(!effectiveLedgerEntryAccountId){setLedgerEntryError(ledgerEntryDirection==="PAY_IN"?"Choose where the money was received.":"No usable Pay In source found. Choose where the money will be paid from.");return;}
  if(ledgerIsPhysicalCash&&!ledgerCashConfirmed){setLedgerEntryError("Confirm physical cash was actually received or handed over. Credit-card swipes must use Card Swipe instead.");return;}
  if(ledgerCashDestinationMismatch){setLedgerEntryError("Cash drawer payouts must be handed over in cash. For bank or UPI transfers, choose the real bank or wallet as Paid from.");return;}
  if(ledgerEntryDirection==="PAY_OUT"&&!ledgerPayoutDestination){setLedgerEntryError("Choose where the customer received this payout.");return;}
  if(ledgerEntryDirection==="PAY_OUT"&&ledgerPayoutDestination==="OTHER"&&!ledgerPayoutDetails.trim()){setLedgerEntryError("Enter who received the payout or the destination details.");return;}
  if(!ledgerEntryDate){setLedgerEntryError("Choose the entry date.");return;}
  if(ledgerEntryDate>localDateValue()){setLedgerEntryError("Entry date cannot be in the future.");return;}
  const openItems=matchingLedgerItems();
  const allocations=openItems.map(item=>({targetType:item.targetType,targetId:item.targetId,amount:Number(ledgerAllocations[item.targetId]||0)})).filter(item=>item.amount>0);
  const matched=Math.round(allocations.reduce((sum,item)=>sum+item.amount,0)*100)/100;
  if(matched>amount+.001){setLedgerEntryError("Matched amount cannot be more than the Pay In / Pay Out amount.");return;}
  setLedgerEntryBusy(true);setLedgerEntryError("");
  try{
   const [payoutKind,payoutId]=ledgerPayoutDestination.split(":");
   await apiFetch("/customers/"+id+"/card-ledger-entry",{method:"POST",body:JSON.stringify({direction:ledgerEntryDirection,amount,financialAccountId:effectiveLedgerEntryAccountId,physicalCashConfirmed:ledgerIsPhysicalCash?ledgerCashConfirmed:undefined,sourcePayInTransactionId:ledgerEntryDirection==="PAY_OUT"&&!ledgerPaidFromManual&&validPayOutSource?payOutSuggestion?.transactionId:undefined,customerCardId:ledgerEntryCardId||undefined,allocations,remarks:ledgerEntryRemarks.trim()||undefined,transactionAt:dateWithCurrentLocalTime(ledgerEntryDate),referenceNumber:ledgerEntryReference.trim()||undefined,notes:ledgerEntryNote.trim()||undefined,...(ledgerEntryDirection==="PAY_OUT"?{payoutDestinationType:payoutKind,payoutDestinationId:payoutId||undefined,payoutDestinationDetails:payoutKind==="OTHER"?ledgerPayoutDetails.trim():undefined}:{})})});
   const success=ledgerEntryDirection==="PAY_IN"?"Pay In recorded.":"Pay Out recorded.";
   resetLedgerEntry();setMessage(success);window.setTimeout(()=>setMessage(""),2500);
   await Promise.all([load(),loadCardLedger(ledgerCardId)]);
  }catch(err){setLedgerEntryError(err instanceof Error?err.message:"Failed to save ledger entry");}
  finally{setLedgerEntryBusy(false);}
 }

 async function run(action:()=>Promise<unknown>,success?:string){
  setBusy(true);setError("");setMessage("");
  try{await action();await load();if(success){setMessage(success);window.setTimeout(()=>setMessage(""),2500);}}
  catch(err){setError(err instanceof Error?err.message:"Update failed");throw err;}
  finally{setBusy(false);}
 }
 async function addCard(e:FormEvent){
  e.preventDefault();
  if(!/^\d{4}$/.test(cardLastFour)){setCardError("Enter the last 4 card digits.");return;}
  if(demoEnabled&&demoAddNumber && (!isSafeDemoNumber(demoAddNumber) || !demoAddNumber.endsWith(cardLastFour))){setCardError("Enter exactly 16 digits matching the saved last four.");return;}

  setBusy(true);setCardError("");
  try{
   await apiFetch("/customers/"+id+"/cards",{method:"POST",body:JSON.stringify({bankName:cardBank.trim(),cardType:"CREDIT",lastFourDigits:cardLastFour,nickname:cardNickname.trim()||undefined,...(demoEnabled&&demoAddNumber?{demoCardNumber:demoAddNumber}:{})})});
   setAddingCard(false);setCardBank("");setCardLastFour("");setCardNickname("");setDemoAddNumber("");
   setMessage("Card added.");
   await loadDemoStatus();
   await load();
  }catch(err){setCardError(err instanceof Error?err.message:"Could not save card.");}
  finally{setBusy(false);}
 }
 async function addBank(e:FormEvent){e.preventDefault();if(!bankName.trim()){setError("Choose a bank before saving.");return;}try{await run(()=>apiFetch("/customers/"+id+"/banks",{method:"POST",body:JSON.stringify({accountHolderName:holder,bankName,accountReference:accountRef,ifsc:ifsc||undefined})}),"Bank account added.");setHolder("");setBankName("");setAccountRef("");setIfsc("");setAddKind(null);}catch{}}
 async function addUpi(e:FormEvent){e.preventDefault();if(!upiName.trim()||(!upiId.trim()&&!upiMobile.trim())){setUpiError("Add a name and UPI ID or mobile number.");return;}setUpiError("");try{await run(()=>apiFetch("/customers/"+id+"/upi",{method:"POST",body:JSON.stringify({accountName:upiName,upiId:upiId||undefined,mobileNumber:upiMobile||undefined,providerName:upiProvider||undefined})}),"UPI account added.");setUpiName("");setUpiId("");setUpiMobile("");setUpiProvider("");setUpiError("");setAddKind(null);}catch{}}
 async function addBeneficiary(e:FormEvent){e.preventDefault();try{await run(()=>apiFetch("/customers/"+id+"/beneficiaries",{method:"POST",body:JSON.stringify({beneficiaryName,relationshipNote:relationship||undefined})}),"Beneficiary added.");setBeneficiaryName("");setRelationship("");setAddKind(null);}catch{}}
 async function addBeneficiaryAccount(e:FormEvent){e.preventDefault();if(bType==="BANK"&&!bBank.trim()){setError("Choose a bank before saving.");return;}try{await run(()=>apiFetch("/customers/beneficiaries/"+beneficiaryId+"/accounts",{method:"POST",body:JSON.stringify({accountType:bType,bankName:bBank||undefined,accountReference:bRef||undefined,ifsc:bIfsc||undefined,upiId:bUpi||undefined,mobileNumber:bMobile||undefined})}),"Recipient account added.");setBBank("");setBRef("");setBIfsc("");setBUpi("");setBMobile("");setAddKind(null);}catch{}}

 function beginEdit(next:Exclude<EditState,null>){
  setEdit(next);setError("");setEditError("");setEditDemoNumber("");
  if(next.kind==="card"){
   setE1(next.item.bankName);setE2(next.item.lastFourDigits);setE3("CREDIT");setE4(next.item.nickname||"");setE5("");
   if(demoEnabled && demoCardIds.includes(next.item.id))void loadEditCardNumber(next.item);
  }
  if(next.kind==="bank"){setE1(next.item.accountHolderName);setE2(next.item.bankName);setE3(next.item.accountReference);setE4(next.item.ifsc||"");setE5("");}
  if(next.kind==="upi"){setE1(next.item.accountName);setE2(next.item.upiId||"");setE3(next.item.mobileNumber||"");setE4(next.item.providerName||"");setE5("");}
  if(next.kind==="beneficiary"){setE1(next.item.beneficiaryName);setE2(next.item.relationshipNote||"");setE3(next.item.notes||"");setE4("");setE5("");}
  if(next.kind==="beneficiaryAccount"){setE1(next.item.accountType);setE2(next.item.bankName||"");setE3(next.item.accountReference||"");setE4(next.item.upiId||"");setE5(next.item.ifsc||"");}
 }
 function closeEdit(){
  editNumberRequestRef.current++;
  setEdit(null);setEditDemoNumber("");setEditOriginalNumber("");setEditNumberStatus("none");setShowEditNumber(false);setEditError("");
 }
 async function loadEditCardNumber(card:Card){
  const request=++editNumberRequestRef.current;
  setEditNumberStatus("loading");setEditError("");setEditDemoNumber("");setEditOriginalNumber("");
  try{
   const result=await apiFetch<{demoNumber:string}>("/customers/cards/"+card.id+"/view-demo-test-number",{method:"POST"});
   if(request!==editNumberRequestRef.current)return;
   if(!/^\d{16}$/.test(result.demoNumber)||!result.demoNumber.endsWith(card.lastFourDigits))throw new Error("Saved card number is unavailable or does not match this card.");
   setEditOriginalNumber(result.demoNumber);setEditDemoNumber(result.demoNumber);setEditNumberStatus("loaded");
  }catch(err){
   if(request===editNumberRequestRef.current){setEditNumberStatus("error");setEditError(err instanceof Error?err.message:"Could not load the card number.");}
  }
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();if(!edit)return;
  setEditError("");
  try{
   if(edit.kind==="card"){
    if(editNumberStatus==="loading")throw new Error("Please wait for the saved card number to load.");
    if(editNumberStatus==="error")throw new Error("Retry loading the saved card number before saving.");
    if(!/^\d{4}$/.test(e2))throw new Error("Enter the last four digits.");
    if(editDemoNumber && editDemoNumber!==editOriginalNumber){
     if(!demoEnabled||!isSafeDemoNumber(editDemoNumber)||editDemoNumber.slice(-4)!==e2)throw new Error("Enter exactly 16 digits matching the saved last four.");
     await run(()=>apiFetch("/customers/cards/"+edit.item.id+"/demo-test-number",{method:"POST",body:JSON.stringify({demoNumber:editDemoNumber,bankName:e1.trim(),nickname:e4.trim()})}),"Card number saved.");
     await loadDemoStatus();
    }else{
     await run(()=>apiFetch("/customers/cards/"+edit.item.id,{method:"PATCH",body:JSON.stringify({bankName:e1.trim(),lastFourDigits:e2,cardType:"CREDIT",nickname:e4.trim()||undefined})}),"Card updated.");
    }
   }
   else if(edit.kind==="bank"){if(!e2.trim())throw new Error("Choose a bank.");await run(()=>apiFetch("/customers/banks/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountHolderName:e1.trim(),bankName:e2.trim(),accountReference:e3.trim(),ifsc:e4.trim()||undefined})}),"Bank account updated.");}
   else if(edit.kind==="upi")await run(()=>apiFetch("/customers/upi/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountName:e1.trim(),upiId:e2.trim()||undefined,mobileNumber:e3.trim()||undefined,providerName:e4.trim()||undefined})}),"UPI account updated.");
   else if(edit.kind==="beneficiary")await run(()=>apiFetch("/customers/beneficiaries/"+edit.item.id,{method:"PATCH",body:JSON.stringify({beneficiaryName:e1.trim(),relationshipNote:e2.trim()||undefined,notes:e3.trim()||undefined})}),"Beneficiary updated.");
   else {if(e1==="BANK"&&!e2.trim())throw new Error("Choose a bank.");await run(()=>apiFetch("/customers/beneficiary-accounts/"+edit.item.id,{method:"PATCH",body:JSON.stringify({accountType:e1,bankName:e2.trim()||undefined,accountReference:e3.trim()||undefined,upiId:e4.trim()||undefined,ifsc:e5.trim()||undefined})}),"Recipient account updated.");}
   closeEdit();
  }catch(err){setEditError(err instanceof Error?err.message:"Could not save changes.");}
 }
 async function confirmToggle(){
  if(!toggleTarget)return;try{await run(()=>apiFetch(toggleTarget.path+"/active",{method:"PATCH",body:JSON.stringify({isActive:!toggleTarget.isActive})}),toggleTarget.isActive?"Item retired.":"Item reactivated.");setToggleTarget(null);}catch{}
 }
 if(!c)return <AppShell><PageLoader label="Loading customer profile…"/></AppShell>;
 const openPayable=c.payables.filter(x=>!["PAID","CANCELLED","REVERSED"].includes(x.status)).reduce((s,x)=>s+Number(x.remainingAmount),0);
 const openReceivable=c.receivables.filter(x=>!["RECEIVED","CANCELLED","REVERSED"].includes(x.status)).reduce((s,x)=>s+Number(x.remainingAmount),0);
 const primaryCard=c.cards.find(x=>x.isActive);
 const customerParam="customerId="+encodeURIComponent(c.id);
 const visibleTransactions=c.transactions.filter(t=>(!txStatusFilter||t.status===txStatusFilter)&&(!moneyStatusFilter||moneyStatus(t)?.key===moneyStatusFilter));
 const ledgerPositionLabel=cardLedger?.totals.position==="TO_PAY_CUSTOMER"?"Pay to customer":cardLedger?.totals.position==="TO_RECOVER_FROM_CUSTOMER"?"Customer to pay us":"Settled";
 const foundCards=c.cards.filter(x=>matchesSavedDetailSearch(savedSearch,[x.bankName,x.lastFourDigits,x.nickname,x.cardType]));
 const foundBanks=c.bankAccounts.filter(x=>matchesSavedDetailSearch(savedSearch,[x.bankName,x.accountHolderName,x.accountReference,x.ifsc]));
 const foundUpi=c.upiAccounts.filter(x=>matchesSavedDetailSearch(savedSearch,[x.accountName,x.upiId,x.mobileNumber,x.providerName]));
 const ebProfiles=Array.isArray(c.serviceProfiles)?c.serviceProfiles:null;
 const foundEb=(ebProfiles??[]).filter(x=>matchesSavedDetailSearch(savedSearch,[x.ownerName,x.referenceNumber]));
 const aepsAccounts=Array.isArray(c.aepsAccounts)?c.aepsAccounts:null;
 const foundAeps=(aepsAccounts??[]).filter(x=>matchesSavedDetailSearch(savedSearch,[x.bankName,x.holderName,x.prNumber,x.aadhaarLastSix]));
 const esevaiServices=Array.isArray(c.esevaiServices)?c.esevaiServices:null;
 const foundEsevai=(esevaiServices??[]).filter(x=>matchesSavedDetailSearch(savedSearch,[x.esevaiName,x.serviceName]));
 const foundBeneficiaries=c.beneficiaries.flatMap(b=>{
  const beneficiaryMatches=matchesSavedDetailSearch(savedSearch,[b.beneficiaryName,b.relationshipNote]);
  const accounts=beneficiaryMatches?b.accounts:b.accounts.filter(a=>matchesSavedDetailSearch(savedSearch,[b.beneficiaryName,b.relationshipNote,a.bankName,a.accountReference,a.ifsc,a.upiId,a.mobileNumber]));
  return beneficiaryMatches||accounts.length?[{...b,accounts}]:[];
 });
 const savedMatchCount=foundCards.length+foundBanks.length+foundUpi.length+foundEb.length+foundAeps.length+foundEsevai.length+foundBeneficiaries.length;
 const ledgerCardLabel=ledgerCardId?(cardLedger?.cards.find(card=>card.id===ledgerCardId)?.label??"Selected card"):"All cards";
 const payOutSuggestion=suggestedPayOutSource(cardLedger?.payInSources??[],ledgerEntryCardId,ledgerEntryDate);
 const validPayOutSource=payOutSuggestion?ledgerAccounts.find(account=>account.id===payOutSuggestion.financialAccountId):null;
 const payOutSourceAvailable=Boolean(validPayOutSource);
 const effectiveLedgerEntryAccountId=ledgerEntryDirection==="PAY_OUT"&&!ledgerPaidFromManual
   ?(payOutSourceAvailable?payOutSuggestion!.financialAccountId:"")
   :ledgerEntryAccountId;
 const ledgerIsPhysicalCash=ledgerAccounts.some(account=>account.id===effectiveLedgerEntryAccountId&&account.accountType==="CASH");
 const ledgerCashDestinationMismatch=ledgerIsPhysicalCash&&ledgerEntryDirection==="PAY_OUT"&&!!ledgerPayoutDestination&&ledgerPayoutDestination!=="CASH";
 const ledgerEntryValue=Number(ledgerEntryAmount)||0;
 const ledgerEntryStartingBalance=ledgerEntryCardId?(cardLedger?.rows.filter(row=>row.cardId===ledgerEntryCardId).reduce((sum,row)=>sum+row.credit-row.debit,0)??0):Number(cardLedger?.totals.balance??0);
 const ledgerEntryStartingLabel=ledgerEntryStartingBalance>0.001?"Pay to customer":ledgerEntryStartingBalance<-.001?"Customer to pay us":"Settled";
 const ledgerEntryPreview=ledgerEntryStartingBalance+(ledgerEntryDirection==="PAY_IN"?ledgerEntryValue:ledgerEntryDirection==="PAY_OUT"?-ledgerEntryValue:0);
 const ledgerEntryPreviewLabel=ledgerEntryPreview>0.001?"Pay to customer":ledgerEntryPreview<-.001?"Customer to pay us":"Settled";
 const ledgerMatchItems=matchingLedgerItems();
 const ledgerMatchedAmount=Math.round(ledgerMatchItems.reduce((sum,item)=>sum+Number(ledgerAllocations[item.targetId]||0),0)*100)/100;
 const ledgerUnallocatedAmount=Math.max(0,Math.round((ledgerEntryValue-ledgerMatchedAmount)*100)/100);
 function printCardLedger(){
  if(!cardLedger||!cardLedger.rows.length)return;
  const popup=window.open("","_blank","width=980,height=760");
  if(!popup)return;
  popup.opener=null;
  const rows=cardLedger.rows.map((row,index)=>"<tr><td>"+(index+1)+"</td><td>"+escapeHtml(new Date(row.at).toLocaleString("en-IN"))+"</td><td><b>"+escapeHtml(row.remarks)+"</b><small>"+escapeHtml(row.detail)+"<br>"+escapeHtml(row.transactionNumber)+(row.referenceNumber?" · Ref "+escapeHtml(row.referenceNumber):"")+"</small></td><td class='out'>"+(row.debit?escapeHtml(money(row.debit)):"—")+"</td><td class='in'>"+(row.credit?escapeHtml(money(row.credit)):"—")+"</td><td class='"+(row.closingBalance<0?"out":"in")+"'>"+escapeHtml(money(row.closingBalance))+"</td></tr>").join("");
  popup.document.write("<!doctype html><html><head><title>Card Ledger - "+escapeHtml(cardLedger.customer.fullName)+"</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{color:#087f7f;margin:0;font-size:22px}.sub{font-size:11px;margin-top:5px}.meta{margin:24px 0 12px;font-size:14px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.box{border:1px solid #cbd5e1;padding:9px}.box small{display:block;color:#64748b}.box b{font-size:16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;vertical-align:top}th{background:#ecfeff;color:#075985}td:nth-child(1){text-align:center;width:28px}td:nth-child(2){white-space:nowrap;width:110px}td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:right;white-space:nowrap;font-weight:700}small{display:block;color:#64748b;margin-top:3px;line-height:1.35}.out{color:#dc2626}.in{color:#15803d}.footer{margin-top:14px;border-top:2px solid #111;padding-top:8px;text-align:right;font-size:14px;font-weight:700}</style></head><body><h1>Customer Card Ledger</h1><div class='sub'>Card swipe, partial payout, card-due and Pay In / Pay Out running statement</div><div class='meta'><b>Name:</b> "+escapeHtml(cardLedger.customer.fullName)+"<br><b>Card:</b> "+escapeHtml(ledgerCardLabel)+"</div><div class='summary'><div class='box'><small>Total Debit (Out)</small><b class='out'>"+escapeHtml(money(cardLedger.totals.debit))+"</b></div><div class='box'><small>Total Credit (In)</small><b class='in'>"+escapeHtml(money(cardLedger.totals.credit))+"</b></div><div class='box'><small>Closing Balance</small><b class='"+(cardLedger.totals.balance<0?"out":cardLedger.totals.balance>0?"in":"")+"'>"+escapeHtml(money(cardLedger.totals.balance))+"</b><small class='"+(cardLedger.totals.balance<0?"out":cardLedger.totals.balance>0?"in":"")+"'>"+escapeHtml(ledgerPositionLabel)+"</small></div></div><table><thead><tr><th>No</th><th>Date</th><th>Remarks</th><th>Debit (Out)</th><th>Credit (In)</th><th>Cls Balance</th></tr></thead><tbody>"+rows+"</tbody></table><div class='footer "+(cardLedger.totals.balance<0?"out":cardLedger.totals.balance>0?"in":"")+"'>"+escapeHtml(ledgerPositionLabel)+" ₹ "+Math.abs(cardLedger.totals.balance).toLocaleString("en-IN",{maximumFractionDigits:2})+"</div></body></html>");
  popup.document.close();
  popup.focus();
  window.setTimeout(()=>popup.print(),250);
 }
 return <AppShell><PageFrame>
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
   <div className="min-w-0"><Link href="/customers" className="text-xs font-bold text-indigo-600">← Customers</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">{c.customerCode} · {c.customerTypeConfig?.name??c.customerType.replaceAll("_"," ")}</p><div className="mt-1 flex min-w-0 items-center gap-2"><h2 className="min-w-0 break-words text-2xl font-black tracking-tight sm:text-3xl">{c.fullName}</h2><CopyValueButton value={c.fullName} label="customer name"/></div><div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>{c.mobile||"No mobile"}{c.notes?" · "+c.notes:""}</span>{c.mobile?<CopyValueButton value={c.mobile} label="customer mobile number"/>:null}</div></div>
   <div className="flex shrink-0 flex-wrap items-center gap-2">
    <StatusBadge tone={c.isActive?"emerald":"slate"}>{c.isActive?"Active":"Inactive"}</StatusBadge>
    <button type="button" onClick={openProfileEdit} className="min-h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-bold">Edit profile</button>
    {c.isActive?<button type="button" onClick={()=>{setCardError("");setAddingCard(true);}} className="app-primary-button min-h-10 px-4 text-xs font-black">+ Save new card</button>:null}
   </div>
  </div>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}
  {message?<div className="fixed right-4 top-20 z-[90] rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{message}</div>:null}

  {c.isActive&&customerQuickRequest?<CustomerQuickCash modalOnly modalRequest={customerQuickRequest}
    onModalFinished={outcome=>{
      setCustomerQuickRequest(null);
      window.setTimeout(()=>quickFocusReturnRef.current?.focus(),0);
      if(outcome==="saved"){setMessage("Quick entry saved. Check Daily Cash for any pending settlement details.");void load().catch(()=>{});void loadCardLedger(ledgerCardId);}
    }}/>:null}
  {c.isActive?<Surface className="p-4 sm:p-5">
    <h3 className="text-base font-black">Quick entry for {c.fullName}</h3>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <button type="button" onClick={(event)=>{quickFocusReturnRef.current=event.currentTarget;setCustomerQuickRequest({customerId:id,action:"IN"});}} className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-3 text-center text-sm font-black text-white">↓ Cash In</button>
      <button type="button" onClick={(event)=>{quickFocusReturnRef.current=event.currentTarget;setCustomerQuickRequest({customerId:id,action:"OUT",cashOutType:"UPI_QR"});}} className="flex min-h-12 items-center justify-center rounded-xl bg-rose-600 px-3 text-center text-sm font-black text-white">↑ Cash Out</button>
      <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("cashledger:open-quick-card-swipe",{detail:{customerId:c.id}}))} className="col-span-2 flex min-h-12 items-center justify-center rounded-xl bg-indigo-600 px-3 text-center text-sm font-black text-white sm:col-span-1">▣ Card Swipe</button>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <button type="button" onClick={(event)=>{quickFocusReturnRef.current=event.currentTarget;setCustomerQuickRequest({customerId:id,action:"IN",entry:"SERVICE"});}} className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-center text-xs font-bold">Services</button>
      <button type="button" onClick={(event)=>{quickFocusReturnRef.current=event.currentTarget;setCustomerQuickRequest({customerId:id,action:"OUT",cashOutType:"AEPS"});}} className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-center text-xs font-bold">AEPS</button>
      <button type="button" onClick={(event)=>{quickFocusReturnRef.current=event.currentTarget;setCustomerQuickRequest({customerId:id,action:"OUT",cashOutType:"MICRO_ATM"});}} className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-center text-xs font-bold">Micro ATM</button>
      <button type="button" onClick={(event)=>{quickFocusReturnRef.current=event.currentTarget;setCustomerQuickRequest({customerId:id,action:"IN",entry:"EB_BILL"});}} className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-center text-xs font-bold">EB Bill</button>
    </div>
    <details className="mt-2 rounded-xl border border-[var(--border)]">
      <summary className="min-h-10 cursor-pointer select-none px-3 py-2.5 text-xs font-bold text-[var(--accent)]">More options</summary>
      <div className="grid gap-2 border-t border-[var(--border)] p-2 sm:grid-cols-2">
        <button type="button" onClick={(event)=>{quickFocusReturnRef.current=event.currentTarget;setCustomerQuickRequest({customerId:id,action:"RUSH"});}} className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--surface-soft)] px-3 text-center text-xs font-bold">Bulk Quick Entry</button>
        <Link href={"/transactions/cash-transfer?"+customerParam} className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--surface-soft)] px-3 text-center text-xs font-bold">Detailed Cash Transfer</Link>
        <Link href={"/transactions/aeps?"+customerParam} className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--surface-soft)] px-3 text-center text-xs font-bold">Detailed AEPS Settlement</Link>
        <Link href={"/transactions/micro-atm?"+customerParam} className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--surface-soft)] px-3 text-center text-xs font-bold">Detailed Micro ATM</Link>
      </div>
    </details>
  </Surface>:null}
  <nav aria-label="Customer profile sections" className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--surface-soft)] p-1.5">
   <button type="button" aria-current={view==="details"?"page":undefined} onClick={()=>switchView("details")} className={"min-h-11 rounded-xl px-3 text-sm font-bold transition-colors "+(view==="details"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Saved details</button>
   <button type="button" aria-current={view==="activity"?"page":undefined} onClick={()=>switchView("activity")} className={"min-h-11 rounded-xl px-3 text-sm font-bold transition-colors "+(view==="activity"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Activity & ledger</button>
  </nav>
  {view==="details"?<>
   {setupGuide?<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
    <p className="text-sm font-extrabold text-emerald-900">Customer saved ✓</p>
    <p className="mt-0.5 text-xs leading-5 text-emerald-800">Add a card, bank, UPI, recipient, EB number, AEPS or E-Sevai service now—or leave it for later.</p>
   </div>:null}
   <Surface className="p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black">Add customer details</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Choose only what you need. All optional.</p></div></div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
     <button type="button" onClick={()=>{setCardError("");setAddingCard(true);}} className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-bold">+ Card</button>
     <button type="button" onClick={()=>setAddKind("bank")} className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-bold">+ Bank</button>
     <button type="button" onClick={()=>setAddKind("upi")} className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-bold">+ UPI</button>
     <button type="button" onClick={()=>setAddKind("beneficiary")} className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-bold">+ Recipient</button>
     <button type="button" onClick={()=>openEbEditor()} disabled={!ebProfiles} title={!ebProfiles?"EB records currently unavailable from the server":undefined} className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-bold disabled:opacity-50">+ EB Number</button>
     <button type="button" onClick={()=>openAepsEditor()} disabled={!aepsAccounts} title={!aepsAccounts?"AEPS accounts currently unavailable from the server":undefined} className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-bold disabled:opacity-50">+ AEPS</button>
     <button type="button" onClick={()=>openEsevaiEditor()} disabled={!esevaiServices} title={!esevaiServices?"E-Sevai details currently unavailable from the server":undefined} className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-bold disabled:opacity-50">+ E-Sevai</button>
    </div>

   </Surface>
  </>:null}
  {view==="activity"?<>
  {c.isActive?<div className="flex justify-end">
   <Link href={"/transactions/cash-transfer?"+customerParam} className="inline-flex min-h-9 items-center text-[11px] font-bold text-[var(--accent)]">Advanced transaction form →</Link>
  </div>:null}

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
   <DetailStat label="To receive" value={money(openReceivable)} tone="emerald"/>
   <DetailStat label="To pay" value={money(openPayable)} tone="amber"/>
   <DetailStat label="Saved cards" value={c.cards.filter(x=>x.isActive).length} tone="indigo"/>
   <DetailStat label="Recipients" value={c.beneficiaries.filter(x=>x.isActive).length} tone="cyan"/>
  </div>

  <Surface className="overflow-hidden">
   <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <div><h3 className="text-sm font-black">Card Ledger</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Card swipes, partial payouts, card-due movements and manual Pay In / Pay Out in one running balance.</p></div>
    <div className="flex flex-wrap items-center gap-2">
     <button type="button" onClick={()=>openLedgerEntry("PAY_IN")} className="min-h-10 rounded-xl bg-emerald-700 px-3.5 text-xs font-black text-white shadow-sm">+ Pay In</button>
     <button type="button" onClick={()=>openLedgerEntry("PAY_OUT")} className="min-h-10 rounded-xl bg-rose-700 px-3.5 text-xs font-black text-white shadow-sm">− Pay Out</button>
     <SearchableSelect className="app-control min-w-[190px]" value={ledgerCardId} onChange={e=>setLedgerCardId(e.target.value)}><option value="">All cards</option>{c.cards.map(card=><option key={card.id} value={card.id}>{card.bankName+" •••• "+card.lastFourDigits+(card.nickname?" · "+card.nickname:"")}</option>)}</SearchableSelect>
     <button type="button" onClick={printCardLedger} disabled={!cardLedger?.rows.length} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-black disabled:opacity-40">Print statement</button>
    </div>
   </div>
   {ledgerError?<div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{ledgerError}</div>:null}
   {cardLedger?.availableAdvances?.length?<div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50/70 px-4 py-3">
    <div><p className="text-xs font-bold text-indigo-800">Earlier Pay Out available: {money(cardLedger.availableAdvances.reduce((sum,a)=>sum+a.remaining,0))}</p><p className="mt-1 text-[11px] text-indigo-700">Already sent to the customer. Apply to a later card swipe without paying again.</p></div>
    {cardLedger.openPayOutItems.some(item=>item.sourceKind==="CARD_SWIPE")?<Link href={"/payables/"+cardLedger.openPayOutItems.find(item=>item.sourceKind==="CARD_SWIPE")?.targetId} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700">Apply to swipe →</Link>:null}
   </div>:null}
   {ledgerLoading?<div className="p-5 text-sm font-semibold text-[var(--text-muted)]">Loading card ledger…</div>:cardLedger?.rows.length?<>
    <div className="grid grid-cols-1 gap-2 border-b border-[var(--border)] p-3 sm:grid-cols-3 sm:p-4">
     <div className="rounded-xl bg-rose-50 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Total Debit · Out</p><p className="money mt-1 text-lg font-black text-rose-700">{money(cardLedger.totals.debit)}</p></div>
     <div className="rounded-xl bg-emerald-50 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Total Credit · In</p><p className="money mt-1 text-lg font-black text-emerald-700">{money(cardLedger.totals.credit)}</p></div>
     <div className={"rounded-xl px-3 py-2.5 "+(cardLedger.totals.balance<0?"bg-rose-50":cardLedger.totals.balance>0?"bg-emerald-50":"bg-[var(--surface-soft)]")}><p className={"text-[10px] font-bold uppercase tracking-wide "+(cardLedger.totals.balance<0?"text-rose-600":cardLedger.totals.balance>0?"text-emerald-700":"text-[var(--text-muted)]")}>Closing Balance</p><p className={"money mt-1 text-lg font-black "+(cardLedger.totals.balance<0?"text-rose-700":cardLedger.totals.balance>0?"text-emerald-700":"")}>{money(cardLedger.totals.balance)}</p><p className={"mt-0.5 text-[10px] font-black "+(cardLedger.totals.balance<0?"text-rose-700":cardLedger.totals.balance>0?"text-emerald-700":"text-[var(--text-muted)]")}>{ledgerPositionLabel}</p></div>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2 text-[10px] font-black"><span className="text-[var(--text-muted)]">Closing balance:</span><span className="text-emerald-700">● Green = Pay to customer</span><span className="text-rose-700">● Red = Customer to pay us</span><span className="text-[var(--text-muted)]">● Zero = Settled</span></div>
    <div className="divide-y divide-[var(--border)] md:hidden">{cardLedger.rows.map(row=><Link key={row.id} href={transactionHref(row.transactionId, "/customers/"+id+"?tab=activity")} className="block p-3.5 hover:bg-[var(--surface-soft)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black">{row.remarks}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{new Date(row.at).toLocaleString("en-IN")} · {row.transactionNumber}</p><p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{row.detail}</p></div><div className="shrink-0 text-right">{row.debit?<p className="money text-sm font-black text-rose-600">−{money(row.debit)}</p>:null}{row.credit?<p className="money text-sm font-black text-emerald-700">+{money(row.credit)}</p>:null}<p className={"money mt-1 text-[10px] font-bold "+(row.closingBalance<0?"text-rose-600":row.closingBalance>0?"text-emerald-700":"text-[var(--text-muted)]")}>Bal {money(row.closingBalance)}</p></div></div></Link>)}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-xs"><thead className="bg-[var(--surface-soft)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="w-12 px-4 py-3 text-center">No</th><th className="w-36">Date</th><th>Remarks</th><th className="w-32 text-right text-rose-600">Debit (Out)</th><th className="w-32 text-right text-emerald-700">Credit (In)</th><th className="w-32 pr-4 text-right">Cls Balance</th></tr></thead><tbody>{cardLedger.rows.map((row,index)=><tr key={row.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-soft)]"><td className="px-4 py-3 text-center text-[var(--text-muted)]">{index+1}</td><td className="whitespace-nowrap text-[11px] text-[var(--text-muted)]"><p>{new Date(row.at).toLocaleDateString("en-IN")}</p><p>{new Date(row.at).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p></td><td className="py-3"><Link href={transactionHref(row.transactionId, "/customers/"+id+"?tab=activity")} className="font-black text-[var(--text)] hover:text-[var(--accent)]">{row.remarks}</Link><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{row.detail}</p><p className="mt-0.5 text-[9px] text-[var(--text-muted)]">{row.transactionNumber}{row.referenceNumber?" · Ref "+row.referenceNumber:""}</p></td><td className="money text-right font-black text-rose-600">{row.debit?money(row.debit):"—"}</td><td className="money text-right font-black text-emerald-700">{row.credit?money(row.credit):"—"}</td><td className={"money pr-4 text-right font-black "+(row.closingBalance<0?"text-rose-600":row.closingBalance>0?"text-emerald-700":"")}>{money(row.closingBalance)}</td></tr>)}</tbody></table></div>
   </>:<div className="p-4"><EmptyState title="No card ledger activity" description="Card swipes, payouts and card-due movements will appear here automatically."/></div>}
  </Surface>

  <Surface className="overflow-hidden">
   <PanelHeader title="Recent transactions" description={visibleTransactions.length+" of "+c.transactions.length+" recent transaction(s)"} action={<Link href={"/search?q="+encodeURIComponent(c.customerCode)} className="text-xs font-bold text-indigo-600">Search all →</Link>}/>
   <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2">
    <SearchableSelect className={control} value={txStatusFilter} onChange={e=>setTxStatusFilter(e.target.value)}><option value="">All transaction status</option>{["COMPLETED","PENDING","FAILED","CANCELLED","REVERSED"].map(x=><option key={x}>{x.replaceAll("_"," ")}</option>)}</SearchableSelect>
    <SearchableSelect className={control} value={moneyStatusFilter} onChange={e=>setMoneyStatusFilter(e.target.value)}><option value="">All payout / pay-in</option>{moneyStatusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</SearchableSelect>
   </div>
   {visibleTransactions.length?<><div className="space-y-2 p-3 md:hidden">{visibleTransactions.map(t=>{const ms=moneyStatus(t);return <Link key={t.id} href={transactionHref(t.id, "/customers/"+id+"?tab=activity")} className="block rounded-xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{t.transactionType.replaceAll("_"," ")} · {t.transactionNumber}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(t.transactionAt).toLocaleString("en-IN")}</p></div><strong className="shrink-0 text-sm">{money(t.grossAmount)}</strong></div><div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge tone={t.status==="COMPLETED"?"emerald":t.status==="REVERSED"?"rose":"amber"}>{t.status.replaceAll("_"," ")}</StatusBadge>{ms?<StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>:null}{ms?.dueAt?<span className="px-2 py-1 text-[10px] text-slate-400">Due {new Date(ms.dueAt).toLocaleDateString("en-IN")}</span>:null}</div></Link>})}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Transaction</th><th>Date</th><th className="text-right">Amount</th><th>Transaction status</th><th>Payout / Pay-in</th><th className="pr-5">Due date</th></tr></thead><tbody>{visibleTransactions.map(t=>{const ms=moneyStatus(t);return <tr key={t.id} className="border-t border-slate-100"><td className="px-5 py-3"><Link href={transactionHref(t.id, "/customers/"+id+"?tab=activity")} className="font-semibold text-indigo-600">{t.transactionType.replaceAll("_"," ")} · {t.transactionNumber}</Link></td><td className="text-xs text-slate-500">{new Date(t.transactionAt).toLocaleString("en-IN")}</td><td className="text-right font-semibold">{money(t.grossAmount)}</td><td><StatusBadge tone={t.status==="COMPLETED"?"emerald":t.status==="REVERSED"?"rose":"amber"}>{t.status.replaceAll("_"," ")}</StatusBadge></td><td>{ms?<StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>:<span className="text-slate-400">—</span>}</td><td className="pr-5 text-xs text-slate-500">{ms?.dueAt?new Date(ms.dueAt).toLocaleDateString("en-IN"):"—"}</td></tr>})}</tbody></table></div></>:<div className="p-4"><EmptyState title="No matching transactions"/></div>}
  </Surface>
  <div className="grid gap-4 lg:grid-cols-2">
   <Surface className="overflow-hidden"><PanelHeader title="Money to receive"  action={<Link href="/receivables" className="text-xs font-bold text-indigo-600">View all →</Link>}/><div className="divide-y divide-slate-100">{c.receivables.slice(0,5).map(x=><Link key={x.id} href={"/receivables/"+x.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{x.reason}</p><p className="text-[11px] text-slate-400">{x.status.replaceAll("_"," ")}{x.dueAt?" · "+new Date(x.dueAt).toLocaleDateString("en-IN"):""}</p></div><strong className="text-sm text-emerald-700">{money(x.remainingAmount)}</strong></Link>)}{!c.receivables.length?<div className="p-4"><EmptyState title="No receivables"/></div>:null}</div></Surface>
   <Surface className="overflow-hidden"><PanelHeader title="Money to pay"  action={<Link href="/payables" className="text-xs font-bold text-indigo-600">View all →</Link>}/><div className="divide-y divide-slate-100">{c.payables.slice(0,5).map(x=><Link key={x.id} href={"/payables/"+x.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"><div><p className="text-sm font-semibold">{x.status.replaceAll("_"," ")}</p><p className="text-[11px] text-slate-400">Due {new Date(x.dueAt).toLocaleDateString("en-IN")}</p></div><strong className="text-sm text-amber-700">{money(x.remainingAmount)}</strong></Link>)}{!c.payables.length?<div className="p-4"><EmptyState title="No payables"/></div>:null}</div></Surface>
  </div>

  </>:null}
  {view==="details"?<>
  <Surface className="p-3 sm:p-4">
   <label htmlFor="customer-saved-account-search" className="block text-sm font-black">Search saved accounts and details</label>

   <div className="relative mt-2.5">
    <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
    <input id="customer-saved-account-search" name="saved_accounts_search" type="search" inputMode="search" autoComplete="off" value={savedSearch} onChange={e=>setSavedSearch(e.target.value)} placeholder="Bank, UPI, EB, AEPS, E-Sevai name or service…" className="app-control w-full !pl-10 !pr-16"/>
    {savedSearch?<button type="button" onClick={()=>setSavedSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">Clear</button>:null}
   </div>
   {savedSearch.trim()?<p className="mt-2 text-xs font-semibold text-[var(--text-muted)]" role="status">{savedMatchCount} matching saved {savedMatchCount===1?"item":"items"} · Bank accounts: {foundBanks.length} of {c.bankAccounts.length}</p>:null}
  </Surface>
  <div className="grid gap-4 xl:grid-cols-3">
   <SavedList title="Saved cards" count={c.cards.length} matchingCount={savedSearch.trim()?foundCards.length:undefined} addLabel="Add card" onAdd={()=>{setCardError("");setDemoAddNumber("");setAddingCard(true);}}>{foundCards.length?foundCards.map(x=><SavedItem key={x.id} title={x.bankName+" •••• "+x.lastFourDigits} detail={(x.nickname?x.nickname+" · ":"")+"CREDIT · "+(x.isActive?"Active":"Inactive")} active={x.isActive} onEdit={()=>beginEdit({kind:"card",item:x})} onToggle={()=>setToggleTarget({path:"/customers/cards/"+x.id,isActive:x.isActive,label:"card"})} headerAction={demoEnabled&&x.isActive?(demoCardIds.includes(x.id)?<button type="button" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-indigo-100 bg-white px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50" onClick={()=>void copyDemoTestNumber(x)} disabled={copyLoadingId===x.id} title="Copy card number" aria-label="Copy card number"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>{copyLoadingId===x.id?"Wait…":"Copy"}</button>:<button type="button" className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" onClick={()=>beginEdit({kind:"card",item:x})} title="Add full card number" aria-label="Add full card number">Add number</button>):undefined}/>):<EmptyState title={savedSearch.trim()?"No matching cards":"No saved cards"}/>}</SavedList>
   <SavedList title="Bank accounts" count={c.bankAccounts.length} matchingCount={savedSearch.trim()?foundBanks.length:undefined} addLabel="Add bank" onAdd={()=>setAddKind("bank")}>{foundBanks.length?foundBanks.map(x=><BankSavedItem key={x.id} bank={x} onEdit={()=>beginEdit({kind:"bank",item:x})} onToggle={()=>setToggleTarget({path:"/customers/banks/"+x.id,isActive:x.isActive,label:"bank account"})}/>):<EmptyState title={savedSearch.trim()?"No matching bank accounts":"No bank accounts"}/>}</SavedList>
   <SavedList title="UPI accounts" count={c.upiAccounts.length} matchingCount={savedSearch.trim()?foundUpi.length:undefined} addLabel="Add UPI" onAdd={()=>setAddKind("upi")}>{foundUpi.length?foundUpi.map(x=><div key={x.id} className={!x.isActive?"rounded-xl bg-[var(--surface-soft)] p-3 opacity-60":"rounded-xl bg-[var(--surface-soft)] p-3"}><div className="flex items-center justify-between gap-2"><strong className="min-w-0 break-words text-sm">{x.accountName}</strong><div className="flex shrink-0 items-center gap-1"><CopyValueButton value={x.accountName} label="UPI account name"/><StatusBadge tone={x.isActive?"emerald":"slate"}>{x.isActive?"Active":"Inactive"}</StatusBadge></div></div><div className="mt-2 divide-y divide-[var(--border)] rounded-lg bg-[var(--surface)] px-3"><SavedCopyField label="UPI ID" value={x.upiId}/><SavedCopyField label="UPI mobile" value={x.mobileNumber}/><SavedCopyField label="Provider" value={x.providerName}/></div><div className="mt-2 flex gap-3"><button type="button" onClick={()=>beginEdit({kind:"upi",item:x})} className="text-xs font-bold text-indigo-600">Edit</button><button type="button" onClick={()=>setToggleTarget({path:"/customers/upi/"+x.id,isActive:x.isActive,label:"UPI account"})} className="text-xs font-bold text-[var(--text-muted)]">{x.isActive?"Retire":"Reactivate"}</button></div></div>):<EmptyState title={savedSearch.trim()?"No matching UPI accounts":"No UPI accounts"}/>}</SavedList>
  </div>
  <SavedList title="EB connections" count={ebProfiles?.length??0} statusText={!ebProfiles?"Unavailable from server":undefined} matchingCount={ebProfiles&&savedSearch.trim()?foundEb.length:undefined} addLabel={ebProfiles?"Add EB account":undefined} onAdd={()=>openEbEditor()}>{!ebProfiles?<p role="status" className="text-xs font-semibold text-amber-700">EB records could not be loaded from the current API. Other saved details remain available.</p>:foundEb.length?foundEb.map(x=><EbSavedItem key={x.id} connection={x} onEdit={()=>openEbEditor(x)} onToggle={()=>setToggleTarget({path:"/customers/service-profiles/"+x.id,isActive:x.isActive,label:"EB connection"})}/>):<EmptyState title={savedSearch.trim()?"No matching EB connections":"No EB connections saved"}/>}</SavedList>
  <SavedList title="AEPS accounts" count={aepsAccounts?.length??0} statusText={!aepsAccounts?"Unavailable from server":undefined} matchingCount={aepsAccounts&&savedSearch.trim()?foundAeps.length:undefined} addLabel={aepsAccounts?"Add AEPS account":undefined} onAdd={()=>openAepsEditor()}>{!aepsAccounts?<p role="status" className="text-xs font-semibold text-amber-700">AEPS account records are unavailable from the current API.</p>:foundAeps.length?foundAeps.map(x=><AepsSavedItem key={x.id} account={x} onEdit={()=>openAepsEditor(x)} onToggle={()=>setToggleTarget({path:"/customers/aeps-accounts/"+x.id,isActive:x.isActive,label:"AEPS account"})}/>):<EmptyState title={savedSearch.trim()?"No matching AEPS accounts":"No AEPS accounts saved"}/>}</SavedList>
  <SavedList title="E-Sevai services" count={esevaiServices?.length??0} statusText={!esevaiServices?"Unavailable from server":undefined} matchingCount={esevaiServices&&savedSearch.trim()?foundEsevai.length:undefined} addLabel={esevaiServices?"Add E-Sevai":undefined} onAdd={()=>openEsevaiEditor()}>{!esevaiServices?<p role="status" className="text-xs font-semibold text-amber-700">E-Sevai details are unavailable from the current API.</p>:foundEsevai.length?foundEsevai.map(x=><EsevaiSavedItem key={x.id} item={x} onEdit={()=>openEsevaiEditor(x)} onToggle={()=>setToggleTarget({path:"/customers/esevai-services/"+x.id,isActive:x.isActive,label:"E-Sevai service"})}/>):<EmptyState title={savedSearch.trim()?"No matching E-Sevai services":"No E-Sevai services saved"}/>}</SavedList>
  <Surface className="overflow-hidden">
   <PanelHeader title="Beneficiaries & family recipients" description={savedSearch.trim()?`${foundBeneficiaries.length} of ${c.beneficiaries.length} recipients match` : undefined} action={<div className="flex gap-2"><button onClick={()=>setAddKind("beneficiary")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">+ Recipient</button><button onClick={()=>setAddKind("beneficiaryAccount")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white">+ Account</button></div>}/>
   {foundBeneficiaries.length?<div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">{foundBeneficiaries.map(b=><div key={b.id} className={!b.isActive?"rounded-2xl border border-slate-200 p-4 opacity-60":"rounded-2xl border border-slate-200 p-4"}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><p className="break-words font-bold">{b.beneficiaryName}</p><CopyValueButton value={b.beneficiaryName} label="recipient name"/></div><p className="mt-0.5 text-[11px] text-slate-400">{b.relationshipNote||"Recipient"} · {b.isActive?"Active":"Inactive"}</p></div><div className="flex gap-1"><button onClick={()=>beginEdit({kind:"beneficiary",item:b})} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold">Edit</button><button onClick={()=>setToggleTarget({path:"/customers/beneficiaries/"+b.id,isActive:b.isActive,label:"beneficiary"})} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-500">{b.isActive?"Retire":"Reactivate"}</button></div></div>
    <div className="mt-3 space-y-2">{b.accounts.map(a=><div key={a.id} className={!a.isActive?"rounded-xl bg-[var(--surface-soft)] p-3 text-xs opacity-60":"rounded-xl bg-[var(--surface-soft)] p-3 text-xs"}>
     <div className="flex items-start justify-between gap-2"><p className="min-w-0 break-words font-bold">{a.accountType==="BANK"?"Bank account":"UPI account"}</p><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={()=>beginEdit({kind:"beneficiaryAccount",item:a})} className="font-bold text-indigo-600">Edit</button><button type="button" onClick={()=>setToggleTarget({path:"/customers/beneficiary-accounts/"+a.id,isActive:a.isActive,label:"recipient account"})} className="font-bold text-slate-500">{a.isActive?"Retire":"Reactivate"}</button></div></div>
     <div className="mt-2 divide-y divide-[var(--border)] rounded-lg bg-[var(--surface)] px-3 py-1.5">
      {a.accountType==="BANK"?<>
       <SavedCopyField label="Bank name" value={a.bankName}/>
       <SavedCopyField label="Account number" value={a.accountReference}/>
       <SavedCopyField label="IFSC code" value={a.ifsc}/>
      </>:<>
       <SavedCopyField label="UPI ID" value={a.upiId}/>
       <SavedCopyField label="Mobile number" value={a.mobileNumber}/>
      </>}
     </div>
    </div>)}</div>
   </div>)}</div>:<div className="p-4"><EmptyState title={savedSearch.trim()?"No matching recipients":"No beneficiaries saved"}/></div>}
  </Surface>
  </>:null}
  <Modal open={aepsEditing} title={aepsTarget?"Edit AEPS account":"Add AEPS account"} onClose={()=>{if(!busy)setAepsEditing(false);}} footer={<button type="submit" form="customer-aeps-account" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">{busy?"Saving…":"Save AEPS account"}</button>}>
   <form id="customer-aeps-account" onSubmit={saveAepsAccount} className="space-y-3">
    <Field label="Bank name"><input className={control} name="customer_aeps_bank" autoComplete="off" maxLength={150} value={aepsBank} onChange={e=>{setAepsBank(e.target.value);setAepsError("");}} placeholder="Bank name" autoFocus required/></Field>
    <Field label="Account holder name"><input className={control} name="customer_aeps_holder" autoComplete="name" maxLength={150} value={aepsHolder} onChange={e=>{setAepsHolder(e.target.value);setAepsError("");}} placeholder="Name" required/></Field>
    <Field label="PR Number (12 digits)"><input className={control} name="customer_aeps_pr_number" type="text" inputMode="numeric" autoComplete="off" maxLength={12} pattern="[0-9]{12}" value={aepsPrNumber} onChange={e=>{setAepsPrNumber(e.target.value.replace(/\D/g,"").slice(0,12));setAepsError("");}} placeholder="12-digit PR number" required/></Field>
    {aepsError?<p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{aepsError}</p>:null}
   </form>
  </Modal>
  <Modal open={esevaiEditing} title={esevaiTarget?"Edit E-Sevai service":"Add E-Sevai service"} onClose={()=>{if(!busy)setEsevaiEditing(false);}} footer={<button type="submit" form="customer-esevai-service" disabled={busy||esevaiCatalogStatus!=="loaded"||(!esevaiCatalog.length&&!esevaiTarget?.serviceName)} className="app-primary-button min-h-11 w-full font-bold">{busy?"Saving…":"Save E-Sevai service"}</button>}>
   <form id="customer-esevai-service" onSubmit={saveEsevaiService} className="space-y-3">
    <Field label="E-Sevai Name"><input className={control} name="customer_esevai_name" autoComplete="off" maxLength={150} value={esevaiName} onChange={e=>{setEsevaiName(e.target.value);setEsevaiError("");}} placeholder="E-Sevai name" autoFocus required/></Field>
    <Field label="Service"><SearchableSelect className={control} name="customer_esevai_service" value={esevaiServiceName} onChange={e=>{setEsevaiServiceName(e.target.value);setEsevaiError("");}} disabled={esevaiCatalogStatus!=="loaded"||(!esevaiCatalog.length&&!esevaiTarget?.serviceName)} searchPlaceholder="Search Daily Cash services…" required>
     <option value="">{esevaiCatalogStatus==="loading"?"Loading services…":esevaiCatalogStatus==="error"?"Unable to load services":"Select a service"}</option>
     {esevaiCatalog.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}
     {esevaiTarget?.serviceName&&!esevaiCatalog.some(row=>row.name===esevaiTarget.serviceName)?<option value={esevaiTarget.serviceName}>{esevaiTarget.serviceName} (previously saved)</option>:null}
    </SearchableSelect></Field>
    {esevaiCatalogStatus==="error"?<p role="alert" className="text-xs text-rose-700">Couldn't load services. Close and reopen to retry.</p>:esevaiCatalogStatus==="loaded"&&!esevaiCatalog.length?<p className="text-xs text-[var(--text-muted)]">No active services configured. <Link href="/settings" className="font-semibold text-indigo-700 underline">Add services in Settings</Link> to use them here.</p>:null}
    {esevaiError?<p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{esevaiError}</p>:null}
   </form>
  </Modal>
  <Modal open={ebEditing} title={ebTarget?"Edit EB account":"Add EB account"} onClose={()=>{if(!busy)setEbEditing(false);}} footer={<button type="submit" form="customer-eb-number" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">{busy?"Saving…":"Save EB account"}</button>}>
   <form id="customer-eb-number" onSubmit={saveEbNumber} className="space-y-3">
    <Field label="Consumer name"><input className={control} name="cashledger_eb_consumer_name" autoComplete="name" value={ebOwnerName} maxLength={150} onChange={e=>{setEbOwnerName(e.target.value);setEbError("");}} placeholder="Consumer name" autoFocus required/></Field>
    <Field label="EB number"><input className={control} name="customer_saved_eb_number" type="text" inputMode="numeric" autoComplete="off" maxLength={50} value={ebDraft} onChange={e=>{setEbDraft(e.target.value);setEbError("");}} placeholder="EB consumer number" required/></Field>

    {ebError?<p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{ebError}</p>:null}
   </form>
  </Modal>
  <Modal open={profileEditing} title="Edit customer"  onClose={()=>{if(!busy)setProfileEditing(false);}}
   footer={<button form="edit-customer-profile" disabled={busy||!profileTypeId} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{busy?"Saving…":"Save customer"}</button>}>
   <form id="edit-customer-profile" onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">
    <Field label="Customer name"><input className={control} name="cashledger_customer_name" autoComplete="name" value={profileName} onChange={e=>setProfileName(e.target.value)} maxLength={150} required/></Field>
    <Field label="Mobile"><input className={control} name="cashledger_customer_mobile" type="tel" autoComplete="tel" value={profileMobile} onChange={e=>setProfileMobile(e.target.value)} placeholder="Optional"/></Field>

    <Field label="Customer type"><SearchableSelect className={control} value={profileTypeId} onChange={e=>setProfileTypeId(e.target.value)} required><option value="">Choose type</option>{customerTypes.filter(type=>type.isActive||type.id===profileTypeId).map(type=><option key={type.id} value={type.id}>{type.name}{type.isActive?"":" (Retired)"}</option>)}</SearchableSelect></Field>
    <Field label="Notes"><input className={control} name="cashledger_notes" autoComplete="on" value={profileNotes} onChange={e=>setProfileNotes(e.target.value)} placeholder="Optional"/></Field>
    {profileError?<p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 sm:col-span-2">{profileError}</p>:null}
   </form>
  </Modal>
  <Modal open={addingCard} title="Add saved card" onClose={()=>{if(!busy)setAddingCard(false);}} footer={<button form="customer-add-card" disabled={busy||!cardBank.trim()||cardLastFour.length!==4} className="app-primary-button min-h-11 w-full font-bold disabled:opacity-50">{busy?"Saving…":"Save card"}</button>}>
   <form id="customer-add-card" onSubmit={addCard} className="grid gap-3 sm:grid-cols-2">
    <Field label="Card bank"><input className={control} name="cashledger_bank" autoComplete="on" value={cardBank} onChange={e=>setCardBank(e.target.value)} placeholder="Bank name" required/></Field>
    <Field label="Last 4 digits"><input className={control} name="cashledger_card_last_four" inputMode="numeric" autoComplete="on" maxLength={4} value={cardLastFour} onChange={e=>setCardLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="1234" required/></Field>
    <Field label="Nickname (optional)" className="sm:col-span-2"><input className={control} name="cashledger_nickname" autoComplete="on" value={cardNickname} onChange={e=>setCardNickname(e.target.value)} placeholder="e.g. Personal card"/></Field>
    {demoEnabled?<Field label="Card number (16 digits, optional)" className="sm:col-span-2"><input className={control} type="text" name="demo_card_number" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={16} value={demoAddNumber} onChange={e=>{const digits=e.target.value.replace(/\D/g,"").slice(0,16);setDemoAddNumber(digits);if(digits.length===16)setCardLastFour(digits.slice(-4));}} placeholder="Enter 16-digit number"/></Field>:null}
    {cardError?<p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:col-span-2">{cardError}</p>:null}
   </form>
  </Modal>
  <Modal open={!!copyFallbackCard} title="Copy" description="Tap Copy again to finish." onClose={clearCopyFallback} footer={<button type="button" onClick={()=>void copyReadyCardNumber()} className="app-primary-button min-h-11 w-full font-bold">Copy</button>}>
   <p className="text-sm text-[var(--text-muted)]">{copyFallbackCard?.bankName} •••• {copyFallbackCard?.lastFourDigits}</p>
   {copyError?<p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{copyError}</p>:null}
  </Modal>
  <Modal open={!!ledgerEntryDirection} title={ledgerEntryDirection==="PAY_IN"?"Pay In":"Pay Out"} description={ledgerEntryDirection==="PAY_IN"?"Money received from customer · adds Credit (In).":"Money paid to customer · adds Debit (Out)."} onClose={()=>{if(!ledgerEntryBusy)resetLedgerEntry();}} footer={<div className="grid grid-cols-2 gap-2"><button type="button" disabled={ledgerEntryBusy} onClick={resetLedgerEntry} className="app-secondary-button min-h-11 font-bold disabled:opacity-50">Cancel</button><button form="customer-ledger-entry" disabled={ledgerEntryBusy||!effectiveLedgerEntryAccountId||ledgerEntryValue<=0||(ledgerIsPhysicalCash&&(!ledgerCashConfirmed||ledgerCashDestinationMismatch))||(ledgerEntryDirection==="PAY_OUT"&&(!ledgerPayoutDestination||(ledgerPayoutDestination==="OTHER"&&!ledgerPayoutDetails.trim())))} className={"min-h-11 rounded-xl font-black text-white disabled:opacity-50 "+(ledgerEntryDirection==="PAY_IN"?"bg-emerald-700":"bg-rose-700")}>{ledgerEntryBusy?"Saving…":ledgerEntryDirection==="PAY_IN"?"Save Pay In":"Save Pay Out"}</button></div>}>
   <form id="customer-ledger-entry" onSubmit={submitLedgerEntry} className="space-y-4">
    <div className="grid grid-cols-2 gap-2">
     <div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Current balance</p><p className={"money mt-1 text-lg font-black "+(ledgerEntryStartingBalance<0?"text-rose-700":ledgerEntryStartingBalance>0?"text-emerald-700":"")}>{money(ledgerEntryStartingBalance)}</p><p className="mt-0.5 text-[10px] font-semibold text-[var(--text-muted)]">{ledgerEntryStartingLabel}</p></div>
     <div className={"rounded-xl p-3 "+(ledgerEntryPreview<0?"bg-rose-50":ledgerEntryPreview>0?"bg-emerald-50":"bg-[var(--surface-soft)]")}><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">After entry</p><p className={"money mt-1 text-lg font-black "+(ledgerEntryPreview<0?"text-rose-700":ledgerEntryPreview>0?"text-emerald-700":"")}>{money(ledgerEntryPreview)}</p><p className={"mt-0.5 text-[10px] font-black "+(ledgerEntryPreview<0?"text-rose-700":ledgerEntryPreview>0?"text-emerald-700":"text-[var(--text-muted)]")}>{ledgerEntryPreviewLabel}</p></div>
    </div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Processing a credit card? Use <Link href="/transactions/card-swipe" className="font-black underline">Card Swipe</Link> instead. Pay In / Pay Out here records actual money received or paid from the chosen account.</p>
    <div className="grid grid-cols-2 gap-3">
     <Field label="Amount"><input className={control} type="number" min="0.01" step="0.01" inputMode="decimal" value={ledgerEntryAmount} onChange={e=>{const value=e.target.value;setLedgerEntryAmount(value);setLedgerAllocations(suggestedLedgerAllocations(value,ledgerEntryDirection,ledgerEntryCardId));setLedgerEntryError("");}} placeholder="₹ 0.00" required/></Field>
     <Field label="Date"><input className={control} type="date" max={localDateValue()} value={ledgerEntryDate} onChange={e=>{setLedgerEntryDate(e.target.value);setLedgerEntryError("");}} required/></Field>
    </div>
    {ledgerEntryDirection==="PAY_OUT"&&!ledgerPaidFromManual&&validPayOutSource&&payOutSuggestion
     ?<div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
       <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-emerald-900">Paid from · Auto from Pay In</span><button type="button" onClick={()=>{setLedgerPaidFromManual(true);setLedgerEntryAccountId(payOutSuggestion.financialAccountId);setLedgerCashConfirmed(false);setLedgerEntryError("");}} className="min-h-9 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-bold text-emerald-800">Change</button></div>
       <p className="mt-1 text-base font-black text-emerald-900">{validPayOutSource.accountName} <span className="text-xs font-semibold">· {validPayOutSource.accountType.replaceAll("_"," ")}</span></p>
       <p className="mt-1 text-[11px] font-medium text-emerald-800">From <Link href={transactionHref(payOutSuggestion.transactionId, "/customers/"+id+"?tab=activity")} className="font-black underline">{payOutSuggestion.transactionNumber}</Link> · {new Date(payOutSuggestion.transactionAt).toLocaleDateString("en-IN")}. This account will be debited.</p>
      </div>
     :<div className="space-y-1">
       <Field label={ledgerEntryDirection==="PAY_IN"?"Received in (our account)":"Paid from (our account) *"}><SearchableSelect className={control} value={ledgerEntryAccountId} onChange={e=>{setLedgerEntryAccountId(e.target.value);setLedgerCashConfirmed(false);if(ledgerEntryDirection==="PAY_OUT")setLedgerPaidFromManual(true);setLedgerEntryError("");}}><option value="">Choose account…</option>{ledgerAccounts.map(account=><option key={account.id} value={account.id}>{account.accountName+" · "+account.accountType.replaceAll("_"," ")}</option>)}</SearchableSelect></Field>
       {ledgerEntryDirection==="PAY_OUT"?<div className="flex items-center justify-between gap-2">
         <p className="text-[11px] font-semibold text-amber-700">{ledgerPaidFromManual&&validPayOutSource?"Source manually changed.":"Auto source unavailable: choose a source account."}</p>
         {ledgerPaidFromManual&&validPayOutSource?<button type="button" onClick={()=>{setLedgerPaidFromManual(false);setLedgerEntryAccountId("");setLedgerCashConfirmed(false);setLedgerEntryError("");}} className="shrink-0 text-xs font-black text-[var(--accent)]">Use Pay In source</button>:null}
        </div>:null}
      </div>}
    {ledgerIsPhysicalCash?<div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950">
     <p className="font-black">This will change physical cash in the drawer.</p>
     <p className="mt-1">Only use a cash account when you physically received or handed over currency notes. Card swipes and bank/UPI transfers are not cash.</p>
     <label className="mt-2 flex cursor-pointer items-start gap-2 font-bold"><input className="mt-0.5 h-4 w-4 shrink-0 accent-rose-700" type="checkbox" checked={ledgerCashConfirmed} onChange={e=>{setLedgerCashConfirmed(e.target.checked);setLedgerEntryError("");}}/><span>I confirm that real physical cash was {ledgerEntryDirection==="PAY_IN"?"received in":"paid out from"} this drawer.</span></label>
     {ledgerCashDestinationMismatch?<p className="mt-2 font-bold text-rose-700">Bank/UPI destination selected: choose the actual bank or wallet under Paid from, not a cash drawer.</p>:null}
    </div>:null}
    {ledgerEntryDirection==="PAY_OUT"?<div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
     <Field label="Paid to (customer destination) *"><SearchableSelect className={control+" bg-[var(--surface)]"} value={ledgerPayoutDestination} onChange={e=>{setLedgerPayoutDestination(e.target.value);setLedgerPayoutDetails("");setLedgerEntryError("");}} required>
      <option value="">Choose where customer received money…</option>
      <option value="CASH">Cash handed to customer</option>
      {c.bankAccounts.filter(a=>a.isActive).map(a=><option key={a.id} value={"BANK:"+a.id}>{"Bank · "+a.accountHolderName+" · "+a.bankName+" ••••"+a.accountReference.replace(/\D/g,"").slice(-4)}</option>)}
      {c.upiAccounts.filter(a=>a.isActive).map(a=><option key={a.id} value={"UPI:"+a.id}>{"UPI · "+a.accountName+" · "+(a.upiId||a.mobileNumber||"Saved UPI")}</option>)}
      {c.beneficiaries.filter(b=>b.isActive).flatMap(b=>b.accounts.filter(a=>a.isActive).map(a=><option key={a.id} value={"BENEFICIARY_ACCOUNT:"+a.id}>{"Beneficiary · "+b.beneficiaryName+" · "+(a.bankName||a.upiId||"UPI")+" "+(a.accountReference?"••••"+a.accountReference.replace(/\D/g,"").slice(-4):a.mobileNumber||"")}</option>))}
      <option value="OTHER">Other / new recipient bank or UPI</option>
     </SearchableSelect></Field>
     {ledgerPayoutDestination==="OTHER"?<Field label="Recipient / destination details *"><input className={control+" bg-[var(--surface)]"} value={ledgerPayoutDetails} onChange={e=>{setLedgerPayoutDetails(e.target.value);setLedgerEntryError("");}} maxLength={160} placeholder="Recipient name, bank or UPI reference" required/></Field>:null}
     <p className="text-[11px] font-semibold text-[var(--text-muted)]">Paid from debits our account. Paid to records the recipient separately in the transaction and audit history.</p>
    </div>:null}
    <Field label="Card (optional)">{ledgerCardId?<div className={control+" flex items-center font-semibold"}>{c.cards.find(card=>card.id===ledgerCardId)?.bankName+" •••• "+c.cards.find(card=>card.id===ledgerCardId)?.lastFourDigits}</div>:<SearchableSelect className={control} value={ledgerEntryCardId} onChange={e=>{const cardId=e.target.value;setLedgerEntryCardId(cardId);setLedgerAllocations(suggestedLedgerAllocations(ledgerEntryAmount,ledgerEntryDirection,cardId));}}><option value="">Customer-level / all cards</option>{c.cards.filter(card=>card.isActive).map(card=><option key={card.id} value={card.id}>{card.bankName+" •••• "+card.lastFourDigits+(card.nickname?" · "+card.nickname:"")}</option>)}</SearchableSelect>}</Field>
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">Match outstanding <span className="font-semibold text-[var(--text-muted)]">(optional)</span></p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{ledgerEntryDirection==="PAY_IN"?"Apply this receipt to open Card Due principal.":"Apply this payment to open swipe/customer payables."}</p></div><button type="button" onClick={()=>setLedgerAllocations(suggestedLedgerAllocations(ledgerEntryAmount))} className="shrink-0 text-[10px] font-black text-[var(--accent)]">Auto oldest first</button></div>{ledgerMatchItems.length?<div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">{ledgerMatchItems.map(item=><div key={item.targetId} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2 rounded-lg bg-[var(--surface)] px-2.5 py-2 ring-1 ring-[var(--border)]"><div className="min-w-0"><p className="truncate text-[11px] font-black">{item.label}</p><p className="truncate text-[9px] text-[var(--text-muted)]">{item.cardLabel} · remaining {money(item.remainingAmount)}</p></div><input className="app-control h-9 px-2 text-right text-xs font-black" type="number" min="0" max={item.remainingAmount} step="0.01" inputMode="decimal" value={ledgerAllocations[item.targetId]??""} onChange={e=>setLedgerAllocations(prev=>({...prev,[item.targetId]:e.target.value}))} placeholder="0"/></div>)}</div>:<p className="mt-2 text-[11px] font-semibold text-[var(--text-muted)]">{ledgerEntryDirection==="PAY_IN"?"No open Card Due principal for this selection.":"No open customer payable for this selection."}</p>}<div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2 text-[10px] font-bold"><span>Matched {money(ledgerMatchedAmount)}</span><span className={ledgerUnallocatedAmount>.001?"text-amber-700":"text-emerald-700"}>Unallocated {money(ledgerUnallocatedAmount)}</span></div></div>
    <Field label="Remarks (optional)"><input name="cashledger_remarks_optional" autoComplete="on" className={control} value={ledgerEntryRemarks} onChange={e=>setLedgerEntryRemarks(e.target.value)} placeholder={ledgerEntryDirection==="PAY_IN"?"e.g. GPay received / cash received":"e.g. Cash given / GPay paid"}/></Field>
    <div className="grid grid-cols-2 gap-3">
     <Field label="Reference"><input className={control} value={ledgerEntryReference} onChange={e=>setLedgerEntryReference(e.target.value)} placeholder="UTR / ref (optional)"/></Field>
     <Field label="Note"><input name="cashledger_note" autoComplete="on" className={control} value={ledgerEntryNote} onChange={e=>setLedgerEntryNote(e.target.value)} placeholder="Optional"/></Field>
    </div>
    {ledgerEntryDirection==="PAY_IN"?<p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Pay In adds a green Credit (In). It reduces a red customer-due balance first; if it crosses zero, the excess becomes money payable to the customer.</p>:<p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">Pay Out adds a red Debit (Out). It reduces a green customer-credit balance first; if it crosses zero, the excess becomes money to recover from the customer.</p>}
    {ledgerEntryDirection==="PAY_OUT"&&ledgerAccounts.find(account=>account.id===ledgerEntryAccountId)?.accountType==="PROVIDER_WALLET"?<p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Configured provider-wallet payout charges are applied automatically and do not change the customer ledger amount.</p>:null}
    {ledgerEntryError?<p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{ledgerEntryError}</p>:null}
   </form>
  </Modal>
  <Modal open={addKind==="bank"} title="Add bank account"  onClose={()=>setAddKind(null)} footer={<button form="add-bank" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save bank account</button>}>
   <form id="add-bank" onSubmit={addBank} className="grid gap-3 sm:grid-cols-2"><Field label="Account holder"><input name="cashledger_account_holder" autoComplete="on" className={control} value={holder} onChange={e=>setHolder(e.target.value)} required/></Field><BankIfscPicker bankName={bankName} ifsc={ifsc} onBankChange={setBankName} onIfscChange={setIfsc}/><Field label="Account number / reference"><input autoComplete="on" name="cashledger_bank_account_number" className={control} value={accountRef} onChange={e=>setAccountRef(e.target.value)} required/></Field></form>
  </Modal>
  <Modal open={addKind==="upi"} title="Add named UPI ID" description="Save multiple UPI IDs under this customer. Name each destination (owner, tenant, home or shop)." onClose={()=>setAddKind(null)} footer={<button form="add-upi" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save UPI account</button>}>
   <form id="add-upi" onSubmit={addUpi} className="grid gap-3 sm:grid-cols-2"><Field label="Name / label (Home, owner, tenant)"><input name="cashledger_account_name" autoComplete="on" className={control} value={upiName} onChange={e=>setUpiName(e.target.value)} required/></Field><Field label="UPI ID"><input className={control} value={upiId} onChange={e=>setUpiId(e.target.value)}/></Field><Field label="Mobile"><input name="cashledger_mobile" autoComplete="on" className={control} value={upiMobile} onChange={e=>setUpiMobile(e.target.value)}/></Field><Field label="Provider"><input name="cashledger_provider" autoComplete="on" className={control} value={upiProvider} onChange={e=>setUpiProvider(e.target.value)} placeholder="GPay / PhonePe / etc."/></Field>{upiError?<p role="alert" className="text-xs font-bold text-rose-600 sm:col-span-2">{upiError}</p>:null}</form>
  </Modal>
  <Modal open={addKind==="beneficiary"} title="Add beneficiary"  onClose={()=>setAddKind(null)} footer={<button form="add-beneficiary" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save beneficiary</button>}>
   <form id="add-beneficiary" onSubmit={addBeneficiary} className="grid gap-3 sm:grid-cols-2"><Field label="Beneficiary name"><input name="cashledger_beneficiary_name" autoComplete="on" className={control} value={beneficiaryName} onChange={e=>setBeneficiaryName(e.target.value)} required/></Field><Field label="Relationship"><input name="cashledger_relationship" autoComplete="on" className={control} value={relationship} onChange={e=>setRelationship(e.target.value)} placeholder="Optional"/></Field></form>
  </Modal>
  <Modal open={addKind==="beneficiaryAccount"} title="Add recipient account"  onClose={()=>setAddKind(null)} footer={<button form="add-beneficiary-account" disabled={busy} className="app-primary-button min-h-11 w-full font-bold">Save recipient account</button>}>
   <form id="add-beneficiary-account" onSubmit={addBeneficiaryAccount} className="grid gap-3 sm:grid-cols-2"><Field label="Beneficiary"><SearchSelect value={beneficiaryId} onChange={setBeneficiaryId} options={c.beneficiaries.filter(b=>b.isActive).map(b=>({value:b.id,label:b.beneficiaryName,searchText:b.beneficiaryName}))} placeholder="Select beneficiary" searchPlaceholder="Search beneficiary…"/></Field><Field label="Account type"><SearchableSelect className={control} value={bType} onChange={e=>setBType(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></SearchableSelect></Field>{bType==="BANK"?<><BankIfscPicker bankName={bBank} ifsc={bIfsc} onBankChange={setBBank} onIfscChange={setBIfsc}/><Field label="Account reference"><input autoComplete="on" name="cashledger_bank_account_number" className={control} value={bRef} onChange={e=>setBRef(e.target.value)} required/></Field></>:<><Field label="UPI ID"><input className={control} value={bUpi} onChange={e=>setBUpi(e.target.value)} required/></Field><Field label="Mobile"><input name="cashledger_mobile" autoComplete="on" className={control} value={bMobile} onChange={e=>setBMobile(e.target.value)}/></Field></>}</form>
  </Modal>
  <Modal open={!!edit} title={edit?"Edit "+edit.kind.replace("beneficiaryAccount","recipient account"):"Edit saved detail"} onClose={()=>{if(!busy)closeEdit();}} footer={<button form="edit-saved-detail" disabled={busy||editNumberStatus==="loading"||editNumberStatus==="error"} className="min-h-11 w-full rounded-xl bg-indigo-700 font-bold text-white">Save changes</button>}>
   <form id="edit-saved-detail" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
    {edit?.kind==="card"?<>
     <Field label="Bank"><input name="cashledger_bank" autoComplete="on" className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field>
     <Field label="Nickname"><input name="cashledger_nickname" autoComplete="on" className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field>
     {demoEnabled?<Field label="Card number (16 digits)" className="sm:col-span-2">
      <div className="relative"><input className={control+" font-mono pr-20"} name="cashledger_demo_card_number" type={showEditNumber?"text":"password"} inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={16} disabled={editNumberStatus==="loading"||editNumberStatus==="error"} value={editDemoNumber} onChange={event=>{const digits=event.target.value.replace(/\D/g,"").slice(0,16);setEditDemoNumber(digits);setEditError("");if(digits.length===16)setE2(digits.slice(-4));else if(!digits)setE2(edit.item.lastFourDigits);}} placeholder={editNumberStatus==="loading"?"Loading saved number…":"Enter 16 digits"}/>
       {editNumberStatus==="loaded"?<button type="button" className="absolute inset-y-0 right-2 px-2 text-xs font-semibold text-indigo-700" onClick={()=>setShowEditNumber(v=>!v)} aria-label={showEditNumber?"Hide card number":"Show card number"}>{showEditNumber?"Hide":"Show"}</button>:null}
      </div>
      {editNumberStatus==="error"?<button type="button" className="mt-1 text-xs font-bold text-indigo-700" onClick={()=>void loadEditCardNumber(edit.item)}>Retry loading number</button>:null}
     </Field>:null}
     <Field label="Last 4 digits"><input autoComplete="off" name="cashledger_card_last_four" className={control} value={e2} onChange={e=>setE2(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} readOnly={Boolean(demoEnabled&&demoCardIds.includes(edit.item.id))} required/></Field>
     <Field label="Type"><div className={control+" flex items-center bg-slate-50 font-bold"}>CREDIT</div></Field>
    </>:null}
    {edit?.kind==="bank"?<><Field label="Account holder"><input name="cashledger_account_holder" autoComplete="on" className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><BankIfscPicker bankName={e2} ifsc={e4} onBankChange={setE2} onIfscChange={setE4}/><Field label="Account reference"><input autoComplete="on" name="cashledger_bank_account_number" className={control} value={e3} onChange={e=>setE3(e.target.value)} required/></Field></>:null}
    {edit?.kind==="upi"?<><Field label="Account name"><input name="cashledger_account_name" autoComplete="on" className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="UPI ID"><input className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Mobile"><input name="cashledger_mobile" autoComplete="on" className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field><Field label="Provider"><input name="cashledger_provider" autoComplete="on" className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {edit?.kind==="beneficiary"?<><Field label="Name"><input name="cashledger_name" autoComplete="on" className={control} value={e1} onChange={e=>setE1(e.target.value)} required/></Field><Field label="Relationship"><input name="cashledger_relationship" autoComplete="on" className={control} value={e2} onChange={e=>setE2(e.target.value)}/></Field><Field label="Notes" className="sm:col-span-2"><input name="cashledger_notes" autoComplete="on" className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field></>:null}
    {edit?.kind==="beneficiaryAccount"?<><Field label="Type"><SearchableSelect className={control} value={e1} onChange={e=>setE1(e.target.value)}><option value="BANK">Bank</option><option value="UPI">UPI</option></SearchableSelect></Field>{e1==="BANK"?<BankIfscPicker bankName={e2} ifsc={e5} onBankChange={setE2} onIfscChange={setE5}/>:null}<Field label="Account reference"><input autoComplete="on" name="cashledger_bank_account_number" className={control} value={e3} onChange={e=>setE3(e.target.value)}/></Field><Field label="UPI ID"><input className={control} value={e4} onChange={e=>setE4(e.target.value)}/></Field></>:null}
    {editError?<p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700 sm:col-span-2">{editError}</p>:null}
   </form>
  </Modal>
  <Modal open={!!toggleTarget} title={toggleTarget?.isActive?"Retire saved detail?":"Reactivate saved detail?"} description="Historical transactions are never removed." onClose={()=>setToggleTarget(null)} footer={<div className="grid grid-cols-2 gap-2"><button onClick={()=>setToggleTarget(null)} className="app-secondary-button min-h-11 font-bold">Cancel</button><button onClick={confirmToggle} disabled={busy} className="min-h-11 rounded-xl bg-slate-950 font-bold text-white">Confirm</button></div>}><p className="text-sm text-slate-600">{toggleTarget?.isActive?"Retire":"Reactivate"} this {toggleTarget?.label}?</p></Modal>
 </PageFrame></AppShell>;
}

function SavedList({title,count,matchingCount,statusText,addLabel,onAdd,children}:{title:string;count:number;matchingCount?:number;statusText?:string;addLabel?:string;onAdd?:()=>void;children:React.ReactNode}){
 return <Surface className="overflow-hidden"><PanelHeader title={title} description={statusText??(matchingCount!==undefined?`${matchingCount} of ${count} found`:count+" saved")} action={addLabel&&onAdd?<button onClick={onAdd} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">+ {addLabel}</button>:undefined}/><div className="space-y-2 p-3">{children}</div></Surface>;
}
function CopyValueButton({value,label,copyAll=false}:{value:string;label:string;copyAll?:boolean}){
 const [status,setStatus]=useState<"idle"|"copied"|"failed">("idle");
 useEffect(()=>{if(status==="idle")return;const timer=window.setTimeout(()=>setStatus("idle"),2200);return()=>window.clearTimeout(timer);},[status]);
 async function copy(){
  if(!value)return;
  let success=false;
  try{await navigator.clipboard.writeText(value);success=true;}
  catch{
   // Older browsers may not expose Clipboard API; fall back to a temporary input.
   const field=document.createElement("textarea");
   field.value=value;field.setAttribute("readonly","");
   field.style.position="fixed";field.style.opacity="0";
   document.body.appendChild(field);field.select();
   try{success=document.execCommand("copy");}catch{success=false;}
   field.remove();
  }
  setStatus(success?"copied":"failed");
 }
 return <button type="button" onClick={copy} title={"Copy "+label} aria-label={"Copy "+label} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-white text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
  {status==="copied"?<svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 5 5L20 7"/></svg>:<svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>}
  <span className="sr-only" role="status" aria-live="polite">{status==="copied"?"Copied":status==="failed"?"Copy failed":"Copy"}</span>
 </button>;
}
function SavedCopyField({label,value}:{label:string;value:string|null|undefined}){
 return <div className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
  <div className="min-w-0"><p className="text-[10px] font-semibold text-[var(--text-muted)]">{label}</p><p className="mt-0.5 break-all text-xs font-bold text-[var(--text)]">{value||"Not saved"}</p></div>
  {value?<CopyValueButton value={value} label={label.toLowerCase()}/>:null}
 </div>;
}
function BankSavedItem({bank,onEdit,onToggle}:{bank:Bank;onEdit:()=>void;onToggle:()=>void}){
 return <div className={!bank.isActive?"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 opacity-65":"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"}>
  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-black">{bank.bankName}</p></div><div className="flex shrink-0 items-center gap-1"><CopyValueButton value={formatBankCopyText(bank)} label="all bank details" copyAll/><StatusBadge tone={bank.isActive?"emerald":"slate"}>{bank.isActive?"Active":"Inactive"}</StatusBadge></div></div>
  <div className="mt-3 divide-y divide-[var(--border)] rounded-lg bg-[var(--surface)] px-3 py-1.5">
   <SavedCopyField label="Account holder name" value={bank.accountHolderName}/>
   <SavedCopyField label="Account number" value={bank.accountReference}/>
   <SavedCopyField label="IFSC code" value={bank.ifsc}/>
  </div>
  <div className="mt-3 flex items-center gap-3"><button type="button" onClick={onEdit} className="text-xs font-bold text-indigo-600">Edit</button><button type="button" onClick={onToggle} className="text-xs font-bold text-slate-500">{bank.isActive?"Retire":"Reactivate"}</button></div>
 </div>;
}
function AepsSavedItem({account,onEdit,onToggle}:{account:AepsAccount;onEdit:()=>void;onToggle:()=>void}){
 const displayNumber=account.prNumber||account.aadhaarLastSix||"";
 return <div className={!account.isActive?"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 opacity-60":"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"}>
  <div className="flex items-center justify-between gap-2">
   <p className="min-w-0 break-words text-sm font-black">AEPS account</p>
   <div className="flex shrink-0 items-center gap-1"><CopyValueButton value={"Bank: "+account.bankName+"\nName: "+account.holderName+"\n"+(account.prNumber?"PR Number: ":"Legacy reference: ")+displayNumber} label="all AEPS account details" copyAll/><StatusBadge tone={account.isActive?"emerald":"slate"}>{account.isActive?"Active":"Inactive"}</StatusBadge></div>
  </div>
  <div className="mt-3 divide-y divide-[var(--border)] rounded-lg bg-[var(--surface)] px-3 py-1.5">
   <SavedCopyField label="Bank name" value={account.bankName}/>
   <SavedCopyField label="Account holder name" value={account.holderName}/>
   <SavedCopyField label={account.prNumber?"PR Number":"Legacy 6-digit reference"} value={displayNumber}/>
  </div>
  <div className="mt-3 flex items-center gap-3"><button type="button" onClick={onEdit} className="text-xs font-bold text-indigo-600">Edit</button><button type="button" onClick={onToggle} className="text-xs font-bold text-slate-500">{account.isActive?"Retire":"Reactivate"}</button></div>
 </div>;
}
function EsevaiSavedItem({item,onEdit,onToggle}:{item:EsevaiService;onEdit:()=>void;onToggle:()=>void}){
 return <div className={!item.isActive?"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 opacity-60":"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"}>
  <div className="flex items-center justify-between gap-2">
   <p className="min-w-0 break-words text-sm font-black">{item.esevaiName}</p>
   <div className="flex shrink-0 items-center gap-1"><CopyValueButton value={"E-Sevai Name: "+item.esevaiName+"\nService: "+item.serviceName} label="all E-Sevai details" copyAll/><StatusBadge tone={item.isActive?"emerald":"slate"}>{item.isActive?"Active":"Inactive"}</StatusBadge></div>
  </div>
  <div className="mt-3 divide-y divide-[var(--border)] rounded-lg bg-[var(--surface)] px-3 py-1.5">
   <SavedCopyField label="E-Sevai Name" value={item.esevaiName}/>
   <SavedCopyField label="Service" value={item.serviceName}/>
  </div>
  <div className="mt-3 flex items-center gap-3"><button type="button" onClick={onEdit} className="text-xs font-bold text-indigo-600">Edit</button><button type="button" onClick={onToggle} className="text-xs font-bold text-slate-500">{item.isActive?"Retire":"Reactivate"}</button></div>
 </div>;
}
function EbSavedItem({connection,onEdit,onToggle}:{connection:EbConnection;onEdit:()=>void;onToggle:()=>void}){
 return <div className={!connection.isActive?"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 opacity-60":"rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"}>
  <div className="flex items-center justify-between gap-2">
   <p className="min-w-0 break-words text-sm font-black">EB account</p>
   <StatusBadge tone={connection.isActive?"emerald":"slate"}>{connection.isActive?"Active":"Inactive"}</StatusBadge>
  </div>
  <div className="mt-3 divide-y divide-[var(--border)] rounded-lg bg-[var(--surface)] px-3 py-1.5">
   <SavedCopyField label="Consumer name" value={connection.ownerName}/>
   <SavedCopyField label="EB number" value={connection.referenceNumber}/>
  </div>
  <div className="mt-3 flex items-center gap-3"><button type="button" onClick={onEdit} className="text-xs font-bold text-indigo-600">Edit</button><button type="button" onClick={onToggle} className="text-xs font-bold text-slate-500">{connection.isActive?"Retire":"Reactivate"}</button></div>
 </div>;
}
function SavedItem({title,detail,active,onEdit,onToggle,copyValue,copyLabel,headerAction}:{title:string;detail:string;active:boolean;onEdit:()=>void;onToggle:()=>void;copyValue?:string;copyLabel?:string;headerAction?:React.ReactNode}){
 return <div className={!active?"rounded-xl bg-slate-50 p-3 opacity-60":"rounded-xl bg-slate-50 p-3"}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-1.5"><p className="min-w-0 break-all text-sm font-bold">{title}</p></div><p className="mt-0.5 break-all text-[11px] text-slate-500">{detail}</p></div><div className="flex shrink-0 items-center gap-1">{copyValue?<CopyValueButton value={copyValue} label={copyLabel||"value"}/>:null}{headerAction}<StatusBadge tone={active?"emerald":"slate"}>{active?"Active":"Inactive"}</StatusBadge></div></div><div className="mt-2 flex gap-2"><button onClick={onEdit} className="text-xs font-bold text-indigo-600">Edit</button><button onClick={onToggle} className="text-xs font-bold text-slate-400">{active?"Retire":"Reactivate"}</button></div></div>;
}
