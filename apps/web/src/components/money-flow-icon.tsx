"use client";

export function MoneyFlowIcon({direction,size="md"}:{direction:"IN"|"OUT";size?:"sm"|"md"}){
  const incoming=direction==="IN";
  return <span
    className={(size==="sm"?"h-8 w-8 rounded-xl ":"h-9 w-9 rounded-xl ")+"grid shrink-0 place-items-center "+(incoming
      ?"bg-[color-mix(in_srgb,var(--money-in)_12%,transparent)] text-[var(--money-in)]"
      :"bg-[color-mix(in_srgb,var(--money-out)_10%,transparent)] text-[var(--money-out)]")}
    aria-label={incoming?"Money in":"Money out"}
    title={incoming?"Money in":"Money out"}
  >
    <svg viewBox="0 0 24 24" className={size==="sm"?"h-4 w-4":"h-[18px] w-[18px]"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="13" height="10" rx="2"/>
      <circle cx="9.5" cy="12" r="2"/>
      <path d="M5.5 9.5h.01M13.5 14.5h.01"/>
      {incoming
        ?<><path d="M20 4v8"/><path d="m17.5 9.5 2.5 2.5 2.5-2.5"/></>
        :<><path d="M20 12V4"/><path d="m17.5 6.5 2.5-2.5 2.5 2.5"/></>}
    </svg>
  </span>;
}
