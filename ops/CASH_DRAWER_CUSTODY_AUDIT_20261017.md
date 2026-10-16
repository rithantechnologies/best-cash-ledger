# Cash Ledger — drawer custody, cash sessions and handovers: flow audit (2026-10-17)

## Scope and test boundary

Source inspected on NEW client VPS `srv2067503`, cashledger-source local `main`.
This is a code-level business-flow audit and isolated in-memory service simulation. No production financial records, balances, sessions or account definitions were changed. No authenticated browser + API + real DB end-to-end tests have been executed on a disposable PostgreSQL database. That is mandatory before calling the new multi-drawer workflow production-ready.

The existing API test suite: 19 files; 85 passing tests, 2 expected failures documenting current cash-drawer defects and 4 todo scenarios. The extra `cash-drawer-flow-audit.spec.ts` suite contains 7 passing scenario checks, 2 expected failures and 4 todos. Vitest exit status 0 does NOT mean the gaps are fixed.

## Recommended physical setup

Start with three separate cash financial accounts *if physically separate business cash really exists*:

1. `Main Cash Reserve`: owner-controlled cash at the shop, used to fund the working drawer and receive withdrawals/handovers.
2. `Staff Counter Drawer`: physical working till controlled by the assigned staff member per session; owner may fund, inspect, reconcile and explicitly act on the staff's behalf.
3. `Owner Home Reserve`: separately secured **business** cash kept at home. No customer operations here by default. If the money is personal, do **not** record it as a business cash asset; record real business contributions/owner withdrawals when exchanged.

Add an `Owner Counter Drawer` as a FOURTH account if the owner's operating till and the shop's reserve are genuinely separate physical cash locations. Never create a second drawer merely because a different person temporarily operates the same physical till. Same drawer + new operator => new session, not duplicate cash.

Total physical cash = sum of physical locations. Any owner/staff/home handover must debit one location and credit the other in the **same** posted journal. Cash custody transfer is not revenue or expense.

## Concrete transfer walkthrough (no customer income assumed)

| Step | Shop reserve | Staff drawer | Home reserve | Total cash |
|---|---:|---:|---:|---:|
| Opening | ₹100,000 | ₹0 | ₹150,000 | ₹250,000 |
| Owner issues ₹50,000 to staff | ₹50,000 | ₹50,000 | ₹150,000 | ₹250,000 |
| Staff returns ₹20,000 midshift | ₹70,000 | ₹30,000 | ₹150,000 | ₹250,000 |
| Owner brings ₹30,000 from home to shop | ₹100,000 | ₹30,000 | ₹120,000 | ₹250,000 |
| Staff closes and hands remaining ₹30,000 to owner | ₹130,000 | ₹0 | ₹120,000 | ₹250,000 |

Opening count is physical reconciliation, not a second transfer or new money. If cash is moved and then counted at session opening, a single `funding transfer` must be recorded. Do not create a separate cash-in income transaction.

## Current source behavior confirmed

- `CashCounterController` exposes GET today/current/operators/history, POST open and POST close. No PATCH/PUT edit/reconcile endpoint exists.
- A session can be opened by Owner for a designated active staff user. STAFF can only open a session for themselves.
- Staff cannot open the special owner location named exactly `Main Cash Reserve`; the existing account list likewise filters only that exact name. `Owner Home Reserve` would therefore not be protected by those filters.
- Owner-to-staff opening funding can create one `INTERNAL_TRANSFER`, paired balanced journal entries, denomination-based opening count and OPEN audit.
- Opening with no source records `openingTotal` and denominations but **does not** post any money. This can make the session's apparent cash disagree with a newly reset account's journal/current balance when entered without an actual prior funded balance. A ₹23,800 draft saved this way is not itself evidence of an auto-save bug.
- Opening transfer requires a currently OPEN cash session at the source, even if source is a passive home safe or shop reserve. General internal cash-to-cash transfers require OPEN sessions at BOTH endpoints. That makes passive reserves cumbersome and leads to owner-only workarounds.
- Closing checks counted cash versus expected cash and rejects variance. An older variance-adjustment branch in `close` is unreachable after the early mismatch rejection; there is no owner-approved cash reconciliation workflow.
- `close` can hand over the entire counted balance to another drawer in one atomic DB transaction. For the same drawer and new operator, it can create a new session; when moving to another drawer it posts debit/credit ledger entries. Partial transfers during an active shift require the general internal-transfer route and its open-session preconditions.
- Session creation checks for an existing OPEN session **outside** the DB transaction and schema does not establish a partial unique constraint for one OPEN session per drawer. Simultaneous requests can both pass the check.
- In source-based opening funding, staff may choose an owner reserve as `sourceCashAccountId`, provided that source's cash session happens to be open: missing source-account authorization.
- UI has controlled denomination text inputs. Editing quantities only changes React state, while the opening form `onSubmit` calls POST /cash-counter/open. No autosave on each keystroke was found. Pressing Enter in an input can submit an HTML form and is a plausible explanation for the reported unintended ₹23,800 save, but this is **not yet reproduced in a browser**.
- Repeated cash sessions within a day are modeled: only one OPEN session per drawer should exist, but multiple sequential sessions after closing are allowed.

## Prioritized corrections

### P0 — before allowing real multi-location custody

1. Introduce structured cash-location metadata: `cashLocationType` (OWNER_SHOP_RESERVE / OWNER_HOME_RESERVE / COUNTER_DRAWER), `ownerControlled`, `requiresSession`, `assignedCustodianUserId` or per-session operator mapping. Do not infer owner-only status from account display names.
2. Enforce source AND destination authorization for all cash movements. STAFF must not debit owner-controlled home/shop reserves merely because they are open. Owner may issue on behalf of staff with an auditable actor and recipient.
3. Enforce one OPEN session per physical cash drawer inside a DB transaction, ideally with a PostgreSQL partial unique index `WHERE status='OPEN'`. Use drawer locking/unique error handling and idempotent submit keys.
4. Make passive reserve-to-drawer and drawer-to-reserve transfers a first-class operation without requiring an *operational shift session* on owner-controlled reserve. Preserve sufficient-funds, ownership and audit checks. Working tills should still need OPEN sessions for customer transactions.
5. Disallow creating unexplained positive session openings on zero/empty drawer balances: opening count is verified against current ledger cash. Provide one explicit choice: `Count cash already here` versus `Receive new cash from another location` versus `Owner opening-capital funding`. Record the source and reconcile mismatches.

### P1 — client requested edit control and accidental save protection

6. Add explicit Owner-only `Edit/Reconcile Session`. Changes to responsible staff, notes, opening denomination count, time or cash movement must produce before/after audit, edited_by and edited_at. Do **not** silently rewrite a closed session or posted journals. For an open-session count error, adjust the counted baseline with an audited correction and reconcile any already-posted funding transfer. For a closed session, use an owner-approved separate compensating adjustment/reconciliation with the original close record preserved.
7. Change Start Session to a deliberate confirmation flow displaying drawer, operator, opening count, funding source and ₹total. The count inputs should not submit on Enter. Label `Draft — not saved`, require a second explicit confirmation for an amount like ₹23,800, disable double click while saving, and show receipt/transaction link after success. Reproduce the original user's browser steps before assigning root cause.
8. Add a dedicated lightweight `Move Cash` action with **From, To, ₹amount, denomination breakdown (optional), date/time, handed over by, received by, status, note**. Show pending acceptance until recipient acknowledges cash; prevent using transferred funds twice.
9. Allow owner delegation: choose working drawer + responsible staff, reserve-funded opening, staff acceptance, count confirmation. A staff member may propose a transfer; owner authorization is needed to debit an owner-only reserve.
10. At close, distinguish `Close only`, `Hand over same drawer to next cashier`, `Return ALL cash to owner`, `Return PART and leave float`, and `Transfer to home reserve`. Never implicitly move all cash when only a portion is physically handed over.

### P2 — usability and reconciliation

11. Show a global cash-location overview: physical cash per location, person currently responsible, last count, expected balance, cash in transit, and total consolidated physical cash. Owner can review all; staff sees only their assigned drawer(s).
12. Show owner exception queue: uncleared handovers, session opening mismatches, unexplained shortages/overages, open overnight sessions, and backdated changes.
13. Allow reusable transfer/custody receipts, signed/acknowledged by sender and receiver, and export a session-close report.
14. Customer cash receipts/withdrawals affect physical cash; UPI/bank receipts do not. Commission income is separate from principal.
15. Portable client deployment: schema migration, seed account category mapping, roles and tests must live in Git `main`; avoid VPS-only configuration with renamed account assumptions.

## Acceptance test matrix for a disposable application DB (NOT yet executed)

| # | Scenario | Expected |
|---|---|---|
| 01 | Initial reserve/shop/staff balances | Grand total = sum of physically verified starting cash |
| 02 | Owner shop reserve → staff ₹50,000 | One transfer, shop -₹50k, staff +₹50k, no income |
| 03 | Staff opens counted ₹50k for same funded drawer | Session opening ₹50k, no second financial transfer |
| 04 | Owner funds staff drawer on their behalf | Owner actor, staff custodian; staff acknowledges physical receipt |
| 05 | Staff tries to debit owner reserve | DENY; no journal/session change |
| 06 | Staff → owner reserve partial ₹20k | Staff -₹20k, owner +₹20k; staff continues session |
| 07 | Home reserve → owner shop ₹30k | Home -₹30k, shop +₹30k; no artificial home shift |
| 08 | Owner shop → home reserve return | Shop -, home +; owner audited |
| 09 | Close staff session and transfer remaining cash | Matched counted close + correctly reconciled handover |
| 10 | Same physical drawer changes from staff A to B | A closes, B opens separate session, cash not double counted |
| 11 | Multiple opens/closes on same day | Each shift preserved separately with proper timestamps |
| 12 | Concurrent double-open requests | Exactly one OPEN session, one request rejected/idempotently answered |
| 13 | Typed ₹23,800 then press Enter in note quantity | Does not save; confirmation required |
| 14 | Owner fixes mistaken ₹23,800 count | Audited correction, no silent historical journal rewrite |
| 15 | Count ₹49,500 when ledger expects ₹50,000 | Block matched close or explicitly record approved ₹500 shortage |
| 16 | Attempt staff operation on Home Reserve | Denied in API AND hidden from staff navigation |
| 17 | Close and then retro-edit paid expense | Closed session remains auditable; reconcile correctly |
| 18 | Internet retry/double-tap on transfer | Exactly one ledger posting (idempotency) |
| 19 | Midnight / yesterday close / backdated business date | Clear business date, no wrong-day cash effects |
| 20 | Owner deposit/withdraw personal money | Classified capital/drawings if personal, not commission/service income |

## Research basis

UC Davis and UC San Diego cash internal-control guidance emphasize distinct cashier accountability, tracking who controls cash, documenting transfers, securing reserves and reconciling counts. The recommended custody acknowledgments, location-level owner visibility, and periodic reconciliation follow this principle. Broader external guidelines are supportive background, not a substitute for verifying the client's particular accounting rules.

## Sign-off

Test-only code and this audit may be committed, but production should not be considered certified for owner home reserves/owner edit until P0 and P1 are implemented and the acceptance matrix runs against a disposable DB + authenticated browser; the original client financial DB must stay unchanged until explicitly approved.
