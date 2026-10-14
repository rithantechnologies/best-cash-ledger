import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatBankCopyText } from './bank-copy-text.ts';

test('top copy button uses all four bank detail fields on separate lines', () => {
  assert.equal(formatBankCopyText({
    bankName: 'Tamilnad Mercantile Bank',
    accountHolderName: 'Example Customer',
    accountReference: '198100050313563',
    ifsc: 'TMBL0000075',
  }), 'Bank name: Tamilnad Mercantile Bank\nAccount holder name: Example Customer\nAccount number: 198100050313563\nIFSC code: TMBL0000075');
});

test('no unsaved values are invented in the copied text', () => {
  assert.equal(formatBankCopyText({
    bankName: 'Bank', accountHolderName: 'A', accountReference: '00001234', ifsc: null,
  }), 'Bank name: Bank\nAccount holder name: A\nAccount number: 00001234');
});

test('preserves leading zeros in account numbers and trims pasted input spaces', () => {
  assert.match(formatBankCopyText({
    bankName: ' Bank ', accountHolderName: ' Name ', accountReference: ' 00001234 ', ifsc: ' TEST01234 ',
  }), /Account number: 00001234\nIFSC code: TEST01234$/);
});
