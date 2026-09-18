"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Result={
 customers:{id:string;customerCode:string;fullName:string;mobile:string|null}[];
 transactions:{id:string;transactionNumber:string;transactionType:string;transactionAt:string;referenceNumber:string|null;customer:{fullName:string}|null}[];
 accounts:{id:string;accountCode:string;accountName:string;accountType:string}[];
 providers:{id:string;name:string;providerType:string}[];
};

export default function SearchPage(){
 const [q,setQ]=useState("");
 const [data,setData]=useState<Result|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  const value=new URLSearchParams(window.location.search).get("q")||"";
  setQ(value);
 },[]);
 useEffect(()=>{if(!q){setData({customers:[],transactions:[],accounts:[],providers:[]});return;}apiFetch<Result>("/search?q="+encodeURIComponent(q)).then(setData).catch(()=>setError("Search failed"));},[q]);
 return <AppShell><div className="mx-auto max-w-5xl space-y-6">
  <div><h2 className="text-2xl font-bold">Search</h2><p className="text-sm text-slate-500">Results for “{q}”</p></div>
  {error?<p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:null}
  {!data?<p>Searching...</p>:<div className="grid gap-5 lg:grid-cols-2">
   <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Customers</h3><div className="mt-3 space-y-2">{data.customers.map(c=><Link key={c.id} href={"/customers/"+c.id} className="block rounded-lg bg-slate-50 p-3 hover:bg-slate-100"><strong>{c.fullName}</strong><p className="text-xs text-slate-500">{c.customerCode} · {c.mobile||"No mobile"}</p></Link>)}{!data.customers.length?<p className="text-sm text-slate-500">No customers.</p>:null}</div></section>
   <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Transactions</h3><div className="mt-3 space-y-2">{data.transactions.map(t=><Link key={t.id} href={"/transactions/"+t.id} className="block rounded-lg bg-slate-50 p-3 hover:bg-slate-100"><strong>{t.transactionNumber}</strong><p className="text-xs text-slate-500">{t.transactionType} · {t.customer?.fullName||"No customer"} · {new Date(t.transactionAt).toLocaleString("en-IN")}</p></Link>)}{!data.transactions.length?<p className="text-sm text-slate-500">No transactions.</p>:null}</div></section>
   <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Accounts</h3><div className="mt-3 space-y-2">{data.accounts.map(a=><div key={a.id} className="rounded-lg bg-slate-50 p-3"><strong>{a.accountName}</strong><p className="text-xs text-slate-500">{a.accountCode} · {a.accountType}</p></div>)}{!data.accounts.length?<p className="text-sm text-slate-500">No accounts.</p>:null}</div></section>
   <section className="rounded-xl border bg-white p-5"><h3 className="font-semibold">Providers</h3><div className="mt-3 space-y-2">{data.providers.map(p=><div key={p.id} className="rounded-lg bg-slate-50 p-3"><strong>{p.name}</strong><p className="text-xs text-slate-500">{p.providerType}</p></div>)}{!data.providers.length?<p className="text-sm text-slate-500">No providers.</p>:null}</div></section>
  </div>}
 </div></AppShell>;
}
