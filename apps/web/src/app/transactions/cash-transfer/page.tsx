"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Field, PageLoader, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Customer={
  id:string;fullName:string;mobile?:string|null;
  bankAccounts:{id:string;bankName:string;accountReference:string;isActive:boolean}[];
  upiAccounts:{id:string;accountName:string;upiId:string|null;mobileNumber:string|null;isActive:boolean}[];
  beneficiaries:{id:string;beneficiaryName:string;isActive:boolean;accounts:{id:string;accountType:string;bankName:string|null;accountReference:string|null;upiId:string|null;mobileNumber:string|null;isActive:boolean}[]}[];
};
type Account={id:string;accountName:string;accountType:string;currentBalance:number;isActive?:boolean};
type CustomerMode="SEARCH"|"NEW";
type DestinationMode="SAVED"|"NEW";
type RecipientScope="SELF"|"OTHER";
type DestinationType="UPI"|"BANK";
type ReceiptAllocation={accountId:string;amount:number};
type CommissionMode="DEFAULT"|"MANUAL"|"NONE";
type Created={id:string};

const money=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number.isFinite(v)?v:0);
const typeLabel=(t:string)=>t==="CASH"?"Cash":t==="UPI"?"UPI / QR":t==="BANK"?"Bank":t==="PROVIDER_WALLET"?"Wallet":t==="OWNER_CREDIT_CARD"?"Credit card":t;
const mobileDigits=(v:string)=>v.replace(/\D/g,"").slice(-10);
function formatAmountInput(value:string){
  if(!value)return "";
  const [whole="",dec]=value.split(".");
  const digits=whole.replace(/\D/g,"");
  const formatted=digits?Number(digits).toLocaleString("en-IN"):"";
  return dec!==undefined?formatted+"."+dec:formatted;
}
function cleanAmountInput(value:string){
  const cleaned=value.replace(/,/g,"").replace(/[^\d.]/g,"");
  const first=cleaned.indexOf(".");
  if(first<0)return cleaned;
  return cleaned.slice(0,first+1)+cleaned.slice(first+1).replace(/\./g,"").slice(0,2);
}

function TransferSummary({
  customerName,customerGives,recipientGets,commission,receivedInto,commissionInto,commissionSeparate,sourceName,sourceType,ready,
}:{
  customerName:string;customerGives:number;recipientGets:number;commission:number;
  receivedInto:string;commissionInto:string;commissionSeparate:boolean;sourceName:string;sourceType:string;ready:boolean;
}){
  const total=ready?money(customerGives):"—";
  const totalSize=total.length>13?"result-total-compact":total.length>10?"result-total-medium":"";
  return <div className="swipe-result-card rounded-2xl border border-[var(--border)] p-4 sm:p-5">
    <div className="swipe-result-head grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-muted)]">{customerName?customerName+" gives":"Customer gives"}</p>
        <p className={"money result-total mt-1 font-black leading-none tracking-[-.045em] "+totalSize}>{total}</p>
      </div>
      <div className="swipe-result-earn max-w-[122px] rounded-xl bg-[color-mix(in_srgb,var(--money-in)_10%,transparent)] px-3 py-2 text-right">
        <p className="text-[10px] font-semibold text-[var(--text-muted)]">You earn</p>
        <p className="money result-earn mt-0.5 font-extrabold text-[var(--money-in)]">{money(commission)}</p>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-[var(--text-muted)]">Recipient gets</p>
        <p className="money result-metric mt-1 font-bold">{ready?money(recipientGets):"—"}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-[var(--text-muted)]">Send from</p>
        <p className="mt-1 truncate text-xs font-bold">{sourceName||"—"}</p>
        {sourceType?<p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{typeLabel(sourceType)}</p>:null}
      </div>
    </div>
    {receivedInto?<div className="mt-3 border-t border-[var(--border)] pt-3 text-[11px]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[var(--text-muted)]">{commissionSeparate?"Transfer received into":"Received into"}</span>
        <strong className="max-w-[190px] text-right">{receivedInto}</strong>
      </div>
      {commissionSeparate&&commission>0&&commissionInto?<div className="mt-1.5 flex items-start justify-between gap-3">
        <span className="text-[var(--text-muted)]">Commission into</span>
        <strong className="max-w-[190px] text-right text-[var(--money-in)]">{commissionInto}</strong>
      </div>:null}
    </div>:null}
  </div>;
}

export default function CashTransferPage(){
  const router=useRouter();
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [openCashAccountIds,setOpenCashAccountIds]=useState<string[]>([]);
  const [openCashSessions,setOpenCashSessions]=useState<Record<string,{openingTotal?:number|string;liveExpectedClosingTotal?:number|string}>>({});

  const [customerMode,setCustomerMode]=useState<CustomerMode>("SEARCH");
  const [customerSearch,setCustomerSearch]=useState("");
  const [customerId,setCustomerId]=useState("");
  const [newName,setNewName]=useState("");
  const [newMobile,setNewMobile]=useState("");

  const [destinationMode,setDestinationMode]=useState<DestinationMode>("SAVED");
  const [savedDestination,setSavedDestination]=useState("");
  const [recipientScope,setRecipientScope]=useState<RecipientScope>("SELF");
  const [recipientName,setRecipientName]=useState("");
  const [destinationType,setDestinationType]=useState<DestinationType>("UPI");
  const [destinationValue,setDestinationValue]=useState("");
  const [bankName,setBankName]=useState("");
  const [ifsc,setIfsc]=useState("");

  const [amount,setAmount]=useState("");
  const [method,setMethod]=useState("ADD_ON");
  const [commissionMode,setCommissionMode]=useState<CommissionMode>("DEFAULT");
  const [rate,setRate]=useState("0"),[defaultRate,setDefaultRate]=useState("0");

  const [receiptAccountId,setReceiptAccountId]=useState("");
  const [commissionReceiptAccountId,setCommissionReceiptAccountId]=useState("SAME");
  const [sourceAccountId,setSourceAccountId]=useState("");
  const [role]=useState(()=>{if(typeof window==="undefined")return "";try{return JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"";}catch{return "";}}); 

  const [reference,setReference]=useState("");
  const [notes,setNotes]=useState("");
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);

  async function refreshCashSessions(rows:Account[]){
    const cashRows=rows.filter(account=>account.accountType==="CASH"&&account.isActive!==false);
    const open=await Promise.all(cashRows.map(async account=>{
      try{
        const session=await apiFetch<{id:string;openingTotal?:number|string;liveExpectedClosingTotal?:number|string}|null>("/cash-counter/current?cashAccountId="+encodeURIComponent(account.id));
        return session?{accountId:account.id,session}:null;
      }catch{return null;}
    }));
    const openRows=open.filter((row):row is {accountId:string;session:{id:string;openingTotal?:number|string;liveExpectedClosingTotal?:number|string}}=>Boolean(row));
    setOpenCashAccountIds(openRows.map(row=>row.accountId));
    setOpenCashSessions(Object.fromEntries(openRows.map(row=>[row.accountId,row.session])));
  }

  useEffect(()=>{
    document.body.classList.add("cashledger-modern-task");
    Promise.all([
      apiFetch<Customer[]>("/customers"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<{commissionRate:string}|null>("/settings/commission-rules/resolve?transactionType=CASH_TRANSFER"),
    ]).then(async([c,a,rule])=>{
      setCustomers(c);
      setAccounts(a);
      if(rule){const resolved=String(Number(rule.commissionRate));setRate(resolved);setDefaultRate(resolved);}

      const preset=new URLSearchParams(window.location.search).get("customerId");
      const presetCustomer=c.find(x=>x.id===preset);
      if(presetCustomer){
        setCustomerId(presetCustomer.id);
        setCustomerSearch(presetCustomer.fullName+(presetCustomer.mobile?" · "+presetCustomer.mobile:""));
        const hasSaved=presetCustomer.bankAccounts.some(x=>x.isActive)||presetCustomer.upiAccounts.some(x=>x.isActive)||presetCustomer.beneficiaries.some(x=>x.isActive);
        if(!hasSaved)setDestinationMode("NEW");
      }

      const cash=a.find(x=>x.accountType==="CASH"&&x.isActive!==false);
      setReceiptAccountId(cash?.id??"__CASH__");
      await refreshCashSessions(a);
    }).catch(()=>setError("Failed to load transfer form")).finally(()=>setLoading(false));
    return()=>document.body.classList.remove("cashledger-modern-task");
  },[]);

  useEffect(()=>{
    const refresh=()=>{if(accounts.length)refreshCashSessions(accounts).catch(()=>{});};
    window.addEventListener("focus",refresh);
    return()=>window.removeEventListener("focus",refresh);
  },[accounts]);

  const customer=customers.find(c=>c.id===customerId);
  const searchNeedle=customerSearch.trim().toLowerCase();
  const searchDigits=mobileDigits(customerSearch);
  const customerMatches=searchNeedle?customers.filter(c=>
    c.fullName.toLowerCase().includes(searchNeedle)||
    (!!searchDigits&&(c.mobile??"").includes(searchDigits))
  ).slice(0,8):[];

  const possibleExisting=useMemo(()=>{
    const name=newName.trim().toLowerCase();
    const mobile=mobileDigits(newMobile);
    if(!name&&!mobile)return [];
    return customers.filter(c=>
      (!!name&&c.fullName.toLowerCase().includes(name))||
      (!!mobile&&(c.mobile??"").includes(mobile))
    ).slice(0,4);
  },[customers,newName,newMobile]);

  const savedOptions=useMemo(()=>{
    if(!customer)return [] as {value:string;label:string}[];
    const ownBanks=customer.bankAccounts.filter(x=>x.isActive).map(x=>({value:"BANK:"+x.id,label:"My bank · "+x.bankName+" · "+x.accountReference}));
    const ownUpi=customer.upiAccounts.filter(x=>x.isActive).map(x=>({value:"UPI:"+x.id,label:"My UPI · "+(x.upiId||x.mobileNumber||x.accountName)}));
    const beneficiaries=customer.beneficiaries.filter(x=>x.isActive).flatMap(b=>
      b.accounts.filter(a=>a.isActive).map(a=>({
        value:"BEN:"+b.id+":"+a.id,
        label:b.beneficiaryName+" · "+(a.accountType==="BANK"?(a.bankName+" · "+(a.accountReference||"")):(a.upiId||a.mobileNumber||"UPI")),
      }))
    );
    return [...ownUpi,...ownBanks,...beneficiaries];
  },[customer]);

  useEffect(()=>{
    if(!customerId)return;
    const q=new URLSearchParams({transactionType:"CASH_TRANSFER",customerId});
    apiFetch<{commissionRate:string}|null>("/settings/commission-rules/resolve?"+q.toString())
      .then(rule=>{if(rule){const resolved=String(Number(rule.commissionRate));setDefaultRate(resolved);if(commissionMode==="DEFAULT")setRate(resolved);}})
      .catch(()=>{});
  },[customerId]);

  useEffect(()=>{
    const refresh=()=>{
      if(customerId)return;
      apiFetch<{commissionRate:string}|null>("/settings/commission-rules/resolve?transactionType=CASH_TRANSFER")
        .then(rule=>{const resolved=String(Number(rule?.commissionRate||0));setDefaultRate(resolved);if(commissionMode==="DEFAULT")setRate(resolved);})
        .catch(()=>{});
    };
    const onStorage=(event:StorageEvent)=>{if(event.key==="cashledger_settings_updated_at")refresh();};
    window.addEventListener("focus",refresh);
    window.addEventListener("storage",onStorage);
    return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("storage",onStorage);};
  },[customerId]);

  const activeAccounts=accounts.filter(a=>a.isActive!==false);
  const activeCashAccounts=activeAccounts.filter(a=>a.accountType==="CASH");
  const activeCash=activeCashAccounts[0];
  const anyCash=accounts.find(a=>a.accountType==="CASH");
  const receiptAccounts=activeAccounts.filter(a=>["CASH","UPI","BANK"].includes(a.accountType));
  const virtualCash:Account=activeCash??{id:"__CASH__",accountName:anyCash?.accountName??"Cash Drawer",accountType:"CASH",currentBalance:anyCash?.currentBalance??0,isActive:true};
  const receiptOptions=activeCashAccounts.length
    ? receiptAccounts
    : [virtualCash,...receiptAccounts.filter(a=>a.accountType!=="CASH")];
  const selectedReceipt=receiptOptions.find(a=>a.id===receiptAccountId);
  const selectedCommissionReceipt=commissionReceiptAccountId==="SAME"?selectedReceipt:receiptOptions.find(a=>a.id===commissionReceiptAccountId);
  const sourceAccount=activeAccounts.find(a=>a.id===sourceAccountId);
  const canConfigureCash=role==="OWNER"||role==="ADMIN";

  const requested=Number(amount||0);
  const commission=requested*Number(rate||0)/100;
  const customerPays=method==="ADD_ON"?requested+commission:requested;
  const recipientGets=method==="ADD_ON"?requested:requested-commission;
  const commissionSeparate=method==="ADD_ON"&&commission>0&&commissionReceiptAccountId!=="SAME";

  const customerReady=customerMode==="SEARCH"?Boolean(customerId):Boolean(newName.trim());
  const destinationReady=destinationMode==="SAVED"
    ? Boolean(savedDestination)
    : Boolean(destinationValue.trim()&&(recipientScope==="SELF"||recipientName.trim())&&(destinationType==="UPI"||bankName.trim()));
  const commissionUsesCash=method==="ADD_ON"&&commission>0&&(
    commissionReceiptAccountId==="__CASH__"||
    (commissionReceiptAccountId==="SAME"&&receiptAccountId==="__CASH__")
  );
  const needsCashSetup=!activeCash&&(receiptAccountId==="__CASH__"||commissionUsesCash);
  const receiptAmount=method==="ADD_ON"?(commissionSeparate?requested:customerPays):customerPays;
  const receiptCashReady=selectedReceipt?.accountType!=="CASH"||openCashAccountIds.includes(selectedReceipt.id);
  const commissionCashReady=!commissionSeparate||selectedCommissionReceipt?.accountType!=="CASH"||openCashAccountIds.includes(selectedCommissionReceipt.id);
  const cashReady=!needsCashSetup&&receiptCashReady&&commissionCashReady;
  const selectedReceiptCashSession=selectedReceipt?.accountType==="CASH"?openCashSessions[selectedReceipt.id]:undefined;
  const selectedReceiptCashCurrent=selectedReceipt?.accountType==="CASH"
    ?Number(selectedReceiptCashSession?.liveExpectedClosingTotal??selectedReceiptCashSession?.openingTotal??selectedReceipt.currentBalance)
    :null;
  const selectedCommissionCashSession=selectedCommissionReceipt?.accountType==="CASH"?openCashSessions[selectedCommissionReceipt.id]:undefined;
  const selectedCommissionCashCurrent=selectedCommissionReceipt?.accountType==="CASH"
    ?Number(selectedCommissionCashSession?.liveExpectedClosingTotal??selectedCommissionCashSession?.openingTotal??selectedCommissionReceipt.currentBalance)
    :null;
  const receiptCashAfter=selectedReceiptCashCurrent!==null
    ?selectedReceiptCashCurrent+receiptAmount
    :null;
  const commissionCashAfter=commissionSeparate&&selectedCommissionCashCurrent!==null
    ?selectedCommissionCashCurrent+commission
    :null;
  const incomingToSource=sourceAccount?(
    (receiptAccountId===sourceAccount.id?(method==="ADD_ON"?requested:customerPays):0)+
    (method==="ADD_ON"&&commission>0&&(
      commissionReceiptAccountId===sourceAccount.id||
      (commissionReceiptAccountId==="SAME"&&receiptAccountId===sourceAccount.id)
    )?commission:0)
  ):0;
  const sourceAvailable=(sourceAccount?.currentBalance??0)+incomingToSource;
  const sourceHasFunds=!sourceAccount||sourceAccount.accountType==="OWNER_CREDIT_CARD"||sourceAvailable+0.001>=recipientGets;
  const canSave=customerReady&&destinationReady&&requested>0&&recipientGets>0&&Boolean(receiptAccountId)&&Boolean(sourceAccountId)&&cashReady&&sourceHasFunds&&(!method.includes("ADD_ON")||commission<=0||Boolean(commissionReceiptAccountId))&&!saving;

  function clearDestination(){
    setSavedDestination("");
    setRecipientScope("SELF");
    setRecipientName("");
    setDestinationType("UPI");
    setDestinationValue("");
    setBankName("");
    setIfsc("");
  }

  function selectCustomer(next:Customer){
    setCustomerMode("SEARCH");
    setCustomerId(next.id);
    setCustomerSearch(next.fullName+(next.mobile?" · "+next.mobile:""));
    clearDestination();
    setDestinationMode(next.bankAccounts.some(x=>x.isActive)||next.upiAccounts.some(x=>x.isActive)||next.beneficiaries.some(x=>x.isActive)?"SAVED":"NEW");
  }

  function beginSearch(){
    setCustomerMode("SEARCH");
    setCustomerId("");
    setCustomerSearch("");
    setNewName("");
    setNewMobile("");
    clearDestination();
    setDestinationMode("SAVED");
  }

  function beginNew(){
    const digits=mobileDigits(customerSearch);
    setCustomerMode("NEW");
    setCustomerId("");
    setNewMobile(digits.length===10?digits:"");
    setNewName(digits.length===10?"":customerSearch.trim());
    clearDestination();
    setDestinationMode("NEW");
  }

  async function ensureCashDrawer(){
    if(activeCash)return activeCash.id;
    if(anyCash){
      if(anyCash.isActive===false){
        if(!canConfigureCash)throw new Error("Owner/Admin must reactivate the Shop Cash Drawer before receiving cash.");
        await apiFetch("/accounts/"+anyCash.id+"/active",{method:"PATCH",body:JSON.stringify({isActive:true})});
      }
      return anyCash.id;
    }
    if(!canConfigureCash)throw new Error("Owner/Admin must set up the Shop Cash Drawer before receiving cash.");
    const created=await apiFetch<Account>("/accounts",{method:"POST",body:JSON.stringify({
      accountName:"Shop Cash Drawer",
      accountType:"CASH",
      accountNature:"ASSET",
      usageType:"BUSINESS",
      openingBalance:0,
    })});
    return created.id;
  }

  async function resolveReceiptAccountId(value:string){
    return value==="__CASH__"?ensureCashDrawer():value;
  }

  async function ensureCustomer(){
    if(customerMode==="SEARCH")return customerId;
    const mobile=newMobile.trim();
    const created=await apiFetch<Created>("/customers",{
      method:"POST",
      body:JSON.stringify({
        customerType:mobile?"REGULAR":"WALK_IN",
        fullName:newName.trim(),
        mobile:mobile||undefined,
      }),
    });
    return created.id;
  }

  async function ensureDestination(cid:string){
    if(destinationMode==="SAVED"){
      const [kind,a,b]=savedDestination.split(":");
      if(kind==="BANK")return {customerBankAccountId:a};
      if(kind==="UPI")return {customerUpiAccountId:a};
      if(kind==="BEN")return {beneficiaryId:a,beneficiaryAccountId:b};
      throw new Error("Choose a transfer destination");
    }

    const mobileLike=/^\d{10}$/.test(destinationValue.trim());
    const customerName=customerMode==="NEW"?newName:customer?.fullName;

    if(recipientScope==="SELF"){
      if(destinationType==="BANK"){
        const item=await apiFetch<Created>("/customers/"+cid+"/banks",{
          method:"POST",
          body:JSON.stringify({
            accountHolderName:customerName||"Customer",
            bankName:bankName.trim(),
            accountReference:destinationValue.trim(),
            ifsc:ifsc.trim()||undefined,
          }),
        });
        return {customerBankAccountId:item.id};
      }
      const item=await apiFetch<Created>("/customers/"+cid+"/upi",{
        method:"POST",
        body:JSON.stringify({
          accountName:customerName||"Customer",
          upiId:mobileLike?undefined:destinationValue.trim(),
          mobileNumber:mobileLike?destinationValue.trim():undefined,
        }),
      });
      return {customerUpiAccountId:item.id};
    }

    const beneficiary=await apiFetch<Created>("/customers/"+cid+"/beneficiaries",{
      method:"POST",
      body:JSON.stringify({beneficiaryName:recipientName.trim()}),
    });
    const account=await apiFetch<Created>("/customers/beneficiaries/"+beneficiary.id+"/accounts",{
      method:"POST",
      body:JSON.stringify(destinationType==="BANK"
        ? {accountType:"BANK",bankName:bankName.trim(),accountReference:destinationValue.trim(),ifsc:ifsc.trim()||undefined}
        : {accountType:"UPI",upiId:mobileLike?undefined:destinationValue.trim(),mobileNumber:mobileLike?destinationValue.trim():undefined}),
    });
    return {beneficiaryId:beneficiary.id,beneficiaryAccountId:account.id};
  }

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!canSave)return;
    setSaving(true);
    setError("");
    try{
      const cid=await ensureCustomer();
      const destination=await ensureDestination(cid);
      const mainReceiptId=await resolveReceiptAccountId(receiptAccountId);
      const commissionReceiptId=commissionReceiptAccountId==="SAME"?mainReceiptId:await resolveReceiptAccountId(commissionReceiptAccountId);
      const rawAllocations:ReceiptAllocation[]=method==="ADD_ON"&&commission>0
        ? [{accountId:mainReceiptId,amount:requested},{accountId:commissionReceiptId,amount:commission}]
        : [{accountId:mainReceiptId,amount:customerPays}];
      const mergedAllocations=[...rawAllocations.reduce((map,item)=>map.set(item.accountId,(map.get(item.accountId)||0)+item.amount),new Map<string,number>())]
        .map(([accountId,amount])=>({accountId,amount}));
      const result=await apiFetch<{id?:string;transaction?:{id:string}}>("/transactions/cash-transfer",{
        method:"POST",
        body:JSON.stringify({
          customerId:cid,
          ...destination,
          requestedAmount:requested,
          commissionMethod:method,
          commissionRate:Number(rate||0),
          receiptAllocations:mergedAllocations,
          sourceAccountId,
          referenceNumber:reference.trim()||undefined,
          notes:notes.trim()||undefined,
        }),
      });
      const txId=result.transaction?.id??result.id;
      router.push(txId?"/transactions/"+txId:"/transactions");
    }catch(err){
      setError(err instanceof Error?err.message:"Failed to save transfer");
    }finally{
      setSaving(false);
    }
  }

  if(loading)return <AppShell><PageLoader label="Preparing transfer…"/></AppShell>;

  const control="app-control";
  const displayCustomerName=customer?.fullName??(customerMode==="NEW"?newName.trim():"");
  const receivedIntoLabel=selectedReceipt?typeLabel(selectedReceipt.accountType)+" · "+selectedReceipt.accountName:"";
  const commissionIntoLabel=commission>0&&selectedCommissionReceipt
    ? typeLabel(selectedCommissionReceipt.accountType)+" · "+selectedCommissionReceipt.accountName
    : "";
  const calculationReady=requested>0&&recipientGets>0;
  const desktopSaveLabel=calculationReady?"Record transfer · "+money(recipientGets):"Record transfer";

  return <AppShell><form onSubmit={submit} className="swipe-commerce-page">
    <div className="mx-auto max-w-6xl pb-28 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5 lg:pb-24">
      <div className="space-y-3">
        {error?<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

        <Surface className="entry-sheet overflow-visible">
          <section className="entry-section">
            <div className="flex items-center justify-between gap-3">
              <h2 className="entry-title">Customer & amount</h2>
              <div className="customer-mode-switch grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={beginSearch} className={"min-h-9 rounded-lg px-3 text-xs font-bold "+(customerMode==="SEARCH"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Existing</button>
                <button type="button" onClick={beginNew} className={"min-h-9 rounded-lg px-3 text-xs font-bold "+(customerMode==="NEW"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>New</button>
              </div>
            </div>

            {customerMode==="NEW"?<div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Customer name">
                <input className={control} value={newName} onChange={e=>setNewName(e.target.value)} autoFocus placeholder="Full name"/>
              </Field>
              <Field label="Mobile (optional)">
                <input className={control} inputMode="numeric" maxLength={10} value={newMobile} onChange={e=>setNewMobile(e.target.value.replace(/D/g,"").slice(0,10))} placeholder="10-digit mobile"/>
              </Field>
              {possibleExisting.length?<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
                <p className="text-xs font-semibold text-amber-900">Possible existing customer</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">{possibleExisting.map(match=><button key={match.id} type="button" onClick={()=>selectCustomer(match)} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-left"><span><strong className="block text-xs text-slate-900">{match.fullName}</strong><span className="text-[11px] text-slate-500">{match.mobile||"No mobile"}</span></span><span className="text-xs font-semibold text-indigo-700">Use existing →</span></button>)}</div>
              </div>:null}
            </div>:customer?<div className="mt-3 flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-xs font-extrabold text-[var(--accent)]">{customer.fullName.split(/s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-base font-bold">{customer.fullName}</p><p className="truncate text-xs text-[var(--text-muted)]">{customer.mobile||"No mobile"}</p></div>
              <button type="button" onClick={beginSearch} className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold">Change</button>
            </div>:<div className="relative mt-3">
              <input className={control+" text-base"} inputMode="search" value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search name or mobile" autoComplete="off" autoFocus/>
              {customerSearch.trim()?<div className="absolute inset-x-0 top-[calc(100%+.4rem)] z-40 max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl">
                {customerMatches.length?customerMatches.map(match=><button key={match.id} type="button" onClick={()=>selectCustomer(match)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{match.fullName}</p><p className="truncate text-[11px] text-[var(--text-muted)]">{match.mobile||"No mobile"}</p></div><span className="text-xs font-semibold text-[var(--accent)]">Use</span></button>)
                :<button type="button" onClick={beginNew} className="w-full rounded-lg px-3 py-4 text-left text-xs font-semibold text-[var(--accent)]">No match · Create new customer</button>}
              </div>:null}
            </div>}

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <div className="flex items-center justify-between gap-3"><h3 className="operational-label">{method==="ADD_ON"?"Recipient should get":"Customer gives"}</h3><span className="currency-badge">₹ INR</span></div>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-[var(--text-muted)]">₹</span>
                  <input className="entry-amount-input" type="text" inputMode="decimal" value={formatAmountInput(amount)} onChange={e=>setAmount(cleanAmountInput(e.target.value))} placeholder="0" required/>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2"><h3 className="operational-label">Commission</h3><span className="text-[10px] font-semibold text-[var(--text-muted)]">Default {Number(defaultRate)}%</span></div>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                  <button type="button" onClick={()=>{setCommissionMode("DEFAULT");setRate(defaultRate);}} className={"min-h-10 rounded-lg px-2 text-[11px] font-bold "+(commissionMode==="DEFAULT"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Default</button>
                  <button type="button" onClick={()=>setCommissionMode("MANUAL")} className={"min-h-10 rounded-lg px-2 text-[11px] font-bold "+(commissionMode==="MANUAL"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Manual</button>
                  <button type="button" onClick={()=>{setCommissionMode("NONE");setRate("0");}} className={"min-h-10 rounded-lg px-2 text-[11px] font-bold "+(commissionMode==="NONE"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>No commission</button>
                </div>
                {commissionMode!=="NONE"?<div className="mt-2 grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                    <button type="button" onClick={()=>setMethod("ADD_ON")} className={"min-h-11 rounded-lg px-2 text-xs font-bold "+(method==="ADD_ON"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Add on</button>
                    <button type="button" onClick={()=>setMethod("DEDUCT")} className={"min-h-11 rounded-lg px-2 text-xs font-bold "+(method==="DEDUCT"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Deduct</button>
                  </div>
                  <div className="relative"><input aria-label="Commission rate percentage" className={control+" h-full pr-7 text-right text-base font-extrabold "+(commissionMode==="DEFAULT"?"bg-[var(--surface-soft)] text-[var(--text-muted)]":"")} type="number" min="0" max="100" step="0.0001" value={rate} onChange={e=>{setCommissionMode("MANUAL");setRate(e.target.value);}} readOnly={commissionMode==="DEFAULT"} required/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)]">%</span></div>
                </div>:null}
                {requested>0?<div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs"><span className="text-[var(--text-muted)]">{commissionMode==="NONE"?"No commission":method==="ADD_ON"?"Customer gives":"Recipient gets"}</span><strong className="money">{money(method==="ADD_ON"?customerPays:recipientGets)}</strong></div>:null}
              </div>
            </div>
          </section>

          <section className="entry-section">
            <div className="flex items-center justify-between gap-3">
              <h2 className="entry-title">Send to</h2>
              {savedOptions.length?<div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1 text-xs font-bold">
                <button type="button" onClick={()=>setDestinationMode("SAVED")} className={"min-h-9 rounded-lg px-3 "+(destinationMode==="SAVED"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Saved</button>
                <button type="button" onClick={()=>setDestinationMode("NEW")} className={"min-h-9 rounded-lg px-3 "+(destinationMode==="NEW"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>New</button>
              </div>:null}
            </div>

            {destinationMode==="SAVED"&&savedOptions.length?<div className="mt-3"><Field label="Destination"><select aria-label="Transfer destination" className={control} value={savedDestination} onChange={e=>setSavedDestination(e.target.value)} required><option value="">Choose bank / UPI / beneficiary</option>{savedOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field></div>
            :<div className="mt-3 grid gap-3 md:grid-cols-2">
              <div><p className="mb-1.5 text-xs font-bold">Recipient</p><div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={()=>setRecipientScope("SELF")} className={"min-h-10 rounded-lg px-2 text-xs font-bold "+(recipientScope==="SELF"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Customer</button>
                <button type="button" onClick={()=>setRecipientScope("OTHER")} className={"min-h-10 rounded-lg px-2 text-xs font-bold "+(recipientScope==="OTHER"?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>Someone else</button>
              </div></div>
              <div><p className="mb-1.5 text-xs font-bold">Send by</p><div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                <button type="button" onClick={()=>{setDestinationType("UPI");setDestinationValue("");}} className={"min-h-10 rounded-lg px-2 text-xs font-bold "+(destinationType==="UPI"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>UPI / GPay</button>
                <button type="button" onClick={()=>{setDestinationType("BANK");setDestinationValue("");}} className={"min-h-10 rounded-lg px-2 text-xs font-bold "+(destinationType==="BANK"?"bg-[var(--surface)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>Bank</button>
              </div></div>
              {recipientScope==="OTHER"?<Field label="Recipient name"><input className={control} value={recipientName} onChange={e=>setRecipientName(e.target.value)} placeholder="Recipient name" required/></Field>:null}
              {destinationType==="UPI"?<Field label="UPI / GPay / PhonePe" className={recipientScope==="SELF"?"md:col-span-2":""}><input className={control} value={destinationValue} onChange={e=>setDestinationValue(e.target.value)} placeholder="name@upi or mobile" required/></Field>:<>
                <Field label="Bank"><input className={control} value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="Bank name" required/></Field>
                <Field label="Account number"><input className={control} value={destinationValue} onChange={e=>setDestinationValue(e.target.value)} placeholder="Account number" required/></Field>
                <Field label="IFSC (optional)"><input className={control} value={ifsc} onChange={e=>setIfsc(e.target.value.toUpperCase())} placeholder="IFSC"/></Field>
              </>}
            </div>}
          </section>

          <section className="entry-section entry-section-commission">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="operational-label">Customer pays us</p>
                  <strong className="money text-sm">{money(receiptAmount)}</strong>
                </div>
                <select aria-label="Customer payment received into" className={control} value={receiptAccountId} onChange={e=>setReceiptAccountId(e.target.value)} required>
                  {receiptOptions.map(a=>{const session=a.accountType==="CASH"?openCashSessions[a.id]:undefined;const liveCash=a.accountType==="CASH"?Number(session?.liveExpectedClosingTotal??session?.openingTotal??a.currentBalance):a.currentBalance;return <option key={a.id} value={a.id}>{typeLabel(a.accountType)} · {a.accountName}{a.accountType==="CASH"?" · "+money(liveCash):""}</option>;})}
                </select>
                {selectedReceipt?.accountType==="CASH"?<div className={"mt-2 rounded-xl border px-3 py-2.5 "+(receiptCashReady?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50")}>
                  <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{selectedReceipt.accountName}</span><strong className={receiptCashReady?"text-emerald-700":"text-amber-700"}>{receiptCashReady?"Open":"Closed"}</strong></div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-muted)]">Current</span><strong className="money">{money(selectedReceiptCashCurrent??selectedReceipt.currentBalance)}</strong></div>
                  {receiptCashAfter!==null?<div className="mt-1 flex items-center justify-between gap-3 text-xs"><span className="text-[var(--text-muted)]">After</span><strong className="money text-[var(--money-in)]">{money(receiptCashAfter)}</strong></div>:null}
                  {!receiptCashReady?<button type="button" onClick={()=>router.push("/cash-counter")} className="mt-2 text-xs font-bold text-[var(--accent)]">Open drawer →</button>:null}
                </div>:null}
              </div>

              <div>
                <Field label={"Send "+money(Math.max(0,recipientGets))+" from"}>
                  <select aria-label="Recipient payout funding account" className={control} value={sourceAccountId} onChange={e=>setSourceAccountId(e.target.value)} required>
                    <option value="">Select account</option>
                    {activeAccounts.filter(a=>["BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"].includes(a.accountType)).map(a=><option key={a.id} value={a.id}>{typeLabel(a.accountType)} · {a.accountName} · {money(a.currentBalance)}</option>)}
                  </select>
                </Field>
                {sourceAccount?<div className={"mt-2 rounded-xl border px-3 py-2.5 "+(sourceHasFunds?"border-[var(--border)] bg-[var(--surface)]":"border-rose-200 bg-rose-50")}>
                  <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold">{sourceAccount.accountName}</span><strong className={sourceHasFunds?"text-[var(--text)]":"text-rose-700"}>{sourceAccount.accountType==="OWNER_CREDIT_CARD"?"Credit available":money(sourceAvailable)+" available"}</strong></div>
                </div>:null}
              </div>
            </div>

            {commission>0?<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-emerald-900">Commission</span>
                <strong className="money text-base text-emerald-700">{money(commission)}</strong>
              </div>
              {method==="ADD_ON"?(
                commissionSeparate?<div className="mt-2 flex gap-2">
                  <select aria-label="Commission received into" className={control+" min-w-0 flex-1 bg-white"} value={commissionReceiptAccountId} onChange={e=>setCommissionReceiptAccountId(e.target.value)}>
                    {receiptOptions.map(a=>{const session=a.accountType==="CASH"?openCashSessions[a.id]:undefined;const liveCash=a.accountType==="CASH"?Number(session?.liveExpectedClosingTotal??session?.openingTotal??a.currentBalance):a.currentBalance;return <option key={a.id} value={a.id}>{typeLabel(a.accountType)} · {a.accountName}{a.accountType==="CASH"?" · "+money(liveCash):""}</option>;})}
                  </select>
                  <button type="button" onClick={()=>setCommissionReceiptAccountId("SAME")} className="min-h-11 shrink-0 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-semibold">Same account</button>
                </div>:<div className="mt-2 flex items-center justify-between gap-3 text-xs text-emerald-900">
                  <span>Included in customer payment</span>
                  <button type="button" onClick={()=>{const alternate=receiptOptions.find(a=>a.id!==receiptAccountId);setCommissionReceiptAccountId(alternate?.id??receiptAccountId);}} className="font-bold text-[var(--accent)]">Receive separately</button>
                </div>
              ):<p className="mt-2 text-xs text-emerald-900">Deducted from customer amount</p>}
            </div>:null}

            {needsCashSetup?<p className="mt-3 text-[11px] font-semibold text-rose-600">Open a cash drawer before recording physical cash.</p>:null}
          </section>

          <section className="entry-section lg:hidden">
            <TransferSummary
              customerName={displayCustomerName}
              customerGives={customerPays}
              recipientGets={Math.max(0,recipientGets)}
              commission={commission}
              receivedInto={receivedIntoLabel}
              commissionInto={commissionIntoLabel}
              commissionSeparate={commissionSeparate}
              sourceName={sourceAccount?.accountName??""}
              sourceType={sourceAccount?.accountType??""}
              ready={calculationReady}
            />
          </section>

          <section className="entry-section p-0">
            <details className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-left"><span className="text-sm font-semibold">More details</span><span className="text-lg text-[var(--text-muted)] group-open:rotate-45">+</span></summary>
              <div className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2">
                <Field label="UTR / reference"><input className={control} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Optional"/></Field>
                <Field label="Notes"><input className={control} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional"/></Field>
              </div>
            </details>
          </section>
        </Surface>
      </div>

      <aside className="fixed right-6 top-[92px] z-20 hidden w-[340px] space-y-3 lg:block">
        <TransferSummary
          customerName={displayCustomerName}
          customerGives={customerPays}
          recipientGets={Math.max(0,recipientGets)}
          commission={commission}
          receivedInto={receivedIntoLabel}
          commissionInto={commissionIntoLabel}
          commissionSeparate={commissionSeparate}
          sourceName={sourceAccount?.accountName??""}
          sourceType={sourceAccount?.accountType??""}
          ready={calculationReady}
        />
      </aside>
    </div>

    <div className="fixed bottom-6 right-6 z-40 hidden w-[340px] lg:block">
      <button disabled={!canSave} className="swipe-primary-action min-h-12 w-full rounded-xl px-4 text-sm font-bold text-white shadow-[0_14px_36px_rgba(37,99,235,.28)] disabled:opacity-35">{saving?"Saving…":desktopSaveLabel}</button>
    </div>

    <div className="swipe-sticky-bar fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] px-3 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--text-muted)]">{displayCustomerName?displayCustomerName+" gives":"Customer gives"} {calculationReady?money(customerPays):"—"}</p>
          <p className="sticky-money money truncate font-extrabold tracking-[-.035em]">Send {calculationReady?money(Math.max(0,recipientGets)):"—"}</p>
          <p className="money text-xs font-bold text-[var(--money-in)]">Earn {money(commission)}</p>
        </div>
        <button disabled={!canSave} className="swipe-primary-action min-h-12 min-w-[118px] rounded-xl px-4 text-sm font-bold text-white disabled:opacity-35">{saving?"Saving…":"Record"}</button>
      </div>
    </div>
  </form></AppShell>;
}
