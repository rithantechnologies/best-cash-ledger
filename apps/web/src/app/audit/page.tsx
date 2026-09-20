"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, SectionHeading, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Audit={
  id:string;userId:string;entityType:string;entityId:string;action:string;reason:string|null;
  oldValues:unknown;newValues:unknown;createdAt:string;
  user:{id:string;fullName:string;email:string|null}|null;
};
type RangeFilter="today"|"7d"|"30d"|"all";
type ChangeRow={field:string;before:unknown;after:unknown};

const importantActions=new Set(["REVERSE","CANCEL","DEACTIVATE","PASSWORD_RESET"]);
const actionLabels:Record<string,string>={
  CREATE:"created",UPDATE:"updated",REVERSE:"reversed",CANCEL:"cancelled",CLOSE:"closed",
  OPEN:"opened",COLLECT:"collected",PAY:"paid",PAY_AT_SOURCE:"paid",RECEIVE:"received",
  SNAPSHOT:"saved",PASSWORD_RESET:"reset password for",DEACTIVATE:"disabled",REACTIVATE:"reactivated",
};

function words(value:string){
  return value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,(letter)=>letter.toUpperCase());
}
function fieldLabel(value:string){
  return value.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());
}
function asObject(value:unknown):Record<string,unknown>{
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function formatValue(value:unknown){
  if(value===null||value===undefined||value==="")return "—";
  if(typeof value==="boolean")return value?"Yes":"No";
  if(typeof value==="object")return JSON.stringify(value);
  return String(value);
}
function changesFor(audit:Audit):ChangeRow[]{
  const before=asObject(audit.oldValues),after=asObject(audit.newValues);
  return Array.from(new Set([...Object.keys(before),...Object.keys(after)]))
    .filter((key)=>JSON.stringify(before[key])!==JSON.stringify(after[key]))
    .map((key)=>({field:key,before:before[key],after:after[key]}));
}

function entityName(audit:Audit){
  const source={...asObject(audit.oldValues),...asObject(audit.newValues)};
  const candidates=[source.transactionNumber,source.fullName,source.name,source.accountName,source.customerCode,source.referenceNumber];
  const found=candidates.find((value)=>typeof value==="string"&&value.trim());
  return found?String(found):"#"+audit.entityId.slice(0,8);
}
function simpleEntity(value:string){
  const map:Record<string,string>={
    TRANSACTION:"transaction",USER:"user",CUSTOMER:"customer",CUSTOMER_CARD:"customer card",
    PAYMENT_TERM:"payment term",EXPENSE_CATEGORY:"expense category",COMMISSION_RULE:"commission rule",
    FINANCIAL_ACCOUNT:"account",PROVIDER_SETTLEMENT:"provider settlement",PAYABLE:"payable",
    RECEIVABLE:"receivable",CASH_COUNTER:"cash counter",END_OF_DAY:"end of day",
  };
  return map[value]??words(value).toLowerCase();
}
function eventSentence(audit:Audit){
  const person=audit.user?.fullName??"Unknown user";
  const verb=actionLabels[audit.action]??audit.action.toLowerCase();
  return person+" "+verb+" "+simpleEntity(audit.entityType);
}
function dateKey(value:string){return new Date(value).toDateString();}

function dayLabel(value:string){
  const date=new Date(value),now=new Date();
  if(date.toDateString()===now.toDateString())return "Today";
  const yesterday=new Date();yesterday.setDate(now.getDate()-1);
  if(date.toDateString()===yesterday.toDateString())return "Yesterday";
  return date.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:date.getFullYear()===now.getFullYear()?undefined:"numeric"});
}
function timeLabel(value:string){
  return new Date(value).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
}
function EventIcon({important}:{important:boolean}){
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {important?<><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/></>:<><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.3 2.3 4.8-5"/></>}
  </svg>;
}

export default function AuditPage(){
  const [items,setItems]=useState<Audit[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [q,setQ]=useState(""),[range,setRange]=useState<RangeFilter>("7d");
  const [entity,setEntity]=useState(""),[action,setAction]=useState(""),[person,setPerson]=useState("");
  const [selected,setSelected]=useState<Audit|null>(null);

  useEffect(()=>{
    apiFetch<Audit[]>("/audit").then(setItems)
      .catch(()=>setError("Owner or Admin access is required to view audit history."))
      .finally(()=>setLoading(false));
  },[]);

  const entities=useMemo(()=>Array.from(new Set(items.map((item)=>item.entityType))).sort(),[items]);
  const actions=useMemo(()=>Array.from(new Set(items.map((item)=>item.action))).sort(),[items]);
  const people=useMemo(()=>{
    const map=new Map<string,string>();
    items.forEach((item)=>{if(item.user?.id)map.set(item.user.id,item.user.fullName);});
    return Array.from(map.entries()).sort((a,b)=>a[1].localeCompare(b[1]));
  },[items]);

  const filtered=useMemo(()=>{
    const now=new Date(),start=new Date(now);
    if(range==="today")start.setHours(0,0,0,0);
    if(range==="7d")start.setDate(now.getDate()-7);
    if(range==="30d")start.setDate(now.getDate()-30);
    return items.filter((item)=>{
      const hay=[eventSentence(item),entityName(item),item.reason,item.user?.email,JSON.stringify(item.oldValues),JSON.stringify(item.newValues)]
        .filter(Boolean).join(" ").toLowerCase();
      return (!q.trim()||hay.includes(q.trim().toLowerCase()))
        &&(!entity||item.entityType===entity)&&(!action||item.action===action)
        &&(!person||item.user?.id===person)&&(range==="all"||new Date(item.createdAt)>=start);
    });
  },[items,q,range,entity,action,person]);

  const todayKey=new Date().toDateString();
  const todayCount=items.filter((item)=>dateKey(item.createdAt)===todayKey).length;
  const importantToday=items.filter((item)=>dateKey(item.createdAt)===todayKey&&importantActions.has(item.action)).length;
  const peopleToday=new Set(items.filter((item)=>dateKey(item.createdAt)===todayKey).map((item)=>item.user?.id).filter(Boolean)).size;
  const grouped=useMemo(()=>{
    const map=new Map<string,Audit[]>();
    filtered.forEach((item)=>{const key=dateKey(item.createdAt);map.set(key,[...(map.get(key)??[]),item]);});
    return Array.from(map.entries());
  },[filtered]);

  if(loading)return <AppShell><PageLoader label="Loading activity history…"/></AppShell>;

  return <AppShell><PageFrame width="max-w-5xl">
    <SectionHeading
      eyebrow="Owner view"
      title="Activity history"
      description="See the important changes made in Cash Ledger. Tap any item for more information."
    />
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

    <div className="grid grid-cols-3 gap-2.5">
      <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Today</p><p className="mt-1 text-2xl font-black">{todayCount}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">changes</p></Surface>
      <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Important</p><p className={"mt-1 text-2xl font-black "+(importantToday?"text-rose-600":"text-emerald-700")}>{importantToday}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">today</p></Surface>
      <Surface className="p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Staff active</p><p className="mt-1 text-2xl font-black">{peopleToday}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">today</p></Surface>
    </div>

    <Surface className="p-3 sm:p-4">
      <div className="grid gap-2.5 sm:grid-cols-[1fr_170px]">
        <div className="relative">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          <input className="app-control !pl-10" placeholder="Search activity…" value={q} onChange={(event)=>setQ(event.target.value)}/>
        </div>
        <select className="app-control" value={range} onChange={(event)=>setRange(event.target.value as RangeFilter)}>
          <option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All history</option>
        </select>
      </div>
      <details className="mt-3 border-t border-[var(--border)] pt-3">
        <summary className="cursor-pointer text-xs font-bold text-[var(--accent)]">More filters</summary>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <select className="app-control" value={entity} onChange={(event)=>setEntity(event.target.value)}><option value="">All types</option>{entities.map((value)=><option key={value} value={value}>{words(value)}</option>)}</select>
          <select className="app-control" value={action} onChange={(event)=>setAction(event.target.value)}><option value="">All actions</option>{actions.map((value)=><option key={value} value={value}>{words(value)}</option>)}</select>
          <select className="app-control" value={person} onChange={(event)=>setPerson(event.target.value)}><option value="">All staff</option>{people.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        </div>
      </details>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
        <span>{filtered.length} activit{filtered.length===1?"y":"ies"}</span>
        {(q||entity||action||person||range!=="7d")?<button type="button" onClick={()=>{setQ("");setEntity("");setAction("");setPerson("");setRange("7d");}} className="font-bold text-[var(--accent)]">Reset</button>:null}
      </div>
    </Surface>

    {!filtered.length?<EmptyState title="No activity found" description="Try another date range or clear the filters."/>:(
      <div className="space-y-5">
        {grouped.map(([day,rows])=><section key={day}>
          <div className="mb-2.5 flex items-center gap-3">
            <h3 className="text-xs font-black uppercase tracking-[.12em] text-[var(--text-muted)]">{dayLabel(rows[0].createdAt)}</h3>
            <span className="h-px flex-1 bg-[var(--border)]"/>
          </div>
          <Surface className="overflow-hidden">
            <div className="divide-y divide-[var(--border)]">
              {rows.map((audit)=>{
                const important=importantActions.has(audit.action);
                return <button key={audit.id} type="button" onClick={()=>setSelected(audit)}
                  className="group flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-soft)] sm:px-5">
                  <span className={"mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl "+(important?"bg-rose-50 text-rose-600":"bg-[var(--accent-soft)] text-[var(--accent)]")}><EventIcon important={important}/></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold leading-5 text-[var(--text)] sm:text-[15px]">{eventSentence(audit)}</p>
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{entityName(audit)} · {timeLabel(audit.createdAt)}</p>
                    {audit.reason?<p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">Reason: {audit.reason}</p>:null}
                  </div>
                  <span className="mt-2 text-lg leading-none text-[var(--text-muted)] group-hover:text-[var(--accent)]">›</span>
                </button>;
              })}
            </div>
          </Surface>
        </section>)}
      </div>
    )}

    {selected&&typeof document!=="undefined"?createPortal(
      <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/50 backdrop-blur-[4px] sm:items-center sm:p-5">
        <button type="button" className="absolute inset-0" onClick={()=>setSelected(null)} aria-label="Close activity detail"/>
        <section className="relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:max-w-xl sm:rounded-[26px]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.13em] text-[var(--accent)]">What happened</p>
              <h3 className="mt-1 text-lg font-black leading-6 tracking-[-.025em]">{eventSentence(selected)}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{dayLabel(selected.createdAt)} · {timeLabel(selected.createdAt)}</p>
            </div>
            <button type="button" onClick={()=>setSelected(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-xl text-[var(--text-muted)]" aria-label="Close">×</button>
          </div>

          <div className="overflow-y-auto p-5">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Done by</p><p className="mt-1 text-sm font-extrabold">{selected.user?.fullName??"Unknown user"}</p></div>
                <div className="rounded-2xl bg-[var(--surface-soft)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Record</p><p className="mt-1 truncate text-sm font-extrabold">{entityName(selected)}</p></div>
              </div>

              {selected.reason?<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.08em] text-amber-700">Reason</p>
                <p className="mt-1.5 text-sm font-semibold leading-5 text-amber-900">{selected.reason}</p>
              </div>:null}

              {changesFor(selected).length?<div>
                <div className="mb-2"><p className="text-sm font-extrabold">Changes</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Only the values that changed are shown.</p></div>
                <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                  {changesFor(selected).map((change,index)=><div key={change.field} className={"p-3 "+(index?"border-t border-[var(--border)]":"")}>
                    <p className="mb-2 text-xs font-bold">{fieldLabel(change.field)}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-rose-50 px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[.08em] text-rose-500">Before</p><p className="mt-1 break-words text-xs font-semibold text-rose-700">{formatValue(change.before)}</p></div>
                      <div className="rounded-xl bg-emerald-50 px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[.08em] text-emerald-600">After</p><p className="mt-1 break-words text-xs font-semibold text-emerald-700">{formatValue(change.after)}</p></div>
                    </div>
                  </div>)}
                </div>
              </div>:<div className="rounded-2xl bg-[var(--surface-soft)] p-4 text-xs leading-5 text-[var(--text-muted)]">No before/after values were recorded for this activity.</div>}

              <details className="rounded-2xl border border-[var(--border)] p-3">
                <summary className="cursor-pointer text-xs font-bold text-[var(--text-muted)]">Advanced details</summary>

                <div className="mt-3 space-y-2 text-[11px] text-[var(--text-muted)]">
                  <p><strong className="text-[var(--text)]">Type:</strong> {words(selected.entityType)}</p>
                  <p><strong className="text-[var(--text)]">Record ID:</strong> {selected.entityId}</p>
                  <p><strong className="text-[var(--text)]">Audit ID:</strong> {selected.id}</p>
                </div>
              </details>
            </div>
          </div>
        </section>
      </div>,
      document.body
    ):null}
  </PageFrame></AppShell>;
}
