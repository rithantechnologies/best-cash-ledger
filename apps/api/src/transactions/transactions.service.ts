import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntryType, PayableStatus, PaymentStatus, Prisma, ReceivableStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAepsDto } from './dto/create-aeps.dto.js';
import { CreateAtmWithdrawalDto } from './dto/create-atm-withdrawal.dto.js';
import { CreateCardSwipeDto } from './dto/create-card-swipe.dto.js';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto.js';
import { CreateCreditCardPaymentDto } from './dto/create-credit-card-payment.dto.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { CreateInternalTransferDto } from './dto/create-internal-transfer.dto.js';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private auditCreated(tx: Prisma.TransactionClient, transaction: {
    id: string;
    transactionNumber: string;
    transactionType: TransactionType;
    grossAmount: Prisma.Decimal;
    netAmount: Prisma.Decimal | null;
    status: TransactionStatus;
    customerId: string | null;
  }, userId: string) {
    return tx.auditLog.create({
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
        },
      },
    });
  }

  private async withCreators<T extends { createdById: string }>(items: T[]) {
    const userIds = [...new Set(items.map((item) => item.createdById))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return items.map((item) => ({
      ...item,
      createdBy: byId.get(item.createdById) ?? null,
    }));
  }

  private async dedupeKey(type: TransactionType, userId: string, payload: unknown) {
    const bucket = Math.floor(Date.now() / 30000);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 24);
    const key = type + ':' + userId + ':' + bucket + ':' + fingerprint;
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
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    q?: string;
    type?: TransactionType;
    status?: TransactionStatus;
  }) {
    const where: Prisma.TransactionWhereInput = {
      ...(options?.q ? {
        OR: [
          { transactionNumber: { contains: options.q, mode: 'insensitive' } },
          { referenceNumber: { contains: options.q, mode: 'insensitive' } },
          { customer: { fullName: { contains: options.q, mode: 'insensitive' } } },
        ],
      } : {}),
      ...(options?.type ? { transactionType: options.type } : {}),
      ...(options?.status ? { status: options.status } : {}),
    };

    const allowedSort = new Set(['transactionAt', 'transactionNumber', 'transactionType', 'grossAmount', 'netAmount', 'status']);
    const sortBy = allowedSort.has(options?.sortBy ?? '') ? options!.sortBy! : 'transactionAt';
    const sortDir = options?.sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy]: sortDir } as Prisma.TransactionOrderByWithRelationInput;

    if (!options?.page) {
      const items = await this.prisma.transaction.findMany({
        where,
        include: { customer: true, charges: true, commissions: true },
        orderBy,
        take: 100,
      });
      return this.withCreators(items);
    }

    const page = Math.max(1, options.page);
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { customer: true, charges: true, commissions: true },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      items: await this.withCreators(items),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async createCardSwipe(dto: CreateCardSwipeDto, userId: string) {
    const idempotencyKey = await this.dedupeKey(TransactionType.CARD_SWIPE, userId, dto);
    const providerChargeAmount = dto.swipeAmount * dto.providerChargeRate / 100;
    const commissionAmount = dto.swipeAmount * dto.commissionRate / 100;
    const settlementAmount = dto.swipeAmount - providerChargeAmount;
    const customerPayableAmount = dto.swipeAmount - providerChargeAmount - commissionAmount;
    return this.prisma.$transaction(async (tx) => {
      const settlementAccount = await tx.financialAccount.findUnique({
        where: { id: dto.settlementAccountId },
        include: { ledgerAccount: true },
      });
      if (!settlementAccount?.ledgerAccount) {
        throw new NotFoundException('Settlement account or ledger not found');
      }

      const systemLedgers = await tx.ledgerAccount.findMany({
        where: {
          ledgerCode: {
            in: ['SYS-CUST-PAYABLE', 'SYS-COMMISSION', 'SYS-PROVIDER-CHARGE'],
          },
        },
      });
      const byCode = new Map(systemLedgers.map((item) => [item.ledgerCode, item]));
      const payableLedger = byCode.get('SYS-CUST-PAYABLE');
      const commissionLedger = byCode.get('SYS-COMMISSION');
      const providerChargeLedger = byCode.get('SYS-PROVIDER-CHARGE');
      if (!payableLedger || !commissionLedger || !providerChargeLedger) {
        throw new Error('Required system ledgers are missing');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'CCS-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CARD_SWIPE,
          transactionAt: new Date(),
          customerId: dto.customerId,
          grossAmount: new Prisma.Decimal(dto.swipeAmount),
          netAmount: new Prisma.Decimal(customerPayableAmount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });
      await tx.cardSwipeDetail.create({
        data: {
          transactionId: transaction.id,
          customerCardId: dto.customerCardId,
          swipeAmount: new Prisma.Decimal(dto.swipeAmount),
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          providerChargeRate: new Prisma.Decimal(dto.providerChargeRate),
          providerChargeAmount: new Prisma.Decimal(providerChargeAmount),
          commissionRate: new Prisma.Decimal(dto.commissionRate),
          commissionAmount: new Prisma.Decimal(commissionAmount),
          customerPayableAmount: new Prisma.Decimal(customerPayableAmount),
          paymentTermId: dto.paymentTermId,
          dueAt: new Date(dto.dueAt),
          settlementAccountId: dto.settlementAccountId,
          settlementAmount: new Prisma.Decimal(settlementAmount),
        },
      });

      await tx.transactionCharge.create({
        data: {
          transactionId: transaction.id,
          chargeType: 'PROVIDER',
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          calculationType: 'PERCENTAGE',
          rate: new Prisma.Decimal(dto.providerChargeRate),
          amount: new Prisma.Decimal(providerChargeAmount),
        },
      });

      await tx.transactionCommission.create({
        data: {
          transactionId: transaction.id,
          commissionType: 'CARD_SWIPE',
          calculationType: 'PERCENTAGE',
          rate: new Prisma.Decimal(dto.commissionRate),
          amount: new Prisma.Decimal(commissionAmount),
        },
      });
      const payable = await tx.customerPayable.create({
        data: {
          customerId: dto.customerId,
          sourceTransactionId: transaction.id,
          paymentTermId: dto.paymentTermId,
          originalAmount: new Prisma.Decimal(customerPayableAmount),
          paidAmount: new Prisma.Decimal(0),
          remainingAmount: new Prisma.Decimal(customerPayableAmount),
          dueAt: new Date(dto.dueAt),
          status: PayableStatus.PENDING,
        },
      });

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Credit card swipe',
        [
          {
            ledgerAccountId: settlementAccount.ledgerAccount.id,
            entryType: EntryType.DEBIT,
            amount: settlementAmount,
            customerId: dto.customerId,
            description: 'Provider settlement',
          },
          {
            ledgerAccountId: payableLedger.id,
            entryType: EntryType.CREDIT,
            amount: customerPayableAmount,
            customerId: dto.customerId,
            payableId: payable.id,
            description: 'Customer payable',
          },
          {
            ledgerAccountId: commissionLedger.id,
            entryType: EntryType.CREDIT,
            amount: commissionAmount,
            customerId: dto.customerId,
            description: 'Commission income',
          },
        ],
      );

      await this.auditCreated(tx, transaction, userId);
      return { transaction, payable };
    });
  }

  async createCashTransfer(dto: CreateCashTransferDto, userId: string) {
    const idempotencyKey = await this.dedupeKey(TransactionType.CASH_TRANSFER, userId, dto);
    const commissionAmount = dto.requestedAmount * dto.commissionRate / 100;
    const addOn = dto.commissionMethod === 'ADD_ON';
    const cashReceived = addOn
      ? dto.requestedAmount + commissionAmount
      : dto.requestedAmount;
    const actualTransferAmount = addOn
      ? dto.requestedAmount
      : dto.requestedAmount - commissionAmount;
    const transferChargeAmount = dto.transferChargeAmount ?? 0;
    const destinationCount = [
      dto.beneficiaryAccountId,
      dto.customerBankAccountId,
      dto.customerUpiAccountId,
    ].filter(Boolean).length;

    if (destinationCount > 1) {
      throw new BadRequestException('Choose only one transfer destination account');
    }

    if (actualTransferAmount <= 0) {
      throw new BadRequestException('Commission exceeds transfer amount');
    }

    return this.prisma.$transaction(async (tx) => {
      const [
        cashAccount,
        sourceAccount,
        commissionLedger,
        customerBankAccount,
        customerUpiAccount,
        beneficiaryAccount,
      ] = await Promise.all([
        tx.financialAccount.findUnique({
          where: { id: dto.cashAccountId },
          include: { ledgerAccount: true },
        }),
        tx.financialAccount.findUnique({
          where: { id: dto.sourceAccountId },
          include: { ledgerAccount: true },
        }),
        tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-COMMISSION' } }),
        dto.customerBankAccountId
          ? tx.customerBankAccount.findUnique({ where: { id: dto.customerBankAccountId } })
          : Promise.resolve(null),
        dto.customerUpiAccountId
          ? tx.customerUpiAccount.findUnique({ where: { id: dto.customerUpiAccountId } })
          : Promise.resolve(null),
        dto.beneficiaryAccountId
          ? tx.beneficiaryAccount.findUnique({
              where: { id: dto.beneficiaryAccountId },
              include: { beneficiary: true },
            })
          : Promise.resolve(null),
      ]);

      if (!cashAccount?.ledgerAccount || !sourceAccount?.ledgerAccount || !commissionLedger) {
        throw new NotFoundException('Required account or ledger not found');
      }
      if (customerBankAccount && customerBankAccount.customerId !== dto.customerId) {
        throw new BadRequestException('Selected bank account does not belong to the customer');
      }
      if (customerUpiAccount && customerUpiAccount.customerId !== dto.customerId) {
        throw new BadRequestException('Selected UPI account does not belong to the customer');
      }
      if (beneficiaryAccount && beneficiaryAccount.beneficiary.customerId !== dto.customerId) {
        throw new BadRequestException('Selected beneficiary account does not belong to the customer');
      }

      const chargeLedgerCode =
        sourceAccount.accountType === 'PROVIDER_WALLET'
          ? 'SYS-PROVIDER-CHARGE'
          : 'SYS-BANK-CHARGE';
      const chargeLedger = transferChargeAmount > 0
        ? await tx.ledgerAccount.findUnique({ where: { ledgerCode: chargeLedgerCode } })
        : null;
      if (transferChargeAmount > 0 && !chargeLedger) {
        throw new NotFoundException('Transfer charge ledger not found');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'CTR-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CASH_TRANSFER,
          transactionAt: new Date(),
          customerId: dto.customerId,
          grossAmount: new Prisma.Decimal(cashReceived),
          netAmount: new Prisma.Decimal(actualTransferAmount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.cashTransferDetail.create({
        data: {
          transactionId: transaction.id,
          beneficiaryId: dto.beneficiaryId,
          beneficiaryAccountId: dto.beneficiaryAccountId,
          customerBankAccountId: dto.customerBankAccountId,
          customerUpiAccountId: dto.customerUpiAccountId,
          requestedAmount: new Prisma.Decimal(dto.requestedAmount),
          commissionMethod: dto.commissionMethod,
          commissionRate: new Prisma.Decimal(dto.commissionRate),
          commissionAmount: new Prisma.Decimal(commissionAmount),
          cashReceived: new Prisma.Decimal(cashReceived),
          actualTransferAmount: new Prisma.Decimal(actualTransferAmount),
          transferChargeAmount: new Prisma.Decimal(transferChargeAmount),
          transferChargeType: dto.transferChargeType,
          sourceAccountId: dto.sourceAccountId,
          cashAccountId: dto.cashAccountId,
          transferReference: dto.referenceNumber,
        },
      });

      await tx.transactionCommission.create({
        data: {
          transactionId: transaction.id,
          commissionType: 'CASH_TRANSFER',
          calculationType: 'PERCENTAGE',
          rate: new Prisma.Decimal(dto.commissionRate),
          amount: new Prisma.Decimal(commissionAmount),
        },
      });

      if (transferChargeAmount > 0) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType:
              dto.transferChargeType ??
              (sourceAccount.accountType === 'PROVIDER_WALLET' ? 'WALLET' : 'BANK'),
            providerId: sourceAccount.providerId,
            calculationType: 'FIXED',
            amount: new Prisma.Decimal(transferChargeAmount),
          },
        });
      }

      const ledgerEntries = [
        {
          ledgerAccountId: cashAccount.ledgerAccount.id,
          entryType: EntryType.DEBIT,
          amount: cashReceived,
          customerId: dto.customerId,
        },
        {
          ledgerAccountId: sourceAccount.ledgerAccount.id,
          entryType: EntryType.CREDIT,
          amount: actualTransferAmount + transferChargeAmount,
          customerId: dto.customerId,
        },
        {
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: commissionAmount,
          customerId: dto.customerId,
        },
      ];

      if (transferChargeAmount > 0 && chargeLedger) {
        ledgerEntries.push({
          ledgerAccountId: chargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: transferChargeAmount,
          customerId: dto.customerId,
        });
      }

      await this.ledger.post(tx, transaction.id, userId, 'Cash transfer', ledgerEntries);

      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async createAeps(dto: CreateAepsDto, userId: string) {
    const idempotencyKey = await this.dedupeKey(TransactionType.AEPS_WITHDRAWAL, userId, dto);
    const platformChargeAmount = dto.withdrawalAmount * dto.platformChargeRate / 100;
    const commissionAmount = dto.withdrawalAmount * dto.commissionRate / 100;
    const cashGiven = dto.withdrawalAmount - commissionAmount;
    const settlementAmount = dto.withdrawalAmount - platformChargeAmount;

    if (cashGiven <= 0 || settlementAmount <= 0) {
      throw new BadRequestException('Invalid AePS charges or commission');
    }

    return this.prisma.$transaction(async (tx) => {
      const [cashAccount, settlementAccount, chargeLedger, commissionLedger] =
        await Promise.all([
          tx.financialAccount.findUnique({
            where: { id: dto.cashAccountId },
            include: { ledgerAccount: true },
          }),
          tx.financialAccount.findUnique({
            where: { id: dto.settlementAccountId },
            include: { ledgerAccount: true },
          }),
          tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-PROVIDER-CHARGE' } }),
          tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-COMMISSION' } }),
        ]);

      if (
        !cashAccount?.ledgerAccount ||
        !settlementAccount?.ledgerAccount ||
        !chargeLedger ||
        !commissionLedger
      ) {
        throw new NotFoundException('Required AePS account or ledger not found');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'AEPS-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.AEPS_WITHDRAWAL,
          transactionAt: new Date(),
          customerId: dto.customerId,
          grossAmount: new Prisma.Decimal(dto.withdrawalAmount),
          netAmount: new Prisma.Decimal(cashGiven),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.providerReference,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.aepsDetail.create({
        data: {
          transactionId: transaction.id,
          aadhaarLastFour: dto.aadhaarLastFour,
          customerBankName: dto.customerBankName,
          withdrawalAmount: new Prisma.Decimal(dto.withdrawalAmount),
          platformId: dto.platformId,
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          platformChargeRate: new Prisma.Decimal(dto.platformChargeRate),
          platformChargeAmount: new Prisma.Decimal(platformChargeAmount),
          commissionRate: new Prisma.Decimal(dto.commissionRate),
          commissionAmount: new Prisma.Decimal(commissionAmount),
          cashGiven: new Prisma.Decimal(cashGiven),
          cashAccountId: dto.cashAccountId,
          settlementAccountId: dto.settlementAccountId,
          settlementAmount: new Prisma.Decimal(settlementAmount),
          providerReference: dto.providerReference,
        },
      });

      await tx.transactionCharge.create({
        data: {
          transactionId: transaction.id,
          chargeType: 'PROVIDER',
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          calculationType: 'PERCENTAGE',
          rate: new Prisma.Decimal(dto.platformChargeRate),
          amount: new Prisma.Decimal(platformChargeAmount),
        },
      });

      await tx.transactionCommission.create({
        data: {
          transactionId: transaction.id,
          commissionType: 'AEPS',
          calculationType: 'PERCENTAGE',
          rate: new Prisma.Decimal(dto.commissionRate),
          amount: new Prisma.Decimal(commissionAmount),
        },
      });

      await this.ledger.post(tx, transaction.id, userId, 'AePS withdrawal', [
        {
          ledgerAccountId: settlementAccount.ledgerAccount.id,
          entryType: EntryType.DEBIT,
          amount: settlementAmount,
          customerId: dto.customerId,
        },
        {
          ledgerAccountId: chargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: platformChargeAmount,
          customerId: dto.customerId,
        },
        {
          ledgerAccountId: cashAccount.ledgerAccount.id,
          entryType: EntryType.CREDIT,
          amount: cashGiven,
          customerId: dto.customerId,
        },
        {
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: commissionAmount,
          customerId: dto.customerId,
        },
      ]);

      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async createInternalTransfer(dto: CreateInternalTransferDto, userId: string) {
    const idempotencyKey = await this.dedupeKey(TransactionType.INTERNAL_TRANSFER, userId, dto);
    const chargeAmount = dto.chargeAmount ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const [source, destination] = await Promise.all([
        tx.financialAccount.findUnique({
          where: { id: dto.sourceAccountId },
          include: { ledgerAccount: true },
        }),
        tx.financialAccount.findUnique({
          where: { id: dto.destinationAccountId },
          include: { ledgerAccount: true },
        }),
      ]);

      if (!source?.ledgerAccount || !destination?.ledgerAccount) {
        throw new NotFoundException('Transfer account or ledger not found');
      }

      const chargeLedgerCode =
        source.accountType === 'PROVIDER_WALLET'
          ? 'SYS-PROVIDER-CHARGE'
          : 'SYS-BANK-CHARGE';
      const chargeLedger = chargeAmount > 0
        ? await tx.ledgerAccount.findUnique({ where: { ledgerCode: chargeLedgerCode } })
        : null;

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'INT-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.INTERNAL_TRANSFER,
          transactionAt: new Date(),
          grossAmount: new Prisma.Decimal(dto.transferAmount + chargeAmount),
          netAmount: new Prisma.Decimal(dto.transferAmount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.internalTransferDetail.create({
        data: {
          transactionId: transaction.id,
          sourceAccountId: dto.sourceAccountId,
          destinationAccountId: dto.destinationAccountId,
          transferAmount: new Prisma.Decimal(dto.transferAmount),
          chargeAmount: new Prisma.Decimal(chargeAmount),
          referenceNumber: dto.referenceNumber,
        },
      });

      if (chargeAmount > 0) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType:
              source.accountType === 'PROVIDER_WALLET'
                ? 'WALLET'
                : source.accountType === 'BANK'
                  ? 'BANK'
                  : 'TRANSFER',
            providerId: source.providerId,
            calculationType: 'FIXED',
            amount: new Prisma.Decimal(chargeAmount),
          },
        });
      }

      const entries = [
        {
          ledgerAccountId: destination.ledgerAccount.id,
          entryType: EntryType.DEBIT,
          amount: dto.transferAmount,
        },
        {
          ledgerAccountId: source.ledgerAccount.id,
          entryType: EntryType.CREDIT,
          amount: dto.transferAmount + chargeAmount,
        },
      ];

      if (chargeAmount > 0) {
        if (!chargeLedger) throw new Error('Transfer charge ledger missing');
        entries.splice(1, 0, {
          ledgerAccountId: chargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: chargeAmount,
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Internal transfer',
        entries,
      );

      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async createExpense(dto: CreateExpenseDto, userId: string) {
    const idempotencyKey = await this.dedupeKey(dto.expenseType === 'PERSONAL' ? TransactionType.PERSONAL_EXPENSE : TransactionType.BUSINESS_EXPENSE, userId, dto);
    return this.prisma.$transaction(async (tx) => {
      const paymentAccount = await tx.financialAccount.findUnique({
        where: { id: dto.paymentAccountId },
        include: { ledgerAccount: true },
      });
      if (!paymentAccount?.ledgerAccount) {
        throw new NotFoundException('Payment account or ledger not found');
      }

      const expenseLedgerCode =
        dto.expenseType === 'PERSONAL'
          ? 'SYS-PERSONAL-EXPENSE'
          : 'SYS-BUSINESS-EXPENSE';
      const expenseLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode: expenseLedgerCode },
      });
      if (!expenseLedger) throw new Error('Expense ledger missing');

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'EXP-' + Date.now().toString(36).toUpperCase(),
          transactionType:
            dto.expenseType === 'PERSONAL'
              ? TransactionType.PERSONAL_EXPENSE
              : TransactionType.BUSINESS_EXPENSE,
          transactionAt: new Date(),
          grossAmount: new Prisma.Decimal(dto.amount),
          netAmount: new Prisma.Decimal(dto.amount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.expenseDetail.create({
        data: {
          transactionId: transaction.id,
          expenseCategoryId: dto.expenseCategoryId,
          expenseType: dto.expenseType,
          paymentAccountId: dto.paymentAccountId,
          amount: new Prisma.Decimal(dto.amount),
          description: dto.description,
        },
      });

      await this.ledger.post(tx, transaction.id, userId, dto.description, [
        {
          ledgerAccountId: expenseLedger.id,
          entryType: EntryType.DEBIT,
          amount: dto.amount,
        },
        {
          ledgerAccountId: paymentAccount.ledgerAccount.id,
          entryType: EntryType.CREDIT,
          amount: dto.amount,
        },
      ]);

      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async createAtmWithdrawal(dto: CreateAtmWithdrawalDto, userId: string) {
    const idempotencyKey = await this.dedupeKey(TransactionType.ATM_WITHDRAWAL, userId, dto);
    const atmCharge = dto.atmCharge ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const [bankAccount, cashAccount, atmChargeLedger] = await Promise.all([
        tx.financialAccount.findUnique({
          where: { id: dto.bankAccountId },
          include: { ledgerAccount: true },
        }),
        tx.financialAccount.findUnique({
          where: { id: dto.cashAccountId },
          include: { ledgerAccount: true },
        }),
        tx.ledgerAccount.findUnique({ where: { ledgerCode: 'SYS-ATM-CHARGE' } }),
      ]);

      if (!bankAccount?.ledgerAccount || !cashAccount?.ledgerAccount || !atmChargeLedger) {
        throw new NotFoundException('ATM account or ledger not found');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'ATM-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.ATM_WITHDRAWAL,
          transactionAt: new Date(),
          grossAmount: new Prisma.Decimal(dto.cashReceived + atmCharge),
          netAmount: new Prisma.Decimal(dto.cashReceived),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.atmWithdrawalDetail.create({
        data: {
          transactionId: transaction.id,
          bankAccountId: dto.bankAccountId,
          cashAccountId: dto.cashAccountId,
          withdrawalAmount: new Prisma.Decimal(dto.cashReceived + atmCharge),
          cashReceived: new Prisma.Decimal(dto.cashReceived),
          atmCharge: new Prisma.Decimal(atmCharge),
          referenceNumber: dto.referenceNumber,
        },
      });

      if (atmCharge > 0) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType: 'ATM',
            calculationType: 'FIXED',
            amount: new Prisma.Decimal(atmCharge),
          },
        });
      }

      const entries = [
        {
          ledgerAccountId: cashAccount.ledgerAccount.id,
          entryType: EntryType.DEBIT,
          amount: dto.cashReceived,
        },
        {
          ledgerAccountId: bankAccount.ledgerAccount.id,
          entryType: EntryType.CREDIT,
          amount: dto.cashReceived + atmCharge,
        },
      ];

      if (atmCharge > 0) {
        entries.splice(1, 0, {
          ledgerAccountId: atmChargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: atmCharge,
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'ATM withdrawal',
        entries,
      );

      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async createCreditCardPayment(dto: CreateCreditCardPaymentDto, userId: string) {
    const idempotencyKey = await this.dedupeKey(TransactionType.OWNER_CC_PAYMENT, userId, dto);
    return this.prisma.$transaction(async (tx) => {
      const [cardAccount, sourceAccount] = await Promise.all([
        tx.financialAccount.findUnique({
          where: { id: dto.creditCardAccountId },
          include: { ledgerAccount: true },
        }),
        tx.financialAccount.findUnique({
          where: { id: dto.sourceAccountId },
          include: { ledgerAccount: true },
        }),
      ]);

      if (!cardAccount?.ledgerAccount || !sourceAccount?.ledgerAccount) {
        throw new NotFoundException('Credit card or source account ledger not found');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'CCP-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.OWNER_CC_PAYMENT,
          transactionAt: new Date(),
          grossAmount: new Prisma.Decimal(dto.paymentAmount),
          netAmount: new Prisma.Decimal(dto.paymentAmount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.creditCardPaymentDetail.create({
        data: {
          transactionId: transaction.id,
          creditCardAccountId: dto.creditCardAccountId,
          sourceAccountId: dto.sourceAccountId,
          paymentAmount: new Prisma.Decimal(dto.paymentAmount),
          referenceNumber: dto.referenceNumber,
        },
      });

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Owner credit card payment',
        [
          {
            ledgerAccountId: cardAccount.ledgerAccount.id,
            entryType: EntryType.DEBIT,
            amount: dto.paymentAmount,
          },
          {
            ledgerAccountId: sourceAccount.ledgerAccount.id,
            entryType: EntryType.CREDIT,
            amount: dto.paymentAmount,
          },
        ],
      );

      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async get(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        customer: true,
        charges: true,
        commissions: true,
        cardSwipe: true,
        cashTransfer: true,
        aeps: true,
        internalTransfer: true,
        expense: true,
        atmWithdrawal: true,
        creditCardPayment: true,
        payable: { include: { payments: true } },
        payablePayment: { include: { payable: true } },
        receivableSource: { include: { collections: true } },
        receivableCollection: { include: { receivable: true } },
        journal: {
          include: {
            entries: { include: { ledgerAccount: true } },
          },
        },
      },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    const creator = await this.prisma.user.findUnique({
      where: { id: transaction.createdById },
      select: { id: true, fullName: true },
    });
    return { ...transaction, createdBy: creator };
  }

  async reverse(id: string, dto: ReverseTransactionDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.transaction.findUnique({
        where: { id },
        include: {
          journal: { include: { entries: true } },
          payable: { include: { payments: true } },
          payablePayment: true,
          receivableSource: { include: { collections: true } },
          receivableCollection: true,
        },
      });

      if (!original) throw new NotFoundException('Transaction not found');
      if (original.status === TransactionStatus.REVERSED || original.transactionType === TransactionType.REVERSAL) {
        throw new BadRequestException('Transaction is already reversed or is a reversal');
      }

      if (original.payable && Number(original.payable.paidAmount) > 0) {
        throw new BadRequestException('Reverse customer payouts first before reversing this source transaction');
      }
      if (original.receivableSource && Number(original.receivableSource.receivedAmount) > 0) {
        throw new BadRequestException('Reverse receivable collections first before reversing this source transaction');
      }

      if (!original.journal) {
        throw new BadRequestException('Transaction has no posted journal to reverse');
      }

      const reversal = await tx.transaction.create({
        data: {
          transactionNumber: 'REV-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.REVERSAL,
          transactionAt: new Date(),
          customerId: original.customerId,
          grossAmount: original.grossAmount,
          netAmount: original.netAmount,
          status: TransactionStatus.COMPLETED,
          referenceNumber: original.transactionNumber,
          notes: 'Reversal of ' + original.transactionNumber,
          reversedTransactionId: original.id,
          reversalReason: dto.reason,
          createdById: userId,
        },
      });

      await this.ledger.post(
        tx,
        reversal.id,
        userId,
        'Reversal of ' + original.transactionNumber,
        original.journal.entries.map((entry) => ({
          ledgerAccountId: entry.ledgerAccountId,
          entryType: entry.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT,
          amount: Number(entry.amount),
          customerId: entry.customerId ?? undefined,
          payableId: entry.payableId ?? undefined,
          receivableId: entry.receivableId ?? undefined,
          description: 'Reversal: ' + (entry.description ?? original.transactionNumber),
        })),
      );

      if (original.payable) {
        await tx.customerPayable.update({
          where: { id: original.payable.id },
          data: {
            status: PayableStatus.REVERSED,
            remainingAmount: new Prisma.Decimal(0),
          },
        });
      }

      if (original.payablePayment) {
        const payment = original.payablePayment;
        const payable = await tx.customerPayable.findUnique({ where: { id: payment.payableId } });
        if (payable) {
          const paid = Math.max(0, Number(payable.paidAmount) - Number(payment.amount));
          const remaining = Number(payable.originalAmount) - paid;
          await tx.payablePayment.update({
            where: { id: payment.id },
            data: { status: 'REVERSED' },
          });
          await tx.customerPayable.update({
            where: { id: payable.id },
            data: {
              paidAmount: new Prisma.Decimal(paid),
              remainingAmount: new Prisma.Decimal(remaining),
              status: paid <= 0 ? PayableStatus.PENDING : PayableStatus.PARTIALLY_PAID,
            },
          });
        }
      }

      if (original.receivableSource) {
        await tx.customerReceivable.update({
          where: { id: original.receivableSource.id },
          data: {
            status: ReceivableStatus.REVERSED,
            remainingAmount: new Prisma.Decimal(0),
          },
        });
      }

      if (original.receivableCollection) {
        const collection = original.receivableCollection;
        const receivable = await tx.customerReceivable.findUnique({
          where: { id: collection.receivableId },
        });
        if (receivable) {
          const received = Math.max(
            0,
            Number(receivable.receivedAmount) - Number(collection.amount),
          );
          const remaining = Number(receivable.originalAmount) - received;
          const status =
            remaining <= 0
              ? ReceivableStatus.RECEIVED
              : receivable.dueAt && receivable.dueAt < new Date()
                ? ReceivableStatus.OVERDUE
                : received <= 0
                  ? ReceivableStatus.PENDING
                  : ReceivableStatus.PARTIALLY_RECEIVED;
          await tx.receivableCollection.update({
            where: { id: collection.id },
            data: { status: PaymentStatus.REVERSED },
          });
          await tx.customerReceivable.update({
            where: { id: receivable.id },
            data: {
              receivedAmount: new Prisma.Decimal(received),
              remainingAmount: new Prisma.Decimal(remaining),
              status,
            },
          });
        }
      }

      await tx.transaction.update({
        where: { id: original.id },
        data: {
          status: TransactionStatus.REVERSED,
          reversalReason: dto.reason,
          updatedById: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: original.id,
          action: 'REVERSE',
          oldValues: {
            status: original.status,
            transactionNumber: original.transactionNumber,
          },
          newValues: {
            status: TransactionStatus.REVERSED,
            reversalTransactionId: reversal.id,
          },
          reason: dto.reason,
        },
      });

      return { originalId: original.id, reversal };
    });
  }
}
