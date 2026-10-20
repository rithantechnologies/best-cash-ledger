import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { suggestedPayOutSource, suggestedPayOutFundingSource } from './pay-out-source.ts';

const payIn = (id, account, card, date) => ({
  financialAccountId: account,
  accountName: account,
  accountType: 'PROVIDER_WALLET',
  customerCardId: card,
  transactionId: id,
  transactionNumber: id,
  transactionAt: date,
});

test('autofills source from newest Pay In for the selected card, not another card', () => {
  const entries = [
    payIn('old-same', 'wallet-a', 'card-1', '2026-10-11T10:00:00.000Z'),
    payIn('new-other', 'wallet-b', 'card-2', '2026-10-14T10:00:00.000Z'),
    payIn('new-same', 'wallet-c', 'card-1', '2026-10-13T10:00:00.000Z'),
  ];
  assert.equal(suggestedPayOutSource(entries, 'card-1', '2026-10-15')?.financialAccountId, 'wallet-c');
  assert.equal(suggestedPayOutSource(entries, '', '2026-10-15')?.financialAccountId, 'wallet-b');
});

test('uses a customer-level Pay In if selected card has none', () => {
  const entries = [
    payIn('other', 'wallet-b', 'card-2', '2026-10-13T10:00:00.000Z'),
    payIn('general', 'wallet-a', null, '2026-10-12T10:00:00.000Z'),
  ];
  assert.equal(suggestedPayOutSource(entries, 'card-1', '2026-10-15')?.financialAccountId, 'wallet-a');
  assert.equal(suggestedPayOutSource(entries.slice(0, 1), 'card-1', '2026-10-15'), null);
});

test('uses Indian business-day boundaries for auto source', () => {
  const entries = [
    payIn('tomorrow-in-ist', 'wallet-b', null, '2026-10-15T18:30:00.000Z'),
    payIn('today-in-ist', 'wallet-a', null, '2026-10-15T18:29:59.000Z'),
  ];
  assert.equal(suggestedPayOutSource(entries, '', '2026-10-15')?.financialAccountId, 'wallet-a');
});

test('does not use a future Pay In for backdated Pay Out', () => {
  const entries = [
    payIn('future', 'wallet-new', null, '2026-10-16T10:00:00.000Z'),
    payIn('past', 'wallet-old', null, '2026-10-12T10:00:00.000Z'),
  ];
  assert.equal(suggestedPayOutSource(entries, '', '2026-10-14')?.financialAccountId, 'wallet-old');
  assert.equal(suggestedPayOutSource(entries, '', '2026-10-11'), null);
  assert.equal(suggestedPayOutSource(entries, '', ''), null);
});

test('previous actual payouts can provide an eligible source for a customer with no Pay In', () => {
  const actualPayouts = [
    payIn('prior-other-card', 'wallet-other', 'card-2', '2026-10-15T10:00:00.000Z'),
    payIn('prior-same-card', 'wallet-payswitch', 'card-1', '2026-10-14T09:00:00.000Z'),
    payIn('future-payout', 'wallet-future', 'card-1', '2026-10-19T10:00:00.000Z'),
  ];
  assert.equal(suggestedPayOutSource(actualPayouts, 'card-1', '2026-10-18')?.financialAccountId, 'wallet-payswitch');
  assert.equal(suggestedPayOutSource(actualPayouts, 'card-2', '2026-10-18')?.financialAccountId, 'wallet-other');
  assert.equal(suggestedPayOutSource(actualPayouts, 'card-1', '2026-10-13'), null);
  assert.equal(suggestedPayOutSource(actualPayouts, '', '2026-10-18')?.financialAccountId, 'wallet-other');
});


test('prefers confirmed previous payout wallet over newer Pay In and never invents a swipe source', () => {
  const payIns=[payIn('received','bank-account',null,'2026-10-19T12:00:00.000Z')];
  const priorPayouts=[payIn('paid','cash-drawer','card-1','2026-10-18T10:00:00.000Z')];
  assert.deepEqual(suggestedPayOutFundingSource(payIns,priorPayouts,'card-1','2026-10-20'),{
    source:priorPayouts[0],kind:'PREVIOUS_PAYOUT',
  });
  assert.deepEqual(suggestedPayOutFundingSource(payIns,[],'card-1','2026-10-20'),{
    source:payIns[0],kind:'PAY_IN',
  });
  assert.equal(suggestedPayOutFundingSource([],[],'card-1','2026-10-20'),null);
  assert.equal(suggestedPayOutFundingSource([],priorPayouts,'card-1','2026-10-17'),null);
});
