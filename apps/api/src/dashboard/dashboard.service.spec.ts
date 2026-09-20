import {
  AccountType,
  EntryType,
  TransactionType,
  UsageType,
} from '@prisma/client';
import { DashboardService } from './dashboard.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('DashboardService analytics', () => {
  const from = '2026-09-01T18:30:00.000Z';
  const to = '2026-09-03T18:30:00.000Z';

  function createService() {
    const expenseRows = [
      {
        id: 'expense-business',
        transactionNumber: 'EXP-001',
        transactionAt: new Date('2026-09-02T03:00:00.000Z'),
        grossAmount: 1200,
        status: 'COMPLETED',
        referenceNumber: null,
        notes: null,
        expense: {
          amount: 1200,
          description: 'Diesel',
          expenseType: UsageType.BUSINESS,
          expenseCategory: { id: 'fuel', name: 'Fuel' },
          paymentAccount: {
            id: 'bank-1',
            accountName: 'Business Bank',
            accountType: AccountType.BANK,
          },
        },
      },
      {
        id: 'expense-personal',
        transactionNumber: 'EXP-002',
        transactionAt: new Date('2026-09-02T05:00:00.000Z'),
        grossAmount: 400,
        status: 'COMPLETED',
        referenceNumber: null,
        notes: null,
        expense: {
          amount: 400,
          description: 'Lunch',
          expenseType: UsageType.PERSONAL,
          expenseCategory: { id: 'food', name: 'Food' },
          paymentAccount: {
            id: 'upi-1',
            accountName: 'Personal UPI',
            accountType: AccountType.UPI,
          },
        },
      },
    ];

    const account = {
      id: 'bank-1',
      accountName: 'Business Bank',
      accountType: AccountType.BANK,
      usageType: UsageType.BUSINESS,
    };
    const transaction = {
      id: 'cash-transaction',
      transactionNumber: 'TX-001',
      transactionType: TransactionType.CUSTOMER_RECEIPT,
      status: 'COMPLETED',
      referenceNumber: null,
      customer: { fullName: 'Customer One' },
    };
    const cashFlowEntries = [
      {
        id: 'ledger-in-1',
        entryType: EntryType.DEBIT,
        amount: 3000,
        description: 'Customer receipt',
        ledgerAccount: { financialAccount: account },
        journal: {
          postingDate: new Date('2026-09-02T03:00:00.000Z'),
          transaction,
        },
      },
      {
        id: 'ledger-out-1',
        entryType: EntryType.CREDIT,
        amount: 800,
        description: 'Customer payout',
        ledgerAccount: { financialAccount: account },
        journal: {
          postingDate: new Date('2026-09-02T06:00:00.000Z'),
          transaction: { ...transaction, id: 'cash-transaction-2' },
        },
      },
      {
        id: 'ledger-in-2',
        entryType: EntryType.DEBIT,
        amount: 500,
        description: 'Settlement',
        ledgerAccount: { financialAccount: account },
        journal: {
          postingDate: new Date('2026-09-03T03:00:00.000Z'),
          transaction: { ...transaction, id: 'cash-transaction-3' },
        },
      },
    ];

    const incomeTransaction = {
      id: 'income-transaction',
      transactionNumber: 'TX-INC-001',
      transactionType: TransactionType.CARD_SWIPE,
      status: 'COMPLETED',
      customer: { fullName: 'Customer Two' },
    };
    const incomeEntries = [
      {
        entryType: EntryType.CREDIT,
        amount: 200,
        description: 'Commission income',
        journal: {
          postingDate: new Date('2026-09-02T08:00:00.000Z'),
          transaction: incomeTransaction,
        },
      },
      {
        entryType: EntryType.DEBIT,
        amount: 20,
        description: 'Commission correction',
        journal: {
          postingDate: new Date('2026-09-02T08:00:00.000Z'),
          transaction: incomeTransaction,
        },
      },
    ];

    const transactionFindMany = vi
      .fn()
      .mockResolvedValueOnce(expenseRows)
      .mockResolvedValueOnce([]);
    const ledgerFindMany = vi
      .fn()
      .mockResolvedValueOnce(cashFlowEntries)
      .mockResolvedValueOnce(incomeEntries);
    const prisma = {
      transaction: { findMany: transactionFindMany },
      expenseDetail: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 500 } }),
      },
      ledgerEntry: { findMany: ledgerFindMany },
    } as unknown as PrismaService;

    return new DashboardService(prisma);
  }

  it('reconciles summary totals with the returned drill-down records', async () => {
    const service = createService();
    const result = await service.analytics({ from, to, scope: 'ALL' });

    expect(result.expenses.total).toBe(1600);
    expect(result.expenses.businessTotal).toBe(1200);
    expect(result.expenses.personalTotal).toBe(400);
    expect(result.expenses.previousTotal).toBe(500);
    expect(
      result.expenses.transactions.reduce((sum, row) => sum + row.amount, 0),
    ).toBe(result.expenses.total);

    expect(result.cashFlow.moneyIn).toBe(3500);
    expect(result.cashFlow.moneyOut).toBe(800);
    expect(result.cashFlow.net).toBe(2700);
    expect(result.cashFlow.movements.map((row) => row.id)).toEqual([
      'ledger-in-1',
      'ledger-out-1',
      'ledger-in-2',
    ]);
    expect(
      result.cashFlow.movements
        .filter((row) => row.direction === 'IN')
        .reduce((sum, row) => sum + row.amount, 0),
    ).toBe(result.cashFlow.moneyIn);
    expect(
      result.cashFlow.movements
        .filter((row) => row.direction === 'OUT')
        .reduce((sum, row) => sum + row.amount, 0),
    ).toBe(result.cashFlow.moneyOut);
    expect(result.cashFlow.series).toEqual([
      { date: '2026-09-02', moneyIn: 3000, moneyOut: 800, net: 2200 },
      { date: '2026-09-03', moneyIn: 500, moneyOut: 0, net: 500 },
    ]);

    expect(result.income.total).toBe(180);
    expect(result.income.transactions).toHaveLength(1);
    expect(result.income.transactions[0].amount).toBe(result.income.total);
  });

  it('rejects invalid and unbounded analytics ranges before querying data', async () => {
    const service = createService();

    await expect(
      service.analytics({ from: to, to: from, scope: 'ALL' }),
    ).rejects.toThrow('Invalid dashboard date range');
    await expect(
      service.analytics({
        from: '2025-01-01T00:00:00.000Z',
        to: '2026-09-20T00:00:00.000Z',
        scope: 'ALL',
      }),
    ).rejects.toThrow('limited to 366 days');
    await expect(
      service.analytics({ from, to, scope: 'UNSUPPORTED' }),
    ).rejects.toThrow('Invalid dashboard scope');
  });
});
