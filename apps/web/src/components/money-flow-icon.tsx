"use client";

export function MoneyFlowIcon({direction,className=""}:{direction:"IN"|"OUT";className?:string}){
  const incoming=direction==="IN";
  return <span
    aria-label={incoming?"Money in":"Money out"}
    title={incoming?"Money in":"Money out"}
    className={"inline-grid h-7 w-7 shrink-0 place-items-center rounded-full "+(incoming?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-600")+" "+className}
  >
    {incoming
      ? <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>
      : <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/></svg>}
  </span>;
}
