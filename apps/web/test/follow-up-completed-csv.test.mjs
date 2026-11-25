import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedTasksCsv } from '../src/lib/follow-up-completed-csv.mjs';

test('report preserves each completed task, IST timestamps and linked amounts',()=>{
 const out=completedTasksCsv([{id:'task-1',kind:'CARD_RETRY',customer:'Customer',mobile:'9876543210',
 card:'SBI 5335',provider:'EASYPAY',gateway:'PG1',account:'',plannedAmount:60000,
 swipedAmount:20000,expectedRefund:null,refundCreditVerified:false,
 reason:'Retry',reference:'',completionNote:'Done',completedBy:'Cashier',
 createdAt:'2026-11-24T18:30:00.000Z',completedAt:'2026-11-25T09:30:00.000Z'}]);
 assert.match(out,/"60000","20000"/);
 assert.match(out,/"Cashier"/);
 assert.match(out,/"task-1"/);
 assert.match(out,/"Completed at IST"/);
});
test('spreadsheets cannot evaluate a malicious customer name or note',()=>{
 const out=completedTasksCsv([{customer:'=2+3',completionNote:'  @SUM(1,1)',
  reason:'He said "yes"',kind:'CARD_RETRY',id:'task-2'}]);
 assert.match(out,/"'=2\+3"/);
 assert.match(out,/"'  @SUM\(1,1\)"/);
 assert.match(out,/"He said ""yes"""/);
});
