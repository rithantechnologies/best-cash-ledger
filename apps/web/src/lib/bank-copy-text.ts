/** Plain text for sharing a saved bank account (for example in WhatsApp).
 * Include only values that were actually saved; never invent a missing IFSC.
 */
export function formatBankCopyText(bank: {
  bankName: string;
  accountHolderName: string;
  accountReference: string;
  ifsc: string | null;
}): string {
  return [
    ['Bank name', bank.bankName],
    ['Account holder name', bank.accountHolderName],
    ['Account number', bank.accountReference],
    ['IFSC code', bank.ifsc],
  ].filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim())
    .map(([label, value]) => `${label}: ${value.trim()}`)
    .join('\n');
}
