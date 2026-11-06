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

  // Historical evidence only: failed gateway attempts are not recorded by the swipe workflow.
  async successHistory(from?: string, to?: string) {
    const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    if ((from && !valid(from)) || (to && !valid(to)) || (from && to && from > to)) {
      throw new BadRequestException('Invalid report date range');
    }
    const transactionAt = {
      ...(from ? { gte: new Date(from + 'T00:00:00+05:30') } : {}),
      ...(to ? { lte: new Date(to + 'T23:59:59.999+05:30') } : {}),
    };
    const [swipes, providers, gateways] = await Promise.all([
      this.prisma.cardSwipeDetail.findMany({
        where: { transaction: {
          status: TransactionStatus.COMPLETED,
          ...(Object.keys(transactionAt).length ? { transactionAt } : {}),
        } },
        select: {
          customerCardId: true, providerId: true, gatewayId: true,
          transaction: { select: { id: true, transactionNumber: true, transactionAt: true,
            customer: { select: { fullName: true } } } },
          customerCard: { select: { bankName: true, cardType: true, lastFourDigits: true,
            nickname: true, cardNetwork: { select: { name: true } } } },
        },
        orderBy: [{ transaction: { transactionAt: 'desc' } }, { id: 'desc' }],
        take: 10001,
      }),
      this.prisma.provider.findMany({ select: { id: true, name: true } }),
      this.prisma.providerGateway.findMany({ select: { id: true, gatewayName: true } }),
    ]);
    if (swipes.length > 10000) {
      throw new BadRequestException('More than 10,000 successful swipes match. Select a shorter period.');
    }
    const providerNames = new Map(providers.map(p => [p.id, p.name]));
    const gatewayNames = new Map(gateways.map(g => [g.id, g.gatewayName]));
    const groups = new Map<string, {
      cardId: string; bank: string; cardType: string; network: string; lastFour: string;
      nickname: string; customer: string; providerId: string; provider: string;
      gatewayId: string; gateway: string; count: number; lastSuccess: Date;
      latestTransactionId: string; latestTransactionNumber: string;
    }>();
    for (const swipe of swipes) {
      const key = swipe.customerCardId + ':' + swipe.gatewayId;
      const row = groups.get(key);
      if (row) { row.count++; continue; }
      groups.set(key, {
        cardId: swipe.customerCardId, bank: swipe.customerCard.bankName,
        cardType: swipe.customerCard.cardType ?? '', network: swipe.customerCard.cardNetwork?.name ?? '',
        lastFour: swipe.customerCard.lastFourDigits, nickname: swipe.customerCard.nickname ?? '',
        customer: swipe.transaction.customer?.fullName ?? '',
        providerId: swipe.providerId, provider: providerNames.get(swipe.providerId) ?? 'Unknown provider',
        gatewayId: swipe.gatewayId, gateway: gatewayNames.get(swipe.gatewayId) ?? 'Unknown gateway',
        count: 1, lastSuccess: swipe.transaction.transactionAt,
        latestTransactionId: swipe.transaction.id,
        latestTransactionNumber: swipe.transaction.transactionNumber,
      });
    }
    return { totalCompleted: swipes.length, distinctCards: new Set(swipes.map(s => s.customerCardId)).size,
      groups: Array.from(groups.values()).sort((a, b) => b.lastSuccess.getTime() - a.lastSuccess.getTime()),
      note: 'Recorded completed card swipes only. Failed attempts are not tracked; counts are not success rates.' };
  }

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
        // COMPLETED means the card swipe was recorded successfully; it does not
        // imply that provider settlement or customer payout has taken place.
        payInStatus: 'SUCCESS',
        providerSettlementDueAt: swipe.dueAt,
        expectedPayoutAt: row.payable?.dueAt ?? null,
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
    // Card Due activity is intentionally separate from the original swipe register.
    // A clearing is pending by design; do not require COMPLETED for that type.
    const dueTransactions = await this.prisma.transaction.findMany({
      where: {
        AND: [{ OR: [
          { transactionType: { in: [
            TransactionType.CARD_DUE_CLEARING,
            TransactionType.CARD_DUE_RECOVERY,
            TransactionType.CARD_DUE_COMMISSION_ASSESSMENT,
            TransactionType.CARD_DUE_COMMISSION_COLLECTION,
          ] } },
          // Combined receipts use the same CUSTOMER_LEDGER_ENTRY type as Pay In,
          // but have a dedicated CDP- prefix; exclude unrelated Pay In records.
          { transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
            transactionNumber: { startsWith: 'CDP-' } },
        ] }],
        status: { notIn: [TransactionStatus.CANCELLED, TransactionStatus.REVERSED] },
        transactionAt: { gte: period.start, lt: period.end },
        ...(customerId ? { customerId } : {}),
        ...(providerId ? { AND: [
          { OR: [
          { transactionType: { in: [
            TransactionType.CARD_DUE_CLEARING,
            TransactionType.CARD_DUE_RECOVERY,
            TransactionType.CARD_DUE_COMMISSION_ASSESSMENT,
            TransactionType.CARD_DUE_COMMISSION_COLLECTION,
          ] } },
          { transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
            transactionNumber: { startsWith: 'CDP-' } },
          ] },
          { OR: [
          { cardDueRecovery: { is: { providerId } } },
          { cardDueClearing: { is: { advanceSourceAccount: { providerId } } } },
          { cardDueCommissionCollection: { is: { clearing: { advanceSourceAccount: { providerId } } } } },
          { cardDueCommissionAssessment: { is: { clearing: { advanceSourceAccount: { providerId } } } } },
          { customerLedgerEntry: { is: { allocations: { some: {
            cardDueClearing: { advanceSourceAccount: { providerId } },
          } } } } },
          ] },
        ] } : {}),
      },
      include: {
        customer: { select: { fullName: true } },
        commissions: { select: { amount: true } },
        charges: { select: { amount: true, chargeType: true } },
        cardDueClearing: { select: {
          dueAmount: true, principalRemaining: true, commissionRemaining: true,
        } },
        cardDueRecovery: { select: { swipeAmount: true, clearingId: true } },
        cardDueCommissionCollection: { select: { amount: true } },
        customerLedgerEntry: { select: { financialAccount: { select: { accountName: true } },
          allocations: { select: { targetType: true, amount: true } } } },
        cardDueCommissionAssessment: { select: { amount: true } },
      },
      orderBy: [{ transactionAt: 'asc' }, { id: 'asc' }],
      take: 10_001,
    });
    if (dueTransactions.length > 10_000) {
      throw new BadRequestException('More than 10,000 Card Due entries match. Select a shorter period.');
    }
    const dueRows = dueTransactions.map(tx => {
      const earned = tx.commissions.reduce((n, c) => n + paise(c.amount), 0);
      const providerCost = tx.charges.filter(c => c.chargeType !== 'PAYOUT')
        .reduce((n, c) => n + paise(c.amount), 0);
      const payoutCost = tx.charges.filter(c => c.chargeType === 'PAYOUT')
        .reduce((n, c) => n + paise(c.amount), 0);
      const type = tx.transactionType;
      const combinedReceipt = type === TransactionType.CUSTOMER_LEDGER_ENTRY &&
        tx.transactionNumber.startsWith('CDP-');
      const combinedPrincipal = combinedReceipt
        ? (tx.customerLedgerEntry?.allocations ?? [])
            .filter(a => a.targetType === 'CARD_DUE')
            .reduce((sum, a) => sum + paise(a.amount), 0)
        : 0;
      return {
        id: tx.id, transactionNumber: tx.transactionNumber,
        transactionAt: tx.transactionAt, customerName: tx.customer?.fullName ?? '—',
        activity: type === TransactionType.CARD_DUE_CLEARING ? 'Card Due opened'
          : type === TransactionType.CARD_DUE_RECOVERY ? 'Principal recovered'
          : type === TransactionType.CARD_DUE_COMMISSION_ASSESSMENT ? 'Extra commission assessed'
          : combinedReceipt ? 'Combined customer payment'
          : 'Commission collected',
        status: tx.status,
        principal: rupees(type === TransactionType.CARD_DUE_CLEARING
          ? paise(tx.cardDueClearing?.dueAmount)
          : combinedReceipt ? combinedPrincipal
          : paise(tx.cardDueRecovery?.swipeAmount)),
        receivedAmount: combinedReceipt ? rupees(paise(tx.grossAmount)) : null,
        receivedIn: combinedReceipt ? (tx.customerLedgerEntry?.financialAccount.accountName ?? '—') : null,
        referenceNumber: combinedReceipt ? tx.referenceNumber : null,
        remainingPrincipal: type === TransactionType.CARD_DUE_CLEARING
          ? rupees(paise(tx.cardDueClearing?.principalRemaining)) : null,
        remainingCommission: type === TransactionType.CARD_DUE_CLEARING
          ? rupees(paise(tx.cardDueClearing?.commissionRemaining)) : null,
        commissionCollected: rupees(
          paise(tx.cardDueCommissionCollection?.amount) +
          (combinedReceipt ? (tx.customerLedgerEntry?.allocations ?? [])
            .filter(a => a.targetType === 'CARD_DUE_COMMISSION')
            .reduce((sum,a) => sum + paise(a.amount), 0) : 0),
        ),
        earnedCommission: rupees(earned), providerCost: rupees(providerCost),
        payoutCost: rupees(payoutCost), netProfit: rupees(earned - providerCost - payoutCost),
      };
    });
    const dueSummary = dueRows.reduce((s, row) => {
      s.earnedCommission += paise(row.earnedCommission);
      s.providerCost += paise(row.providerCost);
      s.payoutCost += paise(row.payoutCost);
      s.netProfit += paise(row.netProfit);
      s.principalRecovered += ['Principal recovered', 'Combined customer payment'].includes(row.activity)
        ? paise(row.principal) : 0;
      return s;
    }, { earnedCommission: 0, providerCost: 0, payoutCost: 0, netProfit: 0, principalRecovered: 0 });
    // Independent of the selected swipe date: a payout due tomorrow must remain
    // visible even when its card swipe happened on an earlier day.
    const outstandingPayables = await this.prisma.customerPayable.findMany({
      where: {
        remainingAmount: { gt: 0 },
        ...(customerId ? { customerId } : {}),
        sourceTransaction: {
          transactionType: TransactionType.CARD_SWIPE,
          status: TransactionStatus.COMPLETED,
          ...(providerId ? { cardSwipe: { is: { providerId } } } : {}),
        },
      },
      select: {
        sourceTransactionId: true,
        dueAt: true,
        originalAmount: true,
        remainingAmount: true,
        sourceTransaction: { select: {
          transactionAt: true, transactionNumber: true,
          customer: { select: { fullName: true } },
        } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      take: 1001,
    });
    const pendingPayouts = outstandingPayables.slice(0, 1000).map(p => ({
      id: p.sourceTransactionId,
      transactionNumber: p.sourceTransaction.transactionNumber,
      transactionAt: p.sourceTransaction.transactionAt,
      customerName: p.sourceTransaction.customer?.fullName ?? '—',
      expectedPayoutAt: p.dueAt,
      payableAmount: rupees(paise(p.originalAmount)),
      paidAmount: rupees(paise(p.originalAmount) - paise(p.remainingAmount)),
      remainingAmount: rupees(paise(p.remainingAmount)),
    }));
    return {
      cardDue: {
        rows: dueRows,
        summary: Object.fromEntries(Object.entries(dueSummary).map(([k, v]) => [k, rupees(v)])),
      },
      pendingPayouts, pendingTruncated: outstandingPayables.length > 1000,
      from, to, count: reportRows.length,
      summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, rupees(value)])),
      rows: reportRows,
      basis: 'Completed swipes in India Standard Time. Net profit = customer fee - gateway fee - recorded payout charges (including allocated Pay Out charges). Payable is the original customer entitlement, not the outstanding balance.',
    };
  }
}
