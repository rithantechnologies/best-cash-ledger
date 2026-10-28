/** Link to the existing audited Quick Cash completion form.
 * Never post/mark a transaction complete from the Transactions list itself.
 */
type PendingRow = {
  transactionType: string;
  status: string;
  quickCashTransfer?: {
    id: string;
    purpose: string;
    cashAccount: { id: string } | null;
  } | null;
};
export function pendingClearingHref(row: PendingRow): string | null {
  if (row.transactionType !== "CASH_TRANSFER" || row.status !== "PENDING") return null;
  const detail = row.quickCashTransfer;
  if (!detail || detail.purpose !== "TRANSFER" || !detail.id || !detail.cashAccount?.id) return null;
  const params = new URLSearchParams({
    completePending: detail.id,
    cashAccountId: detail.cashAccount.id,
  });
  return "/cash-counter?" + params.toString();
}


/** Pending expenses use the existing audited expense completion form.
 * Selecting the payment account is required before any money is posted.
 */
export function pendingExpenseHref(row: {id: string; transactionType: string; status: string}): string | null {
  if (row.status !== "PENDING" || !["BUSINESS_EXPENSE", "PERSONAL_EXPENSE"].includes(row.transactionType) || !row.id) return null;
  return "/transactions/" + encodeURIComponent(row.id) + "?completeExpense=1";
}
