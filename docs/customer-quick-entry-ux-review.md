# Customer-first quick entry: UX review and implementation notes
Reviewed 2026-10-16 against Cash Ledger customer profile, global Card Swipe modal, Daily Cash quick entry, rush grid and detailed transaction pages.

## Core task
Search a customer by phone/name/card last four -> open customer profile -> choose transaction -> enter minimum fields using existing saved data -> save or cancel -> return to the same customer profile.

## Problems found
- Profile Card Swipe linked to the full Card Swipe page despite a working global quick swipe modal.
- AEPS / Micro ATM profile actions linked to their detailed pages instead of the existing quick-out popups.
- Daily Cash opens quick dialogs after navigation; after Save/Cancel it left the user at Cash Counter.
- All eight quick actions competed visually; profile also showed a second duplicated shortcut row.
- Selected customer name/mobile were repeated as large editable controls inside the quick form.
- Note and backdate were shown even if unused, increasing vertical scroll.
- EB Bill preset relied on the transfer type catalog already being loaded.
- Reusing credit-card swipe records for a Micro ATM debit card would be incorrect. AEPS PR is not Aadhaar last-four.

## Target hierarchy
1. Main actions: Cash In, Cash Out, Card Swipe (high contrast, visible).
2. Contextual services: AEPS, Micro ATM, EB Bill (compact, service-specific).
3. More options: Bulk Quick Entry, detailed transfer, detailed AEPS settlement and detailed Micro ATM. Keep these full forms available.

## Changes in this revision
- The customer profile Card Swipe action dispatches the existing global modal with the customer's ID. Card Swipe retains existing/new customer modes and specific saved credit card selection.
- Cash In / Cash Out / AEPS / Micro ATM / EB Bill reuse Daily Cash quick-entry popup, preselecting exact context. The origin customer is retained for Save/Cancel return, with success feedback on the profile.
- Bulk grid launched from a customer profile returns there on close.
- Selected customer becomes a compact non-editable summary with Change, instead of duplicate name/mobile entry fields.
- Optional note and date/time are collapsed; Save and Cancel remain fixed in the footer.
- Cash In suggests eligible active bank/UPI/beneficiary destinations only. AEPS uses saved AEPS bank + separately provided Aadhaar last-four. Micro ATM suggests only stored debit/ATM card suffixes. EB Bill loads the saved consumer number after the service catalog is ready.
- No change to transaction calculations, cash drawer rules, journal posting, migrations or the main Cash Counter backend.

## Important remaining architecture / acceptance criteria
The current Cash In/Out quick popup **still belongs to the Daily Cash page**. The profile shortcuts navigate to Daily Cash, which opens its popup; Save/Cancel returns to the customer profile. This is a transitional fix, **not** a true overlay mounted directly on the customer page.

For true one-page, no-route-change quick entry, extract the existing Daily Cash quick-entry state, validation and form into a shared component with originCustomerId, service preset, onCancel and onSaved props. Mount the exact same component on the customer profile and the Cash Counter; do **not** clone API calls or fee/payout logic. Test no cash session, close/reopen drawer, accessibility, ESC, focus return, pending completion and retained original transaction date. A comprehensive refactor must preserve provider commissions, split cash/UPI commission, partner costs, wallet allocations, transfers and audit history.

Service-specific acceptance:
- Cash In: saved UPI/beneficiary/bank recipient requires confirmation; amount, fee and cash received remain clear; beneficiary transfer source is a different wallet/payment decision.
- Cash Out UPI: the customer's UPI identity is not the business receiving account.
- AEPS: saved AEPS bank (not arbitrary bank) and Aadhaar suffix entered independently; provider gateway/settlement remains available via detailed screen.
- Micro ATM: debit/ATM card identification only; do not autofill a saved CREDIT swipe card.
- EB: select among saved consumer connections, never silently choose a different recipient.
- Card Swipe: keep existing/new customer, active saved card and prior swipe preferences.

## UX reference
- Material Design dialog guidance: short dialogs should preserve context and confirmation/dismissal actions remain visible; complex full-screen dialogs are appropriate on compact mobile displays. https://m1.material.io/components/dialogs.html
- Apple HIG modality: use modal workflows for bounded tasks with a meaningful benefit from preserving surrounding context. https://developer.apple.com/design/human-interface-guidelines/modality

## Verification
API/Next production builds and customer-search/AEPS regression tests. Financial UI validation must include authenticated smoke tests for each service before public release. No real financial transaction should be created just to run a smoke test.
