import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CountType, EntryType, Prisma, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
import { OpenCashSessionDto } from './dto/open-cash-session.dto.js';

@Injectable()
export class CashCounterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly validation: FinancialValidationService,
  ) {}

  private businessDate() {
    const now = new Date();
    const local = new Date(now.getTime() + 330 * 60 * 1000);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  }

  private total(denominations: { denomination: number; quantity: number }[]) {
    return denominations.reduce((sum, d) => sum + d.denomination * d.quantity, 0);
  }

  private async hydrateSession(session: {
    id: string;
    cashAccountId: string;
    businessDate: Date;
    openedById: string;
    openedAt: Date;
    openingTotal: Prisma.Decimal;
    expectedClosingTotal: Prisma.Decimal | null;
    actualClosingTotal: Prisma.Decimal | null;
    differenceAmount: Prisma.Decimal | null;
    closedById: string | null;
    closedAt: Date | null;
    closingNotes: string | null;
    adjustmentTransactionId: string | null;
    status: any;
    cashAccount: any;
    denominationCounts: any[];
  }) {
    const {
      expected,
      totalIn,
      totalOut,
      movements,
      activities,
      serviceSummary,
      commissionEarned,
    } = await this.expectedClosing(this.prisma, session);
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: [session.openedById, session.closedById]
            .filter((id): id is string => Boolean(id)),
        },
      },
      select: { id: true, fullName: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return {
      ...session,
      liveExpectedClosingTotal:
        session.status === 'CLOSED' && session.expectedClosingTotal !== null
          ? Number(session.expectedClosingTotal)
          : expected,
      liveCashIn: totalIn,
      liveCashOut: totalOut,
      movements,
      activities,
      serviceSummary,
      commissionEarned,
      transactionCount: activities.length,
      openedBy: byId.get(session.openedById) ?? null,
      closedBy: session.closedById
        ? byId.get(session.closedById) ?? null
        : null,
    };
  }

  async today(cashAccountId?: string, userId?: string, actorRole?: RoleName) {
    const session = await this.prisma.cashSession.findFirst({
      where: {
        businessDate: this.businessDate(),
        ...(actorRole === RoleName.STAFF
          ? {
              openedById: userId,
              cashAccount: { accountName: { not: 'Main Cash Reserve' } },
              ...(cashAccountId ? { cashAccountId } : {}),
            }
          : cashAccountId
            ? { cashAccountId }
            : {}),
      },
      include: { cashAccount: true, denominationCounts: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) return null;
    return this.hydrateSession(session);
  }

  async current(cashAccountId?: string, userId?: string, actorRole?: RoleName) {
    const session = await this.prisma.cashSession.findFirst({
      where: {
        status: 'OPEN',
        ...(actorRole === RoleName.STAFF
          ? {
              openedById: userId,
              cashAccount: { accountName: { not: 'Main Cash Reserve' } },
              ...(cashAccountId ? { cashAccountId } : {}),
            }
          : cashAccountId
            ? { cashAccountId }
            : {}),
      },
      include: { cashAccount: true, denominationCounts: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) return null;
    return this.hydrateSession(session);
  }

  async open(dto: OpenCashSessionDto, userId: string, actorRole: RoleName) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { cashAccountId: dto.cashAccountId, status: 'OPEN' },
    });
    if (existing) throw new BadRequestException('Cash session is already open');

    const responsibleUserId = dto.responsibleUserId ?? userId;
    if (responsibleUserId !== userId && actorRole === RoleName.STAFF) {
      throw new ForbiddenException('Staff can only open a cash session for themselves');
    }
    const responsibleUser = await this.prisma.user.findUnique({
      where: { id: responsibleUserId },
      select: { id: true, fullName: true, isActive: true },
    });
    if (!responsibleUser?.isActive) {
      throw new BadRequestException('Responsible cash operator is not active');
    }

    const openingTotal = this.total(dto.denominations);
    if (dto.sourceCashAccountId === dto.cashAccountId) {
      throw new BadRequestException('Opening source must be a different cash account');
    }

    return this.prisma.$transaction(async (tx) => {
      const destination = await this.validation.cashAccount(
        tx,
        dto.cashAccountId,
        'Cash counter account',
      );
      if (
        actorRole === RoleName.STAFF &&
        destination.accountName === 'Main Cash Reserve'
      ) {
        throw new ForbiddenException('Main Cash Reserve is owner-only');
      }

      let fundingTransactionId: string | null = null;
      if (dto.sourceCashAccountId && openingTotal > 0) {
        const source = await this.validation.cashAccount(
          tx,
          dto.sourceCashAccountId,
          'Opening cash source',
        );
        for (const accountId of [source.id, destination.id].sort()) {
          await this.validation.lockAccount(tx, accountId);
        }
        await this.validation.requireOpenCashDesk(
          tx,
          source.id,
          'Opening cash source',
        );
        await this.validation.ensureSufficientFunds(tx, source, openingTotal);

        const funding = await tx.transaction.create({
          data: {
            transactionNumber: 'INT-' + Date.now().toString(36).toUpperCase(),
            transactionType: TransactionType.INTERNAL_TRANSFER,
            transactionAt: new Date(),
            grossAmount: new Prisma.Decimal(openingTotal),
            netAmount: new Prisma.Decimal(openingTotal),
            status: TransactionStatus.COMPLETED,
            referenceNumber: 'CASH-SESSION-OPEN',
            notes: dto.notes ?? ('Opening cash for ' + responsibleUser.fullName),
            createdById: userId,
          },
        });
        fundingTransactionId = funding.id;
        await tx.internalTransferDetail.create({
          data: {
            transactionId: funding.id,
            sourceAccountId: source.id,
            destinationAccountId: destination.id,
            transferAmount: new Prisma.Decimal(openingTotal),
            chargeAmount: new Prisma.Decimal(0),
            referenceNumber: 'CASH-SESSION-OPEN',
          },
        });
        await this.ledger.post(tx, funding.id, userId, 'Cash session opening transfer', [
          {
            ledgerAccountId: destination.ledgerAccount!.id,
            entryType: EntryType.DEBIT,
            amount: openingTotal,
            description: 'Cash issued to drawer',
          },
          {
            ledgerAccountId: source.ledgerAccount!.id,
            entryType: EntryType.CREDIT,
            amount: openingTotal,
            description: 'Cash issued from reserve',
          },
        ]);
      }

      const session = await tx.cashSession.create({
        data: {
          cashAccountId: dto.cashAccountId,
          businessDate: this.businessDate(),
          openedById: responsibleUserId,
          openedAt: new Date(),
          openingTotal: new Prisma.Decimal(openingTotal),
          status: 'OPEN',
          denominationCounts: {
            create: dto.denominations.map((d) => ({
              countType: CountType.OPENING,
              denomination: new Prisma.Decimal(d.denomination),
              quantity: d.quantity,
              totalAmount: new Prisma.Decimal(d.denomination * d.quantity),
            })),
          },
        },
        include: { denominationCounts: true, cashAccount: true },
      });
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CASH_SESSION',
          entityId: session.id,
          action: 'OPEN',
          newValues: {
            cashAccountId: session.cashAccountId,
            responsibleUserId,
            responsibleUserName: responsibleUser.fullName,
            openingTotal: session.openingTotal.toString(),
            businessDate: session.businessDate.toISOString(),
            sourceCashAccountId: dto.sourceCashAccountId ?? null,
            fundingTransactionId,
          },
          reason: dto.notes,
        },
      });
      return session;
    });
  }

  private async expectedClosing(
    tx: Prisma.TransactionClient | PrismaService,
    session: {
      cashAccountId: string;
      openedById: string;
      openedAt: Date;
      openingTotal: Prisma.Decimal;
      closedAt?: Date | null;
      adjustmentTransactionId?: string | null;
    },
  ) {
    const account = await tx.financialAccount.findUnique({
      where: { id: session.cashAccountId },
      include: { ledgerAccount: true },
    });
    if (!account?.ledgerAccount) {
      throw new NotFoundException('Cash ledger account not found');
    }

    const entries = await tx.ledgerEntry.findMany({
      where: {
        ledgerAccountId: account.ledgerAccount.id,
        journal: {
          postingDate: {
            gte: session.openedAt,
            ...(session.closedAt ? { lte: session.closedAt } : {}),
          },
          status: 'POSTED',
          ...(session.adjustmentTransactionId
            ? { transactionId: { not: session.adjustmentTransactionId } }
            : {}),
        },
      },
      include: {
        journal: {
          include: {
            transaction: {
              select: {
                id: true,
                transactionNumber: true,
                transactionType: true,
                transactionAt: true,
                grossAmount: true,
                netAmount: true,
                notes: true,
                customer: { select: { id: true, fullName: true } },
                commissions: { select: { amount: true } },
                charges: { select: { amount: true, chargeType: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const transactionIds = [
      ...new Set(entries.map((entry) => entry.journal.transaction.id)),
    ];
    const payoutLinks = transactionIds.length
      ? await tx.payablePayment.findMany({
          where: { transactionId: { in: transactionIds } },
          select: {
            transactionId: true,
            payable: {
              select: {
                sourceTransaction: {
                  select: {
                    id: true,
                    transactionNumber: true,
                    transactionType: true,
                    transactionAt: true,
                    grossAmount: true,
                    netAmount: true,
                    notes: true,
                    customer: { select: { id: true, fullName: true } },
                    commissions: { select: { amount: true } },
                charges: { select: { amount: true, chargeType: true } },
                  },
                },
              },
            },
          },
        })
      : [];
    const payoutOriginByTransactionId = new Map(
      payoutLinks.map((link) => [
        link.transactionId,
        link.payable.sourceTransaction,
      ]),
    );
    const activityTransactionIds = [
      ...new Set([
        ...transactionIds,
        ...payoutLinks.map((link) => link.payable.sourceTransaction.id),
      ]),
    ];
    const quickCashDetails = activityTransactionIds.length
      ? await tx.quickCashTransferDetail.findMany({
          where: { transactionId: { in: activityTransactionIds } },
          select: { transactionId: true, direction: true, purpose: true },
        })
      : [];
    const quickCashByTransactionId = new Map(
      quickCashDetails.map((detail) => [detail.transactionId, detail]),
    );

    let expected = Number(session.openingTotal);
    let totalIn = 0;
    let totalOut = 0;
    let runningBalance = Number(session.openingTotal);
    const movements: any[] = [];
    const activityMap = new Map<string, any>();

    for (const entry of entries) {
      const amount = Number(entry.amount);
      const cashTransaction = entry.journal.transaction;
      const origin =
        payoutOriginByTransactionId.get(cashTransaction.id) ??
        cashTransaction;
      const quickCashDetail = quickCashByTransactionId.get(origin.id);
      const commissionAmount = origin.commissions.reduce(
        (sum, commission) => sum + Number(commission.amount),
        0,
      );
      const providerFeeAmount = (origin.charges ?? [])
        .filter((charge) => !charge.chargeType.startsWith('PAYOUT'))
        .reduce((sum, charge) => sum + Number(charge.amount), 0);
      const payoutChargeAmount = (origin.charges ?? [])
        .filter((charge) => charge.chargeType.startsWith('PAYOUT'))
        .reduce((sum, charge) => sum + Number(charge.amount), 0);
      const profitAmount = commissionAmount - providerFeeAmount - payoutChargeAmount;
      const direction =
        entry.entryType === EntryType.DEBIT ? 'IN' : 'OUT';

      if (direction === 'IN') {
        expected += amount;
        totalIn += amount;
        runningBalance += amount;
      } else {
        expected -= amount;
        totalOut += amount;
        runningBalance -= amount;
      }

      const particular =
        origin.customer?.fullName ??
        origin.notes ??
        entry.description ??
        origin.transactionNumber;
      const activityId = origin.id;

      movements.push({
        id: entry.id,
        activityId,
        transactionId: origin.id,
        direction,
        amount,
        runningBalance,
        description: particular,
        transactionNumber: origin.transactionNumber,
        transactionType: origin.transactionType,
        transactionAt: cashTransaction.transactionAt,
        grossAmount: Number(origin.grossAmount),
        netAmount: Number(origin.netAmount ?? origin.grossAmount),
        commissionAmount,
        providerFeeAmount,
        payoutChargeAmount,
        profitAmount,
      });

      const activity = activityMap.get(activityId) ?? {
        id: activityId,
        transactionId: origin.id,
        transactionNumber: origin.transactionNumber,
        serviceType: origin.transactionType,
        transactionAt: cashTransaction.transactionAt,
        particular,
        transactionAmount: Number(origin.grossAmount),
        netAmount: Number(origin.netAmount ?? origin.grossAmount),
        cashIn: 0,
        cashOut: 0,
        commissionAmount,
        providerFeeAmount,
        payoutChargeAmount,
        profitAmount,
        quickCashDirection: quickCashDetail?.direction ?? null,
        quickCashPurpose: quickCashDetail?.purpose ?? null,
        runningBalance,
        movementCount: 0,
      };
      if (direction === 'IN') activity.cashIn += amount;
      else activity.cashOut += amount;
      activity.runningBalance = runningBalance;
      activity.movementCount += 1;
      if (
        new Date(cashTransaction.transactionAt).getTime() >
        new Date(activity.transactionAt).getTime()
      ) {
        activity.transactionAt = cashTransaction.transactionAt;
      }
      activityMap.set(activityId, activity);
    }

    // Keep the Daily Cash activity ledger strictly tied to physical cash
    // movements. Commission-only transactions (for example, a card swipe
    // paid out through bank/UPI/wallet) still contribute to the session
    // commission metric, but must not appear as drawer activity.
    const sessionCommissionTransactions = await tx.transaction.findMany({
      where: {
        transactionAt: {
          gte: session.openedAt,
          ...(session.closedAt ? { lte: session.closedAt } : {}),
        },
        createdById: session.openedById,
        status: {
          notIn: [
            TransactionStatus.FAILED,
            TransactionStatus.CANCELLED,
            TransactionStatus.REVERSED,
          ],
        },
        commissions: { some: {} },
      },
      select: {
        commissions: { select: { amount: true } },
      },
    });

    const activities = [...activityMap.values()].sort(
      (a, b) =>
        new Date(a.transactionAt).getTime() -
        new Date(b.transactionAt).getTime(),
    );
    let activityRunningBalance = Number(session.openingTotal);
    for (const activity of activities) {
      activityRunningBalance += activity.cashIn - activity.cashOut;
      activity.runningBalance = activityRunningBalance;
    }

    const serviceMap = new Map<string, any>();
    for (const activity of activities) {
      const row = serviceMap.get(activity.serviceType) ?? {
        id: activity.serviceType,
        transactionAmount: 0,
        cashIn: 0,
        cashOut: 0,
        commissionAmount: 0,
        count: 0,
      };
      row.transactionAmount += activity.transactionAmount;
      row.cashIn += activity.cashIn;
      row.cashOut += activity.cashOut;
      row.commissionAmount += activity.commissionAmount;
      row.count += 1;
      serviceMap.set(activity.serviceType, row);
    }
    const serviceSummary = [...serviceMap.values()].sort(
      (a, b) =>
        b.cashIn +
        b.cashOut -
        (a.cashIn + a.cashOut),
    );
    const commissionEarned = sessionCommissionTransactions.reduce(
      (sum, transaction) =>
        sum +
        transaction.commissions.reduce(
          (transactionSum, commission) =>
            transactionSum + Number(commission.amount),
          0,
        ),
      0,
    );

    return {
      expected,
      account,
      totalIn,
      totalOut,
      movements,
      activities,
      serviceSummary,
      commissionEarned,
    };
  }

  async close(
    id: string,
    dto: CloseCashSessionDto,
    userId: string,
    actorRole: RoleName,
  ) {
    const actual = this.total(dto.denominations);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "CashSession" WHERE "id" = $1 FOR UPDATE',
        id,
      );
      const session = await tx.cashSession.findUnique({
        where: { id },
        include: { cashAccount: true },
      });
      if (!session) throw new NotFoundException('Cash session not found');
      if (
        actorRole === RoleName.STAFF &&
        (session.openedById !== userId ||
          session.cashAccount.accountName === 'Main Cash Reserve')
      ) {
        throw new ForbiddenException('Staff can only close their own staff cash session');
      }
      if (session.status !== 'OPEN') {
        throw new BadRequestException('Cash session is already closed');
      }

      const { expected, account } = await this.expectedClosing(tx, session);
      const difference = actual - expected;
      if (Math.abs(difference) > 0.005) {
        throw new BadRequestException(
          'Closing cash does not match the expected drawer. Difference: ' +
            difference.toFixed(2) +
            '. Review missing cash in/out transactions before closing.',
        );
      }
      let adjustmentTransactionId: string | null = null;

      if (Math.abs(difference) > 0.005) {
        const varianceLedger = await tx.ledgerAccount.findUnique({
          where: { ledgerCode: 'SYS-CASH-OVER-SHORT' },
        });
        if (!varianceLedger) {
          throw new Error('Cash over / short ledger missing');
        }
        const adjustment = await tx.transaction.create({
          data: {
            transactionNumber:
              'CADJ-' + Date.now().toString(36).toUpperCase(),
            transactionType: TransactionType.CASH_ADJUSTMENT,
            transactionAt: new Date(),
            grossAmount: new Prisma.Decimal(Math.abs(difference)),
            netAmount: new Prisma.Decimal(Math.abs(difference)),
            status: TransactionStatus.COMPLETED,
            referenceNumber: 'CASH-SESSION-' + session.id,
            notes:
              dto.notes ??
              (difference > 0 ? 'Cash over adjustment' : 'Cash short adjustment'),
            createdById: userId,
          },
        });
        adjustmentTransactionId = adjustment.id;
        const cashEntryType =
          difference > 0 ? EntryType.DEBIT : EntryType.CREDIT;
        const varianceEntryType =
          difference > 0 ? EntryType.CREDIT : EntryType.DEBIT;
        await this.ledger.post(
          tx,
          adjustment.id,
          userId,
          'Cash counter physical variance adjustment',
          [
            {
              ledgerAccountId: account.ledgerAccount!.id,
              entryType: cashEntryType,
              amount: Math.abs(difference),
              description: 'Physical cash variance',
            },
            {
              ledgerAccountId: varianceLedger.id,
              entryType: varianceEntryType,
              amount: Math.abs(difference),
              description:
                difference > 0 ? 'Cash over' : 'Cash shortage',
            },
          ],
        );
      }

      const updated = await tx.cashSession.update({
        where: { id },
        data: {
          expectedClosingTotal: new Prisma.Decimal(expected),
          actualClosingTotal: new Prisma.Decimal(actual),
          differenceAmount: new Prisma.Decimal(difference),
          adjustmentTransactionId,
          closedById: userId,
          closedAt: new Date(),
          closingNotes: dto.notes,
          status: 'CLOSED',
          denominationCounts: {
            create: dto.denominations.map((d) => ({
              countType: CountType.CLOSING,
              denomination: new Prisma.Decimal(d.denomination),
              quantity: d.quantity,
              totalAmount: new Prisma.Decimal(
                d.denomination * d.quantity,
              ),
            })),
          },
        },
        include: { denominationCounts: true, cashAccount: true },
      });

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CASH_SESSION',
          entityId: id,
          action: 'CLOSE',
          oldValues: { status: session.status },
          newValues: {
            status: updated.status,
            expectedClosingTotal:
              updated.expectedClosingTotal?.toString() ?? null,
            actualClosingTotal:
              updated.actualClosingTotal?.toString() ?? null,
            differenceAmount:
              updated.differenceAmount?.toString() ?? null,
            adjustmentTransactionId,
            handoverToUserId: dto.handoverToUserId ?? null,
            handoverToCashAccountId: dto.handoverToCashAccountId ?? null,
          },
          reason: dto.notes,
        },
      });

      let targetUser: { id: string; fullName: string } | null = null;
      if (dto.handoverToUserId) {
        const user = await tx.user.findUnique({
          where: { id: dto.handoverToUserId },
          select: { id: true, fullName: true, isActive: true },
        });
        if (!user?.isActive) {
          throw new BadRequestException('Handover operator is not active');
        }
        targetUser = { id: user.id, fullName: user.fullName };
      }

      const destinationAccountId =
        dto.handoverToCashAccountId ?? session.cashAccountId;
      let handoverTransactionId: string | null = null;

      if (
        dto.handoverToCashAccountId &&
        dto.handoverToCashAccountId !== session.cashAccountId &&
        actual > 0
      ) {
        const destination = await this.validation.cashAccount(
          tx,
          dto.handoverToCashAccountId,
          'Handover cash destination',
        );
        await this.validation.ensureSufficientFunds(tx, account, actual);

        const handover = await tx.transaction.create({
          data: {
            transactionNumber: 'INT-' + Date.now().toString(36).toUpperCase(),
            transactionType: TransactionType.INTERNAL_TRANSFER,
            transactionAt: new Date(),
            grossAmount: new Prisma.Decimal(actual),
            netAmount: new Prisma.Decimal(actual),
            status: TransactionStatus.COMPLETED,
            referenceNumber: 'CASH-HANDOVER-' + session.id,
            notes:
              dto.notes ??
              ('Cash handover from ' + updated.cashAccount.accountName),
            createdById: userId,
          },
        });
        handoverTransactionId = handover.id;
        await tx.internalTransferDetail.create({
          data: {
            transactionId: handover.id,
            sourceAccountId: session.cashAccountId,
            destinationAccountId: destination.id,
            transferAmount: new Prisma.Decimal(actual),
            chargeAmount: new Prisma.Decimal(0),
            referenceNumber: 'CASH-HANDOVER-' + session.id,
          },
        });
        await this.ledger.post(tx, handover.id, userId, 'Cash drawer handover', [
          {
            ledgerAccountId: destination.ledgerAccount!.id,
            entryType: EntryType.DEBIT,
            amount: actual,
            description: 'Cash handover received',
          },
          {
            ledgerAccountId: account.ledgerAccount!.id,
            entryType: EntryType.CREDIT,
            amount: actual,
            description: 'Cash handover sent',
          },
        ]);
      }

      let nextSession: any = null;
      if (targetUser) {
        const existingDestinationSession = await tx.cashSession.findFirst({
          where: { cashAccountId: destinationAccountId, status: 'OPEN' },
          include: { cashAccount: true, denominationCounts: true },
        });

        if (existingDestinationSession) {
          if (existingDestinationSession.openedById !== targetUser.id) {
            throw new BadRequestException(
              'Destination drawer is already assigned to another operator',
            );
          }
          nextSession = existingDestinationSession;
        } else {
          nextSession = await tx.cashSession.create({
            data: {
              cashAccountId: destinationAccountId,
              businessDate: this.businessDate(),
              openedById: targetUser.id,
              openedAt: new Date(),
              openingTotal: new Prisma.Decimal(actual),
              status: 'OPEN',
              denominationCounts: {
                create: dto.denominations.map((d) => ({
                  countType: CountType.OPENING,
                  denomination: new Prisma.Decimal(d.denomination),
                  quantity: d.quantity,
                  totalAmount: new Prisma.Decimal(d.denomination * d.quantity),
                })),
              },
            },
            include: { cashAccount: true, denominationCounts: true },
          });
          await tx.auditLog.create({
            data: {
              userId,
              entityType: 'CASH_SESSION',
              entityId: nextSession.id,
              action: 'HANDOVER_OPEN',
              newValues: {
                cashAccountId: destinationAccountId,
                responsibleUserId: targetUser.id,
                responsibleUserName: targetUser.fullName,
                openingTotal: actual.toString(),
                fromSessionId: session.id,
                handoverTransactionId,
              },
            },
          });
        }
      }

      return {
        ...updated,
        handoverTransactionId,
        nextSession,
      };
    });
  }

  async operators() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, role: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  async history(userId?: string, actorRole?: RoleName) {
    const sessions = await this.prisma.cashSession.findMany({
      where:
        actorRole === RoleName.STAFF
          ? {
              openedById: userId,
              cashAccount: { accountName: { not: 'Main Cash Reserve' } },
            }
          : undefined,
      include: { cashAccount: true, denominationCounts: true },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    const userIds = [
      ...new Set(
        sessions.flatMap((session) =>
          [session.openedById, session.closedById].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return sessions.map((session) => ({
      ...session,
      openedBy: byId.get(session.openedById) ?? null,
      closedBy: session.closedById ? byId.get(session.closedById) ?? null : null,
    }));
  }
}
