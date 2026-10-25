import { describe, expect, it, vi } from 'vitest';
import { PayableStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PayablesService } from './payables.service.js';

const d = (n: number) => new Prisma.Decimal(n);
function setup(options: { customer?: string; card?: string; alreadyAllocated?: number; remaining?: number; amount?: number } = {}) {
  const payable = {
    id: 'swipe-payable', customerId: 'customer-one', originalAmount: d(24424.02),
    paidAmount: d(0), offsetAmount: d(0),
    remainingAmount: d(options.remaining ?? 24424.02),
    dueAt: new Date('2026-10-23'), status: PayableStatus.OVERDUE,
    sourceTransaction: {
      transactionType: TransactionType.CARD_SWIPE,
      status: TransactionStatus.COMPLETED,
      transactionAt: new Date('2026-10-22T19:02:02.845Z'),
      cardSwipe: { customerCardId: 'card-one' },
    },
  };
  const source = {
    id: 'existing-pay-out', transactionId: 'old-transaction',
    direction: 'PAY_OUT', customerCardId: options.card ?? 'card-one',
    amount: d(options.amount ?? 69367), payableAmount: d(69366.99),
    receivableAmount: d(0.01), advanceAppliedAmount: d(0),
    transaction: {
      id: 'old-transaction', customerId: options.customer ?? 'customer-one',
      transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
      status: TransactionStatus.COMPLETED,
      transactionAt: new Date('2026-10-23T05:26:43.731Z'), // Later than swipe
    },
    allocations: options.alreadyAllocated ? [
      { id: 'existing-match', targetType: 'PAYABLE', payableId: 'another-swipe',
        customerLedgerEntryId: 'existing-pay-out', amount: d(options.alreadyAllocated) },
    ] : [],
  };
  const tx = {
    $queryRawUnsafe: vi.fn(async () => []),
    customerLedgerEntryDetail: { findUnique: vi.fn(async () => source) },
    customerPayable: {
      findUnique: vi.fn(async () => payable),
      update: vi.fn(async ({ data }: any) => {
        payable.paidAmount = d(Number(payable.paidAmount) + Number(data.paidAmount.increment));
        payable.remainingAmount = data.remainingAmount;
        payable.status = data.status;
        return { ...payable };
      }),
    },
    customerLedgerAllocation: {
      create: vi.fn(async ({data}:any) => ({ id: 'new-allocation', ...data })),
      findUnique: vi.fn(async () => source.allocations[0] ?? null),
      findFirst: vi.fn(async () => source.allocations[0] ?? null),
      delete: vi.fn(async () => ({})),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
  const ledger = { post: vi.fn() };
  const service = new PayablesService(prisma as never, ledger as never, {} as never, {} as never, {} as never);
  return { service, ledger, tx, source, payable };
}

describe('matching an already-posted Pay Out to existing swipe payables', () => {
  it('matches ₹24,424.02 even when the Pay Out timestamp is later, without posting a second debit', async () => {
    const f = setup();
    await f.service.matchExistingPayOut('swipe-payable',
      { advanceEntryId: f.source.id, amount: 24424.02 }, 'owner-id');
    expect(f.payable.status).toBe(PayableStatus.PAID);
    expect(Number(f.payable.remainingAmount)).toBe(0);
    expect(Number(f.payable.paidAmount)).toBe(24424.02);
    expect(Number(f.source.receivableAmount)).toBe(0.01);
    expect(f.tx.customerLedgerAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ payableId: f.payable.id, targetType: 'PAYABLE', amount: d(24424.02) }),
    });
    expect(f.ledger.post).not.toHaveBeenCalled();
    expect(f.tx.auditLog.create).toHaveBeenCalledTimes(2);
  });
  it('rejects allocations exceeding the remaining unallocated payout (prevents duplicates)', async () => {
    const f = setup({ alreadyAllocated: 50000 });
    await expect(f.service.matchExistingPayOut('swipe-payable',
      { advanceEntryId: f.source.id, amount: 24424.02 }, 'owner-id')).rejects.toThrow('insufficient unallocated');
    expect(f.tx.customerLedgerAllocation.create).not.toHaveBeenCalled();
  });
  it('rejects matching payouts from another customer', async () => {
    const f = setup({ customer: 'someone-else' });
    await expect(f.service.matchExistingPayOut('swipe-payable',
      { advanceEntryId: f.source.id, amount: 1000 }, 'owner-id')).rejects.toThrow('this customer and card');
  });
  it('rejects matching another card and amounts with sub-paisa precision', async () => {
    const f = setup({ card: 'other-card' });
    await expect(f.service.matchExistingPayOut('swipe-payable',
      { advanceEntryId: f.source.id, amount: 1000 }, 'owner-id')).rejects.toThrow('this customer and card');
    await expect(f.service.matchExistingPayOut('swipe-payable',
      { advanceEntryId: f.source.id, amount: 1000.001 }, 'owner-id')).rejects.toThrow('rupees and paise');
  });
  it('leaves the ₹0.01 residual separately classified, not silently discarded', async () => {
    const f = setup({ remaining: 20518.95, alreadyAllocated: 48848.04 });
    await f.service.matchExistingPayOut('swipe-payable',
      { advanceEntryId: f.source.id, amount: 20518.95 }, 'owner-id');
    expect(f.payable.status).toBe(PayableStatus.PAID);
    expect(f.source.receivableAmount.toString()).toBe('0.01');
    expect(f.ledger.post).not.toHaveBeenCalled();
  });
});
