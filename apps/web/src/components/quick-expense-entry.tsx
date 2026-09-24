"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";

type Account={
  id:string;accountName:string;accountType:string;isActive?:boolean;
  bankName?:string|null;currentBalance?:string|number;
};
type Category={
  id:string;name:string;isActive?:boolean;
  _count?:{expenses:number};
};

const accountTypes=["CASH","BANK","UPI","PROVIDER_WALLET","OWNER_CREDIT_CARD"];
const money=(value:number|string)=>new Intl.NumberFormat("en-IN",{
  style:"currency",currency:"INR",maximumFractionDigits:0,
}).format(Number(value||0));

export function QuickExpenseEntry({
  onSaved,
  buttonClassName="",
}:{
  onSaved?:()=>void;
  buttonClassName?:string;
}){
  const [open,setOpen]=useState(false);
  const [ready,setReady]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [categories,setCategories]=useState<Category[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [categoryId,setCategoryId]=useState("");
  const [amount,setAmount]=useState("");
  const [accountId,setAccountId]=useState("");
  const [note,setNote]=useState("");

  useEffect(()=>setReady(true),[]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")close();};
    window.addEventListener("keydown",onKey);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",onKey);};
  },[open]);
  useEffect(()=>{
    if(!open||categories.length)return;
    setLoading(true);setError("");
    Promise.all([
      apiFetch<Category[]>("/settings/expense-categories"),
      apiFetch<Account[]>("/dashboard/accounts"),
    ]).then(([c,a])=>{setCategories(c);setAccounts(a);})
      .catch(e=>setError(e instanceof Error?e.message:"Could not load expense form"))
      .finally(()=>setLoading(false));
  },[open,categories.length]);

  const popular=useMemo(()=>categories.slice().sort((a,b)=>
    Number(b._count?.expenses||0)-Number(a._count?.expenses||0)||a.name.localeCompare(b.name)
  ),[categories]);
  const activeAccounts=accounts.filter(a=>a.isActive!==false&&accountTypes.includes(a.accountType));

  function close(){
    setOpen(false);setError("");setCategoryId("");setAmount("");setAccountId("");setNote("");
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    const value=Number(amount);
    if(!categoryId){setError("Choose an expense category.");return;}
    if(!Number.isFinite(value)||value<=0){setError("Enter a valid amount.");return;}
    const category=categories.find(item=>item.id===categoryId);
    setSaving(true);setError("");
    try{
      await apiFetch("/transactions/expense",{
        method:"POST",
        body:JSON.stringify({
          expenseCategoryId:categoryId,
          expenseType:"BUSINESS",
          amount:value,
          paymentAccountId:accountId||undefined,
          description:category?.name||"Expense",
          notes:note.trim()||undefined,
        }),
      });
      close();
      onSaved?.();
      window.dispatchEvent(new CustomEvent("cashledger:expense-saved"));
    }catch(e){
      setError(e instanceof Error?e.message:"Expense could not be saved");
    }finally{setSaving(false);}
  }

  return <>
    <button type="button" aria-label="Expense" onClick={()=>setOpen(true)}
      className={"flex min-h-10 items-center gap-2 rounded-full bg-violet-600 px-3.5 text-[13px] font-black text-white shadow-[0_8px_22px_rgba(124,58,237,.24)] transition hover:-translate-y-0.5 active:translate-y-0 "+buttonClassName}>
      <span className="text-base leading-none">₹</span><span>Expense</span>
    </button>

    {ready&&open?createPortal(
      <div className="fixed inset-0 z-[110] grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Quick expense">
        <form onSubmit={submit} className="cash-quick-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--surface)] shadow-2xl sm:max-h-[86dvh] sm:max-w-[520px] sm:rounded-[26px]">
          <header className="flex items-center justify-between px-5 pb-1.5 pt-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-violet-100 text-xl font-black text-violet-700">₹</span>
              <div>
                <h3 className="text-[22px] font-black tracking-[-.04em]">Expense</h3>
                <p className="text-[12px] font-bold text-[var(--text-muted)]">Category + amount · source can be added later</p>
              </div>
            </div>
            <button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-soft)] text-xl font-bold text-[var(--text-muted)]" aria-label="Close">×</button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <label className="block">
                <span className="block text-center text-[10px] font-black uppercase tracking-[.16em] text-[var(--text-muted)]">Amount <span className="text-rose-500">*</span></span>
                <div className="mt-1 flex items-center justify-center gap-2 border-b border-[var(--border)] pb-2">
                  <span className="quick-cash-amount-currency font-black leading-none text-[var(--text)]">₹</span>
                  <input autoFocus inputMode="decimal"
                    className="quick-cash-amount-input min-w-0 max-w-[280px] flex-1 appearance-none bg-transparent p-0 text-center tabular-nums text-[var(--text)] placeholder:text-[color-mix(in_srgb,var(--text-muted)_20%,transparent)]"
                    placeholder="0" value={amount} onChange={e=>{setAmount(e.target.value.replace(/[^0-9.]/g,""));setError("");}}/>
                </div>
              </label>

              <div className="mt-3 rounded-[17px] bg-[var(--surface-soft)] p-3">
                <p className="px-1 text-[10px] font-black uppercase tracking-[.1em] text-[var(--text-muted)]">Category <span className="text-rose-500">*</span></p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {popular.slice(0,6).map(category=><button key={category.id} type="button" onClick={()=>{setCategoryId(category.id);setError("");}}
                    className={"min-h-8 rounded-full border px-3 text-[12px] font-black transition active:scale-[.98] "+(categoryId===category.id?"border-violet-300 bg-violet-50 text-violet-700":"border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]")}>
                    {category.name}
                  </button>)}
                </div>
                <SearchableSelect mobileSheet searchPlaceholder="Search expense category"
                  className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] font-black text-[var(--text)]"
                  value={categoryId} onChange={e=>{setCategoryId(e.target.value);setError("");}}>
                  <option value="">Choose category…</option>
                  {popular.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}
                </SearchableSelect>
              </div>

              <div className="mt-3 overflow-hidden rounded-[17px] bg-[var(--surface-soft)] px-4">
                <label className="block border-b border-[var(--border)] py-3">
                  <span className="block text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Paid from <span className="normal-case font-semibold">(optional · complete later)</span></span>
                  <SearchableSelect mobileSheet searchPlaceholder="Search cash / bank / UPI / wallet"
                    className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-[14px] font-black text-[var(--text)]"
                    value={accountId} onChange={e=>setAccountId(e.target.value)}>
                    <option value="">Not selected yet</option>
                    {activeAccounts.map(account=><option key={account.id} value={account.id}>{account.accountName} · {money(account.currentBalance||0)}</option>)}
                  </SearchableSelect>
                </label>
                <label className="flex min-h-[58px] items-start gap-3 py-3">
                  <span className="w-[76px] shrink-0 pt-1 text-[10px] font-black uppercase tracking-[.09em] text-[var(--text-muted)]">Note</span>
                  <textarea rows={2} className="min-h-[42px] min-w-0 flex-1 resize-none appearance-none bg-transparent p-0 text-right text-[17px] font-extrabold leading-5 text-[var(--text)] placeholder:font-semibold placeholder:text-[var(--text-muted)]"
                    placeholder="Add note" value={note} onChange={e=>setNote(e.target.value)}/>
                </label>
              </div>

              {loading?<p className="mt-3 text-sm font-bold text-[var(--text-muted)]">Loading categories…</p>:null}
              {error?<div role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>:null}
            </div>
          </div>

          <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            <button disabled={saving||loading} className="min-h-[52px] w-full rounded-[16px] bg-violet-600 px-5 text-base font-black text-white shadow-[0_10px_22px_rgba(124,58,237,.18)] transition active:scale-[.99] disabled:opacity-45">
              {saving?"Saving…":accountId?"Save expense":"Save now · choose source later"}
            </button>
          </footer>
        </form>
      </div>,document.body):null}
  </>;
}
