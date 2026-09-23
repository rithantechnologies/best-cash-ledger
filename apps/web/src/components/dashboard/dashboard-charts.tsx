"use client";

import { useMemo, useState } from "react";
import type {
  CashFlowPoint,
  ExpenseCategoryGroup,
  PositionTrendPoint,
} from "./dashboard-types";
import styles from "./finance-dashboard.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const compact = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);

const dateLabel = (date: string, long = false) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN",
    long
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short" },
  );

function linePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) =>
      `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
}

export function PositionSparkline({ rows }: { rows: PositionTrendPoint[] }) {
  const [hovered,setHovered]=useState<number|null>(null);
  if (rows.length < 2) return null;
  const width = 340;
  const height = 92;
  const pad = 7;
  const values = rows.map((row) => row.netPosition);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const range = rawMax - rawMin || 1;
  const points = values.map((value, index) => ({
    x: pad + (index * (width - pad * 2)) / (values.length - 1),
    y: height - pad - ((value - rawMin) / range) * (height - pad * 2),
  }));
  const zeroY = height - pad - ((0 - rawMin) / range) * (height - pad * 2);
  const zeroPct = Math.max(0, Math.min(100, (zeroY / height) * 100));
  const path = linePath(points);
  const area = path + " L" + (points.at(-1)?.x ?? 0) + " " + zeroY + " L" + points[0].x + " " + zeroY + " Z";
  const active=hovered===null?null:{row:rows[hovered],point:points[hovered],index:hovered};
  const compactChange=(value:number)=>{
    const sign=value>0?"+":value<0?"−":"";
    return sign+compact(Math.abs(value));
  };
  return (
    <div className={styles.positionChartWrap}>
      <svg
        viewBox={"0 0 " + width + " " + height}
        className={styles.positionSparkline}
        role="img"
        aria-label="Overall financial position over the last 10 days"
        onMouseLeave={()=>setHovered(null)}
      >
        <defs>
          <linearGradient id="position-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset={zeroPct + "%"} stopColor="#34d399" />
            <stop offset={zeroPct + "%"} stopColor="#fb7185" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
          <linearGradient id="position-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity=".20" />
            <stop offset={zeroPct + "%"} stopColor="#34d399" stopOpacity=".05" />
            <stop offset={zeroPct + "%"} stopColor="#fb7185" stopOpacity=".05" />
            <stop offset="100%" stopColor="#fb7185" stopOpacity=".20" />
          </linearGradient>
        </defs>
        {rawMin < 0 && rawMax > 0 ? <line x1={pad} y1={zeroY} x2={width-pad} y2={zeroY} stroke="currentColor" strokeOpacity=".22" strokeDasharray="4 5" /> : null}
        <path d={area} fill="url(#position-area)" />
        <path d={path} fill="none" stroke="url(#position-stroke)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => {
          const positive=rows[index].netPosition>=0;
          const delta=index?rows[index].netPosition-rows[index-1].netPosition:0;
          return <g key={rows[index].date}>
            <circle cx={point.x} cy={point.y} r="10" fill="transparent" tabIndex={0}
              onMouseEnter={()=>setHovered(index)} onFocus={()=>setHovered(index)}
              onBlur={()=>setHovered(null)} aria-label={dateLabel(rows[index].date,true)+" position "+money(rows[index].netPosition)+(index?" change "+compactChange(delta):"")} />
            <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 4.5 : 2.6}
              fill={positive?"#6ee7b7":"#fda4af"} stroke="var(--surface)" strokeWidth={index===points.length-1?2:1} pointerEvents="none" />
          </g>;
        })}
      </svg>
      {active?<div className={styles.positionPointTooltip} style={{left:(active.point.x/width*100)+"%",top:(active.point.y/height*100)+"%"}}>
        <strong>{dateLabel(active.row.date,true)}</strong>
        <span>Position <b className={active.row.netPosition>=0?styles.positiveText:styles.negativeText}>{money(active.row.netPosition)}</b></span>
        {active.index>0?<span>Change <b className={active.row.netPosition-rows[active.index-1].netPosition>=0?styles.positiveText:styles.negativeText}>{compactChange(active.row.netPosition-rows[active.index-1].netPosition)}</b></span>:<span>First day</span>}
      </div>:null}
      <div className={styles.positionDeltaStrip} aria-label="Daily position changes">
        {rows.map((row,index)=>{
          const delta=index?row.netPosition-rows[index-1].netPosition:0;
          return <button type="button" key={row.date} onMouseEnter={()=>setHovered(index)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} className={index===0?styles.positionDeltaNeutral:delta>=0?styles.positionDeltaPositive:styles.positionDeltaNegative}>
            <small>{dateLabel(row.date)}</small><strong>{index===0?"—":compactChange(delta)}</strong>
          </button>;
        })}
      </div>
    </div>
  );
}

export function ExpenseDonut({
  categories,
  total,
  selectedId,
  onSelect,
}: {
  categories: ExpenseCategoryGroup[];
  total: number;
  selectedId: string | null;
  onSelect: (category: ExpenseCategoryGroup) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const active =
    categories.find((item) => item.id === hoveredId) ??
    categories.find((item) => item.id === selectedId) ??
    null;
  const segments = categories.map((category, index) => ({
    category,
    start: total
      ? categories
          .slice(0, index)
          .reduce((sum, item) => sum + item.amount / total, 0)
      : 0,
    size: total ? category.amount / total : 0,
  }));

  return (
    <div className={styles.donutFrame}>
      <svg
        viewBox="0 0 180 180"
        className={styles.donutSvg}
        role="group"
        aria-label="Expense distribution by category"
      >
        <circle
          cx="90"
          cy="90"
          r="61"
          fill="none"
          stroke="var(--surface-soft)"
          strokeWidth="22"
        />
        <g className={styles.donutDepthLayer} aria-hidden="true" transform="translate(0 4)">
          {segments.map(({ category, start, size }) => (
            <circle
              key={`depth-${category.id}`}
              cx="90"
              cy="90"
              r="61"
              pathLength="100"
              fill="none"
              stroke={category.color}
              strokeWidth="21"
              strokeDasharray={`${Math.max(0, size * 100 - 0.7)} ${100 - Math.max(0, size * 100 - 0.7)}`}
              strokeDashoffset={-start * 100}
              strokeLinecap="butt"
              transform="rotate(-90 90 90)"
            />
          ))}
        </g>
        {segments.map(({ category, start, size }) => {
          const selected = category.id === selectedId || category.id === hoveredId;
          return (
            <circle
              key={category.id}
              cx="90"
              cy="90"
              r="61"
              pathLength="100"
              fill="none"
              stroke={category.color}
              strokeWidth={selected ? 27 : 21}
              strokeDasharray={`${Math.max(0, size * 100 - 0.7)} ${100 - Math.max(0, size * 100 - 0.7)}`}
              strokeDashoffset={-start * 100}
              strokeLinecap="butt"
              transform="rotate(-90 90 90)"
              className={styles.donutSegment}
              role="button"
              tabIndex={0}
              aria-label={`${category.name}, ${money(category.amount)}, ${category.percentage.toFixed(1)} percent. Open transactions.`}
              onMouseEnter={() => setHoveredId(category.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(category.id)}
              onBlur={() => setHoveredId(null)}
              onClick={() => onSelect(category)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(category);
                }
              }}
            >
              <title>{`${category.name}: ${money(category.amount)} (${category.percentage.toFixed(1)}%)`}</title>
            </circle>
          );
        })}
      </svg>
      <div className={styles.donutCenter} aria-hidden="true">
        <span>{active ? active.name : "Total spend"}</span>
        <strong>{money(active ? active.amount : total)}</strong>
        <small>{active ? `${active.percentage.toFixed(1)}% of spend` : `${categories.length} categories`}</small>
      </div>
    </div>
  );
}

export function FundsAllocationDonut({
  items,
  total,
  selectedId,
  onSelect,
  centerLabel = "Current availability",
  centerHint = "Tap a slice to inspect",
  ariaLabel = "Current availability allocation",
  className = "",
}: {
  items: Array<{ id: string; label: string; value: number; percentage: number; color: string }>;
  total: number;
  selectedId: string | null;
  onSelect: (item: { id: string; label: string; value: number; percentage: number; color: string }) => void;
  centerLabel?: string;
  centerHint?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const active =
    items.find((item) => item.id === hoveredId) ??
    items.find((item) => item.id === selectedId) ??
    null;
  const positiveTotal = Math.max(1, items.reduce((sum, item) => sum + Math.max(0, item.value), 0));
  const segments = items.map((item, index) => ({
    item,
    start: items
      .slice(0, index)
      .reduce((sum, previous) => sum + Math.max(0, previous.value) / positiveTotal, 0),
    size: Math.max(0, item.value) / positiveTotal,
  }));

  return (
    <div className={styles.donutFrame+" "+className}>
      <svg
        viewBox="0 0 180 180"
        className={styles.donutSvg}
        role="group"
        aria-label={ariaLabel}
        onMouseLeave={() => setHoveredId(null)}
      >
        <circle
          cx="90"
          cy="90"
          r="61"
          fill="none"
          stroke="var(--surface-soft)"
          strokeWidth="22"
        />
        {segments.map(({ item, start, size }) => {
          if (size <= 0) return null;
          const selected = item.id === selectedId || item.id === hoveredId;
          const dash = Math.max(0, size * 100 - 0.8);
          return (
            <circle
              key={item.id}
              cx="90"
              cy="90"
              r="61"
              pathLength="100"
              fill="none"
              stroke={item.color}
              strokeWidth={selected ? 27 : 21}
              strokeDasharray={String(dash) + " " + String(100 - dash)}
              strokeDashoffset={-start * 100}
              strokeLinecap="butt"
              transform="rotate(-90 90 90)"
              className={styles.donutSegment}
              role="button"
              tabIndex={0}
              aria-label={item.label + ", " + money(item.value) + ", " + item.percentage.toFixed(1) + " percent"}
              onMouseEnter={() => setHoveredId(item.id)}
              onFocus={() => setHoveredId(item.id)}
              onBlur={() => setHoveredId(null)}
              onPointerDown={(event) => {
                if (event.pointerType === "touch" || event.pointerType === "pen") onSelect(item);
              }}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
            >
              <title>{item.label + ": " + money(item.value) + " (" + item.percentage.toFixed(1) + "%)"}</title>
            </circle>
          );
        })}
      </svg>
      <div className={styles.donutCenter} aria-hidden="true">
        <span>{active ? active.label : centerLabel}</span>
        <strong>{money(active ? active.value : total)}</strong>
        <small>{active ? active.percentage.toFixed(1) + "% of total" : centerHint}</small>
      </div>
    </div>
  );
}

export function CashFlowChart({
  rows,
  onSelect,
}: {
  rows: CashFlowPoint[];
  onSelect: (point: CashFlowPoint) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const geometry = useMemo(() => {
    const width = 860;
    const height = 286;
    const left = 58;
    const right = 22;
    const top = 24;
    const bottom = 42;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const max = Math.max(1, ...rows.flatMap((row) => [row.moneyIn, row.moneyOut]));
    const points = (key: "moneyIn" | "moneyOut") =>
      rows.map((row, index) => ({
        x:
          rows.length <= 1
            ? left + plotWidth / 2
            : left + (index * plotWidth) / (rows.length - 1),
        y: top + plotHeight - (row[key] / max) * plotHeight,
      }));
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotWidth,
      plotHeight,
      max,
      inPoints: points("moneyIn"),
      outPoints: points("moneyOut"),
    };
  }, [rows]);

  if (!rows.length) return null;
  const activeIndex = hoveredIndex ?? rows.length - 1;
  const active = rows[activeIndex];
  const activePoint = geometry.inPoints[activeIndex];
  const labelEvery = rows.length > 20 ? 5 : rows.length > 10 ? 2 : 1;
  const hitWidth = Math.max(18, geometry.plotWidth / Math.max(rows.length, 1));
  const inPath = linePath(geometry.inPoints);
  const outPath = linePath(geometry.outPoints);
  const area = `${inPath} L${geometry.inPoints.at(-1)?.x ?? 0} ${geometry.height - geometry.bottom} L${geometry.inPoints[0].x} ${geometry.height - geometry.bottom} Z`;

  return (
    <div className={styles.flowChartFrame}>
      <div className={styles.chartLegend} aria-hidden="true">
        <span><i className={styles.legendIn} />Money in</span>
        <span><i className={styles.legendOut} />Money out</span>
        <span className={active.net >= 0 ? styles.positiveText : styles.negativeText}>
          {active.net >= 0 ? "+" : ""}{money(active.net)} net
        </span>
      </div>
      <div className={styles.chartViewport}>
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className={styles.flowChart}
          role="img"
          aria-label="Money in and money out over the selected period"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="cashflow-in-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#16a880" stopOpacity=".18" />
              <stop offset="1" stopColor="#16a880" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = geometry.top + geometry.plotHeight * tick;
            const value = geometry.max * (1 - tick);
            return (
              <g key={tick}>
                <line
                  x1={geometry.left}
                  x2={geometry.width - geometry.right}
                  y1={y}
                  y2={y}
                  className={styles.chartGridLine}
                />
                <text
                  x={geometry.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className={styles.chartAxisLabel}
                >
                  {compact(value)}
                </text>
              </g>
            );
          })}
          <path d={area} fill="url(#cashflow-in-fill)" />
          <path d={inPath} className={styles.flowInLine} />
          <path d={outPath} className={styles.flowOutLine} />
          {rows.map((row, index) => {
            const point = geometry.inPoints[index];
            const outPoint = geometry.outPoints[index];
            const showLabel = index % labelEvery === 0 || index === rows.length - 1;
            return (
              <g
                key={row.date}
                role="button"
                tabIndex={0}
                aria-label={`${dateLabel(row.date, true)}. Money in ${money(row.moneyIn)}. Money out ${money(row.moneyOut)}. Net ${money(row.net)}. Open movements.`}
                onMouseEnter={() => setHoveredIndex(index)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                className={styles.chartHitArea}
              >
                <rect
                  x={point.x - hitWidth / 2}
                  y={geometry.top}
                  width={hitWidth}
                  height={geometry.plotHeight}
                  fill="transparent"
                />
                {hoveredIndex === index ? (
                  <>
                    <line
                      x1={point.x}
                      x2={point.x}
                      y1={geometry.top}
                      y2={geometry.height - geometry.bottom}
                      className={styles.chartCursor}
                    />
                    <circle cx={point.x} cy={point.y} r="5" className={styles.flowInDot} />
                    <circle cx={outPoint.x} cy={outPoint.y} r="5" className={styles.flowOutDot} />
                  </>
                ) : null}
                {showLabel ? (
                  <text
                    x={point.x}
                    y={geometry.height - 14}
                    textAnchor="middle"
                    className={styles.chartDateLabel}
                  >
                    {dateLabel(row.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div
          className={`${styles.chartTooltip} ${activeIndex < 2 ? styles.tooltipStart : activeIndex > rows.length - 3 ? styles.tooltipEnd : ""}`}
          style={{
            left: `${(activePoint.x / geometry.width) * 100}%`,
            top: `${Math.max(10, (Math.min(activePoint.y, geometry.outPoints[activeIndex].y) / geometry.height) * 100 - 8)}%`,
          }}
          aria-hidden="true"
        >
          <strong>{dateLabel(active.date, true)}</strong>
          <span><i className={styles.legendIn} />In {money(active.moneyIn)}</span>
          <span><i className={styles.legendOut} />Out {money(active.moneyOut)}</span>
          <b className={active.net >= 0 ? styles.positiveText : styles.negativeText}>
            Net {active.net >= 0 ? "+" : ""}{money(active.net)}
          </b>
        </div>
      </div>
      <p className={styles.chartHint}>Select any day to reconcile the account movements behind it.</p>
    </div>
  );
}
