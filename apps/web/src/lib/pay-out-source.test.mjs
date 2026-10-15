import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { suggestedPayOutSource } from './pay-out-source.ts';

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
