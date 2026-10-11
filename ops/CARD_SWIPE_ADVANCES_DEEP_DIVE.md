# Card Swipe ↔ Customer Pay In / Pay Out: advance and deferred settlement deep dive

Status: REQUIREMENT + CODE AUDIT (2026-10-11). **Not implemented / not deployed by this document.**

## Goal
Keep the present compact Card Swipe and customer Card Ledger interface, but make money paid to or received from the customer before, at, or after a swipe reconcile at both customer-ledger and financial-ledger level. Customer identity is normally selected by name/mobile and may have multiple cards. Avoid creating a separate front-office workflow.

## Existing code verified
- Swipe entry: `apps/web/src/app/transactions/card-swipe/page.tsx` offers **Not paid yet** and **Pay now / already paid**. Quick swipe: `apps/web/src/components/quick-card-swipe-entry.tsx` saves a swipe without an immediate payout.
- `apps/api/src/transactions/transactions.service.ts#createCardSwipe` creates a `CustomerPayable`, provider settlement and, for immediate payment legs, `PayablePayment` and journals. Current payable formula is `swipeAmount - customerCommissionAmount`; provider/gateway processing fees are a separate business cost.
- `apps/web/src/app/customers/[id]/page.tsx` has **+ Pay In** and **− Pay Out**, optional card and optional match-to-obligation allocations, running customer Card Ledger and printable statement.
- `apps/api/src/customers/customers.service.ts#createCardLedgerEntry` posts money movements, splits amounts between receivable/payable ledger accounts, and can allocate payments to **already-existing** `CustomerPayable` or `CardDueClearingDetail`.
- `CustomerLedgerAllocation` in `apps/api/prisma/schema.prisma` is an allocation of a *current* Pay In/Pay Out entry to a *current* obligation, not a subsequent application of an earlier unallocated advance.

## Confirmed accounting gap
An advance Pay Out before a swipe creates a cash/bank/wallet outflow and customer receivable. A subsequent Card Swipe creates a fresh customer payable, but there is no matching operation to consume the earlier advance, clear the corresponding receivable, and reduce `CustomerPayable.remainingAmount` in one atomic step. The running customer ledger visually nets the two money movements; the individual payable, overdue summary, receivable GL and dashboard can disagree. The reverse timing (unallocated Pay In followed by an eligible customer due) also lacks an explicit future-application lifecycle.

Example: advance Pay Out ₹15,000 on Monday. Tuesday swipe ₹40,000 less ₹800 customer commission = ₹39,200 payable; existing customer statement nets to ₹24,200 payable, but the swipe payable can still show ₹39,200 outstanding and the ₹15,000 receivable remains. This must not be “fixed” by making another payout.

## Business workflow (minimal clicks)
1. **Swipe now, pay later:** choose customer/mobile and card; record swipe/provider/fees; choose Not paid yet; create payable and due date. Show Unpaid / Partial / Paid status; allow later multiple cash/bank/UPI/wallet payment legs and destination/reference. Provider settlement remains distinct from customer payout.
2. **Pay advance before swipe:** from the customer Card Ledger choose − Pay Out; amount, source account, date, optional card/reference/remarks, and destination/recipient for electronic payments. If no matching swipe exists, create a traceable **unapplied customer advance** instead of pretending a swipe is already paid.
3. **Swipe after advance:** at swipe save show available customer advance; offer one simple **Apply ₹X advance** action (sensible proposed amount; require explicit selection if multiple cards/advances are ambiguous). Match advance to this payable within one DB transaction; payable remaining becomes `max(0, new payable - advance applied)`. Excess advance remains outstanding for a later swipe or separate customer repayment.
4. **Pay Out after swipe:** if current eligible payables exist, offer auto-match oldest first with manual override. A cash payout must record the actual selected drawer; a bank/UPI/wallet payout must record source, recipient/beneficiary and reference.
5. **Pay In:** funds genuinely received from customer must debit actual cash/bank/wallet and reduce a selected customer receivable/card-due balance; any excess is unapplied customer credit. Later application of customer credit to an eligible due must be traceable, if business rules permit the offset.
6. **Customer share:** keep the current running statement and printing. Add a minimal phone-friendly receipt/statement export or share path when needed, hiding internal wallet balance, margin, provider fees, staff-only notes and other customers' data.

## Accounting rules and model changes
- **Actual advance Pay Out, ₹A:** Dr `SYS-CUST-RECEIVABLE` ₹A; Cr paying asset account ₹A, plus separately expensed provider payout charge where applicable. No commission is earned solely by making an advance.
- **Swipe:** existing provider clearing/fee/customer payable/commission journal, unchanged.
- **Later apply ₹M of already-paid advance to swipe payable:** Dr `SYS-CUST-PAYABLE` ₹M; Cr `SYS-CUST-RECEIVABLE` ₹M. **No bank/wallet/cash posting.** Decrease open advance and open payable by ₹M; preserve original advance and swipe dates; application has its own timestamp/actor and reference.
- **Pay In on account:** Dr receiving asset; Cr `SYS-CUST-PAYABLE` when not settling an existing receivable. Applying this credit to a later confirmed receivable: Dr `SYS-CUST-PAYABLE`; Cr `SYS-CUST-RECEIVABLE`; never post receipt twice.
- Add a durable `CustomerAdvanceApplication` / generalized `CustomerBalanceApplication` record linking source unallocated ledger entry to target payable/card-due, amount, application journal/transaction, timestamps, user and reversal state. Track remaining unapplied advance/credit rather than relying on net running ledger alone.
- Reconcile `CustomerPayable.paidAmount` as completed physical payouts + manual Pay Out allocations + active applications of earlier advances. Invariant: original = paid + remaining; application never increases actual money out.
- A customer may have both payable and receivable open simultaneously, on different cards or obligations. Do not silently use an unrelated card's advance merely because customer net position is zero.
- Clear separation between a **customer advance before expected swipe** and the **Card Due** flow, where business funds the customer's actual credit-card bill and later recovers it.
- Protect races by locking the customer/advance plus target obligation(s) in a stable order and using idempotent transaction/application keys. Two staff cannot apply the same advance twice.
- Allow reversals only with safe, auditable matching rollback: reverse application before reversing its advance or swipe; if later settlements depend on it, block or require a controlled compensating transaction. Never rewrite posted journals.
- Respect staff Main Cash Reserve restrictions, active cash-session checks, effective transaction dates, payout account funding, provider charges and separate service/commission profit.
- Keep reporting and detail views in sync: Customer Payables, receivables, customer history, dashboard, account/wallet ledger, transaction detail and overdue reminders. Show separately **advanced**, **applied**, **cash/bank paid**, and **still due**.

## Acceptance scenarios (regression tests required)
- Swipe ₹40,000, customer commission ₹800, no payout ⇒ payable ₹39,200; later two payouts of ₹20,000 and ₹19,200 ⇒ fully paid, each actual source ledger correct.
- Advance ₹15,000 then swipe payable ₹39,200 ⇒ advance applied ₹15,000; payable ₹24,200; receivable for this advance becomes zero; **no duplicate money out** on application.
- Advance ₹50,000 then swipe payable ₹39,200 ⇒ ₹39,200 matched, ₹10,800 remains an unapplied customer advance/receivable, not negative payable.
- Swipe payable ₹39,200, pay ₹10,000 immediately, pay ₹9,200 later, apply an earlier ₹20,000 advance ⇒ remaining zero and both payment modes traceable.
- Two cards and multiple swipes: apply advances only to selected eligible obligation; customer-level advance on ambiguous multi-card customer needs explicit match.
- Unallocated Pay In followed by eligible receivable: matched amount and residual credit reconcile without duplicating cash inflow.
- Concurrent apply/save, retry same request, double-click, matching exceeding remaining, charge/reversal, closed cash shift, owner/staff permissions.
- Print/share customer statement matches detailed payable and GL balances; chronological original transaction timestamps unchanged; audit indicates who applied and reversed.
- On a historical dataset, reconciliation queries check each payable against completed payment rows + manual allocations + applied advances; no unbalanced posted journal and no disjoint “ghost” customer advance.
- After deployment, verify Card Swipe, Payables, Daily Cash, Customers, account ledger, dashboard, reversal, and reports with regression tests and non-production fixture data first.

## Deployment constraints
The VPS hosts other workloads: do not delete or overwrite unrelated files or service instances, and preserve existing backup/build directories. Make schema changes with forward-only reviewed migrations, test against a copy/fixture, then migrate/deploy only Cash Ledger. Every production change must be committed and pushed to Git `main`, with a clean revision and API/web smoke tests. Ensure all migrations and seed/config needs are included for a future client's VPS.

## Status after this audit
This document records the identified design gap and required tests. It is **not** proof that advance matching, share actions, migrations, or financial reconciliation fixes have been coded, tested or deployed.

## Implementation update (2026-10-11)

This increment is implemented in source on Git main, subject to separate
database migration and release deployment:

- A later card swipe can apply the receivable portion of an earlier funded
  customer Card Ledger Pay Out. A dedicated CUSTOMER_ADVANCE_OFFSET posts
  Dr customer payable / Cr customer receivable without moving real money.
- Applications and owner/admin reversals are atomic, posted, audited,
  linked to the original Pay Out and swipe, and source balance checked.
- CustomerPayable.offsetAmount is separate from actually paid paidAmount;
  CustomerLedgerEntryDetail.advanceAppliedAmount tracks consumed advances.
- Staff use the existing compact Pay Out button, not a new payment form.
  Customer Card Ledger shows unapplied advances, with a direct path to
  a pending swipe. The payable screen shows entitlement, actually paid,
  previous advance adjusted and still to send.
- Advances are customer-verified and card-verified when tagged. They
  must predate the swipe. Multiple partial matches are supported, and
  leftover advances remain available for later swipe settlement.
- Source Pay Out, swipe and adjustment reversal paths protect dependent
  balances; locks serialize application against reversal.
- Forward-only migration 20261011120000_customer_advance_offsets and
  targeted regression tests are committed for client VPS setup.

DEPLOYMENT SAFETY: Source integration is not proof of a live rollout. The
VPS filesystem was almost full during this update while a separate
Cash Ledger release build was operating. No unrelated process or backup
should be deleted to deploy this change.

NOT IN THIS INCREMENT: using prior unapplied Pay In credit to settle a
future Card Due, or direct messaging of a sanitized customer receipt.
Existing Pay In, Pay Out, partial settlement and statement printing are
unchanged. Those additions require separate acceptance and privacy tests.
