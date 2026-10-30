import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { findCustomerIdsForSearch } from '../customers/customer-search-filter.js';
import { sortCustomerMatches } from './customer-search-rank.js';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async customerSuggestions(q: string) {
    const query = q.trim();
    const digits = query.replace(/\D/g, '');
    if (query.length < 2) return [];

    const matchingIds = await findCustomerIdsForSearch(this.prisma, query);
    const customers = await this.prisma.customer.findMany({
      where: { isActive: true, id: { in: matchingIds } },
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        mobile: true,
        ebNumber: true,
        cards: {
          where: { isActive: true },
          select: { id: true, bankName: true, cardType: true, cardNetworkId: true, cardNetwork: { select: { id: true, name: true } }, lastFourDigits: true, nickname: true, isActive: true },
          orderBy: { updatedAt: 'desc' },
        },
        bankAccounts: { where: { isActive: true }, select: { id: true, bankName: true, accountReference: true } },
        upiAccounts: { where: { isActive: true }, select: { id: true, accountName: true, upiId: true, mobileNumber: true } },
        beneficiaries: {
          where: { isActive: true },
          select: { accounts: { where: { isActive: true }, select: { id: true, accountReference: true, upiId: true, mobileNumber: true } } },
        },
        serviceProfiles: { where: { isActive: true }, select: { id: true, serviceName: true, referenceNumber: true, nickname: true, ownerName: true } },
        transactions: { orderBy: { transactionAt: 'desc' }, take: 1, select: { transactionAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const normalizedName = query.toLowerCase();
    const rankedCustomers = sortCustomerMatches(customers, query);

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
      const bank = customer.bankAccounts.find(item =>
        (digits.length >= 3 && item.accountReference.includes(digits)) ||
        item.bankName.toLowerCase().includes(normalizedName));
      const upi = customer.upiAccounts.find(item =>
        (item.upiId ?? '').toLowerCase().includes(normalizedName) ||
        (digits.length >= 3 && (item.mobileNumber ?? '').includes(digits)));
      const recipient = customer.beneficiaries.flatMap(item => item.accounts).find(item =>
        digits.length >= 3 && (item.accountReference ?? '').includes(digits));
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
        ebNumbers: serviceProfiles.filter(profile => profile.serviceName === 'Eb Bill').map(profile => ({ id: profile.id, number: profile.referenceNumber, label: profile.nickname, ownerName: profile.ownerName })),
        lastUsedAt: transactions[0]?.transactionAt ?? null,
        match: {
          cardLastFour: card?.lastFourDigits ?? null,
          bankLastFour: bank?.accountReference.replace(/\D/g, '').slice(-4) ?? null,
          bankName: bank?.bankName ?? null,
          upiAccountName: upi?.accountName ?? null,
          recipientLastFour: recipient?.accountReference?.replace(/\D/g, '').slice(-4) ?? null,
          aadhaarLastFour: historical?.aadhaarLastFour ?? null,
          microAtmCardLastFour: historical?.microAtmCardLastFour ?? null,
        },
      };
    });
  }

  async search(q: string) {
    const query = q.trim();
    if (!query) return { customers: [], transactions: [], accounts: [], providers: [] };

    const matchingIds = await findCustomerIdsForSearch(this.prisma, query, true);
    // Pick the top names BEFORE limiting to ten detailed results. Otherwise,
    // ten recently edited internal-substring matches can hide "MU..." names.
    const identities = await this.prisma.customer.findMany({
      where: { id: { in: matchingIds } },
      select: { id: true, fullName: true, mobile: true },
    });
    const priorityIds = sortCustomerMatches(identities, query).slice(0, 10).map(c => c.id);
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: priorityIds } },
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        mobile: true,
        isActive: true,
        bankAccounts: { where: { isActive: true }, select: { bankName: true, accountReference: true } },
        upiAccounts: { where: { isActive: true }, select: { accountName: true, upiId: true, mobileNumber: true } },
        beneficiaries: { where: { isActive: true }, select: { accounts: { where: { isActive: true }, select: { accountReference: true } } } },
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
    });

    const rankedGlobalCustomers = sortCustomerMatches(customers, query);
    const matchedCustomerIds = rankedGlobalCustomers.map((customer) => customer.id);
    // Keep complete saved account numbers on the customer detail endpoint only.
    const safeCustomers = rankedGlobalCustomers.map(({ bankAccounts, upiAccounts, beneficiaries, ...customer }) => {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const digits = query.replace(/\D/g, '');
      const bank = bankAccounts.find(item =>
        (digits.length >= 3 && item.accountReference.includes(digits)) ||
        terms.some(term => item.bankName.toLowerCase().includes(term)));
      const upi = upiAccounts.find(item =>
        terms.some(term => (item.upiId ?? '').toLowerCase().includes(term)) ||
        (digits.length >= 3 && (item.mobileNumber ?? '').includes(digits)));
      const recipient = beneficiaries.flatMap(item => item.accounts).find(item =>
        digits.length >= 3 && (item.accountReference ?? '').includes(digits));
      return { ...customer, match: {
        bankName: bank?.bankName ?? null,
        bankLastFour: bank?.accountReference.replace(/\D/g, '').slice(-4) ?? null,
        upiAccountName: upi?.accountName ?? null,
        recipientLastFour: recipient?.accountReference?.replace(/\D/g, '').slice(-4) ?? null,
      } };
    });
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

    return { customers: safeCustomers, transactions, accounts, providers };
  }
}
