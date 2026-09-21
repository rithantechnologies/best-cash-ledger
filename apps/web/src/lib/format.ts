/**
 * Shared number/currency formatting for Cash Ledger.
 *
 * Amounts are stored as Decimal(18,2) (rupees + paise). The API serialises them
 * either as numbers or as decimal strings, so every helper accepts both.
 *
 * Precision policy:
 * - decimals: 2 (default) shows paise exactly for ledger/reconciliation use.
 * - decimals: 0 rounds to whole rupees for overview figures.
 */
export type MoneyInput = number | string | null | undefined;

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions) {
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat("en-IN", options);
    formatters.set(key, cached);
  }
  return cached;
}

export function toAmount(value: MoneyInput): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type FormatMoneyOptions = {
  decimals?: 0 | 2;
  compact?: boolean;
  symbol?: boolean;
};

export function formatMoney(value: MoneyInput, options: FormatMoneyOptions = {}): string {
  const { decimals = 2, compact = false, symbol = true } = options;
  const amount = Math.abs(toAmount(value));
  const key = `${decimals}|${compact}|${symbol}`;
  return formatter(key, {
    style: symbol ? "currency" : "decimal",
    currency: "INR",
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : decimals,
    maximumFractionDigits: compact ? 1 : decimals,
  }).format(amount);
}

export function formatSignedMoney(
  value: MoneyInput,
  options: FormatMoneyOptions & { plus?: boolean } = {},
): string {
  const amount = toAmount(value);
  const sign = amount < 0 ? "\u2212" : amount > 0 && options.plus ? "+" : "";
  return sign + formatMoney(amount, options);
}

export function formatCompactNumber(value: MoneyInput): string {
  return formatter("compact-number", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toAmount(value));
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
