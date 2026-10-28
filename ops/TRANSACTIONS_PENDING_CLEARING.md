# Pending clearing from Transactions

For a pending Quick Cash transaction shown in /transactions, the Status column
includes "Complete pending →" on desktop and mobile. Eligible rows are only
CASH_TRANSFER entries with an actual QuickCashTransferDetail, purpose TRANSFER,
status PENDING and a recorded cash drawer.

The action does not post money or change status. It links to the existing Daily
Cash completion modal using the saved QuickCashTransferDetail ID and drawer ID.
Daily Cash selects the matching drawer, loads pending entries under the signed-in
user's existing permissions and prepopulates the completion form. Saving calls
the existing atomic /transactions/quick-cash/:id/complete API, with the same
source/wallet/account/reference validation and audit history as before. The
original business transaction timestamp remains unchanged. A completed,
unavailable or unauthorized entry does not open an editable completion form.

No new database fields or API permissions are required. Do not turn the Pending
badge itself into a direct state-changing control. Other kinds of pending
transactions retain their specialized workflows.

Client VPS: build with NEXT_PUBLIC_BASE_PATH='', commit and push main,
deploy through the authorized managed client worker with backup and health checks,
then advance prod to the deployed commit. Never modify unrelated running workloads.

## Pending expense completion

Pending BUSINESS_EXPENSE and PERSONAL_EXPENSE rows now display
"Complete expense" in the Transactions Status column (desktop and mobile).
This is a navigation action, never an automatic status change. It opens the
existing audited expense completion form and requires a payment account before
posting. Closed cash sessions, insufficient funds, and access checks remain
enforced by the API. The expense's original transaction date is preserved;
completion and ledger posting are recorded against the existing transaction,
not by creating a duplicate. If an older pending expense has an existing
journal, its full expense correction form is used instead.
