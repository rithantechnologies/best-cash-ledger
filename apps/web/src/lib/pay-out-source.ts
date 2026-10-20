export type PayInSource = {
  financialAccountId: string;
  accountName: string;
  accountType: string;
  customerCardId: string | null;
  transactionId: string;
  transactionNumber: string;
  transactionAt: string;
};

/** Choose the most recent Pay In in this card/customer scope, not an unrelated card.
 * Backdated Pay Outs may not use a later Pay In as their suggested source.
 * Eligibility (active account and access) is checked separately: an inactive
 * newest Pay In must not silently fall back to an older unrelated account.
 */
export function suggestedPayOutSource(
  payIns: readonly PayInSource[],
  cardId: string,
  entryDate: string,
): PayInSource | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return null;
  // Cash Ledger business dates are IST: 23:59:59.999 IST = 18:29:59.999 UTC.
  const cutoff = Date.parse(entryDate + "T18:29:59.999Z");
  if (!Number.isFinite(cutoff)) return null;
  const candidates = payIns.filter(item =>
    Number.isFinite(new Date(item.transactionAt).getTime()) &&
    new Date(item.transactionAt).getTime() <= cutoff &&
    (!cardId || item.customerCardId === cardId || item.customerCardId === null),
  );
  // A card-specific Pay In has priority over a customer-wide Pay In.
  const specific = cardId ? candidates.filter(item => item.customerCardId === cardId) : candidates;
  const pool = specific.length ? specific : candidates;
  return [...pool].sort((a, b) =>
    new Date(b.transactionAt).getTime() - new Date(a.transactionAt).getTime() ||
    b.transactionId.localeCompare(a.transactionId),
  )[0] ?? null;
}

/** The last account actually debited to pay the customer is preferred to Pay In.
 * A card-swipe settlement/provider account is never treated as payout evidence.
 */
export function suggestedPayOutFundingSource(
  payIns: readonly PayInSource[],
  previousPayouts: readonly PayInSource[],
  cardId: string,
  entryDate: string,
): { source: PayInSource; kind: 'PREVIOUS_PAYOUT' | 'PAY_IN' } | null {
  const payout = suggestedPayOutSource(previousPayouts, cardId, entryDate);
  if (payout) return { source: payout, kind: 'PREVIOUS_PAYOUT' };
  const payIn = suggestedPayOutSource(payIns, cardId, entryDate);
  return payIn ? { source: payIn, kind: 'PAY_IN' } : null;
}
