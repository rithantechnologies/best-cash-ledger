# Micro ATM provider commission — Cash Ledger

## Daily Cash completion
For Cash Out → Micro ATM, select the settlement account (ROINET wallet is preselected when available). Provider commission is separate from cash withdrawal principal and any fee charged to the customer.

- A provider-linked settlement account uses its Micro ATM provider commission slabs from Settings → Providers. Rules support fixed rupees or percentages.
- Blank override applies the currently active provider rule; entering 0 is an explicit zero override. Staff can enter any verified nonnegative amount.
- No provider rates are hard-coded. Published older ROINET CSP commission letters are not necessarily applicable to this particular merchant account.
- Example: for ₹2,900 principal and a verified ₹4 provider commission, cash paid out remains ₹2,900. Completion debits the provider wallet ₹2,904, credits pending customer/provider receivable ₹2,900 and credits commission income ₹4.
- MICRO_ATM_PROVIDER commission is attached to the original quick cash record, because QCC completion transactions are excluded from income summaries. The completed wallet journal references the QCC transaction. All rules and overrides are audited.
- Reversal of the QCC settlement posts a balancing negative provider commission on the original transaction. Original entries cannot be reversed while their completion is active; amount correction reverses completion before original and recreates original provider earning.
- Financial posting uses the original transaction date, while completion timestamp and actor remain audit metadata.

## Configure
Open Settings → Providers → Edit provider → Micro ATM provider commission slabs. Illustrative syntax:
    2000-2999 = 4
    3000-3999 = 9
    4000+ = 0.5%
Only use provider-confirmed values. Updating provider slabs closes the prior effective period and inserts new rule rows, without changing any saved transactions.

## Migration and deployment
The additive Prisma migration 20261025093000_micro_atm_provider_commission_rules must be applied only to the Cash Ledger client database after a verified protected backup and before switching to the compiled release. Keep unrelated VPS processes and all previous Cash Ledger releases intact.
