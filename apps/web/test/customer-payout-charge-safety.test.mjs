import test from 'node:test';
import assert from 'node:assert/strict';
import { payoutChargeProblem, highPayoutChargeWarning } from '../src/lib/customer-payout-charge-safety.mjs';

test('rejects copying full ₹29,310 payout into the fee field', () => {
  assert.match(payoutChargeProblem(29310,29310),/cannot equal/);
  assert.match(payoutChargeProblem(29310,3000),/10%/);
  assert.equal(payoutChargeProblem(29310,25),'');
  assert.equal(payoutChargeProblem(29310,2931),'');
});
test('approved provider slab can exceed manual limit but not consume payout', () => {
  assert.equal(payoutChargeProblem(1000,120,true),'');
  assert.match(payoutChargeProblem(1000,1000,true),/cannot equal/);
});
test('shows a warning when a provider fee exceeds 5% of payout', () => {
  assert.match(highPayoutChargeWarning(1000,60),/Unusually high/);
  assert.equal(highPayoutChargeWarning(1000,40),'');
});
