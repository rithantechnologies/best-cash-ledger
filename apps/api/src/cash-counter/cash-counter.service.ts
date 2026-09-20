import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CountType, EntryType, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
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

  async current(cashAccountId?: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: {
        status: 'OPEN',
        ...(cashAccountId ? { cashAccountId } : {}),
      },
      include: { cashAccount: true, denominationCounts: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) return null;
    const { expected, totalIn, totalOut, movements } =
      await this.expectedClosing(this.prisma, session);
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
      liveExpectedClosingTotal: expected,
      liveCashIn: totalIn,
      liveCashOut: totalOut,
      movements,
      openedBy: byId.get(session.openedById) ?? null,
      closedBy: session.closedById ? byId.get(session.closedById) ?? null : null,
    };
  }
  async open(dto: OpenCashSessionDto, userId: string) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { cashAccountId: dto.cashAccountId, status: 'OPEN' },
    });
    if (existing) throw new BadRequestException('Cash session is already open');

    await this.validation.cashAccount(
      this.prisma,
      dto.cashAccountId,
      'Cash counter account',
    );

    const openingTotal = this.total(dto.denominations);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.cashSession.create({
        data: {
          cashAccountId: dto.cashAccountId,
          businessDate: this.businessDate(),
          openedById: userId,
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
            openingTotal: session.openingTotal.toString(),
            businessDate: session.businessDate.toISOString(),
          },
        },
      });
      return session;
    });
  }

  private async expectedClosing(
    tx: Prisma.TransactionClient,
    session: {
      cashAccountId: string;
      openedAt: Date;
      openingTotal: Prisma.Decimal;
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
          postingDate: { gte: session.openedAt },
          status: 'POSTED',
        },
      },
      include: {
        journal: {
          include: {
            transaction: {
              select: {
                transactionNumber: true,
                transactionType: true,
                transactionAt: true,
                notes: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let expected = Number(session.openingTotal);
    let totalIn = 0;
    let totalOut = 0;
    for (const entry of entries) {
      const amount = Number(entry.amount);
      if (entry.entryType === EntryType.DEBIT) {
        expected += amount;
        totalIn += amount;
      } else {
        expected -= amount;
        totalOut += amount;
      }
    }
    const movements = entries.slice(0, 20).map((entry) => ({
      id: entry.id,
      direction: entry.entryType === EntryType.DEBIT ? 'IN' : 'OUT',
      amount: Number(entry.amount),
      description:
        entry.description ??
        entry.journal.description ??
        entry.journal.transaction.notes ??
        null,
      transactionNumber: entry.journal.transaction.transactionNumber,
      transactionType: entry.journal.transaction.transactionType,
      transactionAt: entry.journal.transaction.transactionAt,
    }));
    return { expected, account, totalIn, totalOut, movements };
  }

  async close(id: string, dto: CloseCashSessionDto, userId: string) {
    const actual = this.total(dto.denominations);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "CashSession" WHERE "id" = $1 FOR UPDATE',
        id,
      );
      const session = await tx.cashSession.findUnique({ where: { id } });
      if (!session) throw new NotFoundException('Cash session not found');
      if (session.status !== 'OPEN') {
        throw new BadRequestException('Cash session is already closed');
      }

      const { expected, account } = await this.expectedClosing(tx, session);
      const difference = actual - expected;
      if (Math.abs(difference) > 0.005 && !dto.notes?.trim()) {
        throw new BadRequestException(
          'Please add a note explaining the cash difference before closing',
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
          },
          reason: dto.notes,
        },
      });
      return updated;
    });
  }

  async history() {
    const sessions = await this.prisma.cashSession.findMany({
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
