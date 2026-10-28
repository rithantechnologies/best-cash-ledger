import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = readFileSync(new URL('./pending-clearing.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { pendingClearingHref, pendingExpenseHref } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const quick = {
  transactionType: 'CASH_TRANSFER', status: 'PENDING',
  quickCashTransfer: { id: 'quick-id', purpose: 'TRANSFER', cashAccount: { id: 'drawer-1' } },
};
test('pending quick cash links to its existing completion form and original drawer', () => {
  assert.equal(pendingClearingHref(quick), '/cash-counter?completePending=quick-id&cashAccountId=drawer-1');
});
test('completion never appears for completed, reversed, or failed entries', () => {
  for (const status of ['COMPLETED', 'REVERSED', 'FAILED', 'CANCELLED']) {
    assert.equal(pendingClearingHref({ ...quick, status }), null);
  }
});
test('other pending transactions and incomplete relation data do not suggest quick cash clearing', () => {
  assert.equal(pendingClearingHref({ ...quick, transactionType: 'CARD_SWIPE' }), null);
  assert.equal(pendingClearingHref({ ...quick, quickCashTransfer: null }), null);
  assert.equal(pendingClearingHref({ ...quick, quickCashTransfer: { ...quick.quickCashTransfer, purpose: 'SERVICE' } }), null);
  assert.equal(pendingClearingHref({ ...quick, quickCashTransfer: { ...quick.quickCashTransfer, cashAccount: null } }), null);
});

test('pending business and personal expenses link to their existing completion form', () => {
  for (const transactionType of ['BUSINESS_EXPENSE', 'PERSONAL_EXPENSE']) {
    assert.equal(pendingExpenseHref({ id: 'expense-1', transactionType, status: 'PENDING' }),
      '/transactions/expense-1?completeExpense=1');
  }
});
test('only pending expenses offer expense completion', () => {
  for (const status of ['COMPLETED', 'REVERSED', 'FAILED', 'CANCELLED']) {
    assert.equal(pendingExpenseHref({ id: 'expense-1', transactionType: 'BUSINESS_EXPENSE', status }), null);
  }
  assert.equal(pendingExpenseHref({ id: 'card-1', transactionType: 'CARD_SWIPE', status: 'PENDING' }), null);
  assert.equal(pendingExpenseHref({ id: '', transactionType: 'BUSINESS_EXPENSE', status: 'PENDING' }), null);
});
