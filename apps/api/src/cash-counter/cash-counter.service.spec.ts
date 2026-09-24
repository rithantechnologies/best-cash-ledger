import { EntryType, TransactionType } from '@prisma/client';
import { CashCounterService } from './cash-counter.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('CashCounterService cash activity', () => {
  const session = {
    cashAccountId: 'cash-1',
    openedById: 'user-1',
    openedAt: new Date('2026-09-23T02:00:00.000Z'),
    openingTotal: 36550,
    closedAt: null,
    adjustmentTransactionId: null,
  };

  function createService(options: {
    entries?: any[];
    payoutLinks?: any[];
    commissionTransactions?: any[];
    quickCashDetails?: any[];
  } = {}) {
    const prisma = {
      financialAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cash-1',
          ledgerAccount: { id: 'ledger-cash-1' },
        }),
      },
      ledgerEntry: {
        findMany: vi.fn().mockResolvedValue(options.entries ?? []),
      },
      payablePayment: {
        findMany: vi.fn().mockResolvedValue(options.payoutLinks ?? []),
      },
      transaction: {
        findMany: vi.fn().mockResolvedValue(options.commissionTransactions ?? []),
      },
      quickCashTransferDetail: {
        findMany: vi.fn().mockResolvedValue(options.quickCashDetails ?? []),
      },
    } as unknown as PrismaService;

    return {
      prisma,
      service: new CashCounterService(prisma, {} as any, {} as any),
    };
  }

  it('does not turn a commission-only card swipe into Daily Cash activity', async () => {
    const { prisma, service } = createService({
      commissionTransactions: [
        { commissions: [{ amount: 880 }] },
      ],
    });

    const result = await (service as any).expectedClosing(prisma, session);

    expect(result.expected).toBe(36550);
    expect(result.totalIn).toBe(0);
    expect(result.totalOut).toBe(0);
    expect(result.movements).toEqual([]);
    expect(result.activities).toEqual([]);
    expect(result.serviceSummary).toEqual([]);
    expect(result.commissionEarned).toBe(0);
  });

  it('keeps a card swipe in Daily Cash when its customer payout used the drawer', async () => {
    const payoutTransaction = {
      id: 'payout-1',
      transactionNumber: 'PAY-001',
      transactionType: TransactionType.CUSTOMER_PAYOUT,
      transactionAt: new Date('2026-09-23T04:00:00.000Z'),
      grossAmount: 39120,
      netAmount: 39120,
      notes: 'Recorded with CCS-001',
      customer: { id: 'customer-1', fullName: 'Customer One' },
      commissions: [],
      charges: [],
    };
    const swipeTransaction = {
      id: 'swipe-1',
      transactionNumber: 'CCS-001',
      transactionType: TransactionType.CARD_SWIPE,
      transactionAt: new Date('2026-09-23T03:59:00.000Z'),
      grossAmount: 40000,
      netAmount: 39120,
      notes: null,
      customer: { id: 'customer-1', fullName: 'Customer One' },
      commissions: [{ amount: 880 }],
      charges: [{ amount: 720, chargeType: 'PROVIDER' }],
    };
    const { prisma, service } = createService({
      entries: [
        {
          id: 'entry-1',
          amount: 39120,
          entryType: EntryType.CREDIT,
          description: 'Customer payout',
          journal: { transaction: payoutTransaction },
        },
      ],
      payoutLinks: [
        {
          transactionId: 'payout-1',
          payable: { sourceTransaction: swipeTransaction },
        },
      ],
      commissionTransactions: [
        { commissions: [{ amount: 880 }] },
      ],
    });

    const result = await (service as any).expectedClosing(prisma, session);

    expect(result.totalIn).toBe(0);
    expect(result.totalOut).toBe(39120);
    expect(result.expected).toBe(-2570);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      transactionId: 'swipe-1',
      transactionNumber: 'CCS-001',
      serviceType: TransactionType.CARD_SWIPE,
      transactionAmount: 40000,
      cashIn: 0,
      cashOut: 39120,
      commissionAmount: 880,
      incomeAmount: 0,
      providerFeeAmount: 720,
      profitAmount: 160,
      runningBalance: -2570,
    });
    expect(result.commissionEarned).toBe(0);
  });

  it('preserves the original quick-cash direction when cash commission creates an opposite drawer movement', async () => {
    const quickCashTransaction = {
      id: 'quick-out-1',
      transactionNumber: 'QCT-OUT-001',
      transactionType: TransactionType.CASH_TRANSFER,
      transactionAt: new Date('2026-09-23T05:00:00.000Z'),
      grossAmount: 1010,
      netAmount: 1000,
      notes: 'Gpay',
      customer: null,
      commissions: [{ amount: 10 }],
      charges: [],
    };
    const { prisma, service } = createService({
      entries: [
        {
          id: 'entry-out',
          amount: 1000,
          entryType: EntryType.CREDIT,
          description: 'Quick cash paid out',
          journal: { transaction: quickCashTransaction },
        },
        {
          id: 'entry-commission',
          amount: 10,
          entryType: EntryType.DEBIT,
          description: 'Cash commission received',
          journal: { transaction: quickCashTransaction },
        },
      ],
      quickCashDetails: [
        { transactionId: 'quick-out-1', direction: 'OUT', purpose: 'TRANSFER' },
      ],
      commissionTransactions: [{ commissions: [{ amount: 10 }] }],
    });

    const result = await (service as any).expectedClosing(prisma, session);

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      transactionNumber: 'QCT-OUT-001',
      cashIn: 10,
      cashOut: 1000,
      commissionAmount: 10,
      quickCashDirection: 'OUT',
      quickCashPurpose: 'TRANSFER',
    });
  });

});
