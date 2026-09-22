"use client";

import { useMemo, useState } from "react";

type MovementPoint = {
  id: string;
  activityId?: string;
  transactionId?: string;
  direction: "IN" | "OUT";
  amount: number;
  runningBalance: number;
  description: string | null;
  transactionNumber: string;
  transactionType: string;
  transactionAt: string;
};

type HistoryPoint = {
  id: string;
  businessDate: string;
  openingTotal: string;
  expectedClosingTotal: string | null;
  actualClosingTotal: string | null;
  differenceAmount: string | null;
};

export type ServiceCashGroup = {
  id: string;
  label: string;
  transactionAmount: number;
  cashIn: number;
  cashOut: number;
  commissionAmount: number;
  count: number;
};

const money=(value:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(value||0);
const compact=(value:number)=>new Intl.NumberFormat("en-IN",{notation:"compact",maximumFractionDigits:1}).format(value||0);
const timeLabel=(value:string)=>new Date(value).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
const dayLabel=(value:string,long=false)=>new Date(value).toLocaleDateString("en-IN",long?{day:"numeric",month:"short",year:"numeric"}:{day:"numeric",month:"short"});
const path=(points:Array<{x:number;y:number}>)=>points.map((point,index)=>(index?"L":"M")+point.x.toFixed(2)+" "+point.y.toFixed(2)).join(" ");

export function CashMovementChart({
  opening,
  movements,
  selectedId,
  onSelect,
}:{
  opening:number;
  movements:MovementPoint[];
  selectedId:string|null;
  onSelect:(movement:MovementPoint)=>void;
}){
  const [hovered,setHovered]=useState<number|null>(null);
  const geometry=useMemo(()=>{
    const width=900,height=292,left=62,right=24,top=30,bottom=44;
    const values=[opening,...movements.map((row)=>row.runningBalance)];
    const rawMin=Math.min(...values),rawMax=Math.max(...values);
    const padding=Math.max(500,(rawMax-rawMin)*.12);
    const min=Math.max(0,rawMin-padding),max=rawMax+padding;
    const plotWidth=width-left-right,plotHeight=height-top-bottom;
    const points=values.map((value,index)=>({
      x:values.length<=1?left+plotWidth/2:left+(index*plotWidth)/(values.length-1),
      y:top+plotHeight-((value-min)/(max-min||1))*plotHeight,
    }));
    return {width,height,left,right,top,bottom,min,max,plotWidth,plotHeight,points};
  },[opening,movements]);

  if(!movements.length)return <div className="cash-chart-empty flex min-h-[130px] items-center justify-between gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] px-5 py-5 sm:px-6">
    <div><p className="text-sm font-extrabold">No cash movement yet</p><p className="mt-1 text-[13px] text-[var(--text-muted)]">The balance will move as cash transactions are recorded.</p></div>
    <div className="shrink-0 text-right"><p className="text-xs font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">Opening</p><strong className="money mt-1 block text-xl font-black">{money(opening)}</strong></div>
  </div>;

  const selectedIndex=movements.findIndex((row)=>row.id===selectedId||row.activityId===selectedId);
  const activeIndex=hovered??(selectedIndex>=0?selectedIndex:movements.length-1);
  const active=activeIndex>=0?movements[activeIndex]:null;
  const activePoint=active?geometry.points[activeIndex+1]:geometry.points[0];
  const line=path(geometry.points);
  const area=line+` L${geometry.points.at(-1)?.x??0} ${geometry.height-geometry.bottom} L${geometry.points[0].x} ${geometry.height-geometry.bottom} Z`;
  const labelEvery=Math.max(1,Math.ceil(Math.max(1,movements.length)/6));

  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3 text-[11px] font-bold text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--accent)]"/>Drawer</span>
        <span>Opening {money(opening)}</span>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{active?"At this point":"Cash now"}</p>
        <p className="money text-sm font-black">{money(active?.runningBalance??opening)}</p>
      </div>
    </div>
    <div className="relative overflow-x-auto cash-chart-scroll">
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="cash-chart-svg w-full" role="group" aria-label="Expected physical cash balance through today's transactions" onMouseLeave={()=>setHovered(null)}>
        <defs>
          <linearGradient id="cash-desk-balance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".20"/>
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0,.25,.5,.75,1].map((tick)=>{
          const y=geometry.top+geometry.plotHeight*tick;
          const value=geometry.max-(geometry.max-geometry.min)*tick;
          return <g key={tick}>
            <line x1={geometry.left} x2={geometry.width-geometry.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 6"/>
            <text x={geometry.left-10} y={y+4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{compact(value)}</text>
          </g>;
        })}
        <path d={area} fill="url(#cash-desk-balance-fill)"/>
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={geometry.points[0].x} cy={geometry.points[0].y} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2"/>
        {movements.map((movement,index)=>{
          const point=geometry.points[index+1];
          const activeDot=index===activeIndex;
          const showLabel=index%labelEvery===0||index===movements.length-1;
          return <g key={movement.id} role="button" tabIndex={0} className="cursor-pointer outline-none" onMouseEnter={()=>setHovered(index)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} onClick={()=>onSelect(movement)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(movement);}}}>
            <rect x={point.x-12} y={geometry.top} width="24" height={geometry.plotHeight} fill="transparent"/>
            {activeDot?<line x1={point.x} x2={point.x} y1={geometry.top} y2={geometry.height-geometry.bottom} stroke="var(--text-muted)" strokeDasharray="3 5" opacity=".55"/>:null}
            <circle cx={point.x} cy={point.y} r={activeDot?6:3.5} fill={movement.direction==="IN"?"var(--money-in)":"var(--money-out)"} stroke="var(--surface)" strokeWidth="2"/>
            {showLabel?<text x={point.x} y={geometry.height-15} textAnchor="middle" fill="var(--text-muted)" fontSize="11">{timeLabel(movement.transactionAt)}</text>:null}
            <title>{`${timeLabel(movement.transactionAt)} · ${movement.direction==="IN"?"Cash in":"Cash out"} ${money(movement.amount)} · Drawer ${money(movement.runningBalance)}`}</title>
          </g>;
        })}
        {active?<g pointerEvents="none">
          <rect x={Math.min(geometry.width-226,Math.max(72,activePoint.x-102))} y={Math.max(8,activePoint.y-74)} width="204" height="52" rx="10" fill="var(--surface)" stroke="var(--border)"/>
          <text x={Math.min(geometry.width-214,Math.max(84,activePoint.x-90))} y={Math.max(28,activePoint.y-54)} fill="var(--text-muted)" fontSize="10" fontWeight="700">{timeLabel(active.transactionAt)} · {active.transactionNumber}</text>
          <text x={Math.min(geometry.width-214,Math.max(84,activePoint.x-90))} y={Math.max(46,activePoint.y-36)} fill="var(--text)" fontSize="12" fontWeight="800">{active.direction==="IN"?"+":"−"}{money(active.amount)} · {money(active.runningBalance)}</text>
        </g>:null}
      </svg>
    </div>
  </div>;
}

export function CashHistoryChart({
  rows,
  selectedId,
  onSelect,
}:{
  rows:HistoryPoint[];
  selectedId:string|null;
  onSelect:(row:HistoryPoint)=>void;
}){
  const [hovered,setHovered]=useState<number|null>(null);
  const geometry=useMemo(()=>{
    const width=900,height=292,left=62,right=24,top=30,bottom=44;
    const values=rows.flatMap((row)=>[Number(row.expectedClosingTotal||0),Number(row.actualClosingTotal||row.expectedClosingTotal||0)]);
    const rawMin=Math.min(...values,0),rawMax=Math.max(...values,1);
    const padding=Math.max(500,(rawMax-rawMin)*.1);
    const min=Math.max(0,rawMin-padding),max=rawMax+padding;
    const plotWidth=width-left-right,plotHeight=height-top-bottom;
    const make=(key:"expected"|"actual")=>rows.map((row,index)=>{
      const value=key==="expected"?Number(row.expectedClosingTotal||0):Number(row.actualClosingTotal||row.expectedClosingTotal||0);
      return {x:rows.length<=1?left+plotWidth/2:left+(index*plotWidth)/(rows.length-1),y:top+plotHeight-((value-min)/(max-min||1))*plotHeight};
    });
    return {width,height,left,right,top,bottom,min,max,plotWidth,plotHeight,expected:make("expected"),actual:make("actual")};
  },[rows]);

  if(!rows.length)return <div className="grid min-h-[250px] place-items-center text-sm text-[var(--text-muted)]">No closed cash days in this period.</div>;
  const selectedIndex=rows.findIndex((row)=>row.id===selectedId);
  const activeIndex=hovered??(selectedIndex>=0?selectedIndex:rows.length-1);
  const active=rows[activeIndex];
  const labelEvery=Math.max(1,Math.ceil(rows.length/7));

  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-4 text-[11px] font-bold text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--accent)]"/>Expected</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--money-in)]"/>Counted</span>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--text-muted)]">{dayLabel(active.businessDate,true)}</p>
        <p className="money text-sm font-black">{money(Number(active.actualClosingTotal||active.expectedClosingTotal||0))}</p>
      </div>
    </div>
    <div className="overflow-x-auto cash-chart-scroll">
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="cash-chart-svg w-full" role="group" aria-label="Expected versus counted closing cash by day" onMouseLeave={()=>setHovered(null)}>
        {[0,.25,.5,.75,1].map((tick)=>{
          const y=geometry.top+geometry.plotHeight*tick;
          const value=geometry.max-(geometry.max-geometry.min)*tick;
          return <g key={tick}><line x1={geometry.left} x2={geometry.width-geometry.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 6"/><text x={geometry.left-10} y={y+4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{compact(value)}</text></g>;
        })}
        <path d={path(geometry.expected)} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={path(geometry.actual)} fill="none" stroke="var(--money-in)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        {rows.map((row,index)=>{
          const expected=geometry.expected[index],actual=geometry.actual[index],activeDot=index===activeIndex;
          const showLabel=index%labelEvery===0||index===rows.length-1;
          return <g key={row.id} role="button" tabIndex={0} className="cursor-pointer outline-none" onMouseEnter={()=>setHovered(index)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} onClick={()=>onSelect(row)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(row);}}}>
            <rect x={expected.x-Math.max(12,geometry.plotWidth/Math.max(rows.length,1)/2)} y={geometry.top} width={Math.max(24,geometry.plotWidth/Math.max(rows.length,1))} height={geometry.plotHeight} fill="transparent"/>
            {activeDot?<line x1={expected.x} x2={expected.x} y1={geometry.top} y2={geometry.height-geometry.bottom} stroke="var(--text-muted)" strokeDasharray="3 5" opacity=".55"/>:null}
            <circle cx={expected.x} cy={expected.y} r={activeDot?5.5:3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2"/>
            <circle cx={actual.x} cy={actual.y} r={activeDot?5.5:3.5} fill="var(--money-in)" stroke="var(--surface)" strokeWidth="2"/>
            {showLabel?<text x={expected.x} y={geometry.height-15} textAnchor="middle" fill="var(--text-muted)" fontSize="11">{dayLabel(row.businessDate)}</text>:null}
            <title>{`${dayLabel(row.businessDate,true)} · Expected ${money(Number(row.expectedClosingTotal||0))} · Counted ${money(Number(row.actualClosingTotal||0))}`}</title>
          </g>;
        })}
      </svg>
    </div>
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--text-muted)]">
      <span>Opening <strong className="money text-[var(--text)]">{money(Number(active.openingTotal))}</strong></span>
      <span>Expected <strong className="money text-[var(--text)]">{money(Number(active.expectedClosingTotal||0))}</strong></span>
      <span>Counted <strong className="money text-[var(--text)]">{money(Number(active.actualClosingTotal||0))}</strong></span>
      <span>Variance <strong className={"money "+(Math.abs(Number(active.differenceAmount||0))>.005?"text-[var(--money-out)]":"text-[var(--money-in)]")}>{money(Number(active.differenceAmount||0))}</strong></span>
    </div>
  </div>;
}

export function ServiceCashBars({
  rows,
  selectedId,
  onSelect,
}:{
  rows:ServiceCashGroup[];
  selectedId:string|null;
  onSelect:(id:string)=>void;
}){
  if(!rows.length)return <div className="grid min-h-36 place-items-center text-sm text-[var(--text-muted)]">No cash movements yet.</div>;
  return <div className="grid gap-2.5 sm:grid-cols-2">
    {rows.map((row)=>{
      const selected=row.id===selectedId;
      return <button key={row.id} type="button" onClick={()=>onSelect(row.id)} className={"counter-card-tile rounded-2xl border p-3.5 text-left transition "+(selected?"border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] bg-[var(--accent-soft)]":"border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{row.label}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-muted)]">{row.count} txn{row.count===1?"":"s"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-bold uppercase tracking-[.06em] text-[var(--text-muted)]">Total</p>
            <p className="money mt-0.5 text-sm font-black">{money(row.transactionAmount)}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--money-in)_7%,var(--surface-soft))] p-2"><p className="text-[8px] font-extrabold uppercase tracking-[.05em] text-[var(--text-muted)]">In</p><p className="money mt-1 truncate text-[11px] font-black text-[var(--money-in)]">{money(row.cashIn)}</p></div>
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--money-out)_7%,var(--surface-soft))] p-2"><p className="text-[8px] font-extrabold uppercase tracking-[.05em] text-[var(--text-muted)]">Out</p><p className="money mt-1 truncate text-[11px] font-black text-[var(--money-out)]">{money(row.cashOut)}</p></div>
          <div className="rounded-lg bg-[var(--accent-soft)] p-2"><p className="text-[8px] font-extrabold uppercase tracking-[.05em] text-[var(--text-muted)]">Earned</p><p className="money mt-1 truncate text-[11px] font-black text-[var(--accent)]">{money(row.commissionAmount)}</p></div>
        </div>
      </button>;
    })}
    {selectedId?<button type="button" onClick={()=>onSelect("")} className="sm:col-span-2 text-left text-xs font-bold text-[var(--accent)]">Clear service filter</button>:null}
  </div>;
}
