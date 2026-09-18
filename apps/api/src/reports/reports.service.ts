import { Injectable, NotFoundException } from '@nestjs/common';
import { EntryType, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type TxFilters = {
  from?: string;
  to?: string;
  customerId?: string;
  type?: TransactionType;
  status?: string;
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
    ] : [];

    const providerOr: Prisma.TransactionWhereInput[] = filters.providerId ? [
      { cardSwipe: { providerId: filters.providerId } },
      { aeps: { providerId: filters.providerId } },
      { charges: { some: { providerId: filters.providerId } } },
    ] : [];

    const gatewayOr: Prisma.TransactionWhereInput[] = filters.gatewayId ? [
      { cardSwipe: { gatewayId: filters.gatewayId } },
      { aeps: { gatewayId: filters.gatewayId } },
      { charges: { some: { gatewayId: filters.gatewayId } } },
    ] : [];

    const rows = await this.prisma.transaction.findMany({
      where: {
        ...(Object.keys(transactionAt).length ? { transactionAt } : {}),
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.type ? { transactionType: filters.type } : {}),
        ...(filters.status ? { status: filters.status as any } : {}),
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
  async accountLedger(accountId: string, from?: string, to?: string) {
    const account = await this.prisma.financialAccount.findUnique({
      where: { id: accountId },
      include: { ledgerAccount: true },
    });
    if (!account?.ledgerAccount) throw new NotFoundException('Account ledger not found');

    const postingDate: Prisma.DateTimeFilter = {};
    if (from) postingDate.gte = new Date(from);
    if (to) postingDate.lte = new Date(to);

    const [entries, priorEntries] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: {
          ledgerAccountId: account.ledgerAccount.id,
          ...(Object.keys(postingDate).length ? { journal: { postingDate } } : {}),
        },
        include: {
          journal: { include: { transaction: { include: { customer: true } } } },
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

    let running = Number(account.openingBalance);
    for (const entry of priorEntries) {
      const amount = Number(entry.amount);
      running += account.accountNature === 'ASSET'
        ? entry.entryType === EntryType.DEBIT ? amount : -amount
        : entry.entryType === EntryType.CREDIT ? amount : -amount;
    }
    const openingBalance = running;
    return {
      account,
      openingBalance,
      rows: entries.map((entry) => {
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
        include: { charges: true, commissions: true },
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
