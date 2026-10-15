# Cash Ledger Excel exports

The Excel export is portable to a future client VPS; it uses the existing NestJS API,
Next.js web service, PostgreSQL and npm dependencies, without hard-coded VPS paths.

## User flow and permissions

From **Reports → Export Excel**, choose an inclusive India business-date period and
Complete Business Data or a narrower category. The browser downloads a .xlsx workbook
from \`GET /api/reports/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=all\`.

Owner and Admin only. Authentication/authorization is enforced by the API (not the UI).
Successful export requests are recorded in AuditLog.

## Financial and date rules

- Original transaction sheets use transactionAt within the selected India timezone
  calendar window, including both endpoints.
- Account ledgers and Daily Cash Book use POSTED journal postingDate. Each account's
  opening balance includes earlier posted journal movements, and debit/credit signs
  reflect the financial account's asset or liability nature.
- Cash sessions use businessDate. Opening, closing and denominations are separate.
- Payouts, recoveries, commission collections, receivable receipts and provider
  settlement receipts use their actual movement dates. They may refer to older
  transactions, which remain traceable via original transaction number.
- Pending transactions retain their original transactionAt, with completedAt
  separately recorded.
- Source-date obligation sheets show **current** status/remaining amounts at the
  time the workbook was exported. They are not historical period-end snapshots.
- Transfer/card/ATM principal is not commission or service revenue. Recorded
  business revenue is commission plus gross service revenue, with partner and
  provider costs separated. Pay-later partner cost is not cash paid.
- Reversed and cancelled entries remain traceable in the detail worksheets, but
  financial earnings totals exclude reversed/cancelled/failed transactions.
- Audit change sheets use the actual audit change timestamp.

## Implementation

- Streaming ExcelJS writer, one reusable formatter/sheet writer for all modules.
- Transaction cursor queries in batches of 500; no 1,000-row export cap. A sheet
  with over 1,048,575 data rows automatically continues on another sheet.
- A PostgreSQL repeatable-read database snapshot supplies consistent report data.
  Extremely large multi-year requests should be monitored for the configured
  180-second database transaction timeout.
- Numeric amount and date types are preserved in Excel. Text that resembles
  a formula is escaped to prevent spreadsheet execution.
- The workbook Summary explains date/current-status assumptions and per-sheet
  record counts. The existing CSV report is labelled as **Current View CSV**,
  and is not the full financial export.

## Validation

Run:
- \`npm --prefix apps/api run build\`
- \`npm --prefix apps/api test -- excel-export.spec.ts\`
- \`npm --prefix apps/web run build\`

Regression checks cover India date inclusivity, invalid dates, spreadsheet
formula injection, asset/liability signs, valid empty workbooks and more than
1,000 transactions. Before first client handover, reconcile representative
real exported days with the app's cash book, provider wallets, expenses and
customer payout histories.

Exports are read-only. No financial journal, original transaction timestamp,
or cash balance should ever be adjusted merely to make an export match.
