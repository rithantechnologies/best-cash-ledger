import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountNature, AccountType, CalculationType, CommissionMethod, CustomerType, EntryType, PayableStatus, PaymentStatus, Prisma, ProviderSettlementStatus, ReceivableStatus, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { IdempotencyService } from '../finance/idempotency.service.js';
import { ProviderPayoutChargeService } from '../finance/provider-payout-charge.service.js';
import { LedgerService, type JournalEntry } from '../ledger/ledger.service.js';
import { ProviderSettlementsService } from '../provider-settlements/provider-settlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAepsDto } from './dto/create-aeps.dto.js';
import { CreateAtmWithdrawalDto } from './dto/create-atm-withdrawal.dto.js';
import { CreateCardSwipeDto } from './dto/create-card-swipe.dto.js';
import { CorrectTransactionAmountDto } from './dto/correct-transaction-amount.dto.js';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto.js';
import { CreateCreditCardPaymentDto } from './dto/create-credit-card-payment.dto.js';
import { CompleteExpenseDto, CreateExpenseDto } from './dto/create-expense.dto.js';
import { CreateInternalTransferDto } from './dto/create-internal-transfer.dto.js';
import { CreateMicroAtmDto } from './dto/create-micro-atm.dto.js';
import { CompleteQuickCashTransferDto, CreateQuickCashTransferDto, SettleServicePartnerPayableDto } from './dto/quick-cash-transfer.dto.js';
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
    private readonly payoutCharges: ProviderPayoutChargeService,
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
      // Quick-cash completion (QCC) rows are internal settlement postings for
      // their parent QCT transaction. Keep them in the ledger/audit trail, but
      // exclude them from the customer-facing transaction list so processed
      // totals and transaction counts are not doubled.
      NOT: { transactionNumber: { startsWith: 'QCC-' } },
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
          servicePartnerPaymentAccount: true,
          commissionAccount: true,
          sourceAllocations: { include: { sourceAccount: true } },
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
      requestedChargeAmount: this.money(payment.chargeAmount ?? 0),
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
          cardType: string | null;
          cardNetworkId: string | null;
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
        if (dto.newCustomer.cardNetworkId) {
          const cardNetwork = await tx.cardNetwork.findFirst({
            where: { id: dto.newCustomer.cardNetworkId, isActive: true },
            select: { id: true },
          });
          if (!cardNetwork) throw new BadRequestException('Selected card network is not active');
        }
        const customer = await tx.customer.create({
          data: {
            customerCode: 'CUS-' + Date.now().toString(36).toUpperCase(),
            customerType: CustomerType.REGULAR,
            fullName: dto.newCustomer.fullName.trim().toUpperCase(),
            mobile,
            createdById: userId,
          },
        });
        const card = await tx.customerCard.create({
          data: {
            customerId: customer.id,
            bankName: dto.newCustomer.bankName.trim(),
            cardType: 'CREDIT',
            cardNetworkId: dto.newCustomer.cardNetworkId,
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
                cardNetworkId: card.cardNetworkId,
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
            cardType: card.cardType,
            cardNetworkId: card.cardNetworkId,
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

      const payoutAccountIds = [
        ...new Set(customerPayments.map((payment) => payment.sourceAccountId)),
      ].sort();
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
      const effectiveCustomerPayments = [];
      for (const payment of customerPayments) {
        const sourceAccount = payoutAccountById.get(payment.sourceAccountId)!;
        const configuredCharge = await this.payoutCharges.resolve(
          tx,
          sourceAccount,
          payment.amount,
        );
        const chargeAmount = configuredCharge
          ? configuredCharge.amount
          : payment.requestedChargeAmount;
        if (
          sourceAccount.accountType !== AccountType.PROVIDER_WALLET &&
          chargeAmount > 0
        ) {
          throw new BadRequestException(
            'Payout charge is allowed only for wallet payouts',
          );
        }
        effectiveCustomerPayments.push({
          ...payment,
          chargeAmount,
          configuredCharge,
        });
      }
      const payoutRequiredByAccount = new Map<string, number>();
      for (const payment of effectiveCustomerPayments) {
        payoutRequiredByAccount.set(
          payment.sourceAccountId,
          this.money(
            (payoutRequiredByAccount.get(payment.sourceAccountId) ?? 0) +
              payment.amount + payment.chargeAmount,
          ),
        );
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
      for (let index = 0; index < effectiveCustomerPayments.length; index += 1) {
        const payment = effectiveCustomerPayments[index];
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
              chargeType: 'PAYOUT',
              providerId: sourceAccount.providerId,
              sourceAccountId: sourceAccount.id,
              providerPayoutChargeRuleId: payment.configuredCharge?.ruleId ?? null,
              calculationType:
                payment.configuredCharge?.calculationType ?? CalculationType.FIXED,
              rate:
                payment.configuredCharge
                  ? new Prisma.Decimal(payment.configuredCharge.rate)
                  : null,
              amount: new Prisma.Decimal(payment.chargeAmount),
              notes: sourceAccount.accountName + ' payout charge',
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
              paymentCount: effectiveCustomerPayments.length,
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
    const cashAmountDue =
      dto.direction === 'IN' && purpose === 'TRANSFER'
        ? this.money(amount + commissionCashAmount)
        : null;
    const cashReceivedAmount =
      cashAmountDue === null
        ? null
        : this.money(dto.cashReceivedAmount ?? cashAmountDue);
    const customerChangeAmount =
      cashAmountDue === null || cashReceivedAmount === null
        ? null
        : this.money(Math.max(0, cashReceivedAmount - cashAmountDue));
    const servicePaymentMode = dto.servicePaymentMode ?? 'CASH';
    const serviceFulfillmentMode = dto.serviceFulfillmentMode ?? 'INTERNAL';
    const servicePartnerCharge =
      serviceFulfillmentMode === 'PARTNER'
        ? this.money(dto.servicePartnerCharge ?? 0)
        : 0;
    const servicePartnerPaymentTiming =
      serviceFulfillmentMode === 'PARTNER'
        ? dto.servicePartnerPaymentTiming ?? 'PAID_NOW'
        : null;
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
      if (serviceFulfillmentMode === 'PARTNER') {
        if (!dto.servicePartnerName?.trim()) {
          throw new BadRequestException('Partner name is required for outsourced service work');
        }
        if (!Number.isFinite(servicePartnerCharge) || servicePartnerCharge <= 0) {
          throw new BadRequestException('Partner charge must be greater than zero');
        }
        if (
          servicePartnerPaymentTiming === 'PAID_NOW' &&
          !dto.servicePartnerPaymentAccountId
        ) {
          throw new BadRequestException('Choose where the partner was paid from');
        }
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
      if (
        dto.direction === 'IN' &&
        cashAmountDue !== null &&
        cashReceivedAmount !== null &&
        cashReceivedAmount < cashAmountDue
      ) {
        throw new BadRequestException(
          'Cash received must cover the transfer amount and cash-paid commission',
        );
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
        const servicePartnerCostLedger =
          serviceFulfillmentMode === 'PARTNER'
            ? await tx.ledgerAccount.findUnique({
                where: { ledgerCode: 'SYS-SERVICE-PARTNER-COST' },
              })
            : null;
        const servicePartnerPayableLedger =
          serviceFulfillmentMode === 'PARTNER' &&
          servicePartnerPaymentTiming === 'PAY_LATER'
            ? await tx.ledgerAccount.findUnique({
                where: { ledgerCode: 'SYS-SERVICE-PARTNER-PAYABLE' },
              })
            : null;
        if (
          !serviceIncomeLedger ||
          !cashAccount.ledgerAccount ||
          (serviceFulfillmentMode === 'PARTNER' && !servicePartnerCostLedger) ||
          (serviceFulfillmentMode === 'PARTNER' &&
            servicePartnerPaymentTiming === 'PAY_LATER' &&
            !servicePartnerPayableLedger)
        ) {
          throw new NotFoundException('Service income / partner ledgers are missing');
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

        let servicePartnerPaymentAccount = null;
        if (
          serviceFulfillmentMode === 'PARTNER' &&
          servicePartnerPaymentTiming === 'PAID_NOW'
        ) {
          const partnerPaymentAccountId = dto.servicePartnerPaymentAccountId!;
          if (partnerPaymentAccountId !== cashAccount.id) {
            await this.validation.lockAccount(tx, partnerPaymentAccountId);
          }
          servicePartnerPaymentAccount = await this.validation.account(
            tx,
            partnerPaymentAccountId,
            {
              label: 'Partner payment account',
              nature: AccountNature.ASSET,
              types: [
                AccountType.CASH,
                AccountType.BANK,
                AccountType.UPI,
                AccountType.PROVIDER_WALLET,
              ],
            },
          );
          if (
            servicePartnerPaymentAccount.accountType === AccountType.CASH &&
            servicePartnerPaymentAccount.id !== cashAccount.id
          ) {
            throw new BadRequestException(
              'Partner cash payment must use the current open cash drawer',
            );
          }
          if (
            actorRole === RoleName.STAFF &&
            servicePartnerPaymentAccount.accountName === 'Main Cash Reserve'
          ) {
            throw new ForbiddenException('Main Cash Reserve is owner-only');
          }
        }

        const serviceName = dto.serviceName!.trim();
        const servicePartnerName =
          serviceFulfillmentMode === 'PARTNER'
            ? dto.servicePartnerName!.trim()
            : null;
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
            serviceFulfillmentMode,
            servicePartnerName,
            servicePartnerCharge: new Prisma.Decimal(servicePartnerCharge),
            servicePartnerPaymentTiming,
            servicePartnerPaymentAccountId:
              servicePartnerPaymentAccount?.id ?? null,
            servicePartnerPaidAt:
              serviceFulfillmentMode === 'PARTNER' &&
              servicePartnerPaymentTiming === 'PAID_NOW'
                ? new Date()
                : null,
            completedAt: new Date(),
          },
        });
        if (serviceFulfillmentMode === 'PARTNER') {
          await tx.transactionCharge.create({
            data: {
              transactionId: transaction.id,
              chargeType: 'SERVICE_PARTNER_COST',
              calculationType: CalculationType.FIXED,
              rate: new Prisma.Decimal(servicePartnerCharge),
              amount: new Prisma.Decimal(servicePartnerCharge),
              sourceAccountId:
                servicePartnerPaymentTiming === 'PAID_NOW'
                  ? servicePartnerPaymentAccount!.id
                  : null,
              notes:
                servicePartnerName +
                ' · ' +
                (servicePartnerPaymentTiming === 'PAID_NOW'
                  ? 'Paid now'
                  : 'Pay later'),
            },
          });
        }

        const serviceEntries: JournalEntry[] = [
          {
            ledgerAccountId: servicePaymentAccount.ledgerAccount!.id,
            entryType: EntryType.DEBIT,
            amount,
            description:
              (servicePaymentMode === 'UPI'
                ? 'Bank / UPI payment'
                : 'Cash received') +
              ' for ' +
              serviceName,
          },
          {
            ledgerAccountId: serviceIncomeLedger.id,
            entryType: EntryType.CREDIT,
            amount,
            description: 'Service revenue · ' + serviceName,
          },
        ];
        if (serviceFulfillmentMode === 'PARTNER') {
          serviceEntries.push({
            ledgerAccountId: servicePartnerCostLedger!.id,
            entryType: EntryType.DEBIT,
            amount: servicePartnerCharge,
            description:
              'Partner cost · ' + servicePartnerName + ' · ' + serviceName,
          });
          serviceEntries.push({
            ledgerAccountId:
              servicePartnerPaymentTiming === 'PAID_NOW'
                ? servicePartnerPaymentAccount!.ledgerAccount!.id
                : servicePartnerPayableLedger!.id,
            entryType: EntryType.CREDIT,
            amount: servicePartnerCharge,
            description:
              servicePartnerPaymentTiming === 'PAID_NOW'
                ? 'Paid to partner · ' + servicePartnerName
                : 'Partner payable · ' + servicePartnerName,
          });
        }

        await this.ledger.post(
          tx,
          transaction.id,
          userId,
          'Service income · ' + serviceName,
          serviceEntries,
        );
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

      // The quick-cash amount is always the transaction principal.
      // Commission is tracked separately and must never reduce the beneficiary
      // transfer / customer principal.
      const transferAmount = amount;
      const cashPrincipalMovement =
        dto.direction === 'IN'
          ? this.money(amount + commissionCashAmount)
          : amount;
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'QCT-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CASH_TRANSFER,
          transactionAt,
          customerId: linkedCustomer?.id ?? null,
          // gross/net represent principal only. Commission remains auditable
          // through TransactionCommission and the quick-cash detail.
          grossAmount: new Prisma.Decimal(amount),
          netAmount: new Prisma.Decimal(amount),
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
          cashReceivedAmount:
            cashReceivedAmount === null ? null : new Prisma.Decimal(cashReceivedAmount),
          customerChangeAmount:
            customerChangeAmount === null ? null : new Prisma.Decimal(customerChangeAmount),
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
                amount: cashPrincipalMovement,
                description:
                  commissionCashAmount > 0
                    ? 'Quick cash received · principal + cash commission'
                    : 'Quick cash received',
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
      const beneficiaryMode = dto.beneficiaryMode ?? detail.beneficiaryMode;
      const amount = Number(detail.amount);
      const splitWalletTransfer =
        detail.direction === 'IN' && beneficiaryMode === 'BANK';
      const sourceAllocations = splitWalletTransfer
        ? (dto.sourceAllocations ?? (dto.sourceAccountId
            ? [{
                sourceAccountId: dto.sourceAccountId,
                amount,
                referenceNumber: dto.referenceNumber,
              }]
            : []))
            .map((allocation) => ({
              sourceAccountId: allocation.sourceAccountId,
              amount: this.money(allocation.amount),
              referenceNumber: allocation.referenceNumber?.trim() || null,
            }))
        : [];

      if (splitWalletTransfer) {
        if (!sourceAllocations.length) {
          throw new BadRequestException('Add at least one wallet source');
        }
        const allocatedAmount = this.money(
          sourceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0),
        );
        if (sourceAllocations.some((allocation) => allocation.amount <= 0)) {
          throw new BadRequestException('Each wallet allocation must be greater than zero');
        }
        if (Math.abs(allocatedAmount - this.money(amount)) > 0.001) {
          throw new BadRequestException('Wallet allocations must equal the beneficiary payout amount');
        }
      } else if (!dto.sourceAccountId) {
        throw new BadRequestException(
          detail.direction === 'OUT'
            ? 'Choose the incoming transfer account'
            : 'Choose the transfer source account',
        );
      }

      const sourceAccountIds = splitWalletTransfer
        ? [...new Set(sourceAllocations.map((allocation) => allocation.sourceAccountId))]
        : [dto.sourceAccountId!];
      if (sourceAccountIds.includes(detail.cashAccountId)) {
        throw new BadRequestException('Choose a bank, UPI or wallet account');
      }

      for (const accountId of sourceAccountIds) {
        await this.validation.lockAccount(tx, accountId);
      }
      const sourceAccounts = new Map<string, any>();
      for (const accountId of sourceAccountIds) {
        const account = await this.validation.liquidAsset(
          tx,
          accountId,
          detail.direction === 'IN' ? 'Transfer source' : 'Incoming transfer account',
        );
        if (!account.ledgerAccount) {
          throw new NotFoundException('Source account ledger is unavailable');
        }
        if (splitWalletTransfer && account.accountType !== AccountType.PROVIDER_WALLET) {
          throw new BadRequestException('Bank-transfer cash-in sources must be wallet accounts');
        }
        sourceAccounts.set(accountId, account);
      }
      const sourceAccount = sourceAccounts.get(sourceAccountIds[0]);
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
        const effectiveCommissionAccountId =
          dto.commissionAccountId ??
          (splitWalletTransfer && sourceAllocations.length === 1
            ? sourceAllocations[0].sourceAccountId
            : undefined);
        if (!effectiveCommissionAccountId) {
          throw new BadRequestException('Choose the account that received the bank / UPI commission');
        }
        if (!sourceAccountIds.includes(effectiveCommissionAccountId)) {
          await this.validation.lockAccount(tx, effectiveCommissionAccountId);
        }
        commissionAccount = await this.validation.transferSource(
          tx,
          effectiveCommissionAccountId,
        );
      }

      // detail.amount is the principal. Commission was posted separately when
      // the quick entry was created, so completion settles the full principal.
      const settlementAmount = amount;
      const payoutChargeRows: Array<{
        sourceAccountId: string;
        amount: number;
        charge: Awaited<ReturnType<ProviderPayoutChargeService['resolve']>>;
      }> = [];
      if (detail.direction === 'IN') {
        if (splitWalletTransfer) {
          for (const allocation of sourceAllocations) {
            const account = sourceAccounts.get(allocation.sourceAccountId);
            const charge = await this.payoutCharges.resolve(
              tx,
              account,
              allocation.amount,
            );
            payoutChargeRows.push({
              sourceAccountId: allocation.sourceAccountId,
              amount: charge?.amount ?? 0,
              charge,
            });
          }
        } else {
          const charge = await this.payoutCharges.resolve(
            tx,
            sourceAccount,
            settlementAmount,
          );
          payoutChargeRows.push({
            sourceAccountId: sourceAccount.id,
            amount: charge?.amount ?? 0,
            charge,
          });
        }
      }
      const payoutChargeTotal = this.money(
        payoutChargeRows.reduce((sum, row) => sum + row.amount, 0),
      );
      if (detail.direction === 'IN') {
        if (splitWalletTransfer) {
          const requiredByAccount = new Map<string, number>();
          for (const allocation of sourceAllocations) {
            requiredByAccount.set(
              allocation.sourceAccountId,
              this.money(
                (requiredByAccount.get(allocation.sourceAccountId) ?? 0) +
                  allocation.amount +
                  (payoutChargeRows.find((row) =>
                    row.sourceAccountId === allocation.sourceAccountId
                  )?.amount ?? 0),
              ),
            );
          }
          for (const [accountId, requiredAmount] of requiredByAccount) {
            await this.validation.ensureSufficientFunds(
              tx,
              sourceAccounts.get(accountId),
              requiredAmount,
            );
          }
        } else {
          await this.validation.ensureSufficientFunds(
            tx,
            sourceAccount,
            settlementAmount + payoutChargeTotal,
          );
        }
      }

      const ledgerCode =
        detail.direction === 'IN' ? 'SYS-CUST-PAYABLE' : 'SYS-CUST-RECEIVABLE';
      const [pendingLedger, payoutChargeLedger] = await Promise.all([
        tx.ledgerAccount.findUnique({
          where: { ledgerCode },
        }),
        payoutChargeTotal > 0
          ? tx.ledgerAccount.findUnique({
              where: { ledgerCode: 'SYS-PROVIDER-CHARGE' },
            })
          : Promise.resolve(null),
      ]);
      if (!pendingLedger) {
        throw new NotFoundException('Pending transfer ledger is missing');
      }
      if (payoutChargeTotal > 0 && !payoutChargeLedger) {
        throw new NotFoundException('Provider payout charge ledger is missing');
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
          grossAmount: new Prisma.Decimal(settlementAmount + payoutChargeTotal),
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
              ...(splitWalletTransfer
                ? sourceAllocations.map((allocation) => ({
                    ledgerAccountId: sourceAccounts.get(allocation.sourceAccountId).ledgerAccount.id,
                    entryType: EntryType.CREDIT,
                    amount:
                      allocation.amount +
                      (payoutChargeRows.find((row) =>
                        row.sourceAccountId === allocation.sourceAccountId
                      )?.amount ?? 0),
                    description:
                      'Beneficiary transfer from wallet' +
                      (allocation.referenceNumber
                        ? ' · ' + allocation.referenceNumber
                        : ''),
                  }))
                : [{
                    ledgerAccountId: sourceAccount.ledgerAccount.id,
                    entryType: EntryType.CREDIT,
                    amount: settlementAmount + payoutChargeTotal,
                    description: 'Transfer source outflow',
                  }]),
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
      for (const row of payoutChargeRows) {
        if (row.amount <= 0 || !payoutChargeLedger) continue;
        completionEntries.push({
          ledgerAccountId: payoutChargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: row.amount,
          description:
            sourceAccounts.get(row.sourceAccountId).accountName +
            ' payout charge expense',
        });
      }
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
      for (const row of payoutChargeRows) {
        if (row.amount <= 0) continue;
        const account = sourceAccounts.get(row.sourceAccountId);
        await tx.transactionCharge.create({
          data: {
            transactionId: completion.id,
            chargeType: 'PAYOUT',
            providerId: account.providerId,
            sourceAccountId: account.id,
            providerPayoutChargeRuleId: row.charge?.ruleId ?? null,
            calculationType:
              row.charge?.calculationType ?? CalculationType.FIXED,
            rate:
              row.charge
                ? new Prisma.Decimal(row.charge.rate)
                : null,
            amount: new Prisma.Decimal(row.amount),
            notes: account.accountName + ' payout charge',
          },
        });
      }

      await this.ledger.post(
        tx,
        completion.id,
        userId,
        'Complete ' + detail.transaction.transactionNumber,
        completionEntries,
      );

      if (splitWalletTransfer) {
        await tx.quickCashSourceAllocation.createMany({
          data: sourceAllocations.map((allocation) => ({
            quickCashTransferId: id,
            sourceAccountId: allocation.sourceAccountId,
            amount: new Prisma.Decimal(allocation.amount),
            referenceNumber: allocation.referenceNumber,
            createdById: userId,
          })),
        });
      }

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
            sourceAllocations: splitWalletTransfer ? sourceAllocations : undefined,
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
            payoutChargeAmount: payoutChargeTotal,
            payoutChargeSources: payoutChargeRows
              .filter((row) => row.amount > 0)
              .map((row) => ({
                sourceAccountId: row.sourceAccountId,
                amount: row.amount,
              })),
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

  async settleServicePartnerPayable(
    transactionId: string,
    dto: SettleServicePartnerPayableDto,
    userId: string,
    actorRole: RoleName,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          quickCashTransfer: true,
          journal: true,
          charges: true,
        },
      });
      if (!transaction) {
        throw new NotFoundException('Service transaction not found');
      }
      if (
        transaction.transactionType !== TransactionType.SERVICE_INCOME ||
        !transaction.quickCashTransfer
      ) {
        throw new BadRequestException('This is not a service income transaction');
      }
      if (transaction.status === TransactionStatus.REVERSED) {
        throw new BadRequestException('Reversed service transactions cannot be paid');
      }

      const detail = transaction.quickCashTransfer;
      if (detail.serviceFulfillmentMode !== 'PARTNER') {
        throw new BadRequestException('This service was not fulfilled by a partner');
      }
      if (detail.servicePartnerPaymentTiming !== 'PAY_LATER') {
        throw new BadRequestException('This partner cost was not recorded as pay later');
      }
      if (detail.servicePartnerPaidAt) {
        throw new BadRequestException('This partner payable has already been settled');
      }

      const amount = this.money(Number(detail.servicePartnerCharge));
      if (amount <= 0) {
        throw new BadRequestException('Partner payable amount is invalid');
      }

      await this.validation.lockAccount(tx, dto.paymentAccountId);
      const paymentAccount = await this.validation.account(
        tx,
        dto.paymentAccountId,
        {
          label: 'Partner payment account',
          nature: AccountNature.ASSET,
          types: [
            AccountType.CASH,
            AccountType.BANK,
            AccountType.UPI,
            AccountType.PROVIDER_WALLET,
          ],
        },
      );
      if (
        actorRole === RoleName.STAFF &&
        paymentAccount.accountName === 'Main Cash Reserve'
      ) {
        throw new ForbiddenException('Main Cash Reserve is owner-only');
      }
      await this.validation.ensureSufficientFunds(tx, paymentAccount, amount);

      const partnerPayableLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode: 'SYS-SERVICE-PARTNER-PAYABLE' },
      });
      if (!partnerPayableLedger || !transaction.journal) {
        throw new NotFoundException('Partner payable ledger or journal is missing');
      }

      const paidAt = new Date();
      await tx.ledgerEntry.createMany({
        data: [
          {
            journalId: transaction.journal.id,
            ledgerAccountId: partnerPayableLedger.id,
            entryType: EntryType.DEBIT,
            amount: new Prisma.Decimal(amount),
            description:
              'Clear partner payable · ' +
              (detail.servicePartnerName ?? 'Service partner'),
          },
          {
            journalId: transaction.journal.id,
            ledgerAccountId: paymentAccount.ledgerAccount!.id,
            entryType: EntryType.CREDIT,
            amount: new Prisma.Decimal(amount),
            description:
              'Partner payment · ' +
              (detail.servicePartnerName ?? 'Service partner'),
          },
        ],
      });

      await tx.quickCashTransferDetail.update({
        where: { id: detail.id },
        data: {
          servicePartnerPaymentAccountId: paymentAccount.id,
          servicePartnerPaidAt: paidAt,
        },
      });
      await tx.transactionCharge.updateMany({
        where: {
          transactionId,
          chargeType: 'SERVICE_PARTNER_COST',
        },
        data: {
          sourceAccountId: paymentAccount.id,
          notes:
            (detail.servicePartnerName ?? 'Service partner') +
            ' · Pay later · settled' +
            (dto.notes?.trim() ? ' · ' + dto.notes.trim() : ''),
        },
      });
      await tx.transaction.update({
        where: { id: transactionId },
        data: { updatedById: userId },
      });
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: transactionId,
          action: 'SETTLE_SERVICE_PARTNER_PAYABLE',
          oldValues: {
            servicePartnerPaymentTiming: detail.servicePartnerPaymentTiming,
            servicePartnerPaidAt: null,
            servicePartnerPaymentAccountId: null,
          },
          newValues: {
            servicePartnerName: detail.servicePartnerName,
            servicePartnerCharge: amount,
            servicePartnerPaymentAccountId: paymentAccount.id,
            servicePartnerPaidAt: paidAt.toISOString(),
            notes: dto.notes?.trim() || null,
          },
        },
      });

      return {
        transactionId,
        partnerName: detail.servicePartnerName,
        amount,
        paymentAccountId: paymentAccount.id,
        paidAt,
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
    const requestedTransferChargeAmount = this.money(dto.transferChargeAmount ?? 0);
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
      const configuredPayoutCharge = await this.payoutCharges.resolve(
        tx,
        sourceAccount,
        actualTransferAmount,
      );
      const transferChargeAmount = configuredPayoutCharge
        ? configuredPayoutCharge.amount
        : requestedTransferChargeAmount;
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
            sourceAccountId: sourceAccount.id,
            providerPayoutChargeRuleId: configuredPayoutCharge?.ruleId ?? null,
            calculationType:
              configuredPayoutCharge?.calculationType ?? CalculationType.FIXED,
            rate:
              configuredPayoutCharge
                ? new Prisma.Decimal(configuredPayoutCharge.rate)
                : null,
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
          description:
            sourceAccount.accountName + ' payout / transfer charge expense',
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
    if (calculatedCashGiven <= 0 || calculatedCommission < 0) {
      throw new BadRequestException('Invalid AePS commission');
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
            fullName: dto.newCustomer.fullName.trim().toUpperCase(),
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

      const { provider, gateway } = await this.validation.providerGateway(
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
      const effectivePlatformChargeType = gateway
        ? gateway.defaultChargeType
        : CalculationType.PERCENTAGE;
      const effectivePlatformChargeRate = gateway
        ? Number(gateway.defaultChargeRate)
        : Number(provider.aepsProviderChargeRate ?? 0);
      const calculatedPlatformCharge = this.money(
        effectivePlatformChargeType === CalculationType.FIXED
          ? effectivePlatformChargeRate
          : withdrawalAmount * effectivePlatformChargeRate / 100,
      );
      const providerCommissionRule = await tx.aepsProviderCommissionRule.findFirst({
        where: {
          providerId: provider.id,
          effectiveFrom: { lte: transactionAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: transactionAt } }],
          minAmount: { lte: withdrawalAmount },
          AND: [
            {
              OR: [
                { maxAmount: null },
                { maxAmount: { gte: withdrawalAmount } },
              ],
            },
          ],
        },
        orderBy: { minAmount: 'desc' },
      });
      const providerCommissionValue = providerCommissionRule
        ? Number(providerCommissionRule.value)
        : 0;
      const calculatedProviderCommission = this.money(
        providerCommissionRule?.calculationType === CalculationType.PERCENTAGE
          ? withdrawalAmount * providerCommissionValue / 100
          : providerCommissionValue,
      );
      const calculatedSettlement = this.money(
        withdrawalAmount - calculatedPlatformCharge + calculatedProviderCommission,
      );
      if (
        calculatedSettlement <= 0 ||
        calculatedPlatformCharge < 0 ||
        calculatedProviderCommission < 0
      ) {
        throw new BadRequestException('Invalid AePS provider settlement');
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
            platformChargeRate: new Prisma.Decimal(effectivePlatformChargeRate),
            platformChargeAmount: new Prisma.Decimal(0),
            providerCommissionRuleId: providerCommissionRule?.id ?? null,
            providerCommissionCalculationType: providerCommissionRule?.calculationType ?? null,
            providerCommissionRate:
              providerCommissionRule?.calculationType === CalculationType.PERCENTAGE
                ? new Prisma.Decimal(providerCommissionValue)
                : null,
            providerCommissionAmount: new Prisma.Decimal(0),
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
          platformChargeRate: new Prisma.Decimal(effectivePlatformChargeRate),
          platformChargeAmount: new Prisma.Decimal(calculatedPlatformCharge),
          providerCommissionRuleId: providerCommissionRule?.id ?? null,
          providerCommissionCalculationType: providerCommissionRule?.calculationType ?? null,
          providerCommissionRate:
            providerCommissionRule?.calculationType === CalculationType.PERCENTAGE
              ? new Prisma.Decimal(providerCommissionValue)
              : null,
          providerCommissionAmount: new Prisma.Decimal(calculatedProviderCommission),
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
            calculationType: effectivePlatformChargeType,
            rate: new Prisma.Decimal(effectivePlatformChargeRate),
            amount: new Prisma.Decimal(calculatedPlatformCharge),
          },
        });
      }
      if (calculatedCommission > 0) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'AEPS_CUSTOMER',
            calculationType: 'PERCENTAGE',
            rate: new Prisma.Decimal(dto.commissionRate),
            amount: new Prisma.Decimal(calculatedCommission),
          },
        });
      }
      if (calculatedProviderCommission > 0 && providerCommissionRule) {
        await tx.transactionCommission.create({
          data: {
            transactionId: transaction.id,
            commissionType: 'AEPS_PROVIDER',
            calculationType: providerCommissionRule.calculationType,
            rate: new Prisma.Decimal(providerCommissionValue),
            amount: new Prisma.Decimal(calculatedProviderCommission),
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
          description: 'AePS customer commission income',
        });
      }
      if (calculatedProviderCommission > 0) {
        entries.push({
          ledgerAccountId: commissionLedger.id,
          entryType: EntryType.CREDIT,
          amount: calculatedProviderCommission,
          customerId,
          providerSettlementId: providerSettlement.id,
          description: 'AePS provider commission income',
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
    const requestedChargeAmount = dto.chargeAmount ?? 0;
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
      const configuredPayoutCharge = await this.payoutCharges.resolve(
        tx,
        source,
        dto.transferAmount,
      );
      const chargeAmount = configuredPayoutCharge
        ? configuredPayoutCharge.amount
        : requestedChargeAmount;
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
            chargeType: configuredPayoutCharge
              ? 'PAYOUT'
              : source.accountType === AccountType.PROVIDER_WALLET
                ? 'WALLET'
                : source.accountType === AccountType.BANK
                  ? 'BANK'
                  : 'TRANSFER',
            providerId: source.providerId,
            sourceAccountId: source.id,
            providerPayoutChargeRuleId: configuredPayoutCharge?.ruleId ?? null,
            calculationType:
              configuredPayoutCharge?.calculationType ?? CalculationType.FIXED,
            rate:
              configuredPayoutCharge
                ? new Prisma.Decimal(configuredPayoutCharge.rate)
                : null,
            amount: new Prisma.Decimal(chargeAmount),
            notes: configuredPayoutCharge
              ? source.accountName + ' payout charge'
              : 'Internal transfer charge',
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
      const configuredPayoutCharge = await this.payoutCharges.resolve(
        tx,
        paymentAccount,
        dto.amount,
      );
      const payoutChargeAmount = configuredPayoutCharge?.amount ?? 0;
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
        await this.validation.ensureSufficientFunds(
          tx,
          paymentAccount,
          dto.amount + payoutChargeAmount,
        );
      }

      const [expenseLedger, payoutChargeLedger] = await Promise.all([
        tx.ledgerAccount.findUnique({
          where: { ledgerCode: 'SYS-BUSINESS-EXPENSE' },
        }),
        payoutChargeAmount > 0
          ? tx.ledgerAccount.findUnique({
              where: { ledgerCode: 'SYS-PROVIDER-CHARGE' },
            })
          : Promise.resolve(null),
      ]);
      if (!expenseLedger) throw new Error('Expense ledger missing');
      if (payoutChargeAmount > 0 && !payoutChargeLedger) {
        throw new Error('Provider payout charge ledger missing');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'EXP-' + Date.now().toString(36).toUpperCase(),
          transactionType,
          transactionAt: new Date(),
          grossAmount: new Prisma.Decimal(dto.amount + payoutChargeAmount),
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
      if (payoutChargeAmount > 0 && configuredPayoutCharge) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType: 'PAYOUT',
            providerId: paymentAccount.providerId,
            sourceAccountId: paymentAccount.id,
            providerPayoutChargeRuleId: configuredPayoutCharge.ruleId,
            calculationType: configuredPayoutCharge.calculationType,
            rate: new Prisma.Decimal(configuredPayoutCharge.rate),
            amount: new Prisma.Decimal(payoutChargeAmount),
            notes: paymentAccount.accountName + ' payout charge',
          },
        });
      }
      const expenseEntries: JournalEntry[] = [
        {
          ledgerAccountId: expenseLedger.id,
          entryType: EntryType.DEBIT,
          amount: dto.amount,
          description,
        },
        ...(payoutChargeAmount > 0 && payoutChargeLedger
          ? [{
              ledgerAccountId: payoutChargeLedger.id,
              entryType: EntryType.DEBIT,
              amount: payoutChargeAmount,
              description: paymentAccount.accountName + ' payout charge expense',
            }]
          : []),
        {
          ledgerAccountId: paymentAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: dto.amount + payoutChargeAmount,
          description:
            paymentAccount.accountType === AccountType.OWNER_CREDIT_CARD
              ? 'Credit-card liability increased'
              : 'Expense payment',
        },
      ];
      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        description,
        expenseEntries,
      );
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
      const configuredPayoutCharge = await this.payoutCharges.resolve(
        tx,
        paymentAccount,
        amount,
      );
      const payoutChargeAmount = configuredPayoutCharge?.amount ?? 0;
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
        await this.validation.ensureSufficientFunds(
          tx,
          paymentAccount,
          amount + payoutChargeAmount,
        );
      }

      const [expenseLedger, payoutChargeLedger] = await Promise.all([
        tx.ledgerAccount.findUnique({
          where: { ledgerCode: 'SYS-BUSINESS-EXPENSE' },
        }),
        payoutChargeAmount > 0
          ? tx.ledgerAccount.findUnique({
              where: { ledgerCode: 'SYS-PROVIDER-CHARGE' },
            })
          : Promise.resolve(null),
      ]);
      if (!expenseLedger) throw new Error('Expense ledger missing');
      if (payoutChargeAmount > 0 && !payoutChargeLedger) {
        throw new Error('Provider payout charge ledger missing');
      }

      const description =
        transaction.expense.description || transaction.expense.expenseCategory.name;
      await tx.expenseDetail.update({
        where: { transactionId },
        data: { paymentAccountId: paymentAccount.id },
      });
      if (payoutChargeAmount > 0 && configuredPayoutCharge) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType: 'PAYOUT',
            providerId: paymentAccount.providerId,
            sourceAccountId: paymentAccount.id,
            providerPayoutChargeRuleId: configuredPayoutCharge.ruleId,
            calculationType: configuredPayoutCharge.calculationType,
            rate: new Prisma.Decimal(configuredPayoutCharge.rate),
            amount: new Prisma.Decimal(payoutChargeAmount),
            notes: paymentAccount.accountName + ' payout charge',
          },
        });
      }
      const expenseEntries: JournalEntry[] = [
        {
          ledgerAccountId: expenseLedger.id,
          entryType: EntryType.DEBIT,
          amount,
          description,
        },
        ...(payoutChargeAmount > 0 && payoutChargeLedger
          ? [{
              ledgerAccountId: payoutChargeLedger.id,
              entryType: EntryType.DEBIT,
              amount: payoutChargeAmount,
              description: paymentAccount.accountName + ' payout charge expense',
            }]
          : []),
        {
          ledgerAccountId: paymentAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: amount + payoutChargeAmount,
          description:
            paymentAccount.accountType === AccountType.OWNER_CREDIT_CARD
              ? 'Credit-card liability increased'
              : 'Expense payment',
        },
      ];
      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        description,
        expenseEntries,
      );
      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.COMPLETED,
          grossAmount: new Prisma.Decimal(amount + payoutChargeAmount),
          netAmount: new Prisma.Decimal(amount),
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
      const configuredPayoutCharge = await this.payoutCharges.resolve(
        tx,
        sourceAccount,
        dto.paymentAmount,
      );
      const payoutChargeAmount = configuredPayoutCharge?.amount ?? 0;
      const outstanding = await this.validation.balance(tx, cardAccount);
      await this.validation.ensureSufficientFunds(
        tx,
        sourceAccount,
        dto.paymentAmount + payoutChargeAmount,
      );
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
          grossAmount: new Prisma.Decimal(dto.paymentAmount + payoutChargeAmount),
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

      const payoutChargeLedger = payoutChargeAmount > 0
        ? await tx.ledgerAccount.findUnique({
            where: { ledgerCode: 'SYS-PROVIDER-CHARGE' },
          })
        : null;
      if (payoutChargeAmount > 0 && !payoutChargeLedger) {
        throw new Error('Provider payout charge ledger missing');
      }
      if (payoutChargeAmount > 0 && configuredPayoutCharge) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType: 'PAYOUT',
            providerId: sourceAccount.providerId,
            sourceAccountId: sourceAccount.id,
            providerPayoutChargeRuleId: configuredPayoutCharge.ruleId,
            calculationType: configuredPayoutCharge.calculationType,
            rate: new Prisma.Decimal(configuredPayoutCharge.rate),
            amount: new Prisma.Decimal(payoutChargeAmount),
            notes: sourceAccount.accountName + ' payout charge',
          },
        });
      }

      const paymentEntries: JournalEntry[] = [
        {
          ledgerAccountId: cardAccount.ledgerAccount!.id,
          entryType: EntryType.DEBIT,
          amount: dto.paymentAmount,
          description: 'Reduce owner credit-card liability',
        },
        ...(payoutChargeAmount > 0 && payoutChargeLedger
          ? [{
              ledgerAccountId: payoutChargeLedger.id,
              entryType: EntryType.DEBIT,
              amount: payoutChargeAmount,
              description: sourceAccount.accountName + ' payout charge expense',
            }]
          : []),
        {
          ledgerAccountId: sourceAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: dto.paymentAmount + payoutChargeAmount,
          description: 'Credit-card payment source',
        },
      ];
      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Owner credit card payment',
        paymentEntries,
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
        charges: { include: { sourceAccount: true } },
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
            servicePartnerPaymentAccount: true,
            sourceAllocations: { include: { sourceAccount: true } },
          },
        },
        aeps: { include: { cashAccount: true, settlementAccount: true } },
        microAtm: { include: { cashAccount: true, settlementAccount: true } },
        internalTransfer: { include: { sourceAccount: true, destinationAccount: true } },
        expense: { include: { expenseCategory: true, paymentAccount: true } },
        atmWithdrawal: { include: { bankAccount: true, cashAccount: true } },
        creditCardPayment: { include: { creditCardAccount: true, sourceAccount: true } },
        payable: { include: { payments: { include: { sourceAccount: true, transaction: { include: { charges: { include: { sourceAccount: true } } } } } } } },
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
    const [creator, correctionSource, correctedTransaction] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: transaction.createdById },
        select: { id: true, fullName: true },
      }),
      transaction.correctionSourceTransactionId
        ? this.prisma.transaction.findUnique({
            where: { id: transaction.correctionSourceTransactionId },
            select: { id: true, transactionNumber: true, status: true },
          })
        : Promise.resolve(null),
      this.prisma.transaction.findFirst({
        where: { correctionSourceTransactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, transactionNumber: true, status: true },
      }),
    ]);
    return {
      ...transaction,
      createdBy: creator,
      correctionSource,
      correctedTransaction,
    };
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

  async correctAmount(
    id: string,
    dto: CorrectTransactionAmountDto,
    userId: string,
    actorRole: RoleName,
  ) {
    const correctedAmount = this.money(dto.correctedAmount);
    const reason = dto.reason.trim();
    if (correctedAmount <= 0) {
      throw new BadRequestException('Corrected amount must be greater than zero');
    }

    const original = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        charges: true,
        commissions: true,
        journal: { include: { entries: { include: { ledgerAccount: true } } } },
        cardSwipe: true,
        cashTransfer: true,
        quickCashTransfer: { include: { sourceAllocations: true } },
        aeps: true,
        microAtm: true,
        internalTransfer: true,
        expense: true,
        atmWithdrawal: true,
        creditCardPayment: true,
        payable: { include: { payments: true } },
        receivableSource: { include: { collections: true } },
        providerSettlementSource: { include: { receipts: true } },
      },
    });
    if (!original) throw new NotFoundException('Transaction not found');
    if (
      original.status === TransactionStatus.REVERSED ||
      original.transactionType === TransactionType.REVERSAL
    ) {
      throw new BadRequestException('Reversed transactions cannot be corrected');
    }
    if (
      original.quickCashTransfer?.servicePartnerPaymentTiming === 'PAY_LATER' &&
      original.quickCashTransfer.servicePartnerPaidAt
    ) {
      throw new BadRequestException(
        'This service amount cannot be corrected after its deferred partner payment was settled. Reverse the service transaction and record the corrected service instead.',
      );
    }

    const managedElsewhere = new Set<TransactionType>([
      TransactionType.CUSTOMER_PAYOUT,
      TransactionType.CUSTOMER_RECEIVABLE,
      TransactionType.CUSTOMER_RECEIPT,
      TransactionType.PROVIDER_SETTLEMENT,
      TransactionType.CARD_DUE_CLEARING,
      TransactionType.CARD_DUE_RECOVERY,
      TransactionType.CARD_DUE_COMMISSION_COLLECTION,
      TransactionType.CASH_ADJUSTMENT,
    ]);
    if (managedElsewhere.has(original.transactionType)) {
      throw new BadRequestException(
        'This linked/system transaction must be corrected from its source workflow rather than changing the posted amount here',
      );
    }

    const baseAmount =
      original.cardSwipe ? Number(original.cardSwipe.swipeAmount) :
      original.cashTransfer ? Number(original.cashTransfer.requestedAmount) :
      original.quickCashTransfer ? Number(original.quickCashTransfer.amount) :
      original.aeps ? Number(original.aeps.withdrawalAmount) :
      original.microAtm ? Number(original.microAtm.withdrawalAmount) :
      original.internalTransfer ? Number(original.internalTransfer.transferAmount) :
      original.expense ? Number(original.expense.amount) :
      original.atmWithdrawal ? Number(original.atmWithdrawal.cashReceived) :
      original.creditCardPayment ? Number(original.creditCardPayment.paymentAmount) :
      Number(original.grossAmount);

    if (Math.abs(baseAmount - correctedAmount) < 0.001) {
      throw new BadRequestException('Corrected amount is the same as the current amount');
    }

    // A failed attempt or an unpaid pending expense has no posted financial movement.
    // In that narrow case it is safer and clearer to edit the amount in-place while
    // recording a permanent audit entry.
    if (!original.journal) {
      return this.prisma.$transaction(async (tx) => {
        if (original.expense && original.status === TransactionStatus.PENDING) {
          await tx.expenseDetail.update({
            where: { transactionId: original.id },
            data: { amount: new Prisma.Decimal(correctedAmount) },
          });
          const updated = await tx.transaction.update({
            where: { id: original.id },
            data: {
              grossAmount: new Prisma.Decimal(correctedAmount),
              netAmount: new Prisma.Decimal(correctedAmount),
              correctionReason: reason,
              updatedById: userId,
            },
          });
          await tx.auditLog.create({
            data: {
              userId,
              entityType: 'TRANSACTION',
              entityId: original.id,
              action: 'CORRECT_AMOUNT',
              oldValues: { amount: baseAmount, status: original.status },
              newValues: { amount: correctedAmount, status: original.status },
              reason,
            },
          });
          return {
            originalId: original.id,
            correctedTransactionId: updated.id,
            correctedTransactionNumber: updated.transactionNumber,
            inPlace: true,
          };
        }

        if (original.aeps && original.status === TransactionStatus.FAILED) {
          await tx.aepsDetail.update({
            where: { transactionId: original.id },
            data: { withdrawalAmount: new Prisma.Decimal(correctedAmount) },
          });
          const updated = await tx.transaction.update({
            where: { id: original.id },
            data: {
              grossAmount: new Prisma.Decimal(correctedAmount),
              correctionReason: reason,
              updatedById: userId,
            },
          });
          await tx.auditLog.create({
            data: {
              userId,
              entityType: 'TRANSACTION',
              entityId: original.id,
              action: 'CORRECT_AMOUNT',
              oldValues: { amount: baseAmount, status: original.status },
              newValues: { amount: correctedAmount, status: original.status },
              reason,
            },
          });
          return {
            originalId: original.id,
            correctedTransactionId: updated.id,
            correctedTransactionNumber: updated.transactionNumber,
            inPlace: true,
          };
        }

        if (original.quickCashTransfer && original.status === TransactionStatus.FAILED) {
          await tx.quickCashTransferDetail.update({
            where: { transactionId: original.id },
            data: { amount: new Prisma.Decimal(correctedAmount) },
          });
          const updated = await tx.transaction.update({
            where: { id: original.id },
            data: {
              grossAmount: new Prisma.Decimal(correctedAmount),
              netAmount: new Prisma.Decimal(correctedAmount),
              correctionReason: reason,
              updatedById: userId,
            },
          });
          await tx.auditLog.create({
            data: {
              userId,
              entityType: 'TRANSACTION',
              entityId: original.id,
              action: 'CORRECT_AMOUNT',
              oldValues: { amount: baseAmount, status: original.status },
              newValues: { amount: correctedAmount, status: original.status },
              reason,
            },
          });
          return {
            originalId: original.id,
            correctedTransactionId: updated.id,
            correctedTransactionNumber: updated.transactionNumber,
            inPlace: true,
          };
        }

        throw new BadRequestException(
          'This transaction has no posted journal and cannot be amount-corrected from this screen',
        );
      });
    }

    if (original.payable && Number(original.payable.paidAmount) > 0) {
      throw new BadRequestException(
        'Reverse the linked customer payout first, then correct this transaction',
      );
    }
    if (
      original.receivableSource &&
      Number(original.receivableSource.receivedAmount) > 0
    ) {
      throw new BadRequestException(
        'Reverse the linked customer receipt first, then correct this transaction',
      );
    }
    if (
      original.providerSettlementSource &&
      Number(original.providerSettlementSource.receivedAmount) > 0
    ) {
      throw new BadRequestException(
        'Reverse the linked provider settlement receipt first, then correct this transaction',
      );
    }

    const scaleAllocations = (
      rows: Array<{ accountId: string; amount: number; referenceNumber?: string | null }>,
      target: number,
    ) => {
      if (!rows.length) return [];
      if (rows.length === 1) {
        return [{ ...rows[0], amount: this.money(target) }];
      }
      const total = rows.reduce((sum, row) => sum + row.amount, 0);
      if (total <= 0) {
        return rows.map((row, index) => ({
          ...row,
          amount: index === rows.length - 1 ? this.money(target) : 0,
        }));
      }
      let used = 0;
      return rows.map((row, index) => {
        const amount =
          index === rows.length - 1
            ? this.money(target - used)
            : this.money(target * row.amount / total);
        used = this.money(used + amount);
        return { ...row, amount };
      });
    };

    let recreate: (() => Promise<any>) | null = null;
    let quickCompletion:
      | {
          oldTransactionId: string;
          transactionAt: Date;
          sourceAccountId: string | null;
          commissionAccountId: string | null;
          beneficiaryMode: string | null;
          beneficiaryDetails: string | null;
          sourceAllocations: Array<{
            accountId: string;
            amount: number;
            referenceNumber?: string | null;
          }>;
          referenceNumber: string | null;
          notes: string | null;
        }
      | null = null;

    if (original.transactionType === TransactionType.CARD_SWIPE && original.cardSwipe) {
      const d = original.cardSwipe;
      recreate = () =>
        this.createCardSwipe(
          {
            customerId: original.customerId ?? undefined,
            customerCardId: d.customerCardId,
            swipeAmount: correctedAmount,
            providerId: d.providerId,
            gatewayId: d.gatewayId,
            providerChargeRate: Number(d.providerChargeRate),
            commissionRate: Number(d.commissionRate),
            paymentTermId: d.paymentTermId,
            dueAt: d.dueAt.toISOString(),
            settledNow: false,
            settlementDueAt:
              original.providerSettlementSource?.dueAt?.toISOString(),
            referenceNumber: original.referenceNumber ?? undefined,
            notes: original.notes ?? undefined,
          },
          userId,
          actorRole,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      original.transactionType === TransactionType.CASH_TRANSFER &&
      original.cashTransfer
    ) {
      const d = original.cashTransfer;
      const commissionRow = original.commissions.find(
        (item) => item.commissionType === 'CASH_TRANSFER',
      );
      const fixedCommission = commissionRow?.calculationType === 'FIXED';
      const nextCommission = fixedCommission
        ? Number(d.commissionAmount)
        : this.money(correctedAmount * Number(d.commissionRate) / 100);
      const nextCashReceived =
        d.commissionMethod === 'ADD_ON'
          ? this.money(correctedAmount + nextCommission)
          : correctedAmount;
      const receiptRows = original.journal.entries
        .filter(
          (entry) =>
            entry.entryType === EntryType.DEBIT &&
            entry.description?.startsWith('Customer payment received') &&
            entry.ledgerAccount.financialAccountId,
        )
        .map((entry) => ({
          accountId: entry.ledgerAccount.financialAccountId!,
          amount: Number(entry.amount),
        }));
      const allocations = scaleAllocations(
        receiptRows.length
          ? receiptRows
          : [{ accountId: d.cashAccountId, amount: Number(d.cashReceived) }],
        nextCashReceived,
      );
      recreate = () =>
        this.createCashTransfer(
          {
            customerId: original.customerId!,
            beneficiaryId: d.beneficiaryId ?? undefined,
            beneficiaryAccountId: d.beneficiaryAccountId ?? undefined,
            customerBankAccountId: d.customerBankAccountId ?? undefined,
            customerUpiAccountId: d.customerUpiAccountId ?? undefined,
            requestedAmount: correctedAmount,
            commissionMethod: d.commissionMethod,
            commissionRate: Number(d.commissionRate),
            ...(fixedCommission
              ? { commissionAmount: Number(d.commissionAmount) }
              : {}),
            transferChargeAmount: Number(d.transferChargeAmount),
            transferChargeType: d.transferChargeType ?? undefined,
            receiptAllocations: allocations,
            sourceAccountId: d.sourceAccountId,
            referenceNumber: original.referenceNumber ?? undefined,
            notes: original.notes ?? undefined,
          },
          userId,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      (original.transactionType === TransactionType.CASH_TRANSFER ||
        original.transactionType === TransactionType.SERVICE_INCOME) &&
      original.quickCashTransfer
    ) {
      const d = original.quickCashTransfer;
      if (d.completionTransactionId) {
        const completion = await this.prisma.transaction.findUnique({
          where: { id: d.completionTransactionId },
          select: {
            id: true,
            transactionAt: true,
            referenceNumber: true,
            notes: true,
          },
        });
        if (!completion) {
          throw new BadRequestException('Linked quick-cash completion transaction is missing');
        }
        quickCompletion = {
          oldTransactionId: completion.id,
          transactionAt: completion.transactionAt,
          sourceAccountId: d.sourceAccountId,
          commissionAccountId: d.commissionAccountId,
          beneficiaryMode: d.beneficiaryMode,
          beneficiaryDetails: d.beneficiaryDetails,
          sourceAllocations: d.sourceAllocations.map((row) => ({
            accountId: row.sourceAccountId,
            amount: Number(row.amount),
            referenceNumber: row.referenceNumber,
          })),
          referenceNumber: completion.referenceNumber,
          notes: completion.notes,
        };
      }
      const commissionAmount = Number(d.commissionAmount);
      const commissionCashAmount =
        d.commissionCashAmount !== null
          ? Number(d.commissionCashAmount)
          : d.commissionMode === 'CASH'
            ? commissionAmount
            : 0;
      const previousChange = Number(d.customerChangeAmount ?? 0);
      const correctedCashReceived =
        d.direction === 'IN' && d.purpose === 'TRANSFER'
          ? this.money(correctedAmount + commissionCashAmount + previousChange)
          : undefined;
      recreate = () =>
        this.createQuickCash(
          {
            direction: d.direction as 'IN' | 'OUT',
            cashAccountId: d.cashAccountId,
            amount: correctedAmount,
            cashReceivedAmount: correctedCashReceived,
            commissionAmount,
            commissionCashAmount,
            purpose: d.purpose as 'TRANSFER' | 'SERVICE',
            serviceName: d.serviceName ?? undefined,
            cashOutType: d.cashOutType as 'UPI_QR' | 'AEPS' | 'MICRO_ATM',
            successful: true,
            customerId: original.customerId ?? undefined,
            aadhaarLastFour: d.aadhaarLastFour ?? undefined,
            customerBankName: d.customerBankName ?? undefined,
            cardLastFour: d.cardLastFour ?? undefined,
            customerName: d.customerName ?? undefined,
            mobileNumber: d.mobileNumber ?? undefined,
            remarks: original.notes ?? undefined,
            transactionAt: original.transactionAt.toISOString(),
            commissionMode: d.commissionMode as 'CASH' | 'UPI' | 'SPLIT',
            beneficiaryMode: d.beneficiaryMode as 'UPI' | 'BANK' | undefined,
            beneficiaryDetails: d.beneficiaryDetails ?? undefined,
            servicePaymentMode: d.servicePaymentMode as 'CASH' | 'UPI',
            servicePaymentAccountId: d.servicePaymentAccountId ?? undefined,
            serviceFulfillmentMode:
              d.serviceFulfillmentMode as 'INTERNAL' | 'PARTNER',
            servicePartnerName: d.servicePartnerName ?? undefined,
            servicePartnerCharge: Number(d.servicePartnerCharge ?? 0),
            servicePartnerPaymentTiming:
              d.servicePartnerPaymentTiming as 'PAID_NOW' | 'PAY_LATER' | undefined,
            servicePartnerPaymentAccountId:
              d.servicePartnerPaymentAccountId ?? undefined,
          },
          userId,
          actorRole,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      original.transactionType === TransactionType.AEPS_WITHDRAWAL &&
      original.aeps
    ) {
      const d = original.aeps;
      recreate = () =>
        this.createAeps(
          {
            customerId: original.customerId ?? undefined,
            aadhaarLastFour: d.aadhaarLastFour,
            customerBankName: d.customerBankName,
            withdrawalAmount: correctedAmount,
            platformId: d.platformId ?? undefined,
            providerId: d.providerId ?? undefined,
            gatewayId: d.gatewayId ?? undefined,
            platformChargeRate:
              d.platformChargeRate === null ? undefined : Number(d.platformChargeRate),
            commissionRate: Number(d.commissionRate ?? 0),
            commissionMethod: d.commissionMethod,
            successful: true,
            cashPayoutNow: Boolean(d.cashAccountId),
            cashPayoutDueAt: original.payable?.dueAt.toISOString(),
            cashAccountId: d.cashAccountId ?? undefined,
            settlementAccountId: d.settlementAccountId,
            settledNow: false,
            settlementDueAt:
              original.providerSettlementSource?.dueAt?.toISOString(),
            providerReference: d.providerReference ?? undefined,
            transactionAt: original.transactionAt.toISOString(),
            notes: original.notes ?? undefined,
          },
          userId,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      original.transactionType === TransactionType.MICRO_ATM &&
      original.microAtm
    ) {
      const d = original.microAtm;
      recreate = () =>
        this.createMicroAtm(
          {
            customerId: original.customerId!,
            cardLastFour: d.cardLastFour,
            customerBankName: d.customerBankName ?? undefined,
            withdrawalAmount: correctedAmount,
            providerId: d.providerId,
            gatewayId: d.gatewayId ?? undefined,
            providerCommissionRate: Number(d.providerCommissionRate),
            cashAccountId: d.cashAccountId,
            settlementAccountId: d.settlementAccountId,
            settledNow: false,
            settlementDueAt:
              original.providerSettlementSource?.dueAt?.toISOString(),
            providerReference: d.providerReference ?? undefined,
            transactionAt: original.transactionAt.toISOString(),
            notes: original.notes ?? undefined,
          },
          userId,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      original.transactionType === TransactionType.INTERNAL_TRANSFER &&
      original.internalTransfer
    ) {
      const d = original.internalTransfer;
      recreate = () =>
        this.createInternalTransfer(
          {
            sourceAccountId: d.sourceAccountId,
            destinationAccountId: d.destinationAccountId,
            transferAmount: correctedAmount,
            chargeAmount: Number(d.chargeAmount),
            referenceNumber: original.referenceNumber ?? undefined,
            notes: original.notes ?? undefined,
          },
          userId,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      original.transactionType === TransactionType.BUSINESS_EXPENSE &&
      original.expense
    ) {
      const d = original.expense;
      recreate = () =>
        this.createExpense(
          {
            expenseType: d.expenseType,
            expenseCategoryId: d.expenseCategoryId,
            amount: correctedAmount,
            paymentAccountId: d.paymentAccountId ?? undefined,
            description: d.description ?? undefined,
            referenceNumber: original.referenceNumber ?? undefined,
            notes: original.notes ?? undefined,
          },
          userId,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      original.transactionType === TransactionType.ATM_WITHDRAWAL &&
      original.atmWithdrawal
    ) {
      const d = original.atmWithdrawal;
      recreate = () =>
        this.createAtmWithdrawal(
          {
            bankAccountId: d.bankAccountId,
            cashAccountId: d.cashAccountId,
            cashReceived: correctedAmount,
            atmCharge: Number(d.atmCharge),
            referenceNumber: original.referenceNumber ?? undefined,
            notes: original.notes ?? undefined,
          },
          userId,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    } else if (
      original.transactionType === TransactionType.OWNER_CC_PAYMENT &&
      original.creditCardPayment
    ) {
      const d = original.creditCardPayment;
      recreate = () =>
        this.createCreditCardPayment(
          {
            creditCardAccountId: d.creditCardAccountId,
            sourceAccountId: d.sourceAccountId,
            paymentAmount: correctedAmount,
            referenceNumber: original.referenceNumber ?? undefined,
            notes: original.notes ?? undefined,
          },
          userId,
          'CORRECTION:' + original.id + ':' + correctedAmount,
        );
    }

    if (!recreate) {
      throw new BadRequestException(
        'Amount correction is not available for this transaction type',
      );
    }

    const reversalReason =
      'Amount correction: ' + baseAmount.toFixed(2) + ' → ' +
      correctedAmount.toFixed(2) + ' · ' + reason;

    if (quickCompletion) {
      await this.reverse(
        quickCompletion.oldTransactionId,
        { reason: reversalReason + ' · linked quick-cash completion' },
        userId,
      );
    }
    await this.reverse(original.id, { reason: reversalReason }, userId);

    let createdResult: any;
    try {
      createdResult = await recreate();
    } catch (error) {
      throw new BadRequestException(
        'The original was safely reversed, but the replacement could not be created. Create the corrected transaction manually and reference ' +
          original.transactionNumber +
          '. ' +
          (error instanceof Error ? error.message : ''),
      );
    }

    const createdTransaction =
      createdResult?.transaction ?? createdResult;
    if (!createdTransaction?.id) {
      throw new BadRequestException('Corrected transaction was created but could not be identified');
    }

    let correctedCompletionId: string | null = null;
    if (quickCompletion && original.quickCashTransfer) {
      const newDetail = await this.prisma.quickCashTransferDetail.findUnique({
        where: { transactionId: createdTransaction.id },
      });
      if (!newDetail) {
        throw new BadRequestException('Corrected quick-cash detail was not created');
      }
      const scaledSources = scaleAllocations(
        quickCompletion.sourceAllocations,
        correctedAmount,
      );
      const completionResult = await this.completeQuickCash(
        newDetail.id,
        {
          sourceAccountId:
            scaledSources.length ? undefined : quickCompletion.sourceAccountId ?? undefined,
          sourceAllocations: scaledSources.length
            ? scaledSources.map((row) => ({
                sourceAccountId: row.accountId,
                amount: row.amount,
                referenceNumber: row.referenceNumber ?? undefined,
              }))
            : undefined,
          commissionAccountId:
            quickCompletion.commissionAccountId ?? undefined,
          customerName: original.quickCashTransfer.customerName ?? undefined,
          mobileNumber: original.quickCashTransfer.mobileNumber ?? undefined,
          referenceNumber: quickCompletion.referenceNumber ?? undefined,
          notes: quickCompletion.notes ?? undefined,
          beneficiaryMode:
            quickCompletion.beneficiaryMode as 'UPI' | 'BANK' | undefined,
          beneficiaryDetails:
            quickCompletion.beneficiaryDetails ?? undefined,
        },
        userId,
        actorRole,
      );
      correctedCompletionId = completionResult.completionTransactionId;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: createdTransaction.id },
        data: {
          correctionSourceTransactionId: original.id,
          correctionReason: reason,
          transactionAt: original.transactionAt,
          updatedById: userId,
        },
      });
      await tx.ledgerJournal.updateMany({
        where: { transactionId: createdTransaction.id },
        data: { postingDate: original.transactionAt },
      });
      if (quickCompletion && correctedCompletionId) {
        await tx.transaction.update({
          where: { id: correctedCompletionId },
          data: { transactionAt: quickCompletion.transactionAt },
        });
        await tx.ledgerJournal.updateMany({
          where: { transactionId: correctedCompletionId },
          data: { postingDate: quickCompletion.transactionAt },
        });
      }
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'TRANSACTION',
          entityId: createdTransaction.id,
          action: 'CORRECT_AMOUNT',
          oldValues: {
            sourceTransactionId: original.id,
            sourceTransactionNumber: original.transactionNumber,
            amount: baseAmount,
          },
          newValues: {
            correctedTransactionId: createdTransaction.id,
            amount: correctedAmount,
          },
          reason,
        },
      });
    });

    const corrected = await this.prisma.transaction.findUnique({
      where: { id: createdTransaction.id },
      select: { id: true, transactionNumber: true, transactionType: true },
    });

    return {
      originalId: original.id,
      reversalCreated: true,
      correctedTransactionId: corrected!.id,
      correctedTransactionNumber: corrected!.transactionNumber,
      transactionType: corrected!.transactionType,
      inPlace: false,
    };
  }

  async deleteTransaction(id: string, dto: ReverseTransactionDto, userId: string) {
    const original = await this.prisma.transaction.findUnique({
      where: { id },
      include: { expense: true, journal: { select: { id: true } } },
    });
    if (!original) throw new NotFoundException('Transaction not found');

    // Pending expenses saved without a payment source have no accounting journal yet.
    // They can be voided directly because there is no financial movement to reverse.
    if (
      original.expense &&
      original.status === TransactionStatus.PENDING &&
      !original.journal
    ) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.transaction.update({
          where: { id },
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
            entityId: id,
            action: 'DELETE',
            oldValues: {
              status: original.status,
              transactionNumber: original.transactionNumber,
            },
            newValues: { status: TransactionStatus.REVERSED },
            reason: dto.reason,
          },
        });
        return { originalId: id, deleted: true, transaction: updated };
      });
    }

    return this.reverse(id, dto, userId);
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
