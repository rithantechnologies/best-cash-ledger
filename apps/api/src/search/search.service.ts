import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string) {
    const query = q.trim();
    if (!query) return { customers: [], transactions: [], accounts: [], providers: [] };

    const [customers, transactions, accounts, providers] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          OR: [
            { fullName: { contains: query, mode: 'insensitive' } },
            { mobile: { contains: query } },
            { customerCode: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      this.prisma.transaction.findMany({
        where: {
          OR: [
            { transactionNumber: { contains: query, mode: 'insensitive' } },
            { referenceNumber: { contains: query, mode: 'insensitive' } },
            { customer: { fullName: { contains: query, mode: 'insensitive' } } },
          ],
        },
        include: { customer: true },
        orderBy: { transactionAt: 'desc' },
        take: 10,
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
