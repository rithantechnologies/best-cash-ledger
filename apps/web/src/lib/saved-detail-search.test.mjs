import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { matchesSavedDetailSearch as matches } from './saved-detail-search.ts';

test('matches saved bank account by last four, partial, or full formatted number', () => {
  const fields = ['Tamilnad Mercantile Bank', 'Sasi Kumar', '079100060200247', 'TMBL0000079'];
  assert.equal(matches('0247', fields), true);
  assert.equal(matches('060200', fields), true);
  assert.equal(matches('0791 0247', fields), true);
  assert.equal(matches('0791-00060200247', fields), true);
});
test('finds a bank using an unordered combination of bank, IFSC, and holder', () => {
  const fields = ['Tamilnad Mercantile Bank', 'Sasi Kumar', '079100060200247', 'TMBL0000079'];
  assert.equal(matches('TMBL Sasi', fields), true);
  assert.equal(matches('kumar TMBL0000079', fields), true);
  assert.equal(matches('TMB 0247', fields), true);
  assert.equal(matches('ICICI 0247', fields), false);
});
test('matches UPI and recipient fields and ignores case', () => {
  assert.equal(matches('someone@upi', ['Google Pay', 'SomeOne@UPI']), true);
  assert.equal(matches('RAJ 2312', ['Raj', 'Account 00002312']), true);
  assert.equal(matches('2222', ['Raj', 'Account 00002312']), false);
  assert.equal(matches(' ', []), true);
});
