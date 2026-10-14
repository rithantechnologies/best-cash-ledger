"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type SearchSelectOption={
  value:string;
  label:string;
  description?:string;
  searchText?:string;
  disabled?:boolean;
};

type MenuPosition={left:number;top:number;width:number;maxHeight:number};
type Viewport={top:number;height:number};

export function SearchSelect({
  value,onChange,options,placeholder="Select",searchPlaceholder="Search…",emptyText="No matches",
  className="",disabled=false,onSearchChange,pickerTitle,
}:{
  value:string;
  onChange:(value:string)=>void;
  options:SearchSelectOption[];
  placeholder?:string;
  searchPlaceholder?:string;
  emptyText?:string;
  className?:string;
  disabled?:boolean;
  onSearchChange?:(search:string)=>void;
  pickerTitle?:string;
}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [highlighted,setHighlighted]=useState(0);
  const [mobile,setMobile]=useState(false);
  const [position,setPosition]=useState<MenuPosition>({left:8,top:8,width:320,maxHeight:380});
  const [viewport,setViewport]=useState<Viewport>({top:0,height:windowHeightFallback()});
  const rootRef=useRef<HTMLDivElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const listId="search-select-"+useId().replace(/:/g,"");
  const selected=options.find(option=>option.value===value);
  const title=pickerTitle??placeholder;

  const closePicker=useCallback((returnFocus=true)=>{
    setOpen(false);
    setQuery("");
    onSearchChange?.("");
    if(returnFocus)requestAnimationFrame(()=>triggerRef.current?.focus());
  },[onSearchChange]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    if(!needle)return options;
    return options.filter(option=>
      [option.label,option.description,option.searchText].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  },[options,query]);

  useEffect(()=>{
    const media=window.matchMedia("(max-width: 767px)");
    const update=()=>setMobile(media.matches);
    update();
    media.addEventListener("change",update);
    return()=>media.removeEventListener("change",update);
  },[]);

  useEffect(()=>{
    if(!open)return;
    const frame=requestAnimationFrame(()=>inputRef.current?.focus());
    return()=>cancelAnimationFrame(frame);
  },[open,mobile]);

  useLayoutEffect(()=>{
    if(!open)return;
    const updatePosition=()=>{
      const vv=window.visualViewport;
      const viewTop=vv?.offsetTop??0;
      const viewLeft=vv?.offsetLeft??0;
      const viewHeight=vv?.height??window.innerHeight;
      const viewWidth=vv?.width??window.innerWidth;
      setViewport({top:viewTop,height:viewHeight});
      if(mobile)return;
      const rect=triggerRef.current?.getBoundingClientRect();
      if(!rect)return;
      const margin=8,gap=6;
      const bottom=viewTop+viewHeight-margin;
      const top=viewTop+margin;
      const below=bottom-rect.bottom-gap;
      const above=rect.top-top-gap;
      const openAbove=below<240&&above>below;
      const room=Math.max(110,openAbove?above:below);
      const maxHeight=Math.min(430,room);
      const width=Math.min(Math.max(rect.width,340),viewWidth-margin*2);
      const left=Math.max(viewLeft+margin,Math.min(rect.left,viewLeft+viewWidth-width-margin));
      setPosition({
        left,top:openAbove?Math.max(top,rect.top-gap-maxHeight):rect.bottom+gap,
        width,maxHeight,
      });
    };
    const onOutside=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(rootRef.current?.contains(target)||menuRef.current?.contains(target))return;
      closePicker(false);
    };
    updatePosition();
    document.addEventListener("pointerdown",onOutside);
    window.addEventListener("resize",updatePosition);
    window.addEventListener("scroll",updatePosition,true);
    window.visualViewport?.addEventListener("resize",updatePosition);
    window.visualViewport?.addEventListener("scroll",updatePosition);
    return()=>{
      document.removeEventListener("pointerdown",onOutside);
      window.removeEventListener("resize",updatePosition);
      window.removeEventListener("scroll",updatePosition,true);
      window.visualViewport?.removeEventListener("resize",updatePosition);
      window.visualViewport?.removeEventListener("scroll",updatePosition);
    };
  },[open,mobile,closePicker]);

  useEffect(()=>{
    if(!open||!mobile)return;
    // Keep the underlying form from scrolling while the search view is open.
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=previous;};
  },[open,mobile]);

  function startPicker(){
    if(disabled)return;
    setQuery("");
    setHighlighted(0);
    onSearchChange?.("");
    setOpen(true);
  }

  function choose(next:string){
    onChange(next);
    closePicker();
  }

  function move(delta:number){
    if(!filtered.length)return;
    let next=highlighted;
    for(let index=0;index<filtered.length;index++){
      next=(next+delta+filtered.length)%filtered.length;
      if(!filtered[next].disabled){setHighlighted(next);break;}
    }
  }

  function searchKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(event.key==="Escape"){event.preventDefault();closePicker();return;}
    if(event.key==="ArrowDown"){event.preventDefault();move(1);return;}
    if(event.key==="ArrowUp"){event.preventDefault();move(-1);return;}
    if(event.key==="Enter"){
      event.preventDefault();
      const choice=filtered[highlighted];
      if(choice&&!choice.disabled)choose(choice.value);
    }
  }

  const search=<div className="shrink-0 border-b border-[var(--border)] p-3">
    <input ref={inputRef} role="combobox" aria-label={searchPlaceholder} aria-expanded={open}
      aria-controls={listId} aria-activedescendant={filtered[highlighted]?listId+"-option-"+highlighted:undefined}
      autoComplete="off" className="app-control !min-h-12 !text-base"
      value={query} onChange={event=>{setQuery(event.target.value);setHighlighted(0);onSearchChange?.(event.target.value);}}
      onKeyDown={searchKeyDown} placeholder={searchPlaceholder}/>
    <p className="mt-1.5 px-1 text-xs text-[var(--text-muted)]" aria-live="polite">
      {filtered.length} {filtered.length===1?"result":"results"} · Type to narrow the list
    </p>
  </div>;

  const results=<div id={listId} role="listbox" aria-label={title}
    className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
    {filtered.length?filtered.map((option,index)=><button
      id={listId+"-option-"+index} key={option.value} type="button" role="option"
      aria-selected={value===option.value} disabled={option.disabled}
      onMouseEnter={()=>setHighlighted(index)} onClick={()=>choose(option.value)}
      className={"flex min-h-12 w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 "+
        (index===highlighted?"ring-2 ring-inset ring-[var(--accent-soft)] ":"")+
        (value===option.value?"bg-[var(--accent-soft)]":"")}>
      <span className="min-w-0 flex-1 break-words">
        <span className="block text-sm font-semibold leading-5">{option.label}</span>
        {option.description?<span className="mt-0.5 block text-xs leading-4 text-[var(--text-muted)]">{option.description}</span>:null}
      </span>
      {value===option.value?<span className="shrink-0 text-sm font-black text-[var(--accent)]">✓</span>:null}
    </button>):<p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">{emptyText}</p>}
  </div>;

  return <div ref={rootRef} className={"relative min-w-0 "+className}>
    <button ref={triggerRef} type="button" disabled={disabled} aria-label={title} aria-haspopup="listbox"
      aria-controls={open?listId:undefined} aria-expanded={open}
      onClick={()=>open?closePicker(false):startPicker()}
      onKeyDown={event=>{
        if(event.key==="ArrowDown"||event.key==="Enter"||event.key===" "){event.preventDefault();startPicker();}
      }}
      className="app-control flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50">
      <span className={selected?"min-w-0 truncate font-semibold":"min-w-0 truncate text-[var(--text-muted)]"}>{selected?.label??placeholder}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">⌄</span>
    </button>

    {open&&!disabled&&typeof document!=="undefined"?createPortal(
      mobile
        ? <div ref={menuRef} role="dialog" aria-modal="true" aria-label={title}
            className="fixed inset-x-0 z-[1000] flex flex-col overflow-hidden bg-[var(--surface)] shadow-2xl"
            style={{top:viewport.top,height:viewport.height}}>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 pt-[max(.75rem,env(safe-area-inset-top))]">
              <strong className="min-w-0 text-base font-black">{title}</strong>
              <button type="button" onClick={()=>closePicker()} aria-label="Close search"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-xl">×</button>
            </div>
            {search}{results}
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]"/>
          </div>
        : <div ref={menuRef} className="fixed z-[1000] flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            style={{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight}}>
            {search}{results}
          </div>,document.body
    ):null}
  </div>;
}

function windowHeightFallback(){
  return typeof window==="undefined"?600:window.innerHeight;
}
