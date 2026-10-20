import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

// The client VPS Node binary does not support direct .ts imports; transpile
// the pure presentation helper in-memory to exercise its actual logic.
const source = readFileSync(new URL('./transaction-particulars.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { transactionParticulars, isCashOutTransaction } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const quick = (direction, extra = {}) => ({
  transactionType: 'CASH_TRANSFER',
  quickCashTransfer: { direction, purpose: 'TRANSFER', serviceName: null, cashOutType: 'UPI_QR', beneficiaryMode: null, ...extra },
});

test('Cash In shows actual configured GPay or bank transfer type, not generic Cash Transfer', () => {
  assert.deepEqual(transactionParticulars(quick('IN', { serviceName: 'GPay / UPI Transfer', beneficiaryMode: 'UPI' })), {
    title: 'Cash In · GPay / UPI Transfer', detail: null,
  });
  assert.equal(transactionParticulars(quick('IN', { serviceName: 'Bank Transfer', beneficiaryMode: 'BANK' })).title, 'Cash In · Bank Transfer');
  assert.equal(transactionParticulars(quick('IN', { serviceName: 'EB Bill', beneficiaryMode: 'UPI' })).title, 'Cash In · EB Bill');
});
test('older Cash In entries use recorded mode, not an invented GPay account', () => {
  assert.equal(transactionParticulars(quick('IN', { beneficiaryMode: 'BANK' })).title, 'Cash In · Bank Transfer');
  assert.equal(transactionParticulars(quick('IN', { beneficiaryMode: 'UPI' })).title, 'Cash In · GPay / UPI Transfer');
  assert.equal(transactionParticulars(quick('IN')).title, 'Cash In · Transfer');
});
test('Cash Out distinguishes UPI/QR, AEPS, Micro ATM and displays actual received-in account', () => {
  assert.deepEqual(transactionParticulars(quick('OUT', { sourceAccount: { accountName: 'GPay Account' } })), {
    title: 'Cash Out · UPI / QR Withdrawal', detail: 'Received in GPay Account',
  });
  assert.equal(transactionParticulars(quick('OUT', { cashOutType: 'AEPS' })).title, 'Cash Out · AEPS Withdrawal');
  assert.equal(transactionParticulars(quick('OUT', { cashOutType: 'MICRO_ATM' })).title, 'Cash Out · Micro ATM Withdrawal');
});
test('legacy detailed transfers and internal transfers show their true particulars', () => {
  const detail = transactionParticulars({
    transactionType: 'CASH_TRANSFER',
    cashTransfer: { customerUpiAccount: {}, sourceAccount: { accountName: 'PaySwitch Wallet' } },
  });
  assert.deepEqual(detail, { title: 'Cash In · UPI Transfer', detail: 'Transferred from PaySwitch Wallet' });
  const internal = transactionParticulars({
    transactionType: 'INTERNAL_TRANSFER',
    internalTransfer: { sourceAccount: { accountName: 'PhonePe Wallet' }, destinationAccount: { accountName: 'Shop Cash' } },
  });
  assert.deepEqual(internal, { title: 'Internal Transfer', detail: 'PhonePe Wallet → Shop Cash' });
});
test('service income stays named and unknown transfers do not claim a specific payment channel', () => {
  assert.deepEqual(transactionParticulars({ transactionType: 'SERVICE_INCOME', quickCashTransfer: { purpose: 'SERVICE', direction: 'IN', serviceName: 'Aadhaar Lamination' } }), {
    title: 'Aadhaar Lamination', detail: null,
  });
  assert.deepEqual(transactionParticulars({ transactionType: 'CASH_TRANSFER' }), { title: 'Cash Transfer', detail: null });
});


test('Cash Out row highlighting follows saved transaction direction and withdrawal type', () => {
  assert.equal(isCashOutTransaction(quick('OUT')), true);
  assert.equal(isCashOutTransaction(quick('OUT', {cashOutType:'AEPS'})), true);
  assert.equal(isCashOutTransaction(quick('OUT', {cashOutType:'MICRO_ATM'})), true);
  assert.equal(isCashOutTransaction({transactionType:'AEPS_WITHDRAWAL'}), true);
  assert.equal(isCashOutTransaction({transactionType:'MICRO_ATM'}), true);
  assert.equal(isCashOutTransaction({transactionType:'ATM_WITHDRAWAL'}), true);
  assert.equal(isCashOutTransaction(quick('IN')), false);
  assert.equal(isCashOutTransaction(quick('IN', {beneficiaryMode:'UPI'})), false);
  assert.equal(isCashOutTransaction({
    transactionType:'SERVICE_INCOME', quickCashTransfer:{
      purpose:'SERVICE',direction:'OUT',serviceName:'PAN Card',
    },
  }), false);
  assert.equal(isCashOutTransaction({transactionType:'INTERNAL_TRANSFER'}), false);
  assert.equal(isCashOutTransaction({transactionType:'CASH_TRANSFER'}), false);
  assert.equal(isCashOutTransaction({transactionType:'CUSTOMER_PAYOUT'}), false);
});
