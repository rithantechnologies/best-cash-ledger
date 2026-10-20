/** Human-readable transaction particulars, derived only from persisted data.
 * No amount, direction, account, or ledger entry is changed by this formatter.
 */
type NamedAccount = { accountName: string };
type QuickCash = {
  direction: string;
  purpose: string;
  serviceName?: string | null;
  cashOutType?: string | null;
  beneficiaryMode?: string | null;
  sourceAccount?: NamedAccount | null;
};
export type ParticularsTransaction = {
  transactionType: string;
  quickCashTransfer?: QuickCash | null;
  cashTransfer?: {
    customerUpiAccount?: object | null;
    customerBankAccount?: object | null;
    beneficiaryAccount?: object | null;
    sourceAccount?: NamedAccount | null;
  } | null;
  internalTransfer?: { sourceAccount: NamedAccount; destinationAccount: NamedAccount } | null;
};

const readable = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
const concise = (name: string | null | undefined) => name?.trim() || null;

export function transactionParticulars(tx: ParticularsTransaction): { title: string; detail: string | null } {
  const quick = tx.quickCashTransfer;
  if (quick) {
    if (quick.purpose === 'SERVICE') return {
      title: concise(quick.serviceName) || 'Service Income',
      detail: null,
    };
    if (quick.direction === 'IN') {
      // Custom transfer types (GPay, Bank Transfer, EB bill, etc.) are saved
      // as serviceName. Preserve those exact configured names.
      const kind = concise(quick.serviceName)
        || (quick.beneficiaryMode === 'UPI' ? 'GPay / UPI Transfer'
          : quick.beneficiaryMode === 'BANK' ? 'Bank Transfer' : 'Transfer');
      return { title: 'Cash In · ' + kind, detail: quick.sourceAccount ? 'Transferred from ' + quick.sourceAccount.accountName : null };
    }
    if (quick.direction === 'OUT') {
      const kind = quick.cashOutType === 'AEPS' ? 'AEPS Withdrawal'
        : quick.cashOutType === 'MICRO_ATM' ? 'Micro ATM Withdrawal'
        : 'UPI / QR Withdrawal';
      return { title: 'Cash Out · ' + kind, detail: quick.sourceAccount ? 'Received in ' + quick.sourceAccount.accountName : null };
    }
    return { title: 'Quick Cash Transfer', detail: null };
  }
  if (tx.transactionType === 'CASH_TRANSFER' && tx.cashTransfer) {
    const transfer = tx.cashTransfer;
    const kind = transfer.customerUpiAccount ? 'UPI Transfer'
      : transfer.customerBankAccount ? 'Bank Transfer'
      : transfer.beneficiaryAccount ? 'Beneficiary Transfer' : 'Transfer';
    return { title: 'Cash In · ' + kind, detail: transfer.sourceAccount ? 'Transferred from ' + transfer.sourceAccount.accountName : null };
  }
  if (tx.transactionType === 'INTERNAL_TRANSFER' && tx.internalTransfer) {
    const transfer = tx.internalTransfer;
    return { title: 'Internal Transfer', detail: transfer.sourceAccount.accountName + ' → ' + transfer.destinationAccount.accountName };
  }
  return { title: readable(tx.transactionType), detail: null };
}
