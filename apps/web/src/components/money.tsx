import type { ReactNode } from "react";
import Link from "next/link";
import { formatMoney, toAmount, type MoneyInput } from "@/lib/format";

export type AmountKind =
  | "in"
  | "out"
  | "debit"
  | "credit"
  | "transfer"
  | "receivable"
  | "payable"
  | "outstanding"
  | "available"
  | "pending"
  | "balance"
  | "neutral";

export type AmountTone = "neutral" | "positive" | "negative" | "warning" | "info" | "muted";
export type AmountSize = "sm" | "md" | "lg" | "xl";

const kindMeta: Record<AmountKind, { tone: AmountTone; srLabel: string; label?: string }> = {
  in: { tone: "positive", srLabel: "Money in" },
  out: { tone: "negative", srLabel: "Money out" },
  debit: { tone: "neutral", srLabel: "Debit" },
  credit: { tone: "neutral", srLabel: "Credit" },
  transfer: { tone: "info", srLabel: "Transfer" },
  receivable: { tone: "neutral", srLabel: "Receivable", label: "to receive" },
  payable: { tone: "neutral", srLabel: "Payable", label: "to pay" },
  outstanding: { tone: "negative", srLabel: "Outstanding", label: "outstanding" },
  available: { tone: "neutral", srLabel: "Available", label: "available" },
  pending: { tone: "warning", srLabel: "Pending", label: "pending" },
  balance: { tone: "neutral", srLabel: "Balance" },
  neutral: { tone: "neutral", srLabel: "" },
};

function Glyph({ kind }: { kind: "transfer" | "pending" }) {
  return (
    <svg viewBox="0 0 16 16" className="amount-glyph" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {kind === "transfer" ? (
        <><path d="M2.5 5.5h10" /><path d="m10 3 2.5 2.5L10 8" /><path d="M13.5 10.5h-10" /><path d="M6 8l-2.5 2.5L6 13" /></>
      ) : (
        <><circle cx="8" cy="8" r="5.75" /><path d="M8 5v3.2l2 1.3" /></>
      )}
    </svg>
  );
}

export function Amount({
  value,
  kind = "neutral",
  tone,
  size = "md",
  decimals = 2,
  label,
  compact = false,
  className = "",
}: {
  value: MoneyInput;
  kind?: AmountKind;
  tone?: AmountTone;
  size?: AmountSize;
  decimals?: 0 | 2;
  label?: boolean | string;
  compact?: boolean;
  className?: string;
}) {
  const amount = toAmount(value);
  const meta = kindMeta[kind];
  const isZero = Math.abs(amount) < 0.005;
  const negative = amount < 0 && !isZero;

  let marker: ReactNode = null;
  let resolvedTone: AmountTone = tone ?? meta.tone;
  let srLabel = meta.srLabel;

  switch (kind) {
    case "in":
      marker = isZero ? null : "+";
      break;
    case "out":
      marker = isZero ? null : "\u2212";
      break;
    case "debit":
      marker = <span className="amount-dc">Dr</span>;
      break;
    case "credit":
      marker = <span className="amount-dc">Cr</span>;
      break;
    case "transfer":
    case "pending":
      marker = <Glyph kind={kind} />;
      break;
    case "balance":
    case "neutral":
    case "available":
      if (negative) {
        marker = "\u2212";
        if (!tone) resolvedTone = "negative";
        srLabel = kind === "balance" ? "Overdrawn balance" : "Negative";
      }
      break;
    default:
      if (negative) marker = "\u2212";
  }

  if (isZero && !tone) resolvedTone = "muted";

  const exact = formatMoney(amount, { decimals: 2 });
  const shown = formatMoney(amount, { decimals, compact });
  const visibleLabel = label === true ? meta.label : typeof label === "string" ? label : undefined;
  const rounded = compact || decimals === 0;

  return (
    <span
      className={`amount ${className}`.trim()}
      data-tone={resolvedTone}
      data-size={size}
      title={rounded && shown !== exact ? `${srLabel ? srLabel + ": " : ""}${exact}` : undefined}
    >
      {srLabel ? <span className="sr-only">{srLabel}: </span> : null}
      {marker !== null ? <span className="amount-marker" aria-hidden="true">{marker}</span> : null}
      <span className="amount-value">{shown}</span>
      {visibleLabel ? <span className="amount-label">{visibleLabel}</span> : null}
    </span>
  );
}

export function AmountRow({
  label,
  detail,
  children,
  href,
  emphasis = false,
}: {
  label: ReactNode;
  detail?: ReactNode;
  children: ReactNode;
  href?: string;
  emphasis?: boolean;
}) {
  const content = (
    <>
      <span className="amount-row-label">
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className="amount-row-value">{children}</span>
    </>
  );
  return href ? (
    <Link href={href} className="amount-row" data-emphasis={emphasis || undefined}>{content}</Link>
  ) : (
    <div className="amount-row" data-emphasis={emphasis || undefined}>{content}</div>
  );
}
