export type AccountLedgerRange = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom" | "all";

const localDay = (date: Date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");

const validDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00");
  return !Number.isNaN(parsed.valueOf()) && localDay(parsed) === value;
};

/** The ledger API filters journal posting dates. Keep date boundaries in the user's local day. */
export function accountLedgerDateQuery(
  range: AccountLedgerRange,
  customFrom: string,
  customTo: string,
  today: Date = new Date(),
): string | null {
  if (range === "all") return "";
  let first: string;
  let last: string | undefined;
  if (range === "custom") {
    if (!validDay(customFrom) || !validDay(customTo) || customFrom > customTo) return null;
    first = customFrom;
    last = customTo;
  } else {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const lookback = range === "yesterday" ? 1 : range === "7d" ? 6 : range === "30d" ? 29 : range === "90d" ? 89 : 0;
    date.setDate(date.getDate() - lookback);
    first = localDay(date);
    if (range === "today" || range === "yesterday") last = first;
  }
  const query = new URLSearchParams({from: new Date(first + "T00:00:00").toISOString()});
  if (last) query.set("to", new Date(last + "T23:59:59.999").toISOString());
  return query.toString();
}

/** Hide cancelled/reversed financial activity initially, without changing posted balances. */
export function isDeletedOrReversedLedgerMovement(tx: {status: string; transactionType: string}): boolean {
  return tx.transactionType === "REVERSAL" || tx.status === "REVERSED" || tx.status === "CANCELLED";
}
