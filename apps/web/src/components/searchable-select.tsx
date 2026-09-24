"use client";

import {
  Children,
  isValidElement,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type FlatOption={value:string;label:string;disabled:boolean;group?:string;};
type OptionProps={value?:string|number;disabled?:boolean;children?:ReactNode;};
type OptGroupProps={label?:string;disabled?:boolean;children?:ReactNode;};

function nodeText(node:ReactNode):string{
  if(typeof node==="string"||typeof node==="number")return String(node);
  if(Array.isArray(node))return node.map(nodeText).join("");
  if(isValidElement(node))return nodeText((node.props as {children?:ReactNode}).children);
  return "";
}

function flattenOptions(children:ReactNode,group?:string,groupDisabled=false):FlatOption[]{
  const out:FlatOption[]=[];
  Children.forEach(children,(child)=>{
    if(!isValidElement(child))return;
    const element=child as ReactElement<OptionProps|OptGroupProps>;
    if(element.type==="option"){
      const props=element.props as OptionProps;
      const label=nodeText(props.children).trim();
      out.push({value:String(props.value??label),label,disabled:groupDisabled||Boolean(props.disabled),group});
      return;
    }
    if(element.type==="optgroup"){
      const props=element.props as OptGroupProps;
      out.push(...flattenOptions(props.children,String(props.label??""),groupDisabled||Boolean(props.disabled)));
    }
  });
  return out;
}

type Props=Omit<SelectHTMLAttributes<HTMLSelectElement>,"onChange"|"value"|"defaultValue"|"multiple"> & {
  value?:string|number;
  defaultValue?:string|number;
  onChange?:(event:ChangeEvent<HTMLSelectElement>)=>void;
  children?:ReactNode;
  searchPlaceholder?:string;
  emptyText?:string;
  mobileSheet?:boolean;
};

export function SearchableSelect({
  value,defaultValue,onChange,children,className="app-control",disabled=false,required=false,
  name,id,"aria-label":ariaLabel,searchPlaceholder="Search…",emptyText="No matches",mobileSheet=false,...rest
}:Props){
  const controlled=value!==undefined;
  const [internalValue,setInternalValue]=useState(String(defaultValue??""));
  const selectedValue=String(controlled?value??"":internalValue);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [highlighted,setHighlighted]=useState(0);
  const [isMobile,setIsMobile]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const uid=useId().replace(/:/g,"");
  const listboxId="searchable-select-"+uid;
  const [menuStyle,setMenuStyle]=useState<{left:number;top:number;width:number;maxHeight:number}>({left:0,top:0,width:0,maxHeight:288});
  const options=useMemo(()=>flattenOptions(children),[children]);
  const selected=options.find(option=>option.value===selectedValue);

  useEffect(()=>{
    const media=window.matchMedia("(max-width: 639px)");
    const update=()=>setIsMobile(media.matches);
    update();
    media.addEventListener?.("change",update);
    return()=>media.removeEventListener?.("change",update);
  },[]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    const source=options.filter(option=>option.value!=="");
    if(!needle)return source;
    return source.filter(option=>[option.label,option.group].filter(Boolean).join(" ").toLowerCase().includes(needle));
  },[options,query]);

  useEffect(()=>{
    if(!open)return;
    const selectedIndex=filtered.findIndex(option=>option.value===selectedValue&&!option.disabled);
    setHighlighted(selectedIndex>=0?selectedIndex:Math.max(0,filtered.findIndex(option=>!option.disabled)));
    requestAnimationFrame(()=>searchRef.current?.focus());
  },[open]);

  useEffect(()=>{
    if(!open||mobileSheet&&isMobile)return;
    const position=()=>{
      const rect=rootRef.current?.getBoundingClientRect();
      if(!rect)return;
      const gap=6,below=window.innerHeight-rect.bottom-gap,above=rect.top-gap;
      const openUp=below<260&&above>below;
      const maxHeight=Math.max(180,Math.min(360,(openUp?above:below)-8));
      setMenuStyle({
        left:Math.max(8,Math.min(rect.left,window.innerWidth-Math.max(rect.width,224)-8)),
        top:openUp?Math.max(8,rect.top-maxHeight-gap):rect.bottom+gap,
        width:Math.max(rect.width,224),maxHeight,
      });
    };
    const close=(event:MouseEvent)=>{
      const target=event.target as Node;
      if(rootRef.current?.contains(target)||menuRef.current?.contains(target))return;
      setOpen(false);
    };
    position();
    document.addEventListener("mousedown",close);
    window.addEventListener("resize",position);
    window.addEventListener("scroll",position,true);
    return()=>{
      document.removeEventListener("mousedown",close);
      window.removeEventListener("resize",position);
      window.removeEventListener("scroll",position,true);
    };
  },[open,mobileSheet,isMobile]);

  useEffect(()=>{
    if(!(open&&mobileSheet&&isMobile))return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=previous;};
  },[open,mobileSheet,isMobile]);

  function choose(next:string){
    if(!controlled)setInternalValue(next);
    if(onChange){
      const event={target:{value:next},currentTarget:{value:next}} as unknown as ChangeEvent<HTMLSelectElement>;
      onChange(event);
    }
    setOpen(false);setQuery("");
    requestAnimationFrame(()=>triggerRef.current?.focus());
  }

  function move(delta:number){
    if(!filtered.length)return;
    let next=highlighted;
    for(let i=0;i<filtered.length;i+=1){
      next=(next+delta+filtered.length)%filtered.length;
      if(!filtered[next]?.disabled)break;
    }
    setHighlighted(next);
  }

  function openPicker(initialQuery=""){
    if(disabled)return;
    setQuery(initialQuery);setOpen(true);
  }

  function searchKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(event.key==="ArrowDown"){event.preventDefault();move(1);return;}
    if(event.key==="ArrowUp"){event.preventDefault();move(-1);return;}
    if(event.key==="Enter"){
      event.preventDefault();
      const option=filtered[highlighted];
      if(option&&!option.disabled)choose(option.value);
      return;
    }
    if(event.key==="Escape"){
      event.preventDefault();setOpen(false);setQuery("");
      requestAnimationFrame(()=>triggerRef.current?.focus());
    }
  }

  const search=<div className="border-b border-[var(--border)] p-3">
    <input ref={searchRef} role="combobox" aria-expanded={open} aria-controls={listboxId}
      aria-activedescendant={filtered[highlighted]?listboxId+"-option-"+highlighted:undefined}
      autoComplete="off" className="app-control !min-h-12 !text-[16px] !font-bold"
      value={query} onChange={event=>{setQuery(event.target.value);setHighlighted(0);}}
      onKeyDown={searchKeyDown} placeholder={searchPlaceholder}/>
  </div>;

  const results=<div id={listboxId} className="overflow-y-auto p-1.5"
    style={{maxHeight:mobileSheet&&isMobile?"48dvh":Math.max(120,menuStyle.maxHeight-62)}} role="listbox">
    {filtered.length?filtered.map((option,index)=><button
      id={listboxId+"-option-"+index} key={option.value+"-"+index} type="button" role="option"
      aria-selected={option.value===selectedValue} disabled={option.disabled}
      onMouseEnter={()=>setHighlighted(index)} onClick={()=>{if(!option.disabled)choose(option.value);}}
      className={"flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40 "+
        (index===highlighted?"ring-2 ring-inset ring-[var(--accent-soft)] ":"")+
        (option.value===selectedValue?"bg-[var(--accent-soft)]":"")}>
      <span className="min-w-0">
        <span className="block text-[15px] font-black">{option.label}</span>
        {option.group?<span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{option.group}</span>:null}
      </span>
      {option.value===selectedValue?<span className="shrink-0 text-xs font-black text-[var(--accent)]">✓</span>:null}
    </button>):<div className="px-3 py-6 text-center text-sm font-semibold text-[var(--text-muted)]">{emptyText}</div>}
  </div>;

  return <div ref={rootRef} className="relative w-full">
    <button ref={triggerRef} type="button" id={id} disabled={disabled} role="combobox"
      aria-label={ariaLabel} aria-controls={listboxId} aria-haspopup="listbox" aria-expanded={open} aria-required={required}
      onClick={()=>openPicker("")}
      onKeyDown={event=>{
        if(event.key==="ArrowDown"){event.preventDefault();openPicker("");return;}
        if(event.key==="Enter"||event.key===" "){event.preventDefault();openPicker("");return;}
        if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();openPicker(event.key);}
      }}
      className={(className||"app-control")+" flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"}>
      <span className={selectedValue&&selected?"min-w-0 truncate":"min-w-0 truncate text-[var(--text-muted)]"}>{selected?.label??options.find(option=>option.value==="")?.label??"Select"}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">⌄</span>
    </button>

    <select {...rest} name={name} value={selectedValue} onChange={()=>{}} disabled={disabled} tabIndex={-1} aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0">{children}</select>

    {open&&!disabled&&typeof document!=="undefined"?
      (mobileSheet&&isMobile
        ? createPortal(<div className="fixed inset-0 z-[9999] flex items-end bg-black/45"
            onMouseDown={event=>{if(event.target===event.currentTarget){setOpen(false);setQuery("");}}}>
            <div ref={menuRef} className="w-full overflow-hidden rounded-t-[26px] bg-[var(--surface)] shadow-2xl">
              <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--border)]"/>
              <div className="flex items-center justify-between px-4 pb-2 pt-3">
                <strong className="text-[16px] font-black">{ariaLabel??"Choose account"}</strong>
                <button type="button" onClick={()=>{setOpen(false);setQuery("");}} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-soft)] text-lg font-black text-[var(--text-muted)]">×</button>
              </div>
              {search}{results}<div className="h-[max(.5rem,env(safe-area-inset-bottom))]"/>
            </div>
          </div>,document.body)
        : createPortal(<div ref={menuRef} className="fixed z-[9999] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            style={{left:menuStyle.left,top:menuStyle.top,width:menuStyle.width,maxHeight:menuStyle.maxHeight}}>
            {search}{results}
          </div>,document.body))
      :null}
  </div>;
}
