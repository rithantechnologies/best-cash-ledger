import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AccountNature,
  AccountType,
  EntryType,
  LedgerType,
  PayableStatus,
  PaymentStatus,
  Prisma,
  ReceivableStatus,
  RoleName,
  TransactionType,
  UsageType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type AccountBalance = {
  id: string;
  accountName: string;
  accountType: AccountType;
  accountNature: AccountNature;
  usageType: string;
  currentBalance: number;
  creditLimit: number | null;
  availableCredit: number | null;
  isActive: boolean;
  bankName: string | null;
  accountReference: string | null;
  lastFourDigits: string | null;
  providerId: string | null;
};

type AnalyticsScope = 'ALL' | 'BUSINESS' | 'PERSONAL';

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
  private async getAccountBalances(role?: RoleName, userId?: string): Promise<AccountBalance[]> {
    const accounts = await this.prisma.financialAccount.findMany({
      include: { ledgerAccount: true },
      orderBy: { accountName: 'asc' },
    });

    const ledgerIds = accounts
      .map((a) => a.ledgerAccount?.id)
      .filter((id): id is string => Boolean(id));

    const grouped = ledgerIds.length
      ? await this.prisma.ledgerEntry.groupBy({
          by: ['ledgerAccountId', 'entryType'],
          where: {
            ledgerAccountId: { in: ledgerIds },
            journal: { status: 'POSTED' },
          },
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

    const openCashSessions = await this.prisma.cashSession.findMany({
      where: {
        status: 'OPEN',
        ...(role === RoleName.STAFF && userId ? { openedById: userId } : {}),
      },
      include: {
        cashAccount: { include: { ledgerAccount: true } },
      },
    });
    const liveCashBalance = new Map<string, number>();
    for (const session of openCashSessions) {
      const ledgerId = session.cashAccount.ledgerAccount?.id;
      if (!ledgerId) continue;
      const rows = await this.prisma.ledgerEntry.groupBy({
        by: ['entryType'],
        where: {
          ledgerAccountId: ledgerId,
          journal: {
            postingDate: { gte: session.openedAt },
            status: 'POSTED',
            ...(session.adjustmentTransactionId
              ? { transactionId: { not: session.adjustmentTransactionId } }
              : {}),
          },
        },
        _sum: { amount: true },
      });
      let current = Number(session.openingTotal);
      for (const row of rows) {
        const amount = Number(row._sum.amount ?? 0);
        current += row.entryType === EntryType.DEBIT ? amount : -amount;
      }
      liveCashBalance.set(session.cashAccountId, current);
    }

    return accounts.map((account) => {
      const m = account.ledgerAccount
        ? movement.get(account.ledgerAccount.id) ?? { debit: 0, credit: 0 }
        : { debit: 0, credit: 0 };
      const opening = Number(account.openingBalance);
      const ledgerBalance =
        account.accountNature === AccountNature.ASSET
          ? opening + m.debit - m.credit
          : opening + m.credit - m.debit;
      const currentBalance =
        account.accountType === AccountType.CASH && liveCashBalance.has(account.id)
          ? liveCashBalance.get(account.id)!
          : ledgerBalance;

      return {
        id: account.id,
        accountName: account.accountName,
        accountType: account.accountType,
        accountNature: account.accountNature,
        usageType: account.usageType,
        currentBalance,
        creditLimit: account.creditLimit ? Number(account.creditLimit) : null,
        availableCredit:
          account.accountType === AccountType.OWNER_CREDIT_CARD &&
          account.creditLimit
            ? Math.max(0, Number(account.creditLimit) - currentBalance)
            : null,
        isActive: account.isActive,
        bankName: account.bankName,
        accountReference: account.accountReference,
        lastFourDigits: account.lastFourDigits,
        providerId: account.providerId,
      };
    }).filter(
      (account) => account.isActive || Math.abs(account.currentBalance) > 0.005,
    ).filter(
      (account) =>
        role !== RoleName.STAFF ||
        account.accountType !== AccountType.CASH ||
        account.accountName !== 'Main Cash Reserve',
    );
  }

  async summary(role?: RoleName, userId?: string) {
    const balances = await this.getAccountBalances(role, userId);
    const sumType = (type: AccountType) =>
      balances.filter((a) => a.accountType === type)
        .reduce((sum, a) => sum + a.currentBalance, 0);

    const { start: todayStart, end: todayEnd } = this.indiaDayRange();
    const payableOpen = [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID, PayableStatus.OVERDUE];
    const receivableOpen = [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED, ReceivableStatus.OVERDUE];

    const [
      openPayable, payablePending, payablePartial, payableOverdue, payableDueToday,
      openReceivable, receivablePending, receivablePartial, receivableOverdue, receivableDueToday,
      providerSettlementsOpen,
    ] = await Promise.all([
      this.prisma.customerPayable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: { in: payableOpen } },
        _sum: { remainingAmount: true },
      }),
      this.prisma.customerPayable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: PayableStatus.PENDING },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.customerPayable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: PayableStatus.PARTIALLY_PAID },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.customerPayable.aggregate({
        where: {
          remainingAmount: { gt: 0 },
          OR: [
            { status: PayableStatus.OVERDUE },
            { dueAt: { lt: todayStart }, status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] } },
          ],
        },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.customerPayable.aggregate({
        where: { remainingAmount: { gt: 0 }, dueAt: { gte: todayStart, lt: todayEnd }, status: { in: payableOpen } },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.customerReceivable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: { in: receivableOpen } },
        _sum: { remainingAmount: true },
      }),
      this.prisma.customerReceivable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: ReceivableStatus.PENDING },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.customerReceivable.aggregate({
        where: { remainingAmount: { gt: 0 }, status: ReceivableStatus.PARTIALLY_RECEIVED },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.customerReceivable.aggregate({
        where: {
          remainingAmount: { gt: 0 },
          OR: [
            { status: ReceivableStatus.OVERDUE },
            { dueAt: { lt: todayStart }, status: { in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED] } },
          ],
        },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.customerReceivable.aggregate({
        where: { remainingAmount: { gt: 0 }, dueAt: { gte: todayStart, lt: todayEnd }, status: { in: receivableOpen } },
        _sum: { remainingAmount: true }, _count: true,
      }),
      this.prisma.providerSettlement.aggregate({
        where: {
          remainingAmount: { gt: 0 },
          status: { in: ['PENDING', 'PARTIALLY_SETTLED'] },
        },
        _sum: { remainingAmount: true },
        _count: true,
      }),
    ]);

    const cashBalance = sumType(AccountType.CASH);
    const bankBalance = sumType(AccountType.BANK);
    const upiBalance = sumType(AccountType.UPI);
    const walletBalance = sumType(AccountType.PROVIDER_WALLET);
    const availableFunds = cashBalance + bankBalance + upiBalance + walletBalance;
    const customerPayable = Number(openPayable._sum.remainingAmount ?? 0);
    const customerReceivable = Number(openReceivable._sum.remainingAmount ?? 0);
    const pendingProviderSettlements = Number(
      providerSettlementsOpen._sum.remainingAmount ?? 0,
    );
    const creditCardOutstanding = sumType(AccountType.OWNER_CREDIT_CARD);
    const creditCardAvailable = balances
      .filter((a) => a.accountType === AccountType.OWNER_CREDIT_CARD)
      .reduce((sum, a) => sum + Math.max(0, a.availableCredit ?? 0), 0);
    const currentAvailability = availableFunds + creditCardAvailable;
    const operatingPosition =
      availableFunds +
      pendingProviderSettlements +
      customerReceivable -
      customerPayable;
    const netFinancialPosition =
      operatingPosition - creditCardOutstanding;

    return {
      cashBalance, bankBalance, upiBalance, walletBalance, availableFunds,
      currentAvailability,
      customerPayable, customerReceivable,
      pendingProviderSettlements,
      pendingProviderSettlementCount: providerSettlementsOpen._count,
      operatingPosition,
      netFinancialPosition,
      payableBreakdown: {
        pendingAmount: Number(payablePending._sum.remainingAmount ?? 0), pendingCount: payablePending._count,
        partialAmount: Number(payablePartial._sum.remainingAmount ?? 0), partialCount: payablePartial._count,
        dueTodayAmount: Number(payableDueToday._sum.remainingAmount ?? 0), dueTodayCount: payableDueToday._count,
        overdueAmount: Number(payableOverdue._sum.remainingAmount ?? 0), overdueCount: payableOverdue._count,
      },
      receivableBreakdown: {
        pendingAmount: Number(receivablePending._sum.remainingAmount ?? 0), pendingCount: receivablePending._count,
        partialAmount: Number(receivablePartial._sum.remainingAmount ?? 0), partialCount: receivablePartial._count,
        dueTodayAmount: Number(receivableDueToday._sum.remainingAmount ?? 0), dueTodayCount: receivableDueToday._count,
        overdueAmount: Number(receivableOverdue._sum.remainingAmount ?? 0), overdueCount: receivableOverdue._count,
      },
      creditCardOutstanding,
      creditCardAvailable,
    };
  }

  accounts(role?: RoleName, userId?: string) {
    return this.getAccountBalances(role, userId);
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
    const commissionSum = async (type: TransactionType) => {
      const result = await this.prisma.transactionCommission.aggregate({
        where: {
          transaction: {
            transactionType: type,
            transactionAt: range,
            status: { not: 'REVERSED' },
          },
        },
        _sum: { amount: true },
      });
      return Number(result._sum.amount ?? 0);
    };

    const [
      cardSwipe,
      cashTransfer,
      aeps,
      microAtm,
      customerPayout,
      customerReceipt,
      receivableCreated,
      serviceIncome,
      businessExpense,
      personalExpense,
    ] = await Promise.all([
      txSum(TransactionType.CARD_SWIPE),
      txSum(TransactionType.CASH_TRANSFER),
      txSum(TransactionType.AEPS_WITHDRAWAL),
      txSum(TransactionType.MICRO_ATM),
      txSum(TransactionType.CUSTOMER_PAYOUT),
      txSum(TransactionType.CUSTOMER_RECEIPT),
      txSum(TransactionType.CUSTOMER_RECEIVABLE),
      txSum(TransactionType.SERVICE_INCOME),
      txSum(TransactionType.BUSINESS_EXPENSE),
      txSum(TransactionType.PERSONAL_EXPENSE),
    ]);

    const [
      commissions,
      charges,
      settlementReceipts,
      cardSwipeCommission,
      cashTransferCommission,
      aepsCommission,
      microAtmCommission,
    ] = await Promise.all([
      this.prisma.transactionCommission.aggregate({
        where: {
          transaction: { transactionAt: range, status: { not: 'REVERSED' } },
        },
        _sum: { amount: true },
      }),
      this.prisma.transactionCharge.aggregate({
        where: {
          transaction: { transactionAt: range, status: { not: 'REVERSED' } },
        },
        _sum: { amount: true },
      }),
      this.prisma.providerSettlementReceipt.aggregate({
        where: { receivedAt: range, status: PaymentStatus.COMPLETED },
        _sum: { amount: true },
      }),
      commissionSum(TransactionType.CARD_SWIPE),
      commissionSum(TransactionType.CASH_TRANSFER),
      commissionSum(TransactionType.AEPS_WITHDRAWAL),
      commissionSum(TransactionType.MICRO_ATM),
    ]);
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
      cashTransfer,
      aeps,
      microAtm,
      customerPayout,
      customerReceipt,
      receivableCreated,
      settlementsReceived: Number(settlementReceipts._sum.amount ?? 0),
      commission: Number(commissions._sum.amount ?? 0),
      serviceIncome,
      totalIncome: Number(commissions._sum.amount ?? 0) + serviceIncome,
      cardSwipeCommission,
      cashTransferCommission,
      aepsCommission,
      microAtmCommission,
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

  async receivables() {
    const now = new Date();
    return this.prisma.customerReceivable.findMany({
      where: {
        remainingAmount: { gt: 0 },
        status: { notIn: ['RECEIVED', 'CANCELLED', 'REVERSED'] },
      },
      include: { customer: true, sourceAccount: true },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    }).then((items) =>
      items.map((item) => ({
        ...item,
        bucket:
          item.dueAt && item.dueAt < now
            ? 'OVERDUE'
            : item.status === 'PARTIALLY_RECEIVED'
              ? 'PARTIAL'
              : 'UPCOMING',
      })),
    );
  }

  async obligationInsights() {
    const { start: todayStart, end: todayEnd } = this.indiaDayRange();
    const dayMs = 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * dayMs);
    const sixtyDaysAgo = new Date(todayStart.getTime() - 60 * dayMs);
    const nextSevenEnd = new Date(todayEnd.getTime() + 7 * dayMs);

    const receivableOpen = [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED, ReceivableStatus.OVERDUE];
    const payableOpen = [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID, PayableStatus.OVERDUE];

    const receivableAggregate = (dueAt: Prisma.DateTimeNullableFilter) => this.prisma.customerReceivable.aggregate({
      where: { remainingAmount: { gt: 0 }, status: { in: receivableOpen }, dueAt },
      _sum: { remainingAmount: true }, _count: true,
    });
    const payableAggregate = (dueAt: Prisma.DateTimeFilter) => this.prisma.customerPayable.aggregate({
      where: { remainingAmount: { gt: 0 }, status: { in: payableOpen }, dueAt },
      _sum: { remainingAmount: true }, _count: true,
    });

    const [
      rCurrent, r0to30, r31to60, r60plus,
      pOverdue, pToday, pNext7, pLater,
    ] = await Promise.all([
      this.prisma.customerReceivable.aggregate({
        where: {
          remainingAmount: { gt: 0 },
          status: { in: receivableOpen },
          OR: [{ dueAt: null }, { dueAt: { gte: todayStart } }],
        },
        _sum: { remainingAmount: true }, _count: true,
      }),
      receivableAggregate({ gte: thirtyDaysAgo, lt: todayStart }),
      receivableAggregate({ gte: sixtyDaysAgo, lt: thirtyDaysAgo }),
      receivableAggregate({ lt: sixtyDaysAgo }),
      payableAggregate({ lt: todayStart }),
      payableAggregate({ gte: todayStart, lt: todayEnd }),
      payableAggregate({ gte: todayEnd, lt: nextSevenEnd }),
      payableAggregate({ gte: nextSevenEnd }),
    ]);

    const bucket = (
      label: string,
      row: { _sum: { remainingAmount: Prisma.Decimal | null }; _count: number },
    ) => ({
      label,
      amount: Number(row._sum.remainingAmount ?? 0),
      count: row._count,
    });

    return {
      receivables: [
        bucket('Current / future', rCurrent),
        bucket('0–30 days overdue', r0to30),
        bucket('31–60 days overdue', r31to60),
        bucket('60+ days overdue', r60plus),
      ],
      payables: [
        bucket('Overdue', pOverdue),
        bucket('Due today', pToday),
        bucket('Next 7 days', pNext7),
        bucket('Later', pLater),
      ],
    };
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
    if (type === 'CUSTOMER_RECEIVABLE') {
      return this.receivableTenDaySeries(start, end);
    }
    if (type === 'PROVIDER_SETTLEMENT') {
      return this.systemAssetTenDaySeries(
        'SYS-PROVIDER-CLEARING',
        start,
        end,
      );
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
      where: { accountType: { in: accountTypes } },
      include: { ledgerAccount: true },
    });
    const ledgerIds = accounts
      .map((a) => a.ledgerAccount?.id)
      .filter((id): id is string => Boolean(id));

    let opening = accounts
      .filter((account) => account.createdAt < start)
      .reduce(
        (sum, account) => sum + Number(account.openingBalance),
        0,
      );

    const dailyOpening = new Map<string, number>();
    for (const account of accounts) {
      if (account.createdAt >= start && account.createdAt < end) {
        const key = this.dateKey(account.createdAt);
        dailyOpening.set(
          key,
          (dailyOpening.get(key) ?? 0) + Number(account.openingBalance),
        );
      }
    }

    if (ledgerIds.length) {
      const prior = await this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: { in: ledgerIds },
          journal: {
            postingDate: { lt: start },
            status: 'POSTED',
          },
        },
        select: { entryType: true, amount: true },
      });
      for (const entry of prior) {
        opening +=
          entry.entryType === EntryType.DEBIT
            ? Number(entry.amount)
            : -Number(entry.amount);
      }
    }

    const movements = ledgerIds.length
      ? await this.prisma.ledgerEntry.findMany({
          where: {
            ledgerAccountId: { in: ledgerIds },
            journal: {
              postingDate: { gte: start, lt: end },
              status: 'POSTED',
            },
          },
          select: {
            entryType: true,
            amount: true,
            journal: { select: { postingDate: true } },
          },
        })
      : [];

    const daily = new Map<
      string,
      { moneyIn: number; moneyOut: number }
    >();
    for (const entry of movements) {
      const key = this.dateKey(entry.journal.postingDate);
      const row =
        daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      if (entry.entryType === EntryType.DEBIT) {
        row.moneyIn += Number(entry.amount);
      } else {
        row.moneyOut += Number(entry.amount);
      }
      daily.set(key, row);
    }

    const rows = [];
    let running = opening;
    for (let i = 0; i < 10; i += 1) {
      const date = new Date(start.getTime() + i * dayMs);
      const key = this.dateKey(date);
      const movement =
        daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      const openingAdded = dailyOpening.get(key) ?? 0;
      const rowOpening = running;
      running =
        rowOpening +
        openingAdded +
        movement.moneyIn -
        movement.moneyOut;
      rows.push({
        date: key,
        opening: rowOpening,
        moneyIn: movement.moneyIn + openingAdded,
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

  private async receivableTenDaySeries(start: Date, end: Date) {
    const dayMs = 24 * 60 * 60 * 1000;
    const ledger = await this.prisma.ledgerAccount.findUnique({
      where: { ledgerCode: 'SYS-CUST-RECEIVABLE' },
      select: { id: true },
    });
    if (!ledger) throw new Error('Customer receivable ledger missing');

    const [priorEntries, entries] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: ledger.id,
          journal: { postingDate: { lt: start }, status: 'POSTED' },
        },
        select: { entryType: true, amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: ledger.id,
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
      opening += entry.entryType === EntryType.DEBIT
        ? Number(entry.amount)
        : -Number(entry.amount);
    }

    const daily = new Map<string, { moneyIn: number; moneyOut: number }>();
    for (const entry of entries) {
      const key = this.dateKey(entry.journal.postingDate);
      const row = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      if (entry.entryType === EntryType.DEBIT) row.moneyIn += Number(entry.amount);
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

  private async systemAssetTenDaySeries(
    ledgerCode: string,
    start: Date,
    end: Date,
  ) {
    const dayMs = 24 * 60 * 60 * 1000;
    const ledger = await this.prisma.ledgerAccount.findUnique({
      where: { ledgerCode },
      select: { id: true },
    });
    if (!ledger) throw new Error(ledgerCode + ' ledger missing');

    const [priorEntries, entries] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: ledger.id,
          journal: { postingDate: { lt: start }, status: 'POSTED' },
        },
        select: { entryType: true, amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: ledger.id,
          journal: {
            postingDate: { gte: start, lt: end },
            status: 'POSTED',
          },
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
      opening +=
        entry.entryType === EntryType.DEBIT
          ? Number(entry.amount)
          : -Number(entry.amount);
    }

    const daily = new Map<string, { moneyIn: number; moneyOut: number }>();
    for (const entry of entries) {
      const key = this.dateKey(entry.journal.postingDate);
      const row = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      if (entry.entryType === EntryType.DEBIT) row.moneyIn += Number(entry.amount);
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

  private async creditCardTenDaySeries(start: Date, end: Date) {
    const dayMs = 24 * 60 * 60 * 1000;
    const accounts = await this.prisma.financialAccount.findMany({
      where: { accountType: AccountType.OWNER_CREDIT_CARD },
      include: { ledgerAccount: true },
    });
    const ledgerIds = accounts
      .map((account) => account.ledgerAccount?.id)
      .filter((id): id is string => Boolean(id));

    let opening = accounts
      .filter((account) => account.createdAt < start)
      .reduce(
        (sum, account) => sum + Number(account.openingBalance),
        0,
      );

    const dailyOpening = new Map<string, number>();
    for (const account of accounts) {
      if (account.createdAt >= start && account.createdAt < end) {
        const key = this.dateKey(account.createdAt);
        dailyOpening.set(
          key,
          (dailyOpening.get(key) ?? 0) + Number(account.openingBalance),
        );
      }
    }

    const [priorEntries, entries] = ledgerIds.length
      ? await Promise.all([
          this.prisma.ledgerEntry.findMany({
            where: {
              ledgerAccountId: { in: ledgerIds },
              journal: {
                postingDate: { lt: start },
                status: 'POSTED',
              },
            },
            select: { entryType: true, amount: true },
          }),
          this.prisma.ledgerEntry.findMany({
            where: {
              ledgerAccountId: { in: ledgerIds },
              journal: {
                postingDate: { gte: start, lt: end },
                status: 'POSTED',
              },
            },
            select: {
              entryType: true,
              amount: true,
              journal: { select: { postingDate: true } },
            },
          }),
        ])
      : [[], []];

    for (const entry of priorEntries) {
      opening +=
        entry.entryType === EntryType.CREDIT
          ? Number(entry.amount)
          : -Number(entry.amount);
    }

    const daily = new Map<string, { moneyIn: number; moneyOut: number }>();
    for (const entry of entries) {
      const key = this.dateKey(entry.journal.postingDate);
      const row = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      if (entry.entryType === EntryType.CREDIT) {
        row.moneyIn += Number(entry.amount);
      } else {
        row.moneyOut += Number(entry.amount);
      }
      daily.set(key, row);
    }

    const rows = [];
    let running = opening;
    for (let i = 0; i < 10; i += 1) {
      const date = new Date(start.getTime() + i * dayMs);
      const key = this.dateKey(date);
      const movement = daily.get(key) ?? { moneyIn: 0, moneyOut: 0 };
      const openingAdded = dailyOpening.get(key) ?? 0;
      const rowOpening = running;
      running =
        rowOpening +
        openingAdded +
        movement.moneyIn -
        movement.moneyOut;
      rows.push({
        date: key,
        opening: rowOpening,
        moneyIn: movement.moneyIn + openingAdded,
        moneyOut: movement.moneyOut,
        closing: running,
      });
    }
    return rows;
  }

  async positionTrend() {
    const today = this.indiaDayRange();
    const dayMs = 24 * 60 * 60 * 1000;
    const start = new Date(today.start.getTime() - 9 * dayMs);
    const end = today.end;

    const [liquid, providerClearing, receivable, payable, creditCard] =
      await Promise.all([
        this.lastTenDays('TOTAL'),
        this.systemAssetTenDaySeries(
          'SYS-PROVIDER-CLEARING',
          start,
          end,
        ),
        this.receivableTenDaySeries(start, end),
        this.payableTenDaySeries(start, end),
        this.creditCardTenDaySeries(start, end),
      ]);

    const rows = liquid.map((row, index) => {
      const pendingProviderSettlements =
        providerClearing[index]?.closing ?? 0;
      const customerReceivable = receivable[index]?.closing ?? 0;
      const customerPayable = payable[index]?.closing ?? 0;
      const creditCardOutstanding =
        creditCard[index]?.closing ?? 0;
      const operatingPosition =
        row.closing +
        pendingProviderSettlements +
        customerReceivable -
        customerPayable;
      return {
        date: row.date,
        availableFunds: row.closing,
        pendingProviderSettlements,
        receivables: customerReceivable,
        payables: customerPayable,
        creditCardOutstanding,
        operatingPosition,
        netPosition:
          operatingPosition - creditCardOutstanding,
      };
    });

    const snapshots = await this.prisma.$transaction(
      rows.map((row) => {
        const businessDate = new Date(row.date + 'T00:00:00.000Z');
        const data = {
          availableFunds: new Prisma.Decimal(row.availableFunds),
          pendingProviderSettlements: new Prisma.Decimal(row.pendingProviderSettlements),
          customerReceivable: new Prisma.Decimal(row.receivables),
          customerPayable: new Prisma.Decimal(row.payables),
          ownerCreditCardOutstanding: new Prisma.Decimal(row.creditCardOutstanding),
          operatingPosition: new Prisma.Decimal(row.operatingPosition),
          netFinancialPosition: new Prisma.Decimal(row.netPosition),
        };
        return this.prisma.dailyPositionSnapshot.upsert({
          where: { businessDate },
          create: { businessDate, ...data },
          update: data,
          select: { capturedAt: true, updatedAt: true },
        });
      }),
    );

    return rows.map((row, index) => ({
      ...row,
      capturedAt: (snapshots[index]?.updatedAt ?? snapshots[index]?.capturedAt ?? new Date()).toISOString(),
    }));
  }

  async analytics(filters: {
    from?: string;
    to?: string;
    scope?: string;
  }) {
    const end = filters.to ? new Date(filters.to) : new Date();
    const start = filters.from
      ? new Date(filters.from)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('Invalid dashboard date range');
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const duration = end.getTime() - start.getTime();
    if (duration > 366 * dayMs) {
      throw new BadRequestException(
        'Dashboard analytics are limited to 366 days',
      );
    }

    const scope = (filters.scope ?? 'ALL').toUpperCase() as AnalyticsScope;
    if (!['ALL', 'BUSINESS', 'PERSONAL'].includes(scope)) {
      throw new BadRequestException('Invalid dashboard scope');
    }

    const expenseUsage =
      scope === 'ALL'
        ? [UsageType.BUSINESS, UsageType.PERSONAL]
        : [scope as UsageType];
    const expenseTypes =
      scope === 'ALL'
        ? [TransactionType.BUSINESS_EXPENSE, TransactionType.PERSONAL_EXPENSE]
        : scope === 'BUSINESS'
          ? [TransactionType.BUSINESS_EXPENSE]
          : [TransactionType.PERSONAL_EXPENSE];
    const range = { gte: start, lt: end };
    const previousRange = {
      gte: new Date(start.getTime() - duration),
      lt: start,
    };
    const accountUsage =
      scope === 'ALL'
        ? undefined
        : { in: [scope as UsageType, UsageType.MIXED] };
    const liquidAccountTypes = [
      AccountType.CASH,
      AccountType.BANK,
      AccountType.UPI,
      AccountType.PROVIDER_WALLET,
    ];

    const [
      expenseRows,
      previousExpenses,
      cashFlowEntries,
      incomeEntries,
      recentRows,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          transactionAt: range,
          status: { not: 'REVERSED' },
          transactionType: { in: expenseTypes },
          expense: { is: { expenseType: { in: expenseUsage } } },
        },
        select: {
          id: true,
          transactionNumber: true,
          transactionAt: true,
          grossAmount: true,
          status: true,
          referenceNumber: true,
          notes: true,
          expense: {
            select: {
              amount: true,
              description: true,
              expenseType: true,
              expenseCategory: { select: { id: true, name: true } },
              paymentAccount: {
                select: { id: true, accountName: true, accountType: true },
              },
            },
          },
        },
        orderBy: { transactionAt: 'desc' },
      }),
      this.prisma.expenseDetail.aggregate({
        where: {
          expenseType: { in: expenseUsage },
          transaction: {
            transactionAt: previousRange,
            status: { not: 'REVERSED' },
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccount: {
            financialAccount: {
              is: {
                accountNature: AccountNature.ASSET,
                accountType: { in: liquidAccountTypes },
                ...(accountUsage ? { usageType: accountUsage } : {}),
              },
            },
          },
          journal: {
            postingDate: range,
            status: 'POSTED',
            transaction: { status: { not: 'REVERSED' } },
          },
        },
        select: {
          id: true,
          entryType: true,
          amount: true,
          description: true,
          ledgerAccount: {
            select: {
              financialAccount: {
                select: {
                  id: true,
                  accountName: true,
                  accountType: true,
                  usageType: true,
                },
              },
            },
          },
          journal: {
            select: {
              postingDate: true,
              transaction: {
                select: {
                  id: true,
                  transactionNumber: true,
                  transactionType: true,
                  status: true,
                  referenceNumber: true,
                  customer: { select: { fullName: true } },
                },
              },
            },
          },
        },
        orderBy: { journal: { postingDate: 'asc' } },
      }),
      scope === 'PERSONAL'
        ? Promise.resolve([])
        : this.prisma.ledgerEntry.findMany({
            where: {
              ledgerAccount: { ledgerType: LedgerType.INCOME },
              journal: {
                postingDate: range,
                status: 'POSTED',
                transaction: { status: { not: 'REVERSED' } },
              },
            },
            select: {
              entryType: true,
              amount: true,
              description: true,
              ledgerAccount: { select: { ledgerCode: true } },
              journal: {
                select: {
                  postingDate: true,
                  transaction: {
                    select: {
                      id: true,
                      transactionNumber: true,
                      transactionType: true,
                      status: true,
                      customer: { select: { fullName: true } },
                    },
                  },
                },
              },
            },
            orderBy: { journal: { postingDate: 'desc' } },
          }),
      this.prisma.transaction.findMany({
        where: {
          transactionAt: range,
          status: { not: 'REVERSED' },
          ...(scope === 'PERSONAL'
            ? { transactionType: TransactionType.PERSONAL_EXPENSE }
            : scope === 'BUSINESS'
              ? { transactionType: { not: TransactionType.PERSONAL_EXPENSE } }
              : {}),
        },
        select: {
          id: true,
          transactionNumber: true,
          transactionType: true,
          transactionAt: true,
          grossAmount: true,
          netAmount: true,
          status: true,
          referenceNumber: true,
          customer: { select: { fullName: true } },
          expense: {
            select: {
              description: true,
              expenseType: true,
              expenseCategory: { select: { name: true } },
            },
          },
        },
        orderBy: { transactionAt: 'desc' },
        take: 12,
      }),
    ]);

    const expenseTransactions = expenseRows.flatMap((row) =>
      row.expense
        ? [
            {
              id: row.id,
              transactionNumber: row.transactionNumber,
              transactionAt: row.transactionAt,
              amount: Number(row.expense.amount),
              status: row.status,
              referenceNumber: row.referenceNumber,
              notes: row.notes,
              description: row.expense.description,
              expenseType: row.expense.expenseType,
              category: row.expense.expenseCategory,
              account: row.expense.paymentAccount,
            },
          ]
        : [],
    );

    const expenseTotal = expenseTransactions.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const businessExpenseTotal = expenseTransactions
      .filter((item) => item.expenseType === UsageType.BUSINESS)
      .reduce((sum, item) => sum + item.amount, 0);
    const personalExpenseTotal = expenseTransactions
      .filter((item) => item.expenseType === UsageType.PERSONAL)
      .reduce((sum, item) => sum + item.amount, 0);

    const dailyFlow = new Map<
      string,
      { moneyIn: number; moneyOut: number }
    >();
    const cashFlowMovements = cashFlowEntries.flatMap((entry) => {
      const account = entry.ledgerAccount.financialAccount;
      if (!account) return [];
      const date = this.dateKey(entry.journal.postingDate);
      const row = dailyFlow.get(date) ?? { moneyIn: 0, moneyOut: 0 };
      const amount = Number(entry.amount);
      if (entry.entryType === EntryType.DEBIT) row.moneyIn += amount;
      else row.moneyOut += amount;
      dailyFlow.set(date, row);
      return [
        {
          id: entry.id,
          date,
          direction: entry.entryType === EntryType.DEBIT ? 'IN' : 'OUT',
          amount,
          description: entry.description,
          account,
          transaction: entry.journal.transaction,
        },
      ];
    });

    const cashFlow = [];
    let cursor = this.indiaDayRange(start).start;
    while (cursor < end && cashFlow.length < 367) {
      const date = this.dateKey(cursor);
      const row = dailyFlow.get(date) ?? { moneyIn: 0, moneyOut: 0 };
      cashFlow.push({
        date,
        moneyIn: row.moneyIn,
        moneyOut: row.moneyOut,
        net: row.moneyIn - row.moneyOut,
      });
      cursor = new Date(cursor.getTime() + dayMs);
    }

    const incomeByTransaction = new Map<
      string,
      {
        id: string;
        transactionNumber: string;
        transactionType: TransactionType;
        transactionAt: Date;
        status: string;
        customer: { fullName: string } | null;
        amount: number;
        description: string | null;
      }
    >();
    for (const entry of incomeEntries) {
      const transaction = entry.journal.transaction;
      const signedAmount =
        entry.entryType === EntryType.CREDIT
          ? Number(entry.amount)
          : -Number(entry.amount);
      const current = incomeByTransaction.get(transaction.id);
      if (current) current.amount += signedAmount;
      else {
        incomeByTransaction.set(transaction.id, {
          id: transaction.id,
          transactionNumber: transaction.transactionNumber,
          transactionType: transaction.transactionType,
          transactionAt: entry.journal.postingDate,
          status: transaction.status,
          customer: transaction.customer,
          amount: signedAmount,
          description: entry.description,
        });
      }
    }
    const incomeTransactions = [...incomeByTransaction.values()].filter(
      (item) => Math.abs(item.amount) > 0.005,
    );
    const incomeTotal = incomeTransactions.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const commissionIncomeTotal = incomeEntries.reduce((sum, entry) => {
      const ledgerCode = entry.ledgerAccount?.ledgerCode;
      const transactionType = entry.journal.transaction.transactionType;
      const isCommission =
        ledgerCode === 'SYS-COMMISSION' ||
        (!ledgerCode && transactionType !== TransactionType.SERVICE_INCOME);
      if (!isCommission) return sum;
      return (
        sum +
        (entry.entryType === EntryType.CREDIT
          ? Number(entry.amount)
          : -Number(entry.amount))
      );
    }, 0);
    const serviceIncomeTotal = incomeEntries.reduce((sum, entry) => {
      const ledgerCode = entry.ledgerAccount?.ledgerCode;
      const transactionType = entry.journal.transaction.transactionType;
      const isServiceIncome =
        ledgerCode === 'SYS-SERVICE-INCOME' ||
        (!ledgerCode && transactionType === TransactionType.SERVICE_INCOME);
      if (!isServiceIncome) return sum;
      return (
        sum +
        (entry.entryType === EntryType.CREDIT
          ? Number(entry.amount)
          : -Number(entry.amount))
      );
    }, 0);

    return {
      range: { from: start, to: end, scope },
      expenses: {
        total: expenseTotal,
        businessTotal: businessExpenseTotal,
        personalTotal: personalExpenseTotal,
        previousTotal: Number(previousExpenses._sum.amount ?? 0),
        transactions: expenseTransactions,
      },
      cashFlow: {
        series: cashFlow,
        movements: cashFlowMovements,
        moneyIn: cashFlow.reduce((sum, row) => sum + row.moneyIn, 0),
        moneyOut: cashFlow.reduce((sum, row) => sum + row.moneyOut, 0),
        net: cashFlow.reduce((sum, row) => sum + row.net, 0),
      },
      income: {
        total: incomeTotal,
        commissionTotal: commissionIncomeTotal,
        serviceTotal: serviceIncomeTotal,
        transactions: incomeTransactions,
      },
      recent: recentRows.map((row) => ({
        ...row,
        context: row.expense?.expenseType ?? UsageType.BUSINESS,
      })),
    };
  }
}
