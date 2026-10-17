# Owner-controlled provider-wallet reconciliation

## Problem and scope

External provider (e.g. PaySwitch) balances can differ from Cash Ledger when a provider payout,
fee, refund or funding movement was not recorded in the internal transaction ledger.
The provider screenshot dated 2026-10-17 shows ₹163,906.60, while the app screenshot shows
₹166,429.00. This is an unexplained ₹2,522.40 shortfall **until matching provider transactions**.

**Never auto-replace opening balance or automatically write off that difference.**

## Preferred workflow

1. Compare matching **all-time** account balances at the same as-of instant.
2. Review wallet ledger and complete missing cash-in beneficiary payouts, split source rows,
   charges, provider deposits, reversals, and manual transfers as their original transactions.
   A "30 days" selection is a journal reporting period, not the same as an external lifetime payout count.
3. Configure accurate effective-dated payout charge slabs in Settings > Payment gateways.
   No charge is assumed when a provider has no matching charge rule.
4. If a residual difference **remains after source matching**, Owner opens
   Accounts > provider wallet > Reconcile wallet, enters verified provider balance,
   confirmed *unrecorded* fees, source statement reference/date and explanation.
5. Explicit confirmation posts one new ACCOUNT_ENTRY with a balanced journal and immutable
   FINANCIAL_ACCOUNT audit. Wallet outflow is the **total** shortfall. Fee portion
   debits SYS-PROVIDER-CHARGE, remaining shortfall debits SYS-ACCOUNT-ADJUSTMENT.
   No component of the fee is subtracted twice.
   If the external balance is higher, it debits wallet and credits SYS-ACCOUNT-ADJUSTMENT.
6. Reconciliation is posted **at the current time**. It never rewrites historical payout,
   journal, or opening balance records, and rejects stale preview/current balances.

**Evidence:** The current integration does not import PaySwitch transaction statements automatically.
Without matching provider payout/UTR and fee records, classification of any difference as
"confirmed charges" would be speculative. Owner must verify before posting. The client
database is not automatically modified during the code deployment.

## Technical controls

- GET and POST `/api/accounts/:id/wallet-reconciliation` require authenticated OWNER.
- POST rejects non-wallet accounts, unconfirmed submissions, negative/overlarge amounts,
  non-cent precision, blank source/reason, impossible fees and zero change.
- Serializable transaction locks the wallet row and checks expected current posted balance.
- POST creates transaction, wallet detail, distinct fee transaction charge when entered,
  balanced journal, and full old/new audit in **one database transaction**.
- A per-submission Idempotency-Key prevents duplicate posting, plus expectedBalance protects
  retry after lost responses.
- Changes are visible in the account ledger and provider charge report; never edit
  already-posted ledger entries.
- Future VPS installs: migration-free (uses existing financial tables and system ledgers).
  Require existing SYS-ACCOUNT-ADJUSTMENT and SYS-PROVIDER-CHARGE ledgers.
