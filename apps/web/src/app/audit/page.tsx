"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Audit={id:string;userId:string;entityType:string;entityId:string;action:string;reason:string|null;oldValues:unknown;newValues:unknown;createdAt:string;user:{id:string;fullName:string;email:string|null}|null};

export default function AuditPage(){
 const [items,setItems]=useState<Audit[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{apiFetch<Audit[]>("/audit").then(setItems).catch(()=>setError("You need Owner/Admin access to view audit history."));},[]);
 return <AppShell><div className="mx-auto max-w-7xl space-y-6">
  <div><h2 className="text-2xl font-bold">Audit Log</h2><p className="text-sm text-slate-500">Recorded transaction, master-data, cash-counter, administrative and reversal actions.</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Time</th><th>Action</th><th>Entity</th><th>Operator</th><th>Reason</th><th>Change</th></tr></thead><tbody>{items.map(a=><tr key={a.id} className="border-t align-top"><td className="px-4 py-3">{new Date(a.createdAt).toLocaleString("en-IN")}</td><td className="font-semibold">{a.action}</td><td>{a.entityType}<br/><span className="text-xs text-slate-500">{a.entityId}</span></td><td><span className="font-medium">{a.user?.fullName??"Unknown user"}</span><br/><span className="text-xs text-slate-500">{a.user?.email??a.userId}</span></td><td>{a.reason??"—"}</td><td><details><summary className="cursor-pointer text-sm">View</summary><pre className="mt-2 max-w-md overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify({before:a.oldValues,after:a.newValues},null,2)}</pre></details></td></tr>)}</tbody></table></div>
 </div></AppShell>;
}
