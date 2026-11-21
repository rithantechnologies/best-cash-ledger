// Match the API guard. Payout principal is never a provider business expense.
export function payoutChargeProblem(payout, charge, configured = false) {
  if (!Number.isFinite(payout) || !Number.isFinite(charge) || charge < 0)
    return 'Enter a valid payout and a non-negative provider fee.';
  if (payout <= 0 || charge === 0) return '';
  const principal = Math.round(payout * 100);
  const fee = Math.round(charge * 100);
  if (fee >= principal)
    return 'Provider fee cannot equal or exceed the customer payout. Check that you have not copied the payout into the fee field.';
  if (!configured && fee > Math.round(principal * 0.10))
    return 'Manual provider fee exceeds 10% of the payout. Check the amount or configure an approved provider payout slab.';
  return '';
}
export function highPayoutChargeWarning(payout, charge) {
  if (payout > 0 && charge > 0 && Math.round(charge * 100) > Math.round(payout * 100 * 0.05))
    return 'Unusually high provider fee: verify it before recording. This fee reduces business profit.';
  return '';
}
