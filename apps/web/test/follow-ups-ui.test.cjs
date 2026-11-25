const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../src');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('follow-up queue supports both card retries and non-posting refund tracking',()=>{
 const page=read('app/follow-ups/page.tsx');
 assert.match(page,/CARD_RETRY/);
 assert.match(page,/BANK_REFUND/);
 assert.match(page,/Save pending follow-up/);
 assert.match(page,/Expected refund is informational/);
 assert.match(page,/Verify posted refund/);
 assert.match(page,/Remind next window/);
 assert.match(page,/Audit history/);
 assert.doesNotMatch(page,/whatsapp.*send|send.*whatsapp/i);
});
test('sidebar shows due reminders and card swipe can save a retry without a sale',()=>{
 const shell=read('components/app-shell.tsx');
 const swipe=read('app/transactions/card-swipe/page.tsx');
 const quick=read('components/quick-card-swipe-entry.tsx');
 assert.match(shell,/href:"\/follow-ups"/);
 assert.match(shell,/dueFollowUps/);
 assert.match(swipe,/create=card&customerId=/);
 assert.match(quick,/create=card&customerId=/);
});

test('customer-wise card summary displays bold provider/gateway and requires confirmed amounts',()=>{
 const page=read('app/follow-ups/page.tsx');
 assert.match(page,/customerSummaries\.length>0/);
 assert.match(page,/group\.cardCount/);
 assert.match(page,/group\.taskCount/);
 assert.match(page,/group\.plannedSwipeTotal/);
 assert.match(page,/group\.amountMissing/);
 assert.match(page,/Provider <strong className="ml-1 text-base font-black/);
 assert.match(page,/Gateway <strong className="ml-1 text-base font-black/);
 assert.match(page,/plannedSwipeAmount:Number\(plannedAmount\)/);
 assert.match(page,/action\(row,\"SET_AMOUNT\"\)/);
});

test('a follow-up card swipe preselects its card, gateway and verified remaining amount',()=>{
 const swipe=read('app/transactions/card-swipe/page.tsx');
 const queue=read('app/follow-ups/page.tsx');
 assert.match(queue,/followUpId=\"\+encodeURIComponent\(row\.id\)/);
 assert.match(swipe,/apiFetch<SwipeFollowUp>\(\"\/follow-ups\/\"/);
 assert.match(swipe,/manualAmountRef\.current=true/);
 assert.match(swipe,/setAmount\(Number\.isFinite\(remaining\)&&remaining>0/);
 assert.match(swipe,/setProviderRate\(String\(gatewayDefaultRate\(current\)\)\)/);
 assert.match(swipe,/action:\"RECORD_SWIPE\"/);
 assert.match(swipe,/Retry follow-up link/);
 assert.match(swipe,/cashledger_card_customer_pref_/);
 assert.match(swipe,/transactionAtForBusinessDate\(swipeDate\)/);
 assert.match(swipe,/setSwipeDate\(todayIst\(\)\)/);
 assert.match(swipe,/remainingPlannedAmount/);
 assert.match(queue,/Linked partial swipes/);
});

test('follow-ups can add customers/cards inline and export completed tasks by IST completion date',()=>{
 const page=read('app/follow-ups/page.tsx');
 assert.match(page,/Customer not found\? \+ Add customer here/);
 assert.match(page,/Add card to this customer/);
 assert.match(page,/\/customers\/quick-card/);
 assert.match(page,/\/customers\/\"\+encodeURIComponent\(customerId\)\+\"\/cards/);
 assert.match(page,/completed-report\?/);
 assert.match(page,/downloadCompletedReport/);
 assert.match(page,/completedTasksCsv/);
 assert.match(page,/Completed task report/);
});
