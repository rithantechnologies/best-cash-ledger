const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const path=require("node:path");
const base=path.resolve(__dirname,"../../..")+"/";
const service=fs.readFileSync(base+"apps/api/src/transactions/transactions.service.ts","utf8");
const particulars=fs.readFileSync(base+"apps/web/src/lib/transaction-particulars.ts","utf8");
const listing=fs.readFileSync(base+"apps/web/src/app/transactions/page.tsx","utf8");
const detail=fs.readFileSync(base+"apps/web/src/app/transactions/[id]/page.tsx","utf8");
test("expense category is loaded from saved relation without changing financial data",()=>{
 assert.match(service,/expense: \{ select: \{ expenseCategory: \{ select: \{ name: true \} \} \} \}/);
 assert.match(particulars,/readable\(tx.transactionType\) \+ \(category \? ' · ' \+ category : ''\)/);
 assert.match(listing,/expense:\{expenseCategory:\{name:string\}\|null\}\|null/);
 assert.match(detail,/tx\.expense\?label\(tx.transactionType\)\+" · "\+tx\.expense\.expenseCategory\.name/);
});
test("transaction list and details explicitly use IST for timestamps and date filters",()=>{
 assert.match(listing,/formatTransactionTimeIst\(tx.transactionAt\)/);
 assert.match(listing,/formatTransactionDayIst\(t.transactionAt\)/);
 assert.match(listing,/transactionRangeIst\(range\)/);
 assert.match(detail,/formatTransactionDateIst\(tx.transactionAt\)/);
});
