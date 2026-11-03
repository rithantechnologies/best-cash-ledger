import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { exportPeriod } from './excel-export.helpers.js';

// Use integer paise for aggregation so report totals never inherit spreadsheet rounding errors.
const paise = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const rupees = (value: number) => value / 100;
const chargeTotal = (charges: { amount: unknown }[]) =>
  charges.reduce((total, charge) => total + paise(charge.amount), 0);
const allocatedCharge = (allocated: unknown, total: unknown, charges: { amount: unknown }[]) => {
  const original = paise(total);
  if (original <= 0) return 0;
  return Math.round(chargeTotal(charges) * paise(allocated) / original);
};

@Injectable()
export class CardSwipeReportService {
  constructor(private readonly prisma: PrismaService) {}

  async get(from: string, to: string, customerId?: string, providerId?: string) {
    const period = exportPeriod(from, to, 'card');
    const rows = await this.prisma.transaction.findMany({
      where: {
        transactionType: TransactionType.CARD_SWIPE,
        status: TransactionStatus.COMPLETED,
        transactionAt: { gte: period.start, lt: period.end },
        ...(customerId ? { customerId } : {}),
        ...(providerId ? { cardSwipe: { is: { providerId } } } : {}),
      },
      include: {
        customer: { select: { fullName: true, mobile: true } },
        cardSwipe: {
          include: {
            customerCard: { include: { cardNetwork: true } },
            settlementAccount: { select: { accountName: true } },
          },
        },
        providerSettlementSource: {
          include: {
            provider: { select: { name: true } },
            gateway: { select: { gatewayName: true } },
          },
        },
        payable: {
          include: {
            payments: {
              where: { status: PaymentStatus.COMPLETED },
              include: {
                sourceAccount: { select: { accountName: true } },
                transaction: { include: { charges: true } },
              },
            },
            manualLedgerAllocations: {
              where: {
                customerLedgerEntry: {
                  transaction: {
                    status: { notIn: [TransactionStatus.CANCELLED, TransactionStatus.REVERSED] },
                  },
                },
              },
              include: {
                customerLedgerEntry: {
                  include: {
                    financialAccount: { select: { accountName: true } },
                    transaction: { include: { charges: true } },
                  },
                },
              },
            },
            advanceOffsets: {
              where: { reversedAt: null },
              include: {
                advanceEntry: {
                  include: {
                    financialAccount: { select: { accountName: true } },
                    transaction: { include: { charges: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ transactionAt: 'asc' }, { id: 'asc' }],
      take: 10_001,
    });
    if (rows.length > 10_000) {
      throw new BadRequestException('More than 10,000 card swipes match. Select a shorter report period.');
    }

    const reportRows = rows.filter(row => row.cardSwipe).map(row => {
      const swipe = row.cardSwipe!;
      const payments = row.payable?.payments ?? [];
      const allocations = row.payable?.manualLedgerAllocations ?? [];
      const offsets = row.payable?.advanceOffsets ?? [];
      const sources = new Set<string>();
      let payoutFee = 0;
      for (const payment of payments) {
        if (payment.transaction.status === TransactionStatus.REVERSED ||
            payment.transaction.status === TransactionStatus.CANCELLED) continue;
        sources.add(payment.sourceAccount.accountName);
        payoutFee += chargeTotal(payment.transaction.charges);
      }
      for (const allocation of allocations) {
        const entry = allocation.customerLedgerEntry;
        sources.add(entry.financialAccount.accountName);
        payoutFee += allocatedCharge(allocation.amount, entry.amount, entry.transaction.charges);
      }
      for (const offset of offsets) {
        const entry = offset.advanceEntry;
        if (entry.transaction.status === TransactionStatus.REVERSED ||
            entry.transaction.status === TransactionStatus.CANCELLED) continue;
        sources.add(entry.financialAccount.accountName + ' (earlier Pay Out)');
        payoutFee += allocatedCharge(offset.amount, entry.amount, entry.transaction.charges);
      }

      const swipeAmount = paise(swipe.swipeAmount);
      const customerFee = paise(swipe.commissionAmount);
      const gatewayFee = paise(swipe.providerChargeAmount);
      const payableAmount = paise(swipe.customerPayableAmount);
      const remainingAmount = paise(row.payable?.remainingAmount);
      return {
        id: row.id,
        transactionNumber: row.transactionNumber,
        transactionAt: row.transactionAt,
        customerName: row.customer?.fullName ?? '—',
        mobile: row.customer?.mobile ?? '',
        cardType: [swipe.customerCard.bankName, swipe.customerCard.cardNetwork?.name ?? swipe.customerCard.cardType ?? 'CREDIT'].filter(Boolean).join(' '),
        cardLastFour: swipe.customerCard.lastFourDigits,
        swipeAmount: rupees(swipeAmount),
        customerFee: rupees(customerFee),
        gatewayFee: rupees(gatewayFee),
        payoutFee: rupees(payoutFee),
        netProfit: rupees(customerFee - gatewayFee - payoutFee),
        payableAmount: rupees(payableAmount),
        paidAmount: rupees(payableAmount - remainingAmount),
        remainingAmount: rupees(remainingAmount),
        payoutStatus: row.payable?.status ?? 'PENDING',
        payoutSources: [...sources],
        payInAccount: swipe.settlementAccount.accountName,
        provider: row.providerSettlementSource?.provider?.name ?? '—',
        gateway: row.providerSettlementSource?.gateway?.gatewayName ?? '—',
      };
    });
    const summary = reportRows.reduce((s, row) => {
      s.swipeAmount += paise(row.swipeAmount);
      s.customerFee += paise(row.customerFee);
      s.gatewayFee += paise(row.gatewayFee);
      s.payoutFee += paise(row.payoutFee);
      s.netProfit += paise(row.netProfit);
      s.payableAmount += paise(row.payableAmount);
      s.paidAmount += paise(row.paidAmount);
      s.remainingAmount += paise(row.remainingAmount);
      return s;
    }, {
      swipeAmount: 0, customerFee: 0, gatewayFee: 0, payoutFee: 0,
      netProfit: 0, payableAmount: 0, paidAmount: 0, remainingAmount: 0,
    });
    return {
      from, to, count: reportRows.length,
      summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, rupees(value)])),
      rows: reportRows,
      basis: 'Completed swipes in India Standard Time. Net profit = customer fee - gateway fee - recorded payout charges (including allocated Pay Out charges). Payable is the original customer entitlement, not the outstanding balance.',
    };
  }
}
