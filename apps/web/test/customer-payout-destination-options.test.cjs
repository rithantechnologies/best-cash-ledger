const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const customer=fs.readFileSync(path.join(__dirname,'../src/app/customers/[id]/page.tsx'),'utf8');
const payables=fs.readFileSync(path.join(__dirname,'../src/app/payables/page.tsx'),'utf8');
test('Pay Out recipient offers the linked swipe card and other saved credit cards',()=>{
 assert.match(customer,/value=\{"CARD:"\+card\.id\}/);
 assert.match(customer,/card\.id===ledgerEntryCardId\?"Same swipe card · ":"Other saved card · "/);
 assert.match(customer,/value="OTHER_CARD">Another person(?:'|&apos;)s credit card/);
 assert.match(customer,/value="CASH">Cash handed to customer/);
 assert.match(customer,/value="OTHER">Other bank \/ UPI recipient/);
 assert.match(customer,/value=\{"BENEFICIARY_ACCOUNT:"\+a\.id\}/);
 assert.match(customer,/value=\{"BANK:"\+a\.id\}/);
 assert.match(customer,/value=\{"UPI:"\+a\.id\}/);
});
test('Pay Out stores paid-to card apart from the card ledger being matched',()=>{
 assert.match(customer,/customerCardId:ledgerEntryCardId\|\|undefined/);
 assert.match(customer,/payoutDestinationId:payoutId\|\|undefined/);
 assert.match(customer,/payoutDestinationDetails:\["OTHER","OTHER_CARD"\]\.includes\(payoutKind\)/);
 assert.match(customer,/setLedgerPayoutDestination\(""\);/);
 assert.match(customer,/label="Swipe \/ ledger card \(optional\)"/);
 assert.match(customer,/label="Paid to \*"/);
});
test('Payables form offers the exact same swipe card plus all payout destination methods',()=>{
 assert.match(payables,/card\.id===selected\.sourceTransaction\.cardSwipe\?\.customerCard\?\.id\?"Same swipe card · "/);
 for(const expected of ['"CARD:"+card.id','"BANK:"+a.id','"UPI:"+a.id','"BENEFICIARY_ACCOUNT:"+a.id','value="OTHER_CARD"','value="OTHER"','value="CASH"'])
  assert.ok(payables.includes(expected),expected);
 assert.match(payables,/destinationType=destination==="CASH"\?"CASH":destination\.startsWith\("CARD:"\)\?"CUSTOMER_CARD"/);
 assert.match(payables,/destinationDetails:payoutDetailsRequired\?destinationDetails\.trim\(\):undefined/);
});
test('payable payment retry reuses stable idempotency key to avoid duplicate posting',()=>{
 assert.match(payables,/paySaveRetryRef=useRef/);
 assert.match(payables,/previous\?\.fingerprint===fingerprint\?previous\.key:crypto\.randomUUID\(\)/);
 assert.match(payables,/headers:\{"idempotency-key":key\}/);
 assert.match(payables,/Payment saved\. Refresh to see the updated balance\. Do not pay again\./);
});
test('payout screen keeps practical text without repeated instructional paragraphs',()=>{
 for(const phrase of [
  'Money paid to customer · adds Debit (Out)',
  'The card-swipe provider identifies where the swipe was processed',
  'Paid from debits our account. Paid to records the recipient separately',
  'Before saving: choose Paid to',
 ]) assert.ok(!customer.includes(phrase),phrase);
 assert.match(customer,/Select Paid from and Paid to\./);
 assert.match(customer,/Match pending dues/);
 assert.match(payables,/label="Paid from \*"/);
 assert.match(payables,/label="Paid to \*"/);
});
