import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountNature, AccountType, CommissionMethod, CustomerType, EntryType, PayableStatus, PaymentStatus, Prisma, ProviderSettlementStatus, ReceivableStatus, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { IdempotencyService } from '../finance/idempotency.service.js';
import { LedgerService, type JournalEntry } from '../ledger/ledger.service.js';
import { ProviderSettlementsService } from '../provider-settlements/provider-settlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAepsDto } from './dto/create-aeps.dto.js';
import { CreateAtmWithdrawalDto } from './dto/create-atm-withdrawal.dto.js';
import { CreateCardSwipeDto } from './dto/create-card-swipe.dto.js';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto.js';
import { CreateCreditCardPaymentDto } from './dto/create-credit-card-payment.dto.js';
import { CompleteExpenseDto, CreateExpenseDto } from './dto/create-expense.dto.js';
import { CreateInternalTransferDto } from './dto/create-internal-transfer.dto.js';
import { CreateMicroAtmDto } from './dto/create-micro-atm.dto.js';
import { CompleteQuickCashTransferDto, CreateQuickCashTransferDto } from './dto/quick-cash-transfer.dto.js';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto.js';
import { UpdateTransactionDateTimeDto } from './dto/update-transaction-date-time.dto.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly validation: FinancialValidationService,
    private readonly idempotency: IdempotencyService,
    private readonly settlements: ProviderSettlementsService,
  ) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

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

  private async withCreators<T extends { createdById: string; providerSettlementReceipt?: { settlement?: { sourceTransaction?: { createdById: string } | null } | null } | null }>(items: T[]) {
    const userIds = [...new Set(items.flatMap((item) => [
      item.createdById,
      item.providerSettlementReceipt?.settlement?.sourceTransaction?.createdById,
    ].filter((id): id is string => Boolean(id))))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return items.map((item) => {
      const source = item.providerSettlementReceipt?.settlement?.sourceTransaction;
      return {
        ...item,
        createdBy: byId.get(item.createdById) ?? null,
        providerSettlementReceipt: item.providerSettlementReceipt
          ? {
              ...item.providerSettlementReceipt,
              settlement: item.providerSettlementReceipt.settlement
                ? {
                    ...item.providerSettlementReceipt.settlement,
                    sourceTransaction: source
                      ? { ...source, createdBy: byId.get(source.createdById) ?? null }
                      : source,
                  }
                : item.providerSettlementReceipt.settlement,
            }
          : item.providerSettlementReceipt,
      };
    });
  }

  async list(options?: {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    q?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    moneyStatus?: string;
    from?: Date;
    to?: Date;
  }) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const moneyStatusWhere: Prisma.TransactionWhereInput = options?.moneyStatus
      ? options.moneyStatus === 'PAYOUT_PENDING'
        ? { payable: { status: PayableStatus.PENDING, dueAt: { gte: startOfToday } } }
        : options.moneyStatus === 'PAYOUT_OVERDUE'
          ? { payable: { OR: [{ status: PayableStatus.OVERDUE }, { status: PayableStatus.PENDING, dueAt: { lt: startOfToday } }] } }
          : options.moneyStatus === 'PAYOUT_PARTIALLY_PAID'
            ? { payable: { status: PayableStatus.PARTIALLY_PAID } }
            : options.moneyStatus === 'PAYOUT_PAID'
              ? { payable: { status: PayableStatus.PAID } }
              : options.moneyStatus === 'PAYIN_PENDING'
                ? { receivableSource: { status: ReceivableStatus.PENDING, OR: [{ dueAt: null }, { dueAt: { gte: startOfToday } }] } }
                : options.moneyStatus === 'PAYIN_OVERDUE'
                  ? { receivableSource: { OR: [{ status: ReceivableStatus.OVERDUE }, { status: ReceivableStatus.PENDING, dueAt: { lt: startOfToday } }] } }
                  : options.moneyStatus === 'PAYIN_PARTIALLY_RECEIVED'
                    ? { receivableSource: { status: ReceivableStatus.PARTIALLY_RECEIVED } }
                    : options.moneyStatus === 'PAYIN_RECEIVED'
                      ? { receivableSource: { status: ReceivableStatus.RECEIVED } }
                      : {}
      : {};

    const where: Prisma.TransactionWhereInput = {
      ...(options?.q ? {
        OR: [
          { transactionNumber: { contains: options.q, mode: 'insensitive' } },
          { referenceNumber: { contains: options.q, mode: 'insensitive' } },
          { customer: { fullName: { contains: options.q, mode: 'insensitive' } } },
        ],
      } : {}),
      ...(options?.type
        ? { transactionType: options.type }
        : { transactionType: { not: TransactionType.REVERSAL } }),
      ...(options?.status
        ? { status: options.status }
        : { status: { not: TransactionStatus.REVERSED } }),
      ...moneyStatusWhere,
      ...(options?.from || options?.to
        ? {
            transactionAt: {
              ...(options?.from ? { gte: options.from } : {}),
              ...(options?.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    };

    const allowedSort = new Set(['transactionAt', 'transactionNumber', 'transactionType', 'grossAmount', 'netAmount', 'status']);
    const sortBy = allowedSort.has(options?.sortBy ?? '') ? options!.sortBy! : 'transactionAt';
    const sortDir = options?.sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy]: sortDir } as Prisma.TransactionOrderByWithRelationInput;

    const activityInclude = {
      customer: true,
      charges: true,
      commissions: true,
      payable: true,
      receivableSource: true,
      cardSwipe: { include: { customerCard: true } },
      quickCashTransfer: {
        include: {
          cashAccount: true,
          servicePaymentAccount: true,
          commissionAccount: true,
        },
      },
      microAtm: true,
      aeps: true,
      providerSettlementReceipt: {
        include: {
          settlement: {
            include: {
              sourceTransaction: {
                include: {
                  customer: true,
                  cardSwipe: { include: { customerCard: true } },
                  microAtm: true,
                  aeps: true,
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.TransactionInclude;

    if (!options?.page) {
      const items = await this.prisma.transaction.findMany({
        where,
        include: activityInclude,
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
        include: activityInclude,
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

  async listCustomerCardSwipes(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.transaction.findMany({
      where: {
        customerId,
        transactionType: TransactionType.CARD_SWIPE,
      },
      include: {
        charges: true,
        commissions: true,
        cardSwipe: {
          include: {
            customerCard: true,
            paymentTerm: true,
            settlementAccount: true,
          },
        },
        payable: {
          include: {
            payments: {
              include: {
                sourceAccount: true,
                transaction: { include: { charges: true } },
              },
              orderBy: { paymentDate: 'asc' },
            },
          },
        },
        providerSettlementSource: {
          include: {
            provider: true,
            gateway: true,
            destinationAccount: true,
          },
        },
      },
      orderBy: { transactionAt: 'desc' },
    });
  }

  async createCardSwipe(
    dto: CreateCardSwipeDto,
    userId: string,
    actorRole: RoleName,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.CARD_SWIPE,
      userId,
      dto,
      providedIdempotencyKey,
    );
    const configuredGateway = await this.prisma.providerGateway.findFirst({
      where: { id: dto.gatewayId, providerId: dto.providerId, isActive: true },
      select: { defaultChargeRate: true },
    });
    if (!configuredGateway) {
      throw new BadRequestException('Selected active gateway does not belong to the provider');
    }
    const providerChargeRate = Number(dto.providerChargeRate);
    const providerChargeAmount = this.money(
      dto.swipeAmount * providerChargeRate / 100,
    );
    const commissionAmount = this.money(
      dto.swipeAmount * dto.commissionRate / 100,
    );
    const settlementAmount = this.money(
      dto.swipeAmount - providerChargeAmount,
    );
    const customerPayableAmount = this.money(
      dto.swipeAmount - commissionAmount,
    );
    const customerPayments = (dto.customerPayments ?? []).map((payment) => ({
      sourceAccountId: payment.sourceAccountId,
      amount: this.money(payment.amount),
      chargeAmount: this.money(payment.chargeAmount ?? 0),
    }));
    const customerPaidAmount = this.money(
      customerPayments.reduce((sum, payment) => sum + payment.amount, 0),
    );

    if (
      settlementAmount <= 0 ||
      customerPayableAmount < 0 ||
      providerChargeAmount < 0 ||
      commissionAmount < 0
    ) {
      throw new BadRequestException(
        'Invalid swipe amount, provider charge or customer commission',
      );
    }
    if (customerPaidAmount > customerPayableAmount + 0.001) {
      throw new BadRequestException('Customer payment exceeds customer payable');
    }

    return this.prisma.$transaction(async (tx) => {
      let customerId = dto.customerId;
      let customerCardId = dto.customerCardId;
      let createdCustomer: {
        customer: { id: string; fullName: string; mobile: string | null };
        card: {
          id: string;
          bankName: string;
          lastFourDigits: string;
          nickname: string | null;
          isActive: boolean;
        };
      } | null = null;

      if (dto.newCustomer) {
        if (customerId || customerCardId) {
          throw new BadRequestException(
            'Use either an existing customer or a new customer, not both',
          );
        }
        const mobile = dto.newCustomer.mobile.trim();
        const duplicateCustomer = await tx.customer.findFirst({
          where: {
            isActive: true,
            OR: [{ mobile }, { mobile: { endsWith: mobile } }],
          },
          select: { id: true, fullName: true, mobile: true },
        });
        if (duplicateCustomer) {
          throw new BadRequestException(
            'A customer with this mobile already exists. Use the existing customer.',
          );
        }
        const customer = await tx.customer.create({
          data: {
            customerCode: 'CUS-' + Date.now().toString(36).toUpperCase(),
            customerType: CustomerType.REGULAR,
            fullName: dto.newCustomer.fullName.trim(),
            mobile,
            createdById: userId,
          },
        });
        const card = await tx.customerCard.create({
          data: {
            customerId: customer.id,
            bankName: dto.newCustomer.bankName.trim(),
            cardType: 'CREDIT',
            lastFourDigits: dto.newCustomer.lastFourDigits,
          },
        });
        await tx.auditLog.createMany({
          data: [
            {
              userId,
              entityType: 'CUSTOMER',
              entityId: customer.id,
              action: 'CREATE',
              newValues: {
                customerCode: customer.customerCode,
                customerType: customer.customerType,
                fullName: customer.fullName,
                mobile: customer.mobile,
                isActive: customer.isActive,
              },
            },
            {
              userId,
              entityType: 'CUSTOMER_CARD',
              entityId: card.id,
              action: 'CREATE',
              newValues: {
                customerId: customer.id,
                bankName: card.bankName,
                cardType: card.cardType,
                lastFourDigits: card.lastFourDigits,
              },
            },
          ],
        });
        customerId = customer.id;
        customerCardId = card.id;
        createdCustomer = {
          customer: {
            id: customer.id,
            fullName: customer.fullName,
            mobile: customer.mobile,
          },
          card: {
            id: card.id,
            bankName: card.bankName,
            lastFourDigits: card.lastFourDigits,
            nickname: card.nickname,
            isActive: card.isActive,
          },
        };
      } else {
        if (!customerId || !customerCardId) {
          throw new BadRequestException('Customer and card are required');
        }
        await this.validation.activeCustomer(tx, customerId);
        await this.validation.customerCard(tx, customerId, customerCardId);
      }

      if (!customerId || !customerCardId) {
        throw new BadRequestException('Customer and card are required');
      }

      await this.validation.providerGateway(
        tx,
        dto.providerId,
        dto.gatewayId,
        true,
      );
      await this.validation.paymentTerm(tx, dto.paymentTermId);
      const settlementAccount = await tx.financialAccount.findFirst({
        where: {
          providerId: dto.providerId,
          accountType: AccountType.PROVIDER_WALLET,
          isActive: true,
        },
        include: { ledgerAccount: true },
      });
      if (!settlementAccount?.ledgerAccount) {
        throw new BadRequestException('Provider wallet is missing');
      }

      const payoutRequiredByAccount = new Map<string, number>();
      for (const payment of customerPayments) {
        payoutRequiredByAccount.set(
          payment.sourceAccountId,
          this.money(
            (payoutRequiredByAccount.get(payment.sourceAccountId) ?? 0) +
              payment.amount + payment.chargeAmount,
          ),
        );
      }
      const payoutAccountIds = [...payoutRequiredByAccount.keys()].sort();
      for (const accountId of payoutAccountIds) {
        await this.validation.lockAccount(tx, accountId);
      }
      const payoutAccounts = await Promise.all(
        payoutAccountIds.map((accountId) =>
          this.validation.liquidAsset(
            tx,
            accountId,
            'Customer payment source',
          ),
        ),
      );
      const payoutAccountById = new Map(
        payoutAccounts.map((account) => [account.id, account]),
      );
      for (const payment of customerPayments) {
        const sourceAccount = payoutAccountById.get(payment.sourceAccountId)!;
        if (sourceAccount.accountType !== AccountType.PROVIDER_WALLET && payment.chargeAmount > 0) {
          throw new BadRequestException('Payout charge is allowed only for wallet payouts');
        }
      }
      for (const account of payoutAccounts) {
        if (account.accountType === AccountType.CASH) {
          if (
            actorRole === RoleName.STAFF &&
            account.accountName === 'Main Cash Reserve'
          ) {
            throw new BadRequestException('Main Cash Reserve is owner-only');
          }
          await this.validation.requireOpenCashDesk(
            tx,
            account.id,
            'Customer cash payout',
            actorRole === RoleName.STAFF ? userId : undefined,
          );
        }
      }

      const systemLedgers = await tx.ledgerAccount.findMany({
        where: {
          ledgerCode: {
            in: [
              'SYS-CUST-PAYABLE',
              'SYS-COMMISSION',
              'SYS-PROVIDER-CLEARING',
              'SYS-PROVIDER-CHARGE',
              'SYS-BANK-CHARGE',
            ],
          },
        },
      });
      const byCode = new Map(
        systemLedgers.map((item) => [item.ledgerCode, item]),
      );
      const payableLedger = byCode.get('SYS-CUST-PAYABLE');
      const commissionLedger = byCode.get('SYS-COMMISSION');
      const clearingLedger = byCode.get('SYS-PROVIDER-CLEARING');
      const providerChargeLedger = byCode.get('SYS-PROVIDER-CHARGE');
      const bankChargeLedger = byCode.get('SYS-BANK-CHARGE');
      if (!payableLedger || !commissionLedger || !clearingLedger || !providerChargeLedger || !bankChargeLedger) {
        throw new Error('Required system ledgers are missing');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'CCS-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CARD_SWIPE,
          transactionAt: new Date(),
          customerId: customerId,
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
          customerCardId: customerCardId,
          swipeAmount: new Prisma.Decimal(dto.swipeAmount),
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          providerChargeRate: new Prisma.Decimal(providerChargeRate),
          providerChargeAmount: new Prisma.Decimal(providerChargeAmount),
          commissionRate: new Prisma.Decimal(dto.commissionRate),
          commissionAmount: new Prisma.Decimal(commissionAmount),
          customerPayableAmount: new Prisma.Decimal(customerPayableAmount),
          paymentTermId: dto.paymentTermId,
          dueAt: new Date(dto.dueAt),
          settlementAccountId: settlementAccount.id,
          settlementAmount: new Prisma.Decimal(settlementAmount),
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
          },
        });
      }

      if (commissionAmount > 0) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'CARD_SWIPE',
            calculationType: 'PERCENTAGE',
            rate: new Prisma.Decimal(dto.commissionRate),
            amount: new Prisma.Decimal(commissionAmount),
          },
        });
      }

      const payable = await tx.customerPayable.create({
        data: {
          customerId: customerId,
          sourceTransactionId: transaction.id,
          paymentTermId: dto.paymentTermId,
          originalAmount: new Prisma.Decimal(customerPayableAmount),
          paidAmount: new Prisma.Decimal(0),
          remainingAmount: new Prisma.Decimal(customerPayableAmount),
          dueAt: new Date(dto.dueAt),
          status: PayableStatus.PENDING,
        },
      });

      const providerSettlement = await this.settlements.createForSource(tx, {
        sourceTransactionId: transaction.id,
        providerId: dto.providerId,
        gatewayId: dto.gatewayId,
        expectedAmount: settlementAmount,
        destinationAccountId: settlementAccount.id,
        dueAt: dto.settlementDueAt
          ? new Date(dto.settlementDueAt)
          : null,
        createdById: userId,
      });

      const entries: JournalEntry[] = [
        {
          ledgerAccountId: clearingLedger.id,
          entryType: EntryType.DEBIT,
          amount: settlementAmount,
          customerId: customerId,
          providerSettlementId: providerSettlement.id,
          description: 'Provider settlement pending',
        },
        ...(providerChargeAmount > 0 ? [{
          ledgerAccountId: providerChargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: providerChargeAmount,
          customerId: customerId,
          providerSettlementId: providerSettlement.id,
          description: 'Gateway processing charge',
        }] : []),
        {
          ledgerAccountId: payableLedger.id,
          entryType: EntryType.CREDIT,
          amount: customerPayableAmount,
          customerId: customerId,
          payableId: payable.id,
          description: 'Customer payable',
        },
      ];

      if (commissionAmount > 0) {
        entries.push({
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: commissionAmount,
          customerId: customerId,
          providerSettlementId: providerSettlement.id,
          description: 'Customer commission income',
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Credit card swipe',
        entries,
      );

      let settlementReceipt = null;
      if (dto.settledNow) {
        settlementReceipt = await this.settlements.autoReceive(
          tx,
          providerSettlement.id,
          settlementAccount.id,
          settlementAmount,
          userId,
          dto.referenceNumber,
        );
      }

      for (const accountId of payoutAccountIds) {
        const account = payoutAccountById.get(accountId)!;
        await this.validation.ensureSufficientFunds(
          tx,
          account,
          payoutRequiredByAccount.get(accountId) ?? 0,
        );
      }

      const payoutTransactions = [];
      for (let index = 0; index < customerPayments.length; index += 1) {
        const payment = customerPayments[index];
        const sourceAccount = payoutAccountById.get(payment.sourceAccountId)!;
        const payoutTransaction = await tx.transaction.create({
          data: {
            transactionNumber:
              'PAY-' +
              transaction.transactionNumber.slice(4) +
              '-' +
              (index + 1),
            transactionType: TransactionType.CUSTOMER_PAYOUT,
            transactionAt: new Date(),
            customerId: customerId,
            grossAmount: new Prisma.Decimal(payment.amount + payment.chargeAmount),
            netAmount: new Prisma.Decimal(payment.amount),
            status: TransactionStatus.COMPLETED,
            idempotencyKey:
              'CARDPAYOUT:' + transaction.id + ':' + (index + 1),
            referenceNumber: dto.referenceNumber,
            notes: 'Recorded with ' + transaction.transactionNumber,
            createdById: userId,
          },
        });
        await tx.payablePayment.create({
          data: {
            payableId: payable.id,
            transactionId: payoutTransaction.id,
            paymentDate: new Date(),
            sourceAccountId: sourceAccount.id,
            amount: new Prisma.Decimal(payment.amount),
            referenceNumber: dto.referenceNumber,
            notes: 'Recorded with card swipe',
            status: PaymentStatus.COMPLETED,
            createdById: userId,
          },
        });
        if (payment.chargeAmount > 0) {
          await tx.transactionCharge.create({
            data: {
              transactionId: payoutTransaction.id,
              chargeType: sourceAccount.accountType === AccountType.PROVIDER_WALLET ? 'PAYOUT_WALLET' : 'PAYOUT',
              providerId: sourceAccount.providerId,
              calculationType: 'FIXED',
              amount: new Prisma.Decimal(payment.chargeAmount),
              notes: 'Customer payout charge',
            },
          });
        }
        const payoutEntries: JournalEntry[] = [
          {
            ledgerAccountId: payableLedger.id,
            entryType: EntryType.DEBIT,
            amount: payment.amount,
            customerId: customerId,
            payableId: payable.id,
          },
          {
            ledgerAccountId: sourceAccount.ledgerAccount!.id,
            entryType: EntryType.CREDIT,
            amount: payment.amount + payment.chargeAmount,
            customerId: customerId,
            payableId: payable.id,
          },
        ];
        if (payment.chargeAmount > 0) {
          payoutEntries.splice(1, 0, {
            ledgerAccountId: sourceAccount.accountType === AccountType.PROVIDER_WALLET ? providerChargeLedger.id : bankChargeLedger.id,
            entryType: EntryType.DEBIT,
            amount: payment.chargeAmount,
            customerId: customerId,
            payableId: payable.id,
            description: 'Customer payout charge expense',
          });
        }
        await this.ledger.post(
          tx,
          payoutTransaction.id,
          userId,
          'Customer payable payment',
          payoutEntries,
        );
        await this.auditCreated(tx, payoutTransaction, userId);
        payoutTransactions.push(payoutTransaction);
      }

      let updatedPayable = payable;
      if (customerPaidAmount > 0) {
        const remainingAmount = this.money(
          Math.max(0, customerPayableAmount - customerPaidAmount),
        );
        const payableStatus =
          remainingAmount <= 0.001
            ? PayableStatus.PAID
            : PayableStatus.PARTIALLY_PAID;
        updatedPayable = await tx.customerPayable.update({
          where: { id: payable.id },
          data: {
            paidAmount: new Prisma.Decimal(customerPaidAmount),
            remainingAmount: new Prisma.Decimal(remainingAmount),
            status: payableStatus,
          },
        });
        await tx.auditLog.create({
          data: {
            userId,
            entityType: 'CUSTOMER_PAYABLE',
            entityId: payable.id,
            action: 'PAY_AT_SOURCE',
            oldValues: {
              paidAmount: '0',
              remainingAmount: customerPayableAmount.toString(),
              status: PayableStatus.PENDING,
            },
            newValues: {
              paidAmount: customerPaidAmount.toString(),
              remainingAmount: remainingAmount.toString(),
              status: payableStatus,
              paymentCount: customerPayments.length,
            },
          },
        });
      }

      await this.auditCreated(tx, transaction, userId);
      return {
        transaction,
        payable: updatedPayable,
        providerSettlement,
        settlementReceipt,
        payoutTransactions,
        createdCustomer,
      };
    });
  }

  async listPendingQuickCash(
    cashAccountId: string | undefined,
    userId: string,
    actorRole: RoleName,
  ) {
    return this.prisma.quickCashTransferDetail.findMany({
      where: {
        ...(cashAccountId ? { cashAccountId } : {}),
        transaction: {
          status: TransactionStatus.PENDING,
          ...(actorRole === RoleName.STAFF ? { createdById: userId } : {}),
        },
      },
      include: {
        transaction: {
          include: {
            commissions: true,
          },
        },
        cashAccount: true,
        sourceAccount: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuickCash(
    dto: CreateQuickCashTransferDto,
    userId: string,
    actorRole: RoleName,
    providedIdempotencyKey?: string,
  ) {
    const amount = this.money(dto.amount);
    const purpose = dto.purpose ?? 'TRANSFER';
    const commissionAmount = this.money(dto.commissionAmount ?? 0);
    const commissionMode =
      commissionAmount > 0 ? dto.commissionMode ?? 'CASH' : 'CASH';
    const commissionCashAmount =
      commissionAmount <= 0
        ? 0
        : commissionMode === 'CASH'
          ? commissionAmount
          : commissionMode === 'UPI'
            ? 0
            : this.money(dto.commissionCashAmount ?? 0);
    const commissionDigitalAmount = this.money(
      Math.max(0, commissionAmount - commissionCashAmount),
    );
    const servicePaymentMode = dto.servicePaymentMode ?? 'CASH';
    const cashOutType =
      dto.direction === 'OUT' ? dto.cashOutType ?? 'UPI_QR' : 'UPI_QR';
    const successful =
      dto.direction !== 'OUT' || cashOutType === 'UPI_QR'
        ? true
        : dto.successful ?? true;
    const cashOutLabel =
      cashOutType === 'AEPS'
        ? 'AEPS / Aadhaar withdrawal'
        : cashOutType === 'MICRO_ATM'
          ? 'Micro ATM withdrawal'
          : 'UPI / QR cash out';
    const transactionAt = dto.transactionAt
      ? new Date(dto.transactionAt)
      : new Date();

    if (dto.direction === 'OUT' && cashOutType === 'AEPS') {
      if (!dto.aadhaarLastFour || !/^\d{4}$/.test(dto.aadhaarLastFour)) {
        throw new BadRequestException('Aadhaar last four digits are required');
      }
      if (!dto.customerBankName?.trim()) {
        throw new BadRequestException('Aadhaar-linked bank is required');
      }
    }
    if (dto.direction === 'OUT' && cashOutType === 'MICRO_ATM') {
      if (!dto.cardLastFour || !/^\d{4}$/.test(dto.cardLastFour)) {
        throw new BadRequestException('Card last four digits are required');
      }
    }

    if (!successful && commissionAmount > 0) {
      throw new BadRequestException('Failed attempts cannot include commission');
    }

    if (purpose === 'SERVICE') {
      if (dto.direction !== 'IN') {
        throw new BadRequestException('Service income can only be recorded as Cash In');
      }
      if (!dto.serviceName?.trim()) {
        throw new BadRequestException('Service name is required');
      }
      if (servicePaymentMode === 'UPI' && !dto.servicePaymentAccountId) {
        throw new BadRequestException('Choose the bank / UPI account that received the service payment');
      }
    } else {
      if (commissionAmount < 0) {
        throw new BadRequestException('Commission cannot be negative');
      }
      if (
        commissionCashAmount < 0 ||
        commissionCashAmount > commissionAmount
      ) {
        throw new BadRequestException('Cash commission split is invalid');
      }
      if (
        commissionMode === 'SPLIT' &&
        (commissionCashAmount <= 0 || commissionDigitalAmount <= 0)
      ) {
        throw new BadRequestException(
          'Split commission must include both cash and bank / UPI amounts',
        );
      }
      if (dto.direction === 'IN' && commissionAmount >= amount) {
        throw new BadRequestException('Commission must be less than the cash-in amount');
      }
    }

    const idempotencyKey = await this.idempotency.key(
      purpose === 'SERVICE' ? TransactionType.SERVICE_INCOME : TransactionType.CASH_TRANSFER,
      userId,
      { quickCash: true, ...dto },
      providedIdempotencyKey,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.validation.lockAccount(tx, dto.cashAccountId);
      const cashAccount = await this.validation.cashAccount(
        tx,
        dto.cashAccountId,
        'Quick cash drawer',
      );
      if (
        actorRole === RoleName.STAFF &&
        cashAccount.accountName === 'Main Cash Reserve'
      ) {
        throw new ForbiddenException('Main Cash Reserve is owner-only');
      }
      await this.validation.requireOpenCashDesk(
        tx,
        cashAccount.id,
        'Quick cash entry',
        actorRole === RoleName.STAFF ? userId : undefined,
      );

      const linkedCustomer = dto.customerId
        ? await this.validation.activeCustomer(tx, dto.customerId)
        : null;
      const resolvedCustomerName =
        dto.customerName?.trim() || linkedCustomer?.fullName || null;
      const resolvedMobile =
        dto.mobileNumber?.trim() || linkedCustomer?.mobile || null;

      if (purpose === 'SERVICE') {
        const serviceIncomeLedger = await tx.ledgerAccount.findUnique({
          where: { ledgerCode: 'SYS-SERVICE-INCOME' },
        });
        if (!serviceIncomeLedger || !cashAccount.ledgerAccount) {
          throw new NotFoundException('Service income ledger is missing');
        }

        let servicePaymentAccount = cashAccount;
        if (servicePaymentMode === 'UPI') {
          if (!dto.servicePaymentAccountId) {
            throw new BadRequestException('Choose the bank / UPI account that received the service payment');
          }
          if (dto.servicePaymentAccountId !== cashAccount.id) {
            await this.validation.lockAccount(tx, dto.servicePaymentAccountId);
          }
          servicePaymentAccount = await this.validation.account(
            tx,
            dto.servicePaymentAccountId,
            {
              label: 'Service payment account',
              nature: AccountNature.ASSET,
              types: [AccountType.BANK, AccountType.UPI],
            },
          );
        }

        const serviceName = dto.serviceName!.trim();
        const transaction = await tx.transaction.create({
          data: {
            transactionNumber: 'SVC-' + Date.now().toString(36).toUpperCase(),
            transactionType: TransactionType.SERVICE_INCOME,
            transactionAt,
            grossAmount: new Prisma.Decimal(amount),
            netAmount: new Prisma.Decimal(amount),
            status: TransactionStatus.COMPLETED,
            idempotencyKey,
            customerId: linkedCustomer?.id ?? null,
            notes: [serviceName, dto.remarks?.trim()].filter(Boolean).join(' · '),
            createdById: userId,
          },
        });
        await tx.quickCashTransferDetail.create({
          data: {
            transactionId: transaction.id,
            direction: 'IN',
            purpose: 'SERVICE',
            serviceName,
            cashAccountId: cashAccount.id,
            customerName: resolvedCustomerName,
            mobileNumber: resolvedMobile,
            amount: new Prisma.Decimal(amount),
            commissionAmount: new Prisma.Decimal(0),
            servicePaymentMode,
            servicePaymentAccountId: servicePaymentMode === 'UPI' ? servicePaymentAccount.id : null,
            completedAt: new Date(),
          },
        });
        await this.ledger.post(tx,transaction.id,userId,'Service income · ' + serviceName,[
          {
            ledgerAccountId: servicePaymentAccount.ledgerAccount!.id,
            entryType: EntryType.DEBIT,
            amount,
            description: (servicePaymentMode === 'UPI' ? 'Bank / UPI payment' : 'Cash received') + ' for ' + serviceName,
          },
          {
            ledgerAccountId: serviceIncomeLedger.id,
            entryType: EntryType.CREDIT,
            amount,
            description: 'Service income · ' + serviceName,
          },
        ]);
        await this.auditCreated(tx, transaction, userId);
        return transaction;
      }

      if (!successful) {
        const transaction = await tx.transaction.create({
          data: {
            transactionNumber: 'QCT-' + Date.now().toString(36).toUpperCase(),
            transactionType: TransactionType.CASH_TRANSFER,
            transactionAt,
            customerId: linkedCustomer?.id ?? null,
            grossAmount: new Prisma.Decimal(amount),
            netAmount: new Prisma.Decimal(amount),
            status: TransactionStatus.FAILED,
            idempotencyKey,
            notes: dto.remarks?.trim() || 'Failed ' + cashOutLabel,
            createdById: userId,
          },
        });
        await tx.quickCashTransferDetail.create({
          data: {
            transactionId: transaction.id,
            direction: 'OUT',
            purpose: 'TRANSFER',
            cashOutType,
            aadhaarLastFour:
              cashOutType === 'AEPS' ? dto.aadhaarLastFour : null,
            customerBankName:
              ['AEPS', 'MICRO_ATM'].includes(cashOutType)
                ? dto.customerBankName?.trim() || null
                : null,
            cardLastFour:
              cashOutType === 'MICRO_ATM' ? dto.cardLastFour : null,
            cashAccountId: cashAccount.id,
            customerName: resolvedCustomerName,
            mobileNumber: resolvedMobile,
            amount: new Prisma.Decimal(amount),
            commissionAmount: new Prisma.Decimal(0),
            commissionCashAmount: new Prisma.Decimal(0),
            commissionMode: 'CASH',
            completedAt: new Date(),
          },
        });
        await this.auditCreated(tx, transaction, userId);
        return transaction;
      }

      const ledgerCodes = [
        'SYS-CUST-PAYABLE',
        'SYS-CUST-RECEIVABLE',
        'SYS-COMMISSION',
        'SYS-COMMISSION-RECEIVABLE',
      ];
      const ledgers = await tx.ledgerAccount.findMany({
        where: { ledgerCode: { in: ledgerCodes } },
      });
      const byCode = new Map(ledgers.map((item) => [item.ledgerCode, item]));
      const pendingLedger = byCode.get(
        dto.direction === 'IN' ? 'SYS-CUST-PAYABLE' : 'SYS-CUST-RECEIVABLE',
      );
      const commissionLedger = byCode.get('SYS-COMMISSION');
      const commissionReceivableLedger = byCode.get('SYS-COMMISSION-RECEIVABLE');
      if (
        !pendingLedger ||
        !commissionLedger ||
        !cashAccount.ledgerAccount ||
        (commissionDigitalAmount > 0 && !commissionReceivableLedger)
      ) {
        throw new NotFoundException('Required ledger account is missing');
      }

      const transferAmount =
        dto.direction === 'IN'
          ? this.money(amount - commissionCashAmount)
          : amount;
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'QCT-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CASH_TRANSFER,
          transactionAt,
          customerId: linkedCustomer?.id ?? null,
          grossAmount: new Prisma.Decimal(
            dto.direction === 'IN'
              ? this.money(amount + commissionDigitalAmount)
              : this.money(amount + commissionAmount),
          ),
          netAmount: new Prisma.Decimal(
            dto.direction === 'IN' ? transferAmount : amount,
          ),
          status: TransactionStatus.PENDING,
          idempotencyKey,
          notes:
            dto.remarks?.trim() ||
            (dto.direction === 'IN' ? 'Quick cash in' : cashOutLabel),
          createdById: userId,
        },
      });

      await tx.quickCashTransferDetail.create({
        data: {
          transactionId: transaction.id,
          direction: dto.direction,
          purpose: 'TRANSFER',
          serviceName:
            dto.direction === 'IN' ? dto.serviceName?.trim() || null : null,
          cashOutType,
          aadhaarLastFour:
            dto.direction === 'OUT' && cashOutType === 'AEPS'
              ? dto.aadhaarLastFour
              : null,
          customerBankName:
            dto.direction === 'OUT' && ['AEPS', 'MICRO_ATM'].includes(cashOutType)
              ? dto.customerBankName?.trim() || null
              : null,
          cardLastFour:
            dto.direction === 'OUT' && cashOutType === 'MICRO_ATM'
              ? dto.cardLastFour
              : null,
          cashAccountId: cashAccount.id,
          customerName: resolvedCustomerName,
          mobileNumber: resolvedMobile,
          amount: new Prisma.Decimal(amount),
          commissionAmount: new Prisma.Decimal(commissionAmount),
          commissionCashAmount: new Prisma.Decimal(commissionCashAmount),
          commissionMode,
          beneficiaryMode:
            dto.direction === 'IN'
              ? dto.beneficiaryMode ?? 'UPI'
              : null,
          beneficiaryDetails:
            dto.direction === 'IN' ? dto.beneficiaryDetails?.trim() || null : null,
        },
      });

      if (commissionAmount > 0) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'QUICK_CASH_TRANSFER',
            calculationType: 'FIXED',
            rate: new Prisma.Decimal(0),
            amount: new Prisma.Decimal(commissionAmount),
          },
        });
      }

      const entries: JournalEntry[] =
        dto.direction === 'IN'
          ? [
              {
                ledgerAccountId: cashAccount.ledgerAccount.id,
                entryType: EntryType.DEBIT,
                amount,
                description: 'Quick cash received',
              },
              {
                ledgerAccountId: pendingLedger.id,
                entryType: EntryType.CREDIT,
                amount: transferAmount,
                description: 'Pending transfer obligation',
              },
            ]
          : [
              {
                ledgerAccountId: pendingLedger.id,
                entryType: EntryType.DEBIT,
                amount: transferAmount,
                description: 'Pending incoming transfer',
              },
              {
                ledgerAccountId: cashAccount.ledgerAccount.id,
                entryType: EntryType.CREDIT,
                amount,
                description: 'Quick cash paid out',
              },
            ];
      if (commissionAmount > 0) {
        if (commissionDigitalAmount > 0) {
          entries.push({
            ledgerAccountId: commissionReceivableLedger!.id,
            entryType: EntryType.DEBIT,
            amount: commissionDigitalAmount,
            description: 'Bank / UPI commission awaiting account allocation',
          });
        }
        if (dto.direction === 'OUT' && commissionCashAmount > 0) {
          entries.push({
            ledgerAccountId: cashAccount.ledgerAccount.id,
            entryType: EntryType.DEBIT,
            amount: commissionCashAmount,
            description: 'Cash commission received',
          });
        }
        entries.push({
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: commissionAmount,
          description: 'Quick cash commission · ' + commissionMode,
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        dto.direction === 'IN' ? 'Quick cash in' : cashOutLabel,
        entries,
      );
      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async completeQuickCash(
    id: string,
    dto: CompleteQuickCashTransferDto,
    userId: string,
    actorRole: RoleName,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const detail = await tx.quickCashTransferDetail.findUnique({
        where: { id },
        include: { transaction: true, cashAccount: true },
      });
      if (!detail) throw new NotFoundException('Pending cash entry not found');
      if (detail.transaction.status !== TransactionStatus.PENDING) {
        throw new BadRequestException('This cash entry is already completed');
      }
      if (
        actorRole === RoleName.STAFF &&
        detail.transaction.createdById !== userId
      ) {
        throw new ForbiddenException('Staff can only complete their own pending cash entries');
      }
      if (dto.sourceAccountId === detail.cashAccountId) {
        throw new BadRequestException('Choose a bank, UPI or wallet account');
      }

      await this.validation.lockAccount(tx, dto.sourceAccountId);
      const sourceAccount = await this.validation.liquidAsset(
        tx,
        dto.sourceAccountId,
        detail.direction === 'IN' ? 'Transfer source' : 'Incoming transfer account',
      );
      if (!sourceAccount.ledgerAccount) {
        throw new NotFoundException('Source account ledger is unavailable');
      }

      const amount = Number(detail.amount);
      const commissionAmount = Number(detail.commissionAmount);
      const commissionMode = detail.commissionMode ?? 'CASH';
      const commissionCashAmount =
        detail.commissionCashAmount !== null
          ? Number(detail.commissionCashAmount)
          : commissionMode === 'CASH'
            ? commissionAmount
            : 0;
      const commissionDigitalAmount = this.money(
        Math.max(0, commissionAmount - commissionCashAmount),
      );

      let commissionAccount: any = null;
      if (commissionDigitalAmount > 0) {
        if (!dto.commissionAccountId) {
          throw new BadRequestException('Choose the account that received the bank / UPI commission');
        }
        if (dto.commissionAccountId !== dto.sourceAccountId) {
          await this.validation.lockAccount(tx, dto.commissionAccountId);
        }
        commissionAccount = await this.validation.transferSource(
          tx,
          dto.commissionAccountId,
        );
      }

      const settlementAmount =
        detail.direction === 'IN'
          ? this.money(amount - commissionCashAmount)
          : amount;
      if (detail.direction === 'IN') {
        await this.validation.ensureSufficientFunds(
          tx,
          sourceAccount,
          settlementAmount,
        );
      }

      const ledgerCode =
        detail.direction === 'IN' ? 'SYS-CUST-PAYABLE' : 'SYS-CUST-RECEIVABLE';
      const pendingLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode },
      });
      if (!pendingLedger) {
        throw new NotFoundException('Pending transfer ledger is missing');
      }
      const commissionReceivableLedger =
        commissionDigitalAmount > 0
          ? await tx.ledgerAccount.findUnique({
              where: { ledgerCode: 'SYS-COMMISSION-RECEIVABLE' },
            })
          : null;
      if (
        commissionDigitalAmount > 0 &&
        !commissionReceivableLedger
      ) {
        throw new NotFoundException('Commission receivable ledger is missing');
      }

      const completion = await tx.transaction.create({
        data: {
          transactionNumber: 'QCC-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CASH_TRANSFER,
          transactionAt: new Date(),
          grossAmount: new Prisma.Decimal(settlementAmount),
          netAmount: new Prisma.Decimal(settlementAmount),
          status: TransactionStatus.COMPLETED,
          referenceNumber: dto.referenceNumber?.trim() || null,
          notes:
            dto.notes?.trim() ||
            'Completion for ' + detail.transaction.transactionNumber,
          createdById: userId,
        },
      });

      const completionEntries: JournalEntry[] =
        detail.direction === 'IN'
          ? [
              {
                ledgerAccountId: pendingLedger.id,
                entryType: EntryType.DEBIT,
                amount: settlementAmount,
                description: 'Clear pending transfer obligation',
              },
              {
                ledgerAccountId: sourceAccount.ledgerAccount.id,
                entryType: EntryType.CREDIT,
                amount: settlementAmount,
                description: 'Transfer source outflow',
              },
            ]
          : [
              {
                ledgerAccountId: sourceAccount.ledgerAccount.id,
                entryType: EntryType.DEBIT,
                amount: settlementAmount,
                description: 'Incoming customer transfer',
              },
              {
                ledgerAccountId: pendingLedger.id,
                entryType: EntryType.CREDIT,
                amount: settlementAmount,
                description: 'Clear pending incoming transfer',
              },
            ];
      if (
        commissionDigitalAmount > 0 &&
        commissionAccount?.ledgerAccount &&
        commissionReceivableLedger
      ) {
        completionEntries.push(
          {
            ledgerAccountId: commissionAccount.ledgerAccount.id,
            entryType: EntryType.DEBIT,
            amount: commissionDigitalAmount,
            description: 'Bank / UPI commission received',
          },
          {
            ledgerAccountId: commissionReceivableLedger.id,
            entryType: EntryType.CREDIT,
            amount: commissionDigitalAmount,
            description: 'Clear pending bank / UPI commission allocation',
          },
        );
      }
      await this.ledger.post(
        tx,
        completion.id,
        userId,
        'Complete ' + detail.transaction.transactionNumber,
        completionEntries,
      );

      await tx.quickCashTransferDetail.update({
        where: { id },
        data: {
          sourceAccountId: sourceAccount.id,
          commissionAccountId: commissionAccount?.id ?? null,
          ...(dto.customerName !== undefined
            ? { customerName: dto.customerName.trim() || null }
            : {}),
          ...(dto.mobileNumber !== undefined
            ? { mobileNumber: dto.mobileNumber.trim() || null }
            : {}),
          ...(dto.beneficiaryMode !== undefined
            ? { beneficiaryMode: dto.beneficiaryMode }
            : {}),
          ...(dto.beneficiaryDetails !== undefined
            ? { beneficiaryDetails: dto.beneficiaryDetails.trim() || null }
            : {}),
          completionTransactionId: completion.id,
          completedAt: new Date(),
        },
      });
      await tx.transaction.update({
        where: { id: detail.transactionId },
        data: {
          status: TransactionStatus.COMPLETED,
          updatedById: userId,
          referenceNumber: dto.referenceNumber?.trim() || detail.transaction.referenceNumber,
          notes: dto.notes?.trim() || detail.transaction.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: detail.transactionId,
          action: 'COMPLETE_PENDING_CASH',
          oldValues: {
            status: TransactionStatus.PENDING,
            sourceAccountId: null,
            customerName: detail.customerName,
            mobileNumber: detail.mobileNumber,
            beneficiaryMode: detail.beneficiaryMode,
            beneficiaryDetails: detail.beneficiaryDetails,
          },
          newValues: {
            status: TransactionStatus.COMPLETED,
            sourceAccountId: sourceAccount.id,
            commissionMode,
            commissionAccountId: commissionAccount?.id ?? null,
            customerName:
              dto.customerName !== undefined
                ? dto.customerName.trim() || null
                : detail.customerName,
            mobileNumber:
              dto.mobileNumber !== undefined
                ? dto.mobileNumber.trim() || null
                : detail.mobileNumber,
            beneficiaryMode:
              dto.beneficiaryMode !== undefined
                ? dto.beneficiaryMode
                : detail.beneficiaryMode,
            beneficiaryDetails:
              dto.beneficiaryDetails !== undefined
                ? dto.beneficiaryDetails.trim() || null
                : detail.beneficiaryDetails,
            completionTransactionId: completion.id,
          },
        },
      });
      await this.auditCreated(tx, completion, userId);
      return {
        transactionId: detail.transactionId,
        completionTransactionId: completion.id,
        status: TransactionStatus.COMPLETED,
      };
    });
  }

  async createCashTransfer(
    dto: CreateCashTransferDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.CASH_TRANSFER,
      userId,
      dto,
      providedIdempotencyKey,
    );
    const commissionAmount = this.money(
      dto.commissionAmount !== undefined
        ? dto.commissionAmount
        : dto.requestedAmount * dto.commissionRate / 100,
    );
    const effectiveCommissionRate = dto.requestedAmount > 0
      ? this.money(commissionAmount / dto.requestedAmount * 100)
      : 0;
    const addOn = dto.commissionMethod === 'ADD_ON';
    const cashReceived = this.money(
      addOn
        ? dto.requestedAmount + commissionAmount
        : dto.requestedAmount,
    );
    const actualTransferAmount = this.money(
      addOn
        ? dto.requestedAmount
        : dto.requestedAmount - commissionAmount,
    );
    const transferChargeAmount = this.money(dto.transferChargeAmount ?? 0);
    const legacyReceiptAccountId = dto.receiptAccountId ?? dto.cashAccountId;
    const receiptAllocations = dto.receiptAllocations?.length
      ? dto.receiptAllocations.map((item) => ({
          accountId: item.accountId,
          amount: this.money(item.amount),
        }))
      : legacyReceiptAccountId
        ? [{ accountId: legacyReceiptAccountId, amount: cashReceived }]
        : [];

    if (!receiptAllocations.length) {
      throw new BadRequestException('Choose where the customer payment was received');
    }

    const receiptTotal = this.money(
      receiptAllocations.reduce((total, item) => total + item.amount, 0),
    );
    if (Math.abs(receiptTotal - cashReceived) > 0.001) {
      throw new BadRequestException(
        'Customer payment split must equal ' + cashReceived.toFixed(2),
      );
    }
    const destinationCount = [
      dto.beneficiaryAccountId,
      dto.customerBankAccountId,
      dto.customerUpiAccountId,
    ].filter(Boolean).length;

    if (destinationCount !== 1) {
      throw new BadRequestException(
        'Choose exactly one customer or beneficiary transfer destination',
      );
    }
    if (actualTransferAmount <= 0) {
      throw new BadRequestException('Commission exceeds transfer amount');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.validation.activeCustomer(tx, dto.customerId);
      await this.validation.lockAccount(tx, dto.sourceAccountId);
      const uniqueReceiptAccountIds = [
        ...new Set(receiptAllocations.map((item) => item.accountId)),
      ];
      for (const accountId of uniqueReceiptAccountIds) {
        if (accountId !== dto.sourceAccountId) {
          await this.validation.lockAccount(tx, accountId);
        }
      }

      const [receiptAccounts, sourceAccount, commissionLedger] =
        await Promise.all([
          Promise.all(
            uniqueReceiptAccountIds.map((accountId) =>
              this.validation.customerReceiptAccount(tx, accountId),
            ),
          ),
          this.validation.transferFundingAccount(tx, dto.sourceAccountId),
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-COMMISSION' },
          }),
        ]);
      const receiptAccountById = new Map(
        receiptAccounts.map((account) => [account.id, account]),
      );
      for (const account of receiptAccounts) {
        if (account.accountType === AccountType.CASH) {
          await this.validation.requireOpenCashDesk(
            tx,
            account.id,
            'Cash transfer receipt',
          );
        }
      }
      const primaryReceiptAccount = receiptAccountById.get(
        receiptAllocations[0].accountId,
      );
      if (!primaryReceiptAccount) {
        throw new BadRequestException('Receiving account is unavailable');
      }
      if (!commissionLedger) {
        throw new NotFoundException('Commission ledger not found');
      }
      const sourceOutflow = actualTransferAmount + transferChargeAmount;
      if (sourceAccount.accountType === AccountType.OWNER_CREDIT_CARD) {
        await this.validation.ensureCreditCapacity(tx, sourceAccount, sourceOutflow);
      } else {
        const receivedIntoSource = receiptAllocations
          .filter((item) => item.accountId === sourceAccount.id)
          .reduce((total, item) => total + item.amount, 0);
        if (receivedIntoSource > 0) {
          const current = await this.validation.balance(tx, sourceAccount);
          if (current + receivedIntoSource + 0.001 < sourceOutflow) {
            throw new BadRequestException(
              sourceAccount.accountName +
                ' has insufficient funds after customer payment. Available after receipt: ' +
                (current + receivedIntoSource).toFixed(2),
            );
          }
        } else {
          await this.validation.ensureSufficientFunds(
            tx,
            sourceAccount,
            sourceOutflow,
          );
        }
      }

      const [
        customerBankAccount,
        customerUpiAccount,
        beneficiaryAccount,
      ] = await Promise.all([
        dto.customerBankAccountId
          ? tx.customerBankAccount.findUnique({
              where: { id: dto.customerBankAccountId },
            })
          : Promise.resolve(null),
        dto.customerUpiAccountId
          ? tx.customerUpiAccount.findUnique({
              where: { id: dto.customerUpiAccountId },
            })
          : Promise.resolve(null),
        dto.beneficiaryAccountId
          ? tx.beneficiaryAccount.findUnique({
              where: { id: dto.beneficiaryAccountId },
              include: { beneficiary: true },
            })
          : Promise.resolve(null),
      ]);

      if (
        dto.customerBankAccountId &&
        (!customerBankAccount ||
          !customerBankAccount.isActive ||
          customerBankAccount.customerId !== dto.customerId)
      ) {
        throw new BadRequestException(
          'Selected active bank account does not belong to the customer',
        );
      }
      if (
        dto.customerUpiAccountId &&
        (!customerUpiAccount ||
          !customerUpiAccount.isActive ||
          customerUpiAccount.customerId !== dto.customerId)
      ) {
        throw new BadRequestException(
          'Selected active UPI account does not belong to the customer',
        );
      }
      if (
        dto.beneficiaryAccountId &&
        (!beneficiaryAccount ||
          !beneficiaryAccount.isActive ||
          !beneficiaryAccount.beneficiary.isActive ||
          beneficiaryAccount.beneficiary.customerId !== dto.customerId ||
          (dto.beneficiaryId &&
            beneficiaryAccount.beneficiaryId !== dto.beneficiaryId))
      ) {
        throw new BadRequestException(
          'Selected active beneficiary account does not belong to the customer',
        );
      }

      const chargeLedgerCode =
        sourceAccount.accountType === AccountType.PROVIDER_WALLET
          ? 'SYS-PROVIDER-CHARGE'
          : 'SYS-BANK-CHARGE';
      const chargeLedger =
        transferChargeAmount > 0
          ? await tx.ledgerAccount.findUnique({
              where: { ledgerCode: chargeLedgerCode },
            })
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
          commissionRate: new Prisma.Decimal(effectiveCommissionRate),
          commissionAmount: new Prisma.Decimal(commissionAmount),
          cashReceived: new Prisma.Decimal(cashReceived),
          actualTransferAmount: new Prisma.Decimal(actualTransferAmount),
          transferChargeAmount: new Prisma.Decimal(transferChargeAmount),
          transferChargeType: dto.transferChargeType,
          sourceAccountId: dto.sourceAccountId,
          cashAccountId: primaryReceiptAccount.id,
          transferReference: dto.referenceNumber,
        },
      });

      if (commissionAmount > 0) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'CASH_TRANSFER',
            calculationType: dto.commissionAmount !== undefined ? 'FIXED' : 'PERCENTAGE',
            rate: new Prisma.Decimal(
              dto.commissionAmount !== undefined ? effectiveCommissionRate : dto.commissionRate,
            ),
            amount: new Prisma.Decimal(commissionAmount),
          },
        });
      }

      if (transferChargeAmount > 0) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType:
              dto.transferChargeType ??
              (sourceAccount.accountType === AccountType.PROVIDER_WALLET
                ? 'WALLET'
                : 'BANK'),
            providerId: sourceAccount.providerId,
            calculationType: 'FIXED',
            amount: new Prisma.Decimal(transferChargeAmount),
          },
        });
      }

      const ledgerEntries: { ledgerAccountId:string; entryType:EntryType; amount:number; customerId:string; description:string }[] = receiptAllocations.map((item) => {
        const account = receiptAccountById.get(item.accountId);
        if (!account?.ledgerAccount) {
          throw new BadRequestException('Receiving account ledger is unavailable');
        }
        return {
          ledgerAccountId: account.ledgerAccount.id,
          entryType: EntryType.DEBIT,
          amount: item.amount,
          customerId: dto.customerId,
          description: 'Customer payment received · ' + account.accountName,
        };
      });
      ledgerEntries.push({
        ledgerAccountId: sourceAccount.ledgerAccount!.id,
        entryType: EntryType.CREDIT,
        amount: actualTransferAmount + transferChargeAmount,
        customerId: dto.customerId,
        description: 'Transfer source outflow',
      });

      if (commissionAmount > 0) {
        ledgerEntries.push({
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: commissionAmount,
          customerId: dto.customerId,
          description: 'Cash transfer commission',
        });
      }
      if (transferChargeAmount > 0 && chargeLedger) {
        ledgerEntries.push({
          ledgerAccountId: chargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: transferChargeAmount,
          customerId: dto.customerId,
          description: 'Transfer charge expense',
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Cash transfer',
        ledgerEntries,
      );

      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async createAeps(
    dto: CreateAepsDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.AEPS_WITHDRAWAL,
      userId,
      dto,
      providedIdempotencyKey,
    );
    const successful = dto.successful ?? true;
    const cashPayoutNow = dto.cashPayoutNow ?? true;
    const commissionMethod = dto.commissionMethod ?? CommissionMethod.DEDUCT;
    const transactionAt = dto.transactionAt
      ? new Date(dto.transactionAt)
      : new Date();
    const baseAmount = this.money(dto.withdrawalAmount);
    const calculatedCommission = this.money(
      baseAmount * dto.commissionRate / 100,
    );
    const withdrawalAmount = this.money(
      commissionMethod === CommissionMethod.ADD_ON
        ? baseAmount + calculatedCommission
        : baseAmount,
    );
    const calculatedCashGiven = this.money(
      commissionMethod === CommissionMethod.ADD_ON
        ? baseAmount
        : baseAmount - calculatedCommission,
    );
    const calculatedPlatformCharge = this.money(
      withdrawalAmount * dto.platformChargeRate / 100,
    );
    const calculatedSettlement = this.money(
      withdrawalAmount - calculatedPlatformCharge,
    );

    if (
      calculatedCashGiven <= 0 ||
      calculatedSettlement <= 0 ||
      calculatedPlatformCharge < 0 ||
      calculatedCommission < 0
    ) {
      throw new BadRequestException('Invalid AePS charges or commission');
    }

    return this.prisma.$transaction(async (tx) => {
      let customerId = dto.customerId;
      let createdCustomer: { id: string; fullName: string; mobile: string | null } | null = null;

      if (dto.newCustomer) {
        if (customerId) {
          throw new BadRequestException(
            'Use either an existing customer or a new customer, not both',
          );
        }
        const mobile = dto.newCustomer.mobile?.trim() || null;
        if (mobile) {
          const duplicateCustomer = await tx.customer.findFirst({
            where: {
              isActive: true,
              OR: [{ mobile }, { mobile: { endsWith: mobile } }],
            },
            select: { id: true },
          });
          if (duplicateCustomer) {
            throw new BadRequestException(
              'A customer with this mobile already exists. Use the existing customer.',
            );
          }
        }
        const customer = await tx.customer.create({
          data: {
            customerCode: 'CUS-' + Date.now().toString(36).toUpperCase(),
            customerType: mobile ? CustomerType.REGULAR : CustomerType.WALK_IN,
            fullName: dto.newCustomer.fullName.trim(),
            mobile,
            createdById: userId,
          },
        });
        createdCustomer = {
          id: customer.id,
          fullName: customer.fullName,
          mobile: customer.mobile,
        };
        customerId = customer.id;
        await tx.auditLog.create({
          data: {
            userId,
            entityType: 'CUSTOMER',
            entityId: customer.id,
            action: 'CREATE',
            newValues: {
              customerCode: customer.customerCode,
              customerType: customer.customerType,
              fullName: customer.fullName,
              mobile: customer.mobile,
              isActive: customer.isActive,
            },
          },
        });
      } else if (customerId) {
        await this.validation.activeCustomer(tx, customerId);
      }

      if (!customerId) {
        throw new BadRequestException('Customer is required');
      }

      const { provider } = await this.validation.providerGateway(
        tx,
        dto.providerId,
        dto.gatewayId,
        false,
      );
      if (!provider?.supportsAeps) {
        throw new BadRequestException(
          'Selected provider does not support Aadhaar withdrawals',
        );
      }

      if (!successful) {
        const transaction = await tx.transaction.create({
          data: {
            transactionNumber: 'AEPS-' + Date.now().toString(36).toUpperCase(),
            transactionType: TransactionType.AEPS_WITHDRAWAL,
            transactionAt,
            customerId,
            grossAmount: new Prisma.Decimal(baseAmount),
            netAmount: new Prisma.Decimal(0),
            status: TransactionStatus.FAILED,
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
            withdrawalAmount: new Prisma.Decimal(baseAmount),
            platformId: dto.platformId,
            providerId: dto.providerId,
            gatewayId: dto.gatewayId,
            platformChargeRate: new Prisma.Decimal(dto.platformChargeRate),
            platformChargeAmount: new Prisma.Decimal(0),
            commissionRate: new Prisma.Decimal(dto.commissionRate),
            commissionMethod,
            commissionAmount: new Prisma.Decimal(0),
            cashGiven: new Prisma.Decimal(0),
            cashAccountId: null,
            settlementAccountId: dto.settlementAccountId,
            settlementAmount: new Prisma.Decimal(0),
            providerReference: dto.providerReference,
          },
        });

        await this.auditCreated(tx, transaction, userId);
        return {
          transaction,
          providerSettlement: null,
          settlementReceipt: null,
          payable: null,
          createdCustomer,
        };
      }

      const settlementAccount = await this.validation.providerSettlementDestination(
        tx,
        dto.settlementAccountId,
        dto.providerId,
      );

      let cashAccount = null;
      if (cashPayoutNow) {
        if (!dto.cashAccountId) {
          throw new BadRequestException('Cash account is required when paying customer now');
        }
        await this.validation.lockAccount(tx, dto.cashAccountId);
        cashAccount = await this.validation.cashAccount(
          tx,
          dto.cashAccountId,
          'AePS cash account',
        );
        await this.validation.requireOpenCashDesk(
          tx,
          cashAccount.id,
          'AePS cash payout',
        );
        await this.validation.ensureSufficientFunds(
          tx,
          cashAccount,
          calculatedCashGiven,
        );
      }

      const [chargeLedger, commissionLedger, clearingLedger, payableLedger] =
        await Promise.all([
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-PROVIDER-CHARGE' },
          }),
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-COMMISSION' },
          }),
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-PROVIDER-CLEARING' },
          }),
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-CUST-PAYABLE' },
          }),
        ]);

      if (!chargeLedger || !commissionLedger || !clearingLedger) {
        throw new NotFoundException('Required AePS system ledger not found');
      }
      if (!cashPayoutNow && !payableLedger) {
        throw new NotFoundException('Customer payable ledger not found');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'AEPS-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.AEPS_WITHDRAWAL,
          transactionAt,
          customerId,
          grossAmount: new Prisma.Decimal(withdrawalAmount),
          netAmount: new Prisma.Decimal(calculatedCashGiven),
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
          withdrawalAmount: new Prisma.Decimal(withdrawalAmount),
          platformId: dto.platformId,
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          platformChargeRate: new Prisma.Decimal(dto.platformChargeRate),
          platformChargeAmount: new Prisma.Decimal(calculatedPlatformCharge),
          commissionRate: new Prisma.Decimal(dto.commissionRate),
          commissionMethod,
          commissionAmount: new Prisma.Decimal(calculatedCommission),
          cashGiven: new Prisma.Decimal(calculatedCashGiven),
          cashAccountId: cashAccount?.id ?? null,
          settlementAccountId: dto.settlementAccountId,
          settlementAmount: new Prisma.Decimal(calculatedSettlement),
          providerReference: dto.providerReference,
        },
      });

      if (calculatedPlatformCharge > 0) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType: 'PROVIDER',
            providerId: dto.providerId,
            gatewayId: dto.gatewayId,
            calculationType: 'PERCENTAGE',
            rate: new Prisma.Decimal(dto.platformChargeRate),
            amount: new Prisma.Decimal(calculatedPlatformCharge),
          },
        });
      }
      if (calculatedCommission > 0) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'AEPS',
            calculationType: 'PERCENTAGE',
            rate: new Prisma.Decimal(dto.commissionRate),
            amount: new Prisma.Decimal(calculatedCommission),
          },
        });
      }

      const providerSettlement = await this.settlements.createForSource(tx, {
        sourceTransactionId: transaction.id,
        providerId: dto.providerId,
        gatewayId: dto.gatewayId,
        expectedAmount: calculatedSettlement,
        destinationAccountId: settlementAccount.id,
        dueAt: dto.settlementDueAt
          ? new Date(dto.settlementDueAt)
          : null,
        createdById: userId,
      });

      let payable = null;
      if (!cashPayoutNow) {
        const fallbackDueAt = new Date();
        fallbackDueAt.setDate(fallbackDueAt.getDate() + 1);
        const dueAt = dto.cashPayoutDueAt
          ? new Date(dto.cashPayoutDueAt)
          : fallbackDueAt;
        payable = await tx.customerPayable.create({
          data: {
            customerId,
            sourceTransactionId: transaction.id,
            paymentTermId: null,
            originalAmount: new Prisma.Decimal(calculatedCashGiven),
            paidAmount: new Prisma.Decimal(0),
            remainingAmount: new Prisma.Decimal(calculatedCashGiven),
            dueAt,
            status: PayableStatus.PENDING,
          },
        });
      }

      const entries: JournalEntry[] = [
        {
          ledgerAccountId: clearingLedger.id,
          entryType: EntryType.DEBIT,
          amount: calculatedSettlement,
          customerId,
          providerSettlementId: providerSettlement.id,
          description: 'AePS provider settlement pending',
        },
      ];

      if (cashPayoutNow) {
        entries.push({
          ledgerAccountId: cashAccount!.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: calculatedCashGiven,
          customerId,
          description: 'Cash paid to customer',
        });
      } else {
        entries.push({
          ledgerAccountId: payableLedger!.id,
          entryType: EntryType.CREDIT,
          amount: calculatedCashGiven,
          customerId,
          payableId: payable!.id,
          description: 'Cash due to customer',
        });
      }

      if (calculatedPlatformCharge > 0) {
        entries.push({
          ledgerAccountId: chargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: calculatedPlatformCharge,
          customerId,
          providerSettlementId: providerSettlement.id,
          description: 'AePS provider charge expense',
        });
      }
      if (calculatedCommission > 0) {
        entries.push({
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: calculatedCommission,
          customerId,
          providerSettlementId: providerSettlement.id,
          description: 'AePS commission income',
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'AePS withdrawal',
        entries,
      );

      let settlementReceipt = null;
      let commissionSettlementReceipt = null;
      if (dto.settledNow) {
        const separateCommission =
          calculatedCommission > 0 &&
          !!dto.commissionReceiptAccountId &&
          dto.commissionReceiptAccountId !== settlementAccount.id;
        if (separateCommission) {
          await this.validation.providerSettlementDestination(
            tx,
            dto.commissionReceiptAccountId!,
            dto.providerId,
          );
          const mainSettlementAmount = this.money(
            calculatedSettlement - calculatedCommission,
          );
          if (mainSettlementAmount < 0) {
            throw new BadRequestException(
              'Commission cannot exceed the provider settlement amount',
            );
          }
          if (mainSettlementAmount > 0) {
            settlementReceipt = await this.settlements.autoReceive(
              tx,
              providerSettlement.id,
              settlementAccount.id,
              mainSettlementAmount,
              userId,
              dto.providerReference,
              'main',
            );
          }
          commissionSettlementReceipt = await this.settlements.autoReceive(
            tx,
            providerSettlement.id,
            dto.commissionReceiptAccountId!,
            calculatedCommission,
            userId,
            dto.providerReference,
            'commission',
          );
        } else {
          settlementReceipt = await this.settlements.autoReceive(
            tx,
            providerSettlement.id,
            settlementAccount.id,
            calculatedSettlement,
            userId,
            dto.providerReference,
          );
        }
      }

      await this.auditCreated(tx, transaction, userId);
      return {
        transaction,
        providerSettlement,
        settlementReceipt,
        commissionSettlementReceipt,
        payable,
        createdCustomer,
      };
    });
  }

  async createMicroAtm(
    dto: CreateMicroAtmDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.MICRO_ATM,
      userId,
      dto,
      providedIdempotencyKey,
    );
    const withdrawalAmount = this.money(dto.withdrawalAmount);
    const transactionAt = dto.transactionAt
      ? new Date(dto.transactionAt)
      : new Date();
    const providerCommissionAmount = this.money(
      withdrawalAmount * dto.providerCommissionRate / 100,
    );
    const settlementAmount = this.money(
      withdrawalAmount + providerCommissionAmount,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.validation.activeCustomer(tx, dto.customerId);
      await this.validation.providerGateway(
        tx,
        dto.providerId,
        dto.gatewayId,
        false,
      );
      await this.validation.lockAccount(tx, dto.cashAccountId);

      const [cashAccount, settlementAccount, commissionLedger, clearingLedger] =
        await Promise.all([
          this.validation.cashAccount(
            tx,
            dto.cashAccountId,
            'Micro ATM cash account',
          ),
          this.validation.providerSettlementDestination(
            tx,
            dto.settlementAccountId,
            dto.providerId,
          ),
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-COMMISSION' },
          }),
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-PROVIDER-CLEARING' },
          }),
        ]);
      if (!commissionLedger || !clearingLedger) {
        throw new NotFoundException('Required Micro ATM system ledger not found');
      }
      await this.validation.requireOpenCashDesk(
        tx,
        cashAccount.id,
        'Micro ATM cash payout',
      );

      await this.validation.ensureSufficientFunds(
        tx,
        cashAccount,
        withdrawalAmount,
      );

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'MAT-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.MICRO_ATM,
          transactionAt,
          customerId: dto.customerId,
          grossAmount: new Prisma.Decimal(withdrawalAmount),
          netAmount: new Prisma.Decimal(withdrawalAmount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.providerReference,
          notes: dto.notes,
          createdById: userId,
        },
      });

      await tx.microAtmDetail.create({
        data: {
          transactionId: transaction.id,
          cardLastFour: dto.cardLastFour,
          customerBankName: dto.customerBankName,
          withdrawalAmount: new Prisma.Decimal(withdrawalAmount),
          providerId: dto.providerId,
          gatewayId: dto.gatewayId,
          providerCommissionRate: new Prisma.Decimal(
            dto.providerCommissionRate,
          ),
          providerCommissionAmount: new Prisma.Decimal(
            providerCommissionAmount,
          ),
          cashGiven: new Prisma.Decimal(withdrawalAmount),
          cashAccountId: dto.cashAccountId,
          settlementAccountId: dto.settlementAccountId,
          settlementAmount: new Prisma.Decimal(settlementAmount),
          providerReference: dto.providerReference,
        },
      });

      if (providerCommissionAmount > 0) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'MICRO_ATM_PROVIDER',
            calculationType: 'PERCENTAGE',
            rate: new Prisma.Decimal(dto.providerCommissionRate),
            amount: new Prisma.Decimal(providerCommissionAmount),
          },
        });
      }

      const providerSettlement = await this.settlements.createForSource(tx, {
        sourceTransactionId: transaction.id,
        providerId: dto.providerId,
        gatewayId: dto.gatewayId,
        expectedAmount: settlementAmount,
        destinationAccountId: settlementAccount.id,
        dueAt: dto.settlementDueAt
          ? new Date(dto.settlementDueAt)
          : null,
        createdById: userId,
      });

      const entries: JournalEntry[] = [
        {
          ledgerAccountId: clearingLedger.id,
          entryType: EntryType.DEBIT,
          amount: settlementAmount,
          customerId: dto.customerId,
          providerSettlementId: providerSettlement.id,
          description: 'Micro ATM provider settlement pending',
        },
        {
          ledgerAccountId: cashAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: withdrawalAmount,
          customerId: dto.customerId,
          description: 'Micro ATM cash paid to customer',
        },
      ];
      if (providerCommissionAmount > 0) {
        entries.push({
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: providerCommissionAmount,
          customerId: dto.customerId,
          providerSettlementId: providerSettlement.id,
          description: 'Micro ATM provider commission income',
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Micro ATM withdrawal',
        entries,
      );

      let settlementReceipt = null;
      if (dto.settledNow) {
        settlementReceipt = await this.settlements.autoReceive(
          tx,
          providerSettlement.id,
          settlementAccount.id,
          settlementAmount,
          userId,
          dto.providerReference,
        );
      }

      await this.auditCreated(tx, transaction, userId);
      return { transaction, providerSettlement, settlementReceipt };
    });
  }

  async createInternalTransfer(
    dto: CreateInternalTransferDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.INTERNAL_TRANSFER,
      userId,
      dto,
      providedIdempotencyKey,
    );
    const chargeAmount = dto.chargeAmount ?? 0;
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new BadRequestException(
        'Source and destination accounts must be different',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.validation.lockAccount(tx, dto.sourceAccountId);
      const [source, destination] = await Promise.all([
        this.validation.liquidAsset(
          tx,
          dto.sourceAccountId,
          'Transfer source account',
        ),
        this.validation.liquidAsset(
          tx,
          dto.destinationAccountId,
          'Transfer destination account',
        ),
      ]);
      if (source.accountType === AccountType.CASH) {
        await this.validation.requireOpenCashDesk(
          tx,
          source.id,
          'Cash transfer source',
        );
      }
      if (destination.accountType === AccountType.CASH) {
        await this.validation.requireOpenCashDesk(
          tx,
          destination.id,
          'Cash transfer destination',
        );
      }
      await this.validation.ensureSufficientFunds(
        tx,
        source,
        dto.transferAmount + chargeAmount,
      );

      const chargeLedgerCode =
        source.accountType === AccountType.PROVIDER_WALLET
          ? 'SYS-PROVIDER-CHARGE'
          : 'SYS-BANK-CHARGE';
      const chargeLedger =
        chargeAmount > 0
          ? await tx.ledgerAccount.findUnique({
              where: { ledgerCode: chargeLedgerCode },
            })
          : null;
      if (chargeAmount > 0 && !chargeLedger) {
        throw new NotFoundException('Transfer charge ledger not found');
      }

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
              source.accountType === AccountType.PROVIDER_WALLET
                ? 'WALLET'
                : source.accountType === AccountType.BANK
                  ? 'BANK'
                  : 'TRANSFER',
            providerId: source.providerId,
            calculationType: 'FIXED',
            amount: new Prisma.Decimal(chargeAmount),
          },
        });
      }

      const entries: JournalEntry[] = [
        {
          ledgerAccountId: destination.ledgerAccount!.id,
          entryType: EntryType.DEBIT,
          amount: dto.transferAmount,
          description: 'Internal transfer received',
        },
        {
          ledgerAccountId: source.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: dto.transferAmount + chargeAmount,
          description: 'Internal transfer sent',
        },
      ];

      if (chargeAmount > 0 && chargeLedger) {
        entries.splice(1, 0, {
          ledgerAccountId: chargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: chargeAmount,
          description: 'Transfer charge expense',
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

  async createExpense(
    dto: CreateExpenseDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const transactionType = TransactionType.BUSINESS_EXPENSE;
    const expenseType = 'BUSINESS' as const;
    const description = dto.description?.trim() || 'Expense';
    const idempotencyKey = await this.idempotency.key(
      transactionType,
      userId,
      dto,
      providedIdempotencyKey,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.validation.expenseCategory(
        tx,
        dto.expenseCategoryId,
        expenseType,
      );

      if (!dto.paymentAccountId) {
        const transaction = await tx.transaction.create({
          data: {
            transactionNumber: 'EXP-' + Date.now().toString(36).toUpperCase(),
            transactionType,
            transactionAt: new Date(),
            grossAmount: new Prisma.Decimal(dto.amount),
            netAmount: new Prisma.Decimal(dto.amount),
            status: TransactionStatus.PENDING,
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
            expenseType,
            paymentAccountId: null,
            amount: new Prisma.Decimal(dto.amount),
            description,
          },
        });
        await this.auditCreated(tx, transaction, userId);
        return transaction;
      }

      const paymentAccountId = dto.paymentAccountId;
      await this.validation.lockAccount(tx, paymentAccountId);
      const paymentAccount = await this.validation.account(
        tx,
        paymentAccountId,
        {
          label: 'Expense payment account',
          types: [
            AccountType.CASH,
            AccountType.BANK,
            AccountType.UPI,
            AccountType.PROVIDER_WALLET,
            AccountType.OWNER_CREDIT_CARD,
          ],
        },
      );
      if (paymentAccount.accountType === AccountType.CASH) {
        await this.validation.requireOpenCashDesk(
          tx,
          paymentAccount.id,
          'Cash expense',
        );
      }
      if (paymentAccount.accountType === AccountType.OWNER_CREDIT_CARD) {
        if (paymentAccount.accountNature !== AccountNature.LIABILITY) {
          throw new BadRequestException(
            'Owner credit-card account must be a liability',
          );
        }
        await this.validation.ensureCreditCapacity(tx, paymentAccount, dto.amount);
      } else {
        if (paymentAccount.accountNature !== AccountNature.ASSET) {
          throw new BadRequestException('Expense payment account must be an asset');
        }
        await this.validation.ensureSufficientFunds(tx, paymentAccount, dto.amount);
      }

      const expenseLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode: 'SYS-BUSINESS-EXPENSE' },
      });
      if (!expenseLedger) throw new Error('Expense ledger missing');

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'EXP-' + Date.now().toString(36).toUpperCase(),
          transactionType,
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
          expenseType,
          paymentAccountId,
          amount: new Prisma.Decimal(dto.amount),
          description,
        },
      });
      await this.ledger.post(tx, transaction.id, userId, description, [
        {
          ledgerAccountId: expenseLedger.id,
          entryType: EntryType.DEBIT,
          amount: dto.amount,
          description,
        },
        {
          ledgerAccountId: paymentAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: dto.amount,
          description:
            paymentAccount.accountType === AccountType.OWNER_CREDIT_CARD
              ? 'Credit-card liability increased'
              : 'Expense payment',
        },
      ]);
      await this.auditCreated(tx, transaction, userId);
      return transaction;
    });
  }

  async completeExpense(
    transactionId: string,
    dto: CompleteExpenseDto,
    userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: { expense: { include: { expenseCategory: true } } },
      });
      if (!transaction?.expense) {
        throw new NotFoundException('Expense transaction not found');
      }
      if (transaction.status !== TransactionStatus.PENDING) {
        throw new BadRequestException('Only pending expenses can be completed');
      }

      await this.validation.lockAccount(tx, dto.paymentAccountId);
      const paymentAccount = await this.validation.account(
        tx,
        dto.paymentAccountId,
        {
          label: 'Expense payment account',
          types: [
            AccountType.CASH,
            AccountType.BANK,
            AccountType.UPI,
            AccountType.PROVIDER_WALLET,
            AccountType.OWNER_CREDIT_CARD,
          ],
        },
      );
      if (paymentAccount.accountType === AccountType.CASH) {
        await this.validation.requireOpenCashDesk(
          tx,
          paymentAccount.id,
          'Cash expense',
        );
      }

      const amount = Number(transaction.expense.amount);
      if (paymentAccount.accountType === AccountType.OWNER_CREDIT_CARD) {
        if (paymentAccount.accountNature !== AccountNature.LIABILITY) {
          throw new BadRequestException(
            'Owner credit-card account must be a liability',
          );
        }
        await this.validation.ensureCreditCapacity(tx, paymentAccount, amount);
      } else {
        if (paymentAccount.accountNature !== AccountNature.ASSET) {
          throw new BadRequestException('Expense payment account must be an asset');
        }
        await this.validation.ensureSufficientFunds(tx, paymentAccount, amount);
      }

      const expenseLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode: 'SYS-BUSINESS-EXPENSE' },
      });
      if (!expenseLedger) throw new Error('Expense ledger missing');

      const description =
        transaction.expense.description || transaction.expense.expenseCategory.name;
      await tx.expenseDetail.update({
        where: { transactionId },
        data: { paymentAccountId: paymentAccount.id },
      });
      await this.ledger.post(tx, transaction.id, userId, description, [
        {
          ledgerAccountId: expenseLedger.id,
          entryType: EntryType.DEBIT,
          amount,
          description,
        },
        {
          ledgerAccountId: paymentAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount,
          description:
            paymentAccount.accountType === AccountType.OWNER_CREDIT_CARD
              ? 'Credit-card liability increased'
              : 'Expense payment',
        },
      ]);
      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.COMPLETED,
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: transactionId,
          action: 'COMPLETE_EXPENSE',
          oldValues: { status: TransactionStatus.PENDING, paymentAccountId: null },
          newValues: {
            status: TransactionStatus.COMPLETED,
            paymentAccountId: paymentAccount.id,
          },
        },
      });
      return updated;
    });
  }

  async createAtmWithdrawal(
    dto: CreateAtmWithdrawalDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.ATM_WITHDRAWAL,
      userId,
      dto,
      providedIdempotencyKey,
    );
    const atmCharge = dto.atmCharge ?? 0;

    return this.prisma.$transaction(async (tx) => {
      await this.validation.lockAccount(tx, dto.bankAccountId);
      const [bankAccount, cashAccount, atmChargeLedger] =
        await Promise.all([
          this.validation.bankAccount(
            tx,
            dto.bankAccountId,
            'ATM bank account',
          ),
          this.validation.cashAccount(
            tx,
            dto.cashAccountId,
            'ATM cash account',
          ),
          tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-ATM-CHARGE' },
          }),
        ]);

      if (!atmChargeLedger) {
        throw new NotFoundException('ATM charge ledger not found');
      }
      await this.validation.requireOpenCashDesk(
        tx,
        cashAccount.id,
        'ATM cash receipt',
      );
      await this.validation.ensureSufficientFunds(
        tx,
        bankAccount,
        dto.cashReceived + atmCharge,
      );

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
          withdrawalAmount: new Prisma.Decimal(
            dto.cashReceived + atmCharge,
          ),
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

      const entries: JournalEntry[] = [
        {
          ledgerAccountId: cashAccount.ledgerAccount!.id,
          entryType: EntryType.DEBIT,
          amount: dto.cashReceived,
          description: 'Cash received from ATM',
        },
        {
          ledgerAccountId: bankAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: dto.cashReceived + atmCharge,
          description: 'ATM bank outflow',
        },
      ];
      if (atmCharge > 0) {
        entries.splice(1, 0, {
          ledgerAccountId: atmChargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: atmCharge,
          description: 'ATM charge expense',
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

  async createCreditCardPayment(
    dto: CreateCreditCardPaymentDto,
    userId: string,
    providedIdempotencyKey?: string,
  ) {
    const idempotencyKey = await this.idempotency.key(
      TransactionType.OWNER_CC_PAYMENT,
      userId,
      dto,
      providedIdempotencyKey,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.validation.lockAccount(tx, dto.creditCardAccountId);
      await this.validation.lockAccount(tx, dto.sourceAccountId);

      const [cardAccount, sourceAccount] = await Promise.all([
        this.validation.ownerCreditCard(tx, dto.creditCardAccountId),
        this.validation.liquidAsset(
          tx,
          dto.sourceAccountId,
          'Credit-card payment source',
        ),
      ]);

      if (sourceAccount.accountType === AccountType.CASH) {
        await this.validation.requireOpenCashDesk(
          tx,
          sourceAccount.id,
          'Credit-card cash payment',
        );
      }
      const [outstanding] = await Promise.all([
        this.validation.balance(tx, cardAccount),
        this.validation.ensureSufficientFunds(
          tx,
          sourceAccount,
          dto.paymentAmount,
        ),
      ]);
      if (dto.paymentAmount > outstanding + 0.001) {
        throw new BadRequestException(
          'Payment exceeds current credit-card outstanding',
        );
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
            ledgerAccountId: cardAccount.ledgerAccount!.id,
            entryType: EntryType.DEBIT,
            amount: dto.paymentAmount,
            description: 'Reduce owner credit-card liability',
          },
          {
            ledgerAccountId: sourceAccount.ledgerAccount!.id,
            entryType: EntryType.CREDIT,
            amount: dto.paymentAmount,
            description: 'Credit-card payment source',
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
        cardSwipe: {
          include: {
            customerCard: true,
            paymentTerm: true,
            settlementAccount: true,
          },
        },
        cashTransfer: {
          include: {
            beneficiary: true,
            beneficiaryAccount: true,
            customerBankAccount: true,
            customerUpiAccount: true,
            sourceAccount: true,
            cashAccount: true,
          },
        },
        quickCashTransfer: {
          include: {
            cashAccount: true,
            sourceAccount: true,
            commissionAccount: true,
            servicePaymentAccount: true,
          },
        },
        aeps: { include: { cashAccount: true, settlementAccount: true } },
        microAtm: { include: { cashAccount: true, settlementAccount: true } },
        internalTransfer: { include: { sourceAccount: true, destinationAccount: true } },
        expense: { include: { expenseCategory: true, paymentAccount: true } },
        atmWithdrawal: { include: { bankAccount: true, cashAccount: true } },
        creditCardPayment: { include: { creditCardAccount: true, sourceAccount: true } },
        payable: { include: { payments: { include: { sourceAccount: true, transaction: { include: { charges: true } } } } } },
        payablePayment: {
          include: {
            payable: {
              include: {
                sourceTransaction: {
                  select: { id: true, transactionNumber: true },
                },
              },
            },
            sourceAccount: true,
          },
        },
        receivableSource: { include: { collections: { include: { destinationAccount: true } }, sourceAccount: true } },
        receivableCollection: { include: { receivable: true, destinationAccount: true } },
        providerSettlementSource: {
          include: {
            provider: true,
            gateway: true,
            destinationAccount: true,
            receipts: { include: { destinationAccount: true } },
          },
        },
        providerSettlementReceipt: {
          include: {
            destinationAccount: true,
            settlement: {
              include: {
                provider: true,
                gateway: true,
                destinationAccount: true,
                sourceTransaction: {
                  select: { id: true, transactionNumber: true },
                },
              },
            },
          },
        },
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

  async updateDateTime(id: string, dto: UpdateTransactionDateTimeDto, userId: string) {
    const corrected = new Date(dto.transactionAt);
    if (Number.isNaN(corrected.getTime())) {
      throw new BadRequestException('Invalid transaction date or time');
    }
    const original = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        journal: { select: { id: true, postingDate: true } },
        cardSwipe: { select: { id: true, dueAt: true } },
        payable: { select: { id: true, dueAt: true, status: true, paidAmount: true, remainingAmount: true } },
        payablePayment: { select: { id: true, paymentDate: true } },
        receivableSource: { select: { id: true, dueAt: true, status: true, receivedAmount: true, remainingAmount: true } },
        receivableCollection: { select: { id: true, collectionDate: true } },
        providerSettlementSource: { select: { id: true, dueAt: true } },
        providerSettlementReceipt: { select: { id: true, receivedAt: true } },
        cardDueClearing: { select: { id: true, nextFollowUpAt: true } },
        cardDueRecovery: { select: { id: true, recoveredAt: true } },
        cardDueCommissionCollection: { select: { id: true, collectedAt: true } },
      },
    });
    if (!original) throw new NotFoundException('Transaction not found');

    const deltaMs = corrected.getTime() - original.transactionAt.getTime();
    const shift = (value: Date | null | undefined) =>
      value ? new Date(value.getTime() + deltaMs) : null;

    const oldValues: Record<string, string | null> = {
      transactionAt: original.transactionAt.toISOString(),
      journalPostingDate: original.journal?.postingDate.toISOString() ?? null,
      cardSwipeDueAt: original.cardSwipe?.dueAt.toISOString() ?? null,
      payableDueAt: original.payable?.dueAt.toISOString() ?? null,
      paymentDate: original.payablePayment?.paymentDate.toISOString() ?? null,
      receivableDueAt: original.receivableSource?.dueAt?.toISOString() ?? null,
      collectionDate: original.receivableCollection?.collectionDate.toISOString() ?? null,
      providerSettlementDueAt: original.providerSettlementSource?.dueAt?.toISOString() ?? null,
      providerSettlementReceivedAt: original.providerSettlementReceipt?.receivedAt.toISOString() ?? null,
      cardDueNextFollowUpAt: original.cardDueClearing?.nextFollowUpAt?.toISOString() ?? null,
      cardDueRecoveredAt: original.cardDueRecovery?.recoveredAt.toISOString() ?? null,
      cardDueCommissionCollectedAt: original.cardDueCommissionCollection?.collectedAt.toISOString() ?? null,
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          transactionAt: corrected,
          updatedById: userId,
        },
      });

      if (original.journal) {
        await tx.ledgerJournal.update({
          where: { id: original.journal.id },
          data: { postingDate: corrected },
        });
      }

      if (original.cardSwipe) {
        await tx.cardSwipeDetail.update({
          where: { id: original.cardSwipe.id },
          data: { dueAt: shift(original.cardSwipe.dueAt)! },
        });
      }

      if (original.payable) {
        const dueAt = shift(original.payable.dueAt)!;
        let status = original.payable.status;
        if (status !== PayableStatus.PAID && status !== PayableStatus.CANCELLED && status !== PayableStatus.REVERSED) {
          const { start: todayStart } = (() => {
            const offset = 330 * 60 * 1000;
            const local = new Date(Date.now() + offset);
            const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
            return { start: new Date(Date.UTC(y, m, d) - offset) };
          })();
          status = dueAt < todayStart
            ? PayableStatus.OVERDUE
            : Number(original.payable.paidAmount) > 0
              ? PayableStatus.PARTIALLY_PAID
              : PayableStatus.PENDING;
        }
        await tx.customerPayable.update({
          where: { id: original.payable.id },
          data: { dueAt, status },
        });
      }

      if (original.payablePayment) {
        await tx.payablePayment.update({
          where: { id: original.payablePayment.id },
          data: { paymentDate: corrected },
        });
      }

      if (original.receivableSource) {
        const dueAt = shift(original.receivableSource.dueAt);
        let status = original.receivableSource.status;
        if (status !== ReceivableStatus.RECEIVED && status !== ReceivableStatus.CANCELLED && status !== ReceivableStatus.REVERSED) {
          const offset = 330 * 60 * 1000;
          const local = new Date(Date.now() + offset);
          const todayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
          status = dueAt && dueAt < todayStart
            ? ReceivableStatus.OVERDUE
            : Number(original.receivableSource.receivedAmount) > 0
              ? ReceivableStatus.PARTIALLY_RECEIVED
              : ReceivableStatus.PENDING;
        }
        await tx.customerReceivable.update({
          where: { id: original.receivableSource.id },
          data: { dueAt, status },
        });
      }

      if (original.receivableCollection) {
        await tx.receivableCollection.update({
          where: { id: original.receivableCollection.id },
          data: { collectionDate: corrected },
        });
      }

      if (original.providerSettlementSource) {
        await tx.providerSettlement.update({
          where: { id: original.providerSettlementSource.id },
          data: { dueAt: shift(original.providerSettlementSource.dueAt) },
        });
      }

      if (original.providerSettlementReceipt) {
        await tx.providerSettlementReceipt.update({
          where: { id: original.providerSettlementReceipt.id },
          data: { receivedAt: corrected },
        });
      }

      if (original.cardDueClearing?.nextFollowUpAt) {
        await tx.cardDueClearingDetail.update({
          where: { id: original.cardDueClearing.id },
          data: { nextFollowUpAt: shift(original.cardDueClearing.nextFollowUpAt) },
        });
      }

      if (original.cardDueRecovery) {
        await tx.cardDueRecovery.update({
          where: { id: original.cardDueRecovery.id },
          data: { recoveredAt: corrected },
        });
      }

      if (original.cardDueCommissionCollection) {
        await tx.cardDueCommissionCollection.update({
          where: { id: original.cardDueCommissionCollection.id },
          data: { collectedAt: corrected },
        });
      }

      const newValues: Record<string, string | null> = {
        transactionAt: corrected.toISOString(),
        journalPostingDate: original.journal ? corrected.toISOString() : null,
        cardSwipeDueAt: original.cardSwipe ? shift(original.cardSwipe.dueAt)?.toISOString() ?? null : null,
        payableDueAt: original.payable ? shift(original.payable.dueAt)?.toISOString() ?? null : null,
        paymentDate: original.payablePayment ? corrected.toISOString() : null,
        receivableDueAt: original.receivableSource ? shift(original.receivableSource.dueAt)?.toISOString() ?? null : null,
        collectionDate: original.receivableCollection ? corrected.toISOString() : null,
        providerSettlementDueAt: original.providerSettlementSource ? shift(original.providerSettlementSource.dueAt)?.toISOString() ?? null : null,
        providerSettlementReceivedAt: original.providerSettlementReceipt ? corrected.toISOString() : null,
        cardDueNextFollowUpAt: original.cardDueClearing ? shift(original.cardDueClearing.nextFollowUpAt)?.toISOString() ?? null : null,
        cardDueRecoveredAt: original.cardDueRecovery ? corrected.toISOString() : null,
        cardDueCommissionCollectedAt: original.cardDueCommissionCollection ? corrected.toISOString() : null,
      };

      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: id,
          action: 'UPDATE_LINKED_DATES',
          oldValues: { ...oldValues, transactionNumber: original.transactionNumber },
          newValues: { ...newValues, transactionNumber: original.transactionNumber },
          reason: dto.reason.trim(),
        },
      });
      return updated;
    });
  }

  async reverse(id: string, dto: ReverseTransactionDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Transaction" WHERE "id" = $1 FOR UPDATE',
        id,
      );
      const original = await tx.transaction.findUnique({
        where: { id },
        include: {
          journal: { include: { entries: true } },
          payable: { include: { payments: true } },
          payablePayment: true,
          receivableSource: { include: { collections: true } },
          receivableCollection: true,
          providerSettlementSource: { include: { receipts: true } },
          providerSettlementReceipt: { include: { settlement: true } },
        },
      });

      if (!original) throw new NotFoundException('Transaction not found');
      if (
        original.transactionType === TransactionType.CARD_DUE_CLEARING ||
        original.transactionType === TransactionType.CARD_DUE_RECOVERY ||
        original.transactionType === TransactionType.CARD_DUE_COMMISSION_COLLECTION
      ) {
        throw new BadRequestException(
          'Card due clearing entries are managed from the Card Due Clearing screen',
        );
      }
      if (original.status === TransactionStatus.REVERSED || original.transactionType === TransactionType.REVERSAL) {
        throw new BadRequestException('Transaction is already reversed or is a reversal');
      }

      if (original.payable && Number(original.payable.paidAmount) > 0) {
        throw new BadRequestException('Reverse customer payouts first before reversing this source transaction');
      }
      if (original.receivableSource && Number(original.receivableSource.receivedAmount) > 0) {
        throw new BadRequestException('Reverse receivable collections first before reversing this source transaction');
      }
      if (
        original.providerSettlementSource &&
        Number(original.providerSettlementSource.receivedAmount) > 0
      ) {
        throw new BadRequestException(
          'Reverse provider settlement receipts first before reversing this source transaction',
        );
      }

      if (!original.journal) {
        throw new BadRequestException('Transaction has no posted journal to reverse');
      }

      await this.validation.requireOpenCashDeskForLedgerEntries(
        tx,
        original.journal.entries,
        'Cash transaction reversal',
      );
      await this.validation.ensureReversalCapacity(
        tx,
        original.journal.entries,
      );

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
          providerSettlementId: entry.providerSettlementId ?? undefined,
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
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "CustomerReceivable" WHERE "id" = $1 FOR UPDATE',
          collection.receivableId,
        );
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
            remaining <= 0.001
              ? ReceivableStatus.RECEIVED
              : receivable.dueAt && receivable.dueAt < new Date()
                ? ReceivableStatus.OVERDUE
                : received <= 0.001
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

      if (original.providerSettlementSource) {
        await tx.providerSettlement.update({
          where: { id: original.providerSettlementSource.id },
          data: {
            status: ProviderSettlementStatus.REVERSED,
            remainingAmount: new Prisma.Decimal(0),
          },
        });
      }

      if (original.providerSettlementReceipt) {
        const receipt = original.providerSettlementReceipt;
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "ProviderSettlement" WHERE "id" = $1 FOR UPDATE',
          receipt.settlementId,
        );
        const settlement = await tx.providerSettlement.findUnique({
          where: { id: receipt.settlementId },
        });
        if (settlement) {
          const received = Math.max(
            0,
            Number(settlement.receivedAmount) - Number(receipt.amount),
          );
          const remaining = Math.max(
            0,
            Number(settlement.expectedAmount) - received,
          );
          const status =
            received <= 0.001
              ? ProviderSettlementStatus.PENDING
              : remaining <= 0.001
                ? ProviderSettlementStatus.SETTLED
                : ProviderSettlementStatus.PARTIALLY_SETTLED;
          await tx.providerSettlementReceipt.update({
            where: { id: receipt.id },
            data: { status: PaymentStatus.REVERSED },
          });
          await tx.providerSettlement.update({
            where: { id: settlement.id },
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
