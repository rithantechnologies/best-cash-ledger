import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultPaidToCustomerBank } from '../src/lib/customer-bank-payout-default.mjs';

test('only active unique customer bank is selected, never card or cash',()=>{
 assert.equal(defaultPaidToCustomerBank([{id:'bank-1',isActive:true}]),'BANK:bank-1');
 assert.equal(defaultPaidToCustomerBank([{id:'old',isActive:false},{id:'bank-2',isActive:true}]),'BANK:bank-2');
 assert.equal(defaultPaidToCustomerBank([{id:'old',isActive:false}]),'');
 assert.equal(defaultPaidToCustomerBank([]),'');
 assert.equal(defaultPaidToCustomerBank(null),'');
});
test('two banks without an explicit favorite require a choice',()=>{
 assert.equal(defaultPaidToCustomerBank([{id:'one',isActive:true},{id:'two',isActive:true}]),'');
 assert.equal(defaultPaidToCustomerBank([{id:'one',isActive:true},{id:'two',isActive:true,isDefault:true}]),'BANK:two');
 assert.equal(defaultPaidToCustomerBank([{id:'one',isActive:true,isDefault:true},{id:'two',isActive:true,isDefault:true}]),'');
});
test('each payout entry defaults Paid To to customer bank but offers alternatives',()=>{
 const paths=['../src/app/customers/[id]/page.tsx','../src/app/payables/page.tsx','../src/app/payables/[id]/page.tsx'];
 const [ledger,list,detail]=paths.map(p=>readFileSync(new URL(p,import.meta.url),'utf8'));
 assert.match(ledger,/setLedgerPayoutDestination\(direction==="PAY_OUT"\?defaultPaidToCustomerBank\(c\?\.bankAccounts\):""\)/);
 assert.match(list,/setDestination\(defaultPaidToCustomerBank\(payable\.customer\.bankAccounts\)\)/);
 assert.match(detail,/setDestination\(defaultPaidToCustomerBank\(item\.customer\.bankAccounts\)\)/);
 for(const contents of [ledger,list,detail]){
  assert.match(contents,/value=\{"BANK:"\+a\.id\}/);
  assert.match(contents,/value=\{"CARD:"\+card\.id\}/);
  assert.match(contents,/value="OTHER_CARD"/);
  assert.match(contents,/value="CASH"/);
 }
 assert.match(list,/current&&current!=="CASH"\?current:defaultPaidToCustomerBank/);
});
