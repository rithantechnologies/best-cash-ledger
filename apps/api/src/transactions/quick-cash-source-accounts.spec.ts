import { AccountNature, AccountType, EntryType, Prisma, RoleName, TransactionStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { TransactionsService } from './transactions.service.js';

const transactionAt = new Date('2026-10-19T09:00:00.000Z');

function setup(types: Record<string, AccountType> = {
  'bank-1': AccountType.BANK,
  'wallet-1': AccountType.PROVIDER_WALLET,
  'upi-1': AccountType.UPI,
}) {
  const detail: any = {
    id: 'quick-1',
    transactionId: 'original-1',
    direction: 'IN',
    beneficiaryMode: 'BANK',
    amount: new Prisma.Decimal(500),
    commissionAmount: new Prisma.Decimal(0),
    commissionMode: 'CASH',
    commissionCashAmount: new Prisma.Decimal(0),
    cashAccountId: 'cash-1',
    transaction: {
      status: TransactionStatus.PENDING,
      createdById: 'staff-1',
      transactionAt,
      transactionNumber: 'QC-1',
      referenceNumber: null,
      notes: null,
    },
  };
  const tx: any = {
    financialAccount: {
      findUnique: vi.fn(({ where }: any) => {
        const type = types[where.id];
        if (!type) return Promise.resolve(null);
        return Promise.resolve({
          id: where.id, accountName: where.id, accountType: type,
          accountNature: type === AccountType.OWNER_CREDIT_CARD
            ? AccountNature.LIABILITY : AccountNature.ASSET,
          isActive: true, ledgerAccount: { id: 'ledger-' + where.id },
        });
      }),
    },
    quickCashTransferDetail: {
      findUnique: vi.fn().mockResolvedValue(detail),
      update: vi.fn().mockResolvedValue({}),
    },
    ledgerAccount: {
      findUnique: vi.fn().mockResolvedValue({ id: 'SYS-CUST-PAYABLE' }),
    },
    transaction: {
      create: vi.fn(({ data }: any) => Promise.resolve({
        id: 'completion-1', customerId: null, ...data,
      })),
      update: vi.fn().mockResolvedValue({}),
    },
    quickCashSourceAllocation: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma: any = { $transaction: (fn: (client: any) => Promise<unknown>) => fn(tx) };
  const validation = new FinancialValidationService({} as any);
  vi.spyOn(validation, 'lockAccount').mockResolvedValue(undefined);
  vi.spyOn(validation, 'ensureSufficientFunds').mockResolvedValue(undefined);
  const ledger: any = { post: vi.fn().mockResolvedValue({}) };
  const payoutCharges: any = { resolve: vi.fn().mockResolvedValue(null) };
  const service = new TransactionsService(
    prisma, ledger, validation, {} as any, {} as any, payoutCharges,
  );
  return { service, tx, validation, ledger };
}

describe('complete pending cash-in with bank or wallet transfer sources', () => {
  it('accepts mixed bank, wallet and UPI payouts and posts a balanced journal on the original date', async () => {
    const { service, tx, ledger, validation } = setup();
    const result = await service.completeQuickCash('quick-1', {
      beneficiaryMode: 'BANK',
      sourceAllocations: [
        { sourceAccountId: 'bank-1', amount: 200, referenceNumber: 'BANK-UTR' },
        { sourceAccountId: 'wallet-1', amount: 200, referenceNumber: 'WALLET-UTR' },
        { sourceAccountId: 'upi-1', amount: 100 },
      ],
    }, 'staff-1', RoleName.STAFF);

    expect(result.status).toBe(TransactionStatus.COMPLETED);
    expect(tx.transaction.create.mock.calls[0][0].data.transactionAt).toEqual(transactionAt);
    const entries = ledger.post.mock.calls[0][4];
    const debit = entries.filter((x: any) => x.entryType === EntryType.DEBIT)
      .reduce((sum: number, x: any) => sum + x.amount, 0);
    const credit = entries.filter((x: any) => x.entryType === EntryType.CREDIT)
      .reduce((sum: number, x: any) => sum + x.amount, 0);
    expect([debit, credit]).toEqual([500, 500]);
    expect(entries.map((x: any) => x.ledgerAccountId)).toEqual([
      'SYS-CUST-PAYABLE', 'ledger-bank-1', 'ledger-wallet-1', 'ledger-upi-1',
    ]);
    expect(tx.quickCashSourceAllocation.createMany.mock.calls[0][0].data).toHaveLength(3);
    expect(validation.ensureSufficientFunds).toHaveBeenCalledTimes(3);
  });

  it.each([AccountType.CASH, AccountType.OWNER_CREDIT_CARD])(
    'rejects %s as a beneficiary transfer source',
    async (type) => {
      const { service, tx, ledger } = setup({ 'invalid-1': type });
      await expect(service.completeQuickCash('quick-1', {
        beneficiaryMode: 'BANK',
        sourceAllocations: [{ sourceAccountId: 'invalid-1', amount: 500 }],
      }, 'staff-1', RoleName.STAFF)).rejects.toBeInstanceOf(BadRequestException);
      expect(ledger.post).not.toHaveBeenCalled();
      expect(tx.transaction.create).not.toHaveBeenCalled();
    },
  );
});
