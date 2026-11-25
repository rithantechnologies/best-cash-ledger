const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const swipe=fs.readFileSync(path.join(__dirname,'../src/app/transactions/card-swipe/page.tsx'),'utf8');
const customer=fs.readFileSync(path.join(__dirname,'../src/app/customers/[id]/page.tsx'),'utf8');

test("Card Swipe defaults the date picker to today IST, preserving real creation times",()=>{
 assert.match(swipe,/const \[swipeDate,setSwipeDate\]=useState\(\(\)=>todayIst\(\)\)/);
 assert.match(swipe,/aria-label="Card Swipe transaction date" type="date" max=\{todayIst\(\)\}/);
 assert.match(swipe,/transactionAtForBusinessDate\(swipeDate\)/);
 assert.match(swipe,/Today preselected/);
 assert.match(swipe,/Original creation and audit timestamps are preserved/);
});
test("backdated swipe payment terms calculate due date from chosen business date",()=>{
 assert.match(swipe,/selectedSwipeBusinessTime\(swipeDate\)\.getTime\(\)\+termDurationMs/);
 assert.match(swipe,/dueAt:new Date\(effectiveDueAt\)\.toISOString\(\)/);
 assert.match(swipe,/customPaymentDate>=\(swipeDate\|\|minCustomPaymentDate\)/);
 assert.match(swipe,/swipeDate<=todayIst\(\)/);
});
test("Pay In / Pay Out keep their existing business date support",()=>{
 assert.match(customer,/onClick=\{\(\)=>openLedgerEntry\("PAY_IN"\)\}/);
 assert.match(customer,/onClick=\{\(\)=>openLedgerEntry\("PAY_OUT"\)\}/);
 assert.match(customer,/setLedgerEntryDate\(localDateValue\(\)\)/);
 assert.match(customer,/type="date" max=\{localDateValue\(\)\} value=\{ledgerEntryDate\}/);
 assert.match(customer,/transactionAt:dateWithCurrentLocalTime\(ledgerEntryDate\)/);
});
