// Read a shorthand amount from a note only as a *suggestion* requiring staff confirmation.
// Do not post it to finance or silently include it in planned totals.
export function amountSuggestion(note = "") {
  const match = String(note).trim().match(/(?:^|[\s,;:])(?:₹\s*)?(\d+(?:\.\d{1,2})?)\s*(K|L)(?:\s*)$/i);
  if (!match) return null;
  const amount = Number(match[1]) * (match[2].toUpperCase() === "K" ? 1_000 : 100_000);
  return Number.isFinite(amount) && amount > 0 && amount <= 999_999_999 ? Math.round(amount * 100) / 100 : null;
}
