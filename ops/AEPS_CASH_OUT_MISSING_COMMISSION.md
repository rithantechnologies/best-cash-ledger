# AePS Cash Out — add omitted customer commission after the transaction

## Customer request (20 October 2026)
A successful Cash Out > AePS quick entry was saved with ₹0 customer commission.
Staff later completed/closed the transaction. The Owner needs a safe way to
record genuinely received commission afterward without deleting or rebuilding
the original cash payout. Original customer principal, withdrawal date, and
cash drawer session must remain intact.

## Implemented workflow
1. Open Transactions > the **original Cash Out / AePS** entry.
2. Owner chooses **+ Add missing AEPS commission** (shown only for a
   successful AePS quick CASH_TRANSFER that originally recorded zero commission,
   is PENDING or COMPLETED, and has no active previous supplement).
3. Enter the actual commission amount, receipt method **Cash** or **Bank/UPI**,
   the actual receiving account when digital, and a meaningful reason.
4. POST `/api/transactions/quick-cash/:id/missing-aeps-commission`
   Owner-only. It validates that money was really received and not already
   recorded. Cash receipts require an **open cash session** for the original
   drawer; no posting may change a previously closed cash session.
5. The API uses a serializable database transaction plus an exclusive original
   transaction-row lock. It refuses duplicate supplements and non-AePS,
   failed, reversed, and already commissioned transactions.
6. A separately dated new ACCOUNT_ENTRY transaction prefixed **QCM-** records
   the received commission now. It creates TransactionCommission
   (AEPS_CUSTOMER_LATE), an account entry detail and a balanced journal:
   DEBIT actual cash/bank/UPI account, CREDIT SYS-COMMISSION income ledger.
   It links `correctionSourceTransactionId` back to the original Cash Out
   and writes a detailed audit event on the original.
7. Original Cash Out retains its original payout amount, cash journal, timestamp,
   zero-as-entered commission and completed settlement. The original transaction
   detail separately displays the linked *late* commission and reference,
   and the new transaction includes the original transaction link.
   The original business date is **not** silently overwritten.
8. Before reversing the original AePS Cash Out, any linked active commission
   adjustment must be reversed first.

## Non-goals / safeguards
- This is NOT provider-side commission/charge configuration.
- This first correction mode is **cash/bank commission actually received**.
  Do not record an uncollected or estimated fee as received income.
- Do not manufacture a cash receipt if the amount was already included in a
  recorded cash balance. A closed/reconciled historical cash session must
  not be edited retroactively.
- No automatic correction of live customer accounts was made by deployment.
- If a different originally nonzero commission is wrong, use a separate
  audited amendment workflow; this one blocks adding a second fee.

No schema migrations required. No unrelated services or VPS content touched.
