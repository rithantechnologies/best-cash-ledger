"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type Tx = {
  id: string;
  transactionNumber: string;
  transactionType: string;
  transactionAt: string;
  grossAmount: string;
  netAmount: string | null;
  status: string;
  referenceNumber: string | null;
  customer: { fullName: string } | null;
  createdBy: { id:string; fullName:string } | null;
};

type Paged = {
  items: Tx[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const money = (v: string | number | null) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v ?? 0));

export default function TransactionsPage() {
  const [items, setItems] = useState<Tx[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("transactionAt");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [error, setError] = useState("");

  function load(page = pagination.page) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pagination.pageSize),
      sortBy,
      sortDir,
    });
    if (q.trim()) params.set("q", q.trim());
    if (type) params.set("type", type);
    if (status) params.set("status", status);

    return apiFetch<Paged>("/transactions?" + params.toString())
      .then((result) => {
        setItems(result.items);
        setPagination(result.pagination);
      });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      load(1).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, type, status, sortBy, sortDir, pagination.pageSize]);

  function sort(column: string) {
    if (sortBy === column) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(column); setSortDir("asc"); }
  }

  const sortLabel = (label: string, column: string) => (
    <button onClick={() => sort(column)} className="font-semibold">
      {label}{sortBy === column ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h2 className="text-2xl font-bold">Transactions</h2>
          <p className="text-sm text-slate-500">Search, filter, sort and review all manually entered financial movements.</p>
        </div>

        <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input className="rounded-lg border px-3 py-2" placeholder="Search no, customer, reference..." value={q} onChange={e=>setQ(e.target.value)} />
          <select className="rounded-lg border px-3 py-2" value={type} onChange={e=>setType(e.target.value)}>
            <option value="">All transaction types</option>
            {["CARD_SWIPE","CASH_TRANSFER","AEPS_WITHDRAWAL","CUSTOMER_PAYOUT","INTERNAL_TRANSFER","BUSINESS_EXPENSE","PERSONAL_EXPENSE","ATM_WITHDRAWAL","OWNER_CC_PAYMENT","REVERSAL"].map(x=><option key={x}>{x}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["PENDING","COMPLETED","CANCELLED","REVERSED"].map(x=><option key={x}>{x}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2" value={pagination.pageSize} onChange={e=>setPagination(p=>({...p,pageSize:Number(e.target.value),page:1}))}>
            {[10,25,50,100].map(n=><option key={n} value={n}>{n} per page</option>)}
          </select>
        </section>

        {error ? <p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[950px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{sortLabel("No","transactionNumber")}</th>
                <th className="px-4 py-3">{sortLabel("Date","transactionAt")}</th>
                <th className="px-4 py-3">{sortLabel("Type","transactionType")}</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">{sortLabel("Gross","grossAmount")}</th>
                <th className="px-4 py-3">{sortLabel("Net","netAmount")}</th>
                <th className="px-4 py-3">{sortLabel("Status","status")}</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium"><Link className="underline-offset-2 hover:underline" href={"/transactions/"+tx.id}>{tx.transactionNumber}</Link></td>
                  <td className="px-4 py-3">{new Date(tx.transactionAt).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{tx.transactionType}</td>
                  <td className="px-4 py-3">{tx.customer?.fullName ?? "—"}</td>
                  <td className="px-4 py-3">{tx.createdBy?.fullName ?? "—"}</td>
                  <td className="px-4 py-3">{money(tx.grossAmount)}</td>
                  <td className="px-4 py-3">{money(tx.netAmount)}</td>
                  <td className="px-4 py-3">{tx.status}</td>
                  <td className="px-4 py-3">{tx.referenceNumber ?? "—"}</td>
                </tr>
              ))}
              {!items.length ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No matching transactions.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-slate-500">{pagination.total} transaction(s) · Page {pagination.page} of {pagination.totalPages}</p>
          <div className="flex gap-2">
            <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={pagination.page<=1} onClick={()=>load(pagination.page-1).catch(()=>{})}>Previous</button>
            <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={pagination.page>=pagination.totalPages} onClick={()=>load(pagination.page+1).catch(()=>{})}>Next</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
