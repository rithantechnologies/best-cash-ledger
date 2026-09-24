"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { SearchableSelect } from "@/components/searchable-select";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Field, Modal, PageFrame, PageLoader, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Card={id:string;bankName:string;lastFourDigits:string;nickname:string|null;isActive:boolean};
type Customer={id:string;fullName:string;mobile:string|null;cards:Card[]};
type Gateway={id:string;gatewayName:string;defaultChargeRate:string;isActive?:boolean};
type Provider={id:string;name:string;gateways:Gateway[]};
type Account={id:string;accountName:string;accountType:string;providerId:string|null;currentBalance:number;isActive?:boolean};
type SwipeHistory={id:string;transactionNumber:string;transactionAt:string;grossAmount:string;payable:{remainingAmount:string;status:string}|null};
type Recovery={
 id:string;swipeAmount:string;providerChargeAmount:string;providerChargeRate:string;recoveredAt:string;referenceNumber:string|null;
 provider:{name:string};gateway:{gatewayName:string};destinationAccount:Account;
 transaction:{id:string;transactionNumber:string;netAmount:string|null;charges:{amount:string}[]};
};
type FeeCollection={
 id:string;amount:string;paymentMode:string;collectedAt:string;referenceNumber:string|null;
 destinationAccount:Account;transaction:{id:string;transactionNumber:string};
};
type Clearing={
 id:string;transactionId:string;dueAmount:string;commissionRate:string;commissionAmount:string;
 principalRecovered:string;principalRemaining:string;commissionCollected:string;commissionRemaining:string;
 nextFollowUpAt:string|null;duePaymentReference:string|null;customerCard:Card;advanceSourceAccount:Account;
 transaction:{id:string;transactionNumber:string;transactionAt:string;status:string;customer:{id:string;fullName:string;mobile:string|null}|null};
 recoveries:Recovery[];commissionCollections:FeeCollection[];
};
type DuePayable={
 id:string;originalAmount:string;paidAmount:string;remainingAmount:string;dueAt:string;status:string;
 customer:{id:string;fullName:string;mobile:string|null};
 sourceTransaction:{id:string;transactionNumber:string;transactionAt:string;transactionType:string};
 payments:{id:string;amount:string;paymentDate:string;transactionId:string}[];
};
type DueMovement={id:string;at:string;direction:"IN"|"OUT";label:string;amount:number;detail:string;href?:string;affectsBalance?:boolean};

const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
const num=(v:string)=>Number(v.replace(/,/g,"")||0);
const amountInput=(v:string)=>v.replace(/,/g,"").replace(/[^\d.]/g,"").replace(/(\..*)\./g,"$1");
const formatAmount=(v:string)=>{if(!v)return "";const [a,b]=v.split(".");const w=a?Number(a).toLocaleString("en-IN"):"";return b!==undefined?w+"."+b.slice(0,2):w;};
const localValue=(d:Date)=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
const statusTone=(s:string)=>s==="COMPLETED"?"emerald":s==="PARTIALLY_PAID"?"amber":"rose";
const statusLabel=(s:string)=>s==="COMPLETED"?"Fully settled":s==="PARTIALLY_PAID"?"Partly settled":"Pending";
const liquid=(a:Account)=>["CASH","BANK","UPI","PROVIDER_WALLET"].includes(a.accountType);
const calcMoney=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
const INDIAN_BANKS=[
  "State Bank of India","HDFC Bank","ICICI Bank","Axis Bank","Kotak Mahindra Bank",
  "IndusInd Bank","Yes Bank","IDFC FIRST Bank","Federal Bank","RBL Bank",
  "AU Small Finance Bank","Bandhan Bank","Bank of Baroda","Bank of India",
  "Bank of Maharashtra","Canara Bank","Central Bank of India","Indian Bank",
  "Indian Overseas Bank","Punjab National Bank","Punjab & Sind Bank","UCO Bank",
  "Union Bank of India","South Indian Bank","Karur Vysya Bank","Karnataka Bank",
  "City Union Bank","Tamilnad Mercantile Bank","DCB Bank","CSB Bank",
];
const validMobile=(v:string)=>/^[6-9]\d{9}$/.test(v);

export default function CardDueClearingPage(){
 const [customers,setCustomers]=useState<Customer[]>([]),[providers,setProviders]=useState<Provider[]>([]),[accounts,setAccounts]=useState<Account[]>([]);
 const [rows,setRows]=useState<Clearing[]>([]),[payables,setPayables]=useState<DuePayable[]>([]),[selected,setSelected]=useState<Clearing|null>(null),[history,setHistory]=useState<SwipeHistory[]>([]);
 const [customerSearch,setCustomerSearch]=useState(""),[customerId,setCustomerId]=useState(""),[cardId,setCardId]=useState("");
 const [dueAmount,setDueAmount]=useState(""),[sourceAccountId,setSourceAccountId]=useState("");
 const [followUp,setFollowUp]=useState(""),[reference,setReference]=useState(""),[notes,setNotes]=useState("");
 const [addRecoveryAmount,setAddRecoveryAmount]=useState(""),[addProviderId,setAddProviderId]=useState(""),[addGatewayId,setAddGatewayId]=useState(""),[addRecoveryAccountId,setAddRecoveryAccountId]=useState(""),[addRecoveryRef,setAddRecoveryRef]=useState("");
 const [addFeeAmount,setAddFeeAmount]=useState(""),[addFeeAccountId,setAddFeeAccountId]=useState(""),[addFeeRef,setAddFeeRef]=useState("");
 const [detailFollowUp,setDetailFollowUp]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [newCustomerOpen,setNewCustomerOpen]=useState(false),[newCustomerBusy,setNewCustomerBusy]=useState(false);
 const [newName,setNewName]=useState(""),[newMobile,setNewMobile]=useState(""),[newBank,setNewBank]=useState(""),[newLastFour,setNewLastFour]=useState("");
 const [addCardOpen,setAddCardOpen]=useState(false),[addCardBusy,setAddCardBusy]=useState(false);
 const [addCardBank,setAddCardBank]=useState(""),[addCardType,setAddCardType]=useState("CREDIT"),[addCardLastFour,setAddCardLastFour]=useState(""),[addCardNickname,setAddCardNickname]=useState("");

 const customer=customers.find(x=>x.id===customerId),addProvider=providers.find(x=>x.id===addProviderId);
 const addGateway=addProvider?.gateways.find(x=>x.id===addGatewayId);
 const liquidAccounts=accounts.filter(liquid),commissionAccounts=liquidAccounts.filter(a=>a.accountType==="CASH"||a.accountType==="UPI");
 const customerMatches=customerSearch.trim().length<2?[]:customers.filter(c=>(c.fullName+" "+(c.mobile??"")).toLowerCase().includes(customerSearch.trim().toLowerCase())).slice(0,6);

 const loadRows=async()=>{
  const [dueRows,duePayables]=await Promise.all([
   apiFetch<Clearing[]>("/transactions/card-due-clearings"),
   apiFetch<DuePayable[]>("/payables?transactionType=CARD_DUE_RECOVERY"),
  ]);
  setRows(dueRows);setPayables(duePayables);
 };
 const loadSelected=(id:string)=>apiFetch<Clearing>("/transactions/card-due-clearings/"+id).then(row=>{setSelected(row);setDetailFollowUp(row.nextFollowUpAt?localValue(new Date(row.nextFollowUpAt)):"");setAddRecoveryAmount(String(Number(row.principalRemaining)));setAddFeeAmount(String(Number(row.commissionRemaining)));});

 useEffect(()=>{
  Promise.all([
   apiFetch<Customer[]>("/customers"),
   apiFetch<Provider[]>("/providers"),
   apiFetch<Account[]>("/dashboard/accounts"),
   apiFetch<Clearing[]>("/transactions/card-due-clearings"),
   apiFetch<DuePayable[]>("/payables?transactionType=CARD_DUE_RECOVERY"),
  ]).then(([c,p,a,r,duePayables])=>{
   setCustomers(c);setProviders(p);setAccounts(a);setRows(r);setPayables(duePayables);
   const preset=new URLSearchParams(window.location.search).get("id");
   if(preset)loadSelected(preset).catch(()=>{});
  }).catch(e=>setError(e instanceof Error?e.message:"Failed to load Card Due Clearing"))
    .finally(()=>setLoading(false));
 },[]);

 useEffect(()=>{
  const active=customer?.cards.filter(c=>c.isActive)??[];
  setCardId(current=>active.some(c=>c.id===current)?current:(active.length===1?active[0].id:""));
  if(!customerId){setHistory([]);return;}
  apiFetch<SwipeHistory[]>("/transactions/customer/"+customerId+"/card-swipes").then(setHistory).catch(()=>setHistory([]));
 },[customerId]);

 useEffect(()=>{
  const p=providers.find(x=>x.id===addProviderId);
  setAddGatewayId(current=>p?.gateways.some(g=>g.id===current)?current:(p?.gateways[0]?.id??""));
  const wallet=accounts.find(a=>a.accountType==="PROVIDER_WALLET"&&a.providerId===addProviderId);
  if(wallet)setAddRecoveryAccountId(wallet.id);
 },[addProviderId,providers,accounts]);

 function chooseCustomer(c:Customer){
  setCustomerId(c.id);setCustomerSearch(c.fullName+(c.mobile?" · "+c.mobile:""));
 }
 function openNewCustomer(){
  const typed=customerSearch.trim();
  setNewName(typed&&!/\d{4,}/.test(typed)?typed:"");setNewMobile("");setNewBank("");setNewLastFour("");setError("");setNewCustomerOpen(true);
 }
 async function createNewCustomerCard(e:FormEvent){
  e.preventDefault();
  if(!newName.trim()||!validMobile(newMobile)||!newBank||newLastFour.length!==4)return;
  setNewCustomerBusy(true);setError("");
  try{
   const created=await apiFetch<{customer:{id:string;fullName:string;mobile:string|null};card:Card}>("/customers/quick-card",{method:"POST",body:JSON.stringify({
    fullName:newName.trim(),mobile:newMobile,bankName:newBank,lastFourDigits:newLastFour,
   })});
   const next:Customer={...created.customer,cards:[created.card]};
   setCustomers(current=>[...current,next]);
   setCustomerId(next.id);setCustomerSearch(next.fullName+(next.mobile?" · "+next.mobile:""));setCardId(created.card.id);
   setNewCustomerOpen(false);setSuccess("New customer and card added.");
  }catch(err){setError(err instanceof Error?err.message:"Could not add customer");}
  finally{setNewCustomerBusy(false);}
 }
 function openAddCard(){
  if(!customer)return;
  setAddCardBank("");setAddCardType("CREDIT");setAddCardLastFour("");setAddCardNickname("");setError("");setAddCardOpen(true);
 }
 async function addCard(e:FormEvent){
  e.preventDefault();if(!customerId||!addCardBank||addCardLastFour.length!==4)return;
  setAddCardBusy(true);setError("");
  try{
   const card=await apiFetch<Card>("/customers/"+customerId+"/cards",{method:"POST",body:JSON.stringify({
    bankName:addCardBank,cardType:addCardType,lastFourDigits:addCardLastFour,nickname:addCardNickname.trim()||undefined,
   })});
   setCustomers(current=>current.map(c=>c.id===customerId?{...c,cards:[...c.cards,card]}:c));
   setCardId(card.id);setAddCardOpen(false);setSuccess("Card added and selected.");
  }catch(err){setError(err instanceof Error?err.message:"Could not add card");}
  finally{setAddCardBusy(false);}
 }
 function openCase(row:Clearing){
  setSelected(row);setDetailFollowUp(row.nextFollowUpAt?localValue(new Date(row.nextFollowUpAt)):"");
  const customerDue=rows.filter(r=>r.transaction.customer?.id===row.transaction.customer?.id).reduce((sum,r)=>sum+Number(r.principalRemaining),0);
  setAddRecoveryAmount(String(calcMoney(customerDue)));setAddFeeAmount("");
  window.history.replaceState(null,"","?id="+row.transactionId);
 }
 async function refreshSelected(id=selected?.transactionId){
  await loadRows();
  if(id)await loadSelected(id);
 }

 async function createCase(e:FormEvent){
  e.preventDefault();setError("");setSuccess("");
  const due=num(dueAmount);
  if(!customerId||!cardId||!sourceAccountId||due<=0){setError("Customer, card, due amount and payment source are required.");return;}
  const sourceAccount=accounts.find(a=>a.id===sourceAccountId);
  if(sourceAccount&&Number(sourceAccount.currentBalance)<due){setError("Insufficient balance in "+sourceAccount.accountName+". Available "+money(sourceAccount.currentBalance)+"; required "+money(due)+".");return;}
  const body:any={
   customerId,customerCardId:cardId,sourceAccountId,dueAmount:due,commissionRate:0,
   nextFollowUpAt:followUp?new Date(followUp).toISOString():undefined,
   referenceNumber:reference||undefined,notes:notes||undefined,
  };
  setSaving(true);
  try{
   const saved=await apiFetch<Clearing>("/transactions/card-due-clearing",{method:"POST",body:JSON.stringify(body)});
   setSuccess(saved.transaction.status==="COMPLETED"?"Saved — everything settled.":"Saved — pending amounts will stay in follow-up.");
   setSelected(saved);setDetailFollowUp(saved.nextFollowUpAt?localValue(new Date(saved.nextFollowUpAt)):"");
   window.history.replaceState(null,"","?id="+saved.transactionId);
   setDueAmount("");setReference("");setNotes("");setFollowUp("");
   await refreshSelected(saved.transactionId);
  }catch(err){setError(err instanceof Error?err.message:"Could not save card due clearing");}
  finally{setSaving(false);}
 }

 async function addRecovery(e:FormEvent){
  e.preventDefault();if(!selected)return;setError("");setSuccess("");
  const amount=num(addRecoveryAmount);
  if(amount<=0||!addProviderId||!addGatewayId||!addRecoveryAccountId){setError("Amount, provider, gateway and receive account are required.");return;}
  setSaving(true);
  try{
   const sameCustomer=rows.filter(r=>r.transaction.customer?.id===selected.transaction.customer?.id);
   const targets=[...sameCustomer].filter(r=>Number(r.principalRemaining)>0.001).sort((a,b)=>new Date(a.transaction.transactionAt).getTime()-new Date(b.transaction.transactionAt).getTime());
   let left=amount;
   for(const target of targets){
    if(left<=0.001)break;
    const part=calcMoney(Math.min(left,Number(target.principalRemaining)));
    if(part<=0)continue;
    await apiFetch("/transactions/card-due-clearings/"+target.transactionId+"/recoveries",{method:"POST",body:JSON.stringify({
     amount:part,providerId:addProviderId,gatewayId:addGatewayId,destinationAccountId:addRecoveryAccountId,
     referenceNumber:addRecoveryRef||undefined,notes:amount>part?"Split customer due recovery":undefined,
    })});
    left=calcMoney(left-part);
   }
   if(left>0.001){
    const target=targets[targets.length-1]??selected;
    await apiFetch("/transactions/card-due-clearings/"+target.transactionId+"/recoveries",{method:"POST",body:JSON.stringify({
     amount:left,providerId:addProviderId,gatewayId:addGatewayId,destinationAccountId:addRecoveryAccountId,
     referenceNumber:addRecoveryRef||undefined,notes:"Excess recovery recorded as customer credit",
    })});
   }
   setSuccess("Recovery added to the customer ledger.");setAddRecoveryRef("");setAddRecoveryAmount("");await refreshSelected();
  }catch(err){setError(err instanceof Error?err.message:"Could not add recovery");}finally{setSaving(false);}
 }

 async function addFee(e:FormEvent){
  e.preventDefault();if(!selected)return;setError("");setSuccess("");setSaving(true);
  const account=accounts.find(a=>a.id===addFeeAccountId);
  if(!account||!["CASH","UPI"].includes(account.accountType)){setSaving(false);setError("Choose a Cash or UPI account.");return;}
  try{
   await apiFetch("/transactions/card-due-clearings/"+selected.transactionId+"/commission-collections",{method:"POST",body:JSON.stringify({
    amount:num(addFeeAmount),destinationAccountId:account.id,paymentMode:account.accountType,referenceNumber:addFeeRef||undefined,
   })});
   setSuccess("Commission collection added.");setAddFeeRef("");await refreshSelected();
  }catch(err){setError(err instanceof Error?err.message:"Could not collect commission");}finally{setSaving(false);}
 }

 async function saveFollowUp(){
  if(!selected)return;setError("");setSaving(true);
  try{
   await apiFetch("/transactions/card-due-clearings/"+selected.transactionId+"/follow-up",{method:"POST",body:JSON.stringify({
    nextFollowUpAt:detailFollowUp?new Date(detailFollowUp).toISOString():null,
   })});
   setSuccess("Follow-up updated.");await refreshSelected();
  }catch(err){setError(err instanceof Error?err.message:"Could not update follow-up");}finally{setSaving(false);}
 }

 if(loading)return <AppShell><PageLoader label="Loading card due clearing…"/></AppShell>;

 const selectedCustomerId=selected?.transaction.customer?.id??"";
 const selectedCustomerRows=selectedCustomerId?rows.filter(r=>r.transaction.customer?.id===selectedCustomerId):[];
 const selectedCustomerPayables=selectedCustomerId?payables.filter(p=>p.customer.id===selectedCustomerId):[];
 const selectedGatewayFees=selectedCustomerRows.reduce((sum,r)=>sum+r.recoveries.reduce((a,x)=>a+Number(x.providerChargeAmount),0),0);
 const customerCommission=selectedCustomerRows.reduce((sum,r)=>sum+r.commissionCollections.reduce((a,x)=>a+Number(x.amount),0),0);
 const selectedProfit=calcMoney(customerCommission-selectedGatewayFees);
 const customerPaid=selectedCustomerRows.reduce((sum,r)=>sum+Number(r.dueAmount),0);
 const customerReceived=selectedCustomerRows.reduce((sum,r)=>sum+r.recoveries.reduce((a,x)=>a+Number(x.swipeAmount),0),0);
 const customerReturned=selectedCustomerPayables.reduce((sum,p)=>sum+p.payments.reduce((a,x)=>a+Number(x.amount),0),0);
 const customerBalance=calcMoney(customerPaid+customerReturned-customerReceived);
 const customerMovements:DueMovement[]=[
  ...selectedCustomerRows.map(r=>({id:"pay-"+r.id,at:r.transaction.transactionAt,direction:"OUT" as const,label:"Card payment",amount:Number(r.dueAmount),detail:r.customerCard.bankName+" •••• "+r.customerCard.lastFourDigits+" · from "+r.advanceSourceAccount.accountName,href:"/transactions/"+r.transaction.id})),
  ...selectedCustomerRows.flatMap(r=>r.recoveries.map(x=>({id:"rec-"+x.id,at:x.recoveredAt,direction:"IN" as const,label:"Recovery",amount:Number(x.swipeAmount),detail:x.provider.name+" · "+x.gateway.gatewayName+" · into "+x.destinationAccount.accountName,href:"/transactions/"+x.transaction.id}))),
  ...selectedCustomerRows.flatMap(r=>r.commissionCollections.map(x=>({id:"fee-"+x.id,at:x.collectedAt,direction:"IN" as const,label:"Commission",amount:Number(x.amount),detail:x.paymentMode+" · into "+x.destinationAccount.accountName+" · income (does not change principal balance)",href:"/transactions/"+x.transaction.id,affectsBalance:false}))),
  ...selectedCustomerPayables.flatMap(x=>x.payments.map(payment=>({id:"refund-"+payment.id,at:payment.paymentDate,direction:"OUT" as const,label:"Paid back to customer",amount:Number(payment.amount),detail:"Customer balance payout",href:"/transactions/"+payment.transactionId}))),
 ].sort((a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime());
 let runningCustomerBalance=0;
 const customerLedger=customerMovements.map(m=>{if(m.affectsBalance!==false)runningCustomerBalance=calcMoney(runningCustomerBalance+(m.direction==="OUT"?m.amount:-m.amount));return {...m,balance:runningCustomerBalance};});
 const openCustomerPayable=selectedCustomerPayables.find(x=>Number(x.remainingAmount)>0.001);
 const customerIds=[...new Set(rows.map(r=>r.transaction.customer?.id).filter((id):id is string=>Boolean(id)))];
 const balanceForCustomer=(id:string)=>{
  const dueRows=rows.filter(r=>r.transaction.customer?.id===id);
  const paid=dueRows.reduce((sum,r)=>sum+Number(r.dueAmount),0);
  const received=dueRows.reduce((sum,r)=>sum+r.recoveries.reduce((a,x)=>a+Number(x.swipeAmount),0),0);
  const returned=payables.filter(p=>p.customer.id===id).reduce((sum,p)=>sum+p.payments.reduce((a,x)=>a+Number(x.amount),0),0);
  return calcMoney(paid+returned-received);
 };
 const attentionCustomers=customerIds.map(id=>{
  const customerRow=rows.find(r=>r.transaction.customer?.id===id)!;
  const balance=balanceForCustomer(id);
  const latest=rows.filter(r=>r.transaction.customer?.id===id).sort((a,b)=>new Date(b.transaction.transactionAt).getTime()-new Date(a.transaction.transactionAt).getTime())[0];
  return {id,name:customerRow.transaction.customer?.fullName??"Customer",mobile:customerRow.transaction.customer?.mobile??"",balance,latest};
 }).filter(x=>Math.abs(x.balance)>0.001).sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance));

 return <AppShell><PageFrame width="max-w-7xl">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
   <div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[var(--text-muted)]">Customer account</p><h1 className="mt-1 text-2xl font-black tracking-[-.035em]">Customer Due</h1></div>
   <Link href="/transactions" className="text-xs font-bold text-[var(--accent)]">← Transactions</Link>
  </div>

  <div className="grid grid-cols-3 gap-2 text-xs">
   <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-bold text-rose-700">Red · Paid out</div>
   <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-bold text-emerald-700">Green · Received</div>
   <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 font-bold text-sky-700">Blue · Give customer</div>
  </div>
  {error?<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>:null}
  {success?<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</div>:null}

  <Surface className="overflow-visible">
   <div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><h2 className="text-sm font-black">New card payment</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]"></p></div>
   <form onSubmit={createCase} className="space-y-4 p-4 sm:p-5">
    <div className="grid gap-3 lg:grid-cols-2">
     <div className="relative">
      <label className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Customer</label>
      <input className="app-control" value={customerSearch} onChange={e=>{setCustomerSearch(e.target.value);setCustomerId("");setCardId("");}} placeholder="Search name or mobile" required/>
      {!customerId&&customerSearch.trim().length>=2?<div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">{customerMatches.map(c=><button type="button" key={c.id} onClick={()=>chooseCustomer(c)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-soft)]"><span className="font-semibold">{c.fullName}</span><span className="text-xs text-[var(--text-muted)]">{c.mobile??""}</span></button>)}<button type="button" onClick={openNewCustomer} className="mt-1 w-full rounded-lg border-t border-[var(--border)] px-3 py-3 text-left text-xs font-bold text-[var(--accent)]">+ Add customer + card</button></div>:null}
     </div>
     <div><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-xs font-bold text-[var(--text-muted)]">Customer card</span>{customerId?<button type="button" onClick={openAddCard} className="text-[11px] font-bold text-[var(--accent)]">+ Add card</button>:null}</div><SearchableSelect className="app-control" value={cardId} onChange={e=>setCardId(e.target.value)} disabled={!customerId} required><option value="">{customerId?"Choose card":"Choose customer first"}</option>{customer?.cards.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.bankName} · •••• {c.lastFourDigits}{c.nickname?" · "+c.nickname:""}</option>)}</SearchableSelect>{customerId&&!customer?.cards.some(c=>c.isActive)?<button type="button" onClick={openAddCard} className="mt-2 text-xs font-bold text-[var(--accent)]">Add card</button>:null}</div>
    </div>

    {customerId?<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"><div className="flex items-center justify-between"><p className="text-xs font-black">Recent card swipe history</p><span className="text-[10px] text-[var(--text-muted)]">{history.length} records</span></div>{history.length?<div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{history.slice(0,6).map(h=><Link key={h.id} href={"/transactions/"+h.id} className="rounded-lg bg-[var(--surface)] px-3 py-2 text-xs ring-1 ring-[var(--border)]"><b>{h.transactionNumber}</b><span className="ml-2 money">{money(h.grossAmount)}</span><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{new Date(h.transactionAt).toLocaleDateString("en-IN")}{h.payable&&Number(h.payable.remainingAmount)>0?" · payout due "+money(h.payable.remainingAmount):""}</p></Link>)}</div>:<p className="mt-2 text-xs text-[var(--text-muted)]">No previous card swipes.</p>}</div>:null}

    <div className="grid gap-3 sm:grid-cols-2">
     <label><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Amount paid to card</span><input className="app-control money text-lg font-black" inputMode="decimal" value={formatAmount(dueAmount)} onChange={e=>{const next=amountInput(e.target.value);setDueAmount(next);const account=accounts.find(a=>a.id===sourceAccountId);const requiredAmount=num(next);if(account&&requiredAmount>0&&Number(account.currentBalance)<requiredAmount){setError("Insufficient balance in "+account.accountName+". Available "+money(account.currentBalance)+"; required "+money(requiredAmount)+".");}else if(error.startsWith("Insufficient balance in ")){setError("");}}} placeholder="50,000" required/></label>
     <label><span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">Paid from</span><SearchableSelect className="app-control" value={sourceAccountId} onChange={e=>{const id=e.target.value;setSourceAccountId(id);const account=accounts.find(a=>a.id===id);const requiredAmount=num(dueAmount);if(account&&requiredAmount>0&&Number(account.currentBalance)<requiredAmount){setError("Insufficient balance in "+account.accountName+". Available "+money(account.currentBalance)+"; required "+money(requiredAmount)+".");}else if(error.startsWith("Insufficient balance in ")){setError("");}}} required><option value="">Choose bank / wallet / cash</option>{liquidAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {a.accountType} · Balance {money(a.currentBalance)}</option>)}</SearchableSelect>{sourceAccountId&&num(dueAmount)>0&&Number(accounts.find(a=>a.id===sourceAccountId)?.currentBalance??0)<num(dueAmount)?<p className="mt-1 text-[11px] font-bold text-rose-600">Insufficient balance · available {money(accounts.find(a=>a.id===sourceAccountId)?.currentBalance??0)}</p>:null}</label>
    </div>
    <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]">
     <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold">More details (optional)</summary>
     <div className="grid gap-3 border-t border-[var(--border)] p-3 sm:grid-cols-3">
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-muted)]">Follow up</span><input className="app-control" type="datetime-local" value={followUp} onChange={e=>setFollowUp(e.target.value)}/></label>
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-muted)]">Reference</span><input className="app-control" value={reference} onChange={e=>setReference(e.target.value)} placeholder="UTR / reference"/></label>
      <label><span className="mb-1 block text-[10px] font-bold text-[var(--text-muted)]">Notes</span><input className="app-control" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional note"/></label>
     </div>
    </details>
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><p className="text-xs text-[var(--text-muted)]">Save now. Recovery and commission can be entered later in parts.</p><button disabled={saving} className="app-primary-button min-h-11 px-6 text-sm font-black disabled:opacity-50">{saving?"Saving…":"Save payment"}</button></div>
   </form>
  </Surface>

  {selected?<Surface className="overflow-hidden">
   <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
    <div><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[var(--text-muted)]">Current case</p><h2 className="mt-1 text-lg font-black">{selected.transaction.customer?.fullName??"Customer"} · {selected.transaction.transactionNumber}</h2><p className="mt-0.5 text-xs text-[var(--text-muted)]">{selected.customerCard.bankName} •••• {selected.customerCard.lastFourDigits} · paid from {selected.advanceSourceAccount.accountName}</p></div>
    <StatusBadge tone={statusTone(selected.transaction.status) as "rose"|"amber"|"emerald"}>{statusLabel(selected.transaction.status)}</StatusBadge>
   </div>
   <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4">
    <div className="bg-[var(--surface)] p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Paid out</p><p className="money mt-1 text-base font-black text-rose-600">{money(customerPaid)}</p></div>
    <div className="bg-[var(--surface)] p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Recovered</p><p className="money mt-1 text-base font-black text-emerald-600">{money(customerReceived)}</p><p className="mt-1 text-[9px] text-[var(--text-muted)]">Commission {money(customerCommission)}</p></div>
    <div className="bg-[var(--surface)] p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Paid back</p><p className="money mt-1 text-base font-black text-rose-600">{money(customerReturned)}</p></div>
    <div className="bg-[var(--surface)] p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{customerBalance>0.001?"To receive":customerBalance<-.001?"To give customer":"Balance"}</p><p className={"money mt-1 text-base font-black "+(customerBalance>0.001?"text-rose-600":customerBalance<-.001?"text-sky-600":"text-emerald-600")}>{money(Math.abs(customerBalance))}</p></div>
   </div>
   {customerBalance<-.001&&openCustomerPayable?<div className="border-t border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 sm:px-5"><b>{money(Number(openCustomerPayable.remainingAmount))} to give customer.</b> <Link href={"/payables/"+openCustomerPayable.id} className="font-black underline">Pay now →</Link></div>:null}
   <div className="border-t border-[var(--border)] p-4 sm:p-5">
    <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-black">Customer ledger</h3><p className="text-[11px] text-[var(--text-muted)]">All card payments, recoveries, commission and customer payouts in one running view.</p></div><span className="text-[10px] font-bold text-[var(--text-muted)]">{customerLedger.length} movement{customerLedger.length===1?"":"s"}</span></div>
    {customerLedger.length?<div className="space-y-2">{[...customerLedger].reverse().map(m=><div key={m.id} className={"rounded-xl border p-3 "+(m.direction==="OUT"?"border-rose-200 bg-rose-50":"border-emerald-200 bg-emerald-50")}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={"text-sm font-black "+(m.direction==="OUT"?"text-rose-700":"text-emerald-700")}>{m.direction==="OUT"?"−":"+"} {money(m.amount)} · {m.label}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{m.detail} · {new Date(m.at).toLocaleString("en-IN")}</p></div><div className="shrink-0 text-right"><p className={"money text-xs font-black "+(m.balance>0.001?"text-rose-700":m.balance<-.001?"text-sky-700":"text-emerald-700")}>{m.balance>0.001?"Receive ":m.balance<-.001?"Give ":"Settled "}{money(Math.abs(m.balance))}</p>{m.href?<Link href={m.href} className="text-[10px] font-bold text-[var(--accent)]">Open</Link>:null}</div></div></div>)}</div>:<EmptyState title="No movements yet" description="Save the first card payment to start this customer ledger."/>}
   </div>

   <div className="grid grid-cols-2 gap-px bg-[var(--border)] sm:grid-cols-4 lg:grid-cols-7">
    {[
     ["Due paid",selected.dueAmount,""],
     ["Recovered",selected.principalRecovered,"text-[var(--money-in)]"],
     ["Principal pending",selected.principalRemaining,Number(selected.principalRemaining)>0?"text-amber-600":""],
     ["Commission",selected.commissionAmount,""],
     ["Commission collected",selected.commissionCollected,"text-[var(--money-in)]"],
     ["Commission pending",selected.commissionRemaining,Number(selected.commissionRemaining)>0?"text-amber-600":""],
     ["Net profit",selectedProfit,selectedProfit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]"],
    ].map(([label,value,cls])=><div key={String(label)} className="bg-[var(--surface)] p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className={"money mt-1 text-sm font-black "+cls}>{money(value)}</p></div>)}
   </div>

   <div className="grid gap-4 p-4 lg:grid-cols-3 sm:p-5">
    <form onSubmit={addRecovery} className="rounded-2xl border border-[var(--border)] p-3.5">
     <h3 className="text-sm font-black">Receive from customer</h3><p className="mt-1 text-[11px] text-[var(--text-muted)]">Suggested recovery: {money(selected.principalRemaining)}. You may enter more; excess becomes money to give back.</p>
     <div className="mt-3 space-y-2">
      <input className="app-control money" value={formatAmount(addRecoveryAmount)} onChange={e=>setAddRecoveryAmount(amountInput(e.target.value))} placeholder="Amount"/>
      <SearchableSelect className="app-control" value={addProviderId} onChange={e=>setAddProviderId(e.target.value)} required><option value="">Provider</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</SearchableSelect>
      <SearchableSelect className="app-control" value={addGatewayId} onChange={e=>setAddGatewayId(e.target.value)} required><option value="">Gateway</option>{addProvider?.gateways.map(g=><option key={g.id} value={g.id}>{g.gatewayName} · {Number(g.defaultChargeRate)}%</option>)}</SearchableSelect>
      <SearchableSelect className="app-control" value={addRecoveryAccountId} onChange={e=>setAddRecoveryAccountId(e.target.value)} required><option value="">Receive into account</option>{liquidAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName}</option>)}</SearchableSelect>
      {addGateway?<p className="text-[10px] text-[var(--text-muted)]">Gateway charge {money(calcMoney(num(addRecoveryAmount)*Number(addGateway.defaultChargeRate)/100))}</p>:null}
      <input className="app-control" value={addRecoveryRef} onChange={e=>setAddRecoveryRef(e.target.value)} placeholder="Reference (optional)"/>
      <button disabled={saving} className="app-primary-button min-h-10 w-full text-xs font-black disabled:opacity-50">Add recovery</button>
     </div>
    </form>

    <form onSubmit={addFee} className="rounded-2xl border border-[var(--border)] p-3.5">
     <h3 className="text-sm font-black">Add commission</h3><p className="mt-1 text-[11px] text-[var(--text-muted)]">Commission can be collected later in any amount. No percentage is required up front.</p>
     <div className="mt-3 space-y-2">
      <input className="app-control money" value={formatAmount(addFeeAmount)} onChange={e=>setAddFeeAmount(amountInput(e.target.value))} placeholder="Amount"/>
      <SearchableSelect className="app-control" value={addFeeAccountId} onChange={e=>setAddFeeAccountId(e.target.value)} required><option value="">Cash / UPI account</option>{commissionAccounts.map(a=><option key={a.id} value={a.id}>{a.accountName} · {a.accountType}</option>)}</SearchableSelect>
      <input className="app-control" value={addFeeRef} onChange={e=>setAddFeeRef(e.target.value)} placeholder="Reference (optional)"/>
      <button disabled={saving} className="app-primary-button min-h-10 w-full text-xs font-black disabled:opacity-50">Collect commission</button>
     </div>
    </form>

    <div className="rounded-2xl border border-[var(--border)] p-3.5">
     <h3 className="text-sm font-black">Reminder / follow-up</h3><p className="mt-1 text-[11px] text-[var(--text-muted)]">Keep the case visible until all pending money is settled.</p>
     <input className="app-control mt-3" type="datetime-local" value={detailFollowUp} onChange={e=>setDetailFollowUp(e.target.value)}/>
     <button type="button" onClick={saveFollowUp} disabled={saving} className="mt-2 min-h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-xs font-black disabled:opacity-50">Save follow-up</button>
     <div className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-[11px] text-[var(--text-muted)]">Gateway charges so far <b className="money text-[var(--money-out)]">{money(selectedGatewayFees)}</b><br/>Commission received <b className="money text-[var(--money-in)]">{money(customerCommission)}</b><br/>Net after gateway charges <b className={selectedProfit>=0?"text-[var(--money-in)]":"text-[var(--money-out)]"}>{money(selectedProfit)}</b></div>
    </div>
   </div>

   <div className="grid gap-4 border-t border-[var(--border)] p-4 lg:grid-cols-2 sm:p-5">
    <div><h3 className="text-xs font-black uppercase tracking-wide text-[var(--text-muted)]">Recovery history</h3>{selected.recoveries.length?<div className="mt-2 space-y-2">{selected.recoveries.map(r=><div key={r.id} className="rounded-xl bg-[var(--surface-soft)] p-3 text-xs"><div className="flex justify-between gap-3"><b>{money(r.swipeAmount)} via {r.provider.name}</b><Link href={"/transactions/"+r.transaction.id} className="text-[var(--accent)]">{r.transaction.transactionNumber}</Link></div><p className="mt-1 text-[var(--text-muted)]">{r.gateway.gatewayName} · fee {money(r.providerChargeAmount)} · received into {r.destinationAccount.accountName} · {new Date(r.recoveredAt).toLocaleString("en-IN")}</p></div>)}</div>:<p className="mt-2 text-xs text-[var(--text-muted)]">No recovery recorded yet.</p>}</div>
    <div><h3 className="text-xs font-black uppercase tracking-wide text-[var(--text-muted)]">Commission collection history</h3>{selected.commissionCollections.length?<div className="mt-2 space-y-2">{selected.commissionCollections.map(c=><div key={c.id} className="rounded-xl bg-[var(--surface-soft)] p-3 text-xs"><div className="flex justify-between gap-3"><b>{money(c.amount)} · {c.paymentMode}</b><Link href={"/transactions/"+c.transaction.id} className="text-[var(--accent)]">{c.transaction.transactionNumber}</Link></div><p className="mt-1 text-[var(--text-muted)]">{c.destinationAccount.accountName} · {new Date(c.collectedAt).toLocaleString("en-IN")}</p></div>)}</div>:<p className="mt-2 text-xs text-[var(--text-muted)]">No commission collected yet.</p>}</div>
   </div>
  </Surface>:null}

  <Surface className="overflow-hidden">
   <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><h2 className="text-sm font-black">Needs attention</h2><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{attentionCustomers.length} customer{attentionCustomers.length===1?"":"s"} currently have a non-zero balance.</p></div><Link href="/dues" className="text-xs font-bold text-[var(--accent)]">All dues →</Link></div>
   {attentionCustomers.length?<div className="divide-y divide-[var(--border)]">{attentionCustomers.map(item=><button key={item.id} type="button" onClick={()=>openCase(item.latest)} className="grid w-full gap-2 px-4 py-3.5 text-left hover:bg-[var(--surface-soft)] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5">
    <div className="min-w-0"><p className="truncate text-sm font-black">{item.name}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{item.mobile||"No mobile"} · latest {new Date(item.latest.transaction.transactionAt).toLocaleString("en-IN")}</p></div>
    <div className="text-right"><p className="text-[9px] font-bold uppercase text-[var(--text-muted)]">{item.balance>0?"To receive":"To give customer"}</p><p className={"money mt-0.5 text-base font-black "+(item.balance>0?"text-rose-600":"text-sky-600")}>{money(Math.abs(item.balance))}</p></div>
    <span className="text-xs font-black text-[var(--accent)]">Open ledger →</span>
   </button>)}</div>:<div className="p-4"><EmptyState title="Everything settled" description="No customer currently has money to receive or give."/></div>}
  </Surface>

  <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]"><summary className="cursor-pointer px-4 py-3.5 text-sm font-black">Completed & all history <span className="float-right text-xs font-normal text-[var(--text-muted)]">{rows.length} total</span></summary><div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">{rows.map(row=><button key={row.id} onClick={()=>openCase(row)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-soft)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.transaction.customer?.fullName??"Customer"} · {row.transaction.transactionNumber}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{new Date(row.transaction.transactionAt).toLocaleString("en-IN")}</p></div><div className="flex items-center gap-3"><span className="money text-xs font-bold">{money(row.dueAmount)}</span><StatusBadge tone={statusTone(row.transaction.status) as "rose"|"amber"|"emerald"}>{statusLabel(row.transaction.status)}</StatusBadge></div></button>)}</div></details>
  <Modal open={newCustomerOpen} title="Add customer + card" onClose={()=>{if(!newCustomerBusy)setNewCustomerOpen(false);}} footer={<button form="due-new-customer" disabled={newCustomerBusy||!newName.trim()||!validMobile(newMobile)||!newBank||newLastFour.length!==4} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{newCustomerBusy?"Saving…":"Save customer"}</button>}>
   <form id="due-new-customer" onSubmit={createNewCustomerCard} className="grid gap-3 sm:grid-cols-2">
    <Field label="Customer name"><input className="app-control" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Full name" required/></Field>
    <Field label="Mobile"><div className="flex overflow-hidden rounded-xl border border-[var(--border)]"><span className="grid h-11 place-items-center border-r border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm">+91</span><input className="h-11 min-w-0 flex-1 bg-transparent px-3 outline-none" inputMode="numeric" value={newMobile} onChange={e=>setNewMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile" required/></div></Field>
    <Field label="Card bank"><SearchableSelect className="app-control" value={newBank} onChange={e=>setNewBank(e.target.value)} required><option value="">Select bank</option>{INDIAN_BANKS.map(bank=><option key={bank} value={bank}>{bank}</option>)}</SearchableSelect></Field>
    <Field label="Card last 4"><input className="app-control font-semibold tracking-[.12em]" inputMode="numeric" value={newLastFour} onChange={e=>setNewLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} placeholder="0000" required/></Field>
   </form>
  </Modal>
  <Modal open={addCardOpen} title="Add card" description={customer?""+customer.fullName+"":undefined} onClose={()=>{if(!addCardBusy)setAddCardOpen(false);}} footer={<button form="due-add-card" disabled={addCardBusy||!addCardBank||addCardLastFour.length!==4} className="app-primary-button min-h-11 w-full text-sm font-bold disabled:opacity-50">{addCardBusy?"Saving…":"Save & use card"}</button>}>
   <form id="due-add-card" onSubmit={addCard} className="grid gap-3 sm:grid-cols-2">
    <Field label="Bank"><SearchableSelect className="app-control" value={addCardBank} onChange={e=>setAddCardBank(e.target.value)} required><option value="">Select bank</option>{INDIAN_BANKS.map(bank=><option key={bank} value={bank}>{bank}</option>)}</SearchableSelect></Field>
    <Field label="Card type"><SearchableSelect className="app-control" value={addCardType} onChange={e=>setAddCardType(e.target.value)}><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option><option value="BUSINESS">Business</option><option value="OTHER">Other</option></SearchableSelect></Field>
    <Field label="Last 4 digits"><input className="app-control font-semibold tracking-[.12em]" inputMode="numeric" value={addCardLastFour} onChange={e=>setAddCardLastFour(e.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} placeholder="0000" required/></Field>
    <Field label="Nickname"><input className="app-control" value={addCardNickname} onChange={e=>setAddCardNickname(e.target.value)} placeholder="Optional"/></Field>
   </form>
  </Modal>
 </PageFrame></AppShell>;
}
