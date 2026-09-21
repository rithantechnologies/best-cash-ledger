import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AccountNature, AccountType, EntryType, Prisma } from '@prisma/client';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class EndOfDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  private indiaDayRange(date = new Date()) {
    const offset = 330 * 60 * 1000;
    const local = new Date(date.getTime() + offset);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    return {
      businessDate: new Date(Date.UTC(y, m, d)),
      start: new Date(Date.UTC(y, m, d) - offset),
      end: new Date(Date.UTC(y, m, d + 1) - offset),
    };
  }

  async status() {
    const { businessDate } = this.indiaDayRange();
    const [snapshot, openCashSessions, summary, cashAccounts, closedSessions] =
      await Promise.all([
        this.prisma.dailyPositionSummary.findUnique({
          where: { businessDate },
        }),
        this.prisma.cashSession.count({ where: { status: 'OPEN' } }),
        this.dashboard.summary(),
        this.prisma.financialAccount.findMany({
          where: { accountType: AccountType.CASH, isActive: true },
          select: { id: true, accountName: true },
        }),
        this.prisma.cashSession.findMany({
          where: { businessDate, status: 'CLOSED' },
          select: { id: true, cashAccountId: true },
        }),
      ]);
    const requiredCashAccountIds = new Set(cashAccounts.map((account) => account.id));
    const reconciledCashAccountIds = new Set(
      closedSessions
        .map((session) => session.cashAccountId)
        .filter((id) => requiredCashAccountIds.has(id)),
    );
    const cashReconciliationRequired = cashAccounts.length > 0;
    const cashReconciled =
      !cashReconciliationRequired ||
      (openCashSessions === 0 &&
        reconciledCashAccountIds.size === requiredCashAccountIds.size);
    return {
      businessDate,
      snapshot,
      openCashSessions,
      summary,
      cashReconciliationRequired,
      cashReconciled,
      cashAccountsRequired: cashAccounts.length,
      cashAccountsReconciled: reconciledCashAccountIds.size,
    };
  }

  history() {
    return this.prisma.dailyPositionSummary.findMany({
      orderBy: { businessDate: 'desc' },
      take: 60,
    });
  }

  private async accountDayRows(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
  ) {
    const accounts = await tx.financialAccount.findMany({
      where: { createdAt: { lt: end } },
      include: { ledgerAccount: true },
      orderBy: { accountName: 'asc' },
    });

    const rows = [];
    for (const account of accounts) {
      if (!account.ledgerAccount) continue;
      const [prior, today] = await Promise.all([
        tx.ledgerEntry.findMany({
          where: {
            ledgerAccountId: account.ledgerAccount.id,
            journal: {
              postingDate: { lt: start },
              status: 'POSTED',
            },
          },
          select: { entryType: true, amount: true },
        }),
        tx.ledgerEntry.findMany({
          where: {
            ledgerAccountId: account.ledgerAccount.id,
            journal: {
              postingDate: { gte: start, lt: end },
              status: 'POSTED',
            },
          },
          select: { entryType: true, amount: true },
        }),
      ]);

      const isAsset = account.accountNature === AccountNature.ASSET;
      let opening =
        account.createdAt < start ? Number(account.openingBalance) : 0;
      for (const entry of prior) {
        const amount = Number(entry.amount);
        opening += isAsset
          ? entry.entryType === EntryType.DEBIT
            ? amount
            : -amount
          : entry.entryType === EntryType.CREDIT
            ? amount
            : -amount;
      }

      let totalIn =
        account.createdAt >= start && account.createdAt < end
          ? Number(account.openingBalance)
          : 0;
      let totalOut = 0;
      for (const entry of today) {
        const amount = Number(entry.amount);
        const isIncrease = isAsset
          ? entry.entryType === EntryType.DEBIT
          : entry.entryType === EntryType.CREDIT;
        if (isIncrease) totalIn += amount;
        else totalOut += amount;
      }

      rows.push({
        financialAccountId: account.id,
        accountType: account.accountType,
        openingBalance: opening,
        totalIn,
        totalOut,
        closingBalance: opening + totalIn - totalOut,
      });
    }
    return rows;
  }

  private async systemLedgerDay(
    tx: Prisma.TransactionClient,
    ledgerCode: string,
    normal: 'DEBIT' | 'CREDIT',
    start: Date,
    end: Date,
  ) {
    const ledger = await tx.ledgerAccount.findUnique({
      where: { ledgerCode },
    });
    if (!ledger) throw new Error(ledgerCode + ' ledger missing');

    const [prior, today] = await Promise.all([
      tx.ledgerEntry.findMany({
        where: {
          ledgerAccountId: ledger.id,
          journal: { postingDate: { lt: start }, status: 'POSTED' },
        },
        select: { entryType: true, amount: true },
      }),
      tx.ledgerEntry.findMany({
        where: {
          ledgerAccountId: ledger.id,
          journal: {
            postingDate: { gte: start, lt: end },
            status: 'POSTED',
          },
        },
        select: { entryType: true, amount: true },
      }),
    ]);

    let opening = 0;
    for (const entry of prior) {
      const amount = Number(entry.amount);
      opening += entry.entryType === normal ? amount : -amount;
    }

    let increases = 0;
    let decreases = 0;
    for (const entry of today) {
      const amount = Number(entry.amount);
      if (entry.entryType === normal) increases += amount;
      else decreases += amount;
    }
    return {
      opening,
      increases,
      decreases,
      closing: opening + increases - decreases,
    };
  }

  async snapshot(userId: string) {
    const { businessDate, start, end } = this.indiaDayRange();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.dailyPositionSummary.findUnique({
        where: { businessDate },
      });
      if (existing) {
        throw new ConflictException(
          'End-of-day snapshot has already been saved for today',
        );
      }

      const openCashSessions = await tx.cashSession.count({
        where: { status: 'OPEN' },
      });
      if (openCashSessions > 0) {
        throw new BadRequestException(
          'Close all Daily Cash Desk sessions before saving end-of-day',
        );
      }

      const activeCashAccounts = await tx.financialAccount.findMany({
        where: { accountType: AccountType.CASH, isActive: true },
        select: { id: true },
      });
      if (activeCashAccounts.length > 0) {
        const cashAccountIds = activeCashAccounts.map((account) => account.id);
        const closedCashSessions = await tx.cashSession.findMany({
          where: {
            businessDate,
            status: 'CLOSED',
            cashAccountId: { in: cashAccountIds },
          },
          select: { cashAccountId: true },
        });
        const reconciled = new Set(
          closedCashSessions.map((session) => session.cashAccountId),
        );
        if (reconciled.size < cashAccountIds.length) {
          throw new BadRequestException(
            'Daily Cash Desk reconciliation is required before saving end-of-day. Open the cash desk, count closing cash, and close it first.',
          );
        }
      }

      const [
        accountRows,
        payable,
        receivable,
        providerClearing,
        cashVariance,
      ] =
        await Promise.all([
          this.accountDayRows(tx, start, end),
          this.systemLedgerDay(
            tx,
            'SYS-CUST-PAYABLE',
            'CREDIT',
            start,
            end,
          ),
          this.systemLedgerDay(
            tx,
            'SYS-CUST-RECEIVABLE',
            'DEBIT',
            start,
            end,
          ),
          this.systemLedgerDay(
            tx,
            'SYS-PROVIDER-CLEARING',
            'DEBIT',
            start,
            end,
          ),
          tx.cashSession.aggregate({
            where: { businessDate, status: 'CLOSED' },
            _sum: { differenceAmount: true },
          }),
        ]);

      for (const row of accountRows) {
        await tx.dailyAccountBalance.create({
          data: {
            businessDate,
            financialAccountId: row.financialAccountId,
            openingBalance: new Prisma.Decimal(row.openingBalance),
            totalIn: new Prisma.Decimal(row.totalIn),
            totalOut: new Prisma.Decimal(row.totalOut),
            closingBalance: new Prisma.Decimal(row.closingBalance),
          },
        });
      }

      await tx.dailyPayableSummary.create({
        data: {
          businessDate,
          openingPayable: new Prisma.Decimal(payable.opening),
          newPayables: new Prisma.Decimal(payable.increases),
          paymentsMade: new Prisma.Decimal(payable.decreases),
          closingPayable: new Prisma.Decimal(payable.closing),
        },
      });

      await tx.dailyReceivableSummary.create({
        data: {
          businessDate,
          openingReceivable: new Prisma.Decimal(receivable.opening),
          newReceivables: new Prisma.Decimal(receivable.increases),
          collectionsMade: new Prisma.Decimal(receivable.decreases),
          closingReceivable: new Prisma.Decimal(receivable.closing),
        },
      });

      const liquidTypes = new Set<AccountType>([
        AccountType.CASH,
        AccountType.BANK,
        AccountType.UPI,
        AccountType.PROVIDER_WALLET,
      ]);
      const availableFunds = accountRows
        .filter((row) => liquidTypes.has(row.accountType))
        .reduce((sum, row) => sum + row.closingBalance, 0);
      const creditCardOutstanding = accountRows
        .filter((row) => row.accountType === AccountType.OWNER_CREDIT_CARD)
        .reduce((sum, row) => sum + row.closingBalance, 0);
      const customerPayable = payable.closing;
      const customerReceivable = receivable.closing;
      const pendingProviderSettlements = providerClearing.closing;
      const operatingPosition =
        availableFunds +
        pendingProviderSettlements +
        customerReceivable -
        customerPayable;
      const netFinancialPosition =
        operatingPosition - creditCardOutstanding;
      const summary = {
        availableFunds,
        pendingProviderSettlements,
        customerReceivable,
        customerPayable,
        creditCardOutstanding,
        operatingPosition,
        netFinancialPosition,
      };

      const position = await tx.dailyPositionSummary.create({
        data: {
          businessDate,
          availableFunds: new Prisma.Decimal(summary.availableFunds),
          pendingProviderSettlements: new Prisma.Decimal(
            summary.pendingProviderSettlements,
          ),
          customerReceivable: new Prisma.Decimal(
            summary.customerReceivable,
          ),
          customerPayable: new Prisma.Decimal(summary.customerPayable),
          ownerCreditCardOutstanding: new Prisma.Decimal(
            summary.creditCardOutstanding,
          ),
          operatingPosition: new Prisma.Decimal(
            summary.operatingPosition,
          ),
          netFinancialPosition: new Prisma.Decimal(
            summary.netFinancialPosition,
          ),
          cashVariance: new Prisma.Decimal(
            Number(cashVariance._sum.differenceAmount ?? 0),
          ),
          createdById: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'END_OF_DAY',
          entityId: position.id,
          action: 'SNAPSHOT',
          newValues: {
            businessDate: businessDate.toISOString(),
            availableFunds: summary.availableFunds,
            pendingProviderSettlements:
              summary.pendingProviderSettlements,
            customerReceivable: summary.customerReceivable,
            customerPayable: summary.customerPayable,
            operatingPosition: summary.operatingPosition,
            netFinancialPosition: summary.netFinancialPosition,
          },
        },
      });

      return {
        position,
        accountCount: accountRows.length,
        payable,
        receivable,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
