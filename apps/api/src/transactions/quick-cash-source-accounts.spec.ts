import { AccountNature, AccountType, CalculationType, EntryType, Prisma, RoleName, TransactionStatus } from '@prisma/client';
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
      findUnique: vi.fn(({ where }: any) => Promise.resolve({ id: where.ledgerCode })),
    },
    transactionCharge: { create: vi.fn().mockResolvedValue({}) },
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
  return { service, tx, validation, ledger, payoutCharges };
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

describe('provider payout charge overrides on pending cash completion', () => {
  it('posts a manual charge of ₹4 on a wallet allocation and deducts it from profit', async () => {
    const { service, tx, ledger, payoutCharges, validation } = setup();
    await service.completeQuickCash('quick-1', {
      beneficiaryMode: 'BANK',
      sourceAllocations: [
        { sourceAccountId: 'wallet-1', amount: 300, payoutChargeAmount: 4, referenceNumber: 'UTR-1' },
        { sourceAccountId: 'bank-1', amount: 200, payoutChargeAmount: 0 },
      ],
    }, 'staff-1', RoleName.STAFF);

    expect(payoutCharges.resolve).not.toHaveBeenCalled();
    expect(tx.transaction.create.mock.calls[0][0].data.grossAmount.toNumber()).toBe(504);
    const entries = ledger.post.mock.calls[0][4];
    const wallet = entries.find((e: any) => e.ledgerAccountId === 'ledger-wallet-1');
    const bank = entries.find((e: any) => e.ledgerAccountId === 'ledger-bank-1');
    const fee = entries.find((e: any) => e.ledgerAccountId === 'SYS-PROVIDER-CHARGE');
    expect([wallet.amount, bank.amount, fee.amount]).toEqual([304, 200, 4]);
    expect(entries.filter((e: any) => e.entryType === EntryType.CREDIT).reduce((n: number, e: any) => n + e.amount, 0))
      .toBe(504);
    expect(entries.filter((e: any) => e.entryType === EntryType.DEBIT).reduce((n: number, e: any) => n + e.amount, 0))
      .toBe(504);
    expect(tx.transactionCharge.create).toHaveBeenCalledTimes(1);
    expect(tx.transactionCharge.create.mock.calls[0][0].data).toMatchObject({
      sourceAccountId: 'wallet-1',
      providerPayoutChargeRuleId: null,
      calculationType: CalculationType.FIXED,
    });
    expect(tx.transactionCharge.create.mock.calls[0][0].data.amount.toNumber()).toBe(4);
    expect(validation.ensureSufficientFunds).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'wallet-1' }), 304);
    expect(tx.auditLog.create.mock.calls[0][0].data.newValues.payoutChargeSources)
      .toEqual([
        { sourceAccountId: 'wallet-1', amount: 4, manualOverride: true, providerPayoutChargeRuleId: null },
        { sourceAccountId: 'bank-1', amount: 0, manualOverride: true, providerPayoutChargeRuleId: null },
      ]);
  });

  it('keeps charges aligned by allocation row even when the same wallet appears twice', async () => {
    const { service, ledger, validation } = setup();
    await service.completeQuickCash('quick-1', {
      beneficiaryMode: 'BANK',
      sourceAllocations: [
        { sourceAccountId: 'wallet-1', amount: 200, payoutChargeAmount: 4 },
        { sourceAccountId: 'wallet-1', amount: 300, payoutChargeAmount: 2 },
      ],
    }, 'staff-1', RoleName.STAFF);

    const entries = ledger.post.mock.calls[0][4];
    expect(entries.filter((e: any) => e.ledgerAccountId === 'ledger-wallet-1').map((e: any) => e.amount))
      .toEqual([204, 302]);
    expect(entries.filter((e: any) => e.ledgerAccountId === 'SYS-PROVIDER-CHARGE').map((e: any) => e.amount))
      .toEqual([4, 2]);
    expect(validation.ensureSufficientFunds).toHaveBeenCalledOnce();
    expect(validation.ensureSufficientFunds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'wallet-1' }), 506);
  });

  it('uses configured charge when omitted, but permits explicit zero to override it', async () => {
    const { service, tx, payoutCharges } = setup();
    payoutCharges.resolve.mockResolvedValue({
      amount: 5, ruleId: 'rule-1', providerId: 'provider-1', calculationType: CalculationType.FIXED, rate: 5,
    });
    await service.completeQuickCash('quick-1', {
      beneficiaryMode: 'BANK',
      sourceAllocations: [{ sourceAccountId: 'wallet-1', amount: 500 }],
    }, 'staff-1', RoleName.STAFF);
    expect(tx.transactionCharge.create.mock.calls[0][0].data.providerPayoutChargeRuleId).toBe('rule-1');
    expect(tx.transactionCharge.create.mock.calls[0][0].data.amount.toNumber()).toBe(5);

    const zero = setup();
    zero.payoutCharges.resolve.mockResolvedValue({
      amount: 5, ruleId: 'rule-1', providerId: 'provider-1', calculationType: CalculationType.FIXED, rate: 5,
    });
    await zero.service.completeQuickCash('quick-1', {
      beneficiaryMode: 'BANK',
      sourceAllocations: [{ sourceAccountId: 'wallet-1', amount: 500, payoutChargeAmount: 0 }],
    }, 'staff-1', RoleName.STAFF);
    expect(zero.payoutCharges.resolve).not.toHaveBeenCalled();
    expect(zero.tx.transactionCharge.create).not.toHaveBeenCalled();
    expect(zero.tx.transaction.create.mock.calls[0][0].data.grossAmount.toNumber()).toBe(500);
  });

  it('supports an editable provider charge for a single-source UPI beneficiary payout', async () => {
    const { service, tx, ledger } = setup();
    const detail = await tx.quickCashTransferDetail.findUnique();
    detail.beneficiaryMode = 'UPI';
    await service.completeQuickCash('quick-1', {
      beneficiaryMode: 'UPI', sourceAccountId: 'wallet-1', payoutChargeAmount: 4,
    }, 'staff-1', RoleName.STAFF);
    expect(tx.transactionCharge.create.mock.calls[0][0].data.amount.toNumber()).toBe(4);
    expect(ledger.post.mock.calls[0][4].find((e: any) => e.ledgerAccountId === 'ledger-wallet-1').amount).toBe(504);
  });
});
