import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const account = read('../app/accounts/[id]/page.tsx');
const reports = read('../app/reports/page.tsx');
const customer = read('../app/customers/[id]/page.tsx');

test('account summary shows real Money In Credit before Money Out Debit', () => {
  const summary = account.slice(account.indexOf('Match the ledger columns below'), account.indexOf('Recorded fees', account.indexOf('Match the ledger columns below')));
  assert.ok(summary.indexOf('Credit · Money In') < summary.indexOf('Debit · Money Out'));
  assert.ok(summary.indexOf('money(movement.in)') < summary.indexOf('money(movement.out)'));
});

test('wallet/account mobile, desktop and split ledger views place Credit before Debit', () => {
  assert.match(account, /direction="IN"[^\n]+\n\s+<WalletLedgerColumn[^\n]+direction="OUT"/);
  assert.match(account, /Credit · In<\/span><span[^>]+>Debit · Out/);
  assert.match(account, /Credit · In<\/p><p[^>]+>\{isIn\?money\(row\.amount\)[^\n]+\n\s+<div[^>]+>[^\n]+Debit · Out/);
  assert.match(account, /text-\[var\(--money-in\)\]">\{isIn\?money\(row\.amount\)[^\n]+\n\s+<div[^\n]+text-\[var\(--money-out\)\]/);
});

test('account report and exported CSV both order credit then debit with correctly mapped amounts', () => {
  assert.match(reports, /"Credit \(In\)","Debit \(Out\)"/);
  assert.match(reports, /isCreditFlow\(ledger,r\)\?r\.amount:"",isCreditFlow\(ledger,r\)\?"":r\.amount/);
  assert.match(reports, /Credit · In<\/th><th[^>]+>Debit · Out/);
  assert.match(reports, /isCreditFlow\(ledger,r\)\?money\(r\.amount\):"—"\}<\/td><td[^>]+>\{isCreditFlow\(ledger,r\)\?"—":money\(r\.amount\)/);
});

test('customer card ledger and printable statement show credit then debit, without modifying balances', () => {
  assert.match(customer, /"Ledger Credit \(Net\)"|Ledger Credit \(Net\)/);
  assert.match(customer, /<th>Credit \(In\)<\/th><th>Debit \(Out\)<\/th>/);
  assert.match(customer, /<td class='in'>[^\n]+<td class='out'>/);
  assert.match(customer, /Credit \(In\)<\/th><th[^>]+>Debit \(Out\)/);
  assert.match(customer, /row\.credit\?money\(row\.credit\):"—"\}<\/td><td[^>]+>\{row\.debit\?money\(row\.debit\):"—"/);
});
