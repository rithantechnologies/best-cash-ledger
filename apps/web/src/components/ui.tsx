import type { ReactNode } from "react";

export function Spinner({size="md"}:{size?:"sm"|"md"|"lg"}) {
  const sizes={sm:"h-4 w-4 border-2",md:"h-7 w-7 border-[3px]",lg:"h-10 w-10 border-4"};
  return <span className={"inline-block animate-spin rounded-full border-slate-200 border-t-indigo-600 "+sizes[size]} aria-hidden="true"/>;
}

export function Shimmer({className=""}:{className?:string}) {
  return <span className={"cashledger-shimmer block rounded-xl "+className} aria-hidden="true"/>;
}

export function PageLoader({label="Loading workspace…"}:{label?:string}) {
  return <div className="mx-auto min-h-[62vh] w-full max-w-7xl space-y-5 py-1" role="status" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div className="flex items-end justify-between gap-4">
      <div className="w-full max-w-xl space-y-2">
        <Shimmer className="h-3 w-24"/>
        <Shimmer className="h-8 w-64 max-w-[70%]"/>
        <Shimmer className="h-4 w-full max-w-md"/>
      </div>
      <Shimmer className="hidden h-10 w-28 sm:block"/>
    </div>
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {[0,1,2,3,4].map(i=><div key={i} className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm">
        <Shimmer className="h-3 w-20"/>
        <Shimmer className="mt-3 h-7 w-28 max-w-[85%]"/>
        <Shimmer className="mt-2 h-3 w-16"/>
      </div>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]">
      <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><Shimmer className="h-4 w-40"/><Shimmer className="mt-2 h-3 w-64 max-w-[70%]"/></div>
        <div className="space-y-3 p-4">{[0,1,2,3,4].map(i=><div key={i} className="grid grid-cols-[1.2fr_.8fr_.6fr] gap-3"><Shimmer className="h-10"/><Shimmer className="h-10"/><Shimmer className="h-10"/></div>)}</div>
      </div>
      <div className="space-y-3 rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm">
        <Shimmer className="h-4 w-36"/>
        <Shimmer className="h-20"/>
        <Shimmer className="h-20"/>
        <Shimmer className="h-12"/>
      </div>
    </div>
  </div>;
}

export function Surface({children,className=""}:{children:ReactNode;className?:string}) {
  return <section className={"rounded-[22px] border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.03),0_12px_32px_rgba(15,23,42,.035)] "+className}>{children}</section>;
}
export function SectionHeading({
  eyebrow,title,description,action,
}:{eyebrow?:string;title:string;description?:string;action?:ReactNode}) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow?<p className="text-[10px] font-bold uppercase tracking-[.2em] text-indigo-600">{eyebrow}</p>:null}
      <h2 className="mt-0.5 text-2xl font-bold tracking-[-.025em] text-slate-950 sm:text-[28px]">{title}</h2>
      {description?<p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">{description}</p>:null}
    </div>
    {action?<div className="shrink-0">{action}</div>:null}
  </div>;
}

export function MiniStat({
  label,value,detail,tone="slate",
}:{label:string;value:ReactNode;detail?:ReactNode;tone?:"slate"|"emerald"|"indigo"|"amber"|"rose"|"cyan"}) {
  const tones={
    slate:"text-slate-950",emerald:"text-emerald-700",indigo:"text-indigo-700",
    amber:"text-amber-700",rose:"text-rose-700",cyan:"text-cyan-700",
  };
  return <div className="min-w-0">
    <p className="truncate text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">{label}</p>
    <p className={"mt-1 truncate text-lg font-bold tracking-tight "+tones[tone]}>{value}</p>
    {detail?<p className="mt-0.5 truncate text-[11px] text-slate-400">{detail}</p>:null}
  </div>;
}
export function CompactMetric({
  label,value,tone="slate",bar,
}:{label:string;value:ReactNode;tone?:"slate"|"emerald"|"indigo"|"amber"|"rose"|"cyan";bar?:number}) {
  const tones={
    slate:"bg-slate-900",emerald:"bg-emerald-500",indigo:"bg-indigo-500",
    amber:"bg-amber-500",rose:"bg-rose-500",cyan:"bg-cyan-500",
  };
  return <div className="rounded-xl bg-slate-50/90 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-xs font-medium text-slate-500">{label}</span>
      <strong className="shrink-0 text-sm tracking-tight text-slate-900">{value}</strong>
    </div>
    {bar!==undefined?<div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200/70"><div className={"h-full rounded-full "+tones[tone]} style={{width:Math.max(2,Math.min(100,bar))+"%"}}/></div>:null}
  </div>;
}

export function StatusBadge({children,tone="slate"}:{children:ReactNode;tone?:"slate"|"emerald"|"indigo"|"amber"|"rose"|"cyan"}) {
  const tones={
    slate:"bg-slate-100 text-slate-600",emerald:"bg-emerald-50 text-emerald-700",
    indigo:"bg-indigo-50 text-indigo-700",amber:"bg-amber-50 text-amber-700",
    rose:"bg-rose-50 text-rose-700",cyan:"bg-cyan-50 text-cyan-700",
  };
  return <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide "+tones[tone]}>{children}</span>;
}
export function EmptyState({title,description}:{title:string;description?:string}) {
  return <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
    <div><div className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">—</div>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      {description?<p className="mt-1 text-xs text-slate-400">{description}</p>:null}
    </div>
  </div>;
}

export function Modal({
  open,title,description,onClose,children,footer,
}:{open:boolean;title:string;description?:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}) {
  if(!open)return null;
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-5">
    <button className="absolute inset-0" onClick={onClose} aria-label="Close dialog"/>
    <div className="relative max-h-[92vh] w-full overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-w-2xl sm:rounded-[28px]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div><h3 className="text-lg font-bold tracking-tight">{title}</h3>{description?<p className="mt-1 text-xs text-slate-500">{description}</p>:null}</div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-lg text-slate-500">×</button>
      </div>
      <div className="max-h-[65vh] overflow-y-auto p-5 sm:p-6">{children}</div>
      {footer?<div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">{footer}</div>:null}
    </div>
  </div>;
}

export function FormSection({
  step,title,description,children,
}:{step?:string;title:string;description?:string;children:ReactNode}) {
  return <Surface className="overflow-hidden">
    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
      {step?<span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-50 text-xs font-black text-indigo-700">{step}</span>:null}
      <div><h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>{description?<p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>:null}</div>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </Surface>;
}

export function Field({
  label,hint,children,className="",
}:{label:string;hint?:string;children:ReactNode;className?:string}) {
  return <label className={"block min-w-0 "+className}>
    <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
    {children}
    {hint?<span className="mt-1.5 block text-[11px] leading-4 text-slate-400">{hint}</span>:null}
  </label>;
}

export function SummaryRow({label,value,tone="slate"}:{label:string;value:ReactNode;tone?:"slate"|"emerald"|"indigo"|"amber"|"rose"|"cyan"}) {
  const tones={slate:"text-slate-950",emerald:"text-emerald-700",indigo:"text-indigo-700",amber:"text-amber-700",rose:"text-rose-700",cyan:"text-cyan-700"};
  return <div className="flex items-center justify-between gap-4 py-2.5"><span className="text-xs text-slate-500">{label}</span><strong className={"text-sm "+tones[tone]}>{value}</strong></div>;
}
export function TransactionFrame({
  eyebrow,title,description,children,summary,footer,
}:{eyebrow:string;title:string;description:string;children:ReactNode;summary:ReactNode;footer?:ReactNode}) {
  return <div className="page-enter mx-auto max-w-6xl space-y-5">
    <SectionHeading eyebrow={eyebrow} title={title} description={description}/>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">{children}</div>
      <div className="space-y-3 lg:sticky lg:top-20">
        <Surface className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Live calculation</p><h3 className="mt-0.5 text-sm font-bold">Transaction summary</h3></div>
          <div className="divide-y divide-slate-100 px-4">{summary}</div>
        </Surface>
        {footer}
      </div>
    </div>
  </div>;
}


export function PageFrame({
  children,className="",width="max-w-7xl",
}:{children:ReactNode;className?:string;width?:string}) {
  return <div className={"page-enter mx-auto "+width+" space-y-5 "+className}>{children}</div>;
}

export function Notice({
  children,tone="slate",
}:{children:ReactNode;tone?:"slate"|"emerald"|"amber"|"rose"|"indigo"}) {
  const tones={
    slate:"border-slate-200 bg-slate-50 text-slate-700",
    emerald:"border-emerald-200 bg-emerald-50 text-emerald-700",
    amber:"border-amber-200 bg-amber-50 text-amber-800",
    rose:"border-rose-200 bg-rose-50 text-rose-700",
    indigo:"border-indigo-200 bg-indigo-50 text-indigo-700",
  };
  return <div className={"rounded-2xl border px-4 py-3 text-sm font-medium "+tones[tone]}>{children}</div>;
}

export function Toolbar({children}:{children:ReactNode}) {
  return <Surface className="p-3 sm:p-4"><div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">{children}</div></Surface>;
}


export function SegmentedTabs<T extends string>({
  value,onChange,items,
}:{value:T;onChange:(value:T)=>void;items:{value:T;label:string;count?:number}[]}) {
  return <div className="w-full overflow-x-auto pb-1">
    <div className="inline-flex min-w-max rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      {items.map(item=><button key={item.value} type="button" onClick={()=>onChange(item.value)}
        className={"min-h-10 rounded-xl px-3.5 text-xs font-bold transition "+(value===item.value?"bg-slate-950 text-white shadow-sm":"text-slate-500 hover:bg-slate-50 hover:text-slate-900")}>
        {item.label}{item.count!==undefined?<span className={"ml-2 rounded-full px-1.5 py-0.5 text-[10px] "+(value===item.value?"bg-white/15":"bg-slate-100")}>{item.count}</span>:null}
      </button>)}
    </div>
  </div>;
}

export function Pager({
  total,page,totalPages,label="item",onPrevious,onNext,
}:{total:number;page:number;totalPages:number;label?:string;onPrevious:()=>void;onNext:()=>void}) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-xs text-slate-500">{total} {label}{total===1?"":"s"} · Page {page} of {Math.max(1,totalPages)}</p>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={page<=1} onClick={onPrevious} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 disabled:opacity-40">Previous</button>
      <button type="button" disabled={page>=totalPages} onClick={onNext} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 disabled:opacity-40">Next</button>
    </div>
  </div>;
}


export function DetailStat({
  label,value,tone="slate",detail,
}:{label:string;value:ReactNode;detail?:ReactNode;tone?:"slate"|"emerald"|"indigo"|"amber"|"rose"|"cyan"}) {
  const tones={slate:"text-slate-950",emerald:"text-emerald-700",indigo:"text-indigo-700",amber:"text-amber-700",rose:"text-rose-700",cyan:"text-cyan-700"};
  return <Surface className="p-3.5 sm:p-4">
    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">{label}</p>
    <p className={"mt-1.5 truncate text-lg font-black tracking-tight sm:text-xl "+tones[tone]}>{value}</p>
    {detail?<p className="mt-1 text-[11px] text-slate-400">{detail}</p>:null}
  </Surface>;
}

export function PanelHeader({
  title,description,action,
}:{title:string;description?:string;action?:ReactNode}) {
  return <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <div><h3 className="text-sm font-bold tracking-tight">{title}</h3>{description?<p className="mt-0.5 text-[11px] text-slate-400">{description}</p>:null}</div>
    {action?<div className="shrink-0">{action}</div>:null}
  </div>;
}
