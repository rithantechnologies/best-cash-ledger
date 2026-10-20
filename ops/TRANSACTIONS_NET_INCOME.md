# Transactions Net Income — client production

The Transactions page shows **Total income** (commission income plus gross service
revenue) separately from **Net income** (transaction earning after transaction
costs). Click Net income to request an on-demand, read-only category breakdown
using the exact same date, status, type and search filters.

- Commission revenue: customer commission plus provider commission rows.
- Service revenue: entire customer service charge for SERVICE_INCOME transactions.
- Provider/bank and payout costs: persisted TransactionCharge rows except SERVICE_PARTNER_COST.
- Partner cost: each outsourced service's QuickCashTransferDetail.servicePartnerCharge;
  SERVICE_PARTNER_COST charge rows describe that same liability and must NOT be
  deducted a second time.
- Net income: all above income less all above costs. Transfer/withdrawal principal
  and internal cash movements are not income.
- Costs and commission on standalone payout/correction transactions appear when
  those transactions fall in the selected date range, which can differ from the
  source swipe date. Never silently add the costs a second time at the swipe date.
- The value is **transaction net earning**, not overall shop profit after ordinary
  overhead (rent, salaries, etc.). Unrecorded charges cannot be inferred.

The breakdown endpoint is authenticated and cursor-batched, uses the same list
filters, and includes category totals and counts. It shows the latest eight
linked transaction rows as a preview and offers a **View all** action with
25-row paged navigation through all matching income rows. A separate
read-only raw-aggregate reconciliation is computed for the exact date range:
commissions, service revenue, partner cost, direct charges and charges on
linked hidden QCC completion postings are independently summed and compared
with the summary and the complete category totals. Any discrepancy must be
shown to staff; never claim successful reconciliation by default.
A card payout charge can appear under the Card Swipe *category* using its
linked payable source, while the actual expense stays on its original payout
transaction and business date. A multi-payable manual payout apportions
fees by the linked amounts in whole paise. The original transfer's detail
page shows linked completion charges and their audit reference; neither
hidden completion principal nor provider settlement principal is income.
The check is an authenticated read of saved data and may need refreshing if
transactions are edited during its execution. The ordinary Transactions list continues to
paginate separately. No accounting mutation or automatic backfill occurs.

Target: dedicated client VPS at ledger.bestmoney.in, built with
NEXT_PUBLIC_BASE_PATH='', deployed using cashledger-client-deploy.service.
Always commit to main, push, and advance prod only after live checks pass.
