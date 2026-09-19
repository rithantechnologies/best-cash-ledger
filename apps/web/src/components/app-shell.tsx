"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import type { FormEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const navItems = [
  { label: "Dashboard", short: "Home", href: "/", icon: "home" },
  { label: "Transactions", short: "Activity", href: "/transactions", icon: "activity" },
  { label: "Customers", short: "Customers", href: "/customers", icon: "people" },
  { label: "Payables", short: "Payables", href: "/payables", icon: "out" },
  { label: "Receivables", short: "Receive", href: "/receivables", icon: "in" },
  { label: "Settlements", short: "Settlements", href: "/provider-settlements", icon: "settle" },
  { label: "Accounts", short: "Accounts", href: "/accounts", icon: "wallet" },
  { label: "Cash Counter", short: "Cash", href: "/cash-counter", icon: "cash" },
  { label: "End of Day", short: "EOD", href: "/end-of-day", icon: "check" },
  { label: "Reports", short: "Reports", href: "/reports", icon: "chart" },
  { label: "Settings", short: "Settings", href: "/settings", icon: "settings", adminOnly: true },
  { label: "Users", short: "Users", href: "/users", icon: "user", adminOnly: true },
  { label: "Audit", short: "Audit", href: "/audit", icon: "shield", adminOnly: true },
] as const;

type IconName=(typeof navItems)[number]["icon"]|"menu"|"close"|"search"|"plus"|"more"|"logout";
function Icon({name,className="h-5 w-5"}:{name:IconName;className?:string}) {
  const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  const paths:Record<IconName,ReactNode>={
    home:<><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9 21v-7h6v7"/></>,
    activity:<><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/></>,
    people:<><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 15c3.2-.4 5 1.2 5.5 5"/></>,
    out:<><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/></>,
    in:<><path d="M20 12H5"/><path d="m10 7-5 5 5 5"/></>,
    settle:<><path d="M4 7h12"/><path d="m13 4 3 3-3 3"/><path d="M20 17H8"/><path d="m11 14-3 3 3 3"/></>,
    wallet:<><path d="M4 7.5h15v12H4z"/><path d="M4 8V5h12"/><path d="M15 12h6v4h-6z"/></>,
    cash:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
    check:<><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></>,
    chart:<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6l-.3-2.6h-4L10.4 6A7 7 0 0 0 9 7.1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A7 7 0 0 0 10.4 18l.3 2.6h4L15 18a7 7 0 0 0 1.5-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></>,
    user:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21c.6-4.7 2.9-7 7-7s6.4 2.3 7 7"/></>,
    shield:<><path d="M12 3 20 6v5c0 5-3.2 8.5-8 10-4.8-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close:<><path d="m6 6 12 12M18 6 6 18"/></>,
    search:<><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    logout:<><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M8 12h9"/></>,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [transitionLabel, setTransitionLabel] = useState("page");

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("cashledger_user") || "{}");
      setRole(user.role || "");
    } catch { setRole(""); }
  }, []);
  useEffect(()=>{
    setMenuOpen(false);
    setNavigating(false);
    setShowTransition(false);
  },[pathname]);
  useEffect(()=>{
    setShowTransition(navigating);
  },[navigating]);
  useEffect(()=>{
    document.body.style.overflow=menuOpen?"hidden":"";
    return ()=>{document.body.style.overflow="";};
  },[menuOpen]);

  const visibleNav = navItems.filter(
    item => !("adminOnly" in item) || !item.adminOnly || role==="OWNER" || role==="ADMIN",
  );
  const active = (href:string) => href==="/" ? pathname==="/" : pathname===href || pathname.startsWith(href+"/");
  const currentTitle=useMemo(()=>visibleNav.find(item=>active(item.href))?.label??"Cash Ledger",[pathname,role]);

  function submitSearch(event:FormEvent) {
    event.preventDefault();
    if(search.trim()){
      setMenuOpen(false);
      setTransitionLabel("search");
      setNavigating(true);
      router.push("/search?q="+encodeURIComponent(search.trim()));
    }
  }

  function handleNavigationCapture(event:MouseEvent<HTMLDivElement>) {
    const target=event.target as HTMLElement;
    const anchor=target.closest("a");
    if(!anchor||event.defaultPrevented||anchor.target==="_blank"||anchor.hasAttribute("download"))return;
    const href=anchor.getAttribute("href");
    if(!href||href.startsWith("#")||href.startsWith("mailto:")||href.startsWith("tel:"))return;
    try{
      const url=new URL(anchor.href,window.location.href);
      if(url.origin===window.location.origin&&(url.pathname!==window.location.pathname||url.search!==window.location.search)){
        setTransitionLabel(anchor.textContent?.trim()||"page");
        setNavigating(true);
      }
    }catch{}
  }

  async function logout() {
    try { await apiFetch("/auth/logout",{method:"POST"}); } catch {}
    localStorage.removeItem("cashledger_token");
    localStorage.removeItem("cashledger_user");
    router.replace("/login");
  }

  const navLink=(item:(typeof navItems)[number],mobile=false)=>(
    <Link key={item.href} href={item.href} onClick={()=>mobile&&setMenuOpen(false)}
      className={"group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition "+
        (active(item.href)?"bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100":"text-slate-600 hover:bg-slate-100 hover:text-slate-950")}>
      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0"/>
      <span>{item.label}</span>
    </Link>
  );

  return <div onClickCapture={handleNavigationCapture} className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
    {navigating?<div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-indigo-100"><div className="h-full w-1/2 bg-indigo-600 [animation:cashledger-progress_.9s_ease-in-out_infinite]"/></div>:null}
    {showTransition?<div className="pointer-events-none fixed inset-0 z-[70] bg-slate-50/70 backdrop-blur-[2px] lg:left-60">
      <div className="mx-auto max-w-7xl space-y-4 px-3 py-20 sm:px-5 lg:px-7">
        <span className="sr-only">Opening {transitionLabel.toLowerCase()}</span>
        <div className="space-y-2">
          <span className="cashledger-shimmer block h-3 w-24 rounded-xl"/>
          <span className="cashledger-shimmer block h-8 w-64 max-w-[70%] rounded-xl"/>
          <span className="cashledger-shimmer block h-4 w-80 max-w-[85%] rounded-xl"/>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {[0,1,2,3,4].map(i=><div key={i} className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm"><span className="cashledger-shimmer block h-3 w-20 rounded-xl"/><span className="cashledger-shimmer mt-3 block h-7 w-24 rounded-xl"/></div>)}
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="space-y-3">{[0,1,2,3,4].map(i=><span key={i} className="cashledger-shimmer block h-11 w-full rounded-xl"/>)}</div>
        </div>
      </div>
    </div>:null}
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-200/80 bg-white lg:flex lg:flex-col">
      <Link href="/" aria-label="Open dashboard" className="flex h-20 items-center gap-3 border-b border-slate-100 px-5 transition hover:bg-slate-50/70">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[linear-gradient(135deg,#111827,#312e81)] text-sm font-black text-white shadow-sm">CL</div>
        <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-500">Financial ops</p><h1 className="text-lg font-bold tracking-tight">Cash Ledger</h1></div>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">{visibleNav.map(item=>navLink(item))}</nav>
      <div className="border-t border-slate-100 p-3">
        <button onClick={logout} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">
          <Icon name="logout" className="h-[18px] w-[18px]"/>Logout
        </button>
      </div>
    </aside>

    <div className="lg:pl-60">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-5 lg:px-7">
          <button type="button" onClick={()=>setMenuOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
            aria-label="Open navigation"><Icon name="menu"/></button>

          <Link href="/" aria-label="Open dashboard" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#111827,#312e81)] text-[11px] font-black text-white shadow-sm lg:hidden">CL</Link>

          <div className="min-w-0 flex-1 lg:min-w-[150px] lg:flex-none">
            <p className="hidden text-[11px] font-medium text-slate-400 sm:block">Cash Ledger</p>
            <p className="truncate text-sm font-bold sm:text-base">{currentTitle}</p>
          </div>

          <form onSubmit={submitSearch} className="mx-auto hidden w-full max-w-xl md:block">
            <div className="relative">
              <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, mobile, card last 4…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"/>
            </div>
          </form>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/receivables" className="hidden min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 sm:flex">
              <Icon name="in" className="h-4 w-4"/>Receive
            </Link>
            <Link href="/transactions/new" className="hidden min-h-11 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#111827,#312e81)] px-4 text-sm font-semibold text-white shadow-sm sm:flex">
              <Icon name="plus" className="h-4 w-4"/><span>Transaction</span>
            </Link>
          </div>
        </div>
      </header>

      <main aria-busy={navigating} className={"px-3 py-4 pb-24 transition-[opacity,transform] duration-200 sm:px-5 sm:py-6 lg:px-7 lg:pb-8 "+(navigating?"translate-y-[2px] opacity-55":"translate-y-0 opacity-100")}>{children}</main>
    </div>

    {menuOpen?<div className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>
      <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col bg-white shadow-2xl">
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4">
          <Link href="/" onClick={()=>setMenuOpen(false)} aria-label="Open dashboard" className="grid h-10 w-10 place-items-center rounded-2xl bg-[linear-gradient(135deg,#111827,#312e81)] text-sm font-black text-white">CL</Link>
          <Link href="/" onClick={()=>setMenuOpen(false)} className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-500">Financial ops</p><p className="font-bold">Cash Ledger</p></Link>
          <button onClick={()=>setMenuOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-label="Close navigation"><Icon name="close"/></button>
        </div>
        <form onSubmit={submitSearch} className="border-b border-slate-100 p-3">
          <div className="relative"><Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, mobile or card last 4"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-indigo-300 focus:bg-white"/>
          </div>
        </form>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">{visibleNav.map(item=>navLink(item,true))}</nav>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
          <Link href="/receivables" onClick={()=>setMenuOpen(false)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-800"><Icon name="in" className="h-4 w-4"/>Receive</Link>
          <button onClick={logout} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700"><Icon name="logout" className="h-4 w-4"/>Logout</button>
        </div>
      </aside>
    </div>:null}

    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-slate-200 bg-white/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur-xl lg:hidden">
      <Link href="/" className={"flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold "+(active("/")?"text-indigo-700":"text-slate-500")}>
        <Icon name="home" className="h-5 w-5"/><span>Home</span>
      </Link>
      <Link href="/transactions" className={"flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold "+(pathname==="/transactions"?"text-indigo-700":"text-slate-500")}>
        <Icon name="activity" className="h-5 w-5"/><span>Activity</span>
      </Link>
      <Link href="/transactions/new" aria-label="New transaction" className="group relative flex min-h-14 flex-col items-center justify-end gap-1 pb-0.5 text-[10px] font-bold text-indigo-700">
        <span className={"absolute -top-5 grid h-14 w-14 place-items-center rounded-full border-[4px] border-white bg-[linear-gradient(135deg,#111827,#312e81)] text-white shadow-[0_10px_28px_rgba(49,46,129,.35)] transition active:scale-95 "+(pathname==="/transactions/new"?"ring-4 ring-indigo-100":"")}>
          <Icon name="plus" className="h-6 w-6"/>
        </span>
        <span>New</span>
      </Link>
      <Link href="/customers" className={"flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold "+(active("/customers")?"text-indigo-700":"text-slate-500")}>
        <Icon name="people" className="h-5 w-5"/><span>Customers</span>
      </Link>
      <button onClick={()=>setMenuOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-slate-500">
        <Icon name="more" className="h-5 w-5"/><span>More</span>
      </button>
    </nav>
  </div>;
}
