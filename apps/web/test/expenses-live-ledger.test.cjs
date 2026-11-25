const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"../src/"+p),"utf8");
const expenses=read("app/expenses/page.tsx");
const quick=read("components/quick-expense-entry.tsx");
test("expense dashboard listens for successful writes and refreshes all panels without navigation",()=>{
 assert.match(expenses,/addEventListener\("cashledger:expense-saved",onSaved\)/);
 assert.match(expenses,/void reload\(true\)/);
 assert.match(expenses,/setTransactions\(updated\);setCategories\(cats\);setAccounts\(accountRows\)/);
 assert.match(expenses,/new Date\(b.createdAt\).getTime\(\)-new Date\(a.createdAt\).getTime\(\)/);
 assert.match(expenses,/requestCounter\.current/);
 assert.match(expenses,/activeRequest\.current\?\.abort\(\)/);
 assert.match(expenses,/cache:"no-store"/);
 assert.match(quick,/detail:\{transactionAt:dateWithCurrentLocalTime\(expenseDate\),categoryId,transactionNumber:saved\?\.transactionNumber\}/);
});
test("quick ledger entry allows consecutive saves with same category/account/date and no duplicate submission",()=>{
 assert.match(expenses,/aria-label="Add consecutive expenses"/);
 assert.match(expenses,/onSubmit=\{saveInlineExpense\}/);
 assert.match(expenses,/expenseCategoryId:entryCategory,expenseType:"BUSINESS",amount:value/);
 assert.match(expenses,/if\(entryBusy\)return;/);
 assert.ok(expenses.includes('setEntryAmount("");setEntryPayee("");setEntryNotes("");'));
 assert.match(expenses,/await reload\(true\)/);
 assert.match(expenses,/disabled=\{entryBusy\|\|!entryCategory/);
 assert.match(expenses,/Save & add next/);
});
