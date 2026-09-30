import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
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
import { CreateServiceProfileDto } from './dto/create-service-profile.dto.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(options?: {
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    includeInactive?: boolean;
  }) {
    const where: Prisma.CustomerWhereInput = {
      ...(options?.includeInactive ? {} : { isActive: true }),
      ...(options?.search ? {
        OR: [
          { fullName: { contains: options.search, mode: 'insensitive' } },
          { mobile: { contains: options.search } },
          { customerCode: { contains: options.search, mode: 'insensitive' } },
          {
            cards: {
              some: {
                lastFourDigits: { contains: options.search },
              },
            },
          },
        ],
      } : {}),
    };
    const allowedSort = new Set(['createdAt','fullName','customerCode','customerType','mobile']);
    const sortBy = allowedSort.has(options?.sortBy ?? '') ? options!.sortBy! : 'createdAt';
    const sortDir = options?.sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy]: sortDir } as Prisma.CustomerOrderByWithRelationInput;
    const include = {
      cards: true,
      bankAccounts: true,
      upiAccounts: true,
      beneficiaries: { include: { accounts: true } },
    };

    if (!options?.page) {
      return this.prisma.customer.findMany({ where, include, orderBy });
    }

    const page = Math.max(1, options.page);
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 5), 100);
    const [items,total] = await Promise.all([
      this.prisma.customer.findMany({
        where, include, orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
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

  async getQuickEntryProfile(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true, customerCode: true, fullName: true, mobile: true,
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
          select: { id: true, serviceName: true, nickname: true, providerName: true, referenceNumber: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const recent = await this.prisma.transaction.findMany({
      where: { customerId: id },
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

    return {
      customer: { id: customer.id, customerCode: customer.customerCode, fullName: customer.fullName, mobile: customer.mobile },
      savedDestinations: saved.map(({ signature, ...item }) => ({ ...item, isLastUsed: signature === latestSignature })),
      recentDestinations: recentDestinations.map(({ signature, ...item }) => ({ ...item, isLastUsed: signature === latestSignature })),
      serviceProfiles,
      recentServiceReferences,
    };
  }

  addServiceProfile(customerId: string, dto: CreateServiceProfileDto, userId: string) {
    const serviceName = dto.serviceName.trim();
    const referenceNumber = dto.referenceNumber.trim();
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw new NotFoundException('Customer not found');
      const item = await tx.customerServiceProfile.upsert({
        where: { customerId_serviceName_referenceNumber: { customerId, serviceName, referenceNumber } },
        create: {
          customerId, serviceName, referenceNumber,
          nickname: dto.nickname?.trim() || null,
          providerName: dto.providerName?.trim() || null,
        },
        update: {
          nickname: dto.nickname?.trim() || null,
          providerName: dto.providerName?.trim() || null,
          isActive: true,
        },
      });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_SERVICE_PROFILE', entityId: item.id, action: 'UPSERT',
          newValues: { customerId, serviceName, referenceNumber, nickname: item.nickname, providerName: item.providerName },
        },
      });
      return item;
    });
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        cards: true,
        bankAccounts: true,
        upiAccounts: true,
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

  create(dto: CreateCustomerDto, userId: string) {
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
      const customer = await tx.customer.create({
        data: {
          ...dto,
          fullName: dto.fullName.trim().toUpperCase(),
          customerCode: 'CUS-' + Date.now().toString(36).toUpperCase(),
          createdById: userId,
        },
      });
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
      const updated = await tx.customer.update({
        where: { id },
        data: { ...dto, ...(dto.fullName ? { fullName: dto.fullName.trim().toUpperCase() } : {}) },
      });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER', entityId: id, action: 'UPDATE',
          oldValues: { customerType: old.customerType, fullName: old.fullName, mobile: old.mobile, notes: old.notes },
          newValues: { customerType: updated.customerType, fullName: updated.fullName, mobile: updated.mobile, notes: updated.notes },
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

  addCard(customerId: string, dto: CreateCardDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.cardNetworkId) {
        const network = await tx.cardNetwork.findFirst({ where: { id: dto.cardNetworkId, isActive: true }, select: { id: true } });
        if (!network) throw new BadRequestException('Selected card network is not active');
      }
      const item = await tx.customerCard.create({ data: { customerId, ...dto, cardType: 'CREDIT' } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_CARD', entityId: item.id, action: 'CREATE',
          newValues: { customerId, bankName: item.bankName, cardType: item.cardType, cardNetworkId: item.cardNetworkId, lastFourDigits: item.lastFourDigits, nickname: item.nickname },
        },
      });
      return item;
    });
  }

  async updateCard(id: string, dto: UpdateCardDto, userId: string) {
    const old = await this.prisma.customerCard.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Card not found');
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
