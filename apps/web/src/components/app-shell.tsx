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
  { group:"Money due", label:"Dues", short:"Dues", href:"/dues", icon:"settle" },
  { group:"Today", label:"Customers", short:"Customers", href:"/customers", icon:"people" },
  { group:"Money due", label:"Settlements", short:"Settlements", href:"/provider-settlements", icon:"settle" },
  { group:"Books", label:"Accounts", short:"Accounts", href:"/accounts", icon:"wallet" },
  { group:"Books", label:"Daily Cash", short:"Cash", href:"/cash-counter", icon:"cash" },
  { group:"Books", label:"Expenses", short:"Expenses", href:"/expenses", icon:"expense" },
  { group:"Books", label:"Insights", short:"Insights", href:"/reports", icon:"chart" },
  { group:"Admin", label:"Settings", short:"Settings", href:"/settings", icon:"settings", adminOnly:true },
  { group:"Admin", label:"Users", short:"Users", href:"/users", icon:"user", adminOnly:true },
  { group:"Admin", label:"Audit", short:"Audit", href:"/audit", icon:"shield", adminOnly:true },
] as const;

type IconName=(typeof navItems)[number]["icon"]|"menu"|"close"|"back"|"search"|"plus"|"more"|"logout"|"sun"|"moon"|"chevron";
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
    chevron:<path d="m9 6 6 6-6 6"/>,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>{paths[name]}</svg>;
}

type ThemeMode="system"|"light"|"dark";
const transactionTaskTitles:Record<string,string>={
  "/transactions/card-swipe":"Card swipe",
  "/transactions/card-due-clearing":"Card due clearing",
  "/transactions/cash-transfer":"Cash transfer",
  "/transactions/aeps":"Aadhaar withdrawal",
  "/transactions/micro-atm":"Micro ATM",
  "/transactions/expense":"Expense",
  "/transactions/internal-transfer":"Move money",
  "/transactions/atm-withdrawal":"ATM withdrawal",
  "/transactions/owner-credit-card-payment":"Card payment",
};

const quickActions=[
  ["Card swipe","/transactions/card-swipe","Swipe"],
  ["Card due clearing","/transactions/card-due-clearing","Due"],
  ["Cash transfer","/transactions/cash-transfer","Transfer"],
  ["Aadhaar withdrawal","/transactions/aeps","AePS"],
  ["Micro ATM","/transactions/micro-atm","ATM"],
  ["Expense","/transactions/expense","Expense"],
  ["Move money","/transactions/internal-transfer","Move"],
] as const;

let cachedDesktopCollapsed: boolean | null = null;

export function AppShell({ children }: { children: ReactNode }) {
  const router=useRouter(), pathname=usePathname();
  const isDashboard=pathname==="/";
  const isPreviewIndex=pathname==="/accounts"||pathname==="/transactions";
  const hideShellSearch=isPreviewIndex;
  const showShellNew=pathname!=="/accounts";
  const [role,setRole]=useState(""),[userName,setUserName]=useState(""),[search,setSearch]=useState("");
  const [menuOpen,setMenuOpen]=useState(false),[newOpen,setNewOpen]=useState(false),[navigating,setNavigating]=useState(false);
  const [desktopCollapsed,setDesktopCollapsed]=useState(cachedDesktopCollapsed??true);
  const [theme,setTheme]=useState<ThemeMode>("system");

  useEffect(()=>{
    try{
      const user=JSON.parse(localStorage.getItem("cashledger_user")||"{}");
      setRole(user.role||"");
      setUserName(user.fullName||user.email||"Cash Ledger User");
      setTheme((localStorage.getItem("cashledger_theme") as ThemeMode)||"system");
      const collapsed=localStorage.getItem("cashledger_desktop_nav_collapsed")!=="false";
      cachedDesktopCollapsed=collapsed;
      setDesktopCollapsed(collapsed);
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
  const userInitial=(userName||"C").trim().charAt(0).toUpperCase();

  function applyTheme(mode:ThemeMode){
    setTheme(mode);localStorage.setItem("cashledger_theme",mode);
    const dark=mode==="dark"||(mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme",dark?"dark":"light");
  }
  function toggleDesktopNav(){
    setDesktopCollapsed((collapsed)=>{
      const next=!collapsed;
      localStorage.setItem("cashledger_desktop_nav_collapsed",String(next));
      cachedDesktopCollapsed=next;
      return next;
    });
  }
  function submitSearch(e:FormEvent){e.preventDefault();if(search.trim()){setNavigating(true);router.push("/search?q="+encodeURIComponent(search.trim()));}}
  async function logout(){try{await apiFetch("/auth/logout",{method:"POST"});}catch{}localStorage.removeItem("cashledger_token");localStorage.removeItem("cashledger_user");router.replace("/login");}
  const navLink=(item:(typeof navItems)[number],compact=false)=>{
    const selected=active(item.href);
    return <Link
      key={item.href}
      href={item.href}
      title={compact?item.label:undefined}
      className={"app-nav-link group flex min-h-11 items-center rounded-2xl border py-1.5 text-[14.5px] font-semibold tracking-[-.01em] transition "+(compact?"justify-center px-1.5":"gap-3 px-2.5")+" "+(selected
        ?"app-nav-link-active border-[color-mix(in_srgb,var(--accent)_12%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_78%,var(--surface))] text-[var(--text)] shadow-[0_5px_16px_color-mix(in_srgb,var(--accent)_8%,transparent)]"
        :"border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)]")}>
      <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-xl transition "+(selected
        ?"bg-[var(--accent)] text-white shadow-[0_5px_12px_color-mix(in_srgb,var(--accent)_22%,transparent)]"
        :"bg-[var(--surface-soft)] text-[var(--text-muted)] group-hover:bg-[var(--surface)] group-hover:text-[var(--accent)]")}>
        <Icon name={item.icon} className="h-[17px] w-[17px]"/>
      </span>
      {!compact?<><span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Icon name="chevron" className={"h-4 w-4 shrink-0 transition "+(selected?"text-[var(--accent)]":"text-[color-mix(in_srgb,var(--text-muted)_58%,transparent)] group-hover:text-[var(--text-muted)]")}/></>:null}
    </Link>;
  };

  return <div className={"min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--text)] "+(isDashboard?"dashboard-finance-shell":"")}>
    {navigating?<div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-[var(--accent-soft)]"><div className="h-full w-1/2 bg-[var(--accent)] [animation:cashledger-progress_.9s_ease-in-out_infinite]"/></div>:null}
    <aside className={"app-sidebar fixed inset-y-0 left-0 z-40 hidden border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:flex-col "+(desktopCollapsed?"w-[80px]":"w-[272px]")}>
      <div className="border-b border-[var(--border)] p-3">
        <Link href="/" title={desktopCollapsed?"Cash Ledger":undefined} className={"flex min-h-14 items-center rounded-2xl bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-soft)_72%,var(--surface)),var(--surface))] ring-1 ring-[color-mix(in_srgb,var(--accent)_9%,var(--border))] "+(desktopCollapsed?"justify-center px-1":"gap-3 px-3")}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#fff] shadow-[0_8px_20px_rgba(15,23,42,.08)]"><BrandMark className="h-7 w-7"/></span>
          {!desktopCollapsed?<div className="min-w-0">
            <p className="truncate text-[15px] font-black tracking-[-.025em]">Cash Ledger</p>
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-[.12em] text-[var(--text-muted)]">Operations</p>
          </div>:null}
        </Link>
      </div>
      <nav className={"flex-1 overflow-y-auto py-4 "+(desktopCollapsed?"px-2":"px-3")}>{["Today","Money due","Books","Admin"].map(group=>{const rows=visibleNav.filter(x=>x.group===group);return rows.length?<div key={group} className={desktopCollapsed?"mb-3":"mb-5"}>{desktopCollapsed?<div className="mx-auto mb-2 h-px w-7 bg-[var(--border)]"/>:<div className="mb-2 flex items-center gap-2 px-2.5"><span className="h-px w-4 bg-[var(--border)]"/><p className="text-[11px] font-extrabold uppercase tracking-[.13em] text-[var(--text-muted)]">{group==="Admin"?"Administration":group}</p></div>}<div className="space-y-1.5">{rows.map((item)=>navLink(item,desktopCollapsed))}</div></div>:null;})}</nav>
      <div className="border-t border-[var(--border)] p-3">
        <div title={desktopCollapsed?(userName||"Cash Ledger User"):undefined} className={"mb-2.5 flex items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] "+(desktopCollapsed?"justify-center p-2":"gap-3 p-2.5")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-xs font-black text-white">{userInitial}</span>
          {!desktopCollapsed?<div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{userName||"Cash Ledger User"}</p><p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--text-muted)]">{role||"User"}</p></div>:null}
        </div>
        {!desktopCollapsed?<div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{(["system","light","dark"] as ThemeMode[]).map(mode=><button key={mode} onClick={()=>applyTheme(mode)} className={"min-h-8 rounded-lg text-[10px] font-bold capitalize transition "+(theme===mode?"bg-[var(--surface)] text-[var(--text)] shadow-sm ring-1 ring-[var(--border)]":"text-[var(--text-muted)] hover:text-[var(--text)]")}>{mode}</button>)}</div>:null}
        <button title={desktopCollapsed?"Sign out":undefined} onClick={logout} className={"flex min-h-10 w-full items-center rounded-xl text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] "+(desktopCollapsed?"justify-center px-2":"gap-3 px-3")}><Icon name="logout" className="h-[18px] w-[18px]"/>{!desktopCollapsed?"Sign out":null}</button>
      </div>
    </aside>

    <div className={desktopCollapsed?"lg:pl-[80px]":"lg:pl-[272px]"}>
      <header className="app-topbar sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] backdrop-blur-xl">
        <div className="flex h-15 items-center gap-3 px-3 sm:px-5 lg:px-6">
          <button onClick={()=>isTaskFlow?router.push("/transactions"):setMenuOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm lg:hidden" aria-label={isTaskFlow?"Back to transactions":"Open navigation"}><Icon name={isTaskFlow?"back":"menu"} className="h-[19px] w-[19px]"/></button>
          <button onClick={toggleDesktopNav} className="hidden h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)] lg:grid" aria-label={desktopCollapsed?"Expand navigation":"Collapse navigation"} title={desktopCollapsed?"Expand menu":"Collapse menu"}><Icon name="menu" className="h-[19px] w-[19px]"/></button>
          {isTaskFlow?<Link href="/transactions" className="hidden h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm transition hover:bg-[var(--surface-soft)] hover:text-[var(--text)] lg:grid" aria-label="Back to transactions" title="Back to transactions"><Icon name="back" className="h-[19px] w-[19px]"/></Link>:null}
          <div className={"min-w-0 flex-1 lg:flex-none "+(isDashboard?"dashboard-top-title":"")}><p className={"truncate font-extrabold tracking-[-.025em] "+(isTaskFlow?"text-[17px]":"text-[16px] sm:text-[17px]")}>{currentTitle}</p></div>
          {!isTaskFlow?<>{!hideShellSearch?<form onSubmit={submitSearch} className="mx-auto hidden w-full max-w-xl md:block"><div className="relative"><Icon name="search" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, mobile, card last 4…" className="app-shell-search h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] pl-10 pr-3 text-sm"/></div></form>:<div className="hidden flex-1 md:block"/>}
          {showShellNew?<Link href="/transactions#transaction-actions" className="app-primary-button hidden min-h-10 items-center gap-2 px-4 text-sm font-bold sm:flex"><Icon name="plus" className="h-4 w-4"/>New</Link>:null}
          {isDashboard?<div className="dashboard-date-pill hidden sm:flex">{new Date().toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</div>:null}</>:<div className="hidden flex-1 lg:block"/>}
        </div>
      </header>
      <main aria-busy={navigating} className={"app-main px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6 lg:pb-9 "+(isTaskFlow?"pb-8":"pb-24")}>{children}</main>
    </div>

    {menuOpen?<div className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-slate-950/50 backdrop-blur-[3px]" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>
      <aside className="app-sidebar absolute inset-y-0 left-0 flex w-[min(91vw,370px)] flex-col overflow-hidden rounded-r-[28px] border-r border-[var(--border)] bg-[var(--surface)] shadow-[18px_0_60px_rgba(15,23,42,.22)]">
        <div className="border-b border-[var(--border)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent-soft)_72%,var(--surface)),var(--surface))] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff] shadow-[0_8px_22px_rgba(15,23,42,.10)] ring-1 ring-[color-mix(in_srgb,var(--accent)_10%,var(--border))]"><BrandMark className="h-8 w-8"/></span>
              <div className="min-w-0"><strong className="block truncate text-[18px] font-black tracking-[-.03em]">Cash Ledger</strong><span className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--text-muted)]">Menu</span></div>
            </div>
            <button onClick={()=>setMenuOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm" aria-label="Close menu"><Icon name="close" className="h-[19px] w-[19px]"/></button>
          </div>
          <form onSubmit={submitSearch} className="mt-4"><div className="relative"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-[var(--text-muted)]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, mobile or card…" className="app-control h-11 bg-[var(--surface)] !pl-11 pr-3 text-[15px] shadow-sm"/></div></form>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">{["Today","Money due","Books","Admin"].map(group=>{const rows=visibleNav.filter(x=>x.group===group);return rows.length?<div key={group} className="mb-5"><div className="mb-2 flex items-center gap-2 px-2.5"><span className="h-px w-4 bg-[var(--border)]"/><p className="text-[11px] font-extrabold uppercase tracking-[.13em] text-[var(--text-muted)]">{group==="Admin"?"Administration":group}</p></div><div className="space-y-1.5">{rows.map((item)=>navLink(item))}</div></div>:null;})}</nav>
        <div className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_55%,var(--surface))] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <div className="mb-2.5 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-sm font-black text-white">{userInitial}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{userName||"Cash Ledger User"}</p><p className="mt-0.5 truncate text-[10.5px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{role||"User"}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface)] p-1 ring-1 ring-[var(--border)]">{(["system","light","dark"] as ThemeMode[]).map(mode=><button key={mode} onClick={()=>applyTheme(mode)} className={"min-h-9 rounded-lg text-[11px] font-bold capitalize transition "+(theme===mode?"bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm":"text-[var(--text-muted)]")}>{mode}</button>)}</div>
          <button onClick={logout} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--danger)_18%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_5%,var(--surface))] px-3 text-sm font-bold text-[var(--danger)]"><Icon name="logout" className="h-[18px] w-[18px]"/>Sign out</button>
        </div>
      </aside>
    </div>:null}

    {newOpen?<div className="fixed inset-0 z-[60] hidden lg:block"><button className="absolute inset-0 bg-slate-950/10" onClick={()=>setNewOpen(false)} aria-label="Close new transaction"/><div className="absolute right-6 top-[68px] w-[520px] rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_24px_70px_rgba(15,23,42,.18)]"><div className="mb-2 flex items-center justify-between px-1.5 py-1"><strong className="text-sm">New transaction</strong><Link href="/transactions/new" className="text-xs font-semibold text-[var(--accent)]">All types</Link></div><div className="grid grid-cols-2 gap-2">{quickActions.map(([label,href,short])=><Link key={href} href={href} className="app-quick-action flex min-h-14 items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5"><span className="text-sm font-bold">{label}</span><span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)]">{short}</span></Link>)}</div></div></div>:null}

    {newOpen?<div className="fixed inset-0 z-[60] lg:hidden"><button className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={()=>setNewOpen(false)} aria-label="Close new transaction"/><div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-[var(--border)] bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"><div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]"/><div className="mb-3 flex items-center justify-between"><strong>New transaction</strong><Link href="/transactions/new" className="text-xs font-semibold text-[var(--accent)]">All types</Link></div><div className="grid grid-cols-2 gap-2">{quickActions.map(([label,href,short])=><Link key={href} href={href} className="app-quick-action flex min-h-16 items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-4"><span className="font-bold">{label}</span><span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)]">{short}</span></Link>)}</div></div></div>:null}

    {!isTaskFlow?<nav className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-1.5 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-12px_30px_rgba(15,23,42,.08)] backdrop-blur-xl lg:hidden">
      <Link href="/" className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-bold "+(active("/")?"text-[var(--accent)]":"text-[var(--text-muted)]")}><span className={"grid h-8 w-10 place-items-center rounded-xl "+(active("/")?"bg-[var(--accent-soft)]":"")}><Icon name="home" className="h-[19px] w-[19px]"/></span><span>Home</span></Link>
      <Link href="/transactions" className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-bold "+(active("/transactions")?"text-[var(--accent)]":"text-[var(--text-muted)]")}><span className={"grid h-8 w-10 place-items-center rounded-xl "+(active("/transactions")?"bg-[var(--accent-soft)]":"")}><Icon name="activity" className="h-[19px] w-[19px]"/></span><span>Activity</span></Link>
      <Link href="/transactions#transaction-actions" className="relative flex min-h-14 flex-col items-center justify-end gap-1 pb-0.5 text-[11px] font-black text-[var(--accent)]"><span className="absolute -top-5 grid h-14 w-14 place-items-center rounded-[20px] border-4 border-[var(--surface)] bg-[linear-gradient(135deg,#2f6df6,#4f46e5)] text-white shadow-[0_10px_26px_rgba(37,99,235,.34)]"><Icon name="plus" className="h-6 w-6"/></span><span>New</span></Link>
      <Link href="/dues" className={"flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-bold "+(active("/dues")?"text-[var(--accent)]":"text-[var(--text-muted)]")}><span className={"grid h-8 w-10 place-items-center rounded-xl "+(active("/dues")?"bg-[var(--accent-soft)]":"")}><Icon name="settle" className="h-[19px] w-[19px]"/></span><span>Dues</span></Link>
      <button onClick={()=>setMenuOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-bold text-[var(--text-muted)]"><span className="grid h-8 w-10 place-items-center rounded-xl"><Icon name="more" className="h-[19px] w-[19px]"/></span><span>More</span></button>
    </nav>:null}
  </div>;
}
