import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AccountNature,
  AccountType,
  EntryType,
  PaymentStatus,
  Prisma,
  ReceivableStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CancelReceivableDto } from './dto/cancel-receivable.dto.js';
import { CreateReceivableCollectionDto } from './dto/create-receivable-collection.dto.js';
import { CreateReceivableDto } from './dto/create-receivable.dto.js';

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async collectionDedupeKey(
    receivableId: string,
    userId: string,
    payload: unknown,
  ) {
    const bucket = Math.floor(Date.now() / 30000);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ receivableId, payload }))
      .digest('hex')
      .slice(0, 24);
    const key = 'CUSTOMER_RECEIPT:' + userId + ':' + bucket + ':' + fingerprint;
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: key },
      select: { transactionNumber: true },
    });
    if (existing) {
      throw new ConflictException(
        'Duplicate request detected: ' + existing.transactionNumber,
      );
    }
    return key;
  }

  async list(options?: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: ReceivableStatus;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    await this.prisma.customerReceivable.updateMany({
      where: {
        dueAt: { lt: new Date() },
        remainingAmount: { gt: 0 },
        status: {
          in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED],
        },
      },
      data: { status: ReceivableStatus.OVERDUE },
    });

    const where: Prisma.CustomerReceivableWhereInput = {
      ...(options?.q
        ? {
            OR: [
              { customer: { fullName: { contains: options.q, mode: 'insensitive' } } },
              { reason: { contains: options.q, mode: 'insensitive' } },
              { description: { contains: options.q, mode: 'insensitive' } },
              {
                sourceTransaction: {
                  referenceNumber: { contains: options.q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(options?.status ? { status: options.status } : {}),
    };
    const allowedSort = new Set([
      'dueAt',
      'createdAt',
      'originalAmount',
      'receivedAmount',
      'remainingAmount',
      'status',
    ]);
    const sortBy = allowedSort.has(options?.sortBy ?? '')
      ? options!.sortBy!
      : 'dueAt';
    const sortDir = options?.sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy = {
      [sortBy]: sortDir,
    } as Prisma.CustomerReceivableOrderByWithRelationInput;
    const include = {
      customer: true,
      sourceAccount: true,
      sourceTransaction: true,
      collections: {
        include: { destinationAccount: true },
        orderBy: { collectionDate: 'desc' as const },
      },
    };

    if (!options?.page) {
      return this.prisma.customerReceivable.findMany({
        where,
        include,
        orderBy,
      });
    }

    const page = Math.max(1, options.page);
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
    const [items, total] = await Promise.all([
      this.prisma.customerReceivable.findMany({
        where,
        include,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerReceivable.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async get(id: string) {
    const receivable = await this.prisma.customerReceivable.findUnique({
      where: { id },
      include: {
        customer: true,
        sourceAccount: true,
        sourceTransaction: true,
        collections: {
          include: { destinationAccount: true, transaction: true },
          orderBy: { collectionDate: 'desc' },
        },
      },
    });
    if (!receivable) throw new NotFoundException('Receivable not found');

    const userIds = [...new Set([
      receivable.createdById,
      ...receivable.collections.map((item) => item.createdById),
    ])];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      ...receivable,
      createdBy: byId.get(receivable.createdById) ?? null,
      collections: receivable.collections.map((item) => ({
        ...item,
        createdBy: byId.get(item.createdById) ?? null,
      })),
    };
  }

  async create(dto: CreateReceivableDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!customer?.isActive) {
        throw new NotFoundException('Active customer not found');
      }

      let sourceLedgerId: string | null = null;
      if (dto.sourceAccountId) {
        const sourceAccount = await tx.financialAccount.findUnique({
          where: { id: dto.sourceAccountId },
          include: { ledgerAccount: true },
        });
        if (!sourceAccount?.ledgerAccount || !sourceAccount.isActive) {
          throw new NotFoundException('Active source account or ledger not found');
        }
        if (
          sourceAccount.accountNature !== AccountNature.ASSET ||
          sourceAccount.accountType === AccountType.OWNER_CREDIT_CARD
        ) {
          throw new BadRequestException(
            'Receivable source must be a cash, bank, UPI or provider-wallet asset account',
          );
        }
        sourceLedgerId = sourceAccount.ledgerAccount.id;
      }

      const systemLedgers = await tx.ledgerAccount.findMany({
        where: {
          ledgerCode: {
            in: ['SYS-CUST-RECEIVABLE', 'SYS-RECEIVABLE-ADJUSTMENT'],
          },
        },
      });
      const byCode = new Map(systemLedgers.map((item) => [item.ledgerCode, item]));
      const receivableLedger = byCode.get('SYS-CUST-RECEIVABLE');
      const adjustmentLedger = byCode.get('SYS-RECEIVABLE-ADJUSTMENT');
      if (!receivableLedger || !adjustmentLedger) {
        throw new Error('Required receivable system ledgers are missing');
      }

      const now = new Date();
      const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'RCV-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CUSTOMER_RECEIVABLE,
          transactionAt: now,
          customerId: dto.customerId,
          grossAmount: new Prisma.Decimal(dto.amount),
          netAmount: new Prisma.Decimal(dto.amount),
          status: TransactionStatus.COMPLETED,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      const receivable = await tx.customerReceivable.create({
        data: {
          customerId: dto.customerId,
          sourceTransactionId: transaction.id,
          sourceAccountId: dto.sourceAccountId || null,
          reason: dto.reason,
          description: dto.description,
          originalAmount: new Prisma.Decimal(dto.amount),
          receivedAmount: new Prisma.Decimal(0),
          remainingAmount: new Prisma.Decimal(dto.amount),
          dueAt,
          status:
            dueAt && dueAt < now
              ? ReceivableStatus.OVERDUE
              : ReceivableStatus.PENDING,
          createdById: userId,
        },
      });

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Customer receivable created',
        [
          {
            ledgerAccountId: receivableLedger.id,
            entryType: EntryType.DEBIT,
            amount: dto.amount,
            customerId: dto.customerId,
            receivableId: receivable.id,
            description: 'Customer receivable',
          },
          {
            ledgerAccountId: sourceLedgerId ?? adjustmentLedger.id,
            entryType: EntryType.CREDIT,
            amount: dto.amount,
            customerId: dto.customerId,
            receivableId: receivable.id,
            description: sourceLedgerId
              ? 'Receivable source account'
              : 'Receivable opening/adjustment',
          },
        ],
      );

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CUSTOMER_RECEIVABLE',
          entityId: receivable.id,
          action: 'CREATE',
          newValues: {
            customerId: dto.customerId,
            originalAmount: dto.amount,
            reason: dto.reason,
            sourceAccountId: dto.sourceAccountId ?? null,
            dueAt: dto.dueAt ?? null,
            sourceTransactionId: transaction.id,
          },
        },
      });

      return { transaction, receivable };
    });
  }

  async collect(
    id: string,
    dto: CreateReceivableCollectionDto,
    userId: string,
  ) {
    const idempotencyKey = await this.collectionDedupeKey(id, userId, dto);
    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.customerReceivable.findUnique({
        where: { id },
      });
      if (!receivable) throw new NotFoundException('Receivable not found');
      if (
        receivable.status === ReceivableStatus.RECEIVED ||
        receivable.status === ReceivableStatus.CANCELLED ||
        receivable.status === ReceivableStatus.REVERSED
      ) {
        throw new BadRequestException('Receivable is not open for collection');
      }

      const remaining = Number(receivable.remainingAmount);
      if (dto.amount > remaining) {
        throw new BadRequestException('Collection exceeds remaining receivable');
      }

      const destinationAccount = await tx.financialAccount.findUnique({
        where: { id: dto.destinationAccountId },
        include: { ledgerAccount: true },
      });
      if (!destinationAccount?.ledgerAccount || !destinationAccount.isActive) {
        throw new NotFoundException('Active destination account or ledger not found');
      }
      if (
        destinationAccount.accountNature !== AccountNature.ASSET ||
        destinationAccount.accountType === AccountType.OWNER_CREDIT_CARD
      ) {
        throw new BadRequestException(
          'Receivable collection must go to cash, bank, UPI or provider wallet',
        );
      }

      const receivableLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode: 'SYS-CUST-RECEIVABLE' },
      });
      if (!receivableLedger) {
        throw new Error('Customer receivable ledger missing');
      }

      const now = new Date();
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'RCP-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CUSTOMER_RECEIPT,
          transactionAt: now,
          customerId: receivable.customerId,
          grossAmount: new Prisma.Decimal(dto.amount),
          netAmount: new Prisma.Decimal(dto.amount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.receivableCollection.create({
        data: {
          receivableId: receivable.id,
          transactionId: transaction.id,
          collectionDate: now,
          destinationAccountId: dto.destinationAccountId,
          amount: new Prisma.Decimal(dto.amount),
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          status: PaymentStatus.COMPLETED,
          createdById: userId,
        },
      });

      const receivedAmount = Number(receivable.receivedAmount) + dto.amount;
      const remainingAmount = Math.max(0, remaining - dto.amount);
      const status =
        remainingAmount <= 0
          ? ReceivableStatus.RECEIVED
          : receivable.dueAt && receivable.dueAt < now
            ? ReceivableStatus.OVERDUE
            : ReceivableStatus.PARTIALLY_RECEIVED;

      const updated = await tx.customerReceivable.update({
        where: { id: receivable.id },
        data: {
          receivedAmount: new Prisma.Decimal(receivedAmount),
          remainingAmount: new Prisma.Decimal(remainingAmount),
          status,
        },
      });

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Customer receivable collection',
        [
          {
            ledgerAccountId: destinationAccount.ledgerAccount.id,
            entryType: EntryType.DEBIT,
            amount: dto.amount,
            customerId: receivable.customerId,
            receivableId: receivable.id,
            description: 'Receivable collection received',
          },
          {
            ledgerAccountId: receivableLedger.id,
            entryType: EntryType.CREDIT,
            amount: dto.amount,
            customerId: receivable.customerId,
            receivableId: receivable.id,
            description: 'Reduce customer receivable',
          },
        ],
      );

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CUSTOMER_RECEIVABLE',
          entityId: receivable.id,
          action: 'COLLECT',
          oldValues: {
            receivedAmount: receivable.receivedAmount.toString(),
            remainingAmount: receivable.remainingAmount.toString(),
            status: receivable.status,
          },
          newValues: {
            receivedAmount: receivedAmount.toString(),
            remainingAmount: remainingAmount.toString(),
            status,
            transactionId: transaction.id,
          },
        },
      });

      return { transaction, receivable: updated };
    });
  }

  async cancel(id: string, dto: CancelReceivableDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const receivable = await tx.customerReceivable.findUnique({
        where: { id },
        include: {
          sourceTransaction: {
            include: { journal: { include: { entries: true } } },
          },
        },
      });
      if (!receivable) throw new NotFoundException('Receivable not found');
      if (
        receivable.status === ReceivableStatus.CANCELLED ||
        receivable.status === ReceivableStatus.REVERSED
      ) {
        throw new BadRequestException('Receivable is already cancelled or reversed');
      }
      if (Number(receivable.receivedAmount) > 0) {
        throw new BadRequestException(
          'Reverse all receivable collections before cancelling this receivable',
        );
      }
      if (!receivable.sourceTransaction.journal) {
        throw new BadRequestException('Source transaction has no posted journal');
      }

      const reversal = await tx.transaction.create({
        data: {
          transactionNumber: 'RCN-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.REVERSAL,
          transactionAt: new Date(),
          customerId: receivable.customerId,
          grossAmount: receivable.sourceTransaction.grossAmount,
          netAmount: receivable.sourceTransaction.netAmount,
          status: TransactionStatus.COMPLETED,
          referenceNumber: receivable.sourceTransaction.transactionNumber,
          notes:
            'Receivable cancellation for ' +
            receivable.sourceTransaction.transactionNumber,
          reversedTransactionId: receivable.sourceTransaction.id,
          reversalReason: dto.reason,
          createdById: userId,
        },
      });

      await this.ledger.post(
        tx,
        reversal.id,
        userId,
        'Cancel receivable ' + receivable.id,
        receivable.sourceTransaction.journal.entries.map((entry) => ({
          ledgerAccountId: entry.ledgerAccountId,
          entryType:
            entry.entryType === EntryType.DEBIT
              ? EntryType.CREDIT
              : EntryType.DEBIT,
          amount: Number(entry.amount),
          customerId: entry.customerId ?? undefined,
          payableId: entry.payableId ?? undefined,
          receivableId: entry.receivableId ?? undefined,
          description: 'Receivable cancellation reversal',
        })),
      );

      await tx.transaction.update({
        where: { id: receivable.sourceTransaction.id },
        data: {
          status: TransactionStatus.REVERSED,
          reversalReason: dto.reason,
          updatedById: userId,
        },
      });

      const updated = await tx.customerReceivable.update({
        where: { id },
        data: {
          status: ReceivableStatus.CANCELLED,
          remainingAmount: new Prisma.Decimal(0),
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CUSTOMER_RECEIVABLE',
          entityId: id,
          action: 'CANCEL',
          oldValues: {
            status: receivable.status,
            remainingAmount: receivable.remainingAmount.toString(),
          },
          newValues: {
            status: ReceivableStatus.CANCELLED,
            remainingAmount: '0',
            reversalTransactionId: reversal.id,
          },
          reason: dto.reason,
        },
      });

      return { receivable: updated, reversal };
    });
  }
}
