import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, JournalStatus, Prisma, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto.js';
import { retryReminder } from './reminder-windows.js';

const taskInclude = {
  customer: { select: { id: true, fullName: true, mobile: true } },
  card: { select: { id: true, bankName: true, lastFourDigits: true } },
  provider: { select: { id: true, name: true } },
  gateway: { select: { id: true, gatewayName: true } },
  account: { select: { id: true, accountName: true, accountType: true } },
  sourceTransaction: { select: { id: true, transactionNumber: true, transactionAt: true, status: true } },
  receiptTransaction: {
    select: {
      id: true, transactionNumber: true, status: true,
      journal: { select: {
        status: true,
        entries: { select: {
          entryType: true, amount: true,
          ledgerAccount: { select: { financialAccountId: true } },
        } },
      } },
    },
  },
  createdBy: { select: { id: true, fullName: true } },
} as const;

function receiptPosted(task: {
  kind: string; status: string; accountId: string | null; expectedAmount: Prisma.Decimal | null;
  receiptTransaction: null | {
    status: TransactionStatus;
    journal: null | {
      status: JournalStatus;
      entries: { entryType: string; amount: Prisma.Decimal; ledgerAccount: { financialAccountId: string | null } }[];
    };
  };
}) {
  if (task.kind !== 'BANK_REFUND' || task.status !== 'COMPLETED' || !task.receiptTransaction) return false;
  const transaction = task.receiptTransaction;
  if (transaction.status !== TransactionStatus.COMPLETED || transaction.journal?.status !== JournalStatus.POSTED)
    return false;
  const credit = transaction.journal.entries
    .filter(entry => entry.entryType === 'DEBIT' && entry.ledgerAccount.financialAccountId === task.accountId)
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  return credit + 0.001 >= Number(task.expectedAmount ?? 0);
}

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  private format(task: any) {
    return {
      ...task,
      receiptVerified: receiptPosted(task),
      // A later reversal makes the historical completed flag unsafe to trust.
      needsReceiptReview: task.kind === 'BANK_REFUND' && task.status === 'COMPLETED'
        && !receiptPosted(task),
    };
  }

  private readonly reversedRefund: Prisma.FollowUpTaskWhereInput = {
    kind: 'BANK_REFUND', status: 'COMPLETED',
    OR: [
      { receiptTransactionId: null },
      { receiptTransaction: { is: { status: { not: TransactionStatus.COMPLETED } } } },
    ],
  };

  async summary() {
    const now = new Date();
    const refundPendingFilter: Prisma.FollowUpTaskWhereInput = {
      kind: 'BANK_REFUND', OR: [{ status: 'OPEN' }, this.reversedRefund],
    };
    const [open, due, cardRetries, pendingRefunds, refundTotal, reversedRefunds] = await Promise.all([
      this.prisma.followUpTask.count({ where: { status: 'OPEN' } }),
      this.prisma.followUpTask.count({ where: { status: 'OPEN', nextReminderAt: { lte: now } } }),
      this.prisma.followUpTask.count({ where: { status: 'OPEN', kind: 'CARD_RETRY' } }),
      this.prisma.followUpTask.count({ where: refundPendingFilter }),
      this.prisma.followUpTask.aggregate({
        where: refundPendingFilter,
        _sum: { expectedAmount: true },
      }),
      this.prisma.followUpTask.count({ where: this.reversedRefund }),
    ]);
    return {
      open: open + reversedRefunds, due: due + reversedRefunds,
      cardRetries, pendingRefunds, needsReceiptReview: reversedRefunds,
      expectedRefundTotal: refundTotal._sum.expectedAmount ?? 0,
    };
  }

  async list(filters: { status?: string; kind?: string; customerId?: string }) {
    if (filters.status && !['OPEN', 'COMPLETED', 'CANCELLED', 'ALL'].includes(filters.status))
      throw new BadRequestException('Invalid follow-up status');
    if (filters.kind && !['CARD_RETRY', 'BANK_REFUND'].includes(filters.kind))
      throw new BadRequestException('Invalid follow-up type');
    const where: Prisma.FollowUpTaskWhereInput = {
      ...(filters.status === 'ALL' ? {} : (filters.status === 'OPEN' || !filters.status)
        ? { OR: [{ status: 'OPEN' }, this.reversedRefund] }
        : { status: filters.status }),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.followUpTask.findMany({
        where, include: taskInclude, orderBy: [{ nextReminderAt: 'asc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      this.prisma.followUpTask.count({ where }),
    ]);
    return { rows: rows.map(row => this.format(row)), total, truncated: total > rows.length };
  }

  async get(id: string) {
    const row = await this.prisma.followUpTask.findUnique({
      where: { id },
      include: {
        ...taskInclude,
        events: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!row) throw new NotFoundException('Follow-up not found');
    return this.format(row);
  }

  private async validateLinks(dto: CreateFollowUpDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId }, select: { id: true },
    });
    if (!customer) throw new BadRequestException('Choose an existing customer');
    if (dto.cardId) {
      const card = await this.prisma.customerCard.findUnique({
        where: { id: dto.cardId }, select: { customerId: true },
      });
      if (!card || card.customerId !== dto.customerId)
        throw new BadRequestException('The selected card does not belong to the customer');
    }
    if (dto.providerId) {
      const provider = await this.prisma.provider.findUnique({
        where: { id: dto.providerId }, select: { id: true },
      });
      if (!provider) throw new BadRequestException('Provider not found');
    }
    if (dto.gatewayId) {
      const gateway = await this.prisma.providerGateway.findUnique({
        where: { id: dto.gatewayId }, select: { providerId: true },
      });
      if (!gateway || gateway.providerId !== dto.providerId)
        throw new BadRequestException('Gateway does not belong to selected provider');
    }
    if (dto.kind === 'CARD_RETRY') {
      if (!dto.cardId) throw new BadRequestException('Choose the card needing a retry');
      if (dto.accountId || dto.expectedAmount)
        throw new BadRequestException('Bank refund fields are not valid on a card retry');
    } else {
      if (!dto.accountId || !dto.expectedAmount || dto.expectedAmount <= 0)
        throw new BadRequestException('Refund amount and destination bank/wallet account are required');
      const account = await this.prisma.financialAccount.findUnique({
        where: { id: dto.accountId }, select: { isActive: true, accountType: true },
      });
      const eligibleTypes: AccountType[] = [AccountType.BANK, AccountType.UPI, AccountType.PROVIDER_WALLET];
      if (!account?.isActive || !eligibleTypes.includes(account.accountType))
        throw new BadRequestException('Select an active bank, UPI or wallet account for the expected refund');
    }
    let sourceTransactionId: string | undefined;
    if (dto.sourceTransactionNumber?.trim()) {
      const transaction = await this.prisma.transaction.findUnique({
        where: { transactionNumber: dto.sourceTransactionNumber.trim() },
        select: { id: true, customerId: true },
      });
      if (!transaction || transaction.customerId !== dto.customerId)
        throw new BadRequestException('Source transaction must belong to this customer');
      sourceTransactionId = transaction.id;
    }
    return sourceTransactionId;
  }

  async create(dto: CreateFollowUpDto, actorId: string) {
    if (!dto.reason.trim()) throw new BadRequestException('Enter a reason or reminder detail');
    const sourceTransactionId = await this.validateLinks(dto);
    const now = new Date();
    const nextReminderAt = dto.nextReminderAt
      ? new Date(dto.nextReminderAt)
      : retryReminder(now);
    if (!Number.isFinite(nextReminderAt.getTime()))
      throw new BadRequestException('Invalid reminder date');
    return this.prisma.$transaction(async tx => {
      const record = await tx.followUpTask.create({
        data: {
          kind: dto.kind, customerId: dto.customerId, cardId: dto.cardId || null,
          providerId: dto.providerId || null, gatewayId: dto.gatewayId || null,
          accountId: dto.kind === 'BANK_REFUND' ? dto.accountId : null,
          expectedAmount: dto.kind === 'BANK_REFUND' ? dto.expectedAmount : null,
          sourceTransactionId: sourceTransactionId ?? null,
          reference: dto.reference?.trim() || null,
          reason: dto.reason.trim(), notes: dto.notes?.trim() || null,
          nextReminderAt, createdById: actorId,
          events: {
            create: { action: 'CREATED', actorId, newValues: {
              kind: dto.kind, nextReminderAt: nextReminderAt.toISOString(),
              expectedAmount: dto.expectedAmount ?? null,
            } },
          },
        },
      });
      await tx.auditLog.create({
        data: { userId: actorId, entityType: 'FOLLOW_UP', entityId: record.id, action: 'CREATE',
          newValues: { kind: record.kind, customerId: record.customerId, cardId: record.cardId,
            expectedAmount: record.expectedAmount?.toString() ?? null, nextReminderAt: record.nextReminderAt?.toISOString() ?? null } },
      });
      return record;
    });
  }

  async update(id: string, dto: UpdateFollowUpDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const row = await tx.followUpTask.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Follow-up not found');
      const now = new Date();
      const note = dto.note?.trim() || null;
      const change: Prisma.FollowUpTaskUpdateInput = { updatedById: actorId };
      let action = dto.action;
      if (action === 'REOPEN') {
        if (row.status === 'OPEN') throw new ConflictException('Follow-up is already open');
        change.status = 'OPEN';
        change.completedAt = null;
        change.completedById = null;
        change.receiptTransaction = { disconnect: true };
        change.nextReminderAt = retryReminder(now);
      } else if (row.status !== 'OPEN') {
        throw new ConflictException('Closed follow-ups cannot be changed; reopen first');
      } else if (action === 'SCHEDULE') {
        if (!dto.nextReminderAt) throw new BadRequestException('Choose the reminder time');
        const when = new Date(dto.nextReminderAt);
        if (!Number.isFinite(when.getTime()) || when.getTime() < now.getTime() - 60000)
          throw new BadRequestException('Reminder must be a valid future date and time');
        change.nextReminderAt = when;
      } else if (action === 'REMIND_LATER') {
        change.nextReminderAt = retryReminder(now, true);
      } else if (action === 'NOTE') {
        if (!note) throw new BadRequestException('Enter a follow-up note');
        change.notes = [row.notes, note].filter(Boolean).join('\n').slice(-2000);
      } else if (action === 'COMPLETE') {
        if (row.kind !== 'CARD_RETRY')
          throw new BadRequestException('Bank refunds may only be marked received after matching an actual posted credit; otherwise cancel with a reason');
        change.status = 'COMPLETED';
        change.completedAt = now;
        change.completedById = actorId;
        change.nextReminderAt = null;
      } else if (action === 'CANCEL') {
        if (!note) throw new BadRequestException('Give a reason when cancelling');
        change.status = 'CANCELLED';
        change.completedAt = now;
        change.completedById = actorId;
        change.nextReminderAt = null;
      } else if (action === 'VERIFY_REFUND') {
        if (row.kind !== 'BANK_REFUND' || !row.accountId || !row.expectedAmount)
          throw new BadRequestException('This is not a pending bank refund');
        if (!dto.receiptTransactionNumber?.trim())
          throw new BadRequestException('Enter the existing posted receipt transaction number');
        const receipt = await tx.transaction.findUnique({
          where: { transactionNumber: dto.receiptTransactionNumber.trim() },
          include: { journal: { include: {
            entries: { include: { ledgerAccount: { select: { financialAccountId: true } } } },
          } } },
        });
        const credited = receipt?.journal?.entries
          .filter(entry => entry.entryType === 'DEBIT' && entry.ledgerAccount.financialAccountId === row.accountId)
          .reduce((sum, entry) => sum + Number(entry.amount), 0) ?? 0;
        if (!receipt || receipt.status !== TransactionStatus.COMPLETED ||
          receipt.journal?.status !== JournalStatus.POSTED || credited + 0.001 < Number(row.expectedAmount))
          throw new BadRequestException('No sufficient posted bank/wallet credit found on that transaction; the refund remains pending');
        const claimed = await tx.followUpTask.findFirst({
          where: { receiptTransactionId: receipt.id, id: { not: id } },
          select: { id: true },
        });
        if (claimed) throw new ConflictException('That receipt is already linked to a different refund');
        change.receiptTransaction = { connect: { id: receipt.id } };
        change.status = 'COMPLETED';
        change.completedAt = now;
        change.completedById = actorId;
        change.nextReminderAt = null;
      }
      const updated = await tx.followUpTask.update({ where: { id }, data: change });
      const changedFields = {
        action, status: updated.status, nextReminderAt: updated.nextReminderAt?.toISOString() ?? null,
        receiptTransactionId: updated.receiptTransactionId,
      };
      await tx.followUpEvent.create({ data: {
        followUpId: id, actorId, action, note,
        oldValues: { status: row.status, nextReminderAt: row.nextReminderAt?.toISOString() ?? null,
          receiptTransactionId: row.receiptTransactionId },
        newValues: changedFields,
      } });
      await tx.auditLog.create({ data: {
        userId: actorId, entityType: 'FOLLOW_UP', entityId: id, action,
        oldValues: { status: row.status, nextReminderAt: row.nextReminderAt?.toISOString() ?? null,
          receiptTransactionId: row.receiptTransactionId },
        newValues: changedFields, reason: note,
      } });
      return updated;
    });
  }
}
