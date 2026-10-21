const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const swipe=fs.readFileSync(path.join(__dirname,'../src/app/transactions/card-swipe/page.tsx'),'utf8');
const customer=fs.readFileSync(path.join(__dirname,'../src/app/customers/[id]/page.tsx'),'utf8');

test('Card Swipe offers an optional historical business date and defaults to now',()=>{
 assert.match(swipe,/const \[swipeDate,setSwipeDate\]=useState\(""\)/);
 assert.match(swipe,/aria-label="Card Swipe transaction date" type="date" max=\{dateInputValue\(new Date\(\)\)\}/);
 assert.match(swipe,/swipeDate\?\{transactionAt:selectedSwipeBusinessTime\(swipeDate\)\.toISOString\(\)\}:\{\}/);
 assert.match(swipe,/Leave blank for today's date and current time/);
 assert.match(swipe,/Actual creation and audit timestamps are preserved/);
});
test('backdated swipe payment terms calculate due date from the chosen transaction date',()=>{
 assert.match(swipe,/selectedSwipeBusinessTime\(swipeDate\)\.getTime\(\)\+termDurationMs/);
 assert.match(swipe,/dueAt:new Date\(effectiveDueAt\)\.toISOString\(\)/);
 assert.match(swipe,/customPaymentDate>=\(swipeDate\|\|minCustomPaymentDate\)/);
 assert.match(swipe,/swipeDate<=dateInputValue\(new Date\(\)\)/);
});
test('Pay In / Pay Out still offer the business date and submit it without relying on creation time',()=>{
 assert.match(customer,/onClick=\{\(\)=>openLedgerEntry\("PAY_IN"\)\}/);
 assert.match(customer,/onClick=\{\(\)=>openLedgerEntry\("PAY_OUT"\)\}/);
 assert.match(customer,/setLedgerEntryDate\(localDateValue\(\)\)/);
 assert.match(customer,/type="date" max=\{localDateValue\(\)\} value=\{ledgerEntryDate\}/);
 assert.match(customer,/transactionAt:dateWithCurrentLocalTime\(ledgerEntryDate\)/);
});
