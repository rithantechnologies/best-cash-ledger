"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { apiFetch } from "@/lib/api";

type Summary = {
  cashBalance: number;
  bankBalance: number;
  upiBalance: number;
  walletBalance: number;
  customerPayable: number;
  payableBreakdown: {
    pendingAmount: number; pendingCount: number;
    partialAmount: number; partialCount: number;
    dueTodayAmount: number; dueTodayCount: number;
    overdueAmount: number; overdueCount: number;
  };
  creditCardOutstanding: number;
  creditCardAvailable: number;
};

type Account = {
  id: string;
  accountName: string;
  accountType: string;
  currentBalance: number;
  creditLimit: number | null;
};

type Today = {
  cashIn: number;
  cashOut: number;
  bankIn: number; bankOut: number;
  walletIn: number; walletOut: number;
  upiIn: number; upiOut: number;
  cardSwipe: number;
  aeps: number;
  customerPayout: number;
  commission: number;
  providerCharges: number;
  businessExpense: number;
  personalExpense: number;
};

type Payable = {
  id: string;
  originalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  dueAt: string;
  status: string;
  bucket: string;
  customer: { fullName: string };
};

type RunningRow = {
  date: string;
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
};

const money = (value: number | string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [today, setToday] = useState<Today | null>(null);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [running, setRunning] = useState<RunningRow[]>([]);
  const [runningType, setRunningType] = useState("TOTAL");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("cashledger_token")) {
      router.replace("/login");
      return;
    }

    Promise.all([
      apiFetch<Summary>("/dashboard/summary"),
      apiFetch<Account[]>("/dashboard/accounts"),
      apiFetch<Today>("/dashboard/today"),
      apiFetch<Payable[]>("/dashboard/payables"),
      apiFetch<RunningRow[]>("/dashboard/last-10-days?type=TOTAL"),
    ])
      .then(([summaryData, accountData, todayData, payableData, runningData]) => {
        setSummary(summaryData);
        setAccounts(accountData);
        setToday(todayData);
        setPayables(payableData);
        setRunning(runningData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, [router]);

  useEffect(() => {
    if (!localStorage.getItem("cashledger_token")) return;
    apiFetch<RunningRow[]>("/dashboard/last-10-days?type=" + runningType)
      .then(setRunning)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load running balance"));
  }, [runningType]);

  if (!summary || !today) {
    return (
      <AppShell>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {error || "Loading dashboard..."}
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">
            Live position from posted ledger transactions.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
          <StatCard label="Cash in Hand" value={money(summary.cashBalance)} />
          <StatCard label="Bank Balance" value={money(summary.bankBalance)} />
          <StatCard label="UPI Balance" value={money(summary.upiBalance)} />
          <StatCard label="Wallet Balance" value={money(summary.walletBalance)} />
          <StatCard label="Customer Payable" value={money(summary.customerPayable)} />
          <StatCard label="CC Outstanding" value={money(summary.creditCardOutstanding)} />
          <StatCard label="CC Available" value={money(summary.creditCardAvailable)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold">Account Balances</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {accounts.length ? accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{account.accountName}</p>
                    <p className="text-xs text-slate-500">{account.accountType}</p>
                  </div>
                  <p className="font-semibold tabular-nums">
                    {money(account.currentBalance)}
                  </p>
                </div>
              )) : (
                <p className="px-5 py-6 text-sm text-slate-500">No financial accounts created yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold">Today</h3>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 text-sm">
              {[
                ["Cash In", today.cashIn],
                ["Cash Out", today.cashOut],
                ["Bank In", today.bankIn],
                ["Bank Out", today.bankOut],
                ["Wallet In", today.walletIn],
                ["Wallet Out", today.walletOut],
                ["UPI In", today.upiIn],
                ["UPI Out", today.upiOut],
                ["Card Swipe", today.cardSwipe],
                ["AePS", today.aeps],
                ["Customer Payout", today.customerPayout],
                ["Commission", today.commission],
                ["Provider Charges", today.providerCharges],
                ["Business Expense", today.businessExpense],
                ["Personal Expense", today.personalExpense],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{money(Number(value))}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Payable Pending" value={money(summary.payableBreakdown.pendingAmount)} hint={summary.payableBreakdown.pendingCount + " customer payable(s)"} />
            <StatCard label="Partially Paid" value={money(summary.payableBreakdown.partialAmount)} hint={summary.payableBreakdown.partialCount + " payable(s)"} />
            <StatCard label="Due Today" value={money(summary.payableBreakdown.dueTodayAmount)} hint={summary.payableBreakdown.dueTodayCount + " payable(s)"} />
            <StatCard label="Overdue" value={money(summary.payableBreakdown.overdueAmount)} hint={summary.payableBreakdown.overdueCount + " payable(s)"} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold">Customer Payables</h3>
            <p className="text-xs text-slate-500">Pending, partial, due today and overdue</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Original</th>
                  <th className="px-5 py-3">Paid</th>
                  <th className="px-5 py-3">Remaining</th>
                  <th className="px-5 py-3">Due</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payables.length ? payables.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-medium">{item.customer.fullName}</td>
                    <td className="px-5 py-4">{money(item.originalAmount)}</td>
                    <td className="px-5 py-4">{money(item.paidAmount)}</td>
                    <td className="px-5 py-4 font-semibold">{money(item.remainingAmount)}</td>
                    <td className="px-5 py-4">{new Date(item.dueAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-5 py-4">{item.bucket}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      No open customer payables.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Last 10 Days Running Balance</h3>
              <p className="mt-1 text-xs text-slate-500">
                Opening, money in, money out and closing balance.
              </p>
            </div>
            <select
              value={runningType}
              onChange={(event) => setRunningType(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="TOTAL">Liquid Total</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Banks</option>
              <option value="UPI">UPI</option>
              <option value="WALLET">Provider Wallets</option>
              <option value="CUSTOMER_PAYABLE">Customer Payables</option>
            </select>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Opening</th>
                  <th className="py-2">In</th>
                  <th className="py-2">Out</th>
                  <th className="py-2">Closing</th>
                </tr>
              </thead>
              <tbody>
                {running.map((row) => (
                  <tr key={row.date} className="border-t border-slate-100">
                    <td className="py-3">{row.date}</td>
                    <td className="py-3">{money(row.opening)}</td>
                    <td className="py-3">{money(row.moneyIn)}</td>
                    <td className="py-3">{money(row.moneyOut)}</td>
                    <td className="py-3 font-semibold">{money(row.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
