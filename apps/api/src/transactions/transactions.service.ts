import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { CreateInternalTransferDto } from './dto/create-internal-transfer.dto.js';
import { CreateMicroAtmDto } from './dto/create-micro-atm.dto.js';
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
      ...(options?.type ? { transactionType: options.type } : {}),
      ...(options?.status ? { status: options.status } : {}),
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
            transactionAt: new Date(),
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
          transactionAt: new Date(),
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
          transactionAt: new Date(),
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
    if (dto.expenseType === 'MIXED') {
      throw new BadRequestException(
        'Expense type must be BUSINESS or PERSONAL',
      );
    }
    const transactionType =
      dto.expenseType === 'PERSONAL'
        ? TransactionType.PERSONAL_EXPENSE
        : TransactionType.BUSINESS_EXPENSE;
    const idempotencyKey = await this.idempotency.key(
      transactionType,
      userId,
      dto,
      providedIdempotencyKey,
    );

    return this.prisma.$transaction(async (tx) => {
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
      await this.validation.expenseCategory(
        tx,
        dto.expenseCategoryId,
        dto.expenseType,
      );
      if (paymentAccount.accountType === AccountType.CASH) {
        await this.validation.requireOpenCashDesk(
          tx,
          paymentAccount.id,
          'Cash expense',
        );
      }

      if (
        paymentAccount.usageType !== 'MIXED' &&
        paymentAccount.usageType !== dto.expenseType
      ) {
        throw new BadRequestException(
          'Expense type is incompatible with the selected account usage',
        );
      }

      if (paymentAccount.accountType === AccountType.OWNER_CREDIT_CARD) {
        if (paymentAccount.accountNature !== AccountNature.LIABILITY) {
          throw new BadRequestException(
            'Owner credit-card account must be a liability',
          );
        }
        await this.validation.ensureCreditCapacity(
          tx,
          paymentAccount,
          dto.amount,
        );
      } else {
        if (paymentAccount.accountNature !== AccountNature.ASSET) {
          throw new BadRequestException(
            'Expense payment account must be an asset',
          );
        }
        await this.validation.ensureSufficientFunds(
          tx,
          paymentAccount,
          dto.amount,
        );
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
          description: dto.description,
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
      select: {
        id: true,
        transactionNumber: true,
        transactionAt: true,
        status: true,
      },
    });
    if (!original) throw new NotFoundException('Transaction not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          transactionAt: corrected,
          updatedById: userId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: id,
          action: 'UPDATE_DATE_TIME',
          oldValues: {
            transactionAt: original.transactionAt.toISOString(),
            transactionNumber: original.transactionNumber,
          },
          newValues: {
            transactionAt: corrected.toISOString(),
            transactionNumber: original.transactionNumber,
          },
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
