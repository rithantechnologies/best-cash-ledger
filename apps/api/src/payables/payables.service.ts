import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntryType, PayableStatus, PaymentStatus, Prisma, ProviderSettlementStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { IdempotencyService } from '../finance/idempotency.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePayablePaymentDto } from './dto/create-payable-payment.dto.js';
import { CancelPayableDto } from './dto/cancel-payable.dto.js';

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly validation: FinancialValidationService,
    private readonly idempotency: IdempotencyService,
  ) {}

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

  async get(id: string) {
    const payable = await this.prisma.customerPayable.findUnique({
      where: { id },
      include: {
        customer: true,
        paymentTerm: true,
        sourceTransaction: {
          include: {
            cardSwipe: true,
            charges: true,
            commissions: true,
            providerSettlementSource: true,
          },
        },
        payments: {
          include: {
            sourceAccount: true,
            transaction: true,
          },
          orderBy: { paymentDate: 'desc' },
        },
      },
    });
    if (!payable) throw new NotFoundException('Payable not found');

    const userIds = [
      payable.sourceTransaction.createdById,
      ...payable.payments.map((payment) => payment.createdById),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, fullName: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      ...payable,
      createdBy:
        byId.get(payable.sourceTransaction.createdById) ?? null,
      payments: payable.payments.map((payment) => ({
        ...payment,
        createdBy: byId.get(payment.createdById) ?? null,
      })),
    };
  }
  async pay(
    id: string,
    dto: CreatePayablePaymentDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.CUSTOMER_PAYOUT,
      userId,
      { payableId: id, ...dto },
      providedIdempotencyKey,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE',
        id,
      );
      const payable = await tx.customerPayable.findUnique({ where: { id } });
      if (!payable) throw new NotFoundException('Payable not found');
      if (
        payable.status === PayableStatus.PAID ||
        payable.status === PayableStatus.CANCELLED ||
        payable.status === PayableStatus.REVERSED
      ) {
        throw new BadRequestException('Payable is not open for payment');
      }

      const remaining = Number(payable.remainingAmount);
      if (dto.amount > remaining + 0.001) {
        throw new BadRequestException('Payment exceeds remaining payable');
      }

      await this.validation.lockAccount(tx, dto.sourceAccountId);
      const sourceAccount = await this.validation.liquidAsset(
        tx,
        dto.sourceAccountId,
        'Customer payout source',
      );
      await this.validation.ensureSufficientFunds(
        tx,
        sourceAccount,
        dto.amount,
      );

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
      const remainingAmount = Math.max(0, remaining - dto.amount);
      const status = remainingAmount <= 0.001
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
            ledgerAccountId: sourceAccount.ledgerAccount!.id,
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
          entityType: 'CUSTOMER_PAYABLE',
          entityId: payable.id,
          action: 'PAY',
          oldValues: {
            paidAmount: payable.paidAmount.toString(),
            remainingAmount: payable.remainingAmount.toString(),
            status: payable.status,
          },
          newValues: {
            paidAmount: paidAmount.toString(),
            remainingAmount: remainingAmount.toString(),
            status,
            transactionId: transaction.id,
          },
        },
      });

      return { transaction, payable: updated };
    });
  }

  async cancel(id: string, dto: CancelPayableDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE',
        id,
      );
      const payable = await tx.customerPayable.findUnique({
        where: { id },
        include: {
          sourceTransaction: {
            include: {
              journal: { include: { entries: true } },
              providerSettlementSource: true,
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
      if (
        payable.sourceTransaction.providerSettlementSource &&
        Number(payable.sourceTransaction.providerSettlementSource.receivedAmount) > 0
      ) {
        throw new BadRequestException(
          'Reverse provider settlement receipts before cancelling this payable',
        );
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
          providerSettlementId: entry.providerSettlementId ?? undefined,
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

      if (payable.sourceTransaction.providerSettlementSource) {
        await tx.providerSettlement.update({
          where: { id: payable.sourceTransaction.providerSettlementSource.id },
          data: {
            status: ProviderSettlementStatus.REVERSED,
            remainingAmount: new Prisma.Decimal(0),
          },
        });
      }

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
