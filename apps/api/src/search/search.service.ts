import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private identityFilters(query: string): Prisma.CustomerWhereInput[] {
    const digits = query.replace(/\D/g, '');
    const filters: Prisma.CustomerWhereInput[] = [
      { fullName: { contains: query, mode: 'insensitive' } },
      { customerCode: { contains: query, mode: 'insensitive' } },
    ];
    if (digits.length >= 3) {
      filters.push(
        { mobile: { contains: digits } },
        { cards: { some: { isActive: true, lastFourDigits: { contains: digits } } } },
      );
    }
    if (digits.length === 4) {
      filters.push({
        transactions: {
          some: {
            OR: [
              { aeps: { is: { aadhaarLastFour: { contains: digits } } } },
              { microAtm: { is: { cardLastFour: { contains: digits } } } },
            ],
          },
        },
      });
    }
    return filters;
  }

  async customerSuggestions(q: string) {
    const query = q.trim();
    const digits = query.replace(/\D/g, '');
    const hasLetters = /[a-z]/i.test(query);
    if ((hasLetters && query.length < 2) || (!hasLetters && digits.length < 3)) return [];

    const customers = await this.prisma.customer.findMany({
      where: { isActive: true, OR: this.identityFilters(query) },
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        mobile: true,
        cards: {
          where: { isActive: true },
          select: { id: true, bankName: true, cardType: true, cardNetworkId: true, cardNetwork: { select: { id: true, name: true } }, lastFourDigits: true, nickname: true, isActive: true },
          orderBy: { updatedAt: 'desc' },
        },
        bankAccounts: { where: { isActive: true }, select: { id: true } },
        upiAccounts: { where: { isActive: true }, select: { id: true } },
        beneficiaries: {
          where: { isActive: true },
          select: { accounts: { where: { isActive: true }, select: { id: true } } },
        },
        serviceProfiles: { where: { isActive: true }, select: { id: true } },
        transactions: { orderBy: { transactionAt: 'desc' }, take: 1, select: { transactionAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });

    const normalizedName = query.toLowerCase();
    const rankedCustomers = [...customers].sort((a, b) => {
      const mobileScore = (customer: typeof customers[number]) => digits.length >= 3 && (customer.mobile ?? "").replace(/\D/g, "") === digits ? 0 : 1;
      const nameScore = (customer: typeof customers[number]) => {
        const name = customer.fullName.toLowerCase();
        return name === normalizedName ? 0 : name.startsWith(normalizedName) ? 1 : 2;
      };
      return mobileScore(a) - mobileScore(b) || nameScore(a) - nameScore(b);
    });

    const history = digits.length === 4 && rankedCustomers.length
      ? await this.prisma.transaction.findMany({
          where: {
            customerId: { in: rankedCustomers.map((customer) => customer.id) },
            OR: [
              { aeps: { is: { aadhaarLastFour: { contains: digits } } } },
              { microAtm: { is: { cardLastFour: { contains: digits } } } },
            ],
          },
          select: {
            customerId: true,
            aeps: { select: { aadhaarLastFour: true } },
            microAtm: { select: { cardLastFour: true } },
          },
          orderBy: { transactionAt: 'desc' },
          take: 40,
        })
      : [];
    const historyByCustomer = new Map<string, { aadhaarLastFour?: string; microAtmCardLastFour?: string }>();
    for (const row of history) {
      if (!row.customerId || historyByCustomer.has(row.customerId)) continue;
      historyByCustomer.set(row.customerId, {
        aadhaarLastFour: row.aeps?.aadhaarLastFour,
        microAtmCardLastFour: row.microAtm?.cardLastFour,
      });
    }

    return rankedCustomers.map((customer) => {
      const card = digits ? customer.cards.find((item) => item.lastFourDigits.includes(digits)) : undefined;
      const historical = historyByCustomer.get(customer.id);
      const savedDestinationCount =
        customer.bankAccounts.length +
        customer.upiAccounts.length +
        customer.beneficiaries.reduce((sum, item) => sum + item.accounts.length, 0);
      const { bankAccounts, upiAccounts, beneficiaries, serviceProfiles, transactions, ...identity } = customer;
      return {
        ...identity,
        savedDestinationCount,
        savedServiceProfileCount: serviceProfiles.length,
        lastUsedAt: transactions[0]?.transactionAt ?? null,
        match: {
          cardLastFour: card?.lastFourDigits ?? null,
          aadhaarLastFour: historical?.aadhaarLastFour ?? null,
          microAtmCardLastFour: historical?.microAtmCardLastFour ?? null,
        },
      };
    });
  }

  async search(q: string) {
    const query = q.trim();
    if (!query) return { customers: [], transactions: [], accounts: [], providers: [] };

    const customers = await this.prisma.customer.findMany({
      where: { OR: this.identityFilters(query) },
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        mobile: true,
        isActive: true,
        cards: {
          select: {
            id: true,
            bankName: true,
            cardType: true,
            cardNetworkId: true,
            cardNetwork: { select: { id: true, name: true } },
            lastFourDigits: true,
            nickname: true,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    const matchedCustomerIds = customers.map((customer) => customer.id);
    const [transactions, accounts, providers] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          OR: [
            { transactionNumber: { contains: query, mode: 'insensitive' } },
            { referenceNumber: { contains: query, mode: 'insensitive' } },
            ...(matchedCustomerIds.length
              ? [{ customerId: { in: matchedCustomerIds } }]
              : []),
          ],
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
          customer: {
            select: {
              id: true,
              fullName: true,
              mobile: true,
            },
          },
          cardSwipe: {
            select: {
              customerCard: {
                select: {
                  lastFourDigits: true,
                  bankName: true,
                },
              },
            },
          },
        },
        orderBy: { transactionAt: 'desc' },
        take: 20,
      }),
      this.prisma.financialAccount.findMany({
        where: {
          OR: [
            { accountName: { contains: query, mode: 'insensitive' } },
            { accountCode: { contains: query, mode: 'insensitive' } },
            { bankName: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      this.prisma.provider.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        take: 10,
      }),
    ]);

    return { customers, transactions, accounts, providers };
  }
}
