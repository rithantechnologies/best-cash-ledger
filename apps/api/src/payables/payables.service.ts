import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, EntryType, PayableStatus, PaymentStatus, Prisma, ProviderSettlementStatus, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { FinancialValidationService, requireWholeRupeeCashPayout } from '../finance/financial-validation.service.js';
import { IdempotencyService } from '../finance/idempotency.service.js';
import { ProviderPayoutChargeService } from '../finance/provider-payout-charge.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePayablePaymentDto } from './dto/create-payable-payment.dto.js';
import { CreateAdvanceOffsetDto } from './dto/create-advance-offset.dto.js';
import { CancelPayableDto } from './dto/cancel-payable.dto.js';
import { buildDueReport } from './due-report.js';

@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly validation: FinancialValidationService,
    private readonly idempotency: IdempotencyService,
    private readonly payoutCharges: ProviderPayoutChargeService,
  ) {}

  private indiaDayRange(date = new Date()) {
    const offset = 330 * 60 * 1000;
    const local = new Date(date.getTime() + offset);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    return {
      start: new Date(Date.UTC(y, m, d) - offset),
      end: new Date(Date.UTC(y, m, d + 1) - offset),
    };
  }

  /**
   * Read-only daily customer payout worklist. Uses the active payable's
   * remaining amount, not gross swipe or cash movement, so partial payouts
   * and advance offsets are never counted twice.
   */
  async dueReport(options?: { q?: string; transactionType?: TransactionType }) {
    const where: Prisma.CustomerPayableWhereInput = {
      remainingAmount: { gt: 0 },
      status: { notIn: [PayableStatus.PAID, PayableStatus.CANCELLED, PayableStatus.REVERSED] },
      sourceTransaction: {
        status: { notIn: [TransactionStatus.REVERSED, TransactionStatus.CANCELLED, TransactionStatus.FAILED] },
        ...(options?.transactionType ? { transactionType: options.transactionType } : {}),
      },
      ...(options?.q?.trim() ? {
        customer: { OR: [
          { fullName: { contains: options.q.trim(), mode: 'insensitive' } },
          { mobile: { contains: options.q.trim() } },
        ] },
      } : {}),
    };
    const payables = await this.prisma.customerPayable.findMany({
      where,
      select: {
        id: true, originalAmount: true, paidAmount: true, offsetAmount: true,
        remainingAmount: true, dueAt: true, status: true,
        customer: { select: { id: true, fullName: true, mobile: true } },
        paymentTerm: { select: { name: true, durationValue: true, durationUnit: true } },
        sourceTransaction: {
          select: {
            transactionNumber: true, transactionType: true, transactionAt: true,
            cardSwipe: {
              select: {
                swipeAmount: true, commissionAmount: true, commissionRate: true,
                providerChargeAmount: true, providerId: true, gatewayId: true,
                customerCard: { select: { bankName: true, lastFourDigits: true } },
              },
            },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
    const providerIds = [...new Set(payables.map(p => p.sourceTransaction.cardSwipe?.providerId).filter((v): v is string => !!v))];
    const gatewayIds = [...new Set(payables.map(p => p.sourceTransaction.cardSwipe?.gatewayId).filter((v): v is string => !!v))];
    const [providers,gateways] = await Promise.all([
      providerIds.length ? this.prisma.provider.findMany({
        where: { id: { in: providerIds } }, select: { id: true, name: true },
      }) : [],
      gatewayIds.length ? this.prisma.providerGateway.findMany({
        where: { id: { in: gatewayIds } }, select: { id: true, gatewayName: true },
      }) : [],
    ]);
    return buildDueReport(payables, new Date(), {
      providers: new Map(providers.map(p => [p.id,p.name])),
      gateways: new Map(gateways.map(g => [g.id,g.gatewayName])),
    });
  }

  /**
   * Owner-facing reconciliation. A payout must never be marked paid merely
   * because a user zeroed its balance. Compare its persisted totals with
   * active financial payments, prior advance offsets and manual allocations.
   * This report does not mutate customer balances.
   */
  async reconciliation() {
    const payables = await this.prisma.customerPayable.findMany({
      where: { status: { notIn: [PayableStatus.CANCELLED, PayableStatus.REVERSED] } },
      include: {
        customer: { select: { fullName: true, mobile: true } },
        sourceTransaction: { select: { id: true, transactionNumber: true, transactionAt: true, status: true,
          cardSwipe: { select: { customerPayableAmount: true, customerCardId: true } },
        } },
        payments: { include: { transaction: { select: { status: true } } } },
        advanceOffsets: { include: { transaction: { select: { status: true } } } },
        manualLedgerAllocations: {
          include: {
            customerLedgerEntry: {
              include: { transaction: { select: { status: true } } },
            },
          },
        },
      },
    });
    // An older customer Pay Out may already have moved the money. Surface
    // eligible unmatched advances before anyone attempts a second payout.
    // This is a read-only suggestion, not an automatic matching/transfer.
    const openSwipes = payables.filter((p) => p.sourceTransaction.cardSwipe &&
      Number(p.remainingAmount) > 0.001 && p.status !== PayableStatus.PAID);
    const candidates = openSwipes.length ? await this.prisma.customerLedgerEntryDetail.findMany({
      where: {
        direction: 'PAY_OUT',
        receivableAmount: { gt: 0 },
        transaction: {
          status: TransactionStatus.COMPLETED,
          customerId: { in: [...new Set(openSwipes.map((p) => p.customerId))] },
        },
      },
      select: {
        id: true, amount: true, receivableAmount: true, payableAmount: true,
        advanceAppliedAmount: true, customerCardId: true,
        transaction: {
          select: { customerId: true, transactionAt: true, transactionNumber: true },
        },
      },
    }) : [];
    const cents = (value: number) => Math.round(value * 100);
    const active = (status: TransactionStatus) =>
      status !== TransactionStatus.CANCELLED && status !== TransactionStatus.REVERSED && status !== TransactionStatus.FAILED;
    const problems = payables.flatMap((p) => {
      const sum = (rows: { amount: Prisma.Decimal }[]) =>
        rows.reduce((total, row) => total + cents(Number(row.amount)), 0);
      const paid = sum([
        ...p.payments.filter((x) => x.status === PaymentStatus.COMPLETED && active(x.transaction.status)),
        ...p.manualLedgerAllocations.filter((x) => active(x.customerLedgerEntry.transaction.status)),
      ]);
      const offset = sum(p.advanceOffsets.filter((x) =>
        !x.reversedAt && active(x.transaction.status)));
      const original = cents(Number(p.originalAmount));
      const remaining = Math.max(0, original - paid - offset);
      const reasons: string[] = [];
      if (p.sourceTransaction.cardSwipe &&
          cents(Number(p.sourceTransaction.cardSwipe.customerPayableAmount)) !== original) {
        reasons.push('Original payable differs from recorded card-swipe customer amount; investigate possible manual zeroing');
      }

      if (remaining > 0 && p.sourceTransaction.cardSwipe) {
        const earlier = candidates.filter((a) =>
          a.transaction.customerId === p.customerId &&
          a.transaction.transactionAt < p.sourceTransaction.transactionAt &&
          (!a.customerCardId || a.customerCardId === p.sourceTransaction.cardSwipe!.customerCardId) &&
          cents(Number(a.receivableAmount)) > cents(Number(a.advanceAppliedAmount))
        );
        if (earlier.length) {
          const available = earlier.reduce((total, a) =>
            total + Math.max(0, cents(Number(a.receivableAmount)) - cents(Number(a.advanceAppliedAmount))), 0);
          reasons.push('Earlier Pay Out exists (' + earlier.map((a) => a.transaction.transactionNumber).join(', ') +
            '); up to ₹' + (Math.min(remaining, available) / 100).toFixed(2) +
            ' may be matched without sending money again. Use Apply earlier Pay Out.');
          for (const advance of earlier) {
            const difference = cents(Number(advance.amount)) -
              cents(Number(advance.receivableAmount)) - cents(Number(advance.payableAmount));
            if (difference !== 0) {
              reasons.push('Earlier Pay Out ' + advance.transaction.transactionNumber +
                ' has ₹' + (Math.abs(difference) / 100).toFixed(2) +
                ' not consistently classified; verify the original wallet/bank statement before correcting it');
            }
          }
        }
      }
      if (cents(Number(p.paidAmount)) !== paid) reasons.push('Paid total differs from active payouts/allocations');
      if (cents(Number(p.offsetAmount)) !== offset) reasons.push('Advance offset total differs from active offsets');
      if (cents(Number(p.remainingAmount)) !== remaining) reasons.push('Remaining amount differs from original minus settlements');
      if (remaining === 0 && p.status !== PayableStatus.PAID) reasons.push('Fully settled payable still marked unpaid');
      if (remaining > 0 && p.status === PayableStatus.PAID) reasons.push('Payable marked paid despite outstanding balance');
      if (!active(p.sourceTransaction.status)) reasons.push('Source transaction inactive, but payable is active');
      return reasons.length ? [{
        id: p.id,
        customer: p.customer.fullName,
        mobile: p.customer.mobile,
        transactionNumber: p.sourceTransaction.transactionNumber,
        originalAmount: Number(p.originalAmount),
        storedPaidAmount: Number(p.paidAmount),
        postedPaidAmount: paid / 100,
        storedOffsetAmount: Number(p.offsetAmount),
        postedOffsetAmount: offset / 100,
        storedRemainingAmount: Number(p.remainingAmount),
        expectedRemainingAmount: remaining / 100,
        status: p.status,
        reasons,
      }] : [];
    });
    return { inspected: payables.length, issueCount: problems.length, issues: problems };
  }

  async list(options?: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: PayableStatus;
    transactionType?: TransactionType;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    openOnly?: boolean;
    dueDate?: string;
  }) {
    const { start: todayStart, end: todayEnd } = this.indiaDayRange();
    await this.prisma.$transaction([
      this.prisma.customerPayable.updateMany({
        where: {
          dueAt: { lt: todayStart },
          remainingAmount: { gt: 0 },
          status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] },
        },
        data: { status: PayableStatus.OVERDUE },
      }),
      this.prisma.customerPayable.updateMany({
        where: {
          dueAt: { gte: todayStart, lt: todayEnd },
          remainingAmount: { gt: 0 },
          paidAmount: { lte: 0 },
          offsetAmount: { lte: 0 },
          status: PayableStatus.OVERDUE,
        },
        data: { status: PayableStatus.PENDING },
      }),
      this.prisma.customerPayable.updateMany({
        where: {
          dueAt: { gte: todayStart, lt: todayEnd },
          remainingAmount: { gt: 0 },
          OR: [{ paidAmount: { gt: 0 } }, { offsetAmount: { gt: 0 } }],
          status: PayableStatus.OVERDUE,
        },
        data: { status: PayableStatus.PARTIALLY_PAID },
      }),
    ]);

    const dueStart = options?.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(options.dueDate)
      ? new Date(options.dueDate + 'T00:00:00+05:30')
      : null;
    if (options?.dueDate && (!dueStart || Number.isNaN(dueStart.getTime()) ||
        new Date(dueStart.getTime() + 330 * 60_000).toISOString().slice(0, 10) !== options.dueDate)) {
      throw new BadRequestException('Invalid due date');
    }
    const where: Prisma.CustomerPayableWhereInput = {
      ...(options?.q ? { customer: { OR: [
        { fullName: { contains: options.q, mode: 'insensitive' } },
        { mobile: { contains: options.q } },
      ] } } : {}),
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.openOnly ? {
        remainingAmount: { gt: 0 },
        status: { notIn: [PayableStatus.PAID, PayableStatus.CANCELLED, PayableStatus.REVERSED] },
        sourceTransaction: { status: { notIn: [TransactionStatus.REVERSED, TransactionStatus.CANCELLED, TransactionStatus.FAILED] } },
      } : {}),
      ...(options?.transactionType ? { sourceTransaction: {
        ...(options?.openOnly ? { status: { notIn: [TransactionStatus.REVERSED, TransactionStatus.CANCELLED, TransactionStatus.FAILED] } } : {}),
        transactionType: options.transactionType,
      } } : {}),
      ...(dueStart ? { dueAt: { gte: dueStart, lt: new Date(dueStart.getTime() + 86_400_000) } } : {}),
    };
    const allowedSort = new Set(['dueAt','createdAt','originalAmount','paidAmount','offsetAmount','remainingAmount','status']);
    const sortBy = allowedSort.has(options?.sortBy ?? '') ? options!.sortBy! : 'dueAt';
    const sortDir = options?.sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy = { [sortBy]: sortDir } as Prisma.CustomerPayableOrderByWithRelationInput;
    const include = {
      customer: {
        include: {
          bankAccounts: { where: { isActive: true } },
          upiAccounts: { where: { isActive: true } },
          cards: { where: { isActive: true } },
          beneficiaries: { where: { isActive: true }, include: { accounts: { where: { isActive: true } } } },
        },
      },
      paymentTerm: true,
      sourceTransaction: {
        include: {
          cardSwipe: { include: { customerCard: true } },
        },
      },
      payments: { orderBy: { paymentDate: 'desc' as const } },
      manualLedgerAllocations: {
        where: {
          customerLedgerEntry: {
            transaction: { status: { notIn: [TransactionStatus.CANCELLED, TransactionStatus.REVERSED] } },
          },
        },
        include: {
          customerLedgerEntry: {
            include: { financialAccount: true, transaction: { include: { charges: true } } },
          },
        },
        orderBy: { createdAt: 'desc' as const },
      },
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
    const { start: todayStart, end: todayEnd } = this.indiaDayRange();
    await this.prisma.$transaction([
      this.prisma.customerPayable.updateMany({
        where: {
          id,
          remainingAmount: { gt: 0 },
          dueAt: { lt: todayStart },
          status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] },
        },
        data: { status: PayableStatus.OVERDUE },
      }),
      this.prisma.customerPayable.updateMany({
        where: {
          id,
          remainingAmount: { gt: 0 },
          paidAmount: { lte: 0 },
          dueAt: { gte: todayStart, lt: todayEnd },
          status: PayableStatus.OVERDUE,
        },
        data: { status: PayableStatus.PENDING },
      }),
      this.prisma.customerPayable.updateMany({
        where: {
          id,
          remainingAmount: { gt: 0 },
          paidAmount: { gt: 0 },
          dueAt: { gte: todayStart, lt: todayEnd },
          status: PayableStatus.OVERDUE,
        },
        data: { status: PayableStatus.PARTIALLY_PAID },
      }),
    ]);
    const payable = await this.prisma.customerPayable.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            bankAccounts: { where: { isActive: true } },
            upiAccounts: { where: { isActive: true } },
            cards: { where: { isActive: true } },
            beneficiaries: { where: { isActive: true }, include: { accounts: { where: { isActive: true } } } },
          },
        },
        paymentTerm: true,
        sourceTransaction: {
          include: {
            cardSwipe: { include: { customerCard: true } },
            charges: true,
            commissions: true,
            providerSettlementSource: true,
          },
        },
        payments: {
          include: {
            sourceAccount: true,
            transaction: { include: { charges: true } },
          },
          orderBy: { paymentDate: 'desc' },
        },
        manualLedgerAllocations: {
          where: {
            customerLedgerEntry: {
              transaction: { status: { notIn: [TransactionStatus.CANCELLED, TransactionStatus.REVERSED] } },
            },
          },
          include: {
            customerLedgerEntry: {
              include: { financialAccount: true, transaction: { include: { charges: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        advanceOffsets: {
          include: {
            advanceEntry: { include: { financialAccount: true, customerCard: true, transaction: true } },
            transaction: true,
          },
          orderBy: { createdAt: 'desc' },
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

    const candidateAdvances = payable.sourceTransaction.transactionType === TransactionType.CARD_SWIPE
      ? await this.prisma.customerLedgerEntryDetail.findMany({
          where: {
            direction: 'PAY_OUT',
            receivableAmount: { gt: 0 },
            transaction: {
              customerId: payable.customerId,
              transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
              status: TransactionStatus.COMPLETED,
            },
          },
          include: {
            financialAccount: { select: { id: true, accountName: true, accountType: true } },
            customerCard: { select: { id: true, bankName: true, lastFourDigits: true } },
            transaction: { select: { id: true, transactionNumber: true, transactionAt: true } },
          },
          orderBy: { transaction: { transactionAt: 'asc' } },
        })
      : [];
    const unallocatedPayOutCandidates = payable.sourceTransaction.transactionType === TransactionType.CARD_SWIPE
      ? await this.prisma.customerLedgerEntryDetail.findMany({
          where: {
            direction: 'PAY_OUT',
            payableAmount: { gt: 0 },
            transaction: {
              customerId: payable.customerId,
              transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
              status: TransactionStatus.COMPLETED,
            },
          },
          include: {
            allocations: { select: { amount: true, targetType: true } },
            financialAccount: { select: { id: true, accountName: true, accountType: true } },
            customerCard: { select: { id: true, bankName: true, lastFourDigits: true } },
            transaction: { select: { id: true, transactionNumber: true, transactionAt: true } },
          },
          orderBy: { transaction: { transactionAt: 'asc' } },
        })
      : [];
    const availableUnallocatedPayOuts = unallocatedPayOutCandidates
      .filter(entry => !entry.customerCardId ||
        entry.customerCardId === payable.sourceTransaction.cardSwipe?.customerCardId)
      .map(entry => ({
        ...entry,
        remainingUnallocated: Math.round((
          Number(entry.payableAmount) -
          entry.allocations.filter(a => a.targetType === 'PAYABLE')
            .reduce((total, a) => total + Number(a.amount), 0)
        ) * 100) / 100,
      }))
      .filter(entry => entry.remainingUnallocated > 0.001);
    const availableAdvances = candidateAdvances
      .filter(advance => !advance.customerCardId ||
        advance.customerCardId === payable.sourceTransaction.cardSwipe?.customerCardId)
      .map(advance => ({
        ...advance,
        remainingAdvance: Math.round(
          (Number(advance.receivableAmount) - Number(advance.advanceAppliedAmount)) * 100,
        ) / 100,
      }))
      .filter(advance => advance.remainingAdvance > 0.001);

    return {
      ...payable,
      availableAdvances,
      availableUnallocatedPayOuts,
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
    actorRole: RoleName,
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
      const payable = await tx.customerPayable.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (!payable) throw new NotFoundException('Payable not found');
      if (
        payable.status === PayableStatus.PAID ||
        payable.status === PayableStatus.CANCELLED ||
        payable.status === PayableStatus.REVERSED
      ) {
        throw new BadRequestException('Payable is not open for payment');
      }

      // Never pay the same swipe again while a customer-level Pay Out has
      // already debited the payable ledger but remains unmatched.
      const swipe = await tx.cardSwipeDetail.findUnique({
        where: { transactionId: payable.sourceTransactionId },
        select: { customerCardId: true },
      });
      if (swipe) {
        const priorEntries = await tx.customerLedgerEntryDetail.findMany({
          where: {
            direction: 'PAY_OUT',
            AND: [
              { OR: [{ payableAmount: { gt: 0 } }, { receivableAmount: { gt: 0 } }] },
              { OR: [{ customerCardId: null }, { customerCardId: swipe.customerCardId }] },
            ],
            transaction: { customerId: payable.customerId,
              transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
              status: TransactionStatus.COMPLETED },
          },
          select: { id: true, payableAmount: true, receivableAmount: true, advanceAppliedAmount: true,
            allocations: { select: { targetType: true, amount: true } },
            transaction: { select: { transactionNumber: true } } },
        });
        const unmatched = priorEntries.find(entry =>
          Math.round(Number(entry.payableAmount) * 100) >
          entry.allocations.filter(a => a.targetType === 'PAYABLE')
            .reduce((n, a) => n + Math.round(Number(a.amount) * 100), 0) ||
          Math.round(Number(entry.receivableAmount) * 100) >
            Math.round(Number(entry.advanceAppliedAmount) * 100));
        if (unmatched) throw new BadRequestException(
          'A previous Pay Out (' + unmatched.transaction.transactionNumber +
          ') is recorded but not matched to this customer’s swipes. Match the recorded Pay Out first to avoid paying twice.'
        );
      }
      const remaining = Number(payable.remainingAmount);
      if (dto.amount > remaining + 0.001) {
        throw new BadRequestException('Payment exceeds remaining payable');
      }

      let destinationLabel = '';
      let destinationReference = '';
      let destinationDetails: Prisma.InputJsonValue;

      if (dto.destinationType === 'CASH') {
        destinationLabel = payable.customer.fullName + ' · Cash handover';
        destinationReference = 'Cash directly to customer';
        destinationDetails = {
          customerId: payable.customerId,
          customerName: payable.customer.fullName,
        };
      } else if (dto.destinationType === 'CUSTOMER_CARD') {
        if (!dto.destinationId) throw new BadRequestException('Select customer credit card');
        const card = await tx.customerCard.findFirst({
          where: { id: dto.destinationId, customerId: payable.customerId, isActive: true },
        });
        if (!card) throw new BadRequestException('Selected credit card does not belong to this customer or is inactive');
        destinationLabel = card.bankName + ' ••••' + card.lastFourDigits +
          (card.nickname ? ' · ' + card.nickname : '');
        destinationReference = 'Card ending ' + card.lastFourDigits;
        destinationDetails = {
          customerCardId: card.id, bankName: card.bankName, lastFourDigits: card.lastFourDigits,
          ...(card.nickname ? { nickname: card.nickname } : {}),
        };
      } else if (dto.destinationType === 'BENEFICIARY_ACCOUNT') {
        if (!dto.destinationId) throw new BadRequestException('Select a beneficiary account');
        const account = await tx.beneficiaryAccount.findFirst({
          where: { id: dto.destinationId, isActive: true, beneficiary: { customerId: payable.customerId, isActive: true } },
          include: { beneficiary: true },
        });
        if (!account) throw new BadRequestException('Beneficiary account not found for this customer');
        const masked = account.accountType === 'BANK'
          ? '••••' + (account.accountReference || '').replace(/\D/g, '').slice(-4)
          : account.upiId || account.mobileNumber || 'UPI';
        destinationLabel = account.beneficiary.beneficiaryName + ' · ' + (account.bankName || 'UPI') + ' ' + masked;
        destinationReference = masked;
        destinationDetails = {
          beneficiaryAccountId: account.id,
          beneficiaryName: account.beneficiary.beneficiaryName,
          bankName: account.bankName,
          accountType: account.accountType,
          maskedReference: masked,
        };
      } else if (dto.destinationType === 'OTHER_CARD' || dto.destinationType === 'OTHER') {
        const details = dto.destinationDetails?.trim();
        if (!details || details.length > 160) {
          throw new BadRequestException('Enter recipient and destination details (maximum 160 characters)');
        }
        if (dto.destinationType === 'OTHER_CARD' && /\d{12,19}/.test(details.replace(/[ -]/g, ''))) {
          throw new BadRequestException('Enter only the last four card digits, never the full card number');
        }
        destinationLabel = (dto.destinationType === 'OTHER_CARD' ? 'Other credit card · ' : '') + details;
        destinationReference = dto.destinationType === 'OTHER_CARD' ? 'Other card' : 'Other recipient';
        destinationDetails = { description: details };
      } else if (dto.destinationType === 'CUSTOMER_BANK') {
        if (!dto.destinationId) throw new BadRequestException('Select customer bank account');
        const bank = await tx.customerBankAccount.findFirst({
          where: { id: dto.destinationId, customerId: payable.customerId, isActive: true },
        });
        if (!bank) throw new BadRequestException('Selected bank account does not belong to this customer');
        destinationLabel = bank.accountHolderName + ' · ' + bank.bankName;
        destinationReference = bank.accountReference;
        destinationDetails = {
          customerBankAccountId: bank.id,
          accountHolderName: bank.accountHolderName,
          bankName: bank.bankName,
          accountReference: bank.accountReference,
          ifsc: bank.ifsc,
        };
      } else {
        if (!dto.destinationId) throw new BadRequestException('Select customer UPI account');
        const upi = await tx.customerUpiAccount.findFirst({
          where: { id: dto.destinationId, customerId: payable.customerId, isActive: true },
        });
        if (!upi) throw new BadRequestException('Selected UPI account does not belong to this customer');
        destinationLabel = upi.accountName + (upi.providerName ? ' · ' + upi.providerName : '');
        destinationReference = upi.upiId || upi.mobileNumber || upi.accountName;
        destinationDetails = {
          customerUpiAccountId: upi.id,
          accountName: upi.accountName,
          upiId: upi.upiId,
          mobileNumber: upi.mobileNumber,
          providerName: upi.providerName,
        };
      }

      await this.validation.lockAccount(tx, dto.sourceAccountId);
      const sourceAccount = await this.validation.liquidAsset(
        tx,
        dto.sourceAccountId,
        'Customer payout source',
      );
      if (
        actorRole === RoleName.STAFF &&
        sourceAccount.accountType === AccountType.CASH &&
        sourceAccount.accountName === 'Main Cash Reserve'
      ) {
        throw new BadRequestException('Main Cash Reserve is owner-only');
      }
      if (dto.destinationType === 'CASH' && sourceAccount.accountType !== AccountType.CASH) {
        throw new BadRequestException('Cash payout must be paid from a cash account');
      }
      if (dto.destinationType !== 'CASH' && sourceAccount.accountType === AccountType.CASH) {
        throw new BadRequestException('Bank or UPI payout cannot be paid directly from a cash account');
      }
      const configuredCharge = await this.payoutCharges.resolve(
        tx,
        sourceAccount,
        dto.amount,
      );
      const chargeAmount = configuredCharge
        ? configuredCharge.amount
        : Math.round(((dto.chargeAmount ?? 0) + Number.EPSILON) * 100) / 100;
      if (
        sourceAccount.accountType !== AccountType.PROVIDER_WALLET &&
        chargeAmount > 0
      ) {
        throw new BadRequestException('Payout charge is allowed only for wallet payouts');
      }
      if (sourceAccount.accountType === AccountType.CASH) {
        requireWholeRupeeCashPayout(sourceAccount.accountType, dto.amount);
        await this.validation.requireOpenCashDesk(
          tx,
          sourceAccount.id,
          'Customer cash payout',
          actorRole === RoleName.STAFF ? userId : undefined,
        );
      }
      await this.validation.ensureSufficientFunds(
        tx,
        sourceAccount,
        dto.amount + chargeAmount,
      );

      const payableLedger = await tx.ledgerAccount.findUnique({
        where: { ledgerCode: 'SYS-CUST-PAYABLE' },
      });
      const chargeLedgerCode = sourceAccount.accountType === AccountType.PROVIDER_WALLET
        ? 'SYS-PROVIDER-CHARGE'
        : 'SYS-BANK-CHARGE';
      const chargeLedger = chargeAmount > 0
        ? await tx.ledgerAccount.findUnique({ where: { ledgerCode: chargeLedgerCode } })
        : null;
      if (!payableLedger) throw new Error('Customer payable ledger missing');
      if (chargeAmount > 0 && !chargeLedger) throw new Error('Payout charge ledger missing');

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'PAY-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CUSTOMER_PAYOUT,
          transactionAt: new Date(),
          customerId: payable.customerId,
          grossAmount: new Prisma.Decimal(dto.amount + chargeAmount),
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
          destinationType: dto.destinationType,
          destinationLabel,
          destinationReference,
          destinationDetails,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          status: PaymentStatus.COMPLETED,
          createdById: userId,
        },
      });
      if (chargeAmount > 0) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType: 'PAYOUT',
            providerId: sourceAccount.providerId,
            sourceAccountId: sourceAccount.id,
            providerPayoutChargeRuleId: configuredCharge?.ruleId ?? null,
            calculationType:
              configuredCharge?.calculationType ?? 'FIXED',
            rate:
              configuredCharge
                ? new Prisma.Decimal(configuredCharge.rate)
                : null,
            amount: new Prisma.Decimal(chargeAmount),
            notes: sourceAccount.accountName + ' payout charge',
          },
        });
      }

      const paidAmount = Number(payable.paidAmount) + dto.amount;
      const remainingAmount = Math.max(0, remaining - dto.amount);
      const { start: todayStart } = this.indiaDayRange();
      const status = remainingAmount <= 0.001
        ? PayableStatus.PAID
        : payable.dueAt < todayStart
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

      const payoutEntries = [
        {
          ledgerAccountId: payableLedger.id,
          entryType: EntryType.DEBIT,
          amount: dto.amount,
          customerId: payable.customerId,
          payableId: payable.id,
        },
        ...(chargeAmount > 0 && chargeLedger ? [{
          ledgerAccountId: chargeLedger.id,
          entryType: EntryType.DEBIT,
          amount: chargeAmount,
          customerId: payable.customerId,
          payableId: payable.id,
          description: 'Customer payout charge expense',
        }] : []),
        {
          ledgerAccountId: sourceAccount.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: dto.amount + chargeAmount,
          customerId: payable.customerId,
          payableId: payable.id,
        },
      ];
      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        'Customer payable payment',
        payoutEntries,
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
            chargeAmount: chargeAmount.toString(),
          },
        },
      });

      return { transaction, payable: updated };
    });
  }

  /**
   * Link a previously posted Pay Out's *payable-classified* portion to a swipe.
   * The source journal already debited the customer payable and credited the
   * wallet/cash account. Matching is administrative only: NO second journal
   * entry, wallet debit, transfer, or provider charge.
   *
   * Unlike an advance offset, this also handles Pay Outs recorded after swipes.
   */
  async matchExistingPayOut(payableId: string, dto: CreateAdvanceOffsetDto, userId: string) {
    const amount = dto.amount;
    if (!Number.isFinite(amount) || amount <= 0 ||
        Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001) {
      throw new BadRequestException('Enter a valid amount in rupees and paise');
    }
    return this.prisma.$transaction(async tx => {
      const source = await tx.customerLedgerEntryDetail.findUnique({
        where: { id: dto.advanceEntryId },
        select: { transactionId: true },
      });
      if (!source) throw new NotFoundException('Recorded Pay Out not found');
      // Same serialization order as the existing advance-application workflow.
      await tx.$queryRawUnsafe('SELECT "id" FROM "Transaction" WHERE "id" = $1 FOR UPDATE', source.transactionId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE', payableId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerLedgerEntryDetail" WHERE "id" = $1 FOR UPDATE', dto.advanceEntryId);
      const payable = await tx.customerPayable.findUnique({
        where: { id: payableId },
        include: { sourceTransaction: { include: { cardSwipe: true } } },
      });
      if (!payable || payable.sourceTransaction.transactionType !== TransactionType.CARD_SWIPE ||
          !payable.sourceTransaction.cardSwipe ||
          payable.sourceTransaction.status !== TransactionStatus.COMPLETED ||
          (payable.status === PayableStatus.CANCELLED || payable.status === PayableStatus.REVERSED || payable.status === PayableStatus.PAID) ||
          Number(payable.remainingAmount) + 0.001 < amount) {
        throw new BadRequestException('Choose an open card swipe with enough payable remaining');
      }
      const payout = await tx.customerLedgerEntryDetail.findUnique({
        where: { id: dto.advanceEntryId },
        include: { transaction: true, allocations: true },
      });
      if (!payout || payout.direction !== 'PAY_OUT' ||
          payout.transaction.transactionType !== TransactionType.CUSTOMER_LEDGER_ENTRY ||
          payout.transaction.status !== TransactionStatus.COMPLETED ||
          payout.transaction.customerId !== payable.customerId ||
          (payout.customerCardId &&
            payout.customerCardId !== payable.sourceTransaction.cardSwipe.customerCardId)) {
        throw new BadRequestException('Recorded Pay Out must belong to this customer and card');
      }
      const allocatedCents = payout.allocations
        .filter(a => a.targetType === 'PAYABLE')
        .reduce((sum, a) => sum + Math.round(Number(a.amount) * 100), 0);
      const availableCents = Math.round(Number(payout.payableAmount) * 100) - allocatedCents;
      if (availableCents < Math.round(amount * 100)) {
        throw new BadRequestException('Recorded Pay Out has insufficient unallocated payable balance');
      }
      const amountCents = Math.round(amount * 100);
      const remainingCents = Math.round(Number(payable.remainingAmount) * 100) - amountCents;
      const { start: todayStart } = this.indiaDayRange();
      const allocation = await tx.customerLedgerAllocation.create({
        data: {
          customerLedgerEntryId: payout.id,
          targetType: 'PAYABLE',
          payableId,
          amount: new Prisma.Decimal(amountCents).div(100),
        },
      });
      const updated = await tx.customerPayable.update({
        where: { id: payableId },
        data: {
          paidAmount: { increment: new Prisma.Decimal(amountCents).div(100) },
          remainingAmount: new Prisma.Decimal(remainingCents).div(100),
          status: remainingCents === 0 ? PayableStatus.PAID
            : payable.dueAt < todayStart ? PayableStatus.OVERDUE : PayableStatus.PARTIALLY_PAID,
        },
      });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_PAYABLE', entityId: payableId,
          action: 'MATCH_EXISTING_PAYOUT',
          oldValues: {
            paidAmount: payable.paidAmount.toString(),
            remainingAmount: payable.remainingAmount.toString(),
            status: payable.status,
          },
          newValues: {
            paidAmount: updated.paidAmount.toString(),
            remainingAmount: updated.remainingAmount.toString(),
            status: updated.status,
            allocationId: allocation.id, sourcePayOutId: payout.id,
            sourceTransactionId: payout.transactionId,
            amount, noNewMoneyMovement: true,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_LEDGER_ENTRY', entityId: payout.id,
          action: 'ALLOCATE_EXISTING_PAY_OUT',
          newValues: { allocationId: allocation.id, payableId, amount, noNewMoneyMovement: true },
        },
      });
      return { payable: updated, allocation, sourceTransactionId: payout.transactionId };
    });
  }

  async reverseExistingPayOutMatch(payableId: string, allocationId: string, reason: string, userId: string) {
    if (!reason?.trim() || reason.trim().length < 3)
      throw new BadRequestException('Give a reversal reason');
    return this.prisma.$transaction(async tx => {
      const ref = await tx.customerLedgerAllocation.findFirst({
        where: { id: allocationId, payableId, targetType: 'PAYABLE' },
        include: { customerLedgerEntry: { select: { transactionId: true } } },
      });
      if (!ref) throw new NotFoundException('Pay Out allocation not found');
      await tx.$queryRawUnsafe('SELECT "id" FROM "Transaction" WHERE "id" = $1 FOR UPDATE', ref.customerLedgerEntry.transactionId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE', payableId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerLedgerEntryDetail" WHERE "id" = $1 FOR UPDATE', ref.customerLedgerEntryId);
      const payable = await tx.customerPayable.findUnique({ where: { id: payableId } });
      const allocation = await tx.customerLedgerAllocation.findUnique({ where: { id: allocationId } });
      if (!payable || !allocation ||
          allocation.customerLedgerEntryId !== ref.customerLedgerEntryId ||
          allocation.payableId !== payableId) throw new NotFoundException('Pay Out allocation not found');
      const cents = Math.round(Number(allocation.amount) * 100);
      if (Math.round(Number(payable.paidAmount) * 100) < cents ||
          (payable.status === PayableStatus.CANCELLED || payable.status === PayableStatus.REVERSED))
        throw new BadRequestException('Cannot reverse an inconsistent or cancelled payable');
      const { start: todayStart } = this.indiaDayRange();
      const remaining = Math.round(Number(payable.remainingAmount) * 100) + cents;
      const updated = await tx.customerPayable.update({
        where: { id: payableId },
        data: {
          paidAmount: { decrement: new Prisma.Decimal(cents).div(100) },
          remainingAmount: new Prisma.Decimal(remaining).div(100),
          status: payable.dueAt < todayStart ? PayableStatus.OVERDUE : PayableStatus.PARTIALLY_PAID,
        },
      });
      await tx.customerLedgerAllocation.delete({ where: { id: allocationId } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_PAYABLE', entityId: payableId,
          action: 'REVERSE_MATCHED_PAY_OUT', reason: reason.trim(),
          oldValues: { allocationId, amount: allocation.amount.toString(), paidAmount: payable.paidAmount.toString(),
            remainingAmount: payable.remainingAmount.toString(), status: payable.status,
            sourcePayOutId: allocation.customerLedgerEntryId },
          newValues: { paidAmount: updated.paidAmount.toString(),
            remainingAmount: updated.remainingAmount.toString(), status: updated.status,
            noNewMoneyMovement: true },
        },
      });
      return { payable: updated };
    });
  }

  // Earlier Pay Out already moved money. Only move receivable to payable now.
  async applyAdvance(payableId: string, dto: CreateAdvanceOffsetDto, userId: string, providedIdempotencyKey?: string) {
    const amount = dto.amount;
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001) {
      throw new BadRequestException('Enter a valid amount in rupees and paise');
    }
    const idempotencyKey = await this.idempotency.key(TransactionType.CUSTOMER_ADVANCE_OFFSET, userId,
      { payableId, ...dto }, providedIdempotencyKey);
    return this.prisma.$transaction(async tx => {
      // Serialize against a concurrent reversal of the earlier Pay Out.
      // Source transaction first, then target payable, then advance entry.
      const advanceRef = await tx.customerLedgerEntryDetail.findUnique({
        where: { id: dto.advanceEntryId }, select: { transactionId: true },
      });
      if (!advanceRef) throw new NotFoundException('Earlier Pay Out not found');
      await tx.$queryRawUnsafe('SELECT "id" FROM "Transaction" WHERE "id" = $1 FOR UPDATE', advanceRef.transactionId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE', payableId);
      const payable = await tx.customerPayable.findUnique({
        where: { id: payableId },
        include: { sourceTransaction: { include: { cardSwipe: true } } },
      });
      if (!payable) throw new NotFoundException('Payable not found');
      if (payable.sourceTransaction.transactionType !== TransactionType.CARD_SWIPE ||
          !payable.sourceTransaction.cardSwipe ||
          ['CANCELLED', 'REVERSED', 'PAID'].includes(payable.status) ||
          Number(payable.remainingAmount) + 0.001 < amount) {
        throw new BadRequestException('Choose an open card swipe with enough payable remaining');
      }
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerLedgerEntryDetail" WHERE "id" = $1 FOR UPDATE', dto.advanceEntryId);
      const advance = await tx.customerLedgerEntryDetail.findUnique({
        where: { id: dto.advanceEntryId }, include: { transaction: true },
      });
      if (!advance || advance.transaction.customerId !== payable.customerId ||
          advance.direction !== 'PAY_OUT' ||
          advance.transaction.transactionType !== TransactionType.CUSTOMER_LEDGER_ENTRY ||
          advance.transaction.status !== TransactionStatus.COMPLETED ||
          (advance.customerCardId && advance.customerCardId !== payable.sourceTransaction.cardSwipe.customerCardId)) {
        throw new BadRequestException('Select an unapplied Pay Out credit for this customer and card');
      }
      const available = Math.round((Number(advance.receivableAmount) - Number(advance.advanceAppliedAmount)) * 100) / 100;
      if (available + 0.001 < amount) throw new BadRequestException('Advance already used or has insufficient balance');
      const ledgers = await tx.ledgerAccount.findMany({
        where: { ledgerCode: { in: ['SYS-CUST-PAYABLE', 'SYS-CUST-RECEIVABLE'] } },
      });
      const payableLedger = ledgers.find(l => l.ledgerCode === 'SYS-CUST-PAYABLE');
      const receivableLedger = ledgers.find(l => l.ledgerCode === 'SYS-CUST-RECEIVABLE');
      if (!payableLedger || !receivableLedger) throw new Error('Customer balance ledgers missing');
      const now = new Date();
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'OFA-' + now.getTime().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
          transactionType: TransactionType.CUSTOMER_ADVANCE_OFFSET,
          transactionAt: now, customerId: payable.customerId,
          grossAmount: new Prisma.Decimal(amount), netAmount: new Prisma.Decimal(amount),
          status: TransactionStatus.COMPLETED, idempotencyKey,
          notes: dto.notes?.trim() || 'Earlier Pay Out applied to later card swipe',
          createdById: userId,
        },
      });
      const offset = await tx.customerAdvanceOffset.create({
        data: { payableId, advanceEntryId: advance.id, transactionId: transaction.id,
          amount: new Prisma.Decimal(amount), notes: dto.notes?.trim() || null, createdById: userId },
      });
      const remaining = Math.round((Number(payable.remainingAmount) - amount) * 100) / 100;
      const { start: todayStart } = this.indiaDayRange();
      const updated = await tx.customerPayable.update({
        where: { id: payableId },
        data: {
          offsetAmount: { increment: new Prisma.Decimal(amount) },
          remainingAmount: new Prisma.Decimal(Math.max(0, remaining)),
          status: remaining <= 0.001 ? PayableStatus.PAID :
            payable.dueAt < todayStart ? PayableStatus.OVERDUE : PayableStatus.PARTIALLY_PAID,
        },
      });
      await tx.customerLedgerEntryDetail.update({
        where: { id: advance.id },
        data: { advanceAppliedAmount: { increment: new Prisma.Decimal(amount) } },
      });
      await this.ledger.post(tx, transaction.id, userId, 'Match earlier customer Pay Out to card swipe', [
        { ledgerAccountId: payableLedger.id, entryType: EntryType.DEBIT, amount,
          customerId: payable.customerId, payableId, description: 'Card swipe settled with advance' },
        { ledgerAccountId: receivableLedger.id, entryType: EntryType.CREDIT, amount,
          customerId: payable.customerId, description: 'Earlier advance receivable cleared' },
      ]);
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_PAYABLE', entityId: payableId, action: 'ADVANCE_OFFSET',
          oldValues: { remainingAmount: payable.remainingAmount.toString(), offsetAmount: payable.offsetAmount.toString(), status: payable.status },
          newValues: { remainingAmount: updated.remainingAmount.toString(), offsetAmount: updated.offsetAmount.toString(), status: updated.status, advanceEntryId: advance.id, offsetId: offset.id, transactionId: transaction.id, amount },
        },
      });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_LEDGER_ENTRY', entityId: advance.id, action: 'APPLY_ADVANCE',
          oldValues: { advanceAppliedAmount: advance.advanceAppliedAmount.toString() },
          newValues: { advanceAppliedAmount: Number(advance.advanceAppliedAmount) + amount, payableId, offsetId: offset.id, transactionId: transaction.id },
        },
      });
      return { transaction, offset, payable: updated };
    });
  }

  async reverseAdvance(payableId: string, offsetId: string, reason: string, userId: string) {
    if (!reason?.trim() || reason.trim().length < 3) throw new BadRequestException('Give a reversal reason');
    return this.prisma.$transaction(async tx => {
      const source = await tx.customerAdvanceOffset.findFirst({
        where: { id: offsetId, payableId },
        include: { advanceEntry: { select: { transactionId: true } } },
      });
      if (!source) throw new NotFoundException('Advance adjustment not found');
      await tx.$queryRawUnsafe('SELECT "id" FROM "Transaction" WHERE "id" = $1 FOR UPDATE', source.advanceEntry.transactionId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE', payableId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "CustomerLedgerEntryDetail" WHERE "id" = $1 FOR UPDATE', source.advanceEntryId);
      const offset = await tx.customerAdvanceOffset.findUnique({
        where: { id: offsetId },
        include: {
          payable: true, advanceEntry: { include: { transaction: true } },
          transaction: { include: { journal: { include: { entries: true } } } },
        },
      });
      if (!offset || offset.reversedAt || !offset.transaction.journal ||
          ['CANCELLED', 'REVERSED'].includes(offset.payable.status) ||
          offset.advanceEntry.transaction.status !== TransactionStatus.COMPLETED) {
        throw new BadRequestException('Advance adjustment is not reversible');
      }
      const amount = Number(offset.amount);
      if (Number(offset.payable.offsetAmount) + 0.001 < amount ||
          Number(offset.advanceEntry.advanceAppliedAmount) + 0.001 < amount) {
        throw new BadRequestException('Advance balances inconsistent');
      }
      const now = new Date();
      const reversal = await tx.transaction.create({
        data: {
          transactionNumber: 'OFR-' + now.getTime().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
          transactionType: TransactionType.REVERSAL,
          transactionAt: now, customerId: offset.payable.customerId,
          grossAmount: offset.amount, netAmount: offset.amount,
          status: TransactionStatus.COMPLETED, reversedTransactionId: offset.transactionId,
          referenceNumber: offset.transaction.transactionNumber,
          reversalReason: reason.trim(), createdById: userId,
        },
      });
      await this.ledger.post(tx, reversal.id, userId, 'Reverse customer advance matching',
        offset.transaction.journal.entries.map(entry => ({
          ledgerAccountId: entry.ledgerAccountId,
          entryType: entry.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT,
          amount: Number(entry.amount), customerId: entry.customerId ?? undefined,
          payableId: entry.payableId ?? undefined, receivableId: entry.receivableId ?? undefined,
          description: 'Reversal: ' + reason.trim(),
        })),
      );
      const { start: todayStart } = this.indiaDayRange(now);
      const remaining = Number(offset.payable.remainingAmount) + amount;
      const adjusted = Number(offset.payable.offsetAmount) - amount;
      const updated = await tx.customerPayable.update({
        where: { id: payableId },
        data: {
          offsetAmount: new Prisma.Decimal(adjusted),
          remainingAmount: new Prisma.Decimal(remaining),
          status: offset.payable.dueAt < todayStart ? PayableStatus.OVERDUE :
            Number(offset.payable.paidAmount) + adjusted > 0.001 ? PayableStatus.PARTIALLY_PAID : PayableStatus.PENDING,
        },
      });
      await tx.customerLedgerEntryDetail.update({
        where: { id: offset.advanceEntryId },
        data: { advanceAppliedAmount: { decrement: new Prisma.Decimal(amount) } },
      });
      await tx.customerAdvanceOffset.update({
        where: { id: offsetId },
        data: { reversedAt: now, reversedById: userId, reversalTransactionId: reversal.id },
      });
      await tx.transaction.update({
        where: { id: offset.transactionId },
        data: { status: TransactionStatus.REVERSED, reversalReason: reason.trim(), updatedById: userId },
      });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_PAYABLE', entityId: payableId,
          action: 'REVERSE_ADVANCE_OFFSET', reason: reason.trim(),
          oldValues: { remainingAmount: offset.payable.remainingAmount.toString(), offsetAmount: offset.payable.offsetAmount.toString() },
          newValues: { remainingAmount: updated.remainingAmount.toString(), offsetAmount: updated.offsetAmount.toString(), reversalTransactionId: reversal.id, offsetId },
        },
      });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_LEDGER_ENTRY', entityId: offset.advanceEntryId,
          action: 'REVERSE_ADVANCE_OFFSET', reason: reason.trim(),
          oldValues: { advanceAppliedAmount: offset.advanceEntry.advanceAppliedAmount.toString() },
          newValues: { advanceAppliedAmount: Number(offset.advanceEntry.advanceAppliedAmount) - amount, reversalTransactionId: reversal.id, offsetId },
        },
      });
      return { reversal, payable: updated };
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
      if (payable.sourceTransaction.transactionType === TransactionType.CARD_DUE_RECOVERY) {
        throw new BadRequestException(
          'Reverse the Card Due recovery instead of cancelling its excess customer credit payable',
        );
      }
      if (payable.status === PayableStatus.CANCELLED || payable.status === PayableStatus.REVERSED) {
        throw new BadRequestException('Payable is already cancelled or reversed');
      }
      if (Number(payable.paidAmount) > 0 || Number(payable.offsetAmount) > 0) {
        throw new BadRequestException('Reverse all customer payouts and advance offsets before cancelling this payable');
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

      await this.validation.requireOpenCashDeskForLedgerEntries(
        tx,
        payable.sourceTransaction.journal.entries,
        'Cash payable cancellation',
      );

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
