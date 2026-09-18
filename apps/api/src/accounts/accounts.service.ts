import { Injectable } from '@nestjs/common';
import { LedgerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.financialAccount.findMany({
      include: { provider: true, ledgerAccount: true },
      orderBy: { accountName: 'asc' },
    });
  }

  create(dto: CreateAccountDto, actorId: string) {
    const accountCode = 'ACC-' + Date.now().toString(36).toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.financialAccount.create({
        data: {
          ...dto,
          accountCode,
          openingBalance: dto.openingBalance ?? 0,
        },
      });
      await tx.ledgerAccount.create({
        data: {
          ledgerCode: 'LED-' + accountCode,
          ledgerName: account.accountName,
          ledgerType: account.accountNature === 'ASSET'
            ? LedgerType.ASSET
            : LedgerType.LIABILITY,
          ledgerCategory: account.accountType,
          financialAccountId: account.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'FINANCIAL_ACCOUNT',
          entityId: account.id,
          action: 'CREATE',
          newValues: {
            accountName: account.accountName,
            accountCode: account.accountCode,
            accountType: account.accountType,
            accountNature: account.accountNature,
            usageType: account.usageType,
            openingBalance: account.openingBalance.toString(),
          },
        },
      });

      return account;
    });
  }

  async update(id: string, dto: UpdateAccountDto, actorId: string) {
    const existing = await this.prisma.financialAccount.findUnique({
      where: { id },
      include: { ledgerAccount: true },
    });
    if (!existing) throw new Error('Account not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.financialAccount.update({
        where: { id },
        data: dto,
      });

      if (dto.accountName && existing.ledgerAccount) {
        await tx.ledgerAccount.update({
          where: { id: existing.ledgerAccount.id },
          data: { ledgerName: dto.accountName },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'FINANCIAL_ACCOUNT',
          entityId: id,
          action: 'UPDATE',
          oldValues: {
            accountName: existing.accountName,
            providerId: existing.providerId,
            bankName: existing.bankName,
            accountReference: existing.accountReference,
            lastFourDigits: existing.lastFourDigits,
            creditLimit: existing.creditLimit?.toString() ?? null,
            usageType: existing.usageType,
          },
          newValues: {
            accountName: updated.accountName,
            providerId: updated.providerId,
            bankName: updated.bankName,
            accountReference: updated.accountReference,
            lastFourDigits: updated.lastFourDigits,
            creditLimit: updated.creditLimit?.toString() ?? null,
            usageType: updated.usageType,
          },
        },
      });

      return updated;
    });
  }

  async setActive(id: string, isActive: boolean, actorId: string) {
    const existing = await this.prisma.financialAccount.findUnique({ where: { id } });
    if (!existing) throw new Error('Account not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.financialAccount.update({
        where: { id },
        data: { isActive },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          entityType: 'FINANCIAL_ACCOUNT',
          entityId: id,
          action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive },
        },
      });
      return updated;
    });
  }
}
