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
