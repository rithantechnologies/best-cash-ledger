"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchSelectOption={
  value:string;
  label:string;
  description?:string;
  searchText?:string;
  disabled?:boolean;
};

export function SearchSelect({
  value,onChange,options,placeholder="Select",searchPlaceholder="Search…",emptyText="No matches",className="",
}:{
  value:string;
  onChange:(value:string)=>void;
  options:SearchSelectOption[];
  placeholder?:string;
  searchPlaceholder?:string;
  emptyText?:string;
  className?:string;
}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const rootRef=useRef<HTMLDivElement>(null);
  const selected=options.find(option=>option.value===value);

  useEffect(()=>{
    if(!open)return;
    const close=(event:MouseEvent)=>{
      if(rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false);
    };
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[open]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    if(!needle)return options;
    return options.filter(option=>
      [option.label,option.description,option.searchText]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  },[options,query]);

  return <div ref={rootRef} className={"relative "+className}>
    <button type="button" onClick={()=>{setOpen(current=>!current);setQuery("");}} className="app-control flex w-full items-center justify-between gap-3 text-left" aria-haspopup="listbox" aria-expanded={open}>
      <span className={selected?"truncate font-semibold":"truncate text-[var(--text-muted)]"}>{selected?.label??placeholder}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">⌄</span>
    </button>
    {open?<div className="absolute inset-x-0 top-[calc(100%+.35rem)] z-50 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
      <div className="border-b border-[var(--border)] p-2">
        <input autoFocus className="app-control" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);}} placeholder={searchPlaceholder}/>
      </div>
      <div className="max-h-64 overflow-y-auto p-1.5" role="listbox">
        {filtered.length?filtered.map(option=><button key={option.value} type="button" disabled={option.disabled} onClick={()=>{if(option.disabled)return;onChange(option.value);setOpen(false);setQuery("");}} className={"flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40 "+(option.value===value?"bg-[var(--accent-soft)]":"")}>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{option.label}</span>{option.description?<span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">{option.description}</span>:null}</span>
          {option.value===value?<span className="shrink-0 text-xs font-black text-[var(--accent)]">✓</span>:null}
        </button>):<div className="px-3 py-5 text-center text-xs font-semibold text-[var(--text-muted)]">{emptyText}</div>}
      </div>
    </div>:null}
  </div>;
}
