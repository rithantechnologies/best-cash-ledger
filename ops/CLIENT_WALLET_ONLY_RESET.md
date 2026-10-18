# Client provider-wallet-only reset — safety specification

**Target:** only `srv2067503`, database `cashledger_prod`. This request does not apply to the old demo VPS.
**Approved intent:** reset all `PROVIDER_WALLET` balances to zero, with new forward-looking wallet
ledgers and a separate, immutable archive of historical wallet transactions.
Do not change BANK, UPI, CASH, OWNER_CREDIT_CARD, customers, receivables/payables,
other running apps, or existing audit records.

## Do NOT use the previous global financial reset scripts

`ops/client-financial-reset.cjs` truncates shared journal, transaction, and
cash-session tables. Doing so would destroy cross-account financial history.

A wallet transfer's financial journal can include **other accounts**. Never
delete/modify those shared journals or their ledger entries to create a new wallet period.

## Read-only readiness

`ops/client-wallet-reset-readiness.cjs` checks production DB identity, provider-wallet
list, opening balances, posted wallet ledger entries, current derived balances,
open cash sessions, incomplete wallet-sourced quick transfers, global pending
transaction count, journal debit/credit balance, and prior reset markers. It
does **not** modify data. Its readiness result has NOT been executed against
production until a privileged connection grants read-only access to the protected
production DB credentials.

## Mandatory before any apply action

1. Verify exact production DB and site identity, current user and service health.
2. Stop/pause *only* Cash Ledger API writes for a bounded maintenance window;
   leave all other VPS services untouched.
3. Obtain a unique, root-protected `pg_dump -Fc` of the entire client database;
   verify `pg_restore -l`, size and checksum. Do not overwrite an earlier backup.
4. Export immutable **wallet-only** archive: wallets, their current opening figures,
   linked ledger entries and posted journals, source transaction identifiers and
   descriptions, provider charges, money flows and audit provenance. Check SHA256.
   Store outside disposable release paths or pin/protect the containing release.
5. Check no unresolved wallet-related transfers, active cash sessions, or
   unbalanced journals. Capture each non-wallet account's calculated balance
   and verify it again after the reset.
6. Perform zeroing atomically as **new balanced accounting reset journals** against
   a designated non-income EQUITY reset-clearing ledger. Do not rewrite old posted
   journals or use a cash/bank account as the offset. Record an Owner-authorized
   audit record with per-wallet before/after, cutoff and archive checksums.
   Prevent duplicate or concurrent resets. Never mark a negative wallet as positive
   or fabricate funds.
7. Display wallet ledger entries from the new cutoff by default, starting at zero.
   Provide an explicit **Archived history** view for original entries and their
   original balances. Retain all existing links and audit traceability.
8. Verify all wallet balances precisely zero; verify other accounts and unrelated
   financial master data unchanged, posted journals balanced, no broken references,
   and cash/client web health. Record the backup and archive locations securely.

**CURRENT STATUS:** specification + read-only readiness checker only.
No wallet resets or archive exports have run. Do not claim this is completed,
backed up, or deployed until steps above are actually executed and verified.
