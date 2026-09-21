"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CashHistoryChart, CashMovementChart } from "@/components/cash-desk/cash-desk-charts";
import { FundsAllocationDonut } from "@/components/dashboard/dashboard-charts";
import { EmptyState, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Account={id:string;accountName:string;accountType:string;isActive?:boolean};
type Count={countType:string;denomination:string;quantity:number;totalAmount:string};
type Movement={
  id:string;activityId?:string;transactionId?:string;direction:"IN"|"OUT";amount:number;runningBalance:number;
  grossAmount:number;netAmount:number;commissionAmount:number;
  description:string|null;transactionNumber:string;transactionType:string;transactionAt:string;
};
type Activity={
  id:string;transactionId:string;transactionNumber:string;serviceType:string;transactionAt:string;
  particular:string;transactionAmount:number;netAmount:number;cashIn:number;cashOut:number;
  commissionAmount:number;runningBalance:number;movementCount:number;
};
type ServiceSummary={
  id:string;transactionAmount:number;cashIn:number;cashOut:number;commissionAmount:number;count:number;
};
type UserRef={id:string;fullName:string}|null;
type Session={
  id:string;cashAccountId:string;businessDate:string;openedAt:string;openingTotal:string;
  expectedClosingTotal:string|null;liveExpectedClosingTotal?:number;liveCashIn?:number;liveCashOut?:number;
  actualClosingTotal:string|null;differenceAmount:string|null;status:string;closingNotes:string|null;
  cashAccount:{accountName:string};denominationCounts:Count[];movements?:Movement[];activities?:Activity[];
  serviceSummary?:ServiceSummary[];commissionEarned?:number;transactionCount?:number;
  openedBy?:UserRef;closedBy?:UserRef;closedAt?:string|null;
};

type Range="today"|"7d"|"30d";
type DirectionFilter="ALL"|"IN"|"OUT"|"ADJUSTMENT";

const denominations=[2000,500,200,100,50,20,10,5,2,1];
const money=(value:number|string)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value||0));
const words=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase());
const friendlyService=(value:string)=>{
  const labels:Record<string,string>={
    CARD_SWIPE:"Card Swipe",
    CASH_TRANSFER:"Cash Transfer / UPI",
    AEPS_WITHDRAWAL:"Aadhaar / AePS",
    MICRO_ATM:"Micro ATM",
    ATM_WITHDRAWAL:"ATM Cash Added",
    CUSTOMER_PAYOUT:"Customer Payout",
    CUSTOMER_RECEIPT:"Customer Receipt",
    BUSINESS_EXPENSE:"Business Expense",
    PERSONAL_EXPENSE:"Personal Expense",
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
  return <div className={compact?"grid gap-2":"grid gap-2 sm:grid-cols-2"}>
    {denominations.map((note)=><div key={note} className="cash-count-row grid grid-cols-[64px_minmax(0,1fr)_96px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <strong className="money text-sm">₹{note}</strong>
      <div className="cash-count-control grid grid-cols-[40px_minmax(0,1fr)_40px] items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-soft)]">
        <button type="button" onClick={()=>step(note,-1)} className="h-10 text-lg text-[var(--text-muted)]">−</button>
        <input className="cash-count-input h-11 min-w-0 border-x border-[var(--border)] bg-[var(--surface)] text-center text-lg font-extrabold" type="number" min="0" step="1" inputMode="numeric" value={qty[note]||""} placeholder="0" onChange={(event)=>setQty((current)=>({...current,[note]:event.target.value}))}/>
        <button type="button" onClick={()=>step(note,1)} className="h-10 text-lg text-[var(--text-muted)]">+</button>
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
  const [today,setToday]=useState<Session|null>(null);
  const [history,setHistory]=useState<Session[]>([]);
  const [cashAccountId,setCashAccountId]=useState("");
  const [qty,setQty]=useState<Record<number,string>>({});
  const [remarks,setRemarks]=useState("");
  const [closing,setClosing]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [range,setRange]=useState<Range>("today");
  const [direction,setDirection]=useState<DirectionFilter>("ALL");
  const [serviceFilter,setServiceFilter]=useState<string|null>(null);
  const [selectedActivityId,setSelectedActivityId]=useState<string|null>(null);
  const [selectedHistoryId,setSelectedHistoryId]=useState<string|null>(null);
  const [role]=useState(()=>{if(typeof window==="undefined")return "";try{return JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"";}catch{return "";}});

  const load=()=>Promise.all([
    apiFetch<Account[]>("/accounts"),
    apiFetch<Session|null>("/cash-counter/today"),
    apiFetch<Session[]>("/cash-counter/history"),
  ]).then(([accountRows,session,historyRows])=>{
    setAccounts(accountRows);setToday(session);setHistory(historyRows);
    const drawer=accountRows.find((account)=>account.accountType==="CASH");
    if(session)setCashAccountId(session.cashAccountId);
    else if(drawer)setCashAccountId(drawer.id);
  });

  useEffect(()=>{load().catch(()=>setError("Failed to load daily cash desk")).finally(()=>setLoading(false));},[]);
  const countedTotal=useMemo(()=>denominations.reduce((sum,note)=>sum+note*Number(qty[note]||0),0),[qty]);
  const expected=Number(today?.liveExpectedClosingTotal??today?.expectedClosingTotal??today?.openingTotal??0);
  const cashIn=Number(today?.liveCashIn??0),cashOut=Number(today?.liveCashOut??0);
  const commission=Number(today?.commissionEarned??0);
  const previewDifference=countedTotal-expected;
  const closedDifference=Number(today?.differenceAmount??0);
  const isClosed=today?.status==="CLOSED";
  const cashDrawer=accounts.find((account)=>account.accountType==="CASH"&&account.isActive!==false);
  const anyCashDrawer=accounts.find((account)=>account.accountType==="CASH");
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

  const visibleActivities=useMemo(()=>{
    return [...(today?.activities??[])].filter((activity)=>{
      const directionMatch=direction==="ALL"||
        (direction==="ADJUSTMENT"?activity.serviceType==="CASH_ADJUSTMENT":
          direction==="IN"?activity.cashIn>0:activity.cashOut>0);
      const serviceMatch=!serviceFilter||activity.serviceType===serviceFilter;
      return directionMatch&&serviceMatch;
    }).reverse();
  },[today?.activities,direction,serviceFilter]);

  function denominationPayload(){return denominations.map((denomination)=>({denomination,quantity:Number(qty[denomination]||0)}));}

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
      await apiFetch("/cash-counter/open",{method:"POST",body:JSON.stringify({cashAccountId:targetId,denominations:denominationPayload()})});
      setCashAccountId(targetId);setQty({});setRange("today");await load();
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
      await apiFetch("/cash-counter/"+today.id+"/close",{method:"POST",body:JSON.stringify({denominations:denominationPayload(),notes:remarks.trim()||undefined})});
      setQty({});setRemarks("");setClosing(false);setRange("today");await load();
    }catch(err){setError(err instanceof Error?err.message:"Failed to close today's cash desk");}
    finally{setSaving(false);}
  }

  function selectMovement(movement:{id:string;activityId?:string}){
    const activityId=movement.activityId??movement.id;
    setSelectedActivityId(activityId);
    requestAnimationFrame(()=>document.getElementById("cash-activity-"+activityId)?.scrollIntoView({behavior:"smooth",block:"nearest"}));
  }

  if(loading)return <AppShell><PageLoader label="Loading daily cash desk…"/></AppShell>;

  return <AppShell><div className="cash-desk-page page-enter mx-auto max-w-7xl space-y-4 sm:space-y-5">
    <SectionHeading
      eyebrow="Today"
      title="Cash"
      description={today?undefined:"Count the opening cash to start."}
      action={today?<div className="flex items-center gap-2">
        {!isClosed?<button type="button" onClick={()=>document.getElementById("cash-close-panel")?.scrollIntoView({behavior:"smooth",block:"start"})} className="hidden min-h-9 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-extrabold text-[var(--text)] shadow-sm sm:inline-flex sm:items-center">Close cash</button>:null}
        <span className={"inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-extrabold "+(isClosed?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-violet-200 bg-violet-50 text-violet-700")}><span className={"h-2 w-2 rounded-full "+(isClosed?"bg-emerald-500":"bg-violet-500")}/>{isClosed?"Closed":"Live"}</span>
      </div>:undefined}
    />
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

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
          <p className="mt-3 text-sm leading-5 text-[var(--text-muted)]">Starting cash for today.</p>
          <button disabled={saving||(!cashDrawer&&!canConfigure)} className="app-primary-button mt-5 min-h-12 w-full px-4 text-sm font-black disabled:opacity-40">{saving?"Starting…":"Start day"}</button>
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
            <MetricCard label="Commission" value={money(commission)} tone="accent"/>
          </div>
        </div>
      </Surface>

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

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <div><h3 className="text-sm font-extrabold">Transactions</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{visibleActivities.length} of {today.activities?.length??0}</p></div>
          <div className="flex flex-wrap gap-1.5">
            {([["ALL","All"],["IN","In"],["OUT","Out"],["ADJUSTMENT","Adjust"]] as Array<[DirectionFilter,string]>).map(([id,label])=><button key={id} type="button" onClick={()=>setDirection(id)} className={"min-h-9 rounded-xl border px-3 text-sm font-extrabold "+(direction===id?"border-[var(--accent)] bg-[var(--accent)] text-white":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>{label}</button>)}
          </div>
        </div>
        {visibleActivities.length?<div>
          <div className="cash-ledger-header hidden grid-cols-[72px_minmax(220px,1.6fr)_150px_110px_110px_110px_100px_120px] gap-4 border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-3 text-xs font-extrabold uppercase tracking-[.05em] text-[var(--text-muted)] xl:grid">
            <span>Time</span><span>Particular</span><span>Service</span><span className="text-right">Txn amount</span><span className="text-right">Cash in</span><span className="text-right">Cash out</span><span className="text-right">Comm.</span><span className="text-right">Drawer</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
          {visibleActivities.map((activity)=>{
            const selected=activity.id===selectedActivityId;
            return <button id={"cash-activity-"+activity.id} key={activity.id} type="button" onClick={()=>{setSelectedActivityId(activity.id);router.push("/transactions/"+activity.transactionId);}} className={"cash-activity-row w-full px-4 py-4 text-left transition sm:px-5 "+(selected?"bg-[var(--accent-soft)]":"hover:bg-[var(--surface-soft)]")}>
              <div className="hidden grid-cols-[72px_minmax(220px,1.6fr)_150px_110px_110px_110px_100px_120px] items-center gap-4 xl:grid">
                <span className="text-[13px] font-semibold text-[var(--text-muted)]">{new Date(activity.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>
                <div className="min-w-0"><p className="truncate text-[15px] font-bold">{activity.particular}</p><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{activity.transactionNumber}</p></div>
                <span className="truncate text-[13px] font-semibold text-[var(--text-muted)]">{friendlyService(activity.serviceType)}</span>
                <strong className="money text-right text-sm">{money(activity.transactionAmount)}</strong>
                <strong className="money text-right text-sm text-[var(--money-in)]">{activity.cashIn?money(activity.cashIn):"—"}</strong>
                <strong className="money text-right text-sm text-[var(--money-out)]">{activity.cashOut?money(activity.cashOut):"—"}</strong>
                <strong className="money text-right text-sm text-[var(--accent)]">{activity.commissionAmount?money(activity.commissionAmount):"—"}</strong>
                <strong className="money text-right text-sm">{money(activity.runningBalance)}</strong>
              </div>
              <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 xl:hidden">
                <span className={"grid h-10 w-10 place-items-center rounded-xl text-sm font-black "+(activity.cashIn>=activity.cashOut?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-600")}>{activity.cashIn>=activity.cashOut?"↓":"↑"}</span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold">{activity.particular}</p>
                  <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{friendlyService(activity.serviceType)} · {new Date(activity.transactionAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Txn {money(activity.transactionAmount)}{activity.commissionAmount?" · Comm. "+money(activity.commissionAmount):""}</p>
                </div>
                <div className="text-right">
                  {activity.cashIn?<strong className="money block text-[15px] text-[var(--money-in)]">+{money(activity.cashIn)}</strong>:null}
                  {activity.cashOut?<strong className="money block text-[15px] text-[var(--money-out)]">−{money(activity.cashOut)}</strong>:null}
                  <span className="money mt-0.5 block text-xs font-semibold text-[var(--text-muted)]">Drawer {money(activity.runningBalance)}</span>
                </div>
              </div>
            </button>;
          })}
          </div>
        </div>:<div className="p-5 sm:p-7"><EmptyState title="No cash transactions yet" description="New cash movements will appear here."/></div>}
      </Surface>

      <div id="cash-close-panel" className="scroll-mt-20">
        <Surface className="counter-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div><h3 className="text-sm font-extrabold">{isClosed?"Day closed":"Close cash"}</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{isClosed?"Final cash reconciliation":"Count the drawer when the day is finished"}</p></div>
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
              <p className="mt-2 text-center text-xs text-[var(--text-muted)]">Count only when business is finished.</p>
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
              <label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold">Note <span className="font-normal text-[var(--text-muted)]">(optional)</span></span><textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-base sm:text-sm" placeholder="Closing note" value={remarks} onChange={(event)=>setRemarks(event.target.value)}/></label>
              <button disabled={saving||Math.abs(previewDifference)>.005} className="mt-4 min-h-12 w-full rounded-xl bg-[var(--text)] px-4 text-sm font-bold text-[var(--surface)] disabled:opacity-35">{saving?"Closing…":Math.abs(previewDifference)>.005?"Match cash to close":"Close day"}</button>
            </div>
          </form>}
        </Surface>
      </div>
    </>:null}

    {previousHistory.length?<details className="cash-history-collapsible app-surface overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div><h3 className="text-sm font-extrabold">Previous days</h3><p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{previousHistory.length} closed</p></div>
        <span className="cash-history-chevron text-lg text-[var(--text-muted)]">›</span>
      </summary>
      <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {previousHistory.slice(0,14).map((session)=>{
          const variance=Number(session.differenceAmount||0);
          return <details key={session.id} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{new Date(session.businessDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>
                {session.openedBy?.fullName?<p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">Responsible: {session.openedBy.fullName}</p>:null}
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
