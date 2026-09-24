import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, EntryType, PayableStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { IdempotencyService } from '../finance/idempotency.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CardDueCommissionCollectionDto,
  CardDueRecoveryDto,
  CreateCardDueClearingDto,
  SetCardDueFollowUpDto,
} from './dto/create-card-due-clearing.dto.js';

@Injectable()
export class CardDueClearingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly validation: FinancialValidationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private masterStatus(input: {
    principalRecovered: number;
    principalRemaining: number;
    commissionCollected: number;
    commissionRemaining: number;
  }) {
    // Card due operational status follows the money advanced/recovered.
    // Commission is optional income that may be collected later and must not
    // keep a customer due case open.
    if (input.principalRemaining <= 0.001) {
      return TransactionStatus.COMPLETED;
    }
    if (input.principalRecovered > 0.001) {
      return TransactionStatus.PARTIALLY_PAID;
    }
    return TransactionStatus.PENDING;
  }

  private detailInclude() {
    return {
      transaction: { include: { customer: true, commissions: true } },
      customerCard: true,
      advanceSourceAccount: true,
      recoveries: {
        include: {
          transaction: { include: { charges: true } },
          provider: true,
          gateway: true,
          destinationAccount: true,
        },
        orderBy: { recoveredAt: 'asc' as const },
      },
      commissionCollections: {
        include: { transaction: true, destinationAccount: true },
        orderBy: { collectedAt: 'asc' as const },
      },
    };
  }

  async list(options?: { customerId?: string; openOnly?: boolean }) {
    return this.prisma.cardDueClearingDetail.findMany({
      where: {
        ...(options?.customerId
          ? { transaction: { customerId: options.customerId } }
          : {}),
        ...(options?.openOnly
          ? {
              OR: [
                { principalRemaining: { gt: 0 } },
                { commissionRemaining: { gt: 0 } },
              ],
            }
          : {}),
      },
      include: this.detailInclude(),
      orderBy: [
        { nextFollowUpAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: 200,
    });
  }

  async get(masterTransactionId: string) {
    const clearing = await this.prisma.cardDueClearingDetail.findUnique({
      where: { transactionId: masterTransactionId },
      include: this.detailInclude(),
    });
    if (!clearing) throw new NotFoundException('Card due clearing not found');
    return clearing;
  }

  async create(
    dto: CreateCardDueClearingDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.CARD_DUE_CLEARING,
      userId,
      dto,
      providedIdempotencyKey,
    );
    const commissionRate = dto.commissionRate ?? 0;
    const dueAmount = this.money(dto.dueAmount);
    const commissionAmount = this.money(dueAmount * commissionRate / 100);
    const totalReceivable = this.money(dueAmount + commissionAmount);

    if (dueAmount <= 0 || commissionRate < 0 || commissionRate > 100) {
      throw new BadRequestException('Invalid due amount or commission rate');
    }

    const masterTransactionId = await this.prisma.$transaction(async (tx) => {
      await this.validation.activeCustomer(tx, dto.customerId);
      await this.validation.customerCard(tx, dto.customerId, dto.customerCardId);
      await this.validation.lockAccount(tx, dto.sourceAccountId);
      const sourceAccount = await this.validation.liquidAsset(
        tx,
        dto.sourceAccountId,
        'Card due payment source',
      );
      if (sourceAccount.accountType === AccountType.CASH) {
        await this.validation.requireOpenCashDesk(
          tx,
          sourceAccount.id,
          'Card due payment from cash',
        );
      }
      await this.validation.ensureSufficientFunds(tx, sourceAccount, dueAmount);

      const systemLedgers = await tx.ledgerAccount.findMany({
        where: { ledgerCode: { in: ['SYS-CUST-RECEIVABLE', 'SYS-COMMISSION'] } },
      });
      const byCode = new Map(systemLedgers.map((item) => [item.ledgerCode, item]));
      const receivableLedger = byCode.get('SYS-CUST-RECEIVABLE');
      const commissionLedger = byCode.get('SYS-COMMISSION');
      if (!receivableLedger || !commissionLedger) {
        throw new Error('Required card due clearing ledgers are missing');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'CDC-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CARD_DUE_CLEARING,
          transactionAt: new Date(),
          customerId: dto.customerId,
          grossAmount: new Prisma.Decimal(dueAmount),
          netAmount: new Prisma.Decimal(totalReceivable),
          status: TransactionStatus.PENDING,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      const clearing = await tx.cardDueClearingDetail.create({
        data: {
          transactionId: transaction.id,
          customerCardId: dto.customerCardId,
          advanceSourceAccountId: dto.sourceAccountId,
          dueAmount: new Prisma.Decimal(dueAmount),
          commissionRate: new Prisma.Decimal(commissionRate),
          commissionAmount: new Prisma.Decimal(commissionAmount),
          principalRecovered: new Prisma.Decimal(0),
          principalRemaining: new Prisma.Decimal(dueAmount),
          commissionCollected: new Prisma.Decimal(0),
          commissionRemaining: new Prisma.Decimal(commissionAmount),
          nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
          duePaymentReference: dto.referenceNumber,
        },
      });

      if (commissionAmount > 0) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'CARD_DUE_CLEARING',
            calculationType: 'PERCENTAGE',
            rate: new Prisma.Decimal(commissionRate),
            amount: new Prisma.Decimal(commissionAmount),
          },
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Customer credit-card due cleared',
        [
          {
            ledgerAccountId: receivableLedger.id,
            entryType: EntryType.DEBIT,
            amount: totalReceivable,
            customerId: dto.customerId,
            description: 'Card due advance plus service commission receivable',
          },
          {
            ledgerAccountId: sourceAccount.ledgerAccount!.id,
            entryType: EntryType.CREDIT,
            amount: dueAmount,
            customerId: dto.customerId,
            description: 'Paid customer credit-card due',
          },
          ...(commissionAmount > 0
            ? [{
                ledgerAccountId: commissionLedger.id,
                entryType: EntryType.CREDIT,
                amount: commissionAmount,
                customerId: dto.customerId,
                description: 'Card due clearing commission',
              }]
            : []),
        ],
      );

      await tx.auditLog.createMany({
        data: [
          {
            userId,
            entityType: 'TRANSACTION',
            entityId: transaction.id,
            action: 'CREATE',
            newValues: {
              transactionNumber: transaction.transactionNumber,
              transactionType: transaction.transactionType,
              customerId: dto.customerId,
              dueAmount,
              commissionRate,
              commissionAmount,
            },
          },
          {
            userId,
            entityType: 'CARD_DUE_CLEARING',
            entityId: clearing.id,
            action: 'CREATE',
            newValues: {
              masterTransactionId: transaction.id,
              customerCardId: dto.customerCardId,
              sourceAccountId: dto.sourceAccountId,
              dueAmount,
              commissionRate,
              commissionAmount,
              nextFollowUpAt: dto.nextFollowUpAt ?? null,
            },
          },
        ],
      });

      if (dto.initialRecovery) {
        await this.recordRecoveryTx(
          tx,
          clearing.id,
          dto.initialRecovery,
          userId,
          idempotencyKey + ':recovery',
        );
      }
      if (dto.initialCommissionCollection) {
        await this.recordCommissionTx(
          tx,
          clearing.id,
          dto.initialCommissionCollection,
          userId,
          idempotencyKey + ':commission',
        );
      }
      await this.refreshMasterStatus(tx, clearing.id, transaction.id);
      return transaction.id;
    });

    return this.get(masterTransactionId);
  }

  async addRecovery(
    masterTransactionId: string,
    dto: CardDueRecoveryDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.CARD_DUE_RECOVERY,
      userId,
      { masterTransactionId, ...dto },
      providedIdempotencyKey,
    );
    await this.prisma.$transaction(async (tx) => {
      const clearing = await tx.cardDueClearingDetail.findUnique({
        where: { transactionId: masterTransactionId },
        select: { id: true },
      });
      if (!clearing) throw new NotFoundException('Card due clearing not found');
      await this.recordRecoveryTx(tx, clearing.id, dto, userId, idempotencyKey);
    });
    return this.get(masterTransactionId);
  }

  async addCommissionCollection(
    masterTransactionId: string,
    dto: CardDueCommissionCollectionDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.CARD_DUE_COMMISSION_COLLECTION,
      userId,
      { masterTransactionId, ...dto },
      providedIdempotencyKey,
    );
    await this.prisma.$transaction(async (tx) => {
      const clearing = await tx.cardDueClearingDetail.findUnique({
        where: { transactionId: masterTransactionId },
        select: { id: true },
      });
      if (!clearing) throw new NotFoundException('Card due clearing not found');
      await this.recordCommissionTx(tx, clearing.id, dto, userId, idempotencyKey);
    });
    return this.get(masterTransactionId);
  }

  async setFollowUp(
    masterTransactionId: string,
    dto: SetCardDueFollowUpDto,
    userId: string,
  ) {
    const existing = await this.prisma.cardDueClearingDetail.findUnique({
      where: { transactionId: masterTransactionId },
    });
    if (!existing) throw new NotFoundException('Card due clearing not found');
    const nextFollowUpAt = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;
    const updated = await this.prisma.cardDueClearingDetail.update({
      where: { id: existing.id },
      data: { nextFollowUpAt },
    });
    await this.prisma.auditLog.create({
      data: {
        userId,
        entityType: 'CARD_DUE_CLEARING',
        entityId: existing.id,
        action: 'FOLLOW_UP',
        oldValues: { nextFollowUpAt: existing.nextFollowUpAt?.toISOString() ?? null },
        newValues: { nextFollowUpAt: updated.nextFollowUpAt?.toISOString() ?? null },
      },
    });
    return this.get(masterTransactionId);
  }

  private async recordRecoveryTx(
    tx: Prisma.TransactionClient,
    clearingId: string,
    dto: CardDueRecoveryDto,
    userId: string,
    idempotencyKey: string,
  ) {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "CardDueClearingDetail" WHERE "id" = $1 FOR UPDATE',
      clearingId,
    );
    const clearing = await tx.cardDueClearingDetail.findUnique({
      where: { id: clearingId },
      include: { transaction: true },
    });
    if (!clearing) throw new NotFoundException('Card due clearing not found');
    if (
      clearing.transaction.status === TransactionStatus.REVERSED ||
      clearing.transaction.status === TransactionStatus.CANCELLED
    ) {
      throw new BadRequestException('Card due clearing is not open');
    }

    const remaining = Number(clearing.principalRemaining);
    const amount = this.money(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Recovery amount must be greater than zero');
    }
    const principalApplied = this.money(Math.min(Math.max(remaining, 0), amount));
    const customerCredit = this.money(Math.max(0, amount - principalApplied));

    const { gateway } = await this.validation.providerGateway(
      tx,
      dto.providerId,
      dto.gatewayId,
      true,
    );
    if (!gateway) throw new BadRequestException('Gateway is required');
    const providerChargeRate = Number(gateway.defaultChargeRate);
    const providerChargeAmount = this.money(amount * providerChargeRate / 100);
    const receivedAmount = this.money(amount - providerChargeAmount);
    if (receivedAmount <= 0) {
      throw new BadRequestException('Gateway charge leaves no recovery amount');
    }

    const destinationAccount = await this.validation.liquidAsset(
      tx,
      dto.destinationAccountId,
      'Card recovery destination',
    );
    if (
      destinationAccount.accountType === AccountType.PROVIDER_WALLET &&
      destinationAccount.providerId !== dto.providerId
    ) {
      throw new BadRequestException(
        'Selected provider wallet does not belong to the recovery provider',
      );
    }
    if (destinationAccount.accountType === AccountType.CASH) {
      await this.validation.requireOpenCashDesk(
        tx,
        destinationAccount.id,
        'Card recovery into cash',
      );
    }

    const systemLedgers = await tx.ledgerAccount.findMany({
      where: {
        ledgerCode: { in: ['SYS-CUST-RECEIVABLE', 'SYS-CUST-PAYABLE', 'SYS-PROVIDER-CHARGE'] },
      },
    });
    const byCode = new Map(systemLedgers.map((item) => [item.ledgerCode, item]));
    const receivableLedger = byCode.get('SYS-CUST-RECEIVABLE');
    const payableLedger = byCode.get('SYS-CUST-PAYABLE');
    const providerChargeLedger = byCode.get('SYS-PROVIDER-CHARGE');
    if (!receivableLedger || !payableLedger || !providerChargeLedger) {
      throw new Error('Required card recovery ledgers are missing');
    }

    const recoveredAt = new Date();
    const transaction = await tx.transaction.create({
      data: {
        transactionNumber: 'CDR-' + Date.now().toString(36).toUpperCase(),
        transactionType: TransactionType.CARD_DUE_RECOVERY,
        transactionAt: recoveredAt,
        customerId: clearing.transaction.customerId,
        grossAmount: new Prisma.Decimal(amount),
        netAmount: new Prisma.Decimal(receivedAmount),
        status: TransactionStatus.COMPLETED,
        idempotencyKey,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        createdById: userId,
      },
    });

    await tx.cardDueRecovery.create({
      data: {
        clearingId,
        transactionId: transaction.id,
        swipeAmount: new Prisma.Decimal(amount),
        providerId: dto.providerId,
        gatewayId: dto.gatewayId,
        providerChargeRate: new Prisma.Decimal(providerChargeRate),
        providerChargeAmount: new Prisma.Decimal(providerChargeAmount),
        destinationAccountId: dto.destinationAccountId,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        recoveredAt,
        createdById: userId,
      },
    });

    if (providerChargeAmount > 0) {
      await tx.transactionCharge.create({
        data: {
          transactionId: transaction.id,
          chargeType: 'PROVIDER',
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          calculationType: 'PERCENTAGE',
          rate: new Prisma.Decimal(providerChargeRate),
          amount: new Prisma.Decimal(providerChargeAmount),
          notes: 'Card due recovery gateway charge',
        },
      });
    }

    const customerPayable = customerCredit > 0 && clearing.transaction.customerId
      ? await tx.customerPayable.create({
          data: {
            customerId: clearing.transaction.customerId,
            sourceTransactionId: transaction.id,
            originalAmount: new Prisma.Decimal(customerCredit),
            paidAmount: new Prisma.Decimal(0),
            remainingAmount: new Prisma.Decimal(customerCredit),
            dueAt: recoveredAt,
            status: PayableStatus.PENDING,
          },
        })
      : null;

    await this.ledger.post(
      tx,
      transaction.id,
      userId,
      'Card due recovery received',
      [
        {
          ledgerAccountId: destinationAccount.ledgerAccount!.id,
          entryType: EntryType.DEBIT,
          amount: receivedAmount,
          customerId: clearing.transaction.customerId ?? undefined,
          description: 'Card due recovery received',
        },
        ...(providerChargeAmount > 0
          ? [{
              ledgerAccountId: providerChargeLedger.id,
              entryType: EntryType.DEBIT,
              amount: providerChargeAmount,
              customerId: clearing.transaction.customerId ?? undefined,
              description: 'Card recovery gateway charge',
            }]
          : []),
        ...(principalApplied > 0
          ? [{
              ledgerAccountId: receivableLedger.id,
              entryType: EntryType.CREDIT,
              amount: principalApplied,
              customerId: clearing.transaction.customerId ?? undefined,
              description: 'Reduce card due principal receivable',
            }]
          : []),
        ...(customerCredit > 0 && customerPayable
          ? [{
              ledgerAccountId: payableLedger.id,
              entryType: EntryType.CREDIT,
              amount: customerCredit,
              customerId: clearing.transaction.customerId ?? undefined,
              payableId: customerPayable.id,
              description: 'Excess card due recovery payable back to customer',
            }]
          : []),
      ],
    );

    const principalRecovered = this.money(
      Number(clearing.principalRecovered) + amount,
    );
    const principalRemaining = this.money(Math.max(0, remaining - principalApplied));
    await tx.cardDueClearingDetail.update({
      where: { id: clearingId },
      data: {
        principalRecovered: new Prisma.Decimal(principalRecovered),
        principalRemaining: new Prisma.Decimal(principalRemaining),
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        entityType: 'CARD_DUE_CLEARING',
        entityId: clearingId,
        action: 'RECOVER',
        oldValues: {
          principalRecovered: clearing.principalRecovered.toString(),
          principalRemaining: clearing.principalRemaining.toString(),
        },
        newValues: {
          principalRecovered,
          principalRemaining,
          recoveryTransactionId: transaction.id,
          gatewayCharge: providerChargeAmount,
          principalApplied,
          customerCredit,
          customerPayableId: customerPayable?.id ?? null,
          destinationAccountId: dto.destinationAccountId,
        },
      },
    });

    await this.refreshMasterStatus(
      tx,
      clearingId,
      clearing.transactionId,
    );
    return transaction;
  }

  private async recordCommissionTx(
    tx: Prisma.TransactionClient,
    clearingId: string,
    dto: CardDueCommissionCollectionDto,
    userId: string,
    idempotencyKey: string,
  ) {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "CardDueClearingDetail" WHERE "id" = $1 FOR UPDATE',
      clearingId,
    );
    const clearing = await tx.cardDueClearingDetail.findUnique({
      where: { id: clearingId },
      include: { transaction: true },
    });
    if (!clearing) throw new NotFoundException('Card due clearing not found');
    if (
      clearing.transaction.status === TransactionStatus.REVERSED ||
      clearing.transaction.status === TransactionStatus.CANCELLED
    ) {
      throw new BadRequestException('Card due clearing is not open');
    }

    const remaining = Number(clearing.commissionRemaining);
    const amount = this.money(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Commission amount must be greater than zero');
    }
    const accruedApplied = this.money(Math.min(Math.max(remaining, 0), amount));
    const newCommissionIncome = this.money(Math.max(0, amount - accruedApplied));

    const destinationAccount = await this.validation.liquidAsset(
      tx,
      dto.destinationAccountId,
      'Commission collection destination',
    );
    if (dto.paymentMode === 'CASH' && destinationAccount.accountType !== AccountType.CASH) {
      throw new BadRequestException('Cash commission must be collected into a cash account');
    }
    if (dto.paymentMode === 'UPI' && destinationAccount.accountType !== AccountType.UPI) {
      throw new BadRequestException('UPI commission must be collected into a UPI account');
    }
    if (destinationAccount.accountType === AccountType.CASH) {
      await this.validation.requireOpenCashDesk(
        tx,
        destinationAccount.id,
        'Cash card due commission collection',
      );
    }

    const commissionLedgers = await tx.ledgerAccount.findMany({
      where: { ledgerCode: { in: ['SYS-CUST-RECEIVABLE', 'SYS-COMMISSION'] } },
    });
    const commissionLedgerByCode = new Map(commissionLedgers.map((item) => [item.ledgerCode, item]));
    const receivableLedger = commissionLedgerByCode.get('SYS-CUST-RECEIVABLE');
    const commissionLedger = commissionLedgerByCode.get('SYS-COMMISSION');
    if (!receivableLedger || !commissionLedger) throw new Error('Customer receivable or commission ledger missing');

    const collectedAt = new Date();
    const transaction = await tx.transaction.create({
      data: {
        transactionNumber: 'CDF-' + Date.now().toString(36).toUpperCase(),
        transactionType: TransactionType.CARD_DUE_COMMISSION_COLLECTION,
        transactionAt: collectedAt,
        customerId: clearing.transaction.customerId,
        grossAmount: new Prisma.Decimal(amount),
        netAmount: new Prisma.Decimal(amount),
        status: TransactionStatus.COMPLETED,
        idempotencyKey,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        createdById: userId,
      },
    });

    await tx.cardDueCommissionCollection.create({
      data: {
        clearingId,
        transactionId: transaction.id,
        amount: new Prisma.Decimal(amount),
        paymentMode: dto.paymentMode,
        destinationAccountId: dto.destinationAccountId,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        collectedAt,
        createdById: userId,
      },
    });

    await this.ledger.post(
      tx,
      transaction.id,
      userId,
      'Card due commission collected',
      [
        {
          ledgerAccountId: destinationAccount.ledgerAccount!.id,
          entryType: EntryType.DEBIT,
          amount,
          customerId: clearing.transaction.customerId ?? undefined,
          description: 'Card due commission received',
        },
        ...(accruedApplied > 0
          ? [{
              ledgerAccountId: receivableLedger.id,
              entryType: EntryType.CREDIT,
              amount: accruedApplied,
              customerId: clearing.transaction.customerId ?? undefined,
              description: 'Reduce accrued commission receivable',
            }]
          : []),
        ...(newCommissionIncome > 0
          ? [{
              ledgerAccountId: commissionLedger.id,
              entryType: EntryType.CREDIT,
              amount: newCommissionIncome,
              customerId: clearing.transaction.customerId ?? undefined,
              description: 'Card due commission income collected later',
            }]
          : []),
      ],
    );

    const commissionCollected = this.money(
      Number(clearing.commissionCollected) + amount,
    );
    const commissionAmount = this.money(Number(clearing.commissionAmount) + newCommissionIncome);
    const commissionRemaining = this.money(Math.max(0, remaining - accruedApplied));
    await tx.cardDueClearingDetail.update({
      where: { id: clearingId },
      data: {
        commissionAmount: new Prisma.Decimal(commissionAmount),
        commissionCollected: new Prisma.Decimal(commissionCollected),
        commissionRemaining: new Prisma.Decimal(commissionRemaining),
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        entityType: 'CARD_DUE_CLEARING',
        entityId: clearingId,
        action: 'COLLECT_COMMISSION',
        oldValues: {
          commissionCollected: clearing.commissionCollected.toString(),
          commissionRemaining: clearing.commissionRemaining.toString(),
        },
        newValues: {
          commissionAmount,
          commissionCollected,
          commissionRemaining,
          accruedApplied,
          newCommissionIncome,
          collectionTransactionId: transaction.id,
          paymentMode: dto.paymentMode,
          destinationAccountId: dto.destinationAccountId,
        },
      },
    });

    await this.refreshMasterStatus(
      tx,
      clearingId,
      clearing.transactionId,
    );
    return transaction;
  }

  private async refreshMasterStatus(
    tx: Prisma.TransactionClient,
    clearingId: string,
    masterTransactionId: string,
  ) {
    const clearing = await tx.cardDueClearingDetail.findUnique({
      where: { id: clearingId },
      select: {
        principalRecovered: true,
        principalRemaining: true,
        commissionCollected: true,
        commissionRemaining: true,
      },
    });
    if (!clearing) throw new NotFoundException('Card due clearing not found');
    const status = this.masterStatus({
      principalRecovered: Number(clearing.principalRecovered),
      principalRemaining: Number(clearing.principalRemaining),
      commissionCollected: Number(clearing.commissionCollected),
      commissionRemaining: Number(clearing.commissionRemaining),
    });
    await tx.transaction.update({
      where: { id: masterTransactionId },
      data: { status },
    });
    return status;
  }
}
