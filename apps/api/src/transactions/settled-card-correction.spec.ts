import { BadRequestException } from '@nestjs/common';
import { Prisma, ProviderSettlementStatus, RoleName, TransactionStatus, TransactionType, PaymentStatus } from '@prisma/client';
import { TransactionsService } from './transactions.service.js';

const postedAt = new Date('2026-10-21T09:19:41.059Z');
const receiptAt = new Date('2026-10-21T09:19:41.082Z');

function fixture(overrides: {
  paidAmount?: number;
  settlementStatus?: ProviderSettlementStatus;
  receivedAmount?: number;
  extraReceipt?: boolean;
  receiptAccountId?: string;
} = {}) {
  const old: any = {
    id: 'swipe-old', transactionNumber: 'CCS-OLD', transactionType: TransactionType.CARD_SWIPE,
    status: TransactionStatus.COMPLETED, customerId: 'customer-1',
    transactionAt: postedAt, referenceNumber: 'REFERENCE', notes: 'Original swipe',
    journal: { id: 'journal-old', status: 'POSTED', entries: [] },
    cardSwipe: {
      swipeAmount: new Prisma.Decimal(40000), customerCardId: 'card-1',
      providerId: 'provider-1', gatewayId: 'gateway-1',
      providerChargeRate: new Prisma.Decimal(1.8), commissionRate: new Prisma.Decimal(3),
      paymentTermId: 'term-1', dueAt: new Date('2026-10-25T10:00:00Z'),
      settlementAccountId: 'wallet-1',
    },
    payable: { paidAmount: new Prisma.Decimal(overrides.paidAmount ?? 0), offsetAmount: new Prisma.Decimal(0) },
    providerSettlementSource: {
      status: overrides.settlementStatus ?? ProviderSettlementStatus.SETTLED,
      receivedAmount: new Prisma.Decimal(overrides.receivedAmount ?? 39280),
      expectedAmount: new Prisma.Decimal(39280),
      dueAt: null,
      receipts: [
        { id: 'receipt-old', transactionId: 'pst-old', amount: new Prisma.Decimal(39280),
          status: PaymentStatus.COMPLETED, destinationAccountId: overrides.receiptAccountId ?? 'wallet-1',
          receivedAt: receiptAt, referenceNumber: 'PG-REF', notes: 'Provider credited',
          transaction: { id: 'pst-old', status: TransactionStatus.COMPLETED, transactionNumber: 'PST-OLD' } },
        ...(overrides.extraReceipt ? [{
          id: 'receipt-extra', transactionId: 'pst-extra',
          amount: new Prisma.Decimal(1), status: PaymentStatus.COMPLETED, destinationAccountId: 'wallet-1',
          receivedAt: receiptAt, referenceNumber: null, notes: null,
          transaction: { id: 'pst-extra', status: TransactionStatus.COMPLETED, transactionNumber: 'PST-EXTRA' },
        }] : []),
      ],
    },
  };
  const tx: any = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    transaction: {
      findUnique: vi.fn().mockResolvedValue(old),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    ledgerJournal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    providerSettlementReceipt: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    expenseDetail: { findUnique: vi.fn().mockResolvedValue(null) },
    transaction: { findUnique: vi.fn().mockResolvedValue(old) },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(tx)),
  };
  const service = new TransactionsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any);
  const reverse = vi.spyOn(service, 'reverse').mockResolvedValue({} as any);
  const create = vi.spyOn(service, 'createCardSwipe').mockResolvedValue({
    transaction: {
      id: 'swipe-new', transactionNumber: 'CCS-NEW', transactionType: TransactionType.CARD_SWIPE,
    },
    settlementReceipt: {
      transaction: { id: 'pst-new' },
      receipt: { id: 'receipt-new', amount: new Prisma.Decimal(49100) },
    },
  } as any);
  return { service, tx, prisma, reverse, create, old };
}
const correction = {
  correctedAmount: 50000, reason: 'Original amount entered incorrectly',
  confirmProviderSettlementAdjustment: true,
};

describe('atomic settled-card amount correction', () => {
  it('reverses the linked receipt and swipe inside the SAME transaction, then recreates recalculated settlement and audit', async () => {
    const { service, tx, prisma, reverse, create } = fixture();
    const result = await service.correctAmount('swipe-old', correction, 'owner-1', RoleName.OWNER);
    expect(result).toMatchObject({ originalId: 'swipe-old', correctedTransactionId: 'swipe-new', inPlace: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reverse).toHaveBeenCalledTimes(2);
    expect(reverse.mock.calls.map(args => args[0])).toEqual(['pst-old', 'swipe-old']);
    expect(reverse.mock.calls[0][3]).toBe(tx);
    expect(reverse.mock.calls[1][3]).toBe(tx);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      swipeAmount: 50000, providerChargeRate: 1.8, commissionRate: 3,
      customerId: 'customer-1', customerCardId: 'card-1', settledNow: true,

    }), 'owner-1', RoleName.OWNER, expect.stringContaining('CORRECTION:'), tx);
    expect(tx.transaction.update).toHaveBeenCalledWith({
      where: { id: 'swipe-new' },
      data: expect.objectContaining({ correctionSourceTransactionId: 'swipe-old', transactionAt: postedAt }),
    });
    expect(tx.transaction.update).toHaveBeenCalledWith({
      where: { id: 'pst-new' },
      data: expect.objectContaining({ transactionAt: receiptAt, referenceNumber: 'PG-REF' }),
    });
    expect(tx.providerSettlementReceipt.update).toHaveBeenCalledWith({
      where: { id: 'receipt-new' },
      data: expect.objectContaining({ receivedAt: receiptAt, referenceNumber: 'PG-REF' }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CORRECT_AMOUNT',
        newValues: expect.objectContaining({ amount: 50000, providerReceiptAmount: '49100' }),
      }),
    });
  });

  it('requires explicit approval before changing an already received settlement', async () => {
    const { service, prisma, reverse } = fixture();
    await expect(service.correctAmount('swipe-old', {
      ...correction, confirmProviderSettlementAdjustment: false,
    }, 'owner-1', RoleName.OWNER)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
  });

  it.each([
    [{ paidAmount: 100 }, 'payout'],
    [{ settlementStatus: ProviderSettlementStatus.PARTIALLY_SETTLED }, 'partial'],
    [{ receivedAmount: 1000 }, 'partial'],
    [{ extraReceipt: true }, 'multiple'],
    [{ receiptAccountId: 'different-bank' }, 'different destination'],
  ] as const)('rejects %s (%s) before any reversal', async (options) => {
    const { service, reverse, create } = fixture(options);
    await expect(service.correctAmount('swipe-old', correction, 'owner-1', RoleName.OWNER))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(reverse).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('lets Owner delete a fully settled unpaid swipe and its linked receipt atomically for re-entry', async () => {
    const { service, tx, prisma, reverse, create } = fixture();
    const result = await service.deleteTransaction('swipe-old', {
      reason: 'Entered incorrect customer card swipe amount',
    }, 'owner-1');
    expect(result).toEqual({ originalId: 'swipe-old', deleted: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reverse.mock.calls.map(args => args[0])).toEqual(['pst-old', 'swipe-old']);
    expect(reverse.mock.calls[0][3]).toBe(tx);
    expect(reverse.mock.calls[1][3]).toBe(tx);
    expect(create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'DELETE_LINKED_SETTLED_SWIPE' }),
    });
  });

  it.each([
    [{ paidAmount: 100 }, 'customer payment'],
    [{ extraReceipt: true }, 'multiple provider receipts'],
  ] as const)('refuses deletion of a settled card with %s (%s)', async (options) => {
    const { service, reverse, tx } = fixture(options);
    await expect(service.deleteTransaction('swipe-old', {
      reason: 'Wrong amount requires reentry',
    }, 'owner-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(reverse).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates a failed replacement inside the single transaction rather than leaving a successful correction', async () => {
    const { service, tx, create, prisma } = fixture();
    create.mockRejectedValueOnce(new Error('Unable to create corrected swipe'));
    await expect(service.correctAmount('swipe-old', correction, 'owner-1', RoleName.OWNER))
      .rejects.toThrow('Unable to create corrected swipe');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
