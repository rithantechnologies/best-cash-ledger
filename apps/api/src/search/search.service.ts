import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string) {
    const query = q.trim();
    if (!query) return { customers: [], transactions: [], accounts: [], providers: [] };

    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { mobile: { contains: query } },
          { customerCode: { contains: query, mode: 'insensitive' } },
          {
            cards: {
              some: {
                lastFourDigits: { contains: query },
              },
            },
          },
        ],
      },
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
