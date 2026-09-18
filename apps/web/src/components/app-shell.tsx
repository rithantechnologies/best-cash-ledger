"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Transactions", href: "/transactions" },
  { label: "Customers", href: "/customers" },
  { label: "Payables", href: "/payables" },
  { label: "Receivables", href: "/receivables" },
  { label: "Settlements", href: "/provider-settlements" },
  { label: "Accounts", href: "/accounts" },
  { label: "Cash Counter", href: "/cash-counter" },
  { label: "End of Day", href: "/end-of-day" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings", adminOnly: true },
  { label: "Users", href: "/users", adminOnly: true },
  { label: "Audit", href: "/audit", adminOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("cashledger_user") || "{}");
      setRole(user.role || "");
    } catch {
      setRole("");
    }
  }, []);

  const visibleNav = navItems.filter(
    (item) =>
      !("adminOnly" in item) ||
      !item.adminOnly ||
      role === "OWNER" ||
      role === "ADMIN",
  );

  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (search.trim()) {
      setMenuOpen(false);
      router.push("/search?q=" + encodeURIComponent(search.trim()));
    }
  }

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Clear the local profile even if the network request fails.
    }
    localStorage.removeItem("cashledger_token");
    localStorage.removeItem("cashledger_user");
    router.replace("/login");
  }

  const navLink = (item: (typeof navItems)[number], mobile = false) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={() => mobile && setMenuOpen(false)}
      className={
        "block rounded-lg px-4 py-2.5 text-sm font-medium transition " +
        (active(item.href)
          ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100"
          : "text-slate-700 hover:bg-slate-100 hover:text-slate-950")
      }
    >
      {item.label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Financial Operations
          </p>
          <h1 className="mt-1 text-xl font-bold">Cash Ledger</h1>
        </div>
        <nav className="space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => navLink(item))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold lg:hidden"
              aria-expanded={menuOpen}
            >
              Menu
            </button>

            <div className="hidden min-w-[110px] sm:block">
              <p className="text-xs text-slate-500">Cash Ledger</p>
              <p className="font-semibold">Today</p>
            </div>

            <form
              onSubmit={submitSearch}
              className="mx-2 hidden min-w-0 max-w-md flex-1 md:flex"
            >
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, transaction, account..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </form>

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/receivables"
                className="hidden rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 sm:inline-flex"
              >
                + Receive
              </Link>
              <Link
                href="/transactions/new"
                className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white sm:px-4"
              >
                + Transaction
              </Link>
              <button
                onClick={logout}
                className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium sm:block"
              >
                Logout
              </button>
            </div>
          </div>

          <form
            onSubmit={submitSearch}
            className="border-t border-slate-100 px-4 py-2 md:hidden"
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </form>

          {menuOpen ? (
            <div className="border-t border-slate-200 bg-white p-3 lg:hidden">
              <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {visibleNav.map((item) => navLink(item, true))}
              </nav>
              <div className="mt-3 flex gap-2 border-t pt-3">
                <Link
                  href="/receivables"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-800"
                >
                  Receive Money
                </Link>
                <button
                  onClick={logout}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm font-semibold"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </header>

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
