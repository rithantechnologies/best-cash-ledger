import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, EntryType, PayableStatus, Prisma, ReceivableStatus, RoleName, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type TxFilters = {
  from?: string;
  to?: string;
  customerId?: string;
  type?: TransactionType;
  status?: string;
  moneyStatus?: string;
  reference?: string;
  providerId?: string;
  gatewayId?: string;
  accountId?: string;
  staffId?: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async transactions(filters: TxFilters) {
    const transactionAt: Prisma.DateTimeFilter = {};
    if (filters.from) transactionAt.gte = new Date(filters.from);
    if (filters.to) transactionAt.lte = new Date(filters.to);

    const accountOr: Prisma.TransactionWhereInput[] = filters.accountId ? [
      { cardSwipe: { settlementAccountId: filters.accountId } },
      { cashTransfer: { OR: [{ sourceAccountId: filters.accountId }, { cashAccountId: filters.accountId }] } },
      { aeps: { OR: [{ settlementAccountId: filters.accountId }, { cashAccountId: filters.accountId }] } },
      { internalTransfer: { OR: [{ sourceAccountId: filters.accountId }, { destinationAccountId: filters.accountId }] } },
      { expense: { paymentAccountId: filters.accountId } },
      { atmWithdrawal: { OR: [{ bankAccountId: filters.accountId }, { cashAccountId: filters.accountId }] } },
      { creditCardPayment: { OR: [{ creditCardAccountId: filters.accountId }, { sourceAccountId: filters.accountId }] } },
      { payablePayment: { sourceAccountId: filters.accountId } },
      { receivableSource: { sourceAccountId: filters.accountId } },
      { receivableCollection: { destinationAccountId: filters.accountId } },
      { providerSettlementReceipt: { destinationAccountId: filters.accountId } },
    ] : [];

    const providerOr: Prisma.TransactionWhereInput[] = filters.providerId ? [
      { cardSwipe: { providerId: filters.providerId } },
      { aeps: { providerId: filters.providerId } },
      { charges: { some: { providerId: filters.providerId } } },
      { providerSettlementSource: { providerId: filters.providerId } },
      { providerSettlementReceipt: { settlement: { providerId: filters.providerId } } },
    ] : [];

    const gatewayOr: Prisma.TransactionWhereInput[] = filters.gatewayId ? [
      { cardSwipe: { gatewayId: filters.gatewayId } },
      { aeps: { gatewayId: filters.gatewayId } },
      { charges: { some: { gatewayId: filters.gatewayId } } },
      { providerSettlementSource: { gatewayId: filters.gatewayId } },
      { providerSettlementReceipt: { settlement: { gatewayId: filters.gatewayId } } },
    ] : [];

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const moneyStatusWhere: Prisma.TransactionWhereInput = filters.moneyStatus
      ? filters.moneyStatus === 'PAYOUT_PENDING'
        ? { payable: { status: PayableStatus.PENDING, dueAt: { gte: startOfToday } } }
        : filters.moneyStatus === 'PAYOUT_OVERDUE'
          ? { payable: { OR: [{ status: PayableStatus.OVERDUE }, { status: PayableStatus.PENDING, dueAt: { lt: startOfToday } }] } }
          : filters.moneyStatus === 'PAYOUT_PARTIALLY_PAID'
            ? { payable: { status: PayableStatus.PARTIALLY_PAID } }
            : filters.moneyStatus === 'PAYOUT_PAID'
              ? { payable: { status: PayableStatus.PAID } }
              : filters.moneyStatus === 'PAYIN_PENDING'
                ? { receivableSource: { status: ReceivableStatus.PENDING, OR: [{ dueAt: null }, { dueAt: { gte: startOfToday } }] } }
                : filters.moneyStatus === 'PAYIN_OVERDUE'
                  ? { receivableSource: { OR: [{ status: ReceivableStatus.OVERDUE }, { status: ReceivableStatus.PENDING, dueAt: { lt: startOfToday } }] } }
                  : filters.moneyStatus === 'PAYIN_PARTIALLY_RECEIVED'
                    ? { receivableSource: { status: ReceivableStatus.PARTIALLY_RECEIVED } }
                    : filters.moneyStatus === 'PAYIN_RECEIVED'
                      ? { receivableSource: { status: ReceivableStatus.RECEIVED } }
                      : {}
      : {};

    const rows = await this.prisma.transaction.findMany({
      where: {
        ...(Object.keys(transactionAt).length ? { transactionAt } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.type ? { transactionType: filters.type } : {}),
        ...(filters.status ? { status: filters.status as any } : {}),
        ...moneyStatusWhere,
        ...(filters.staffId ? { createdById: filters.staffId } : {}),
        ...(filters.reference ? {
          referenceNumber: { contains: filters.reference, mode: 'insensitive' },
        } : {}),
        ...(accountOr.length ? { AND: [{ OR: accountOr }] } : {}),
        ...(providerOr.length ? { AND: [{ OR: providerOr }] } : {}),
        ...(gatewayOr.length ? { AND: [{ OR: gatewayOr }] } : {}),
      },
      include: {
        customer: true,
        charges: true,
        commissions: true,
        cardSwipe: true,
        cashTransfer: true,
        aeps: true,
        internalTransfer: true,
        expense: true,
        atmWithdrawal: true,
        creditCardPayment: true,
        receivableSource: true,
        receivableCollection: true,
        providerSettlementSource: true,
        providerSettlementReceipt: true,
        payable: true,
      },
      orderBy: { transactionAt: 'desc' },
      take: 1000,
    });

    const userIds = [...new Set(rows.map((row) => row.createdById))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => ({
      ...row,
      createdBy: byId.get(row.createdById) ?? null,
    }));
  }
  async accountLedger(accountId: string, from?: string, to?: string, role?: RoleName) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: accountId },
      include: { ledgerAccount: true },
    });
    if (!account?.ledgerAccount) throw new NotFoundException('Account ledger not found');
    if (
      role === RoleName.STAFF &&
      account.accountType === AccountType.CASH &&
      account.accountName === 'Main Cash Reserve'
    ) {
      throw new ForbiddenException('Main Cash Reserve is owner-only');
    }

    const postingDate: Prisma.DateTimeFilter = {};
    if (from) postingDate.gte = new Date(from);
    if (to) postingDate.lte = new Date(to);

    const [entries, priorEntries] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: account.ledgerAccount.id,
          journal: {
            status: 'POSTED',
            ...(Object.keys(postingDate).length ? { postingDate } : {}),
          },
        },
        include: {
          journal: {
            include: {
              transaction: {
                include: {
                  customer: true,
                  payable: true,
                  receivableSource: true,
                  providerSettlementReceipt: {
                    include: {
                      settlement: {
                        include: {
                          sourceTransaction: {
                            include: { payable: true, receivableSource: true },
                          },
                        },
                      },
                    },
                  },
                  payablePayment: {
                    include: {
                      payable: {
                        include: {
                          sourceTransaction: {
                            include: { payable: true, receivableSource: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      from
        ? this.prisma.ledgerEntry.findMany({
            where: {
              ledgerAccountId: account.ledgerAccount.id,
              journal: { postingDate: { lt: new Date(from) }, status: 'POSTED' },
            },
            select: { entryType: true, amount: true },
          })
        : Promise.resolve([]),
    ]);

    const rangeStart = from ? new Date(from) : null;
    let running =
      !rangeStart || account.createdAt < rangeStart
        ? Number(account.openingBalance)
        : 0;
    for (const entry of priorEntries) {
      const amount = Number(entry.amount);
      running += account.accountNature === 'ASSET'
        ? entry.entryType === EntryType.DEBIT ? amount : -amount
        : entry.entryType === EntryType.CREDIT ? amount : -amount;
    }
    const openingBalance = running;
    let openingIntroduced = false;
    return {
      account,
      openingBalance,
      openingBalanceIntroducedInRange:
        rangeStart &&
        account.createdAt >= rangeStart &&
        (!to || account.createdAt <= new Date(to))
          ? Number(account.openingBalance)
          : 0,
      rows: entries.map((entry) => {
        if (
          !openingIntroduced &&
          rangeStart &&
          account.createdAt >= rangeStart &&
          entry.journal.postingDate >= account.createdAt
        ) {
          running += Number(account.openingBalance);
          openingIntroduced = true;
        }
        const amount = Number(entry.amount);
        running += account.accountNature === 'ASSET'
          ? entry.entryType === EntryType.DEBIT ? amount : -amount
          : entry.entryType === EntryType.CREDIT ? amount : -amount;
        return { ...entry, runningBalance: running };
      }),
    };
  }

  async customerLedger(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [transactions, payables, receivables] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { customerId },
        include: { charges: true, commissions: true, payable: true, receivableSource: true },
        orderBy: { transactionAt: 'desc' },
      }),
      this.prisma.customerPayable.findMany({
        where: { customerId },
        include: { payments: true, sourceTransaction: true },
        orderBy: { dueAt: 'desc' },
      }),
      this.prisma.customerReceivable.findMany({
        where: { customerId },
        include: {
          collections: {
            include: { destinationAccount: true },
            orderBy: { collectionDate: 'desc' },
          },
          sourceTransaction: true,
          sourceAccount: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const userIds = [...new Set(transactions.map((row) => row.createdById))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      customer,
      transactions: transactions.map((row) => ({
        ...row,
        createdBy: byId.get(row.createdById) ?? null,
      })),
      payables,
      receivables,
    };
  }
  commission(from?: string, to?: string) {
    const transactionAt: Prisma.DateTimeFilter = {};
    if (from) transactionAt.gte = new Date(from);
    if (to) transactionAt.lte = new Date(to);
    return this.prisma.transactionCommission.findMany({
      where: Object.keys(transactionAt).length ? { transaction: { transactionAt } } : {},
      include: { transaction: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  providerCharges(from?: string, to?: string) {
    const transactionAt: Prisma.DateTimeFilter = {};
    if (from) transactionAt.gte = new Date(from);
    if (to) transactionAt.lte = new Date(to);
    return this.prisma.transactionCharge.findMany({
      where: Object.keys(transactionAt).length ? { transaction: { transactionAt } } : {},
      include: { transaction: { include: { customer: true } }, provider: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async payables() {
    return this.prisma.customerPayable.findMany({
      include: { customer: true, payments: true, paymentTerm: true },
      orderBy: { dueAt: 'asc' },
    });
  }

  async receivables() {
    return this.prisma.customerReceivable.findMany({
      include: {
        customer: true,
        sourceAccount: true,
        collections: { include: { destinationAccount: true } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  providerSettlements() {
    return this.prisma.providerSettlement.findMany({
      include: {
        provider: true,
        gateway: true,
        destinationAccount: true,
        sourceTransaction: { include: { customer: true } },
        receipts: { include: { destinationAccount: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  endOfDay() {
    return this.prisma.dailyPositionSummary.findMany({
      orderBy: { businessDate: 'desc' },
      take: 365,
    });
  }

  operators() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, role: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  async dailySummary(date?: string) {
    const base = date ? new Date(date) : new Date();
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [transactions, commissions, charges] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['transactionType'],
        where: { transactionAt: { gte: start, lt: end }, status: { not: 'REVERSED' } },
        _sum: { grossAmount: true, netAmount: true },
        _count: true,
      }),
      this.prisma.transactionCommission.aggregate({
        where: { transaction: { transactionAt: { gte: start, lt: end }, status: { not: 'REVERSED' } } },
        _sum: { amount: true },
      }),
      this.prisma.transactionCharge.aggregate({
        where: { transaction: { transactionAt: { gte: start, lt: end }, status: { not: 'REVERSED' } } },
        _sum: { amount: true },
      }),
    ]);

    return {
      date: start.toISOString().slice(0, 10),
      transactions,
      commission: Number(commissions._sum.amount ?? 0),
      charges: Number(charges._sum.amount ?? 0),
    };
  }
}
