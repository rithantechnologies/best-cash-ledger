import { BadRequestException } from '@nestjs/common';
import { AccountNature, AccountType, CalculationType, EntryType, Prisma, RoleName, TransactionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { TransactionsService } from './transactions.service.js';

const originalAt = new Date('2026-10-24T11:30:00.000Z');

function setup(rule: { id: string; calculationType: CalculationType; value: Prisma.Decimal } | null = {
  id: 'roinet-2026', calculationType: CalculationType.FIXED, value: new Prisma.Decimal(4),
}) {
  const detail = {
    id: 'quick-1', transactionId: 'original-1', direction: 'OUT',
    cashOutType: 'MICRO_ATM', amount: new Prisma.Decimal(2900),
    commissionAmount: new Prisma.Decimal(0), commissionCashAmount: new Prisma.Decimal(0),
    commissionMode: 'CASH', cashAccountId: 'cash-1',
    transaction: {
      status: TransactionStatus.PENDING, createdById: 'staff-1',
      transactionAt: originalAt, transactionNumber: 'QCT-1',
      referenceNumber: null, notes: 'Micro ATM withdrawal',
    },
  };
  const tx: any = {
    quickCashTransferDetail: {
      findUnique: vi.fn().mockResolvedValue(detail),
      update: vi.fn().mockResolvedValue({}),
    },
    financialAccount: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'roinet-wallet', providerId: 'roinet', accountName: 'ROINET SADIQ Wallet',
        accountType: AccountType.PROVIDER_WALLET, accountNature: AccountNature.ASSET,
        isActive: true, ledgerAccount: { id: 'wallet-ledger' },
      }),
    },
    microAtmProviderCommissionRule: { findFirst: vi.fn().mockResolvedValue(rule) },
    transactionCommission: { create: vi.fn().mockResolvedValue({}) },
    ledgerAccount: { findUnique: vi.fn(({ where }: any) => Promise.resolve({ id: where.ledgerCode })) },
    transactionCharge: { create: vi.fn() },
    transaction: {
      create: vi.fn(({ data }: any) => Promise.resolve({ id: 'completion-1', customerId: null, ...data })),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma: any = { $transaction: (fn: (client: any) => Promise<unknown>) => fn(tx) };
  const validation = new FinancialValidationService({} as any);
  vi.spyOn(validation, 'lockAccount').mockResolvedValue(undefined);
  const ledger: any = { post: vi.fn().mockResolvedValue({}) };
  const service = new TransactionsService(prisma, ledger, validation, {} as any, {} as any,
    { resolve: vi.fn().mockResolvedValue(null) } as any);
  return { service, detail, tx, ledger };
}

function verifyBalanced(entries: Array<{ entryType: EntryType; amount: number }>, expected: number) {
  expect(entries.filter(e => e.entryType === EntryType.DEBIT)
    .reduce((sum, e) => sum + e.amount, 0)).toBe(expected);
  expect(entries.filter(e => e.entryType === EntryType.CREDIT)
    .reduce((sum, e) => sum + e.amount, 0)).toBe(expected);
}

describe('Micro ATM pending completion provider earnings', () => {
  it('posts the configured ₹4 provider commission independently from the ₹2,900 cash principal', async () => {
    const { service, tx, ledger } = setup();
    await service.completeQuickCash('quick-1', { sourceAccountId: 'roinet-wallet' }, 'staff-1', RoleName.STAFF);
    expect(tx.microAtmProviderCommissionRule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ providerId: 'roinet', minAmount: { lte: 2900 } }) }),
    );
    const entries = ledger.post.mock.calls[0][4];
    expect(entries.map((e: any) => [e.ledgerAccountId, e.entryType, e.amount])).toEqual([
      ['wallet-ledger', EntryType.DEBIT, 2904],
      ['SYS-CUST-RECEIVABLE', EntryType.CREDIT, 2900],
      ['SYS-COMMISSION', EntryType.CREDIT, 4],
    ]);
    verifyBalanced(entries, 2904);
    expect(tx.transaction.create.mock.calls[0][0].data.transactionAt).toEqual(originalAt);
    expect(ledger.post.mock.calls[0][5]).toEqual(originalAt);
    expect(tx.transactionCommission.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      transactionId: 'original-1', commissionType: 'MICRO_ATM_PROVIDER',
      calculationType: CalculationType.FIXED,
    }) });
    expect(tx.transactionCommission.create.mock.calls[0][0].data.amount.toNumber()).toBe(4);
    expect(tx.auditLog.create.mock.calls[0][0].data.newValues).toMatchObject({
      providerCommissionRuleId: 'roinet-2026', providerCommissionAmount: 4,
      providerCommissionProviderId: 'roinet', providerCommissionManualOverride: false,
    });
  });
  it('supports overriding a missing rule to ₹6.50 and records manual attribution', async () => {
    const { service, tx, ledger } = setup(null);
    await service.completeQuickCash('quick-1', {
      sourceAccountId: 'roinet-wallet', providerCommissionAmount: 6.5,
    }, 'staff-1', RoleName.STAFF);
    verifyBalanced(ledger.post.mock.calls[0][4], 2906.5);
    expect(tx.transactionCommission.create.mock.calls[0][0].data.amount.toNumber()).toBe(6.5);
    expect(tx.auditLog.create.mock.calls[0][0].data.newValues).toMatchObject({
      providerCommissionManualOverride: true, providerCommissionRuleId: null,
    });
  });
  it('respects an explicit zero override even if provider rule suggests ₹4', async () => {
    const { service, tx, ledger } = setup();
    await service.completeQuickCash('quick-1', {
      sourceAccountId: 'roinet-wallet', providerCommissionAmount: 0,
    }, 'staff-1', RoleName.STAFF);
    verifyBalanced(ledger.post.mock.calls[0][4], 2900);
    expect(tx.transactionCommission.create).not.toHaveBeenCalled();
  });
  it('rejects provider commission overrides on non-Micro ATM pending transfers', async () => {
    const { service, detail, tx, ledger } = setup();
    detail.cashOutType = 'UPI_QR';
    await expect(service.completeQuickCash('quick-1', {
      sourceAccountId: 'roinet-wallet', providerCommissionAmount: 4,
    }, 'staff-1', RoleName.STAFF)).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.post).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
