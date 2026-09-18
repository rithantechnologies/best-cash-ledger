"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Transactions", href: "/transactions" },
  { label: "Customers", href: "/customers" },
  { label: "Payables", href: "/payables" },
  { label: "Accounts", href: "/accounts" },
  { label: "Cash Counter", href: "/cash-counter" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings", adminOnly: true },
  { label: "Users", href: "/users", adminOnly: true },
  { label: "Audit", href: "/audit", adminOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("cashledger_user") || "{}");
      setRole(user.role || "");
    } catch {
      setRole("");
    }
  }, []);

  const visibleNav = navItems.filter(
    (item) => !("adminOnly" in item) || !item.adminOnly || role === "OWNER" || role === "ADMIN",
  );

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (search.trim()) router.push("/search?q=" + encodeURIComponent(search.trim()));
  }

  function logout() {
    localStorage.removeItem("cashledger_token");
    localStorage.removeItem("cashledger_user");
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Financial Operations
          </p>
          <h1 className="mt-1 text-xl font-bold">Cash Ledger</h1>
        </div>
        <nav className="space-y-1 p-3">
          {visibleNav.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs text-slate-500">Cash Ledger</p>
              <p className="font-semibold">Today</p>
            </div>
            <form onSubmit={submitSearch} className="mx-3 hidden min-w-0 max-w-md flex-1 md:flex">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, transaction, account..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </form>
            <div className="flex items-center gap-2">
              <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
                Logout
              </button>
              <Link href="/transactions/new" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                + New Transaction
              </Link>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">
            {visibleNav.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
