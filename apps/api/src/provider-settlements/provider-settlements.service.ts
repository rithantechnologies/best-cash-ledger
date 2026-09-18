import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  PaymentStatus,
  Prisma,
  ProviderSettlementStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { IdempotencyService } from '../finance/idempotency.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProviderSettlementReceiptDto } from './dto/create-provider-settlement-receipt.dto.js';

type CreateSourceSettlement = {
  sourceTransactionId: string;
  providerId?: string;
  gatewayId?: string;
  expectedAmount: number;
  destinationAccountId: string;
  dueAt?: Date | null;
  createdById: string;
};

@Injectable()
export class ProviderSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly validation: FinancialValidationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async createForSource(
    tx: Prisma.TransactionClient,
    input: CreateSourceSettlement,
  ) {
    if (input.expectedAmount <= 0) {
      throw new BadRequestException('Provider settlement amount must be positive');
    }
    await this.validation.providerSettlementDestination(
      tx,
      input.destinationAccountId,
      input.providerId,
    );
    await this.validation.providerGateway(
      tx,
      input.providerId,
      input.gatewayId,
      false,
    );
    return tx.providerSettlement.create({
      data: {
        sourceTransactionId: input.sourceTransactionId,
        providerId: input.providerId,
        gatewayId: input.gatewayId,
        expectedAmount: new Prisma.Decimal(input.expectedAmount),
        receivedAmount: new Prisma.Decimal(0),
        remainingAmount: new Prisma.Decimal(input.expectedAmount),
        destinationAccountId: input.destinationAccountId,
        dueAt: input.dueAt ?? null,
        status: ProviderSettlementStatus.PENDING,
        createdById: input.createdById,
      },
    });
  }

  async autoReceive(
    tx: Prisma.TransactionClient,
    settlementId: string,
    destinationAccountId: string,
    amount: number,
    userId: string,
    referenceNumber?: string,
  ) {
    return this.receiveWithinTransaction(
      tx,
      settlementId,
      {
        amount,
        destinationAccountId,
        referenceNumber,
        notes: 'Settlement confirmed at source entry',
      },
      userId,
      'AUTOSETTLE:' + settlementId,
    );
  }

  async list(options?: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: ProviderSettlementStatus;
    providerId?: string;
  }) {
    const where: Prisma.ProviderSettlementWhereInput = {
      ...(options?.q
        ? {
            OR: [
              {
                sourceTransaction: {
                  transactionNumber: {
                    contains: options.q,
                    mode: 'insensitive',
                  },
                },
              },
              {
                sourceTransaction: {
                  referenceNumber: {
                    contains: options.q,
                    mode: 'insensitive',
                  },
                },
              },
              {
                provider: {
                  name: { contains: options.q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.providerId ? { providerId: options.providerId } : {}),
    };
    const include = {
      provider: true,
      gateway: true,
      destinationAccount: true,
      sourceTransaction: {
        include: { customer: true, cardSwipe: true, aeps: true, microAtm: true },
      },
      receipts: {
        include: { destinationAccount: true, transaction: true },
        orderBy: { receivedAt: 'desc' as const },
      },
    };

    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.min(Math.max(options?.pageSize ?? 25, 5), 100);
    const [items, total] = await Promise.all([
      this.prisma.providerSettlement.findMany({
        where,
        include,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.providerSettlement.count({ where }),
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
    const item = await this.prisma.providerSettlement.findUnique({
      where: { id },
      include: {
        provider: true,
        gateway: true,
        destinationAccount: true,
        sourceTransaction: {
          include: {
            customer: true,
            cardSwipe: true,
            aeps: true,
            microAtm: true,
            charges: true,
            commissions: true,
          },
        },
        receipts: {
          include: {
            destinationAccount: true,
            transaction: true,
          },
          orderBy: { receivedAt: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Provider settlement not found');
    return item;
  }

  async receive(
    id: string,
    dto: CreateProviderSettlementReceiptDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const key = await this.idempotency.key(
      TransactionType.PROVIDER_SETTLEMENT,
      userId,
      { id, ...dto },
      providedIdempotencyKey,
    );
    return this.prisma.$transaction(async (tx) => {
      return this.receiveWithinTransaction(tx, id, dto, userId, key);
    });
  }

  private async receiveWithinTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    dto: CreateProviderSettlementReceiptDto,
    userId: string,
    idempotencyKey: string,
  ) {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "ProviderSettlement" WHERE "id" = $1 FOR UPDATE',
      id,
    );
    const settlement = await tx.providerSettlement.findUnique({
      where: { id },
    });
    if (!settlement) {
      throw new NotFoundException('Provider settlement not found');
    }
    if (
      settlement.status === ProviderSettlementStatus.SETTLED ||
      settlement.status === ProviderSettlementStatus.CANCELLED ||
      settlement.status === ProviderSettlementStatus.REVERSED
    ) {
      throw new BadRequestException('Provider settlement is not open');
    }
    const remaining = Number(settlement.remainingAmount);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException(
        'Settlement receipt exceeds the remaining amount',
      );
    }
    const destination = await this.validation.providerSettlementDestination(
      tx,
      dto.destinationAccountId,
      settlement.providerId,
    );
    const clearingLedger = await tx.ledgerAccount.findUnique({
      where: { ledgerCode: 'SYS-PROVIDER-CLEARING' },
    });
    if (!clearingLedger) {
      throw new Error('Provider clearing ledger missing');
    }

    const now = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    const transaction = await tx.transaction.create({
      data: {
        transactionNumber: 'PST-' + Date.now().toString(36).toUpperCase(),
        transactionType: TransactionType.PROVIDER_SETTLEMENT,
        transactionAt: now,
        customerId: null,
        grossAmount: new Prisma.Decimal(dto.amount),
        netAmount: new Prisma.Decimal(dto.amount),
        status: TransactionStatus.COMPLETED,
        idempotencyKey,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        createdById: userId,
      },
    });

    const receipt = await tx.providerSettlementReceipt.create({
      data: {
        settlementId: settlement.id,
        transactionId: transaction.id,
        receivedAt: now,
        destinationAccountId: destination.id,
        amount: new Prisma.Decimal(dto.amount),
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        status: PaymentStatus.COMPLETED,
        createdById: userId,
      },
    });

    const receivedAmount = Number(settlement.receivedAmount) + dto.amount;
    const remainingAmount = Math.max(0, remaining - dto.amount);
    const status =
      remainingAmount <= 0.001
        ? ProviderSettlementStatus.SETTLED
        : ProviderSettlementStatus.PARTIALLY_SETTLED;

    const updated = await tx.providerSettlement.update({
      where: { id: settlement.id },
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
      'Provider settlement received',
      [
        {
          ledgerAccountId: destination.ledgerAccount!.id,
          entryType: EntryType.DEBIT,
          amount: dto.amount,
          providerSettlementId: settlement.id,
          description: 'Provider settlement received',
        },
        {
          ledgerAccountId: clearingLedger.id,
          entryType: EntryType.CREDIT,
          amount: dto.amount,
          providerSettlementId: settlement.id,
          description: 'Reduce provider settlement clearing',
        },
      ],
      now,
    );

    await tx.auditLog.create({
      data: {
        userId,
        entityType: 'PROVIDER_SETTLEMENT',
        entityId: settlement.id,
        action: 'RECEIVE',
        oldValues: {
          receivedAmount: settlement.receivedAmount.toString(),
          remainingAmount: settlement.remainingAmount.toString(),
          status: settlement.status,
        },
        newValues: {
          receivedAmount: receivedAmount.toString(),
          remainingAmount: remainingAmount.toString(),
          status,
          receiptTransactionId: transaction.id,
        },
      },
    });

    return { transaction, receipt, settlement: updated };
  }
}
