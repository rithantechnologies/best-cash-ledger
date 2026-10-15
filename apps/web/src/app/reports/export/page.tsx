"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageFrame, Surface } from "@/components/ui";

type Scope = "all" | "cash" | "card" | "accounts" | "income";
const scopes: { value: Scope; title: string; description: string }[] = [
  { value: "all", title: "Complete Business Data", description: "All transaction, account, drawer, payout, service, pending and audit worksheets" },
  { value: "cash", title: "Cash and Daily Cash Book", description: "Cash movements, sessions, denominations, transfers and handovers" },
  { value: "card", title: "Cards and Customer Balances", description: "Card swipes, payouts, card dues, collections and receivables" },
  { value: "accounts", title: "Accounts and Wallets", description: "Bank, UPI, wallet and cash account ledgers" },
  { value: "income", title: "Income and Expenses", description: "Services, commissions, provider fees, expenses, AEPS and Micro ATM" },
];
function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone:"Asia/Kolkata", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const p=(key:string)=>parts.find(part=>part.type===key)?.value ?? "";
  return p("year")+"-"+p("month")+"-"+p("day");
}
function shift(day:string, count:number) {
  const d=new Date(day+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+count);
  return d.toISOString().slice(0,10);
}
export default function ExportDataPage() {
  const [today] = useState(indiaToday);
  const [from,setFrom] = useState(()=>indiaToday().slice(0,8)+"01");
  const [to,setTo] = useState(indiaToday);
  const [scope,setScope] = useState<Scope>("all");
  const [preset,setPreset] = useState("month");
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [role,setRole] = useState("");
  useEffect(()=>{try{setRole(JSON.parse(localStorage.getItem("cashledger_user")||"{}").role||"");}catch{setRole("");}},[]);
  function choose(value:string) {
    setPreset(value);
    if(value==="today"){setFrom(today);setTo(today);}
    if(value==="yesterday"){const date=shift(today,-1);setFrom(date);setTo(date);}
    if(value==="week"){setFrom(shift(today,-6));setTo(today);}
    if(value==="month"){setFrom(today.slice(0,8)+"01");setTo(today);}
  }
  async function download() {
    if(loading||!from||!to||from>to)return;
    setLoading(true);setError("");
    try {
      const qs=new URLSearchParams({from,to,scope});
      const headers=new Headers();
      const token=localStorage.getItem("cashledger_token");
      if(token)headers.set("authorization","Bearer "+token);
      const response=await fetch((process.env.NEXT_PUBLIC_BASE_PATH??"")+"/api/reports/export/excel?"+qs.toString(),{headers,credentials:"include",cache:"no-store"});
      if(!response.ok){const b=await response.json().catch(()=>({}));throw new Error(Array.isArray(b.message)?b.message.join(", "):b.message||"Export failed. Please retry.");}
      const url=URL.createObjectURL(await response.blob());
      const anchor=document.createElement("a");anchor.href=url;anchor.download="CashLedger_"+from+"_to_"+to+"_"+scope+".xlsx";
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){setError(e instanceof Error?e.message:"Unable to download Excel.");}
    finally{setLoading(false);}
  }
  return <AppShell><PageFrame>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold text-[var(--text-muted)]"><Link href="/reports" className="text-[var(--accent)] hover:underline">Reports</Link> / Export Data</p><h1 className="mt-1 text-2xl font-black">Export Business Data</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Download a multi-worksheet Excel workbook for any selected period.</p></div>
      <Link href="/reports" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold">Back to Reports</Link>
    </div>
    {role&&role!=="OWNER"&&role!=="ADMIN"?<Surface className="p-5 text-sm">Only owners and admins can export complete financial workbooks.</Surface>:
      <Surface className="max-w-3xl overflow-hidden">
        <div className="border-b border-[var(--border)] p-5 sm:p-6">
          <h2 className="text-lg font-black">1. Choose the period</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Both dates are included (India Standard Time).</p>
          <div className="mt-4 flex flex-wrap gap-2">{[["today","Today"],["yesterday","Yesterday"],["week","Last 7 Days"],["month","This Month"],["custom","Custom"]].map(([value,label])=>
            <button key={value} type="button" onClick={()=>choose(value)} className={"rounded-xl border px-3 py-2 text-sm font-bold "+(preset===value?"border-[var(--accent)] bg-[var(--accent)] text-white":"border-[var(--border)]")}>{label}</button>)}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">From Date<input className="app-control mt-2 w-full" type="date" value={from} onChange={e=>{setFrom(e.target.value);setPreset("custom");}}/></label>
            <label className="text-sm font-bold">To Date<input className="app-control mt-2 w-full" type="date" value={to} onChange={e=>{setTo(e.target.value);setPreset("custom");}}/></label>
          </div>
        </div>
        <div className="border-b border-[var(--border)] p-5 sm:p-6"><h2 className="text-lg font-black">2. Choose contents</h2>
          <div className="mt-3 space-y-2">{scopes.map(option=>
            <label key={option.value} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 "+(scope===option.value?"border-[var(--accent)] bg-[var(--surface-soft)]":"border-[var(--border)]")}>
              <input type="radio" name="scope" value={option.value} checked={scope===option.value} onChange={()=>setScope(option.value)} className="mt-1 h-4 w-4"/>
              <span><span className="block text-sm font-bold">{option.title}</span><span className="mt-1 block text-xs text-[var(--text-muted)]">{option.description}</span></span>
            </label>)}</div>
        </div>
        <div className="p-5 sm:p-6">
          {error?<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>:null}
          {from>to?<p role="alert" className="mb-4 text-sm font-semibold text-rose-700">From Date must be before To Date.</p>:null}
          <button type="button" onClick={download} disabled={loading||!from||!to||from>to||(role!==""&&role!=="OWNER"&&role!=="ADMIN")} className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-5 text-sm font-black text-white disabled:opacity-50">{loading?"Preparing Excel…":"Download Excel (.xlsx)"}</button>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Includes original transaction references, movement dates, current balances and reversal history. Keep downloaded files confidential.</p>
        </div>
      </Surface>}
  </PageFrame></AppShell>;
}
