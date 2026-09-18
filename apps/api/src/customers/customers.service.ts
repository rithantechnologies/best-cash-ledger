import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
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

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        cards: true,
        bankAccounts: true,
        upiAccounts: true,
        beneficiaries: { include: { accounts: true } },
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
      const customer = await tx.customer.create({
        data: {
          ...dto,
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

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    const old = await this.prisma.customer.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Customer not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: dto });
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
      const item = await tx.customerCard.create({ data: { customerId, ...dto } });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_CARD', entityId: item.id, action: 'CREATE',
          newValues: { customerId, bankName: item.bankName, cardType: item.cardType, lastFourDigits: item.lastFourDigits, nickname: item.nickname },
        },
      });
      return item;
    });
  }

  async updateCard(id: string, dto: UpdateCardDto, userId: string) {
    const old = await this.prisma.customerCard.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Card not found');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.customerCard.update({ where: { id }, data: dto });
      await tx.auditLog.create({
        data: {
          userId, entityType: 'CUSTOMER_CARD', entityId: id, action: 'UPDATE',
          oldValues: { bankName: old.bankName, cardType: old.cardType, lastFourDigits: old.lastFourDigits, nickname: old.nickname },
          newValues: { bankName: item.bankName, cardType: item.cardType, lastFourDigits: item.lastFourDigits, nickname: item.nickname },
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
