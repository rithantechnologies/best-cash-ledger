"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Audit = {
  id:string; userId:string; entityType:string; entityId:string; action:string; reason:string|null;
  oldValues:unknown; newValues:unknown; createdAt:string;
  user:{id:string;fullName:string;email:string|null}|null;
};
type RangeFilter="all"|"today"|"7d"|"30d";
type ChangeRow={field:string;before:unknown;after:unknown};

const attentionActions=new Set(["REVERSE","CANCEL","DEACTIVATE","PASSWORD_RESET"]);
const actionLabels:Record<string,string>={
  CREATE:"Created",UPDATE:"Updated",REVERSE:"Reversed",CANCEL:"Cancelled",CLOSE:"Closed",
  OPEN:"Opened",COLLECT:"Collected",PAY:"Paid",PAY_AT_SOURCE:"Paid at source",
  RECEIVE:"Received",SNAPSHOT:"Snapshot taken",PASSWORD_RESET:"Password reset",
  DEACTIVATE:"Disabled",REACTIVATE:"Reactivated",
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
  const keys=Array.from(new Set([...Object.keys(before),...Object.keys(after)]));
  return keys.filter((key)=>JSON.stringify(before[key])!==JSON.stringify(after[key]))
    .map((key)=>({field:key,before:before[key],after:after[key]}));
}

function entityName(audit:Audit){
  const source={...asObject(audit.oldValues),...asObject(audit.newValues)};
  const candidates=[source.transactionNumber,source.fullName,source.name,source.accountName,source.customerCode,source.referenceNumber];
  const found=candidates.find((value)=>typeof value==="string"&&value.trim());
  return found?String(found):"#"+audit.entityId.slice(0,8);
}
function actionTone(action:string):"slate"|"emerald"|"indigo"|"amber"|"rose"|"cyan"{
  if(["REVERSE","CANCEL","DEACTIVATE","PASSWORD_RESET"].includes(action))return "rose";
  if(["CREATE","REACTIVATE","RECEIVE","COLLECT"].includes(action))return "emerald";
  if(["UPDATE","PAY","PAY_AT_SOURCE"].includes(action))return "indigo";
  if(["CLOSE","OPEN"].includes(action))return "amber";
  return "slate";
}
function actionText(audit:Audit){
  return (actionLabels[audit.action]??words(audit.action))+" "+words(audit.entityType);
}
function dateKey(dateString:string){return new Date(dateString).toDateString();}
function timeText(dateString:string){
  return new Date(dateString).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
}
function relativeDay(dateString:string){
  const value=new Date(dateString),now=new Date();
  if(value.toDateString()===now.toDateString())return "Today";
  const yesterday=new Date();yesterday.setDate(now.getDate()-1);
  if(value.toDateString()===yesterday.toDateString())return "Yesterday";
  return value.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:value.getFullYear()===now.getFullYear()?undefined:"numeric"});
}

function AuditIcon({action}:{action:string}){
  const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  if(["REVERSE","CANCEL"].includes(action))return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...common}><path d="M9 7H4v-5"/><path d="M4 7a9 9 0 1 1-1 9"/><path d="m9 10 6 6M15 10l-6 6"/></svg>;
  if(["CREATE","REACTIVATE"].includes(action))return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if(action==="PASSWORD_RESET")return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...common}><circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20 12v2"/></svg>;
  if(action==="DEACTIVATE")return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...common}><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...common}><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h7"/></svg>;
}

export default function AuditPage(){
  const [items,setItems]=useState<Audit[]>([]);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [q,setQ]=useState(""),[entity,setEntity]=useState(""),[action,setAction]=useState(""),[operator,setOperator]=useState("");
  const [range,setRange]=useState<RangeFilter>("30d");
  const [selected,setSelected]=useState<Audit|null>(null);

  useEffect(()=>{
    apiFetch<Audit[]>("/audit").then(setItems)
      .catch(()=>setError("Owner or Admin access is required to view audit history."))
      .finally(()=>setLoading(false));
  },[]);

  const entities=useMemo(()=>Array.from(new Set(items.map((item)=>item.entityType))).sort(),[items]);
  const actions=useMemo(()=>Array.from(new Set(items.map((item)=>item.action))).sort(),[items]);
  const operators=useMemo(()=>{
    const unique=new Map<string,string>();
    items.forEach((item)=>{if(item.user?.id)unique.set(item.user.id,item.user.fullName);});
    return Array.from(unique.entries()).sort((a,b)=>a[1].localeCompare(b[1]));
  },[items]);

  const filtered=useMemo(()=>{
    const now=new Date(),start=new Date(now);
    if(range==="today")start.setHours(0,0,0,0);
    if(range==="7d")start.setDate(now.getDate()-7);
    if(range==="30d")start.setDate(now.getDate()-30);
    return items.filter((item)=>{
      const searchable=[item.action,item.entityType,item.entityId,item.user?.fullName,item.user?.email,item.reason,JSON.stringify(item.oldValues),JSON.stringify(item.newValues)]
        .filter(Boolean).join(" ").toLowerCase();
      return (!q.trim()||searchable.includes(q.trim().toLowerCase()))
        &&(!entity||item.entityType===entity)
        &&(!action||item.action===action)
        &&(!operator||item.user?.id===operator)
        &&(range==="all"||new Date(item.createdAt)>=start);
    });
  },[items,q,entity,action,operator,range]);

  const todayCount=items.filter((item)=>dateKey(item.createdAt)===new Date().toDateString()).length;
  const attentionToday=items.filter((item)=>dateKey(item.createdAt)===new Date().toDateString()&&attentionActions.has(item.action)).length;
  const operatorCount=new Set(items.map((item)=>item.user?.id).filter(Boolean)).size;
  const grouped=useMemo(()=>{
    const map=new Map<string,Audit[]>();
    filtered.forEach((item)=>{const key=dateKey(item.createdAt);map.set(key,[...(map.get(key)??[]),item]);});
    return Array.from(map.entries());
  },[filtered]);

  if(loading)return <AppShell><PageLoader label="Loading audit activity…"/></AppShell>;

  return <AppShell><PageFrame className="audit-page">
    <SectionHeading
      eyebrow="Owner controls"
      title="Audit activity"
      description="A clear record of who changed what, when it happened, and what was different."
    />
    {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>:null}

    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Surface className="audit-stat p-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Changes today</p><p className="mt-1.5 text-2xl font-black tracking-[-.04em]">{todayCount}</p></div>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><AuditIcon action="UPDATE"/></span>
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">All actions recorded today</p>
      </Surface>

      <Surface className="audit-stat p-4">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Needs attention</p><p className={"mt-1.5 text-2xl font-black tracking-[-.04em] "+(attentionToday?"text-rose-600":"text-emerald-700")}>{attentionToday}</p></div>
          <span className={"grid h-9 w-9 place-items-center rounded-xl "+(attentionToday?"bg-rose-50 text-rose-600":"bg-emerald-50 text-emerald-700")}><AuditIcon action={attentionToday?"REVERSE":"CREATE"}/></span>
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">Reversals, cancellations or access changes</p>
      </Surface>
      <Surface className="audit-stat p-4">
        <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">People active</p>
        <p className="mt-1.5 text-2xl font-black tracking-[-.04em]">{operatorCount}</p>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">Operators represented in this history</p>
      </Surface>
      <Surface className="audit-stat p-4">
        <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Records tracked</p>
        <p className="mt-1.5 text-2xl font-black tracking-[-.04em]">{items.length}</p>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">Latest audit records retained here</p>
      </Surface>
    </div>

    <Surface className={"overflow-hidden border-l-4 "+(attentionToday?"border-l-rose-500":"border-l-emerald-500")}>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={"mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl "+(attentionToday?"bg-rose-50 text-rose-600":"bg-emerald-50 text-emerald-700")}><AuditIcon action={attentionToday?"REVERSE":"CREATE"}/></span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold">{attentionToday?(attentionToday+" high-attention action"+(attentionToday===1?"":"s")+" today"):"No high-attention actions today"}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{attentionToday?"Review reversals, cancellations, disabled users and password resets below.":"No reversals, cancellations, disabled users or password resets have been recorded today."}</p>
        </div>
      </div>
    </Surface>

    <Surface className="p-3 sm:p-4">
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px_190px_150px]">
        <div className="relative">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
          <input className="app-control !pl-10" placeholder="Search person, action or record…" value={q} onChange={(event)=>setQ(event.target.value)}/>
        </div>
        <select className="app-control" value={range} onChange={(event)=>setRange(event.target.value as RangeFilter)}>
          <option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All history</option>
        </select>
        <select className="app-control" value={entity} onChange={(event)=>setEntity(event.target.value)}>
          <option value="">All record types</option>{entities.map((value)=><option key={value} value={value}>{words(value)}</option>)}
        </select>
        <select className="app-control" value={action} onChange={(event)=>setAction(event.target.value)}>
          <option value="">All actions</option>{actions.map((value)=><option key={value} value={value}>{actionLabels[value]??words(value)}</option>)}
        </select>
        <select className="app-control" value={operator} onChange={(event)=>setOperator(event.target.value)}>
          <option value="">All people</option>{operators.map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <p className="text-xs font-medium text-[var(--text-muted)]">Showing <strong className="text-[var(--text)]">{filtered.length}</strong> of {items.length} records</p>
        {(q||entity||action||operator||range!=="30d")?<button type="button" onClick={()=>{setQ("");setEntity("");setAction("");setOperator("");setRange("30d");}} className="text-xs font-bold text-[var(--accent)]">Clear filters</button>:null}
      </div>
    </Surface>

    {!filtered.length?<EmptyState title="No audit activity found" description="Try clearing a filter or choosing a wider date range."/>:(
      <div className="space-y-5">
        {grouped.map(([day,rows])=><section key={day}>
          <div className="mb-2.5 flex items-center gap-3">
            <h3 className="text-xs font-black uppercase tracking-[.12em] text-[var(--text-muted)]">{relativeDay(rows[0].createdAt)}</h3>
            <span className="h-px flex-1 bg-[var(--border)]"/>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">{rows.length} event{rows.length===1?"":"s"}</span>
          </div>

          <div className="space-y-2.5 md:hidden">
            {rows.map((audit)=>{
              const attention=attentionActions.has(audit.action),count=changesFor(audit).length;
              return <Surface key={audit.id} className={"overflow-hidden "+(attention?"ring-1 ring-rose-200":"")}>
                <button type="button" onClick={()=>setSelected(audit)} className="w-full p-4 text-left">
                  <div className="flex items-start gap-3">
                    <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl "+(attention?"bg-rose-50 text-rose-600":"bg-[var(--accent-soft)] text-[var(--accent)]")}><AuditIcon action={audit.action}/></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="truncate text-[15px] font-extrabold tracking-[-.015em]">{actionText(audit)}</p><p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-muted)]">{entityName(audit)}</p></div>
                        <span className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)]">{timeText(audit.createdAt)}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--surface-soft)] text-[9px] font-black">{audit.user?.fullName?.charAt(0)??"?"}</span>{audit.user?.fullName??"Unknown user"}</span>
                        <StatusBadge tone={actionTone(audit.action)}>{actionLabels[audit.action]??words(audit.action)}</StatusBadge>
                        {count?<span className="text-[11px] font-medium text-[var(--text-muted)]">{count} field{count===1?"":"s"} changed</span>:null}
                      </div>
                      {audit.reason?<p className="mt-3 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs leading-5 text-[var(--text-muted)]"><strong className="text-[var(--text)]">Reason:</strong> {audit.reason}</p>:null}
                    </div>
                  </div>
                </button>
              </Surface>;
            })}
          </div>

          <Surface className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px]">
                <thead><tr><th className="pl-5 text-left">Time</th><th className="text-left">What happened</th><th className="text-left">Record</th><th className="text-left">Done by</th><th className="text-left">Reason</th><th className="pr-5 text-right">Details</th></tr></thead>
                <tbody>{rows.map((audit)=>{
                  const count=changesFor(audit).length;
                  return <tr key={audit.id} className="align-middle">

                    <td className="pl-5 text-xs font-semibold text-[var(--text-muted)]">{timeText(audit.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-xl "+(attentionActions.has(audit.action)?"bg-rose-50 text-rose-600":"bg-[var(--accent-soft)] text-[var(--accent)]")}><AuditIcon action={audit.action}/></span>
                        <div><p className="font-bold">{actionText(audit)}</p><StatusBadge tone={actionTone(audit.action)}>{actionLabels[audit.action]??words(audit.action)}</StatusBadge></div>
                      </div>
                    </td>
                    <td><p className="font-semibold">{entityName(audit)}</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{words(audit.entityType)}</p></td>
                    <td><p className="font-semibold">{audit.user?.fullName??"Unknown user"}</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{audit.user?.email??("User ID "+audit.userId.slice(0,8))}</p></td>
                    <td className="max-w-[260px]"><p className="truncate text-xs text-[var(--text-muted)]">{audit.reason??(count?(count+" field"+(count===1?"":"s")+" changed"):"No reason recorded")}</p></td>
                    <td className="pr-5 text-right"><button type="button" onClick={()=>setSelected(audit)} className="app-secondary-button min-h-9 px-3 text-xs font-bold">Review</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </Surface>
        </section>)}
      </div>
    )}

    {selected&&typeof document!=="undefined"?createPortal(
      <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/50 backdrop-blur-[4px] sm:items-center sm:p-5">
        <button type="button" className="absolute inset-0" onClick={()=>setSelected(null)} aria-label="Close audit detail"/>
        <section className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:max-w-2xl sm:rounded-[26px]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--accent)]">Audit detail</p>
              <h3 className="mt-1 truncate text-lg font-black tracking-[-.025em]">{actionText(selected)}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{relativeDay(selected.createdAt)} at {timeText(selected.createdAt)} · {selected.user?.fullName??"Unknown user"}</p>
            </div>
            <button type="button" onClick={()=>setSelected(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] text-xl text-[var(--text-muted)]" aria-label="Close audit detail">×</button>
          </div>
          <div className="overflow-y-auto p-5 sm:p-6">
            <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">Record</p>
            <p className="mt-1 text-sm font-bold">{entityName(selected)}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{words(selected.entityType)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">Action</p>
            <div className="mt-1"><StatusBadge tone={actionTone(selected.action)}>{actionLabels[selected.action]??words(selected.action)}</StatusBadge></div>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">Done by</p>
          <p className="mt-1.5 text-sm font-extrabold">{selected.user?.fullName??"Unknown user"}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{selected.user?.email??("User ID "+selected.userId)}</p>
        </div>
        {selected.reason?<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-amber-700">Reason recorded</p>
          <p className="mt-1.5 text-sm font-semibold leading-5 text-amber-900">{selected.reason}</p>
        </div>:null}

        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div><p className="text-sm font-extrabold">What changed</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Before and after values stored in the audit record.</p></div>
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">{changesFor(selected).length} change{changesFor(selected).length===1?"":"s"}</span>
          </div>
          {changesFor(selected).length?<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            {changesFor(selected).map((change,index)=><div key={change.field} className={"grid gap-2 p-3 sm:grid-cols-[150px_1fr_24px_1fr] sm:items-center "+(index?"border-t border-[var(--border)]":"")}>
              <p className="text-xs font-bold">{fieldLabel(change.field)}</p>
              <p className="min-w-0 break-words rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{formatValue(change.before)}</p>
              <span className="hidden text-center text-[var(--text-muted)] sm:block">→</span>
              <p className="min-w-0 break-words rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{formatValue(change.after)}</p>
            </div>)}
          </div>:<div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-4 text-xs text-[var(--text-muted)]">This action did not record field-level before/after values.</div>}
        </div>
        <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
          <summary className="cursor-pointer text-xs font-bold text-[var(--text-muted)]">Technical record</summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-slate-200">{JSON.stringify({id:selected.id,entityId:selected.entityId,before:selected.oldValues,after:selected.newValues},null,2)}</pre>
        </details>
            </div>
          </div>
        </section>
      </div>,
      document.body
    ):null}
  </PageFrame></AppShell>;
}
