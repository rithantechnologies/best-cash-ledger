import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntryType, PayableStatus, PaymentStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePayablePaymentDto } from './dto/create-payable-payment.dto.js';
import { CancelPayableDto } from './dto/cancel-payable.dto.js';

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async payoutDedupeKey(payableId: string, userId: string, payload: unknown) {
    const bucket = Math.floor(Date.now() / 30000);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ payableId, payload }))
      .digest('hex')
      .slice(0, 24);
    const key = 'CUSTOMER_PAYOUT:' + userId + ':' + bucket + ':' + fingerprint;
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: key },
      select: { transactionNumber: true },
    });
    if (existing) {
      throw new ConflictException('Duplicate request detected: ' + existing.transactionNumber);
    }
    return key;
  }

  async list(options?: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: PayableStatus;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }) {
    await this.prisma.customerPayable.updateMany({
      where: {
        dueAt: { lt: new Date() },
        remainingAmount: { gt: 0 },
        status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] },
      },
      data: { status: PayableStatus.OVERDUE },
    });

    const where: Prisma.CustomerPayableWhereInput = {
      ...(options?.q ? { customer: { fullName: { contains: options.q, mode: 'insensitive' } } } : {}),
      ...(options?.status ? { status: options.status } : {}),
    };
    const allowedSort = new Set(['dueAt','createdAt','originalAmount','paidAmount','remainingAmount','status']);
    const sortBy = allowedSort.has(options?.sortBy ?? '') ? options!.sortBy! : 'dueAt';
    const sortDir = options?.sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy = { [sortBy]: sortDir } as Prisma.CustomerPayableOrderByWithRelationInput;
    const include = {
      customer: true,
      paymentTerm: true,
      sourceTransaction: true,
      payments: { orderBy: { paymentDate: 'desc' as const } },
    };

    if (!options?.page) {
      return this.prisma.customerPayable.findMany({ where, include, orderBy });
    }

    const page = Math.max(1, options.page);
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
    const [items,total] = await Promise.all([
      this.prisma.customerPayable.findMany({
        where, include, orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerPayable.count({ where }),
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

  get(id: string) {
    return this.prisma.customerPayable.findUnique({
      where: { id },
      include: {
        customer: true,
        paymentTerm: true,
        sourceTransaction: { include: { cardSwipe: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
  }
  async pay(id: string, dto: CreatePayablePaymentDto, userId: string) {
    const idempotencyKey = await this.payoutDedupeKey(id, userId, dto);
    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.customerPayable.findUnique({ where: { id } });
      if (!payable) throw new NotFoundException('Payable not found');

      const remaining = Number(payable.remainingAmount);
      if (dto.amount > remaining) {
        throw new BadRequestException('Payment exceeds remaining payable');
      }

      const sourceAccount = await tx.financialAccount.findUnique({
        where: { id: dto.sourceAccountId },
        include: { ledgerAccount: true },
      });
      if (!sourceAccount?.ledgerAccount) {
        throw new NotFoundException('Source account or ledger not found');
      }

      const payableLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode: 'SYS-CUST-PAYABLE' },
      });
      if (!payableLedger) throw new Error('Customer payable ledger missing');

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'PAY-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CUSTOMER_PAYOUT,
          transactionAt: new Date(),
          customerId: payable.customerId,
          grossAmount: new Prisma.Decimal(dto.amount),
          netAmount: new Prisma.Decimal(dto.amount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });
      await tx.payablePayment.create({
        data: {
          payableId: payable.id,
          transactionId: transaction.id,
          paymentDate: new Date(),
          sourceAccountId: dto.sourceAccountId,
          amount: new Prisma.Decimal(dto.amount),
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          status: PaymentStatus.COMPLETED,
          createdById: userId,
        },
      });

      const paidAmount = Number(payable.paidAmount) + dto.amount;
      const remainingAmount = remaining - dto.amount;
      const status = remainingAmount <= 0
        ? PayableStatus.PAID
        : payable.dueAt < new Date()
          ? PayableStatus.OVERDUE
          : PayableStatus.PARTIALLY_PAID;

      const updated = await tx.customerPayable.update({
        where: { id: payable.id },
        data: {
          paidAmount: new Prisma.Decimal(paidAmount),
          remainingAmount: new Prisma.Decimal(remainingAmount),
          status,
        },
      });

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Customer payable payment',
        [
          {
            ledgerAccountId: payableLedger.id,
            entryType: EntryType.DEBIT,
            amount: dto.amount,
            customerId: payable.customerId,
            payableId: payable.id,
          },
          {
            ledgerAccountId: sourceAccount.ledgerAccount.id,
            entryType: EntryType.CREDIT,
            amount: dto.amount,
            customerId: payable.customerId,
            payableId: payable.id,
          },
        ],
      );

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: transaction.id,
          action: 'CREATE',
          newValues: {
            transactionNumber: transaction.transactionNumber,
            transactionType: transaction.transactionType,
            grossAmount: transaction.grossAmount.toString(),
            netAmount: transaction.netAmount?.toString() ?? null,
            status: transaction.status,
            customerId: transaction.customerId,
            payableId: payable.id,
          },
        },
      });

      return { transaction, payable: updated };
    });
  }

  async cancel(id: string, dto: CancelPayableDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.customerPayable.findUnique({
        where: { id },
        include: {
          sourceTransaction: {
            include: {
              journal: { include: { entries: true } },
            },
          },
        },
      });

      if (!payable) throw new NotFoundException('Payable not found');
      if (payable.status === PayableStatus.CANCELLED || payable.status === PayableStatus.REVERSED) {
        throw new BadRequestException('Payable is already cancelled or reversed');
      }
      if (Number(payable.paidAmount) > 0) {
        throw new BadRequestException('Reverse all customer payouts before cancelling this payable');
      }
      if (!payable.sourceTransaction.journal) {
        throw new BadRequestException('Source transaction has no posted journal');
      }

      const reversal = await tx.transaction.create({
        data: {
          transactionNumber: 'CAN-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.REVERSAL,
          transactionAt: new Date(),
          customerId: payable.customerId,
          grossAmount: payable.sourceTransaction.grossAmount,
          netAmount: payable.sourceTransaction.netAmount,
          status: TransactionStatus.COMPLETED,
          referenceNumber: payable.sourceTransaction.transactionNumber,
          notes: 'Payable cancellation for ' + payable.sourceTransaction.transactionNumber,
          reversedTransactionId: payable.sourceTransaction.id,
          reversalReason: dto.reason,
          createdById: userId,
        },
      });

      await this.ledger.post(
        tx,
        reversal.id,
        userId,
        'Cancel payable ' + payable.id,
        payable.sourceTransaction.journal.entries.map((entry) => ({
          ledgerAccountId: entry.ledgerAccountId,
          entryType: entry.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT,
          amount: Number(entry.amount),
          customerId: entry.customerId ?? undefined,
          payableId: entry.payableId ?? undefined,
          description: 'Payable cancellation reversal',
        })),
      );

      await tx.transaction.update({
        where: { id: payable.sourceTransaction.id },
        data: {
          status: TransactionStatus.REVERSED,
          reversalReason: dto.reason,
          updatedById: userId,
        },
      });

      const updated = await tx.customerPayable.update({
        where: { id },
        data: {
          status: PayableStatus.CANCELLED,
          remainingAmount: new Prisma.Decimal(0),
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CUSTOMER_PAYABLE',
          entityId: id,
          action: 'CANCEL',
          oldValues: {
            status: payable.status,
            remainingAmount: payable.remainingAmount.toString(),
          },
          newValues: {
            status: PayableStatus.CANCELLED,
            remainingAmount: '0',
            reversalTransactionId: reversal.id,
          },
          reason: dto.reason,
        },
      });

      return { payable: updated, reversal };
    });
  }
}
