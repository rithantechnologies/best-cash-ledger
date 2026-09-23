"use client";

import {
  Children,
  isValidElement,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type FlatOption={
  value:string;
  label:string;
  disabled:boolean;
  group?:string;
};

type OptionProps={
  value?: string|number;
  disabled?: boolean;
  children?: ReactNode;
};

type OptGroupProps={
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
};

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
      out.push({
        value:String(props.value??label),
        label,
        disabled:groupDisabled||Boolean(props.disabled),
        group,
      });
      return;
    }
    if(element.type==="optgroup"){
      const props=element.props as OptGroupProps;
      const nextGroup=String(props.label??"");
      out.push(...flattenOptions(props.children,nextGroup,groupDisabled||Boolean(props.disabled)));
    }
  });
  return out;
}

type Props=Omit<SelectHTMLAttributes<HTMLSelectElement>,"onChange"|"value"|"defaultValue"|"multiple"> & {
  value?: string|number;
  defaultValue?: string|number;
  onChange?:(event:ChangeEvent<HTMLSelectElement>)=>void;
  children?:ReactNode;
  searchPlaceholder?:string;
  emptyText?:string;
};

export function SearchableSelect({
  value,
  defaultValue,
  onChange,
  children,
  className="app-control",
  disabled=false,
  required=false,
  name,
  id,
  "aria-label":ariaLabel,
  searchPlaceholder="Search…",
  emptyText="No matches",
  ...rest
}:Props){
  const controlled=value!==undefined;
  const [internalValue,setInternalValue]=useState(String(defaultValue??""));
  const selectedValue=String(controlled?value??"":internalValue);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const rootRef=useRef<HTMLDivElement>(null);
  const options=useMemo(()=>flattenOptions(children),[children]);
  const selected=options.find(option=>option.value===selectedValue);

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
      [option.label,option.group].filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  },[options,query]);

  function choose(next:string){
    if(!controlled)setInternalValue(next);
    if(onChange){
      const event={
        target:{value:next},
        currentTarget:{value:next},
      } as unknown as ChangeEvent<HTMLSelectElement>;
      onChange(event);
    }
    setOpen(false);
    setQuery("");
  }

  return <div ref={rootRef} className="relative w-full">
    <button
      type="button"
      id={id}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-required={required}
      onClick={()=>{if(disabled)return;setOpen(current=>!current);setQuery("");}}
      className={(className||"app-control")+" flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"}
    >
      <span className={selectedValue&&selected?"min-w-0 truncate":"min-w-0 truncate text-[var(--text-muted)]"}>{selected?.label??options.find(option=>option.value==="")?.label??"Select"}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">⌄</span>
    </button>

    {/* Keep native form value/name semantics without exposing the native picker. */}
    <select
      {...rest}
      name={name}
      value={selectedValue}
      onChange={()=>{}}
      disabled={disabled}
      required={required}
      tabIndex={-1}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
    >
      {children}
    </select>

    {open&&!disabled?<div className="absolute inset-x-0 top-[calc(100%+.35rem)] z-[80] min-w-[14rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
      <div className="border-b border-[var(--border)] p-2">
        <input
          autoFocus
          className="app-control"
          value={query}
          onChange={event=>setQuery(event.target.value)}
          onKeyDown={event=>{if(event.key==="Escape")setOpen(false);}}
          placeholder={searchPlaceholder}
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1.5" role="listbox">
        {filtered.length?filtered.map((option,index)=><button
          key={option.value+"-"+index}
          type="button"
          disabled={option.disabled}
          onClick={()=>{if(!option.disabled)choose(option.value);}}
          className={"flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40 "+(option.value===selectedValue?"bg-[var(--accent-soft)]":"")}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{option.label}</span>
            {option.group?<span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{option.group}</span>:null}
          </span>
          {option.value===selectedValue?<span className="shrink-0 text-xs font-black text-[var(--accent)]">✓</span>:null}
        </button>):<div className="px-3 py-5 text-center text-xs font-semibold text-[var(--text-muted)]">{emptyText}</div>}
      </div>
    </div>:null}
  </div>;
}
