"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { apiFetch } from "@/lib/api";

const navItems = [
  { group:"Today", label:"Dashboard", short:"Home", href:"/", icon:"home" },
  { group:"Today", label:"Transactions", short:"Activity", href:"/transactions", icon:"activity" },
  { group:"Today", label:"Dues", short:"Dues", href:"/dues", icon:"settle" },
  { group:"Today", label:"Customers", short:"Customers", href:"/customers", icon:"people" },
  { group:"Money due", label:"Payables", short:"Payables", href:"/payables", icon:"settle" },
  { group:"Money due", label:"Receivables", short:"Receivables", href:"/receivables", icon:"settle" },
  { group:"Money due", label:"Provider Settlements", short:"Settlements", href:"/provider-settlements", icon:"settle" },
  { group:"Books", label:"Accounts", short:"Accounts", href:"/accounts", icon:"wallet" },
  { group:"Books", label:"Cash Counter", short:"Cash", href:"/cash-counter", icon:"cash" },
  { group:"Books", label:"End of Day", short:"EOD", href:"/end-of-day", icon:"check" },
  { group:"Books", label:"Expenses", short:"Expenses", href:"/expenses", icon:"expense" },
  { group:"Books", label:"Reports", short:"Reports", href:"/reports", icon:"chart" },
  { group:"Admin", label:"Settings", short:"Settings", href:"/settings", icon:"settings", adminOnly:true },
  { group:"Admin", label:"Users", short:"Users", href:"/users", icon:"user", adminOnly:true },
  { group:"Admin", label:"Audit", short:"Audit", href:"/audit", icon:"shield", adminOnly:true },
] as const;

type IconName=(typeof navItems)[number]["icon"]|"menu"|"close"|"back"|"search"|"plus"|"more"|"logout"|"sun"|"moon";
function Icon({name,className="h-5 w-5"}:{name:IconName;className?:string}) {
  const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  const paths:Record<IconName,ReactNode>={
    home:<><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9 21v-7h6v7"/></>,
    activity:<><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/></>,
    people:<><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 15c3.2-.4 5 1.2 5.5 5"/></>,
    settle:<><path d="M4 7h12"/><path d="m13 4 3 3-3 3"/><path d="M20 17H8"/><path d="m11 14-3 3 3 3"/></>,
    wallet:<><path d="M4 7.5h15v12H4z"/><path d="M4 8V5h12"/><path d="M15 12h6v4h-6z"/></>,
    cash:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
    expense:<><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="M16 14v4M14 16h4"/></>,
    check:<><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></>,
    chart:<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6l-.3-2.6h-4L10.4 6A7 7 0 0 0 9 7.1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A7 7 0 0 0 10.4 18l.3 2.6h4L15 18a7 7 0 0 0 1.5-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></>,
    user:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21c.6-4.7 2.9-7 7-7s6.4 2.3 7 7"/></>,
    shield:<><path d="M12 3 20 6v5c0 5-3.2 8.5-8 10-4.8-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close:<><path d="m6 6 12 12M18 6 6 18"/></>,
    back:<><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
    search:<><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    logout:<><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M8 12h9"/></>,
    sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon:<><path d="M20 15.2A8 8 0 1 1 8.8 4 6.5 6.5 0 0 0 20 15.2Z"/></>,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>{paths[name]}</svg>;
}

type ThemeMode="system"|"light"|"dark";
const transactionTaskTitles:Record<string,string>={
  "/transactions/card-swipe":"Card swipe",
  "/transactions/cash-transfer":"Cash transfer",
  "/transactions/aeps":"AePS",
  "/transactions/micro-atm":"Micro ATM",
  "/transactions/expense":"Expense",
  "/transactions/internal-transfer":"Move money",
  "/transactions/atm-withdrawal":"ATM withdrawal",
  "/transactions/owner-credit-card-payment":"Card payment",
};

const quickActions=[
  ["Card swipe","/transactions/card-swipe","Swipe"],
  ["Cash transfer","/transactions/cash-transfer","Transfer"],
  ["AePS","/transactions/aeps","AePS"],
  ["Micro ATM","/transactions/micro-atm","ATM"],
  ["Expense","/transactions/expense","Expense"],
  ["Move money","/transactions/internal-transfer","Move"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router=useRouter(), pathname=usePathname();
  const isDashboard=pathname==="/";
  const [role,setRole]=useState(""),[search,setSearch]=useState("");
  const [menuOpen,setMenuOpen]=useState(false),[newOpen,setNewOpen]=useState(false),[navigating,setNavigating]=useState(false);
  const [theme,setTheme]=useState<ThemeMode>("system");

  useEffect(()=>{
    try{
      const user=JSON.parse(localStorage.getItem("cashledger_user")||"{}");
      setRole(user.role||"");
      setTheme((localStorage.getItem("cashledger_theme") as ThemeMode)||"system");
    }catch{}
  },[]);
  useEffect(()=>{setMenuOpen(false);setNewOpen(false);setNavigating(false);},[pathname]);
  useEffect(()=>{
    const locked=menuOpen||newOpen;
    document.body.style.overflow=locked?"hidden":"";
    return()=>{document.body.style.overflow="";};
  },[menuOpen,newOpen]);

  const visibleNav=navItems.filter(item=>!("adminOnly" in item)||!item.adminOnly||role==="OWNER"||role==="ADMIN");
  const active=(href:string)=>href==="/"?pathname==="/":pathname===href||pathname.startsWith(href+"/");
  const taskTitle=transactionTaskTitles[pathname];
  const isTaskFlow=!!taskTitle;
  const currentTitle=isDashboard?"Cash Ledger":taskTitle??visibleNav.find(item=>active(item.href))?.label??"Cash Ledger";

  function applyTheme(mode:ThemeMode){
    setTheme(mode);localStorage.setItem("cashledger_theme",mode);
    const dark=mode==="dark"||(mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme",dark?"dark":"light");
  }
  function submitSearch(e:FormEvent){e.preventDefault();if(search.trim()){setNavigating(true);router.push("/search?q="+encodeURIComponent(search.trim()));}}
  async function logout(){try{await apiFetch("/auth/logout",{method:"POST"});}catch{}localStorage.removeItem("cashledger_token");localStorage.removeItem("cashledger_user");router.replace("/login");}
  const navLink=(item:(typeof navItems)[number])=><Link key={item.href} href={item.href} className={"app-nav-link flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold "+(active(item.href)?"app-nav-link-active":"text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]")}><Icon name={item.icon} className="h-[18px] w-[18px]"/><span>{item.label}</span></Link>;

  return <div className={"min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--text)] "+(isDashboard?"dashboard-neon-shell":"")}>
    {navigating?<div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-[var(--accent-soft)]"><div className="h-full w-1/2 bg-[var(--accent)] [animation:cashledger-progress_.9s_ease-in-out_infinite]"/></div>:null}
    <aside className="app-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:flex-col">
      <Link href="/" className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-4"><BrandMark className="h-9 w-9 shrink-0"/><div className="min-w-0">{isDashboard?<><p className="truncate text-sm font-black tracking-tight">Cash Ledger</p><p className="truncate text-[11px] font-medium text-[var(--text-muted)]">Track Today. Stronger Tomorrow.</p></>:<><p className="truncate text-sm font-bold tracking-tight">Best Agency</p><p className="truncate text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--text-muted)]">Cash Ledger</p></>}</div></Link>
      <nav className="flex-1 overflow-y-auto p-3">{["Today","Money due","Books","Admin"].map(group=>{const rows=visibleNav.filter(x=>x.group===group);return rows.length?<div key={group} className="mb-4"><p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[.13em] text-[var(--text-muted)]">{group}</p><div className="space-y-1">{rows.map(navLink)}</div></div>:null;})}</nav>
      <div className="border-t border-[var(--border)] p-3">
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-[var(--surface-soft)] p-1">{(["system","light","dark"] as ThemeMode[]).map(mode=><button key={mode} onClick={()=>applyTheme(mode)} className={"min-h-8 rounded-md text-[10px] font-semibold capitalize "+(theme===mode?"bg-[var(--surface)] text-[var(--text)] shadow-sm":"text-[var(--text-muted)]")}>{mode}</button>)}</div>
        <button onClick={logout} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-soft)]"><Icon name="logout" className="h-[18px] w-[18px]"/>Logout</button>
      </div>
    </aside>

    <div className="lg:pl-64">
      <header className="app-topbar sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] backdrop-blur-xl">
        <div className="flex h-15 items-center gap-3 px-3 sm:px-5 lg:px-6">
          <button onClick={()=>isTaskFlow?router.push("/transactions/new"):setMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] lg:hidden" aria-label={isTaskFlow?"Back to new transaction":"Open navigation"}><Icon name={isTaskFlow?"back":"menu"}/></button>
          <div className={"min-w-0 flex-1 lg:flex-none "+(isDashboard?"dashboard-top-title":"")}><p className={"truncate font-bold tracking-[-.015em] "+(isTaskFlow?"text-base":"text-sm")}>{currentTitle}</p></div>
          {!isTaskFlow?<><form onSubmit={submitSearch} className="mx-auto hidden w-full max-w-xl md:block"><div className="relative"><Icon name="search" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, mobile, card last 4…" className="app-shell-search h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] pl-10 pr-3 text-sm"/></div></form>
          {isDashboard?<div className="dashboard-date-pill hidden sm:flex">{new Date().toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</div>:<Link href="/transactions/new" className="app-primary-button hidden min-h-10 items-center gap-2 px-4 text-sm font-bold sm:flex"><Icon name="plus" className="h-4 w-4"/>New</Link>}</>:<div className="hidden flex-1 lg:block"/>}
        </div>
      </header>
      <main aria-busy={navigating} className={"app-main px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6 lg:pb-9 "+(isTaskFlow?"pb-8":"pb-24")}>{children}</main>
    </div>

    {menuOpen?<div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/><aside className="app-sidebar absolute inset-y-0 left-0 flex w-[min(88vw,350px)] flex-col bg-[var(--surface)] shadow-2xl"><div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-4"><div className="flex items-center gap-2.5"><BrandMark className="h-8 w-8"/><div><strong className="block text-sm">Best Agency</strong><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--text-muted)]">Cash Ledger</span></div></div><button onClick={()=>setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface-soft)]"><Icon name="close"/></button></div><form onSubmit={submitSearch} className="border-b border-[var(--border)] p-3"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, mobile or card last 4" className="app-control"/></form><nav className="flex-1 overflow-y-auto p-3">{["Today","Money due","Books","Admin"].map(group=>{const rows=visibleNav.filter(x=>x.group===group);return rows.length?<div key={group} className="mb-4"><p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[.13em] text-[var(--text-muted)]">{group==="Admin"?"Administration":group}</p><div className="space-y-1">{rows.map(navLink)}</div></div>:null;})}</nav><div className="border-t border-[var(--border)] p-3"><div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-[var(--surface-soft)] p-1">{(["system","light","dark"] as ThemeMode[]).map(mode=><button key={mode} onClick={()=>applyTheme(mode)} className={"min-h-9 rounded-md text-xs capitalize "+(theme===mode?"bg-[var(--surface)] shadow-sm":"text-[var(--text-muted)]")}>{mode}</button>)}</div><button onClick={logout} className="min-h-10 w-full rounded-lg text-sm text-[var(--text-muted)]">Logout</button></div></aside></div>:null}

    {newOpen?<div className="fixed inset-0 z-[60] lg:hidden"><button className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={()=>setNewOpen(false)} aria-label="Close new transaction"/><div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-[var(--border)] bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"><div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]"/><div className="mb-3 flex items-center justify-between"><strong>New transaction</strong><Link href="/transactions/new" className="text-xs font-semibold text-[var(--accent)]">All types</Link></div><div className="grid grid-cols-2 gap-2">{quickActions.map(([label,href,short])=><Link key={href} href={href} className="app-quick-action flex min-h-16 items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-4"><span className="font-bold">{label}</span><span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)]">{short}</span></Link>)}</div></div></div>:null}

    {!isTaskFlow?<nav className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_93%,transparent)] px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden">
      <Link href="/" className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold "+(active("/")?"text-[var(--accent)]":"text-[var(--text-muted)]")}><Icon name="home" className="h-5 w-5"/><span>Home</span></Link>
      <Link href="/transactions" className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold "+(active("/transactions")?"text-[var(--accent)]":"text-[var(--text-muted)]")}><Icon name="activity" className="h-5 w-5"/><span>Activity</span></Link>
      <button onClick={()=>setNewOpen(true)} className="relative flex min-h-14 flex-col items-center justify-end gap-1 pb-0.5 text-[10px] font-bold text-[var(--accent)]"><span className="absolute -top-5 grid h-14 w-14 place-items-center rounded-full border-4 border-[var(--surface)] bg-[linear-gradient(135deg,#2f6df6,#1d4ed8)] text-white shadow-[0_10px_24px_rgba(37,99,235,.35)]"><Icon name="plus" className="h-6 w-6"/></span><span>New</span></button>
      {isDashboard?<Link href="/reports" className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold "+(active("/reports")?"text-[var(--accent)]":"text-[var(--text-muted)]")}><Icon name="chart" className="h-5 w-5"/><span>Reports</span></Link>:<Link href="/dues" className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold "+(active("/dues")?"text-[var(--accent)]":"text-[var(--text-muted)]")}><Icon name="settle" className="h-5 w-5"/><span>Dues</span></Link>}
      <button onClick={()=>setMenuOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-[var(--text-muted)]"><Icon name="more" className="h-5 w-5"/><span>More</span></button>
    </nav>:null}
  </div>;
}
