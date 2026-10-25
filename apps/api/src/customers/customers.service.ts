import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountType, CustomerType, EntryType, PayableStatus, PaymentStatus, Prisma, RoleName, TransactionStatus, TransactionType } from '@prisma/client';
import { FinancialValidationService, requireWholeRupeeCashPayout } from '../finance/financial-validation.service.js';
import { IdempotencyService } from '../finance/idempotency.service.js';
import { ProviderPayoutChargeService } from '../finance/provider-payout-charge.service.js';
import { JournalEntry, LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { findCustomerIdsForSearch } from './customer-search-filter.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { CreateQuickCustomerCardDto } from './dto/create-quick-customer-card.dto.js';
import { CreateCardDto } from './dto/create-card.dto.js';
import { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import { CreateUpiAccountDto } from './dto/create-upi-account.dto.js';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto.js';
import { CreateBeneficiaryAccountDto } from './dto/create-beneficiary-account.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { UpdateCardDto } from './dto/update-card.dto.js';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto.js';
import { UpdateUpiAccountDto } from './dto/update-upi-account.dto.js';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto.js';
import { UpdateBeneficiaryAccountDto } from './dto/update-beneficiary-account.dto.js';
import { CreateCustomerAepsAccountDto, UpdateCustomerAepsAccountDto } from './dto/customer-aeps-account.dto.js';
import { CreateServiceProfileDto } from './dto/create-service-profile.dto.js';
import { CreateCustomerEsevaiServiceDto, UpdateCustomerEsevaiServiceDto } from './dto/customer-esevai-service.dto.js';
import { UpdateServiceProfileDto } from './dto/update-service-profile.dto.js';
import { CreateCustomerLedgerEntryDto } from './dto/create-customer-ledger-entry.dto.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly validation: FinancialValidationService,
    private readonly idempotency: IdempotencyService,
    private readonly payoutCharges: ProviderPayoutChargeService,
  ) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async cardLedgerBalance(
    tx: Prisma.TransactionClient,
    customerId: string,
    cardId?: string,
  ) {
    const activeTransaction = {
      status: {
        notIn: [TransactionStatus.CANCELLED, TransactionStatus.REVERSED],
      },
    };
    const cardWhere = cardId
      ? { customerId, id: cardId }
      : { customerId };
    const [swipes, clearings, manualEntries] = await Promise.all([
      tx.cardSwipeDetail.findMany({
        where: {
          customerCard: cardWhere,
          transaction: activeTransaction,
        },
        select: {
          customerPayableAmount: true,
          transaction: {
            select: {
              payable: {
                select: {
                  payments: {
                    where: { status: PaymentStatus.COMPLETED },
                    select: { amount: true },
                  },
                },
              },
            },
          },
        },
      }),
      tx.cardDueClearingDetail.findMany({
        where: {
          customerCard: cardWhere,
          transaction: activeTransaction,
        },
        select: {
          dueAmount: true,
          recoveries: {
            where: { transaction: activeTransaction },
            select: {
              swipeAmount: true,
              transaction: {
                select: {
                  payable: {
                    select: {
                      payments: {
                        where: { status: PaymentStatus.COMPLETED },
                        select: { amount: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      tx.customerLedgerEntryDetail.findMany({
        where: {
          transaction: { customerId, ...activeTransaction },
        },
        select: {
          customerCardId: true,
          direction: true,
          amount: true,
          allocations: {
            select: {
              amount: true,
              payable: {
                select: {
                  sourceTransaction: {
                    select: {
                      cardSwipe: { select: { customerCardId: true } },
                      cardDueRecovery: {
                        select: { clearing: { select: { customerCardId: true } } },
                      },
                    },
                  },
                },
              },
              cardDueClearing: { select: { customerCardId: true } },
            },
          },
        },
      }),
    ]);

    let credit = 0;
    let debit = 0;
    for (const swipe of swipes) {
      credit += Number(swipe.customerPayableAmount);
      for (const payment of swipe.transaction.payable?.payments ?? []) {
        debit += Number(payment.amount);
      }
    }
    for (const clearing of clearings) {
      debit += Number(clearing.dueAmount);
      for (const recovery of clearing.recoveries) {
        credit += Number(recovery.swipeAmount);
        for (const payment of recovery.transaction.payable?.payments ?? []) {
          debit += Number(payment.amount);
        }
      }
    }
    for (const entry of manualEntries) {
      let entryAmount = Number(entry.amount);
      if (cardId && entry.customerCardId !== cardId) {
        if (entry.customerCardId) continue;
        entryAmount = this.money(entry.allocations.reduce((sum, allocation) => {
          const targetCardId =
            allocation.cardDueClearing?.customerCardId ??
            allocation.payable?.sourceTransaction.cardSwipe?.customerCardId ??
            allocation.payable?.sourceTransaction.cardDueRecovery?.clearing.customerCardId ??
            null;
          return targetCardId === cardId ? sum + Number(allocation.amount) : sum;
        }, 0));
        if (entryAmount <= 0.001) continue;
      }
      if (entry.direction === 'PAY_IN') credit += entryAmount;
      else debit += entryAmount;
    }
    return this.money(credit - debit);
  }

  async list(options?: {
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    includeInactive?: boolean;
  }) {
    const startedAt = Date.now();
    const activeOnly: Prisma.CustomerWhereInput = options?.includeInactive ? {} : { isActive: true };
    const search = options?.search?.trim();
    const matchingIds = search
      ? await findCustomerIdsForSearch(this.prisma, search, !!options?.includeInactive)
      : undefined;
    const where: Prisma.CustomerWhereInput = {
      ...activeOnly,
      ...(matchingIds ? { id: { in: matchingIds } } : {}),
    };
    const allowedSort = new Set(['createdAt','fullName','customerCode','customerType','mobile']);
    const sortBy = allowedSort.has(options?.sortBy ?? '') ? options!.sortBy! : 'createdAt';
    const sortDir = options?.sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy]: sortDir } as Prisma.CustomerOrderByWithRelationInput;
    const include = {
      cards: true,
      customerTypeConfig: { select: { id: true, name: true, isActive: true } },
      bankAccounts: true,
      upiAccounts: true,
      beneficiaries: { include: { accounts: true } },
    };

    if (!options?.page) {
      return this.prisma.customer.findMany({ where, include, orderBy });
    }

    const page = Math.max(1, options.page);
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
    // Paginated searches only need the columns shown in the customer list.
    // Avoid eagerly loading every beneficiary, bank and UPI account for each keystroke.
    // The unpaged API retains its existing richer response for other screens.
    const [items,total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: {
          id: true, customerCode: true, customerType: true, fullName: true,
          mobile: true, ebNumber: true, notes: true, isActive: true,
          customerTypeId: true,
          customerTypeConfig: { select: { id: true, name: true, isActive: true } },
          cards: { select: { id: true, bankName: true, lastFourDigits: true, isActive: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > 500) {
      Logger.warn(`Slow customer list: ${elapsedMs}ms; terms=${search?.split(/\\s+/).length ?? 0}; pageSize=${pageSize}`, CustomersService.name);
    }
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

  async getQuickEntryProfile(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true, customerCode: true, fullName: true, mobile: true, ebNumber: true,
        cards: { where: { isActive: true, cardType: { in: ['DEBIT', 'ATM', 'DEBIT_CARD'] } }, select: { id: true, bankName: true, lastFourDigits: true, nickname: true }, orderBy: { updatedAt: 'desc' } },
        aepsAccounts: {
          where: { isActive: true },
          select: { id: true, bankName: true, holderName: true, prNumber: true, aadhaarLastSix: true },
          orderBy: { updatedAt: 'desc' },
        },
        bankAccounts: {
          where: { isActive: true },
          select: { id: true, accountHolderName: true, bankName: true, accountReference: true, ifsc: true },
          orderBy: { updatedAt: 'desc' },
        },
        upiAccounts: {
          where: { isActive: true },
          select: { id: true, accountName: true, upiId: true, mobileNumber: true, providerName: true },
          orderBy: { updatedAt: 'desc' },
        },
        beneficiaries: {
          where: { isActive: true },
          select: {
            id: true, beneficiaryName: true,
            accounts: {
              where: { isActive: true },
              select: { id: true, accountType: true, bankName: true, accountReference: true, ifsc: true, upiId: true, mobileNumber: true },
              orderBy: { updatedAt: 'desc' },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
        serviceProfiles: {
          where: { isActive: true },
          select: { id: true, serviceName: true, nickname: true, ownerName: true, providerName: true, referenceNumber: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const recent = await this.prisma.transaction.findMany({
      where: { customerId: id, status: TransactionStatus.COMPLETED },
      orderBy: { transactionAt: 'desc' },
      take: 50,
      select: {
        transactionAt: true,
        quickCashTransfer: {
          select: {
            direction: true, purpose: true, serviceName: true,
            beneficiaryMode: true, beneficiaryDetails: true,
            serviceProfileId: true, serviceReferenceLabel: true,
            serviceProviderName: true, serviceReferenceNumber: true,
          },
        },
        cashTransfer: {
          select: {
            customerBankAccount: { select: { accountHolderName: true, bankName: true, accountReference: true, ifsc: true } },
            customerUpiAccount: { select: { accountName: true, upiId: true, mobileNumber: true, providerName: true } },
            beneficiary: { select: { beneficiaryName: true } },
            beneficiaryAccount: { select: { accountType: true, bankName: true, accountReference: true, ifsc: true, upiId: true, mobileNumber: true } },
          },
        },
      },
    });

    const bankSignature = (holder: string, account: string, ifsc?: string | null) =>
      'BANK|' + holder.trim().toLowerCase() + '|' + account.replace(/\s/g, '').toLowerCase() + '|' + (ifsc ?? '').trim().toLowerCase();
    const upiSignature = (value: string) => 'UPI|' + value.trim().toLowerCase();
    const mask = (value: string) => value ? '•••• ' + value.replace(/\s/g, '').slice(-4) : '';
    const parseBank = (value?: string | null) => {
      if (!value) return null;
      try {
        const parsed = JSON.parse(value) as { accountHolder?: string; accountNumber?: string; ifsc?: string };
        if (!parsed.accountNumber) return null;
        return { holder: parsed.accountHolder ?? '', account: parsed.accountNumber, ifsc: parsed.ifsc ?? '' };
      } catch {
        return null;
      }
    };

    type Destination = {
      key: string; signature: string; source: 'SAVED' | 'RECENT'; mode: 'UPI' | 'BANK';
      title: string; subtitle: string; upi?: string; accountHolder?: string; accountNumber?: string; ifsc?: string;
      lastUsedAt?: Date; useCount: number;
    };

    const saved: Destination[] = [];
    for (const item of customer.upiAccounts) {
      const value = item.upiId || item.mobileNumber || '';
      if (!value) continue;
      saved.push({
        key: 'saved:upi:' + item.id, signature: upiSignature(value), source: 'SAVED', mode: 'UPI',
        title: item.accountName || 'My UPI', subtitle: [value, item.providerName].filter(Boolean).join(' · '),
        upi: value, useCount: 0,
      });
    }
    for (const item of customer.bankAccounts) {
      saved.push({
        key: 'saved:bank:' + item.id, signature: bankSignature(item.accountHolderName, item.accountReference, item.ifsc), source: 'SAVED', mode: 'BANK',
        title: item.accountHolderName || item.bankName, subtitle: [item.bankName, mask(item.accountReference), item.ifsc].filter(Boolean).join(' · '),
        accountHolder: item.accountHolderName, accountNumber: item.accountReference, ifsc: item.ifsc ?? '', useCount: 0,
      });
    }
    for (const beneficiary of customer.beneficiaries) {
      for (const account of beneficiary.accounts) {
        if (account.accountType === 'BANK' && account.accountReference) {
          saved.push({
            key: 'saved:beneficiary:' + account.id, signature: bankSignature(beneficiary.beneficiaryName, account.accountReference, account.ifsc), source: 'SAVED', mode: 'BANK',
            title: beneficiary.beneficiaryName, subtitle: [account.bankName, mask(account.accountReference), account.ifsc].filter(Boolean).join(' · '),
            accountHolder: beneficiary.beneficiaryName, accountNumber: account.accountReference, ifsc: account.ifsc ?? '', useCount: 0,
          });
        } else {
          const value = account.upiId || account.mobileNumber || '';
          if (!value) continue;
          saved.push({
            key: 'saved:beneficiary:' + account.id, signature: upiSignature(value), source: 'SAVED', mode: 'UPI',
            title: beneficiary.beneficiaryName, subtitle: value, upi: value, useCount: 0,
          });
        }
      }
    }

    const usage = new Map<string, Destination>();
    const serviceUsage = new Map<string, { lastUsedAt: Date; useCount: number; serviceName: string; nickname?: string; providerName?: string; referenceNumber: string }>();
    for (const row of recent) {
      const quick = row.quickCashTransfer;
      let candidate: Destination | null = null;
      if (quick?.direction === 'IN' && quick.purpose === 'TRANSFER' && quick.beneficiaryDetails) {
        if (quick.beneficiaryMode === 'BANK') {
          const bank = parseBank(quick.beneficiaryDetails);
          if (bank) candidate = {
            key: '', signature: bankSignature(bank.holder, bank.account, bank.ifsc), source: 'RECENT', mode: 'BANK',
            title: bank.holder || 'Bank beneficiary', subtitle: [mask(bank.account), bank.ifsc].filter(Boolean).join(' · '),
            accountHolder: bank.holder, accountNumber: bank.account, ifsc: bank.ifsc, useCount: 0,
          };
        } else {
          candidate = {
            key: '', signature: upiSignature(quick.beneficiaryDetails), source: 'RECENT', mode: 'UPI',
            title: 'UPI beneficiary', subtitle: quick.beneficiaryDetails, upi: quick.beneficiaryDetails, useCount: 0,
          };
        }
      } else if (row.cashTransfer) {
        const detail = row.cashTransfer;
        if (detail.beneficiaryAccount?.accountType === 'BANK' && detail.beneficiaryAccount.accountReference) {
          candidate = {
            key: '', signature: bankSignature(detail.beneficiary?.beneficiaryName ?? '', detail.beneficiaryAccount.accountReference, detail.beneficiaryAccount.ifsc),
            source: 'RECENT', mode: 'BANK', title: detail.beneficiary?.beneficiaryName || 'Bank beneficiary',
            subtitle: [detail.beneficiaryAccount.bankName, mask(detail.beneficiaryAccount.accountReference), detail.beneficiaryAccount.ifsc].filter(Boolean).join(' · '),
            accountHolder: detail.beneficiary?.beneficiaryName ?? '', accountNumber: detail.beneficiaryAccount.accountReference, ifsc: detail.beneficiaryAccount.ifsc ?? '', useCount: 0,
          };
        } else if (detail.beneficiaryAccount) {
          const value = detail.beneficiaryAccount.upiId || detail.beneficiaryAccount.mobileNumber || '';
          if (value) candidate = {
            key: '', signature: upiSignature(value), source: 'RECENT', mode: 'UPI',
            title: detail.beneficiary?.beneficiaryName || 'UPI beneficiary', subtitle: value, upi: value, useCount: 0,
          };
        } else if (detail.customerBankAccount) {
          candidate = {
            key: '', signature: bankSignature(detail.customerBankAccount.accountHolderName, detail.customerBankAccount.accountReference, detail.customerBankAccount.ifsc),
            source: 'RECENT', mode: 'BANK', title: detail.customerBankAccount.accountHolderName,
            subtitle: [detail.customerBankAccount.bankName, mask(detail.customerBankAccount.accountReference), detail.customerBankAccount.ifsc].filter(Boolean).join(' · '),
            accountHolder: detail.customerBankAccount.accountHolderName, accountNumber: detail.customerBankAccount.accountReference, ifsc: detail.customerBankAccount.ifsc ?? '', useCount: 0,
          };
        } else if (detail.customerUpiAccount) {
          const value = detail.customerUpiAccount.upiId || detail.customerUpiAccount.mobileNumber || '';
          if (value) candidate = {
            key: '', signature: upiSignature(value), source: 'RECENT', mode: 'UPI', title: detail.customerUpiAccount.accountName,
            subtitle: [value, detail.customerUpiAccount.providerName].filter(Boolean).join(' · '), upi: value, useCount: 0,
          };
        }
      }
      if (candidate) {
        const existing = usage.get(candidate.signature);
        if (existing) existing.useCount += 1;
        else usage.set(candidate.signature, { ...candidate, key: 'recent:' + candidate.signature, lastUsedAt: row.transactionAt, useCount: 1 });
      }

      if (quick?.purpose === 'SERVICE' && quick.serviceName && quick.serviceReferenceNumber) {
        const signature = quick.serviceName.trim().toLowerCase() + '|' + quick.serviceReferenceNumber.trim().toLowerCase();
        const existing = serviceUsage.get(signature);
        if (existing) existing.useCount += 1;
        else serviceUsage.set(signature, {
          lastUsedAt: row.transactionAt, useCount: 1, serviceName: quick.serviceName,
          nickname: quick.serviceReferenceLabel ?? undefined, providerName: quick.serviceProviderName ?? undefined,
          referenceNumber: quick.serviceReferenceNumber,
        });
      }
    }

    const latestSignature = [...usage.values()].sort((a,b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0))[0]?.signature;
    const savedSignatures = new Set(saved.map((item) => item.signature));
    for (const item of saved) {
      const historical = usage.get(item.signature);
      if (historical) { item.lastUsedAt = historical.lastUsedAt; item.useCount = historical.useCount; }
    }
    saved.sort((a,b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0));
    const recentDestinations = [...usage.values()]
      .filter((item) => !savedSignatures.has(item.signature))
      .sort((a,b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0))
      .slice(0, 8);

    const serviceProfiles = customer.serviceProfiles.map((item) => {
      const signature = item.serviceName.trim().toLowerCase() + '|' + item.referenceNumber.trim().toLowerCase();
      const historical = serviceUsage.get(signature);
      return { ...item, lastUsedAt: historical?.lastUsedAt ?? null, useCount: historical?.useCount ?? 0 };
    }).sort((a,b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0));
    const serviceProfileSignatures = new Set(serviceProfiles.map((item) => item.serviceName.trim().toLowerCase() + '|' + item.referenceNumber.trim().toLowerCase()));
    const recentServiceReferences = [...serviceUsage.entries()]
      .filter(([signature]) => !serviceProfileSignatures.has(signature))
      .map(([signature,item]) => ({ key: 'recent-service:' + signature, ...item }))
      .sort((a,b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
      .slice(0, 8);

    const aepsIds = customer.aepsAccounts.map(item => item.id);
    const aepsHistory = aepsIds.length ? await this.prisma.quickCashTransferDetail.findMany({
      where: {
        customerAepsAccountId: { in: aepsIds }, cashOutType: 'AEPS', aadhaarLastFour: { not: null },
        transaction: { customerId: id, status: { in: [TransactionStatus.PENDING, TransactionStatus.COMPLETED] } },
      },
      select: { customerAepsAccountId: true, aadhaarLastFour: true },
      orderBy: { createdAt: 'desc' }, take: 100,
    }) : [];
    const detailedAepsHistory = aepsIds.length ? await this.prisma.aepsDetail.findMany({
      where: {
        customerAepsAccountId: { in: aepsIds },
        transaction: { customerId: id, status: { in: [TransactionStatus.PENDING, TransactionStatus.COMPLETED] } },
      },
      select: { customerAepsAccountId: true, aadhaarLastFour: true },
      orderBy: { createdAt: 'desc' }, take: 100,
    }) : [];
    const recentAadhaarByAeps = new Map<string, string>();
    for (const item of [...aepsHistory, ...detailedAepsHistory]) {
      if (item.customerAepsAccountId && item.aadhaarLastFour &&
          /^\d{4}$/.test(item.aadhaarLastFour) && !recentAadhaarByAeps.has(item.customerAepsAccountId)) {
        recentAadhaarByAeps.set(item.customerAepsAccountId, item.aadhaarLastFour);
      }
    }

    return {
      customer: { id: customer.id, customerCode: customer.customerCode, fullName: customer.fullName, mobile: customer.mobile, ebNumber: customer.ebNumber },
      savedDestinations: saved.map(({ signature, ...item }) => ({ ...item, isLastUsed: signature === latestSignature })),
      recentDestinations: recentDestinations.map(({ signature, ...item }) => ({ ...item, isLastUsed: signature === latestSignature })),
      serviceProfiles,
      recentServiceReferences,
      cards: customer.cards,
      aepsAccounts: customer.aepsAccounts.map(item=>({
        id:item.id, bankName:item.bankName, holderName:item.holderName,
        prNumberLastFour:item.prNumber?.slice(-4)||null,
        // Only a previously recorded Aadhaar suffix, never a suffix of the PR number.
        aadhaarLastFour: recentAadhaarByAeps.get(item.id) ||
          (/^\d{6}$/.test(item.aadhaarLastSix || '') ? item.aadhaarLastSix!.slice(-4) : null),
      })),
    };
  }

  private checkAepsAccount(bankName: string, holderName: string, prNumber: string | null) {
    if (!bankName || !holderName || bankName.length > 150 || holderName.length > 150)
      throw new BadRequestException('Bank and account holder name are required (maximum 150 characters).');
    if (!prNumber || !/^\d{12}$/.test(prNumber))
      throw new BadRequestException('PR Number must contain exactly 12 digits.');
  }

  addAepsAccount(customerId: string, dto: CreateCustomerAepsAccountDto, userId: string) {
    const bankName = dto.bankName.trim();
    const holderName = dto.holderName.trim();
    const prNumber = dto.prNumber.trim();
    this.checkAepsAccount(bankName, holderName, prNumber);
    return this.prisma.$transaction(async tx => {
      if (!await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } }))
        throw new NotFoundException('Customer not found');
      const item = await tx.customerAepsAccount.create({
        data: { customerId, bankName, holderName, prNumber },
      });
      await tx.auditLog.create({
        data: { userId, entityType: 'CUSTOMER_AEPS_ACCOUNT', entityId: item.id, action: 'CREATE',
          newValues: { customerId, bankName, holderName, prNumberSaved: true } },
      });
      return item;
    });
  }

  updateAepsAccount(id: string, dto: UpdateCustomerAepsAccountDto, userId: string) {
    return this.prisma.$transaction(async tx => {
      const old = await tx.customerAepsAccount.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('AEPS account not found');
      const bankName = dto.bankName?.trim() ?? old.bankName;
      const holderName = dto.holderName?.trim() ?? old.holderName;
      const prNumber = dto.prNumber?.trim() ?? old.prNumber;
      this.checkAepsAccount(bankName, holderName, prNumber);
      const item = await tx.customerAepsAccount.update({ where: { id },
        data: { bankName, holderName, prNumber } });
      await tx.auditLog.create({
        data: { userId, entityType: 'CUSTOMER_AEPS_ACCOUNT', entityId: id, action: 'UPDATE',
          oldValues: { bankName: old.bankName, holderName: old.holderName },
          newValues: { bankName, holderName, prNumberChanged: old.prNumber !== prNumber } },
      });
      return item;
    });
  }

  setAepsAccountActive(id: string, isActive: boolean, userId: string) {
    return this.prisma.$transaction(async tx => {
      const old = await tx.customerAepsAccount.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('AEPS account not found');
      const item = await tx.customerAepsAccount.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({ data: { userId, entityType: 'CUSTOMER_AEPS_ACCOUNT',
        entityId: id, action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
        oldValues: { isActive: old.isActive }, newValues: { isActive } } });
      return item;
    });
  }

  private checkEsevaiService(esevaiName: string, serviceName: string) {
    if (!esevaiName || !serviceName || esevaiName.length > 150 || serviceName.length > 150)
      throw new BadRequestException('E-Sevai name and service are required (maximum 150 characters each).');
  }

  addEsevaiService(customerId: string, dto: CreateCustomerEsevaiServiceDto, userId: string) {
    const esevaiName = dto.esevaiName.trim();
    const serviceName = dto.serviceName.trim();
    this.checkEsevaiService(esevaiName, serviceName);
    return this.prisma.$transaction(async tx => {
      if (!await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } }))
        throw new NotFoundException('Customer not found');
      const item = await tx.customerEsevaiService.create({ data: { customerId, esevaiName, serviceName } });
      await tx.auditLog.create({ data: {
        userId, entityType: 'CUSTOMER_ESEVAI_SERVICE', entityId: item.id, action: 'CREATE',
        newValues: { customerId, esevaiName, serviceName },
      } });
      return item;
    });
  }

  updateEsevaiService(id: string, dto: UpdateCustomerEsevaiServiceDto, userId: string) {
    return this.prisma.$transaction(async tx => {
      const old = await tx.customerEsevaiService.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('E-Sevai service not found');
      const esevaiName = dto.esevaiName?.trim() ?? old.esevaiName;
      const serviceName = dto.serviceName?.trim() ?? old.serviceName;
      this.checkEsevaiService(esevaiName, serviceName);
      const item = await tx.customerEsevaiService.update({ where: { id }, data: { esevaiName, serviceName } });
      await tx.auditLog.create({ data: {
        userId, entityType: 'CUSTOMER_ESEVAI_SERVICE', entityId: id, action: 'UPDATE',
        oldValues: { esevaiName: old.esevaiName, serviceName: old.serviceName },
        newValues: { esevaiName, serviceName },
      } });
      return item;
    });
  }

  setEsevaiServiceActive(id: string, isActive: boolean, userId: string) {
    return this.prisma.$transaction(async tx => {
      const old = await tx.customerEsevaiService.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('E-Sevai service not found');
      const item = await tx.customerEsevaiService.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({ data: {
        userId, entityType: 'CUSTOMER_ESEVAI_SERVICE', entityId: id,
        action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
        oldValues: { isActive: old.isActive }, newValues: { isActive },
      } });
      return item;
    });
  }

  addServiceProfile(customerId: string, dto: CreateServiceProfileDto, userId: string) {
    const serviceName = dto.serviceName.trim();
    const referenceNumber = dto.referenceNumber.trim();
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, ebNumber: true } });
      if (!customer) throw new NotFoundException('Customer not found');
      if (serviceName === 'Eb Bill' && (referenceNumber.length > 50 || (dto.nickname?.length ?? 0) > 80 || (dto.ownerName?.length ?? 0) > 150))
        throw new BadRequestException('EB number must be at most 50 characters, connection name 80, and owner name 150.');
      const item = await tx.customerServiceProfile.upsert({
        where: { customerId_serviceName_referenceNumber: { customerId, serviceName, referenceNumber } },
        create: {
          customerId, serviceName, referenceNumber,
          nickname: dto.nickname?.trim() || null,
          ownerName: serviceName === 'Eb Bill' ? dto.ownerName?.trim() || null : null,
          providerName: dto.providerName?.trim() || null,
        },
        update: {
          nickname: dto.nickname?.trim() || null,
          ...(serviceName === 'Eb Bill' && dto.ownerName !== undefined ? { ownerName: dto.ownerName.trim() || null } : {}),
          providerName: dto.providerName?.trim() || null,
          isActive: true,
        },
      });
      if (serviceName === 'Eb Bill' && !customer.ebNumber) await tx.customer.update({ where: { id: customerId }, data: { ebNumber: referenceNumber } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_SERVICE_PROFILE', entityId: item.id, action: 'UPSERT',
          newValues: { customerId, serviceName, referenceNumber, nickname: item.nickname, ownerName: item.ownerName, providerName: item.providerName },
        },
      });
      return item;
    });
  }

  async updateEbServiceProfile(id: string, dto: UpdateServiceProfileDto, userId: string) {
    return this.prisma.$transaction(async tx => {
      const old = await tx.customerServiceProfile.findUnique({ where: { id } });
      if (!old || old.serviceName !== 'Eb Bill') throw new NotFoundException('EB connection not found');
      const referenceNumber = dto.referenceNumber?.trim() ?? old.referenceNumber;
      if (!referenceNumber || referenceNumber.length > 50) throw new BadRequestException('Enter a valid EB number (maximum 50 characters).');
      const updated = await tx.customerServiceProfile.update({ where: { id }, data: { referenceNumber, ...(dto.nickname !== undefined ? { nickname: dto.nickname.trim() || null } : {}), ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName.trim() || null } : {}) } });
      if (old.referenceNumber !== referenceNumber) await tx.customer.updateMany({ where: { id: old.customerId, ebNumber: old.referenceNumber }, data: { ebNumber: referenceNumber } });
      await tx.auditLog.create({ data: { userId, entityType: 'CUSTOMER_SERVICE_PROFILE', entityId: id, action: 'UPDATE', oldValues: { referenceNumber: old.referenceNumber, nickname: old.nickname, ownerName: old.ownerName }, newValues: { referenceNumber: updated.referenceNumber, nickname: updated.nickname, ownerName: updated.ownerName } } });
      return updated;
    });
  }

  async setEbServiceProfileActive(id: string, isActive: boolean, userId: string) {
    return this.prisma.$transaction(async tx => {
      const old = await tx.customerServiceProfile.findUnique({ where: { id } });
      if (!old || old.serviceName !== 'Eb Bill') throw new NotFoundException('EB connection not found');
      const updated = await tx.customerServiceProfile.update({ where: { id }, data: { isActive } });
      const customer = await tx.customer.findUnique({ where: { id: old.customerId }, select: { ebNumber: true } });
      if (customer?.ebNumber === old.referenceNumber && !isActive) {
        const next = await tx.customerServiceProfile.findFirst({ where: { customerId: old.customerId, serviceName: 'Eb Bill', isActive: true }, orderBy: { createdAt: 'asc' } });
        await tx.customer.update({ where: { id: old.customerId }, data: { ebNumber: next?.referenceNumber || null } });
      } else if (isActive && !customer?.ebNumber) await tx.customer.update({ where: { id: old.customerId }, data: { ebNumber: old.referenceNumber } });
      await tx.auditLog.create({ data: { userId, entityType: 'CUSTOMER_SERVICE_PROFILE', entityId: id, action: isActive ? 'REACTIVATE' : 'DEACTIVATE', oldValues: { isActive: old.isActive }, newValues: { isActive } } });
      return updated;
    });
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        cards: true,
        customerTypeConfig: { select: { id: true, name: true, isActive: true } },
        bankAccounts: true,
        upiAccounts: true,
        serviceProfiles: { where: { serviceName: 'Eb Bill' }, orderBy: { createdAt: 'asc' } },
        aepsAccounts: { orderBy: { createdAt: 'asc' } },
        esevaiServices: { orderBy: { createdAt: 'asc' } },
        beneficiaries: { include: { accounts: true } },
        transactions: {
          orderBy: { transactionAt: 'desc' },
          take: 20,
          select: {
            id: true,
            transactionNumber: true,
            transactionType: true,
            transactionAt: true,
            grossAmount: true,
            netAmount: true,
            status: true,
            referenceNumber: true,
            payable: { select: { status: true, dueAt: true, remainingAmount: true } },
            receivableSource: { select: { status: true, dueAt: true, remainingAmount: true } },
          },
        },
        payables: { orderBy: { dueAt: 'asc' } },
        receivables: {
          include: { collections: { include: { destinationAccount: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async createCardLedgerEntry(
    customerId: string,
    dto: CreateCustomerLedgerEntryDto,
    userId: string,
    actorRole: RoleName,
    providedIdempotencyKey?: string,
  ) {
    const amount = this.money(dto.amount);
    const remarks = dto.remarks?.trim() || (dto.direction === 'PAY_IN' ? 'Pay In' : 'Pay Out');
    const transactionAt = dto.transactionAt ? new Date(dto.transactionAt) : new Date();
    if (Number.isNaN(transactionAt.getTime())) {
      throw new BadRequestException('Invalid transaction date');
    }
    if (transactionAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Transaction date cannot be in the future');
    }
    const allocations = (dto.allocations ?? [])
      .map((item) => ({
        ...item,
        amount: this.money(item.amount),
      }))
      .sort((a, b) =>
        (a.targetType + ':' + a.targetId).localeCompare(b.targetType + ':' + b.targetId),
      );
    const seenTargets = new Set<string>();
    let requestedAllocationTotal = 0;
    for (const allocation of allocations) {
      if (allocation.amount <= 0) {
        throw new BadRequestException('Allocation amount must be greater than zero');
      }
      if (dto.direction === 'PAY_OUT' && allocation.targetType !== 'PAYABLE') {
        throw new BadRequestException('Pay Out can only be matched to customer payables');
      }
      if (dto.direction === 'PAY_IN' && allocation.targetType !== 'CARD_DUE') {
        throw new BadRequestException('Pay In can only be matched to card due principal');
      }
      const key = allocation.targetType + ':' + allocation.targetId;
      if (seenTargets.has(key)) {
        throw new BadRequestException('The same outstanding item cannot be allocated twice');
      }
      seenTargets.add(key);
      requestedAllocationTotal = this.money(requestedAllocationTotal + allocation.amount);
    }
    if (requestedAllocationTotal > amount + 0.001) {
      throw new BadRequestException('Matched amount cannot exceed Pay In / Pay Out amount');
    }

    const idempotencyKey = await this.idempotency.key(
      TransactionType.CUSTOMER_LEDGER_ENTRY,
      userId,
      { customerId, ...dto },
      providedIdempotencyKey,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.validation.activeCustomer(tx, customerId);
      if (dto.customerCardId) {
        await this.validation.customerCard(tx, customerId, dto.customerCardId);
      }
      // Keep lock order consistent with dedicated payable/card-due workflows:
      // target obligation first, then the money account. This avoids needless
      // deadlocks when two staff members settle the same customer concurrently.
      for (const allocation of allocations) {
        if (allocation.targetType === 'PAYABLE') {
          await tx.$queryRawUnsafe(
            'SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE',
            allocation.targetId,
          );
        } else {
          await tx.$queryRawUnsafe(
            'SELECT "id" FROM "CardDueClearingDetail" WHERE "id" = $1 FOR UPDATE',
            allocation.targetId,
          );
        }
      }
      await this.validation.lockAccount(tx, dto.financialAccountId);
      const account = await this.validation.liquidAsset(
        tx,
        dto.financialAccountId,
        dto.direction === 'PAY_IN' ? 'Pay In receiving account' : 'Pay Out source account',
      );
      if (
        actorRole === RoleName.STAFF &&
        account.accountType === AccountType.CASH &&
        account.accountName === 'Main Cash Reserve'
      ) {
        throw new BadRequestException('Main Cash Reserve is owner-only');
      }
      // A customer receiving notes must debit the cash drawer that actually
      // handed over those notes. A wallet-to-cash transfer is a separate movement.
      if (
        dto.direction === 'PAY_OUT' &&
        dto.payoutDestinationType === 'CASH' &&
        account.accountType !== AccountType.CASH
      ) {
        throw new BadRequestException(
          'Cash handed to customer requires a physical cash drawer as Paid from. Record any wallet-to-drawer transfer separately first.',
        );
      }
      if (account.accountType === AccountType.CASH) {
        if (dto.direction === 'PAY_OUT') {
          requireWholeRupeeCashPayout(account.accountType, amount);
        }
        if (dto.physicalCashConfirmed !== true) {
          throw new BadRequestException(
            'This would change the physical cash drawer. Confirm that real cash notes were received or handed over. For a credit-card swipe, use the Card Swipe transaction instead.',
          );
        }
        if (dto.direction === 'PAY_OUT' && dto.payoutDestinationType && dto.payoutDestinationType !== 'CASH') {
          throw new BadRequestException(
            'Cash drawer Pay Out requires cash handed to customer. For bank or UPI payouts, choose the actual bank or wallet as Paid from.',
          );
        }
        await this.validation.requireOpenCashDesk(
          tx,
          account.id,
          dto.direction === 'PAY_IN' ? 'Customer Pay In' : 'Customer Pay Out',
          actorRole === RoleName.STAFF ? userId : undefined,
        );
      }

      // Save a validated, human-readable recipient snapshot separately from the
      // business account being debited. Never mistake a provider wallet for the
      // customer's bank/UPI destination.
      let payoutDestination: { type: string; label: string; destinationId?: string } | null = null;
      if (dto.payoutDestinationType && dto.direction !== 'PAY_OUT') {
        throw new BadRequestException('Paid-to destination is only valid for Pay Out');
      }
      if (dto.direction === 'PAY_OUT' && !dto.payoutDestinationType) {
        throw new BadRequestException('Select where the payout was paid to');
      }
      if (dto.direction === 'PAY_OUT' && dto.payoutDestinationType) {
        const kind = dto.payoutDestinationType;
        const destinationId = dto.payoutDestinationId?.trim();
        const details = dto.payoutDestinationDetails?.trim();
        if (kind === 'CASH') {
          payoutDestination = { type: kind, label: 'Cash handed to customer' };
        } else if (kind === 'OTHER' || kind === 'OTHER_CARD') {
          if (!details || details.length > 160) throw new BadRequestException('Enter a recipient or payment destination (maximum 160 characters)');
          if (kind === 'OTHER_CARD' && /\d{12,19}/.test(details.replace(/[ -]/g, ''))) {
            throw new BadRequestException('Use only the last four card digits, never a full card number');
          }
          payoutDestination = {
            type: kind,
            label: kind === 'OTHER_CARD' ? 'Other credit card · ' + details : details,
          };
        } else {
          if (!destinationId) throw new BadRequestException('Choose a saved customer destination');
          if (kind === 'CARD') {
            const card = await tx.customerCard.findFirst({
              where: { id: destinationId, customerId, isActive: true },
            });
            if (!card) throw new BadRequestException('Selected credit card does not belong to this customer or is inactive');
            payoutDestination = {
              type: kind, destinationId,
              label: 'Credit card · ' + card.bankName + ' ••••' + card.lastFourDigits +
                (card.nickname ? ' · ' + card.nickname : ''),
            };
          } else if (kind === 'BANK') {
            const saved = await tx.customerBankAccount.findFirst({ where: { id: destinationId, customerId, isActive: true } });
            if (!saved) throw new BadRequestException('Customer bank account not found or inactive');
            payoutDestination = { type: kind, destinationId, label: saved.accountHolderName + ' · ' + saved.bankName + ' ••••' + saved.accountReference.replace(/\D/g, '').slice(-4) };
          } else if (kind === 'UPI') {
            const saved = await tx.customerUpiAccount.findFirst({ where: { id: destinationId, customerId, isActive: true } });
            if (!saved) throw new BadRequestException('Customer UPI destination not found or inactive');
            payoutDestination = { type: kind, destinationId, label: saved.accountName + ' · ' + (saved.upiId || saved.mobileNumber || 'UPI') };
          } else {
            const saved = await tx.beneficiaryAccount.findFirst({ where: { id: destinationId, isActive: true, beneficiary: { customerId, isActive: true } }, include: { beneficiary: true } });
            if (!saved) throw new BadRequestException('Customer beneficiary account not found or inactive');
            const reference = saved.accountType === 'BANK' ? '••••' + (saved.accountReference || '').replace(/\D/g, '').slice(-4) : (saved.upiId || saved.mobileNumber || 'UPI');
            payoutDestination = { type: kind, destinationId, label: saved.beneficiary.beneficiaryName + ' · ' + (saved.bankName || 'UPI') + ' ' + reference };
          }
        }
      }

      // A bank/UPI transfer reference identifies one actual movement of funds.
      // Separate swipe payables can be matched to that ONE movement using
      // allocations; saving the same wallet transfer twice would debit the
      // wallet and clear the customer's debt a second time.
      //
      // lockAccount above serializes competing writers using this wallet, so
      // the check and the posting happen inside the same transaction/lock.
      const payoutReference = dto.direction === 'PAY_OUT'
        ? dto.referenceNumber?.trim()
        : undefined;
      if (payoutReference && account.accountType !== AccountType.CASH) {
        const priorPayout = await tx.transaction.findFirst({
          where: {
            transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
            status: TransactionStatus.COMPLETED,
            referenceNumber: { equals: payoutReference, mode: 'insensitive' },
            customerLedgerEntry: {
              direction: 'PAY_OUT',
              financialAccountId: account.id,
            },
          },
          select: { transactionNumber: true },
        });
        if (priorPayout) {
          throw new BadRequestException(
            'This wallet/bank transfer reference is already recorded under ' +
            priorPayout.transactionNumber +
            '. Do not save the same payout twice. Open that transaction and match its allocations instead.',
          );
        }
      }

      if (dto.sourcePayInTransactionId) {
        if (dto.direction !== 'PAY_OUT') {
          throw new BadRequestException('Pay In source is only applicable to Pay Out');
        }
        const source = await tx.customerLedgerEntryDetail.findFirst({
          where: {
            transactionId: dto.sourcePayInTransactionId,
            direction: 'PAY_IN',
            transaction: { customerId, status: TransactionStatus.COMPLETED },
          },
          select: {
            financialAccountId: true,
            customerCardId: true,
            transaction: { select: { transactionAt: true } },
          },
        });
        if (!source || source.financialAccountId !== account.id) {
          throw new BadRequestException('Selected Pay In source no longer matches the payout account');
        }
        if (dto.customerCardId && source.customerCardId && source.customerCardId !== dto.customerCardId) {
          throw new BadRequestException('Selected Pay In belongs to another customer card');
        }
        const businessDate = (value: Date) =>
          new Date(value.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
        if (businessDate(source.transaction.transactionAt) > businessDate(transactionAt)) {
          throw new BadRequestException('Pay In source cannot be later than the payout date');
        }
      }

      const currentBalance = await this.cardLedgerBalance(
        tx,
        customerId,
        dto.customerCardId,
      );

      let allocatedPayableAmount = 0;
      let allocatedReceivableAmount = 0;
      const allocationRecords: Array<{
        targetType: 'PAYABLE' | 'CARD_DUE';
        targetId: string;
        amount: number;
        label: string;
      }> = [];

      for (const allocation of allocations) {
        if (allocation.targetType === 'PAYABLE') {
          await tx.$queryRawUnsafe(
            'SELECT "id" FROM "CustomerPayable" WHERE "id" = $1 FOR UPDATE',
            allocation.targetId,
          );
          const payable = await tx.customerPayable.findUnique({
            where: { id: allocation.targetId },
            include: {
              sourceTransaction: {
                include: {
                  cardSwipe: { include: { customerCard: true } },
                  cardDueRecovery: {
                    include: {
                      clearing: { include: { customerCard: true } },
                    },
                  },
                },
              },
            },
          });
          if (!payable || payable.customerId !== customerId) {
            throw new BadRequestException('Selected payable does not belong to this customer');
          }
          if (
            payable.sourceTransaction.status === TransactionStatus.CANCELLED ||
            payable.sourceTransaction.status === TransactionStatus.REVERSED
          ) {
            throw new BadRequestException('Selected payable is not active');
          }
          const targetCardId =
            payable.sourceTransaction.cardSwipe?.customerCardId ??
            payable.sourceTransaction.cardDueRecovery?.clearing.customerCardId ??
            null;
          if (dto.customerCardId && targetCardId !== dto.customerCardId) {
            throw new BadRequestException('Selected payable belongs to another card');
          }
          const remaining = Number(payable.remainingAmount);
          if (allocation.amount > remaining + 0.001) {
            throw new BadRequestException('Pay Out allocation exceeds the selected payable balance');
          }
          const paidAmount = this.money(Number(payable.paidAmount) + allocation.amount);
          const remainingAmount = this.money(Math.max(0, remaining - allocation.amount));
          const indiaOffset = 330 * 60 * 1000;
          const indiaNow = new Date(Date.now() + indiaOffset);
          const todayStart = new Date(
            Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), indiaNow.getUTCDate()) - indiaOffset,
          );
          const payableStatus = remainingAmount <= 0.001
            ? PayableStatus.PAID
            : payable.dueAt < todayStart
              ? PayableStatus.OVERDUE
              : PayableStatus.PARTIALLY_PAID;
          await tx.customerPayable.update({
            where: { id: payable.id },
            data: {
              paidAmount: new Prisma.Decimal(paidAmount),
              remainingAmount: new Prisma.Decimal(remainingAmount),
              status: payableStatus,
            },
          });
          allocatedPayableAmount = this.money(allocatedPayableAmount + allocation.amount);
          const card = payable.sourceTransaction.cardSwipe?.customerCard ?? payable.sourceTransaction.cardDueRecovery?.clearing.customerCard;
          allocationRecords.push({
            targetType: 'PAYABLE',
            targetId: payable.id,
            amount: allocation.amount,
            label: payable.sourceTransaction.transactionNumber + (card ? ' · ' + card.bankName + ' •••• ' + card.lastFourDigits : ''),
          });
        } else {
          await tx.$queryRawUnsafe(
            'SELECT "id" FROM "CardDueClearingDetail" WHERE "id" = $1 FOR UPDATE',
            allocation.targetId,
          );
          const clearing = await tx.cardDueClearingDetail.findUnique({
            where: { id: allocation.targetId },
            include: { transaction: true, customerCard: true },
          });
          if (!clearing || clearing.transaction.customerId !== customerId) {
            throw new BadRequestException('Selected card due does not belong to this customer');
          }
          if (
            clearing.transaction.status === TransactionStatus.CANCELLED ||
            clearing.transaction.status === TransactionStatus.REVERSED
          ) {
            throw new BadRequestException('Selected card due is not active');
          }
          if (dto.customerCardId && clearing.customerCardId !== dto.customerCardId) {
            throw new BadRequestException('Selected card due belongs to another card');
          }
          const remaining = Number(clearing.principalRemaining);
          if (allocation.amount > remaining + 0.001) {
            throw new BadRequestException('Pay In allocation exceeds the selected card due balance');
          }
          const principalRecovered = this.money(Number(clearing.principalRecovered) + allocation.amount);
          const principalRemaining = this.money(Math.max(0, remaining - allocation.amount));
          await tx.cardDueClearingDetail.update({
            where: { id: clearing.id },
            data: {
              principalRecovered: new Prisma.Decimal(principalRecovered),
              principalRemaining: new Prisma.Decimal(principalRemaining),
            },
          });
          await tx.transaction.update({
            where: { id: clearing.transactionId },
            data: {
              status: principalRemaining <= 0.001
                ? TransactionStatus.COMPLETED
                : TransactionStatus.PARTIALLY_PAID,
            },
          });
          allocatedReceivableAmount = this.money(allocatedReceivableAmount + allocation.amount);
          allocationRecords.push({
            targetType: 'CARD_DUE',
            targetId: clearing.id,
            amount: allocation.amount,
            label: clearing.transaction.transactionNumber + ' · ' + clearing.customerCard.bankName + ' •••• ' + clearing.customerCard.lastFourDigits,
          });
        }
      }

      const allocatedTotal = this.money(allocatedPayableAmount + allocatedReceivableAmount);
      const unallocatedAmount = this.money(Math.max(0, amount - allocatedTotal));
      let receivableAmount = allocatedReceivableAmount;
      let payableAmount = allocatedPayableAmount;
      if (dto.direction === 'PAY_IN') {
        const balanceAfterMatched = this.money(currentBalance + allocatedReceivableAmount);
        const genericReceivable = this.money(Math.min(unallocatedAmount, Math.max(-balanceAfterMatched, 0)));
        receivableAmount = this.money(receivableAmount + genericReceivable);
        payableAmount = this.money(unallocatedAmount - genericReceivable);
      } else {
        const balanceAfterMatched = this.money(currentBalance - allocatedPayableAmount);
        const genericPayable = this.money(Math.min(unallocatedAmount, Math.max(balanceAfterMatched, 0)));
        payableAmount = this.money(payableAmount + genericPayable);
        receivableAmount = this.money(unallocatedAmount - genericPayable);
      }

      const configuredCharge = dto.direction === 'PAY_OUT'
        ? await this.payoutCharges.resolve(tx, account, amount, transactionAt)
        : null;
      const payoutChargeAmount = configuredCharge?.amount ?? 0;
      if (dto.direction === 'PAY_OUT') {
        await this.validation.ensureSufficientFunds(
          tx,
          account,
          amount + payoutChargeAmount,
        );
      }

      const systemLedgers = await tx.ledgerAccount.findMany({
        where: {
          ledgerCode: {
            in: ['SYS-CUST-RECEIVABLE', 'SYS-CUST-PAYABLE', 'SYS-PROVIDER-CHARGE'],
          },
        },
      });
      const byCode = new Map(systemLedgers.map((item) => [item.ledgerCode, item]));
      const receivableLedger = byCode.get('SYS-CUST-RECEIVABLE');
      const payableLedger = byCode.get('SYS-CUST-PAYABLE');
      const providerChargeLedger = byCode.get('SYS-PROVIDER-CHARGE');
      if (!receivableLedger || !payableLedger) {
        throw new Error('Customer receivable/payable ledgers are missing');
      }
      if (payoutChargeAmount > 0 && !providerChargeLedger) {
        throw new Error('Provider payout charge ledger is missing');
      }

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: 'CLK-' + Date.now().toString(36).toUpperCase(),
          transactionType: TransactionType.CUSTOMER_LEDGER_ENTRY,
          transactionAt,
          customerId,
          grossAmount: new Prisma.Decimal(
            dto.direction === 'PAY_OUT' ? amount + payoutChargeAmount : amount,
          ),
          netAmount: new Prisma.Decimal(amount),
          status: TransactionStatus.COMPLETED,
          idempotencyKey,
          referenceNumber: dto.referenceNumber?.trim() || null,
          notes: dto.notes?.trim() || null,
          createdById: userId,
        },
      });

      const detail = await tx.customerLedgerEntryDetail.create({
        data: {
          transactionId: transaction.id,
          customerCardId: dto.customerCardId || null,
          financialAccountId: account.id,
          direction: dto.direction,
          payoutDestination: payoutDestination ?? undefined,
          amount: new Prisma.Decimal(amount),
          remarks,
          receivableAmount: new Prisma.Decimal(receivableAmount),
          payableAmount: new Prisma.Decimal(payableAmount),
        },
      });

      if (allocationRecords.length) {
        await tx.customerLedgerAllocation.createMany({
          data: allocationRecords.map((allocation) => ({
            customerLedgerEntryId: detail.id,
            targetType: allocation.targetType,
            payableId: allocation.targetType === 'PAYABLE' ? allocation.targetId : null,
            cardDueClearingId: allocation.targetType === 'CARD_DUE' ? allocation.targetId : null,
            amount: new Prisma.Decimal(allocation.amount),
          })),
        });
      }

      if (payoutChargeAmount > 0 && configuredCharge) {
        await tx.transactionCharge.create({
          data: {
            transactionId: transaction.id,
            chargeType: 'PAYOUT',
            providerId: account.providerId,
            sourceAccountId: account.id,
            providerPayoutChargeRuleId: configuredCharge.ruleId,
            calculationType: configuredCharge.calculationType,
            rate: new Prisma.Decimal(configuredCharge.rate),
            amount: new Prisma.Decimal(payoutChargeAmount),
            notes: account.accountName + ' payout charge',
          },
        });
      }

      const entries: JournalEntry[] = [];
      if (dto.direction === 'PAY_IN') {
        entries.push({
          ledgerAccountId: account.ledgerAccount!.id,
          entryType: EntryType.DEBIT,
          amount,
          customerId,
          description: 'Customer Pay In · ' + remarks,
        });
        if (receivableAmount > 0) {
          entries.push({
            ledgerAccountId: receivableLedger.id,
            entryType: EntryType.CREDIT,
            amount: receivableAmount,
            customerId,
            description: 'Reduce customer receivable',
          });
        }
        if (payableAmount > 0) {
          entries.push({
            ledgerAccountId: payableLedger.id,
            entryType: EntryType.CREDIT,
            amount: payableAmount,
            customerId,
            description: 'Increase amount payable to customer',
          });
        }
      } else {
        if (payableAmount > 0) {
          entries.push({
            ledgerAccountId: payableLedger.id,
            entryType: EntryType.DEBIT,
            amount: payableAmount,
            customerId,
            description: 'Reduce amount payable to customer',
          });
        }
        if (receivableAmount > 0) {
          entries.push({
            ledgerAccountId: receivableLedger.id,
            entryType: EntryType.DEBIT,
            amount: receivableAmount,
            customerId,
            description: 'Increase customer receivable',
          });
        }
        if (payoutChargeAmount > 0 && providerChargeLedger) {
          entries.push({
            ledgerAccountId: providerChargeLedger.id,
            entryType: EntryType.DEBIT,
            amount: payoutChargeAmount,
            customerId,
            description: account.accountName + ' payout charge',
          });
        }
        entries.push({
          ledgerAccountId: account.ledgerAccount!.id,
          entryType: EntryType.CREDIT,
          amount: amount + payoutChargeAmount,
          customerId,
          description: 'Customer Pay Out · ' + remarks,
        });
      }

      await this.ledger.post(
        tx,
        transaction.id,
        userId,
        (dto.direction === 'PAY_IN' ? 'Customer Pay In · ' : 'Customer Pay Out · ') + remarks,
        entries,
        transactionAt,
      );

      const endingBalance = this.money(
        currentBalance + (dto.direction === 'PAY_IN' ? amount : -amount),
      );
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CUSTOMER_LEDGER_ENTRY',
          entityId: detail.id,
          action: 'CREATE',
          newValues: {
            customerId,
            customerCardId: dto.customerCardId ?? null,
            transactionId: transaction.id,
            direction: dto.direction,
            amount,
            financialAccountId: account.id,
            financialAccountType: account.accountType,
            physicalCashConfirmed: account.accountType === AccountType.CASH,
            sourcePayInTransactionId: dto.sourcePayInTransactionId ?? null,
            payoutDestination,
            remarks,
            referenceNumber: transaction.referenceNumber,
            startingBalance: currentBalance,
            endingBalance,
            receivableAmount,
            payableAmount,
            matchedAmount: allocatedTotal,
            unallocatedAmount,
            allocations: allocationRecords,
            payoutChargeAmount,
          },
        },
      });

      return {
        transaction,
        detail,
        startingBalance: currentBalance,
        endingBalance,
        matchedAmount: allocatedTotal,
        unallocatedAmount,
        allocations: allocationRecords,
        payoutChargeAmount,
      };
    });
  }

  async getCardLedger(id: string, cardId?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        mobile: true,
        cards: {
          select: {
            id: true,
            bankName: true,
            lastFourDigits: true,
            nickname: true,
            isActive: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (cardId && !customer.cards.some((card) => card.id === cardId)) {
      throw new BadRequestException('Selected card does not belong to this customer');
    }

    const activeTransaction = {
      status: {
        notIn: [TransactionStatus.CANCELLED, TransactionStatus.REVERSED],
      },
    };
    const cardWhere = cardId
      ? { customerId: id, id: cardId }
      : { customerId: id };

    const [swipes, clearings, manualEntries] = await Promise.all([
      this.prisma.cardSwipeDetail.findMany({
        where: {
          customerCard: cardWhere,
          transaction: activeTransaction,
        },
        include: {
          customerCard: true,
          transaction: {
            include: {
              payable: {
                include: {
                  payments: {
                    where: { status: PaymentStatus.COMPLETED },
                    include: {
                      sourceAccount: true,
                      transaction: true,
                    },
                    orderBy: { paymentDate: 'asc' },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.cardDueClearingDetail.findMany({
        where: {
          customerCard: cardWhere,
          transaction: activeTransaction,
        },
        include: {
          customerCard: true,
          advanceSourceAccount: true,
          transaction: true,
          recoveries: {
            where: {
              transaction: activeTransaction,
            },
            include: {
              provider: true,
              gateway: true,
              destinationAccount: true,
              transaction: {
                include: {
                  payable: {
                    include: {
                      payments: {
                        where: { status: PaymentStatus.COMPLETED },
                        include: {
                          sourceAccount: true,
                          transaction: true,
                        },
                        orderBy: { paymentDate: 'asc' },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { recoveredAt: 'asc' },
          },
        },
      }),
      this.prisma.customerLedgerEntryDetail.findMany({
        where: {
          transaction: { customerId: id, ...activeTransaction },
        },
        include: {
          customerCard: true,
          financialAccount: true,
          transaction: true,
          allocations: {
            include: {
              payable: {
                include: {
                  sourceTransaction: {
                    include: {
                      cardSwipe: true,
                      cardDueRecovery: { include: { clearing: true } },
                    },
                  },
                },
              },
              cardDueClearing: { include: { transaction: true, customerCard: true } },
            },
          },
        },
      }),
    ]);

    const providerIds = [...new Set(swipes.map((row) => row.providerId))];
    const gatewayIds = [...new Set(swipes.map((row) => row.gatewayId))];
    const [providers, gateways] = await Promise.all([
      providerIds.length
        ? this.prisma.provider.findMany({
            where: { id: { in: providerIds } },
            select: { id: true, name: true },
          })
        : [],
      gatewayIds.length
        ? this.prisma.providerGateway.findMany({
            where: { id: { in: gatewayIds } },
            select: { id: true, gatewayName: true },
          })
        : [],
    ]);
    const providerName = new Map(providers.map((row) => [row.id, row.name]));
    const gatewayName = new Map(gateways.map((row) => [row.id, row.gatewayName]));
    // A provider-specific wallet is the requested *default* for its card swipe.
    // Select only a unique, active provider wallet, never an arbitrary bank,
    // cash drawer or other provider's wallet. The staff can override the default.
    const providerWallets = providerIds.length
      ? await this.prisma.financialAccount.findMany({
          where: { accountType: AccountType.PROVIDER_WALLET, isActive: true },
          select: { id: true, accountName: true, providerId: true },
        })
      : [];
    const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const walletForSwipe = (providerId: string, settlementAccountId: string) => {
      const linked = providerWallets.filter(wallet => wallet.providerId === providerId);
      const name = providerName.get(providerId);
      const matches = linked.length || !name ? linked : providerWallets.filter(wallet =>
        !wallet.providerId && [normalized(name), normalized(name + ' Wallet')].includes(normalized(wallet.accountName)),
      );
      // If a provider owns multiple wallets, prefer the exact wallet already
      // selected for settlement. Otherwise avoid guessing which one to debit.
      return matches.find(wallet => wallet.id === settlementAccountId)?.id ??
        (matches.length === 1 ? matches[0].id : null);
    };
    const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    type Movement = {
      id: string;
      at: Date;
      priority: number;
      kind: 'CARD_SWIPE' | 'CUSTOMER_PAYOUT' | 'CARD_DUE_PAYMENT' | 'CARD_DUE_RECOVERY' | 'PAY_IN' | 'PAY_OUT';
      remarks: string;
      detail: string;
      debit: number;
      credit: number;
      cardId: string | null;
      cardLabel: string;
      transactionId: string;
      transactionNumber: string;
      referenceNumber: string | null;
    };
    const movements: Movement[] = [];

    for (const swipe of swipes) {
      const tx = swipe.transaction;
      const cardLabel =
        swipe.customerCard.bankName + ' •••• ' + swipe.customerCard.lastFourDigits;
      const provider = providerName.get(swipe.providerId) ?? 'Card provider';
      const gateway = gatewayName.get(swipe.gatewayId) ?? '';
      movements.push({
        id: 'swipe-' + swipe.id,
        at: tx.transactionAt,
        priority: 10,
        kind: 'CARD_SWIPE',
        remarks: 'Card swipe · ' + provider,
        detail: [
          cardLabel,
          gateway,
          'Swipe ₹' + Number(swipe.swipeAmount).toFixed(2),
          'Customer fee ₹' + Number(swipe.commissionAmount).toFixed(2),
        ].filter(Boolean).join(' · '),
        debit: 0,
        credit: Number(swipe.customerPayableAmount),
        cardId: swipe.customerCardId,
        cardLabel,
        transactionId: tx.id,
        transactionNumber: tx.transactionNumber,
        referenceNumber: tx.referenceNumber,
      });
      for (const payment of tx.payable?.payments ?? []) {
        movements.push({
          id: 'payout-' + payment.id,
          at: payment.paymentDate,
          priority: 20,
          kind: 'CUSTOMER_PAYOUT',
          remarks: 'Customer payout · ' + payment.sourceAccount.accountName,
          detail: [
            cardLabel,
            payment.destinationLabel ?? null,
            payment.destinationReference ?? null,
          ].filter(Boolean).join(' · '),
          debit: Number(payment.amount),
          credit: 0,
          cardId: swipe.customerCardId,
          cardLabel,
          transactionId: payment.transactionId,
          transactionNumber: payment.transaction.transactionNumber,
          referenceNumber: payment.referenceNumber,
        });
      }
    }

    for (const clearing of clearings) {
      const tx = clearing.transaction;
      const cardLabel =
        clearing.customerCard.bankName + ' •••• ' + clearing.customerCard.lastFourDigits;
      movements.push({
        id: 'due-' + clearing.id,
        at: tx.transactionAt,
        priority: 10,
        kind: 'CARD_DUE_PAYMENT',
        remarks: 'CC bill payment · ' + clearing.advanceSourceAccount.accountName,
        detail: cardLabel,
        debit: Number(clearing.dueAmount),
        credit: 0,
        cardId: clearing.customerCardId,
        cardLabel,
        transactionId: tx.id,
        transactionNumber: tx.transactionNumber,
        referenceNumber: tx.referenceNumber,
      });
      for (const recovery of clearing.recoveries) {
        movements.push({
          id: 'recovery-' + recovery.id,
          at: recovery.recoveredAt,
          priority: 20,
          kind: 'CARD_DUE_RECOVERY',
          remarks: 'Recovery · ' + recovery.provider.name,
          detail: [
            cardLabel,
            recovery.gateway.gatewayName,
            'Into ' + recovery.destinationAccount.accountName,
          ].join(' · '),
          debit: 0,
          credit: Number(recovery.swipeAmount),
          cardId: clearing.customerCardId,
          cardLabel,
          transactionId: recovery.transactionId,
          transactionNumber: recovery.transaction.transactionNumber,
          referenceNumber: recovery.referenceNumber,
        });
        for (const payment of recovery.transaction.payable?.payments ?? []) {
          movements.push({
            id: 'recovery-payout-' + payment.id,
            at: payment.paymentDate,
            priority: 30,
            kind: 'CUSTOMER_PAYOUT',
            remarks: 'Customer payout · ' + payment.sourceAccount.accountName,
            detail: [
              cardLabel,
              payment.destinationLabel ?? 'Excess recovery paid back',
              payment.destinationReference ?? null,
            ].filter(Boolean).join(' · '),
            debit: Number(payment.amount),
            credit: 0,
            cardId: clearing.customerCardId,
            cardLabel,
            transactionId: payment.transactionId,
            transactionNumber: payment.transaction.transactionNumber,
            referenceNumber: payment.referenceNumber,
          });
        }
      }
    }

    for (const entry of manualEntries) {
      const allocationCardId = (allocation: (typeof entry.allocations)[number]) =>
        allocation.cardDueClearing?.customerCardId ??
        allocation.payable?.sourceTransaction.cardSwipe?.customerCardId ??
        allocation.payable?.sourceTransaction.cardDueRecovery?.clearing.customerCardId ??
        null;
      const visibleAllocations = cardId
        ? entry.allocations.filter((allocation) => allocationCardId(allocation) === cardId)
        : entry.allocations;
      let movementAmount = Number(entry.amount);
      if (cardId && entry.customerCardId !== cardId) {
        if (entry.customerCardId) continue;
        movementAmount = money(
          visibleAllocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0),
        );
        if (movementAmount <= 0.001) continue;
      }
      const selectedCard = cardId ? customer.cards.find((card) => card.id === cardId) : null;
      const cardLabel = entry.customerCard
        ? entry.customerCard.bankName + ' •••• ' + entry.customerCard.lastFourDigits
        : selectedCard
          ? selectedCard.bankName + ' •••• ' + selectedCard.lastFourDigits
          : 'Customer ledger';
      const isPayIn = entry.direction === 'PAY_IN';
      const matchedLabels = visibleAllocations.map((allocation) =>
        allocation.targetType === 'PAYABLE'
          ? allocation.payable?.sourceTransaction.transactionNumber
          : allocation.cardDueClearing?.transaction.transactionNumber,
      ).filter((value): value is string => Boolean(value));
      movements.push({
        id: 'manual-' + entry.id + (cardId && !entry.customerCardId ? '-' + cardId : ''),
        at: entry.transaction.transactionAt,
        priority: 40,
        kind: isPayIn ? 'PAY_IN' : 'PAY_OUT',
        remarks: (isPayIn ? 'Pay In · ' : 'Pay Out · ') + entry.remarks,
        detail: [
          cardLabel,
          (isPayIn ? 'Received in ' : 'Paid from ') + entry.financialAccount.accountName,
          !isPayIn && entry.payoutDestination && typeof entry.payoutDestination === 'object' && !Array.isArray(entry.payoutDestination) && 'label' in entry.payoutDestination ? 'Paid to ' + String(entry.payoutDestination.label) : null,
          matchedLabels.length ? 'Matched ' + matchedLabels.join(', ') : 'Unallocated / on-account',
        ].filter(Boolean).join(' · '),
        debit: isPayIn ? 0 : movementAmount,
        credit: isPayIn ? movementAmount : 0,
        cardId: entry.customerCardId ?? (cardId || null),
        cardLabel,
        transactionId: entry.transactionId,
        transactionNumber: entry.transaction.transactionNumber,
        referenceNumber: entry.transaction.referenceNumber,
      });
    }

    movements.sort((a, b) =>
      a.at.getTime() - b.at.getTime() ||
      a.priority - b.priority ||
      a.id.localeCompare(b.id),
    );

    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = movements.map((row) => {
      totalDebit = money(totalDebit + row.debit);
      totalCredit = money(totalCredit + row.credit);
      runningBalance = money(runningBalance + row.credit - row.debit);
      const { priority, ...publicRow } = row;
      void priority;
      return {
        ...publicRow,
        at: row.at.toISOString(),
        debit: money(row.debit),
        credit: money(row.credit),
        closingBalance: runningBalance,
      };
    });

    const openPayOutItems = [
      ...swipes.flatMap((swipe) => {
        const payable = swipe.transaction.payable;
        if (!payable || Number(payable.remainingAmount) <= 0.001) return [];
        const cardLabel = swipe.customerCard.bankName + ' •••• ' + swipe.customerCard.lastFourDigits;
        return [{
          targetType: 'PAYABLE' as const,
          targetId: payable.id,
          sourceKind: 'CARD_SWIPE' as const,
          transactionId: swipe.transaction.id,
          transactionNumber: swipe.transaction.transactionNumber,
          transactionAt: swipe.transaction.transactionAt.toISOString(),
          dueAt: payable.dueAt.toISOString(),
          originalAmount: money(Number(payable.originalAmount)),
          remainingAmount: money(Number(payable.remainingAmount)),
          cardId: swipe.customerCardId,
          cardLabel,
          providerName: providerName.get(swipe.providerId) ?? 'Card provider',
          gatewayName: gatewayName.get(swipe.gatewayId) ?? '',
          providerWalletAccountId: walletForSwipe(swipe.providerId, swipe.settlementAccountId),
          swipeAmount: money(Number(swipe.swipeAmount)),
          customerCharge: money(Number(swipe.commissionAmount)),
          label: 'Swipe ' + swipe.transaction.transactionNumber,
        }];
      }),
      ...clearings.flatMap((clearing) => clearing.recoveries.flatMap((recovery) => {
        const payable = recovery.transaction.payable;
        if (!payable || Number(payable.remainingAmount) <= 0.001) return [];
        const cardLabel = clearing.customerCard.bankName + ' •••• ' + clearing.customerCard.lastFourDigits;
        return [{
          targetType: 'PAYABLE' as const,
          targetId: payable.id,
          sourceKind: 'EXCESS_RECOVERY' as const,
          transactionId: recovery.transaction.id,
          transactionNumber: recovery.transaction.transactionNumber,
          transactionAt: recovery.transaction.transactionAt.toISOString(),
          dueAt: payable.dueAt.toISOString(),
          originalAmount: money(Number(payable.originalAmount)),
          remainingAmount: money(Number(payable.remainingAmount)),
          cardId: clearing.customerCardId,
          cardLabel,
          label: 'Excess recovery ' + recovery.transaction.transactionNumber,
        }];
      })),
    ].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() || new Date(a.transactionAt).getTime() - new Date(b.transactionAt).getTime());

    const openPayInItems = clearings
      .filter((clearing) => Number(clearing.principalRemaining) > 0.001)
      .map((clearing) => ({
        targetType: 'CARD_DUE' as const,
        targetId: clearing.id,
        sourceKind: 'CARD_DUE' as const,
        transactionId: clearing.transaction.id,
        transactionNumber: clearing.transaction.transactionNumber,
        transactionAt: clearing.transaction.transactionAt.toISOString(),
        dueAt: clearing.nextFollowUpAt?.toISOString() ?? clearing.transaction.transactionAt.toISOString(),
        originalAmount: money(Number(clearing.dueAmount)),
        remainingAmount: money(Number(clearing.principalRemaining)),
        cardId: clearing.customerCardId,
        cardLabel: clearing.customerCard.bankName + ' •••• ' + clearing.customerCard.lastFourDigits,
        label: 'Card due ' + clearing.transaction.transactionNumber,
      }))
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() || new Date(a.transactionAt).getTime() - new Date(b.transactionAt).getTime());

    // Use completed Pay In movements as the only candidates for the
    // Pay Out source suggestion. Never infer a debit account from a swipe,
    // unrelated customer or a reversed entry.
    // Customer's full card-swiped value must remain visible independently
    // of customer commission and the net financial liability. These are
    // display-only totals, not new journal postings.
    const swipeSummary = {
      grossSwipe: money(swipes.reduce((sum, row) => sum + Number(row.swipeAmount), 0)),
      customerCharges: money(swipes.reduce((sum, row) => sum + Number(row.commissionAmount), 0)),
      netSwipePayable: money(swipes.reduce((sum, row) => sum + Number(row.customerPayableAmount), 0)),
      swipeCount: swipes.length,
    };
    const payInSources = manualEntries
      .filter(entry =>
        entry.direction === 'PAY_IN' &&
        entry.transaction.status === TransactionStatus.COMPLETED,
      )
      .sort((a, b) =>
        b.transaction.transactionAt.getTime() - a.transaction.transactionAt.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id),
      )
      .map(entry => ({
        financialAccountId: entry.financialAccountId,
        accountName: entry.financialAccount.accountName,
        accountType: entry.financialAccount.accountType,
        customerCardId: entry.customerCardId,
        transactionId: entry.transactionId,
        transactionNumber: entry.transaction.transactionNumber,
        transactionAt: entry.transaction.transactionAt.toISOString(),
      }));

    // Reuse the actual account debited for an earlier customer payout when
    // no eligible Pay In exists. Card Swipe itself is not a payout source.
    // Preserve the original payment/ledger transaction for traceability.
    const payOutSources = [
      ...swipes.flatMap(swipe =>
        (swipe.transaction.payable?.payments ?? []).map(payment => ({
          financialAccountId: payment.sourceAccountId,
          accountName: payment.sourceAccount.accountName,
          accountType: payment.sourceAccount.accountType,
          customerCardId: swipe.customerCardId,
          transactionId: payment.transactionId,
          transactionNumber: payment.transaction.transactionNumber,
          transactionAt: payment.paymentDate.toISOString(),
          sourceKind: 'CUSTOMER_PAYOUT' as const,
        })),
      ),
      ...clearings.flatMap(clearing =>
        clearing.recoveries.flatMap(recovery =>
          (recovery.transaction.payable?.payments ?? []).map(payment => ({
            financialAccountId: payment.sourceAccountId,
            accountName: payment.sourceAccount.accountName,
            accountType: payment.sourceAccount.accountType,
            customerCardId: clearing.customerCardId,
            transactionId: payment.transactionId,
            transactionNumber: payment.transaction.transactionNumber,
            transactionAt: payment.paymentDate.toISOString(),
            sourceKind: 'CUSTOMER_PAYOUT' as const,
          })),
        ),
      ),
      ...manualEntries
        .filter(entry =>
          entry.direction === 'PAY_OUT' &&
          entry.transaction.status === TransactionStatus.COMPLETED,
        )
        .map(entry => ({
          financialAccountId: entry.financialAccountId,
          accountName: entry.financialAccount.accountName,
          accountType: entry.financialAccount.accountType,
          customerCardId: entry.customerCardId,
          transactionId: entry.transactionId,
          transactionNumber: entry.transaction.transactionNumber,
          transactionAt: entry.transaction.transactionAt.toISOString(),
          sourceKind: 'PAY_OUT' as const,
        })),
    ].sort((a, b) =>
      new Date(b.transactionAt).getTime() - new Date(a.transactionAt).getTime() ||
      b.transactionId.localeCompare(a.transactionId),
    );

    const availableUnallocatedPayOuts = manualEntries
      .filter(entry => entry.direction === 'PAY_OUT' &&
        entry.transaction.status === TransactionStatus.COMPLETED &&
        (!cardId || !entry.customerCardId || entry.customerCardId === cardId))
      .map(entry => ({
        id: entry.id,
        remaining: money(Number(entry.payableAmount) -
          entry.allocations.filter(a => a.targetType === 'PAYABLE')
            .reduce((sum, a) => sum + Number(a.amount), 0)),
        transactionId: entry.transactionId,
        transactionNumber: entry.transaction.transactionNumber,
      }))
      .filter(entry => entry.remaining > 0.001);
    const availableAdvances = manualEntries
      .filter(entry =>
        entry.direction === 'PAY_OUT' &&
        entry.transaction.status === TransactionStatus.COMPLETED &&
        (!cardId || !entry.customerCardId || entry.customerCardId === cardId),
      )
      .map(entry => ({
        id: entry.id,
        customerCardId: entry.customerCardId,
        amount: money(Number(entry.receivableAmount)),
        applied: money(Number(entry.advanceAppliedAmount)),
        remaining: money(Number(entry.receivableAmount) - Number(entry.advanceAppliedAmount)),
        transactionId: entry.transaction.id,
        transactionNumber: entry.transaction.transactionNumber,
        date: entry.transaction.transactionAt.toISOString(),
        source: entry.financialAccount.accountName,
      }))
      .filter(entry => entry.remaining > 0.001);

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        mobile: customer.mobile,
      },
      availableAdvances,
      availableUnallocatedPayOuts,
      swipeSummary,
      payInSources,
      payOutSources,
      cards: customer.cards.map((card) => ({
        ...card,
        label:
          card.bankName +
          ' •••• ' +
          card.lastFourDigits +
          (card.nickname ? ' · ' + card.nickname : ''),
      })),
      selectedCardId: cardId ?? null,
      openPayOutItems,
      openPayInItems,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        balance: runningBalance,
        position:
          runningBalance > 0.001
            ? 'TO_PAY_CUSTOMER'
            : runningBalance < -0.001
              ? 'TO_RECOVER_FROM_CUSTOMER'
              : 'SETTLED',
      },
      rows,
    };
  }

  create(dto: CreateCustomerDto, userId: string) {
    const demoEncrypted = dto.demoCardNumber ? this.encryptedSyntheticDemoNumber(dto.demoCardNumber) : null;
    return this.prisma.$transaction(async (tx) => {
      if (dto.mobile) {
        const duplicateCustomer = await tx.customer.findFirst({
          where: {
            isActive: true,
            OR: [{ mobile: dto.mobile }, { mobile: { endsWith: dto.mobile } }],
          },
          select: { id: true },
        });
        if (duplicateCustomer) {
          throw new BadRequestException(
            'A customer with this mobile already exists.',
          );
        }
      }
      const typeConfig = dto.customerTypeId
        ? await tx.customerTypeConfig.findUnique({ where: { id: dto.customerTypeId } })
        : await tx.customerTypeConfig.findUnique({
            where: { legacyType: dto.customerType ?? CustomerType.REGULAR },
          });
      if (!typeConfig?.isActive)
        throw new BadRequestException('Choose an active customer type.');
      const { customerTypeId: _selectedTypeId, demoCardNumber: _demoCardNumber, demoCardBank: _demoCardBank, ...customerValues } = dto;
      const customer = await tx.customer.create({
        data: {
          ...customerValues,
          customerType: typeConfig?.legacyType ?? (dto.customerTypeId ? CustomerType.REGULAR : dto.customerType ?? CustomerType.REGULAR),
          customerTypeId: typeConfig?.id ?? null,
          fullName: dto.fullName.trim().toUpperCase(),
          ebNumber: dto.ebNumber?.trim() || null,
          customerCode: 'CUS-' + Date.now().toString(36).toUpperCase(),
          createdById: userId,
        },
      });
      if (customer.ebNumber) await tx.customerServiceProfile.create({ data: { customerId: customer.id, serviceName: 'Eb Bill', referenceNumber: customer.ebNumber, nickname: 'EB connection' } });
      if (dto.demoCardNumber && demoEncrypted) {
        const card = await tx.customerCard.create({ data: {
          customerId: customer.id, bankName: dto.demoCardBank?.trim() || 'Card', cardType: 'CREDIT',
          lastFourDigits: dto.demoCardNumber.slice(-4),
        } });
        await tx.customerDemoCard.create({ data: { customerCardId: card.id, encryptedValue: demoEncrypted } });
        await tx.auditLog.create({ data: {
          userId, entityType: 'CUSTOMER_CARD', entityId: card.id, action: 'CREATE',
          newValues: { customerId: customer.id, bankName: card.bankName, lastFourDigits: card.lastFourDigits, synthetic: true },
        } });
      }
      await tx.auditLog.create({
        data: {
          userId,
          entityType: 'CUSTOMER',
          entityId: customer.id,
          action: 'CREATE',
          newValues: {
            customerCode: customer.customerCode,
            customerType: customer.customerType,
            customerTypeId: customer.customerTypeId,
            fullName: customer.fullName,
            mobile: customer.mobile,
            ebNumber: customer.ebNumber,
            isActive: customer.isActive,
          },
        },
      });
      return customer;
    });
  }

  createQuickCard(dto: CreateQuickCustomerCardDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const mobile = dto.mobile.trim();
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
      const customer = await tx.customer.create({
        data: {
          customerCode: 'CUS-' + Date.now().toString(36).toUpperCase(),
          customerType: CustomerType.REGULAR,
          fullName: dto.fullName.trim().toUpperCase(),
          mobile,
          createdById: userId,
        },
      });
      const card = await tx.customerCard.create({
        data: {
          customerId: customer.id,
          bankName: dto.bankName?.trim() || 'Card',
          cardType: 'CREDIT',
          lastFourDigits: dto.lastFourDigits,
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
      return { customer, card };
    });
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    const old = await this.prisma.customer.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Customer not found');
    return this.prisma.$transaction(async (tx) => {
      if (dto.mobile) {
        const duplicateCustomer = await tx.customer.findFirst({
          where: {
            id: { not: id },
            isActive: true,
            OR: [{ mobile: dto.mobile }, { mobile: { endsWith: dto.mobile } }],
          },
          select: { id: true },
        });
        if (duplicateCustomer) {
          throw new BadRequestException(
            'Another customer with this mobile already exists.',
          );
        }
      }
      const typeConfig = dto.customerTypeId
        ? await tx.customerTypeConfig.findUnique({ where: { id: dto.customerTypeId } })
        : dto.customerType
          ? await tx.customerTypeConfig.findUnique({ where: { legacyType: dto.customerType } })
          : null;
      if (dto.customerTypeId && (!typeConfig || (!typeConfig.isActive && old.customerTypeId !== typeConfig.id)))
        throw new BadRequestException('Choose an active customer type.');
      if (dto.customerType && !dto.customerTypeId && typeConfig && !typeConfig.isActive && old.customerTypeId !== typeConfig.id)
        throw new BadRequestException('Choose an active customer type.');
      const { customerTypeId: _selectedTypeId, ...customerValues } = dto;
      const updated = await tx.customer.update({
        where: { id },
        data: {
          ...customerValues,
          ...(typeConfig ? { customerTypeId: typeConfig.id, customerType: typeConfig.legacyType ?? CustomerType.REGULAR } : {}),
          ...(dto.fullName ? { fullName: dto.fullName.trim().toUpperCase() } : {}),
          ...(dto.ebNumber !== undefined ? { ebNumber: dto.ebNumber?.trim() || null } : {}),
        },
      });
      if (dto.ebNumber?.trim()) {
        const number = dto.ebNumber.trim();
        await tx.customerServiceProfile.upsert({ where: { customerId_serviceName_referenceNumber: { customerId: id, serviceName: 'Eb Bill', referenceNumber: number } }, create: { customerId: id, serviceName: 'Eb Bill', referenceNumber: number, nickname: 'EB connection' }, update: { isActive: true } });
      }
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER', entityId: id, action: 'UPDATE',
          oldValues: { customerType: old.customerType, customerTypeId: old.customerTypeId, fullName: old.fullName, mobile: old.mobile, ebNumber: old.ebNumber, notes: old.notes },
          newValues: { customerType: updated.customerType, customerTypeId: updated.customerTypeId, fullName: updated.fullName, mobile: updated.mobile, ebNumber: updated.ebNumber, notes: updated.notes },
        },
      });
      return updated;
    });
  }

  async setCustomerActive(id: string, isActive: boolean, userId: string) {
    const old = await this.prisma.customer.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Customer not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER', entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: old.isActive }, newValues: { isActive },
        },
      });
      return updated;
    });
  }

  // Demo-only encrypted card reference storage. Disabled outside explicitly
  // configured environments; do not enable in a client deployment without
  // card-data compliance review and authorization.
  private demoCardKey() {
    const configured = process.env.DEMO_CARD_ENCRYPTION_KEY ?? '';
    if (process.env.DEMO_CARD_COPY_ENABLED !== 'true' || !/^[a-fA-F0-9]{64}$/.test(configured))
      throw new NotFoundException('Synthetic test-card demo is disabled');
    return Buffer.from(configured, 'hex');
  }

  demoCardAvailability() {
    return { enabled: process.env.DEMO_CARD_COPY_ENABLED === 'true' && /^[a-fA-F0-9]{64}$/.test(process.env.DEMO_CARD_ENCRYPTION_KEY ?? '') };
  }

  private encryptedSyntheticDemoNumber(value: string) {
    const key = this.demoCardKey();
    if (!/^\d{16}$/.test(value))
      throw new BadRequestException('Enter exactly 16 digits for the demo card number.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString('hex')).join(':');
  }

  async demoCardStatus(customerId: string) {
    if (process.env.DEMO_CARD_COPY_ENABLED !== 'true' || !/^[a-fA-F0-9]{64}$/.test(process.env.DEMO_CARD_ENCRYPTION_KEY ?? ''))
      return { enabled: false, cardIds: [] as string[] };
    const items = await this.prisma.customerDemoCard.findMany({
      where: { customerCard: { customerId, isActive: true } },
      select: { customerCardId: true },
    });
    return { enabled: true, cardIds: items.map(item => item.customerCardId) };
  }

  async saveDemoTestNumber(cardId: string, value: string, userId: string, details?: { bankName?: string; nickname?: string }) {
    // Shared server-side validation: exactly 16 digits, no checksum gate in demo.
    const payload = this.encryptedSyntheticDemoNumber(value);
    const card = await this.prisma.customerCard.findUnique({ where: { id: cardId }, select: { lastFourDigits: true, bankName: true, nickname: true, isActive: true } });
    if (!card || !card.isActive) throw new NotFoundException('Active card not found');
    if (!details && card.lastFourDigits !== value.slice(-4))
      throw new BadRequestException('The saved card last four digits must match the selected synthetic test number.');
    if (details && !details.bankName?.trim())
      throw new BadRequestException('Card bank name is required.');
    await this.prisma.$transaction(async tx => {
      if (details) {
        const updated = await tx.customerCard.update({
          where: { id: cardId },
          data: { bankName: details.bankName!.trim(), nickname: details.nickname?.trim() || null, lastFourDigits: value.slice(-4) },
        });
        await tx.auditLog.create({ data: {
          userId, entityType: 'CUSTOMER_CARD', entityId: cardId, action: 'UPDATE',
          oldValues: { bankName: card.bankName, lastFourDigits: card.lastFourDigits, nickname: card.nickname },
          newValues: { bankName: updated.bankName, lastFourDigits: updated.lastFourDigits, nickname: updated.nickname },
        }});
      }
      await tx.customerDemoCard.upsert({
        where: { customerCardId: cardId },
        create: { customerCardId: cardId, encryptedValue: payload },
        update: { encryptedValue: payload },
      });
      await tx.auditLog.create({
        data: { userId, entityType: 'CUSTOMER_CARD', entityId: cardId,
          action: 'DEMO_TEST_NUMBER_SAVE', newValues: { synthetic: true, lastFourDigits: value.slice(-4) } },
      });
    });
    return { saved: true };
  }

  async viewDemoTestNumber(cardId: string, userId: string) {
    return this.readStoredDemoCardNumber(cardId, userId, 'DEMO_TEST_NUMBER_VIEW');
  }

  async copyDemoTestNumber(cardId: string, userId: string) {
    return this.readStoredDemoCardNumber(cardId, userId, 'DEMO_TEST_NUMBER_COPY');
  }

  private async readStoredDemoCardNumber(cardId: string, userId: string, action: 'DEMO_TEST_NUMBER_VIEW' | 'DEMO_TEST_NUMBER_COPY') {
    const key = this.demoCardKey();
    const saved = await this.prisma.customerDemoCard.findUnique({
      where: { customerCardId: cardId },
      include: { customerCard: { select: { isActive: true } } },
    });
    if (!saved || !saved.customerCard.isActive) throw new NotFoundException('Saved demo test number not found');
    const parts = saved.encryptedValue.split(':');
    if (parts.length !== 3) throw new BadRequestException('Invalid demo test-number record');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    const value = Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]).toString('utf8');
    await this.prisma.auditLog.create({
      data: { userId, entityType: 'CUSTOMER_CARD', entityId: cardId,
        action, newValues: { synthetic: true, lastFourDigits: value.slice(-4) } },
    });
    return { demoNumber: value };
  }

  addCard(customerId: string, dto: CreateCardDto, userId: string) {
    const demoEncrypted = dto.demoCardNumber ? this.encryptedSyntheticDemoNumber(dto.demoCardNumber) : null;
    return this.prisma.$transaction(async (tx) => {
      if (dto.cardNetworkId) {
        const network = await tx.cardNetwork.findFirst({ where: { id: dto.cardNetworkId, isActive: true }, select: { id: true } });
        if (!network) throw new BadRequestException('Selected card network is not active');
      }
      const { demoCardNumber: _demoCardNumber, ...cardValues } = dto;
      const item = await tx.customerCard.create({ data: {
        customerId, ...cardValues, cardType: 'CREDIT',
        lastFourDigits: dto.demoCardNumber?.slice(-4) ?? dto.lastFourDigits,
      } });
      if (demoEncrypted) await tx.customerDemoCard.create({ data: { customerCardId: item.id, encryptedValue: demoEncrypted } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_CARD', entityId: item.id, action: 'CREATE',
          newValues: { customerId, bankName: item.bankName, cardType: item.cardType, cardNetworkId: item.cardNetworkId, lastFourDigits: item.lastFourDigits, nickname: item.nickname, synthetic: Boolean(demoEncrypted) },
        },
      });
      return item;
    });
  }

  async updateCard(id: string, dto: UpdateCardDto, userId: string) {
    const old = await this.prisma.customerCard.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Card not found');
    if (dto.lastFourDigits !== undefined && dto.lastFourDigits !== old.lastFourDigits && process.env.DEMO_CARD_COPY_ENABLED === 'true') {
      const existingDemo = await this.prisma.customerDemoCard.findUnique({ where: { customerCardId: id }, select: { id: true } });
      if (existingDemo) throw new BadRequestException('This demo card has a saved test number. Enter a replacement 16-digit dummy number in Edit Card to update its last four digits together.');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.cardNetworkId) {
        const network = await tx.cardNetwork.findFirst({ where: { id: dto.cardNetworkId, isActive: true }, select: { id: true } });
        if (!network) throw new BadRequestException('Selected card network is not active');
      }
      const item = await tx.customerCard.update({ where: { id }, data: { ...dto, cardType: 'CREDIT' } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_CARD', entityId: id, action: 'UPDATE',
          oldValues: { bankName: old.bankName, cardType: old.cardType, cardNetworkId: old.cardNetworkId, lastFourDigits: old.lastFourDigits, nickname: old.nickname },
          newValues: { bankName: item.bankName, cardType: item.cardType, cardNetworkId: item.cardNetworkId, lastFourDigits: item.lastFourDigits, nickname: item.nickname },
        },
      });
      return item;
    });
  }

  async setCardActive(id: string, isActive: boolean, userId: string) {
    return this.setItemActive('CUSTOMER_CARD', id, isActive, userId);
  }

  addBankAccount(customerId: string, dto: CreateBankAccountDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.customerBankAccount.create({ data: { customerId, ...dto } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_BANK_ACCOUNT', entityId: item.id, action: 'CREATE',
          newValues: { customerId, accountHolderName: item.accountHolderName, bankName: item.bankName, accountReference: item.accountReference, ifsc: item.ifsc },
        },
      });
      return item;
    });
  }

  async updateBankAccount(id: string, dto: UpdateBankAccountDto, userId: string) {
    const old = await this.prisma.customerBankAccount.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Bank account not found');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.customerBankAccount.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_BANK_ACCOUNT', entityId: id, action: 'UPDATE',
          oldValues: { accountHolderName: old.accountHolderName, bankName: old.bankName, accountReference: old.accountReference, ifsc: old.ifsc },
          newValues: { accountHolderName: item.accountHolderName, bankName: item.bankName, accountReference: item.accountReference, ifsc: item.ifsc },
        },
      });
      return item;
    });
  }

  async setBankActive(id: string, isActive: boolean, userId: string) {
    return this.setItemActive('CUSTOMER_BANK_ACCOUNT', id, isActive, userId);
  }

  addUpiAccount(customerId: string, dto: CreateUpiAccountDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.customerUpiAccount.create({ data: { customerId, ...dto } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_UPI_ACCOUNT', entityId: item.id, action: 'CREATE',
          newValues: { customerId, accountName: item.accountName, upiId: item.upiId, mobileNumber: item.mobileNumber, providerName: item.providerName },
        },
      });
      return item;
    });
  }

  async updateUpiAccount(id: string, dto: UpdateUpiAccountDto, userId: string) {
    const old = await this.prisma.customerUpiAccount.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('UPI account not found');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.customerUpiAccount.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_UPI_ACCOUNT', entityId: id, action: 'UPDATE',
          oldValues: { accountName: old.accountName, upiId: old.upiId, mobileNumber: old.mobileNumber, providerName: old.providerName },
          newValues: { accountName: item.accountName, upiId: item.upiId, mobileNumber: item.mobileNumber, providerName: item.providerName },
        },
      });
      return item;
    });
  }

  async setUpiActive(id: string, isActive: boolean, userId: string) {
    return this.setItemActive('CUSTOMER_UPI_ACCOUNT', id, isActive, userId);
  }

  addBeneficiary(customerId: string, dto: CreateBeneficiaryDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.beneficiary.create({ data: { customerId, ...dto } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'BENEFICIARY', entityId: item.id, action: 'CREATE',
          newValues: { customerId, beneficiaryName: item.beneficiaryName, relationshipNote: item.relationshipNote, notes: item.notes },
        },
      });
      return item;
    });
  }

  async updateBeneficiary(id: string, dto: UpdateBeneficiaryDto, userId: string) {
    const old = await this.prisma.beneficiary.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Beneficiary not found');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.beneficiary.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'BENEFICIARY', entityId: id, action: 'UPDATE',
          oldValues: { beneficiaryName: old.beneficiaryName, relationshipNote: old.relationshipNote, notes: old.notes },
          newValues: { beneficiaryName: item.beneficiaryName, relationshipNote: item.relationshipNote, notes: item.notes },
        },
      });
      return item;
    });
  }

  async setBeneficiaryActive(id: string, isActive: boolean, userId: string) {
    return this.setItemActive('BENEFICIARY', id, isActive, userId);
  }

  addBeneficiaryAccount(beneficiaryId: string, dto: CreateBeneficiaryAccountDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.beneficiaryAccount.create({ data: { beneficiaryId, ...dto } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'BENEFICIARY_ACCOUNT', entityId: item.id, action: 'CREATE',
          newValues: { beneficiaryId, accountType: item.accountType, bankName: item.bankName, accountReference: item.accountReference, ifsc: item.ifsc, upiId: item.upiId, mobileNumber: item.mobileNumber },
        },
      });
      return item;
    });
  }

  async updateBeneficiaryAccount(id: string, dto: UpdateBeneficiaryAccountDto, userId: string) {
    const old = await this.prisma.beneficiaryAccount.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Beneficiary account not found');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.beneficiaryAccount.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'BENEFICIARY_ACCOUNT', entityId: id, action: 'UPDATE',
          oldValues: { accountType: old.accountType, bankName: old.bankName, accountReference: old.accountReference, ifsc: old.ifsc, upiId: old.upiId, mobileNumber: old.mobileNumber },
          newValues: { accountType: item.accountType, bankName: item.bankName, accountReference: item.accountReference, ifsc: item.ifsc, upiId: item.upiId, mobileNumber: item.mobileNumber },
        },
      });
      return item;
    });
  }

  async setBeneficiaryAccountActive(id: string, isActive: boolean, userId: string) {
    return this.setItemActive('BENEFICIARY_ACCOUNT', id, isActive, userId);
  }

  private async setItemActive(entityType: string, id: string, isActive: boolean, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      let old: { isActive: boolean } | null = null;
      let updated: unknown;
      switch (entityType) {
        case 'CUSTOMER_CARD':
          old = await tx.customerCard.findUnique({ where: { id }, select: { isActive: true } });
          if (!old) throw new NotFoundException('Card not found');
          updated = await tx.customerCard.update({ where: { id }, data: { isActive } });
          break;
        case 'CUSTOMER_BANK_ACCOUNT':
          old = await tx.customerBankAccount.findUnique({ where: { id }, select: { isActive: true } });
          if (!old) throw new NotFoundException('Bank account not found');
          updated = await tx.customerBankAccount.update({ where: { id }, data: { isActive } });
          break;
        case 'CUSTOMER_UPI_ACCOUNT':
          old = await tx.customerUpiAccount.findUnique({ where: { id }, select: { isActive: true } });
          if (!old) throw new NotFoundException('UPI account not found');
          updated = await tx.customerUpiAccount.update({ where: { id }, data: { isActive } });
          break;
        case 'BENEFICIARY':
          old = await tx.beneficiary.findUnique({ where: { id }, select: { isActive: true } });
          if (!old) throw new NotFoundException('Beneficiary not found');
          updated = await tx.beneficiary.update({ where: { id }, data: { isActive } });
          break;
        case 'BENEFICIARY_ACCOUNT':
          old = await tx.beneficiaryAccount.findUnique({ where: { id }, select: { isActive: true } });
          if (!old) throw new NotFoundException('Beneficiary account not found');
          updated = await tx.beneficiaryAccount.update({ where: { id }, data: { isActive } });
          break;
        default:
          throw new Error('Unsupported customer item type');
      }
      await tx.auditLog.create({
        data: {
          userId, entityType, entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: old.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }
}
