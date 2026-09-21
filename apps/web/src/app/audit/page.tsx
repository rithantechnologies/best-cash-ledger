"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, Pager, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Audit={
  id:string;userId:string;entityType:string;entityId:string;action:string;reason:string|null;
  oldValues:unknown;newValues:unknown;createdAt:string;
  user:{id:string;fullName:string;email:string|null}|null;
};
type RangeFilter="today"|"7d"|"30d"|"all";
type ChangeRow={field:string;before:unknown;after:unknown};

const PAGE_SIZE=10;
const importantActions=new Set(["DELETE","REVERSE","CANCEL","DEACTIVATE","PASSWORD_RESET","VOID"]);
const actionLabels:Record<string,string>={
  CREATE:"created",UPDATE:"updated",REVERSE:"reversed",CANCEL:"cancelled",CLOSE:"closed",
  OPEN:"opened",COLLECT:"collected",PAY:"paid",PAY_AT_SOURCE:"paid",RECEIVE:"received",
  SNAPSHOT:"saved",PASSWORD_RESET:"reset password for",DEACTIVATE:"deactivated",REACTIVATE:"reactivated",
  DELETE:"deleted",VOID:"voided",APPROVE:"approved",REJECT:"rejected",
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
  const candidates=[source.transactionNumber,source.fullName,source.name,source.accountName,source.customerCode,source.referenceNumber,source.number];
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
function eventTitle(audit:Audit){
  const verb=actionLabels[audit.action]??audit.action.toLowerCase();
  return words(simpleEntity(audit.entityType))+" "+verb;
}
function eventSentence(audit:Audit){
  const person=audit.user?.fullName??"Unknown user";
  return person+" "+(actionLabels[audit.action]??audit.action.toLowerCase())+" "+simpleEntity(audit.entityType);
}
function dateTime(value:string){
  return new Date(value).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function timeLabel(value:string){
  return new Date(value).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
}
function dateLabel(value:string){
  return new Date(value).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
}
function rangeStart(range:RangeFilter){
  const now=new Date(),start=new Date(now);
  if(range==="today")start.setHours(0,0,0,0);
  if(range==="7d")start.setDate(now.getDate()-7);
  if(range==="30d")start.setDate(now.getDate()-30);
  return start;
}
function rangeLabel(range:RangeFilter){
  return range==="today"?"Today":range==="7d"?"Last 7 days":range==="30d"?"Last 30 days":"All history";
}
function Icon({type}:{type:"activity"|"important"|"users"|"module"|"search"|"clock"|"person"|"record"|"change"}){
  const paths={
    activity:<><path d="M4 13h4l2-6 4 10 2-4h4"/><path d="M4 5v14h16"/></>,
    important:<><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/></>,
    users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    module:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    search:<><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    person:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    record:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
    change:<><path d="M7 7h11l-3-3M17 17H6l3 3"/></>,
  };
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
}
function Metric({label,value,detail,tone,icon}:{label:string;value:number;detail:string;tone:"accent"|"rose"|"emerald"|"amber";icon:"activity"|"important"|"users"|"module"}){
  const styles={
    accent:"bg-[var(--accent-soft)] text-[var(--accent)]",
    rose:"bg-rose-50 text-rose-600",emerald:"bg-emerald-50 text-emerald-700",amber:"bg-amber-50 text-amber-700",
  };
  return <Surface className="min-w-0 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.09em] text-[var(--text-muted)]">{label}</p><p className="mt-1 text-2xl font-black tracking-[-.04em]">{value}</p></div>
      <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl "+styles[tone]}><Icon type={icon}/></span>
    </div>
    <p className="mt-2 truncate text-[11px] text-[var(--text-muted)]">{detail}</p>
  </Surface>;
}

export default function AuditPage(){
  const [items,setItems]=useState<Audit[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [q,setQ]=useState(""),[range,setRange]=useState<RangeFilter>("7d");
  const [entity,setEntity]=useState(""),[action,setAction]=useState(""),[person,setPerson]=useState("");
  const [selected,setSelected]=useState<Audit|null>(null),[page,setPage]=useState(1);

  useEffect(()=>{
    apiFetch<Audit[]>("/audit").then(setItems)
      .catch(()=>setError("Owner or Admin access is required to view audit history."))
      .finally(()=>setLoading(false));
  },[]);

  const rangeItems=useMemo(()=>{
    if(range==="all")return items;
    const start=rangeStart(range);
    return items.filter((item)=>new Date(item.createdAt)>=start);
  },[items,range]);
  const entities=useMemo(()=>Array.from(new Set(items.map((item)=>item.entityType))).sort(),[items]);
  const actions=useMemo(()=>Array.from(new Set(items.map((item)=>item.action))).sort(),[items]);
  const people=useMemo(()=>{
    const map=new Map<string,string>();
    items.forEach((item)=>{if(item.user?.id)map.set(item.user.id,item.user.fullName);});
    return Array.from(map.entries()).sort((a,b)=>a[1].localeCompare(b[1]));
  },[items]);

  const filtered=useMemo(()=>rangeItems.filter((item)=>{
    const hay=[eventSentence(item),eventTitle(item),entityName(item),item.reason,item.user?.email,JSON.stringify(item.oldValues),JSON.stringify(item.newValues)]
      .filter(Boolean).join(" ").toLowerCase();
    return (!q.trim()||hay.includes(q.trim().toLowerCase()))
      &&(!entity||item.entityType===entity)&&(!action||item.action===action)&&(!person||item.user?.id===person);
  }),[rangeItems,q,entity,action,person]);

  const activeUsers=new Set(rangeItems.map((item)=>item.user?.id).filter(Boolean)).size;
  const highImpact=rangeItems.filter((item)=>importantActions.has(item.action)).length;
  const modules=new Set(rangeItems.map((item)=>item.entityType)).size;
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const visiblePage=Math.min(page,totalPages);
  const paged=filtered.slice((visiblePage-1)*PAGE_SIZE,visiblePage*PAGE_SIZE);

  if(loading)return <AppShell><PageLoader label="Loading activity history…"/></AppShell>;

  return <AppShell><PageFrame width="max-w-7xl">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--accent)]">Owner view</p>
        <h1 className="text-[1.65rem] font-black tracking-[-.04em] sm:text-[2rem]">Audit & Activity</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">See who changed what across your business, without digging through raw logs.</p>
      </div>
      <select className="app-control w-full sm:w-44" value={range} onChange={(event)=>setRange(event.target.value as RangeFilter)} aria-label="Date range">
        <option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All history</option>
      </select>
    </div>

    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Metric label="Activities" value={rangeItems.length} detail={rangeLabel(range)} tone="accent" icon="activity"/>
      <Metric label="High impact" value={highImpact} detail="Reversals, cancellations & access changes" tone={highImpact?"rose":"emerald"} icon="important"/>
      <Metric label="Users active" value={activeUsers} detail={"People active in "+rangeLabel(range).toLowerCase()} tone="emerald" icon="users"/>
      <Metric label="Areas touched" value={modules} detail="Business record types changed" tone="amber" icon="module"/>
    </div>
    <Surface className="p-3 sm:p-4">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><Icon type="search"/></span>
        <input className="app-control !pl-11" placeholder="Search activity, record, user or reason…" value={q} onChange={(event)=>setQ(event.target.value)}/>
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select className="app-control" value={entity} onChange={(event)=>setEntity(event.target.value)}><option value="">All areas</option>{entities.map((value)=><option key={value} value={value}>{words(value)}</option>)}</select>
        <select className="app-control" value={action} onChange={(event)=>setAction(event.target.value)}><option value="">All actions</option>{actions.map((value)=><option key={value} value={value}>{words(value)}</option>)}</select>
        <select className="app-control" value={person} onChange={(event)=>setPerson(event.target.value)}><option value="">All users</option>{people.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <button type="button" onClick={()=>{setQ("");setEntity("");setAction("");setPerson("");setRange("7d");}} className="app-secondary-button min-h-11 px-4 text-xs font-bold">Reset</button>
      </div>
    </Surface>

    {!filtered.length?<EmptyState title="No activity found" description="Try another date range or clear the filters."/>:
    <Surface className="overflow-hidden">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[var(--surface-soft)] text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]"><tr>
            <th className="px-5 py-3.5">Time</th><th className="px-5 py-3.5">Activity</th><th className="px-5 py-3.5">Area</th><th className="px-5 py-3.5">User</th><th className="px-5 py-3.5">Type</th><th className="w-12 px-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{paged.map((audit)=>{
            const important=importantActions.has(audit.action);
            return <tr key={audit.id} onClick={()=>setSelected(audit)} className="cursor-pointer transition hover:bg-[var(--surface-soft)]">
              <td className="whitespace-nowrap px-5 py-4"><p className="font-bold">{timeLabel(audit.createdAt)}</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{dateLabel(audit.createdAt)}</p></td>
              <td className="px-5 py-4"><p className="font-extrabold">{eventTitle(audit)}</p><p className="mt-0.5 max-w-[320px] truncate text-xs text-[var(--text-muted)]">{entityName(audit)}{audit.reason?" · "+audit.reason:""}</p></td>
              <td className="px-5 py-4 text-xs font-semibold">{words(audit.entityType)}</td>
              <td className="px-5 py-4"><p className="text-xs font-bold">{audit.user?.fullName??"Unknown user"}</p><p className="mt-0.5 max-w-[190px] truncate text-[11px] text-[var(--text-muted)]">{audit.user?.email??"—"}</p></td>
              <td className="px-5 py-4">{important?<StatusBadge tone="rose">High impact</StatusBadge>:<StatusBadge tone="emerald">Recorded</StatusBadge>}</td>
              <td className="px-3 py-4 text-lg text-[var(--text-muted)]">›</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--border)] md:hidden">{paged.map((audit)=>{
        const important=importantActions.has(audit.action);
        return <button key={audit.id} type="button" onClick={()=>setSelected(audit)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-[var(--surface-soft)]">
          <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl "+(important?"bg-rose-50 text-rose-600":"bg-[var(--accent-soft)] text-[var(--accent)]")}><Icon type={important?"important":"activity"}/></span>
          <span className="min-w-0 flex-1"><span className="block font-extrabold">{eventTitle(audit)}</span><span className="mt-1 block truncate text-xs text-[var(--text-muted)]">{entityName(audit)} · {audit.user?.fullName??"Unknown user"}</span><span className="mt-1 block text-[11px] text-[var(--text-muted)]">{dateTime(audit.createdAt)}</span></span>
          <span className="mt-2 text-lg text-[var(--text-muted)]">›</span>
        </button>;
      })}</div>
      <div className="border-t border-[var(--border)] p-4"><Pager total={filtered.length} page={visiblePage} totalPages={totalPages} label="activity" onPrevious={()=>setPage((p)=>Math.max(1,p-1))} onNext={()=>setPage((p)=>Math.min(totalPages,p+1))}/></div>
    </Surface>}
    {selected&&typeof document!=="undefined"?createPortal(
      <div className="fixed inset-0 z-[200] bg-slate-950/40 backdrop-blur-[3px]">
        <button type="button" className="absolute inset-0" onClick={()=>setSelected(null)} aria-label="Close activity detail"/>
        <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {importantActions.has(selected.action)?<StatusBadge tone="rose">High impact</StatusBadge>:<StatusBadge tone="emerald">Recorded</StatusBadge>}
                <span className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--text-muted)]">Audit ID · {selected.id.slice(0,8)}</span>
              </div>
              <h2 className="text-xl font-black tracking-[-.035em]">{eventTitle(selected)}</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">{entityName(selected)} · {words(selected.entityType)}</p>
            </div>
            <button type="button" onClick={()=>setSelected(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-xl text-[var(--text-muted)]" aria-label="Close">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="space-y-5">
              <Surface className="grid grid-cols-2 gap-px overflow-hidden bg-[var(--border)]">
                <div className="bg-[var(--surface)] p-4"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Icon type="clock"/><span className="text-[10px] font-bold uppercase tracking-[.09em]">Date & time</span></div><p className="mt-2 text-sm font-extrabold">{dateTime(selected.createdAt)}</p></div>
                <div className="bg-[var(--surface)] p-4"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Icon type="change"/><span className="text-[10px] font-bold uppercase tracking-[.09em]">Action</span></div><p className="mt-2 text-sm font-extrabold">{words(selected.action)}</p></div>
                <div className="bg-[var(--surface)] p-4"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Icon type="person"/><span className="text-[10px] font-bold uppercase tracking-[.09em]">Performed by</span></div><p className="mt-2 truncate text-sm font-extrabold">{selected.user?.fullName??"Unknown user"}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{selected.user?.email??"—"}</p></div>
                <div className="bg-[var(--surface)] p-4"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Icon type="record"/><span className="text-[10px] font-bold uppercase tracking-[.09em]">Affected record</span></div><p className="mt-2 truncate text-sm font-extrabold">{entityName(selected)}</p></div>
              </Surface>

              {selected.reason?<div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[.12em] text-[var(--text-muted)]">Reason / note</p>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">{selected.reason}</div>
              </div>:null}

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[.12em] text-[var(--text-muted)]">What changed</p>
                {changesFor(selected).length?<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                  {changesFor(selected).map((change,index)=><div key={change.field} className={"p-4 "+(index?"border-t border-[var(--border)]":"")}>
                    <p className="text-xs font-extrabold">{fieldLabel(change.field)}</p>
                    <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="min-w-0 rounded-xl bg-rose-50 px-3 py-2"><p className="text-[9px] font-bold uppercase text-rose-500">Before</p><p className="mt-1 break-words text-xs font-semibold text-rose-700">{formatValue(change.before)}</p></div>
                      <span className="text-[var(--text-muted)]">→</span>
                      <div className="min-w-0 rounded-xl bg-emerald-50 px-3 py-2"><p className="text-[9px] font-bold uppercase text-emerald-600">After</p><p className="mt-1 break-words text-xs font-semibold text-emerald-700">{formatValue(change.after)}</p></div>
                    </div>
                  </div>)}
                </div>:<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-xs leading-5 text-[var(--text-muted)]">No before/after values were stored for this activity.</div>}
              </div>
              <details className="rounded-2xl border border-[var(--border)]">
                <summary className="cursor-pointer px-4 py-3.5 text-xs font-extrabold">Technical details</summary>
                <div className="border-t border-[var(--border)] p-4">
                  <div className="space-y-1.5 text-[11px] text-[var(--text-muted)]">
                    <p><strong className="text-[var(--text)]">Entity:</strong> {selected.entityType}</p>
                    <p><strong className="text-[var(--text)]">Entity ID:</strong> {selected.entityId}</p>
                    <p><strong className="text-[var(--text)]">Audit ID:</strong> {selected.id}</p>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Previous data</p>
                      <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-slate-200">{JSON.stringify(selected.oldValues,null,2)??"null"}</pre>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">New data</p>
                      <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-slate-200">{JSON.stringify(selected.newValues,null,2)??"null"}</pre>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4 sm:px-6">
            <button type="button" onClick={()=>setSelected(null)} className="app-secondary-button min-h-11 w-full text-sm font-bold">Close</button>
          </div>
        </aside>
      </div>,document.body
    ):null}
  </PageFrame></AppShell>;
}
