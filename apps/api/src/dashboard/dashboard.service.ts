import { Injectable } from '@nestjs/common';
import { AccountNature, AccountType, EntryType, PayableStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type AccountBalance = {
  id: string;
  accountName: string;
  accountType: AccountType;
  accountNature: AccountNature;
  currentBalance: number;
  creditLimit: number | null;
  availableCredit: number | null;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private indiaDayRange(date = new Date()) {
    const offset = 330 * 60 * 1000;
    const local = new Date(date.getTime() + offset);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    return {
      start: new Date(Date.UTC(y, m, d) - offset),
      end: new Date(Date.UTC(y, m, d + 1) - offset),
    };
  }
  private async getAccountBalances(): Promise<AccountBalance[]> {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { isActive: true },
      include: { ledgerAccount: true },
      orderBy: { accountName: 'asc' },
    });

    const ledgerIds = accounts
      .map((a) => a.ledgerAccount?.id)
      .filter((id): id is string => Boolean(id));

    const grouped = ledgerIds.length
      ? await this.prisma.ledgerEntry.groupBy({
          by: ['ledgerAccountId', 'entryType'],
          where: { ledgerAccountId: { in: ledgerIds } },
          _sum: { amount: true },
        })
      : [];

    const movement = new Map<string, { debit: number; credit: number }>();
    for (const row of grouped) {
      const item = movement.get(row.ledgerAccountId) ?? { debit: 0, credit: 0 };
      const amount = Number(row._sum.amount ?? 0);
      if (row.entryType === EntryType.DEBIT) item.debit += amount;
      else item.credit += amount;
      movement.set(row.ledgerAccountId, item);
    }
    return accounts.map((account) => {
      const m = account.ledgerAccount
        ? movement.get(account.ledgerAccount.id) ?? { debit: 0, credit: 0 }
        : { debit: 0, credit: 0 };
      const opening = Number(account.openingBalance);
      const currentBalance =
        account.accountNature === AccountNature.ASSET
          ? opening + m.debit - m.credit
          : opening + m.credit - m.debit;

      return {
        id: account.id,
        accountName: account.accountName,
        accountType: account.accountType,
        accountNature: account.accountNature,
        currentBalance,
        creditLimit: account.creditLimit ? Number(account.creditLimit) : null,
        availableCredit:
          account.accountType === AccountType.OWNER_CREDIT_CARD && account.creditLimit
            ? Number(account.creditLimit) - currentBalance
            : null,
      };
    });
  }

  async summary() {
    const balances = await this.getAccountBalances();
    const sumType = (type: AccountType) =>
      balances
        .filter((a) => a.accountType === type)
        .reduce((sum, a) => sum + a.currentBalance, 0);

    const { start: todayStart, end: todayEnd } = this.indiaDayRange();
    const openStatuses = [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID, PayableStatus.OVERDUE];

    const [openPayable, pending, partial, overdue, dueToday] = await Promise.all([
      this.prisma.customerPayable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: { in: openStatuses } },
        _sum: { remainingAmount: true },
      }),
      this.prisma.customerPayable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: PayableStatus.PENDING },
        _sum: { remainingAmount: true },
        _count: true,
      }),
      this.prisma.customerPayable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: PayableStatus.PARTIALLY_PAID },
        _sum: { remainingAmount: true },
        _count: true,
      }),
      this.prisma.customerPayable.aggregate({
        where: {
          remainingAmount: { gt: 0 },
          OR: [
            { status: PayableStatus.OVERDUE },
            { dueAt: { lt: todayStart }, status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] } },
          ],
        },
        _sum: { remainingAmount: true },
        _count: true,
      }),
      this.prisma.customerPayable.aggregate({
        where: {
          remainingAmount: { gt: 0 },
          dueAt: { gte: todayStart, lt: todayEnd },
          status: { in: openStatuses },
        },
        _sum: { remainingAmount: true },
        _count: true,
      }),
    ]);

    return {
      cashBalance: sumType(AccountType.CASH),
      bankBalance: sumType(AccountType.BANK),
      upiBalance: sumType(AccountType.UPI),
      walletBalance: sumType(AccountType.PROVIDER_WALLET),
      customerPayable: Number(openPayable._sum.remainingAmount ?? 0),
      payableBreakdown: {
        pendingAmount: Number(pending._sum.remainingAmount ?? 0),
        pendingCount: pending._count,
        partialAmount: Number(partial._sum.remainingAmount ?? 0),
        partialCount: partial._count,
        dueTodayAmount: Number(dueToday._sum.remainingAmount ?? 0),
        dueTodayCount: dueToday._count,
        overdueAmount: Number(overdue._sum.remainingAmount ?? 0),
        overdueCount: overdue._count,
      },
      creditCardOutstanding: sumType(AccountType.OWNER_CREDIT_CARD),
      creditCardAvailable: balances
        .filter((a) => a.accountType === AccountType.OWNER_CREDIT_CARD)
        .reduce((sum, a) => sum + (a.availableCredit ?? 0), 0),
    };
  }

  accounts() {
    return this.getAccountBalances();
  }
  async today() {
    const { start, end } = this.indiaDayRange();
    const range = { gte: start, lt: end };

    const txSum = async (type: TransactionType) => {
      const result = await this.prisma.transaction.aggregate({
        where: { transactionType: type, transactionAt: range, status: { not: 'REVERSED' } },
        _sum: { grossAmount: true },
      });
      return Number(result._sum.grossAmount ?? 0);
    };

    const [cardSwipe, aeps, customerPayout, businessExpense, personalExpense] =
      await Promise.all([
        txSum(TransactionType.CARD_SWIPE),
        txSum(TransactionType.AEPS_WITHDRAWAL),
        txSum(TransactionType.CUSTOMER_PAYOUT),
        txSum(TransactionType.BUSINESS_EXPENSE),
        txSum(TransactionType.PERSONAL_EXPENSE),
      ]);

    const commissions = await this.prisma.transactionCommission.aggregate({
      where: { transaction: { transactionAt: range, status: { not: 'REVERSED' } } },
      _sum: { amount: true },
    });
    const charges = await this.prisma.transactionCharge.aggregate({
      where: { transaction: { transactionAt: range, status: { not: 'REVERSED' } } },
      _sum: { amount: true },
    });
    const movementByTypes = async (types: AccountType[], entryType: EntryType) => {
      const ledgers = await this.prisma.ledgerAccount.findMany({
        where: { financialAccount: { accountType: { in: types } } },
        select: { id: true },
      });
      const ids = ledgers.map((item) => item.id);
      if (!ids.length) return 0;

      const result = await this.prisma.ledgerEntry.aggregate({
        where: {
          ledgerAccountId: { in: ids },
          entryType,
          journal: { postingDate: range, status: 'POSTED' },
        },
        _sum: { amount: true },
      });
      return Number(result._sum.amount ?? 0);
    };

    const [cashIn, cashOut, bankIn, bankOut, walletIn, walletOut, upiIn, upiOut] =
      await Promise.all([
        movementByTypes([AccountType.CASH], EntryType.DEBIT),
        movementByTypes([AccountType.CASH], EntryType.CREDIT),
        movementByTypes([AccountType.BANK], EntryType.DEBIT),
        movementByTypes([AccountType.BANK], EntryType.CREDIT),
        movementByTypes([AccountType.PROVIDER_WALLET], EntryType.DEBIT),
        movementByTypes([AccountType.PROVIDER_WALLET], EntryType.CREDIT),
        movementByTypes([AccountType.UPI], EntryType.DEBIT),
        movementByTypes([AccountType.UPI], EntryType.CREDIT),
      ]);

    return {
      cashIn,
      cashOut,
      bankIn,
      bankOut,
      walletIn,
      walletOut,
      upiIn,
      upiOut,
      cardSwipe,
      aeps,
      customerPayout,
      commission: Number(commissions._sum.amount ?? 0),
      providerCharges: Number(charges._sum.amount ?? 0),
      businessExpense,
      personalExpense,
    };
  }
  async payables() {
    const now = new Date();
    return this.prisma.customerPayable.findMany({
      where: {
        remainingAmount: { gt: 0 },
        status: { notIn: ['PAID', 'CANCELLED', 'REVERSED'] },
      },
      include: { customer: true, paymentTerm: true },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    }).then((items) =>
      items.map((item) => ({
        ...item,
        bucket:
          item.dueAt < now
            ? 'OVERDUE'
            : item.status === 'PARTIALLY_PAID'
              ? 'PARTIAL'
              : 'UPCOMING',
      })),
    );
  }

  async recentTransactions(limit = 10) {
    return this.prisma.transaction.findMany({
      include: { customer: true, charges: true, commissions: true },
      orderBy: { transactionAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
  }
  private dateKey(date: Date) {
    const offset = 330 * 60 * 1000;
    const local = new Date(date.getTime() + offset);
    return [
      local.getUTCFullYear(),
      String(local.getUTCMonth() + 1).padStart(2, '0'),
      String(local.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  async lastTenDays(type = 'TOTAL') {
    const today = this.indiaDayRange();
    const dayMs = 24 * 60 * 60 * 1000;
    const start = new Date(today.start.getTime() - 9 * dayMs);
    const end = today.end;

    if (type === 'CUSTOMER_PAYABLE') {
      return this.payableTenDaySeries(start, end);
    }

    const typeMap: Record<string, AccountType[]> = {
      CASH: [AccountType.CASH],
      BANK: [AccountType.BANK],
      UPI: [AccountType.UPI],
      WALLET: [AccountType.PROVIDER_WALLET],
      TOTAL: [
        AccountType.CASH,
        AccountType.BANK,
        AccountType.UPI,
        AccountType.PROVIDER_WALLET,
      ],
    };
    const accountTypes = typeMap[type] ?? typeMap.TOTAL;
    const accounts = await this.prisma.financialAccount.findMany({
      where: { accountType: { in: accountTypes }, isActive: true },
      include: { ledgerAccount: true },
    });
    const ledgerIds = accounts
      .map((a) => a.ledgerAccount?.id)
      .filter((id): id is string => Boolean(id));

    let opening = accounts.reduce(
      (sum, account) => sum + Number(account.openingBalance),
      0,
    );

    if (ledgerIds.length) {
      const prior = await this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: { in: ledgerIds },
          journal: { postingDate: { lt: start }, status: 'POSTED' },
        },
        select: { entryType: true, amount: true },
      });
      for (const entry of prior) {
        opening += entry.entryType === EntryType.DEBIT
          ? Number(entry.amount)
          : -Number(entry.amount);
      }
    }

    const movements = ledgerIds.length
      ? await this.prisma.ledgerEntry.findMany({
          where: {
            ledgerAccountId: { in: ledgerIds },
            journal: { postingDate: { gte: start, lt: end }, status: 'POSTED' },
          },
          select: {
            entryType: true,
            amount: true,
            journal: { select: { postingDate: true } },
          },
        })
      : [];
    const daily = new Map<string, { moneyIn: number; moneyOut: number }>();
    for (const entry of movements) {
      const key = this.dateKey(entry.journal.postingDate);
      const row = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      if (entry.entryType === EntryType.DEBIT) row.moneyIn += Number(entry.amount);
      else row.moneyOut += Number(entry.amount);
      daily.set(key, row);
    }

    const rows = [];
    let running = opening;
    for (let i = 0; i < 10; i += 1) {
      const date = new Date(start.getTime() + i * dayMs);
      const key = this.dateKey(date);
      const movement = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      const rowOpening = running;
      running = rowOpening + movement.moneyIn - movement.moneyOut;
      rows.push({
        date: key,
        opening: rowOpening,
        moneyIn: movement.moneyIn,
        moneyOut: movement.moneyOut,
        closing: running,
      });
    }
    return rows;
  }
  private async payableTenDaySeries(start: Date, end: Date) {
    const dayMs = 24 * 60 * 60 * 1000;
    const payableLedger = await this.prisma.ledgerAccount.findUnique({
      where: { ledgerCode: 'SYS-CUST-PAYABLE' },
      select: { id: true },
    });

    if (!payableLedger) {
      throw new Error('Customer payable ledger missing');
    }

    const [priorEntries, entries] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: payableLedger.id,
          journal: { postingDate: { lt: start }, status: 'POSTED' },
        },
        select: { entryType: true, amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: payableLedger.id,
          journal: { postingDate: { gte: start, lt: end }, status: 'POSTED' },
        },
        select: {
          entryType: true,
          amount: true,
          journal: { select: { postingDate: true } },
        },
      }),
    ]);

    let opening = 0;
    for (const entry of priorEntries) {
      opening += entry.entryType === EntryType.CREDIT
        ? Number(entry.amount)
        : -Number(entry.amount);
    }

    const daily = new Map<string, { moneyIn: number; moneyOut: number }>();
    for (const entry of entries) {
      const key = this.dateKey(entry.journal.postingDate);
      const row = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      if (entry.entryType === EntryType.CREDIT) row.moneyIn += Number(entry.amount);
      else row.moneyOut += Number(entry.amount);
      daily.set(key, row);
    }

    const rows = [];
    for (let i = 0; i < 10; i += 1) {
      const date = new Date(start.getTime() + i * dayMs);
      const key = this.dateKey(date);
      const movement = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      const rowOpening = opening;
      opening = rowOpening + movement.moneyIn - movement.moneyOut;
      rows.push({
        date: key,
        opening: rowOpening,
        moneyIn: movement.moneyIn,
        moneyOut: movement.moneyOut,
        closing: opening,
      });
    }
    return rows;
  }
}
