# Reports: Today by default, debit left, credit right

Requested via Tamil client voice note and a South Indian Bank account screenshot showing
'30 days' selected by default.

- **Accounts > account detail** initially selects `Today`, not `30 days`.
  Yesterday, 7/30/90 days, Custom and All time are still selectable.
- **Reports** initializes the transaction and account-ledger date filters to
  the user's local Today. Clear filters still permits historical/all-time views.
- **Bank, UPI and provider wallet account activity** has two visible panels:
  **Debit · Money Out** on the left, **Credit · Money In** on the right.
  Existing account-specific charges stay included in the posted outflow and
  shown separately for audit, never subtracted a second time.
- **Cash drawers/reserves** show paired Debit · Out and Credit · In columns
  on desktop, with the same labels in their mobile activity cards.
- **Owner credit card accounts** use liability semantics: Debit means paid/reduced
  outstanding; Credit means added/charged outstanding.
- Top-of-page account summary uses the same debit-left / credit-right order.
- **Reports > Account ledger** table and Current View CSV use separate Debit
  (Out) and Credit (In) fields rather than Dr/Cr plus a single Amount.
  Display columns use *statement money-flow convention*, not the underlying
  general-ledger entryType. Financial data and posted journal classifications
  remain unchanged.
- The date query uses the browser's local day boundary, including through
  23:59:59.999, to prevent transactions from being misattributed to other
  days due to UTC date boundaries.

No database migration, new transaction, balance reset, or retrospective
journal mutation is needed. Only presentation defaults and report columns change.
