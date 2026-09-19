"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageFrame, PageLoader, SectionHeading, StatusBadge, Surface } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Audit={
  id:string;userId:string;entityType:string;entityId:string;action:string;reason:string|null;
  oldValues:unknown;newValues:unknown;createdAt:string;
  user:{id:string;fullName:string;email:string|null}|null;
};

export default function AuditPage(){
 const [items,setItems]=useState<Audit[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [q,setQ]=useState("");
 const [entity,setEntity]=useState("");

 useEffect(()=>{
  apiFetch<Audit[]>("/audit").then(setItems)
   .catch(()=>setError("You need Owner/Admin access to view audit history."))
   .finally(()=>setLoading(false));
 },[]);
 const entities=useMemo(()=>Array.from(new Set(items.map(x=>x.entityType))).sort(),[items]);
 const filtered=useMemo(()=>items.filter(a=>{
  const hay=[a.action,a.entityType,a.entityId,a.user?.fullName,a.user?.email,a.reason].filter(Boolean).join(" ").toLowerCase();
  return (!q.trim()||hay.includes(q.trim().toLowerCase()))&&(!entity||a.entityType===entity);
 }),[items,q,entity]);
 const todayCount=items.filter(x=>new Date(x.createdAt).toDateString()===new Date().toDateString()).length;
 const operators=new Set(items.map(x=>x.user?.id).filter(Boolean)).size;

 if(loading)return <AppShell><PageLoader label="Loading audit trail…"/></AppShell>;
 return <AppShell><PageFrame>
  <SectionHeading eyebrow="Governance" title="Audit trail" description="Every sensitive operational and administrative change, searchable in one place."/>
  {error?<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>:null}

  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
   <Surface className="p-3.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Records</p><p className="mt-1 text-xl font-black">{items.length}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Today</p><p className="mt-1 text-xl font-black text-indigo-700">{todayCount}</p></Surface>
   <Surface className="p-3.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Operators</p><p className="mt-1 text-xl font-black">{operators}</p></Surface>
  </div>
  <Surface className="p-3 sm:p-4">
   <div className="grid gap-2.5 sm:grid-cols-[1fr_240px]">
    <input className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" placeholder="Search action, operator, reason…" value={q} onChange={e=>setQ(e.target.value)}/>
    <select className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={entity} onChange={e=>setEntity(e.target.value)}>
     <option value="">All entity types</option>{entities.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}
    </select>
   </div>
  </Surface>

  {!filtered.length?<EmptyState title="No audit records match" description="Try a different search or entity type."/>:<>
   <div className="space-y-2 md:hidden">{filtered.map(a=><Surface key={a.id} className="p-4">
    <div className="flex items-start justify-between gap-3">
     <div className="min-w-0"><p className="truncate text-sm font-bold">{a.action.replaceAll("_"," ")}</p><p className="mt-0.5 text-[11px] text-slate-400">{new Date(a.createdAt).toLocaleString("en-IN")}</p></div>
     <StatusBadge tone="indigo">{a.entityType.replaceAll("_"," ")}</StatusBadge>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
     <div><p className="text-slate-400">Operator</p><p className="mt-1 truncate font-semibold">{a.user?.fullName??"Unknown"}</p></div>
     <div><p className="text-slate-400">Entity</p><p className="mt-1 truncate font-mono text-[10px]">{a.entityId}</p></div>
    </div>
    {a.reason?<p className="mt-3 text-xs leading-5 text-slate-600">{a.reason}</p>:null}
    <details className="mt-3 border-t border-slate-100 pt-3 text-xs"><summary className="cursor-pointer font-bold text-indigo-600">View recorded change</summary><pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details>
   </Surface>)}</div>
   <Surface className="hidden overflow-hidden md:block">
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
     <thead className="bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-[.12em] text-slate-400"><tr><th className="px-5 py-3">Time</th><th>Action</th><th>Entity</th><th>Operator</th><th>Reason</th><th className="pr-5">Change</th></tr></thead>
     <tbody>{filtered.map(a=><tr key={a.id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
      <td className="px-5 py-3 text-xs text-slate-500">{new Date(a.createdAt).toLocaleString("en-IN")}</td>
      <td className="font-semibold">{a.action.replaceAll("_"," ")}</td>
      <td><span className="font-medium">{a.entityType.replaceAll("_"," ")}</span><br/><span className="font-mono text-[10px] text-slate-400">{a.entityId}</span></td>
      <td><span className="font-medium">{a.user?.fullName??"Unknown user"}</span><br/><span className="text-[11px] text-slate-400">{a.user?.email??a.userId}</span></td>
      <td className="max-w-xs text-slate-600">{a.reason??"—"}</td>
      <td className="pr-5"><details><summary className="cursor-pointer text-xs font-bold text-indigo-600">View</summary><pre className="mt-2 max-w-md overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details></td>
     </tr>)}</tbody>
    </table></div>
   </Surface>
  </>}
 </PageFrame></AppShell>;
}
