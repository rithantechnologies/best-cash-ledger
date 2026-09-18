import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountNature, AccountType, LedgerType, ProviderSettlementStatus } from '@prisma/client';
import { FinancialValidationService } from '../finance/financial-validation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: FinancialValidationService,
  ) {}

  list() {
    return this.prisma.financialAccount.findMany({
      include: { provider: true, ledgerAccount: true },
      orderBy: { accountName: 'asc' },
    });
  }

  create(dto: CreateAccountDto, actorId: string) {
    const expectedNature =
      dto.accountType === AccountType.OWNER_CREDIT_CARD
        ? AccountNature.LIABILITY
        : AccountNature.ASSET;
    if (dto.accountNature !== expectedNature) {
      throw new BadRequestException(
        dto.accountType === AccountType.OWNER_CREDIT_CARD
          ? 'Owner credit-card accounts must be liabilities'
          : 'Cash, bank, UPI and provider-wallet accounts must be assets',
      );
    }
    if (
      dto.accountType === AccountType.PROVIDER_WALLET &&
      !dto.providerId
    ) {
      throw new BadRequestException(
        'Provider wallet must be linked to a provider',
      );
    }
    if (
      dto.accountType === AccountType.OWNER_CREDIT_CARD &&
      (!dto.creditLimit || dto.creditLimit <= 0)
    ) {
      throw new BadRequestException(
        'Owner credit card requires a positive credit limit',
      );
    }

    const accountCode = 'ACC-' + Date.now().toString(36).toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      if (dto.providerId) {
        const provider = await tx.provider.findUnique({
          where: { id: dto.providerId },
        });
        if (!provider?.isActive) {
          throw new BadRequestException(
            'Selected provider is inactive or missing',
          );
        }
      }
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
    if (!existing) throw new NotFoundException('Account not found');
    if (
      dto.providerId !== undefined &&
      dto.providerId !== existing.providerId
    ) {
      if (existing.accountType !== AccountType.PROVIDER_WALLET) {
        throw new BadRequestException(
          'Only provider-wallet accounts can be linked to a provider',
        );
      }
      throw new BadRequestException(
        'Provider wallet link cannot be changed after creation; create a new wallet account to preserve ledger history',
      );
    }

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
    const existing = await this.prisma.financialAccount.findUnique({
      where: { id },
      include: { ledgerAccount: true },
    });
    if (!existing) throw new NotFoundException('Account not found');

    if (!isActive && existing.isActive) {
      const balance = await this.validation.balance(this.prisma, existing);
      if (Math.abs(balance) > 0.005) {
        throw new BadRequestException(
          'Account cannot be deactivated while its balance/outstanding is non-zero',
        );
      }
      const [openCashSessions, openSettlements] = await Promise.all([
        this.prisma.cashSession.count({
          where: { cashAccountId: id, status: 'OPEN' },
        }),
        this.prisma.providerSettlement.count({
          where: {
            destinationAccountId: id,
            remainingAmount: { gt: 0 },
            status: {
              in: [
                ProviderSettlementStatus.PENDING,
                ProviderSettlementStatus.PARTIALLY_SETTLED,
              ],
            },
          },
        }),
      ]);
      if (openCashSessions > 0) {
        throw new BadRequestException(
          'Close the active cash-counter session before deactivating this account',
        );
      }
      if (openSettlements > 0) {
        throw new BadRequestException(
          'Receive or reassign pending provider settlements before deactivating this account',
        );
      }
    }

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
